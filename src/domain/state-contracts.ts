import { z } from "zod";

import { AgentErrorCodeSchema } from "./agent-errors.js";
import { GroundedRunAgentResultSchema } from "./retrieval-contracts.js";

export const StateIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/u);
export const StateTimestampSchema = z.iso.datetime();
export const RetentionSecondsSchema = z.number().int().min(60).max(604_800);
export const StateVersionSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const MemoryKeySchema = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/u);
export const PersistableRunResultSchema = GroundedRunAgentResultSchema.refine(
  (result) => JSON.stringify(result).length <= 32_768, "Run result exceeds state bound");

const turnIdentity = {
  requestId: StateIdSchema, runId: StateIdSchema, inputHash: z.string().regex(/^[a-f0-9]{64}$/u),
  question: z.string().trim().min(1).max(2048), startedAt: StateTimestampSchema,
};
export const ConversationTurnSchema = z.discriminatedUnion("status", [
  z.strictObject({ ...turnIdentity, status: z.literal("running"), leaseExpiresAt: StateTimestampSchema }),
  z.strictObject({ ...turnIdentity, status: z.literal("settled"), settledAt: StateTimestampSchema, result: PersistableRunResultSchema }),
  z.strictObject({ ...turnIdentity, status: z.literal("interrupted"), interruptedAt: StateTimestampSchema }),
]).refine((turn) => turn.status !== "settled" || turn.result.runId === turn.runId, "Result run identity mismatch");
export type ConversationTurn = z.infer<typeof ConversationTurnSchema>;

export const MemoryRecordSchema = z.strictObject({
  conversationId: StateIdSchema, key: MemoryKeySchema, value: z.string().trim().min(1).max(2048),
  version: StateVersionSchema, createdAt: StateTimestampSchema,
  updatedAt: StateTimestampSchema, expiresAt: StateTimestampSchema,
}).refine((memory) => Date.parse(memory.createdAt) <= Date.parse(memory.updatedAt) &&
  Date.parse(memory.updatedAt) < Date.parse(memory.expiresAt), "Invalid memory lifetime");
export type MemoryRecord = z.infer<typeof MemoryRecordSchema>;

export const ConversationSnapshotSchema = z.strictObject({
  conversationId: StateIdSchema, version: StateVersionSchema,
  createdAt: StateTimestampSchema, expiresAt: StateTimestampSchema,
  turns: z.array(ConversationTurnSchema).max(100), memories: z.array(MemoryRecordSchema).max(20),
}).refine((snapshot) => {
  const created = Date.parse(snapshot.createdAt), expires = Date.parse(snapshot.expiresAt);
  return expires > created && expires - created <= 604_800_000 &&
    new Set(snapshot.turns.map(({ requestId }) => requestId)).size === snapshot.turns.length &&
    new Set(snapshot.turns.map(({ runId }) => runId)).size === snapshot.turns.length &&
    snapshot.turns.filter(({ status }) => status === "running").length <= 1 &&
    new Set(snapshot.memories.map(({ key }) => key)).size === snapshot.memories.length &&
    snapshot.memories.every((memory) => memory.conversationId === snapshot.conversationId && memory.version <= snapshot.version &&
      Date.parse(memory.createdAt) >= created && Date.parse(memory.expiresAt) <= expires) &&
    snapshot.turns.every((turn) => {
      const started = Date.parse(turn.startedAt);
      if (started < created || started >= expires) return false;
      const ended = Date.parse(turn.status === "running" ? turn.leaseExpiresAt : turn.status === "settled" ? turn.settledAt : turn.interruptedAt);
      return ended >= started && ended <= expires &&
        (turn.status !== "running" || (ended > started && ended - started <= 30_000));
    });
}, "Invalid conversation scope, lifetime, or turn identity");
export type ConversationSnapshot = z.infer<typeof ConversationSnapshotSchema>;

