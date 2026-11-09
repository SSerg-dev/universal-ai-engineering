import { z } from "zod";

import {
  AgentEventEnvelopeSchema,
  ModelRequestedPayloadSchema,
  ModelRespondedPayloadSchema,
  RunCancelledPayloadSchema,
  RunFailedPayloadSchema,
  RunStartedPayloadSchema,
  RunSucceededPayloadSchema,
  ToolFailedPayloadSchema,
  ToolRequestedPayloadSchema,
  ToolSucceededPayloadSchema,
} from "./agent-events.js";
import { ToolErrorCodeSchema, ToolNameSchema } from "./tool-contracts.js";

const metadata = {
  ...AgentEventEnvelopeSchema.options[0].shape,
  schemaVersion: z.literal("1.1"),
};

export const RegisteredAgentEventEnvelopeSchema = z.discriminatedUnion("eventType", [
  z.strictObject({ ...metadata, eventType: z.literal("run.started"), payload: RunStartedPayloadSchema }),
  z.strictObject({ ...metadata, eventType: z.literal("model.requested"), payload: ModelRequestedPayloadSchema }),
  z.strictObject({ ...metadata, eventType: z.literal("model.responded"), payload: ModelRespondedPayloadSchema }),
  z.strictObject({
    ...metadata,
    eventType: z.literal("tool.requested"),
    payload: ToolRequestedPayloadSchema.extend({ toolName: ToolNameSchema }),
  }),
  z.strictObject({
    ...metadata,
    eventType: z.literal("tool.succeeded"),
    payload: ToolSucceededPayloadSchema.extend({ toolName: ToolNameSchema }),
  }),
  z.strictObject({
    ...metadata,
    eventType: z.literal("tool.failed"),
    payload: ToolFailedPayloadSchema.extend({
      toolName: ToolNameSchema,
      toolErrorCode: ToolErrorCodeSchema.optional(),
    }),
  }),
  z.strictObject({ ...metadata, eventType: z.literal("run.succeeded"), payload: RunSucceededPayloadSchema }),
  z.strictObject({ ...metadata, eventType: z.literal("run.failed"), payload: RunFailedPayloadSchema }),
  z.strictObject({ ...metadata, eventType: z.literal("run.cancelled"), payload: RunCancelledPayloadSchema }),
]);

export type RegisteredAgentEventEnvelope = z.infer<typeof RegisteredAgentEventEnvelopeSchema>;

export const ExecutionEventEnvelopeSchema = z.union([
  AgentEventEnvelopeSchema,
  RegisteredAgentEventEnvelopeSchema,
]);
export type ExecutionEventEnvelope = z.infer<typeof ExecutionEventEnvelopeSchema>;
