import { Client } from "pg";
import { z } from "zod";
import type { ApprovalStorePort, GuardAuditPort } from "../../application/ports/guard-ports.js";
import { validateApprovalSnapshot } from "../../application/validate-approval.js";
import { assertApprovalTransition, assertApprovalTransitionAudit } from "../../domain/approval-transitions.js";
import { ApprovalIdSchema, GuardAuditEventSchema, GuardBoundaryError,
  type ApprovalSnapshot, type GuardAuditDraft, type GuardAuditEvent, type GuardBoundaryCode } from "../../domain/guard-contracts.js";
import { StateIdSchema, StateTimestampSchema, StateVersionSchema } from "../../domain/state-contracts.js";
import { Sha256ContentIdentity } from "./sha256-content-identity.js";

const DDL = `CREATE SCHEMA IF NOT EXISTS uaos_guard;
CREATE TABLE IF NOT EXISTS uaos_guard.approvals (
 approval_id text PRIMARY KEY, request_id text UNIQUE NOT NULL, input_digest text NOT NULL,
 state text NOT NULL, version bigint NOT NULL, expires_at timestamptz NOT NULL,
 lease_expires_at timestamptz, snapshot jsonb NOT NULL CHECK(octet_length(snapshot::text) <= 262144)
);
CREATE INDEX IF NOT EXISTS approvals_expiry ON uaos_guard.approvals(expires_at);
CREATE TABLE IF NOT EXISTS uaos_guard.audit (
 scope_id text NOT NULL, sequence bigint NOT NULL CHECK(sequence BETWEEN 1 AND 1024),
 event_id text UNIQUE NOT NULL, metadata jsonb NOT NULL CHECK(octet_length(metadata::text) <= 8192),
 PRIMARY KEY(scope_id,sequence)
);`;
type Input<K extends keyof ApprovalStorePort> = Parameters<ApprovalStorePort[K]>[0];
const scopeSchema = StateIdSchema.refine((value) => /^(?:run|approval|operation)-[A-Za-z0-9_-]+$/u.test(value));
const rowSchema = z.object({ approval_id: ApprovalIdSchema, request_id: StateIdSchema, input_digest: z.string(), state: z.string(),
  version: z.coerce.number().int().nonnegative(), expires_at: z.date(), lease_expires_at: z.date().nullable(), snapshot: z.unknown() });

export class PostgresApprovalStore implements ApprovalStorePort, GuardAuditPort {
  readonly #connectionString: string;
  readonly #identity = new Sha256ContentIdentity();
  constructor(options: { connectionString: string }) {
    if (!options.connectionString.trim()) throw new GuardBoundaryError("GUARD_STORE_FAILURE");
    this.#connectionString = options.connectionString;
  }

