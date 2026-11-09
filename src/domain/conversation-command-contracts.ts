import { z } from "zod";

import {
  ConversationSnapshotSchema, CreateConversationInputSchema, DeleteMemoryInputSchema,
  PersistableRunResultSchema, RecoverTurnInputSchema, RunConversationTurnInputSchema,
  StateAuditEventSchema, StateIdSchema, StateVersionSchema, WriteMemoryInputSchema,
} from "./state-contracts.js";

export const ConversationCommandSchema = z.discriminatedUnion("operation", [
  CreateConversationInputSchema.extend({ operation: z.literal("create") }),
  z.strictObject({ operation: z.literal("read"), conversationId: StateIdSchema }),
  RunConversationTurnInputSchema.extend({ operation: z.literal("run_turn") }),
  WriteMemoryInputSchema.extend({ operation: z.literal("write_memory") }),
  DeleteMemoryInputSchema.extend({ operation: z.literal("delete_memory") }),
  RecoverTurnInputSchema.extend({ operation: z.literal("recover") }),
  z.strictObject({ operation: z.literal("purge") }),
  z.strictObject({ operation: z.literal("audit"), conversationId: StateIdSchema }),
]);
const success = { ok: z.literal(true) };
export const ConversationCommandSuccessSchema = z.discriminatedUnion("operation", [
  z.strictObject({ ...success, operation: z.literal("create"), value: ConversationSnapshotSchema }),
  z.strictObject({ ...success, operation: z.literal("read"), value: ConversationSnapshotSchema }),
  z.strictObject({ ...success, operation: z.literal("run_turn"), value: z.strictObject({
    conversationId: StateIdSchema, version: StateVersionSchema, cached: z.boolean(), result: PersistableRunResultSchema,
  }) }),
  z.strictObject({ ...success, operation: z.literal("write_memory"), value: ConversationSnapshotSchema }),
  z.strictObject({ ...success, operation: z.literal("delete_memory"), value: ConversationSnapshotSchema }),
  z.strictObject({ ...success, operation: z.literal("recover"), value: ConversationSnapshotSchema }),
  z.strictObject({ ...success, operation: z.literal("purge"), value: z.strictObject({
    conversations: z.number().int().nonnegative(), memories: z.number().int().nonnegative(), audits: z.number().int().nonnegative(),
  }) }),
  z.strictObject({ ...success, operation: z.literal("audit"), value: z.array(StateAuditEventSchema).max(1000) }),
]);
export type ConversationCommandSuccess = z.infer<typeof ConversationCommandSuccessSchema>;
