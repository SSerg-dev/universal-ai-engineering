import { z } from "zod";

import { ContentDigestSchema } from "../domain/retrieval-contracts.js";
import {
  ConversationSnapshotSchema, CreateConversationInputSchema, DeleteMemoryInputSchema,
  PersistableRunResultSchema, RecoverTurnInputSchema, RunConversationTurnInputSchema,
  StateAuditEventSchema, StateBoundaryError, StateIdSchema, StateTimestampSchema,
  TurnReservationSchema, WriteMemoryInputSchema, type ConversationSnapshot,
} from "../domain/state-contracts.js";
import type { ClockPort } from "./ports/clock-port.js";
import type { ContentIdentityPort } from "./ports/content-identity-port.js";
import type { ConversationStorePort } from "./ports/conversation-store-port.js";
import type { StateIdGeneratorPort, StateIdKind } from "./ports/state-id-generator-port.js";
import type { TurnExecutionPort } from "./ports/turn-execution-port.js";

function input<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new StateBoundaryError("STATE_INPUT_INVALID");
  return parsed.data;
}
function internal<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new StateBoundaryError("STATE_INVALID");
  return parsed.data;
}

export function createConversationService(deps: {
  store: ConversationStorePort; executor: TurnExecutionPort; clock: ClockPort;
  ids: StateIdGeneratorPort; identity: ContentIdentityPort; settlementTimeoutMs?: number;
}) {
  const settlementTimeoutMs = z.number().int().min(1).max(5000).parse(deps.settlementTimeoutMs ?? 1000);
  const now = () => internal(StateTimestampSchema, deps.clock.now());
  const id = (kind: StateIdKind) => internal(StateIdSchema, deps.ids.next(kind));
  const metadata = () => ({ now: now(), operationId: id("operation") });
  const caller = (signal?: AbortSignal) => signal ?? new AbortController().signal;

  async function storeCall<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
    signal.throwIfAborted();
    try { const result = await work(); signal.throwIfAborted(); return result; }
    catch (error) {
      if (signal.aborted) throw signal.reason;
      if (error instanceof StateBoundaryError) throw error;
      throw new StateBoundaryError("STATE_REPOSITORY_FAILURE");
    }
  }

  function snapshot(raw: unknown, conversationId: string, at: string): ConversationSnapshot {
    const parsed = ConversationSnapshotSchema.safeParse(raw);
    if (!parsed.success || parsed.data.conversationId !== conversationId) throw new StateBoundaryError("STATE_INVALID");
    if (Date.parse(parsed.data.expiresAt) <= Date.parse(at)) throw new StateBoundaryError("CONVERSATION_EXPIRED");
    return { ...parsed.data, memories: parsed.data.memories.filter(({ expiresAt }) => Date.parse(expiresAt) > Date.parse(at)) };
  }

  async function read(conversationId: unknown, signal?: AbortSignal) {
    const selected = input(StateIdSchema, conversationId), activeSignal = caller(signal), at = now();
    return snapshot(await storeCall(() => deps.store.load(selected, at, activeSignal), activeSignal), selected, at);
  }

  async function create(raw: unknown, signal?: AbortSignal) {
    const request = input(CreateConversationInputSchema, raw), activeSignal = caller(signal);
    const meta = metadata(), conversationId = id("conversation");
    const expiresAt = new Date(Date.parse(meta.now) + request.retentionSeconds * 1000).toISOString();
    const created = snapshot(await storeCall(() => deps.store.create({ ...meta, conversationId, expiresAt, ...request }, activeSignal), activeSignal), conversationId, meta.now);
    if (created.version !== 0 || created.createdAt !== meta.now || created.expiresAt !== expiresAt || created.turns.length !== 0 || created.memories.length !== 0) throw new StateBoundaryError("STATE_INVALID");
    return created;
  }

  async function runTurn(raw: unknown, signal?: AbortSignal) {
    const request = input(RunConversationTurnInputSchema, raw), activeSignal = caller(signal);
    const meta = metadata(), runId = id("run"), leaseToken = id("lease");
    const inputHash = internal(ContentDigestSchema, deps.identity.digest(request.question));
    const loaded = snapshot(await storeCall(() => deps.store.load(request.conversationId, meta.now, activeSignal), activeSignal), request.conversationId, meta.now);
    const leaseExpiresAt = new Date(Math.min(Date.parse(meta.now) + 30_000, Date.parse(loaded.expiresAt))).toISOString();
    const reserved = TurnReservationSchema.safeParse(await storeCall(() => deps.store.reserve({
      ...meta, ...request, inputHash, runId, leaseToken, leaseExpiresAt,
    }, activeSignal), activeSignal));
    if (!reserved.success) throw new StateBoundaryError("STATE_INVALID");
    const reservedSnapshot = snapshot(reserved.data.snapshot, request.conversationId, meta.now);
    const turn = reservedSnapshot.turns.find(({ requestId }) => requestId === request.requestId);
    if (!turn || turn.question !== request.question || turn.inputHash !== inputHash) throw new StateBoundaryError("STATE_INVALID");
    if (reserved.data.kind === "cached") {
      if (turn.status !== "settled" || JSON.stringify(turn.result) !== JSON.stringify(reserved.data.result)) throw new StateBoundaryError("STATE_INVALID");
      return { conversationId: request.conversationId, version: reservedSnapshot.version, cached: true, result: turn.result };
    }
    if (reserved.data.leaseToken !== leaseToken || turn.status !== "running" || turn.runId !== runId ||
      turn.leaseExpiresAt !== leaseExpiresAt || reservedSnapshot.version !== request.expectedVersion + 1) throw new StateBoundaryError("STATE_INVALID");
    let rawResult: unknown;
    try {
      rawResult = await deps.executor.execute(request.question, {
        conversationId: request.conversationId, requestId: request.requestId, runId,
        history: reservedSnapshot.turns.filter((candidate) => candidate.status === "settled").slice(-6),
        memories: reservedSnapshot.memories,
      }, activeSignal);
    } catch {
      if (activeSignal.aborted) throw activeSignal.reason;
      throw new StateBoundaryError("STATE_EXECUTION_FAILURE");
    }
    const result = PersistableRunResultSchema.safeParse(rawResult);
    if (!result.success || result.data.runId !== runId) throw new StateBoundaryError("STATE_EXECUTION_FAILURE");

    // Persist returned cancellation/failure using independent bounded cleanup, even after caller abort.
    const cleanup = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        const error = new StateBoundaryError("STATE_REPOSITORY_FAILURE"); cleanup.abort(error); reject(error);
      }, settlementTimeoutMs);
    });
    try {
      const finishMeta = metadata();
      const finished = snapshot(await Promise.race([
        storeCall(() => deps.store.settle({ ...finishMeta, conversationId: request.conversationId,
          requestId: request.requestId, leaseToken, result: result.data }, cleanup.signal), cleanup.signal), deadline,
      ]), request.conversationId, finishMeta.now);
      const saved = finished.turns.find(({ requestId }) => requestId === request.requestId);
      if (finished.version !== reservedSnapshot.version + 1 || saved?.status !== "settled" ||
        JSON.stringify(saved.result) !== JSON.stringify(result.data)) throw new StateBoundaryError("STATE_INVALID");
      return { conversationId: request.conversationId, version: finished.version, cached: false, result: result.data };
    } finally { if (timeout !== undefined) clearTimeout(timeout); }
  }

  async function writeMemory(raw: unknown, signal?: AbortSignal) {
    const request = input(WriteMemoryInputSchema, raw), activeSignal = caller(signal), meta = metadata();
    const loaded = snapshot(await storeCall(() => deps.store.load(request.conversationId, meta.now, activeSignal), activeSignal), request.conversationId, meta.now);
    const expiresAt = new Date(Date.parse(meta.now) + request.ttlSeconds * 1000).toISOString();
    if (Date.parse(expiresAt) > Date.parse(loaded.expiresAt)) throw new StateBoundaryError("RETENTION_INVALID");
    const changed = snapshot(await storeCall(() => deps.store.writeMemory({ ...meta, conversationId: request.conversationId,
      expectedVersion: request.expectedVersion, key: request.key, value: request.value, expiresAt }, activeSignal), activeSignal), request.conversationId, meta.now);
    const saved = changed.memories.find(({ key }) => key === request.key);
    if (changed.version !== request.expectedVersion + 1 || saved?.value !== request.value || saved.expiresAt !== expiresAt || saved.version !== changed.version) throw new StateBoundaryError("STATE_INVALID");
    return changed;
  }

  async function deleteMemory(raw: unknown, signal?: AbortSignal) {
    const request = input(DeleteMemoryInputSchema, raw), activeSignal = caller(signal), meta = metadata();
    const changed = snapshot(await storeCall(() => deps.store.deleteMemory({ ...meta, ...request }, activeSignal), activeSignal), request.conversationId, meta.now);
    if (changed.version !== request.expectedVersion + 1 || changed.memories.some(({ key }) => key === request.key)) throw new StateBoundaryError("STATE_INVALID");
    return changed;
  }

  async function recover(raw: unknown, signal?: AbortSignal) {
    const request = input(RecoverTurnInputSchema, raw), activeSignal = caller(signal), meta = metadata();
    const changed = snapshot(await storeCall(() => deps.store.recover({ ...meta, ...request }, activeSignal), activeSignal), request.conversationId, meta.now);
    if (changed.version !== request.expectedVersion + 1 || changed.turns.find(({ requestId }) => requestId === request.requestId)?.status !== "interrupted") throw new StateBoundaryError("STATE_INVALID");
    return changed;
  }

  async function purge(signal?: AbortSignal) {
    const activeSignal = caller(signal), meta = metadata();
    const result = await storeCall(() => deps.store.purge(meta, activeSignal), activeSignal);
    return internal(z.strictObject({ conversations: z.number().int().nonnegative(), memories: z.number().int().nonnegative(), audits: z.number().int().nonnegative() }), result);
  }

  async function audit(conversationId: unknown, signal?: AbortSignal) {
    const selected = input(StateIdSchema, conversationId), activeSignal = caller(signal), at = now();
    const events = internal(z.array(StateAuditEventSchema).max(1000), await storeCall(() => deps.store.audit(selected, at, activeSignal), activeSignal));
    if (events.some((event, index) => event.conversationId !== selected ||
      (index > 0 && event.sequence <= events[index - 1]!.sequence))) throw new StateBoundaryError("STATE_INVALID");
    return events;
  }
  return { create, read, runTurn, writeMemory, deleteMemory, recover, purge, audit };
}

export type ConversationService = ReturnType<typeof createConversationService>;
