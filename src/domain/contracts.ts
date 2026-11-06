import { z } from "zod";

const nonblankText = z.string().trim().min(1);

export const runInputSchema = z.strictObject({ question: nonblankText });

export const modelActionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("call_tool"), arguments: z.unknown() }),
  z.strictObject({ kind: z.literal("answer"), text: nonblankText }),
]);

export const toolInputSchema = z.strictObject({});
export const toolObservationSchema = z.strictObject({ text: nonblankText });

export type ModelAction = z.infer<typeof modelActionSchema>;
export type ToolInput = z.infer<typeof toolInputSchema>;
export type ToolObservation = z.infer<typeof toolObservationSchema>;

const runErrorCodeSchema = z.enum([
  "LIMIT_EXCEEDED",
  "TIMEOUT",
  "CANCELLED",
  "MODEL_FAILED",
  "TOOL_FAILED",
  "INVALID_MODEL_ACTION",
  "INVALID_TOOL_INPUT",
  "INVALID_TOOL_OUTPUT",
  "TOOL_REQUIRED",
  "TOOL_ALREADY_CALLED",
]);

export type RunErrorCode = z.infer<typeof runErrorCodeSchema>;

export type RunOutcome =
  | { kind: "answered"; text: string }
  | { kind: "failed"; code: RunErrorCode };

export type RunResult =
  | { kind: "failed"; code: "INVALID_INPUT" }
  | (RunOutcome & { runId: string; journalStatus: "complete" | "incomplete" });

export type RunEventData =
  | { eventType: "run_started" | "model_requested" | "model_responded" | "tool_started" | "tool_observed" | "run_answered" }
  | { eventType: "run_failed"; code: RunErrorCode };

const eventMetadata = {
  runId: z.string().min(1),
  seq: z.number().int().positive(),
  timestamp: z.iso.datetime(),
};

export const runEventSchema = z.discriminatedUnion("eventType", [
  z.strictObject({
    ...eventMetadata,
    eventType: z.enum([
      "run_started",
      "model_requested",
      "model_responded",
      "tool_started",
      "tool_observed",
      "run_answered",
    ]),
  }),
  z.strictObject({
    ...eventMetadata,
    eventType: z.literal("run_failed"),
    code: runErrorCodeSchema,
  }),
]);

export type RunEvent = z.infer<typeof runEventSchema>;
