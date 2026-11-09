import { z } from "zod";

import { AgentErrorCodeSchema } from "./agent-errors.js";
import { ContentDigestSchema, RetrievalIdSchema } from "./retrieval-contracts.js";
import { StateIdSchema, StateTimestampSchema } from "./state-contracts.js";
import { ToolNameSchema } from "./tool-contracts.js";

export const EVALUATION_DIMENSIONS = ["schema", "outcome", "retrieval", "grounding", "tools", "evidence"] as const;
export const EvaluationDimensionSchema = z.enum(EVALUATION_DIMENSIONS);
export type EvaluationDimension = z.infer<typeof EvaluationDimensionSchema>;
const uniqueIds = z.array(RetrievalIdSchema).max(5).refine((ids) => new Set(ids).size === ids.length);
export const EvaluationExpectationSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("answered"), requiredDocumentIds: uniqueIds.min(1), forbiddenDocumentIds: uniqueIds }),
  z.strictObject({ kind: z.literal("abstained") }),
  z.strictObject({ kind: z.literal("failed"), errorCode: AgentErrorCodeSchema }),
]);
export const EvaluationCaseSchema = z.strictObject({
  caseId: RetrievalIdSchema, question: z.string().trim().min(1).max(2048),
  scenario: z.enum(["normal", "deny_tool"]), expected: EvaluationExpectationSchema,
  execution: z.strictObject({ toolName: ToolNameSchema, modelCalls: z.number().int().min(0).max(2), toolCalls: z.number().int().min(0).max(1) }),
}).refine((item) => {
  const expected = item.expected;
  return expected.kind !== "answered" || expected.requiredDocumentIds.every((id) => !expected.forbiddenDocumentIds.includes(id));
}, "Contradictory retrieval expectation");
export type EvaluationCase = z.infer<typeof EvaluationCaseSchema>;

const datasetFields = {
  schemaVersion: z.literal("eval-dataset-1.0"), datasetId: RetrievalIdSchema,
  version: z.string().regex(/^\d+\.\d+\.\d+$/u), cases: z.array(EvaluationCaseSchema).min(3).max(100),
};
export const EvaluationDatasetBodySchema = z.strictObject(datasetFields);
export const EvaluationDatasetSchema = z.strictObject({ ...datasetFields, revision: ContentDigestSchema }).refine((dataset) =>
  new Set(dataset.cases.map(({ caseId }) => caseId)).size === dataset.cases.length &&
  dataset.cases.some(({ expected }) => expected.kind === "answered") &&
  dataset.cases.some(({ expected }) => expected.kind === "abstained") &&
  dataset.cases.some(({ expected }) => expected.kind === "failed"), "Expected unique mixed-outcome course cases");
export type EvaluationDataset = z.infer<typeof EvaluationDatasetSchema>;

export const EvaluationFailureCodeSchema = z.enum([
  "INVALID_RESULT", "EXECUTION_FAILURE", "OUTCOME_MISMATCH", "RETRIEVAL_MISMATCH",
  "CITATION_UNRESOLVED", "CITATION_INVALID", "QUOTE_MISMATCH", "DUPLICATE_CITATION",
  "UNSUPPORTED_ANSWER", "SOURCE_MISMATCH", "TOOL_USAGE_MISMATCH", "INVALID_EVIDENCE",
]);
export type EvaluationFailureCode = z.infer<typeof EvaluationFailureCodeSchema>;
export const EvaluationCheckSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("passed") }),
  z.strictObject({ status: z.literal("failed"), code: EvaluationFailureCodeSchema }),
  z.strictObject({ status: z.literal("not_applicable"), reason: z.enum(["NOT_ANSWERED", "NO_RETRIEVAL_EXPECTATION"]) }),
]);
export type EvaluationCheck = z.infer<typeof EvaluationCheckSchema>;
const checkFields = Object.fromEntries(EVALUATION_DIMENSIONS.map((key) => [key, EvaluationCheckSchema])) as Record<EvaluationDimension, typeof EvaluationCheckSchema>;
export const EvaluationCaseResultSchema = z.strictObject({
  caseId: RetrievalIdSchema, runId: StateIdSchema, checks: z.strictObject(checkFields), passed: z.boolean(),
}).refine((result) => result.passed === EVALUATION_DIMENSIONS.every((key) => result.checks[key].status !== "failed"));
export type EvaluationCaseResult = z.infer<typeof EvaluationCaseResultSchema>;

const thresholdSchema = z.strictObject({ minimumRate: z.number().finite().min(0).max(1), minimumApplicable: z.number().int().min(1).max(100) });
const policyFields = Object.fromEntries(EVALUATION_DIMENSIONS.map((key) => [key, thresholdSchema])) as Record<EvaluationDimension, typeof thresholdSchema>;
export const EvaluationPolicySchema = z.strictObject(policyFields);
export type EvaluationPolicy = z.infer<typeof EvaluationPolicySchema>;
const metricSchema = z.strictObject({
  passed: z.number().int().nonnegative(), applicable: z.number().int().nonnegative(),
  rate: z.number().finite().min(0).max(1).nullable(), meetsThreshold: z.boolean(),
}).refine((metric) => metric.passed <= metric.applicable &&
  (metric.applicable === 0 ? metric.rate === null : metric.rate === metric.passed / metric.applicable));
const metricFields = Object.fromEntries(EVALUATION_DIMENSIONS.map((key) => [key, metricSchema])) as Record<EvaluationDimension, typeof metricSchema>;
export const EvaluationReportSchema = z.strictObject({
  schemaVersion: z.literal("eval-report-1.0"), evaluationId: StateIdSchema,
  datasetId: RetrievalIdSchema, datasetVersion: z.string().regex(/^\d+\.\d+\.\d+$/u), datasetRevision: ContentDigestSchema,
  scorerVersion: z.literal("extractive-1.0"), startedAt: StateTimestampSchema, completedAt: StateTimestampSchema,
  cases: z.array(EvaluationCaseResultSchema).min(3).max(100), policy: EvaluationPolicySchema,
  metrics: z.strictObject(metricFields), gate: z.strictObject({ passed: z.boolean(), failedDimensions: z.array(EvaluationDimensionSchema).max(6) }),
}).refine((report) => Date.parse(report.completedAt) >= Date.parse(report.startedAt) &&
  new Set(report.cases.map(({ caseId }) => caseId)).size === report.cases.length &&
  new Set(report.cases.map(({ runId }) => runId)).size === report.cases.length &&
  report.gate.passed === (report.gate.failedDimensions.length === 0) &&
  EVALUATION_DIMENSIONS.every((key) => {
    const checks = report.cases.map((item) => item.checks[key]);
    const metric = report.metrics[key], policy = report.policy[key];
    return metric.applicable === checks.filter(({ status }) => status !== "not_applicable").length &&
      metric.passed === checks.filter(({ status }) => status === "passed").length &&
      metric.meetsThreshold === (metric.applicable >= policy.minimumApplicable && metric.rate !== null && metric.rate >= policy.minimumRate) &&
      report.gate.failedDimensions.includes(key) === !metric.meetsThreshold;
  }) && new Set(report.gate.failedDimensions).size === report.gate.failedDimensions.length, "Inconsistent evaluation gate");
export type EvaluationReport = z.infer<typeof EvaluationReportSchema>;

export class EvaluationBoundaryError extends Error {
  constructor(readonly code: "DATASET_INVALID" | "DATASET_REVISION_MISMATCH" | "EVALUATION_INVALID" | "REPORT_FAILURE") {
    super("The evaluation operation could not be completed."); this.name = "EvaluationBoundaryError";
  }
}
