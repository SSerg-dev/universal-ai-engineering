import type { ConversationStorePort, StateMutationMetadata } from "../../src/application/ports/conversation-store-port.js";
import {
  ConversationSnapshotSchema, StateAuditEventSchema, StateBoundaryError,
  type ConversationSnapshot, type ConversationTurn, type StateAuditEvent,
} from "../../src/domain/state-contracts.js";

type Input<K extends keyof ConversationStorePort> = Parameters<ConversationStorePort[K]>[0];
export class FakeConversationStore implements ConversationStorePort {
  readonly records = new Map<string, ConversationSnapshot>();
  readonly leases = new Map<string, string>();
  readonly events: StateAuditEvent[] = [];
  failSettlement = false;

  #load(id: string, now: string): ConversationSnapshot {
    const found = this.records.get(id);
    if (!found) throw new StateBoundaryError("CONVERSATION_NOT_FOUND");
    if (Date.parse(now) >= Date.parse(found.expiresAt)) throw new StateBoundaryError("CONVERSATION_EXPIRED");
    return structuredClone(found);
  }
  #mutable(id: string, now: string, version: number) {
    const current = this.#load(id, now);
    if (current.turns.some(({ status }) => status === "running")) throw new StateBoundaryError("CONVERSATION_BUSY");
    if (current.version !== version) throw new StateBoundaryError("VERSION_CONFLICT");
    return current;
  }
  #save(snapshot: ConversationSnapshot, meta: StateMutationMetadata,
    eventType: StateAuditEvent["eventType"], payload: unknown) {
    const parsed = ConversationSnapshotSchema.parse(snapshot);
    const event = StateAuditEventSchema.parse({ schemaVersion: "state-1.0", operationId: meta.operationId,
      conversationId: parsed.conversationId, sequence: parsed.version, occurredAt: meta.now, eventType, payload });
    this.records.set(parsed.conversationId, structuredClone(parsed)); this.events.push(event);
    return structuredClone(parsed);
  }
  async create(input: Input<"create">, signal: AbortSignal) {
    signal.throwIfAborted();
    return this.#save({ conversationId: input.conversationId, version: 0, createdAt: input.now,
      expiresAt: input.expiresAt, turns: [], memories: [] }, input, "conversation.created", { retentionSeconds: input.retentionSeconds });
  }
  async load(id: string, now: string, signal: AbortSignal) { signal.throwIfAborted(); return this.#load(id, now); }
  async reserve(input: Input<"reserve">, signal: AbortSignal) {
    signal.throwIfAborted();
    const current = this.#load(input.conversationId, input.now);
    const previous = current.turns.find(({ requestId }) => requestId === input.requestId);
    if (previous) {
      if (previous.inputHash !== input.inputHash || previous.question !== input.question) throw new StateBoundaryError("REQUEST_KEY_REUSED");
      if (previous.status === "settled") return { kind: "cached", snapshot: current, result: previous.result };
      throw new StateBoundaryError(previous.status === "interrupted" ? "TURN_INTERRUPTED" : "CONVERSATION_BUSY");
    }
    if (current.turns.some(({ status }) => status === "running")) throw new StateBoundaryError("CONVERSATION_BUSY");
    if (current.version !== input.expectedVersion) throw new StateBoundaryError("VERSION_CONFLICT");
    if (current.turns.length >= 100) throw new StateBoundaryError("STATE_CAPACITY_EXCEEDED");
    current.version += 1;
    current.turns.push({ requestId: input.requestId, runId: input.runId, question: input.question,
      inputHash: input.inputHash, startedAt: input.now, status: "running", leaseExpiresAt: input.leaseExpiresAt });
    this.leases.set(`${input.conversationId}/${input.requestId}`, input.leaseToken);
    return { kind: "acquired", leaseToken: input.leaseToken,
      snapshot: this.#save(current, input, "turn.started", { requestId: input.requestId, runId: input.runId }) };
  }
  async settle(input: Input<"settle">, signal: AbortSignal) {
    signal.throwIfAborted();
    if (this.failSettlement) throw new Error("secret state failure");
    const current = this.#load(input.conversationId, input.now);
    const index = current.turns.findIndex(({ requestId }) => requestId === input.requestId);
    const turn = current.turns[index];
    if (turn?.status !== "running" || turn.runId !== input.result.runId || Date.parse(turn.leaseExpiresAt) <= Date.parse(input.now) ||
      this.leases.get(`${input.conversationId}/${input.requestId}`) !== input.leaseToken) throw new StateBoundaryError("TURN_FENCED");
    const { leaseExpiresAt: _lease, ...identity } = turn;
    current.turns[index] = { ...identity, status: "settled", settledAt: input.now, result: input.result };
    current.version += 1;
    return this.#save(current, input, "turn.settled", { requestId: input.requestId, runId: input.result.runId, ok: input.result.ok,
      ...(!input.result.ok ? { errorCode: input.result.error.code } : {}) });
  }
  async recover(input: Input<"recover">, signal: AbortSignal) {
    signal.throwIfAborted();
    const current = this.#load(input.conversationId, input.now);
    if (current.version !== input.expectedVersion) throw new StateBoundaryError("VERSION_CONFLICT");
    const index = current.turns.findIndex(({ requestId }) => requestId === input.requestId);
    const turn = current.turns[index];
    if (turn?.status !== "running" || Date.parse(turn.leaseExpiresAt) > Date.parse(input.now)) throw new StateBoundaryError("CONVERSATION_BUSY");
    const { leaseExpiresAt: _lease, ...identity } = turn;
    current.turns[index] = { ...identity, status: "interrupted", interruptedAt: input.now };
    current.version += 1;
    return this.#save(current, input, "turn.interrupted", { requestId: input.requestId, runId: turn.runId, code: "TURN_INTERRUPTED" });
  }
  async writeMemory(input: Input<"writeMemory">, signal: AbortSignal) {
    signal.throwIfAborted();
    const current = this.#mutable(input.conversationId, input.now, input.expectedVersion);
    if (Date.parse(input.expiresAt) > Date.parse(current.expiresAt)) throw new StateBoundaryError("RETENTION_INVALID");
    current.memories = current.memories.filter(({ expiresAt }) => Date.parse(expiresAt) > Date.parse(input.now));
    const previous = current.memories.find(({ key }) => key === input.key);
    if (!previous && current.memories.length >= 20) throw new StateBoundaryError("STATE_CAPACITY_EXCEEDED");
    current.version += 1;
    current.memories = [...current.memories.filter(({ key }) => key !== input.key), {
      conversationId: input.conversationId, key: input.key, value: input.value, version: current.version,
      createdAt: previous?.createdAt ?? input.now, updatedAt: input.now, expiresAt: input.expiresAt,
    }];
    return this.#save(current, input, "memory.written", { key: input.key, expiresAt: input.expiresAt });
  }
  async deleteMemory(input: Input<"deleteMemory">, signal: AbortSignal) {
    signal.throwIfAborted();
    const current = this.#mutable(input.conversationId, input.now, input.expectedVersion);
    if (!current.memories.some(({ key, expiresAt }) => key === input.key && Date.parse(expiresAt) > Date.parse(input.now))) throw new StateBoundaryError("MEMORY_NOT_FOUND");
    current.memories = current.memories.filter(({ key }) => key !== input.key); current.version += 1;
    return this.#save(current, input, "memory.deleted", { key: input.key });
  }
  async purge(input: Input<"purge">, signal: AbortSignal) {
    signal.throwIfAborted(); let conversations = 0, memories = 0;
    for (const [key, current] of this.records) {
      if (Date.parse(current.expiresAt) <= Date.parse(input.now)) {
        this.events.push(StateAuditEventSchema.parse({ schemaVersion: "state-1.0", operationId: input.operationId,
          conversationId: key, sequence: current.version + 1, occurredAt: input.now,
          eventType: "conversation.purged", payload: { code: "RETENTION_EXPIRED" } }));
        memories += current.memories.length; this.records.delete(key); conversations += 1;
      } else {
        const remaining = current.memories.filter(({ expiresAt }) => Date.parse(expiresAt) > Date.parse(input.now));
        memories += current.memories.length - remaining.length; current.memories = remaining;
      }
    }
    return { conversations, memories };
  }
  async audit(id: string, signal: AbortSignal) {
    signal.throwIfAborted(); return structuredClone(this.events.filter(({ conversationId }) => conversationId === id));
  }
}
