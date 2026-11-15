import { z } from "zod";

import { AgentErrorCodeSchema } from "./agent-errors.js";
import { AgentEventTypeSchema } from "./agent-events.js";
import { EVALUATION_DIMENSIONS, EvaluationDimensionSchema } from "./evaluation-contracts.js";
import { StateBoundaryCodeSchema, StateIdSchema, StateTimestampSchema } from "./state-contracts.js";
import { ToolErrorCodeSchema } from "./tool-contracts.js";

export const TelemetryErrorCodeSchema = z.union([AgentErrorCodeSchema, ToolErrorCodeSchema, StateBoundaryCodeSchema,
  z.enum(["DATASET_INVALID", "DATASET_REVISION_MISMATCH", "EVALUATION_INVALID", "REPORT_FAILURE"]) ]);
export type TelemetryErrorCode = z.infer<typeof TelemetryErrorCodeSchema>;
export const TelemetryOperationSchema = z.enum(["run", "model", "tool", "retrieval", "journal", "state", "evaluation"]);
export type TelemetryOperation = z.infer<typeof TelemetryOperationSchema>;
export const TelemetryDurationSchema = z.number().finite().int().min(0).max(86_400_000);
const count = z.number().int().min(0).max(1_000_000);
const outcome = { status: z.enum(["ok", "error", "cancelled"]), errorCode: TelemetryErrorCodeSchema.optional() };
const metadata = { schemaVersion: z.literal("telemetry-1.0"), traceId: StateIdSchema,
  sequence: z.number().int().min(1).max(64), timestamp: StateTimestampSchema };

export const RunTelemetryMetricsSchema = z.strictObject({
  runId: StateIdSchema, ...outcome, durationMs: TelemetryDurationSchema,
  modelCalls: z.number().int().min(0).max(2), toolCalls: z.number().int().min(0).max(1), retries: z.literal(0),
  modelDurationMs: TelemetryDurationSchema, toolDurationMs: TelemetryDurationSchema,
  retrievalDurationMs: TelemetryDurationSchema, journalDurationMs: TelemetryDurationSchema,
  bufferDrops: count,
});
export const StateTelemetryOperationSchema = z.enum(["create", "read", "run_turn", "write_memory", "delete_memory", "recover", "purge", "audit"]);
const qualityMetric = z.strictObject({ dimension: EvaluationDimensionSchema, passed: z.number().int().min(0).max(100),
  applicable: z.number().int().min(0).max(100), rate: z.number().finite().min(0).max(1).nullable() })
  .refine((value) => value.passed <= value.applicable &&
    (value.applicable === 0 ? value.rate === null : value.rate === value.passed / value.applicable));

export const TelemetryRecordSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...metadata, kind: z.literal("span.completed"), payload: z.strictObject({
    spanId: StateIdSchema, parentSpanId: StateIdSchema.nullable(), operation: TelemetryOperationSchema,
    durationMs: TelemetryDurationSchema, ...outcome, callId: StateIdSchema.optional(),
  }) }),
  z.strictObject({ ...metadata, kind: z.literal("execution.log"), payload: z.strictObject({
    runId: StateIdSchema, eventId: StateIdSchema, eventType: AgentEventTypeSchema,
    errorCode: AgentErrorCodeSchema.optional(),
  }) }),
  z.strictObject({ ...metadata, kind: z.literal("run.metrics"), payload: RunTelemetryMetricsSchema }),
  z.strictObject({ ...metadata, kind: z.literal("evaluation.metrics"), payload: z.strictObject({
    evaluationId: StateIdSchema, gatePassed: z.boolean(), durationMs: TelemetryDurationSchema,
    caseRunIds: z.array(StateIdSchema).min(3).max(100), dimensions: z.array(qualityMetric).length(6), bufferDrops: count,
  }).refine((value) => new Set(value.caseRunIds).size === value.caseRunIds.length &&
    new Set(value.dimensions.map(({ dimension }) => dimension)).size === EVALUATION_DIMENSIONS.length &&
    value.dimensions.every(({ applicable }) => applicable <= value.caseRunIds.length)) }),
  z.strictObject({ ...metadata, kind: z.literal("state.completed"), payload: z.strictObject({
    operation: StateTelemetryOperationSchema, durationMs: TelemetryDurationSchema, ...outcome,
    conversationId: StateIdSchema.optional(), requestId: StateIdSchema.optional(), runId: StateIdSchema.optional(),
    version: z.number().int().nonnegative().optional(), bufferDrops: count,
  }) }),
]).refine((record) => {
  if (JSON.stringify(record).length > 8192) return false;
  const payload = record.payload;
  if ("status" in payload && (payload.status === "ok" ? payload.errorCode !== undefined : payload.errorCode === undefined)) return false;
  if ("status" in payload && payload.status === "cancelled" && !["CANCELLED", "TOOL_CANCELLED"].includes(payload.errorCode ?? "")) return false;
  if (record.kind === "span.completed" && record.payload.parentSpanId === record.payload.spanId) return false;
  if (record.kind === "run.metrics" || record.kind === "execution.log") return record.traceId === record.payload.runId;
  if (record.kind === "evaluation.metrics") return record.traceId === record.payload.evaluationId;
  return true;
}, "Invalid telemetry identity, outcome, or size");
export type TelemetryRecord = z.infer<typeof TelemetryRecordSchema>;

export const TelemetryDeliverySchema = z.strictObject({
  exported: z.number().int().min(0).max(64), dropped: count, timedOut: z.boolean(),
});
export type TelemetryDelivery = z.infer<typeof TelemetryDeliverySchema>;
export const TelemetryIssueSchema = z.enum([
  "TELEMETRY_MISSING", "TELEMETRY_INVALID", "SEQUENCE_GAP", "MISSING_TERMINAL_METRICS",
  "BUFFER_DROPS", "CORRELATION_MISMATCH", "MISSING_ROOT_SPAN", "MISSING_OPERATION_SPAN",
]);
export const TelemetryDiagnosisSchema = z.strictObject({
  traceId: StateIdSchema, complete: z.boolean(), issues: z.array(TelemetryIssueSchema).max(8),
  records: z.number().int().min(0).max(64),
  spans: z.array(z.strictObject({ operation: TelemetryOperationSchema, durationMs: TelemetryDurationSchema, ...outcome })).max(64),
  runMetrics: RunTelemetryMetricsSchema.optional(), relatedRunIds: z.array(StateIdSchema).max(100),
}).refine((value) => new Set(value.issues).size === value.issues.length && value.complete === (value.issues.length === 0));
export type TelemetryDiagnosis = z.infer<typeof TelemetryDiagnosisSchema>;

export class TelemetryBoundaryError extends Error {
  constructor(readonly code: "INVALID_TRACE_ID" | "TELEMETRY_READ_FAILURE") {
    super("The telemetry operation could not be completed."); this.name = "TelemetryBoundaryError";
  }
}
