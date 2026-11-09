import { z } from "zod";

import { ModelActionSchema, RunAgentSourceSchema } from "./agent-contracts.js";

export const ToolNameSchema = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/u);

export const ToolDescriptorSchema = z.strictObject({
  name: ToolNameSchema,
  description: z.string().trim().min(1).max(256),
});
export type ToolDescriptor = z.infer<typeof ToolDescriptorSchema>;

export const ToolInvocationSchema = z.strictObject({
  toolName: ToolNameSchema,
  arguments: z.unknown(),
});
export type ToolInvocation = z.infer<typeof ToolInvocationSchema>;

const OpaqueCallIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u);
export const ToolCallContextSchema = z.strictObject({
  runId: OpaqueCallIdSchema,
  callId: OpaqueCallIdSchema,
});
export type ToolCallContext = z.infer<typeof ToolCallContextSchema>;

export const ToolErrorCodeSchema = z.enum([
  "TOOL_NOT_FOUND",
  "TOOL_PERMISSION_DENIED",
  "TOOL_INPUT_INVALID",
  "TOOL_OUTPUT_INVALID",
  "TOOL_TIMEOUT",
  "TOOL_CANCELLED",
  "TOOL_EXECUTION_FAILED",
]);
export type ToolErrorCode = z.infer<typeof ToolErrorCodeSchema>;

export const ToolObservationSchema = z.strictObject({
  toolName: ToolNameSchema,
  output: z.unknown(),
  sources: z.array(RunAgentSourceSchema),
});
export type ToolObservation = z.infer<typeof ToolObservationSchema>;

export const ToolExecutionResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), observation: ToolObservationSchema }),
  z.strictObject({
    ok: z.literal(false),
    code: ToolErrorCodeSchema,
  }),
]);
export type ToolExecutionResult = z.infer<typeof ToolExecutionResultSchema>;

export const RegisteredModelActionSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("call_tool"),
    ...ToolInvocationSchema.shape,
  }),
  ModelActionSchema.options[1],
]);
export type RegisteredModelAction = z.infer<typeof RegisteredModelActionSchema>;

export const ReadDocInputSchema = z.strictObject({
  documentId: z.string().trim().min(1).max(128),
});
export type ReadDocInput = z.infer<typeof ReadDocInputSchema>;

export const ReadDocOutputSchema = z.strictObject({
  document: z.strictObject({
    ...RunAgentSourceSchema.shape,
    content: z.string(),
  }).nullable(),
});
export type ReadDocOutput = z.infer<typeof ReadDocOutputSchema>;
