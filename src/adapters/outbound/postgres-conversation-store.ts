import { Client } from "pg";
import { z } from "zod";

import type { ConversationStorePort, StateMutationMetadata } from "../../application/ports/conversation-store-port.js";
import {
  ConversationSnapshotSchema, PersistableRunResultSchema, RunConversationTurnInputSchema,
  StateAuditEventSchema, StateBoundaryError, StateIdSchema, StateTimestampSchema, StateVersionSchema,
  MemoryKeySchema, RetentionSecondsSchema, type ConversationSnapshot, type StateAuditEvent,
} from "../../domain/state-contracts.js";
import { Sha256ContentIdentity } from "./sha256-content-identity.js";

type Input<K extends keyof ConversationStorePort> = Parameters<ConversationStorePort[K]>[0];
const mutation = { operationId: StateIdSchema, now: StateTimestampSchema };
const selected = { ...mutation, conversationId: StateIdSchema };
const rowSchema = z.object({
  version: z.coerce.number().int().nonnegative(), snapshot: ConversationSnapshotSchema,
  expires_at: z.date(), active_request_id: StateIdSchema.nullable(), lease_token: StateIdSchema.nullable(),
});
const DDL = `
CREATE SCHEMA IF NOT EXISTS uaos_state;
CREATE TABLE IF NOT EXISTS uaos_state.conversations (
 conversation_id text PRIMARY KEY, version bigint NOT NULL, expires_at timestamptz NOT NULL,
 snapshot jsonb NOT NULL, active_request_id text, lease_token text,
 CHECK ((active_request_id IS NULL) = (lease_token IS NULL))
);
CREATE INDEX IF NOT EXISTS conversations_expiry ON uaos_state.conversations(expires_at);
CREATE TABLE IF NOT EXISTS uaos_state.audit (
 conversation_id text NOT NULL, sequence bigint NOT NULL, metadata jsonb NOT NULL,
 expires_at timestamptz NOT NULL, PRIMARY KEY(conversation_id,sequence)
);
CREATE INDEX IF NOT EXISTS audit_expiry ON uaos_state.audit(expires_at);`;

export class PostgresConversationStore implements ConversationStorePort {
  readonly #connectionString: string;
  readonly #identity = new Sha256ContentIdentity();

  constructor(options: { connectionString: string }) {
    this.#connectionString = z.string().min(1).parse(options.connectionString);
  }

