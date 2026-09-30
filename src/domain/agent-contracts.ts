import { z } from "zod";

import { AgentErrorSchema } from "./agent-errors.js";

const NonEmptyStringSchema = z.string().trim().min(1);

export const RunAgentInputSchema = z.strictObject({
  question: NonEmptyStringSchema,
});

export type RunAgentInput = z.infer<typeof RunAgentInputSchema>;

export const SearchDocsInputSchema = z.strictObject({
  query: NonEmptyStringSchema,
  limit: z.number().int().min(1).max(5).default(3),
});

export type SearchDocsInput = z.infer<typeof SearchDocsInputSchema>;

export const SearchDocumentMatchSchema = z.strictObject({
  documentId: NonEmptyStringSchema,
  title: NonEmptyStringSchema,
  excerpt: z.string(),
  matchedTerms: z.array(NonEmptyStringSchema).min(1),
});

export type SearchDocumentMatch = z.infer<typeof SearchDocumentMatchSchema>;

export const SearchDocsOutputSchema = z.strictObject({
  matches: z.array(SearchDocumentMatchSchema),
});

export type SearchDocsOutput = z.infer<typeof SearchDocsOutputSchema>;

export const ModelActionSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("call_tool"),
    toolName: z.literal("search_docs"),
    arguments: SearchDocsInputSchema,
  }),
  z.strictObject({
    type: z.literal("final_answer"),
    answer: z.string(),
    sourceIds: z.array(NonEmptyStringSchema),
  }),
]);

export type ModelAction = z.infer<typeof ModelActionSchema>;

export const RunAgentSourceSchema = z.strictObject({
  documentId: NonEmptyStringSchema,
  title: NonEmptyStringSchema,
});

export type RunAgentSource = z.infer<typeof RunAgentSourceSchema>;

export const RunAgentUsageSchema = z.strictObject({
  modelCalls: z.number().int().nonnegative(),
  toolCalls: z.number().int().nonnegative(),
});

export type RunAgentUsage = z.infer<typeof RunAgentUsageSchema>;

export const RunAgentResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    runId: NonEmptyStringSchema,
    answer: z.string(),
    sources: z.array(RunAgentSourceSchema),
    usage: RunAgentUsageSchema,
  }),
  z.strictObject({
    ok: z.literal(false),
    runId: NonEmptyStringSchema,
    error: AgentErrorSchema,
  }),
]);

export type RunAgentResult = z.infer<typeof RunAgentResultSchema>;