  async #withClient<T>(signal: AbortSignal, work: (client: Client) => Promise<T>, failure: GuardBoundaryCode = "GUARD_STORE_FAILURE", transaction = true): Promise<T> {
    signal.throwIfAborted();
    const client = new Client({ connectionString: this.#connectionString, application_name: "uaos-guard",
      connectionTimeoutMillis: 1000, statement_timeout: 1000, query_timeout: 1500,
      lock_timeout: 500, idle_in_transaction_session_timeout: 1500 });
    client.on("error", () => {});
    const disconnect = () => client.connection.stream.destroy();
    const timer = setTimeout(disconnect, 3000);
    signal.addEventListener("abort", disconnect, { once: true });
    try {
      signal.throwIfAborted(); await client.connect(); signal.throwIfAborted();
      if (transaction) await client.query("BEGIN");
      const value = await work(client); signal.throwIfAborted();
      if (transaction) await client.query("COMMIT");
      return value;
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (error instanceof GuardBoundaryError) throw error;
      throw new GuardBoundaryError(failure);
    } finally {
      try { await client.end().catch(() => {}); }
      finally { clearTimeout(timer); signal.removeEventListener("abort", disconnect); }
    }
  }

  async initialize(signal: AbortSignal): Promise<void> {
    await this.#withClient(signal, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(16843113)"); await client.query(DDL);
    });
  }

  #snapshot(raw: unknown): ApprovalSnapshot {
    const row = rowSchema.parse(raw), snapshot = validateApprovalSnapshot(row.snapshot, this.#identity);
    if (row.approval_id !== snapshot.approvalId || row.request_id !== snapshot.requestId || row.input_digest !== snapshot.inputDigest ||
      row.state !== snapshot.state || row.version !== snapshot.version || row.expires_at.getTime() !== Date.parse(snapshot.expiresAt) ||
      ("lease" in snapshot ? row.lease_expires_at?.getTime() !== Date.parse(snapshot.lease.expiresAt) : row.lease_expires_at !== null)) throw new GuardBoundaryError("GUARD_RESULT_INVALID");
    return snapshot;
  }

  async #audit(client: Client, raw: GuardAuditDraft): Promise<void> {
    const event = GuardAuditEventSchema.parse({ ...raw, sequence: 1 });
    // Per-scope serialization also protects independent policy-only audit writes.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 16843114))", [event.scopeId]);
    const previous = await client.query("SELECT COALESCE(MAX(sequence),0) AS sequence FROM uaos_guard.audit WHERE scope_id=$1", [event.scopeId]);
    const next = GuardAuditEventSchema.parse({ ...event, sequence: Number(previous.rows[0]?.sequence) + 1 });
    try {
      await client.query("INSERT INTO uaos_guard.audit(scope_id,sequence,event_id,metadata) VALUES($1,$2,$3,$4::jsonb)",
        [next.scopeId, next.sequence, next.eventId, JSON.stringify(next)]);
    } catch { throw new GuardBoundaryError("GUARD_AUDIT_FAILURE"); }
  }

  async append(draft: GuardAuditDraft, signal: AbortSignal): Promise<void> {
    await this.#withClient(signal, (client) => this.#audit(client, draft), "GUARD_AUDIT_FAILURE");
  }

  async read(scopeId: string, signal: AbortSignal): Promise<readonly GuardAuditEvent[]> {
    return this.#withClient(signal, async (client) => {
      scopeSchema.parse(scopeId);
      const rows = await client.query("SELECT sequence,event_id,metadata FROM uaos_guard.audit WHERE scope_id=$1 ORDER BY sequence LIMIT 1025", [scopeId]);
      if (rows.rows.length > 1024) throw new GuardBoundaryError("GUARD_RESULT_INVALID");
      return rows.rows.map((row, index) => {
        const event = GuardAuditEventSchema.parse(row.metadata);
        if (event.scopeId !== scopeId || event.eventId !== row.event_id || event.sequence !== Number(row.sequence) || event.sequence !== index + 1) throw new GuardBoundaryError("GUARD_RESULT_INVALID");
        return event;
      });
    }, "GUARD_AUDIT_FAILURE", false);
  }

  async reserve(input: Input<"reserve">, signal: AbortSignal) {
    return this.#withClient(signal, async (client) => {
      const snapshot = validateApprovalSnapshot(input.snapshot, this.#identity);
      if (snapshot.state !== "preparing") throw new GuardBoundaryError("GUARD_RESULT_INVALID");
      const maxPending = z.number().int().min(1).max(16).parse(input.maxPending);
      assertApprovalTransitionAudit(null, snapshot, input.event);
      await client.query("SELECT pg_advisory_xact_lock(16843115)");
      const existing = await client.query("SELECT * FROM uaos_guard.approvals WHERE request_id=$1 FOR UPDATE", [snapshot.requestId]);
      if (existing.rows.length) {
        const previous = this.#snapshot(existing.rows[0]);
        if (previous.inputDigest !== snapshot.inputDigest) throw new GuardBoundaryError("GUARD_REQUEST_REUSED");
        return { created: false, snapshot: previous };
      }
      const count = await client.query("SELECT count(*) AS count FROM uaos_guard.approvals WHERE state IN ('preparing','pending','approved','executing','uncertain')");
      if (Number(count.rows[0]?.count) >= maxPending) throw new GuardBoundaryError("GUARD_CAPACITY_EXCEEDED");
      await client.query("INSERT INTO uaos_guard.approvals VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)",
        [snapshot.approvalId, snapshot.requestId, snapshot.inputDigest, snapshot.state, snapshot.version, snapshot.expiresAt, snapshot.lease.expiresAt, JSON.stringify(snapshot)]);
      await this.#audit(client, input.event);
      return { created: true, snapshot };
    });
  }

  async load(approvalId: string, signal: AbortSignal): Promise<unknown | null> {
    return this.#withClient(signal, async (client) => {
      ApprovalIdSchema.parse(approvalId);
      const rows = await client.query("SELECT * FROM uaos_guard.approvals WHERE approval_id=$1", [approvalId]);
      return rows.rows.length ? this.#snapshot(rows.rows[0]) : null;
    }, "GUARD_STORE_FAILURE", false);
  }

  async transition(input: Input<"transition">, signal: AbortSignal): Promise<unknown> {
    return this.#withClient(signal, async (client) => {
      const next = validateApprovalSnapshot(input.snapshot, this.#identity);
      StateVersionSchema.parse(input.expectedVersion);
      if (input.expectedLeaseToken !== undefined) StateIdSchema.parse(input.expectedLeaseToken);
      if (input.recoverExpiredLease !== undefined) z.boolean().parse(input.recoverExpiredLease);
      const rows = await client.query("SELECT * FROM uaos_guard.approvals WHERE approval_id=$1 FOR UPDATE", [next.approvalId]);
      if (!rows.rows.length) throw new GuardBoundaryError("GUARD_ACTION_NOT_FOUND");
      const current = this.#snapshot(rows.rows[0]);
      if (current.version !== input.expectedVersion) throw new GuardBoundaryError("GUARD_VERSION_CONFLICT");
      assertApprovalTransition(current, next, input.expectedLeaseToken, input.recoverExpiredLease);
      assertApprovalTransitionAudit(current, next, input.event);
      await client.query("UPDATE uaos_guard.approvals SET state=$2,version=$3,lease_expires_at=$4,snapshot=$5::jsonb WHERE approval_id=$1",
        [next.approvalId, next.state, next.version, "lease" in next ? next.lease.expiresAt : null, JSON.stringify(next)]);
      await this.#audit(client, input.event);
      return next;
    });
  }

  async listExpired(now: string, signal: AbortSignal): Promise<readonly unknown[]> {
    return this.#withClient(signal, async (client) => {
      StateTimestampSchema.parse(now);
      const rows = await client.query(`SELECT * FROM uaos_guard.approvals WHERE
        (lease_expires_at IS NOT NULL AND lease_expires_at <= $1) OR
        (expires_at <= $1 AND (state IN ('preparing','pending','approved','executing') OR snapshot->'payload' <> 'null'::jsonb))
        ORDER BY expires_at,approval_id LIMIT 1000`, [now]);
      return rows.rows.map((row) => this.#snapshot(row));
    }, "GUARD_STORE_FAILURE", false);
  }
}