  async #withClient<T>(signal: AbortSignal, work: (client: Client) => Promise<T>, transaction = true): Promise<T> {
    signal.throwIfAborted();
    const client = new Client({ connectionString: this.#connectionString, application_name: "uaos-state",
      connectionTimeoutMillis: 1000, statement_timeout: 1000, query_timeout: 1500,
      lock_timeout: 500, idle_in_transaction_session_timeout: 1500 });
    client.on("error", () => {});
    const disconnect = () => client.connection.stream.destroy();
    const timer = setTimeout(disconnect, 3000);
    signal.addEventListener("abort", disconnect, { once: true });
    try {
      signal.throwIfAborted(); await client.connect(); signal.throwIfAborted();
      if (transaction) await client.query("BEGIN");
      const result = await work(client); signal.throwIfAborted();
      if (transaction) await client.query("COMMIT");
      return result;
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (error instanceof StateBoundaryError) throw error;
      throw new StateBoundaryError("STATE_REPOSITORY_FAILURE");
    } finally {
      try { await client.end().catch(() => {}); }
      finally { clearTimeout(timer); signal.removeEventListener("abort", disconnect); }
    }
  }

  async initialize(signal: AbortSignal): Promise<void> {
    await this.#withClient(signal, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(16843108)");
      await client.query(DDL);
    });
  }

  async #row(client: Client, id: string, now: string, lock = true) {
    const result = await client.query(`SELECT version,snapshot,expires_at,active_request_id,lease_token
      FROM uaos_state.conversations WHERE conversation_id=$1${lock ? " FOR UPDATE" : ""}`, [id]);
    if (result.rows.length === 0) throw new StateBoundaryError("CONVERSATION_NOT_FOUND");
    const row = rowSchema.parse(result.rows[0]);
    const snapshot = row.snapshot;
    const running = snapshot.turns.find(({ status }) => status === "running");
    if (snapshot.conversationId !== id || snapshot.version !== row.version || Date.parse(snapshot.expiresAt) !== row.expires_at.getTime() ||
      (running ? running.requestId !== row.active_request_id || row.lease_token === null : row.active_request_id !== null || row.lease_token !== null)) {
      throw new StateBoundaryError("STATE_INVALID");
    }
    if (Date.parse(now) >= Date.parse(snapshot.expiresAt)) throw new StateBoundaryError("CONVERSATION_EXPIRED");
    return row;
  }

  #mutable(snapshot: ConversationSnapshot, version: number) {
    if (snapshot.turns.some(({ status }) => status === "running")) throw new StateBoundaryError("CONVERSATION_BUSY");
    if (snapshot.version !== version) throw new StateBoundaryError("VERSION_CONFLICT");
  }

  async #audit(client: Client, snapshot: Pick<ConversationSnapshot, "conversationId" | "version">,
    meta: StateMutationMetadata, eventType: StateAuditEvent["eventType"], payload: unknown) {
    const event = StateAuditEventSchema.parse({ schemaVersion: "state-1.0", operationId: meta.operationId,
      conversationId: snapshot.conversationId, sequence: snapshot.version, occurredAt: meta.now, eventType, payload });
    const expires = new Date(Date.parse(meta.now) + 30 * 86400_000).toISOString();
    await client.query("INSERT INTO uaos_state.audit VALUES($1,$2,$3::jsonb,$4)",
      [snapshot.conversationId, snapshot.version, JSON.stringify(event), expires]);
  }

  async #save(client: Client, raw: ConversationSnapshot, meta: StateMutationMetadata,
    eventType: StateAuditEvent["eventType"], payload: unknown, active: string | null = null, token: string | null = null) {
    const snapshot = ConversationSnapshotSchema.parse(raw);
    const result = await client.query(`UPDATE uaos_state.conversations SET version=$2,snapshot=$3::jsonb,
      active_request_id=$4,lease_token=$5 WHERE conversation_id=$1`,
      [snapshot.conversationId, snapshot.version, JSON.stringify(snapshot), active, token]);
    if (result.rowCount !== 1) throw new StateBoundaryError("STATE_INVALID");
    await this.#audit(client, snapshot, meta, eventType, payload);
    return snapshot;
  }

  async create(raw: Input<"create">, signal: AbortSignal): Promise<unknown> {
    const input = z.strictObject({ ...selected, expiresAt: StateTimestampSchema, retentionSeconds: RetentionSecondsSchema }).parse(raw);
    if (Date.parse(input.expiresAt) - Date.parse(input.now) !== input.retentionSeconds * 1000) throw new StateBoundaryError("RETENTION_INVALID");
    return this.#withClient(signal, async (client) => {
      const snapshot = ConversationSnapshotSchema.parse({ conversationId: input.conversationId, version: 0,
        createdAt: input.now, expiresAt: input.expiresAt, turns: [], memories: [] });
      await client.query("INSERT INTO uaos_state.conversations VALUES($1,0,$2,$3::jsonb,NULL,NULL)",
        [input.conversationId, input.expiresAt, JSON.stringify(snapshot)]);
      await this.#audit(client, snapshot, input, "conversation.created", { retentionSeconds: input.retentionSeconds });
      return snapshot;
    });
  }

  async load(id: string, now: string, signal: AbortSignal): Promise<unknown> {
    StateIdSchema.parse(id); StateTimestampSchema.parse(now);
    return this.#withClient(signal, async (client) => (await this.#row(client, id, now, false)).snapshot, false);
  }

  async reserve(raw: Input<"reserve">, signal: AbortSignal): Promise<unknown> {
    const input = RunConversationTurnInputSchema.extend({ ...mutation, inputHash: z.string().regex(/^[a-f0-9]{64}$/u),
      runId: StateIdSchema, leaseToken: StateIdSchema, leaseExpiresAt: StateTimestampSchema }).parse(raw);
    if (input.inputHash !== this.#identity.digest(input.question)) throw new StateBoundaryError("STATE_INVALID");
    return this.#withClient(signal, async (client) => {
      const row = await this.#row(client, input.conversationId, input.now);
      const snapshot = row.snapshot;
      const previous = snapshot.turns.find(({ requestId }) => requestId === input.requestId);
      if (previous) {
        if (previous.inputHash !== input.inputHash || previous.question !== input.question) throw new StateBoundaryError("REQUEST_KEY_REUSED");
        if (previous.status === "settled") return { kind: "cached", snapshot, result: previous.result };
        throw new StateBoundaryError(previous.status === "interrupted" ? "TURN_INTERRUPTED" : "CONVERSATION_BUSY");
      }
      this.#mutable(snapshot, input.expectedVersion);
      if (snapshot.turns.length >= 100) throw new StateBoundaryError("STATE_CAPACITY_EXCEEDED");
      if (Date.parse(input.leaseExpiresAt) !== Math.min(Date.parse(input.now) + 30_000, Date.parse(snapshot.expiresAt))) throw new StateBoundaryError("STATE_INVALID");
      snapshot.version += 1;
      snapshot.turns.push({ requestId: input.requestId, runId: input.runId, question: input.question, inputHash: input.inputHash,
        startedAt: input.now, status: "running", leaseExpiresAt: input.leaseExpiresAt });
      return { kind: "acquired", leaseToken: input.leaseToken, snapshot: await this.#save(client, snapshot, input,
        "turn.started", { requestId: input.requestId, runId: input.runId }, input.requestId, input.leaseToken) };
    });
  }

  async settle(raw: Input<"settle">, signal: AbortSignal): Promise<unknown> {
    const input = z.strictObject({ ...selected, requestId: StateIdSchema, leaseToken: StateIdSchema, result: PersistableRunResultSchema }).parse(raw);
    return this.#withClient(signal, async (client) => {
      const row = await this.#row(client, input.conversationId, input.now), snapshot = row.snapshot;
      const index = snapshot.turns.findIndex(({ requestId }) => requestId === input.requestId), turn = snapshot.turns[index];
      if (turn?.status !== "running" || row.active_request_id !== input.requestId || row.lease_token !== input.leaseToken ||
        turn.runId !== input.result.runId || Date.parse(input.now) >= Date.parse(turn.leaseExpiresAt)) throw new StateBoundaryError("TURN_FENCED");
      const { leaseExpiresAt: _lease, ...identity } = turn;
      snapshot.turns[index] = { ...identity, status: "settled", settledAt: input.now, result: input.result };
      snapshot.version += 1;
      return this.#save(client, snapshot, input, "turn.settled", { requestId: input.requestId, runId: input.result.runId,
        ok: input.result.ok, ...(!input.result.ok ? { errorCode: input.result.error.code } : {}) });
    });
  }

  async recover(raw: Input<"recover">, signal: AbortSignal): Promise<unknown> {
    const input = z.strictObject({ ...selected, requestId: StateIdSchema, expectedVersion: StateVersionSchema }).parse(raw);
    return this.#withClient(signal, async (client) => {
      const { snapshot } = await this.#row(client, input.conversationId, input.now);
      if (snapshot.version !== input.expectedVersion) throw new StateBoundaryError("VERSION_CONFLICT");
      const index = snapshot.turns.findIndex(({ requestId }) => requestId === input.requestId), turn = snapshot.turns[index];
      if (turn?.status !== "running" || Date.parse(turn.leaseExpiresAt) > Date.parse(input.now)) throw new StateBoundaryError("CONVERSATION_BUSY");
      const { leaseExpiresAt: _lease, ...identity } = turn;
      snapshot.turns[index] = { ...identity, status: "interrupted", interruptedAt: input.now }; snapshot.version += 1;
      return this.#save(client, snapshot, input, "turn.interrupted", { requestId: input.requestId, runId: turn.runId, code: "TURN_INTERRUPTED" });
    });
  }

  async writeMemory(raw: Input<"writeMemory">, signal: AbortSignal): Promise<unknown> {
    const input = z.strictObject({ ...selected, expectedVersion: StateVersionSchema, key: MemoryKeySchema,
      value: z.string().trim().min(1).max(2048), expiresAt: StateTimestampSchema }).parse(raw);
    return this.#withClient(signal, async (client) => {
      const { snapshot } = await this.#row(client, input.conversationId, input.now);
      this.#mutable(snapshot, input.expectedVersion);
      if (Date.parse(input.expiresAt) <= Date.parse(input.now) || Date.parse(input.expiresAt) > Date.parse(snapshot.expiresAt)) throw new StateBoundaryError("RETENTION_INVALID");
      snapshot.memories = snapshot.memories.filter(({ expiresAt }) => Date.parse(expiresAt) > Date.parse(input.now));
      const previous = snapshot.memories.find(({ key }) => key === input.key);
      if (!previous && snapshot.memories.length >= 20) throw new StateBoundaryError("STATE_CAPACITY_EXCEEDED");
      snapshot.version += 1;
      snapshot.memories = [...snapshot.memories.filter(({ key }) => key !== input.key), {
        conversationId: input.conversationId, key: input.key, value: input.value, version: snapshot.version,
        createdAt: previous?.createdAt ?? input.now, updatedAt: input.now, expiresAt: input.expiresAt,
      }];
      return this.#save(client, snapshot, input, "memory.written", { key: input.key, expiresAt: input.expiresAt });
    });
  }

  async deleteMemory(raw: Input<"deleteMemory">, signal: AbortSignal): Promise<unknown> {
    const input = z.strictObject({ ...selected, expectedVersion: StateVersionSchema, key: MemoryKeySchema }).parse(raw);
    return this.#withClient(signal, async (client) => {
      const { snapshot } = await this.#row(client, input.conversationId, input.now); this.#mutable(snapshot, input.expectedVersion);
      if (!snapshot.memories.some(({ key, expiresAt }) => key === input.key && Date.parse(expiresAt) > Date.parse(input.now))) throw new StateBoundaryError("MEMORY_NOT_FOUND");
      snapshot.memories = snapshot.memories.filter(({ key }) => key !== input.key); snapshot.version += 1;
      return this.#save(client, snapshot, input, "memory.deleted", { key: input.key });
    });
  }

  async purge(raw: Input<"purge">, signal: AbortSignal) {
    const input = z.strictObject(mutation).parse(raw);
    return this.#withClient(signal, async (client) => {
      let memories = 0;
      const expired = await client.query(`SELECT conversation_id,snapshot FROM uaos_state.conversations
        WHERE expires_at <= $1 ORDER BY expires_at,conversation_id LIMIT 100 FOR UPDATE`, [input.now]);
      for (const row of expired.rows) {
        const snapshot = ConversationSnapshotSchema.parse(row.snapshot);
        memories += snapshot.memories.length;
        await this.#audit(client, { conversationId: snapshot.conversationId, version: snapshot.version + 1 }, input,
          "conversation.purged", { code: "RETENTION_EXPIRED" });
        await client.query("DELETE FROM uaos_state.conversations WHERE conversation_id=$1", [snapshot.conversationId]);
      }
      const withMemory = await client.query(`SELECT conversation_id FROM uaos_state.conversations c
        WHERE expires_at > $1 AND active_request_id IS NULL
        AND EXISTS(SELECT 1 FROM jsonb_array_elements(c.snapshot->'memories') m WHERE (m->>'expiresAt')::timestamptz <= $1)
        ORDER BY conversation_id LIMIT 100 FOR UPDATE`, [input.now]);
      for (const row of withMemory.rows) {
        const { snapshot } = await this.#row(client, row.conversation_id, input.now);
        const old = snapshot.memories.filter(({ expiresAt }) => Date.parse(expiresAt) <= Date.parse(input.now));
        for (const memory of old) {
          snapshot.memories = snapshot.memories.filter(({ key }) => key !== memory.key); snapshot.version += 1;
          await this.#save(client, snapshot, input, "memory.deleted", { key: memory.key }); memories += 1;
        }
      }
      const auditRemoval = await client.query(`DELETE FROM uaos_state.audit WHERE (conversation_id,sequence) IN
        (SELECT conversation_id,sequence FROM uaos_state.audit WHERE expires_at <= $1 ORDER BY expires_at LIMIT 1000)`, [input.now]);
      return { conversations: expired.rowCount ?? 0, memories, audits: auditRemoval.rowCount ?? 0 };
    });
  }

  async audit(id: string, now: string, signal: AbortSignal): Promise<readonly StateAuditEvent[]> {
    StateIdSchema.parse(id); StateTimestampSchema.parse(now);
    return this.#withClient(signal, async (client) => {
      const result = await client.query(`SELECT metadata FROM
        (SELECT sequence,metadata FROM uaos_state.audit WHERE conversation_id=$1 AND expires_at > $2 ORDER BY sequence DESC LIMIT 1000) recent
        ORDER BY sequence`, [id, now]);
      return result.rows.map(({ metadata }) => StateAuditEventSchema.parse(metadata));
    }, false);
  }
}
