import { z } from "zod";

import { AgentErrorCodeSchema, AgentErrorStageSchema } from "./agent-errors.js";
import { GroundedRunAgentResultSchema } from "./retrieval-contracts.js";
import { StateIdSchema, StateTimestampSchema } from "./state-contracts.js";
import { ToolErrorCodeSchema, ToolNameSchema } from "./tool-contracts.js";

export const STREAM_MAX_FRAMES = 24;
export const STREAM_MAX_CHARACTERS = 262_144;
export const StreamRunIdSchema = StateIdSchema.refine((id) => /^run-[A-Za-z0-9_-]+$/u.test(id));
export const StreamInputSchema = z.strictObject({ question: z.string().trim().min(1).max(2048) });
export const StreamCursorSchema = z.number().int().min(0).max(STREAM_MAX_FRAMES);
const base = { schemaVersion: z.literal("stream-1.0"), runId: StreamRunIdSchema,
  sequence: z.number().int().min(1).max(STREAM_MAX_FRAMES), timestamp: StateTimestampSchema };
const failure = { code: AgentErrorCodeSchema, stage: AgentErrorStageSchema, retryable: z.literal(false) };
const call = { callId: StateIdSchema, toolName: ToolNameSchema };
const duration = z.number().finite().int().min(0).max(86_400_000);

export const StreamEventSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...base, type: z.literal("run.started"), payload: z.strictObject({}) }),
  z.strictObject({ ...base, type: z.literal("run.progress"), payload: z.strictObject({
    eventType: z.enum(["model.requested", "model.responded"]), callId: StateIdSchema, step: z.number().int().min(1).max(2),
  }) }),
  z.strictObject({ ...base, type: z.literal("tool.started"), payload: z.strictObject(call) }),
  z.strictObject({ ...base, type: z.literal("tool.completed"), payload: z.strictObject({ ...call, durationMs: duration }) }),
  z.strictObject({ ...base, type: z.literal("tool.failed"), payload: z.strictObject({ ...call, code: ToolErrorCodeSchema, durationMs: duration }) }),
  z.strictObject({ ...base, type: z.literal("answer"), payload: GroundedRunAgentResultSchema.options[0].extend({
    usage: z.strictObject({ modelCalls: z.literal(2), toolCalls: z.literal(1) }),
  }) }),
  z.strictObject({ ...base, type: z.literal("run.completed"), payload: z.strictObject({ modelCalls: z.literal(2), toolCalls: z.literal(1) }) }),
  z.strictObject({ ...base, type: z.literal("run.cancelled"), payload: z.strictObject({ ...failure, code: z.literal("CANCELLED") }) }),
  z.strictObject({ ...base, type: z.literal("run.failed"), payload: z.strictObject(failure).refine(({ code }) => code !== "CANCELLED") }),
]).refine((event) => JSON.stringify(event).length <= 32_768 &&
  (event.type !== "answer" || event.runId === event.payload.runId), "Stream identity or frame bound violated");
export type StreamEvent = z.infer<typeof StreamEventSchema>;
export const StreamCreatedSchema = z.strictObject({ runId: StreamRunIdSchema });
export const StreamCancelResultSchema = z.strictObject({ runId: StreamRunIdSchema, requested: z.boolean(), terminal: z.boolean() });
export const StreamBoundaryCodeSchema = z.enum([
  "STREAM_INPUT_INVALID", "STREAM_RUN_NOT_FOUND", "STREAM_CURSOR_INVALID", "STREAM_CAPACITY_EXCEEDED",
  "STREAM_SUBSCRIBER_LIMIT", "STREAM_CLOSED", "STREAM_EVENT_INVALID",
  "STREAM_ORIGIN_DENIED",
]);
export type StreamBoundaryCode = z.infer<typeof StreamBoundaryCodeSchema>;
export class StreamBoundaryError extends Error {
  constructor(readonly code: StreamBoundaryCode) {
    super("The streaming operation could not be completed."); this.name = "StreamBoundaryError";
  }
}
export function isStreamTerminal(event: StreamEvent) {
  return event.type === "run.completed" || event.type === "run.failed" || event.type === "run.cancelled";
}