export const CreateConversationInputSchema = z.strictObject({ retentionSeconds: RetentionSecondsSchema });
export const RunConversationTurnInputSchema = z.strictObject({
  conversationId: StateIdSchema, requestId: StateIdSchema, expectedVersion: StateVersionSchema,
  question: z.string().trim().min(1).max(2048),
});
export type RunConversationTurnInput = z.infer<typeof RunConversationTurnInputSchema>;
export const WriteMemoryInputSchema = z.strictObject({
  conversationId: StateIdSchema, expectedVersion: StateVersionSchema, key: MemoryKeySchema,
  value: z.string().trim().min(1).max(2048), ttlSeconds: z.number().int().min(1).max(604_800),
});
export const DeleteMemoryInputSchema = WriteMemoryInputSchema.pick({ conversationId: true, expectedVersion: true, key: true });
export const RecoverTurnInputSchema = z.strictObject({
  conversationId: StateIdSchema, requestId: StateIdSchema, expectedVersion: StateVersionSchema,
});

export const TurnReservationSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("acquired"), leaseToken: StateIdSchema, snapshot: ConversationSnapshotSchema }),
  z.strictObject({ kind: z.literal("cached"), snapshot: ConversationSnapshotSchema, result: PersistableRunResultSchema }),
]);

export const StateBoundaryCodeSchema = z.enum([
  "STATE_INPUT_INVALID", "STATE_INVALID", "CONVERSATION_NOT_FOUND", "CONVERSATION_EXPIRED",
  "VERSION_CONFLICT", "CONVERSATION_BUSY", "REQUEST_KEY_REUSED", "TURN_INTERRUPTED", "TURN_FENCED",
  "MEMORY_NOT_FOUND", "RETENTION_INVALID", "STATE_REPOSITORY_FAILURE", "STATE_CAPACITY_EXCEEDED",
]);
export type StateBoundaryCode = z.infer<typeof StateBoundaryCodeSchema>;
export class StateBoundaryError extends Error {
  constructor(readonly code: StateBoundaryCode) {
    super("The conversation state operation could not be completed.");
    this.name = "StateBoundaryError";
  }
}

const auditMetadata = {
  schemaVersion: z.literal("state-1.0"), operationId: StateIdSchema, conversationId: StateIdSchema,
  sequence: StateVersionSchema, occurredAt: StateTimestampSchema,
};
export const StateAuditEventSchema = z.discriminatedUnion("eventType", [
  z.strictObject({ ...auditMetadata, eventType: z.literal("conversation.created"), payload: z.strictObject({ retentionSeconds: RetentionSecondsSchema }) }),
  z.strictObject({ ...auditMetadata, eventType: z.literal("turn.started"), payload: z.strictObject({ requestId: StateIdSchema, runId: StateIdSchema }) }),
  z.strictObject({ ...auditMetadata, eventType: z.literal("turn.settled"), payload: z.strictObject({ requestId: StateIdSchema, runId: StateIdSchema, ok: z.boolean(), errorCode: AgentErrorCodeSchema.optional() }) }),
  z.strictObject({ ...auditMetadata, eventType: z.literal("turn.interrupted"), payload: z.strictObject({ requestId: StateIdSchema, runId: StateIdSchema, code: z.literal("TURN_INTERRUPTED") }) }),
  z.strictObject({ ...auditMetadata, eventType: z.literal("memory.written"), payload: z.strictObject({ key: MemoryKeySchema, expiresAt: StateTimestampSchema }) }),
  z.strictObject({ ...auditMetadata, eventType: z.literal("memory.deleted"), payload: z.strictObject({ key: MemoryKeySchema }) }),
  z.strictObject({ ...auditMetadata, eventType: z.literal("conversation.purged"), payload: z.strictObject({ code: z.literal("RETENTION_EXPIRED") }) }),
]).refine((event) => event.eventType !== "turn.settled" ||
  (event.payload.ok ? event.payload.errorCode === undefined : event.payload.errorCode !== undefined),
"Settled audit outcome must match its error code");
export type StateAuditEvent = z.infer<typeof StateAuditEventSchema>;
