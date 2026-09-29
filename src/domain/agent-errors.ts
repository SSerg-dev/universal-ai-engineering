import { z } from "zod";

export const AgentErrorCodeSchema = z.enum([
  "INVALID_REQUEST",
  "MODEL_FAILURE",
  "INVALID_MODEL_ACTION",
  "INVALID_TRANSITION",
  "TOOL_FAILURE",
  "TIMEOUT",
  "CANCELLED",
  "LIMIT_EXCEEDED",
  "JOURNAL_FAILURE",
  "INTERNAL_ERROR",
]);

export type AgentErrorCode = z.infer<typeof AgentErrorCodeSchema>;

export const AgentErrorStageSchema = z.enum([
  "request",
  "model",
  "tool",
  "journal",
  "orchestration",
]);

export type AgentErrorStage = z.infer<typeof AgentErrorStageSchema>;

export const AgentErrorSchema = z.strictObject({
  code: AgentErrorCodeSchema,
  message: z.string().min(1),
  stage: AgentErrorStageSchema,
  retryable: z.boolean(),
});

export type AgentError = z.infer<typeof AgentErrorSchema>;
