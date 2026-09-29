import { z } from "zod";

import { AgentErrorCodeSchema, AgentErrorStageSchema } from "./agent-errors.js";

const NonEmptyStringSchema = z.string().trim().min(1);
const StepSchema = z.number().int().positive();
const CountSchema = z.number().int().nonnegative();
const DurationSchema = z.number().nonnegative();
const SourceIdsSchema = z.array(NonEmptyStringSchema);

export const AgentEventTypeSchema = z.enum([
  "run.started",
  "model.requested",
  "model.responded",
  "tool.requested",
  "tool.succeeded",
  "tool.failed",
  "run.succeeded",
  "run.failed",
  "run.cancelled",
]);

export type AgentEventType = z.infer<typeof AgentEventTypeSchema>;

export const TERMINAL_EVENT_TYPES = [
  "run.succeeded",
  "run.failed",
  "run.cancelled",
] as const satisfies readonly AgentEventType[];

export const RunStartedPayloadSchema = z.strictObject({});
export type RunStartedPayload = z.infer<typeof RunStartedPayloadSchema>;

export const ModelRequestedPayloadSchema = z.strictObject({
  step: StepSchema,
  callId: NonEmptyStringSchema,
});
export type ModelRequestedPayload = z.infer<typeof ModelRequestedPayloadSchema>;

export const ModelRespondedPayloadSchema = z.strictObject({
  step: StepSchema,
  callId: NonEmptyStringSchema,
  actionKind: z.enum(["call_tool", "final_answer"]),
  durationMs: DurationSchema,
});
export type ModelRespondedPayload = z.infer<typeof ModelRespondedPayloadSchema>;

export const ToolRequestedPayloadSchema = z.strictObject({
  step: StepSchema,
  callId: NonEmptyStringSchema,
  toolName: z.literal("search_docs"),
});
export type ToolRequestedPayload = z.infer<typeof ToolRequestedPayloadSchema>;

export const ToolSucceededPayloadSchema = z.strictObject({
  step: StepSchema,
  callId: NonEmptyStringSchema,
  toolName: z.literal("search_docs"),
  durationMs: DurationSchema,
  resultCount: CountSchema,
  sourceIds: SourceIdsSchema,
});
export type ToolSucceededPayload = z.infer<typeof ToolSucceededPayloadSchema>;

export const ToolFailedPayloadSchema = z.strictObject({
  step: StepSchema,
  callId: NonEmptyStringSchema,
  toolName: z.literal("search_docs"),
  durationMs: DurationSchema,
  errorCode: AgentErrorCodeSchema,
});
export type ToolFailedPayload = z.infer<typeof ToolFailedPayloadSchema>;

export const RunSucceededPayloadSchema = z.strictObject({
  answerLength: CountSchema,
  sourceIds: SourceIdsSchema,
  modelCalls: CountSchema,
  toolCalls: CountSchema,
});
export type RunSucceededPayload = z.infer<typeof RunSucceededPayloadSchema>;

export const RunFailedPayloadSchema = z.strictObject({
  errorCode: AgentErrorCodeSchema,
  stage: AgentErrorStageSchema,
  modelCalls: CountSchema,
  toolCalls: CountSchema,
});
export type RunFailedPayload = z.infer<typeof RunFailedPayloadSchema>;

export const RunCancelledPayloadSchema = z.strictObject({
  errorCode: z.literal("CANCELLED"),
  stage: AgentErrorStageSchema,
  modelCalls: CountSchema,
  toolCalls: CountSchema,
});
export type RunCancelledPayload = z.infer<typeof RunCancelledPayloadSchema>;

const EventEnvelopeBase = {
  schemaVersion: z.literal("1.0"),
  eventId: NonEmptyStringSchema,
  runId: NonEmptyStringSchema,
  sequence: z.number().int().positive(),
  occurredAt: NonEmptyStringSchema,
} as const;

export const AgentEventEnvelopeSchema = z.discriminatedUnion("eventType", [
  z.strictObject({
    ...EventEnvelopeBase,
    eventType: z.literal("run.started"),
    payload: RunStartedPayloadSchema,
  }),
  z.strictObject({
    ...EventEnvelopeBase,
    eventType: z.literal("model.requested"),
    payload: ModelRequestedPayloadSchema,
  }),
  z.strictObject({
    ...EventEnvelopeBase,
    eventType: z.literal("model.responded"),
    payload: ModelRespondedPayloadSchema,
  }),
  z.strictObject({
    ...EventEnvelopeBase,
    eventType: z.literal("tool.requested"),
    payload: ToolRequestedPayloadSchema,
  }),
  z.strictObject({
    ...EventEnvelopeBase,
    eventType: z.literal("tool.succeeded"),
    payload: ToolSucceededPayloadSchema,
  }),
  z.strictObject({
    ...EventEnvelopeBase,
    eventType: z.literal("tool.failed"),
    payload: ToolFailedPayloadSchema,
  }),
  z.strictObject({
    ...EventEnvelopeBase,
    eventType: z.literal("run.succeeded"),
    payload: RunSucceededPayloadSchema,
  }),
  z.strictObject({
    ...EventEnvelopeBase,
    eventType: z.literal("run.failed"),
    payload: RunFailedPayloadSchema,
  }),
  z.strictObject({
    ...EventEnvelopeBase,
    eventType: z.literal("run.cancelled"),
    payload: RunCancelledPayloadSchema,
  }),
]);

export type AgentEventEnvelope = z.infer<typeof AgentEventEnvelopeSchema>;
