import { EVALUATION_DIMENSIONS, EvaluationReportSchema, type EvaluationCheck, type EvaluationDimension } from "../../src/domain/evaluation-contracts.js";

export function evaluationReportFixture(evaluationId = "evaluation-fixture") {
  return EvaluationReportSchema.parse({
    schemaVersion: "eval-report-1.0", evaluationId, datasetId: "fixture", datasetVersion: "1.0.0",
    datasetRevision: "a".repeat(64), scorerVersion: "extractive-1.0",
    startedAt: "2026-11-15T00:00:00.000Z", completedAt: "2026-11-15T00:00:01.000Z",
    cases: ["answered", "empty", "failed"].map((caseId, index) => ({ caseId, runId: `run-${index}`,
      checks: Object.fromEntries(EVALUATION_DIMENSIONS.map((key) => [key, { status: "passed" }])) as Record<EvaluationDimension, EvaluationCheck>, passed: true })),
    policy: Object.fromEntries(EVALUATION_DIMENSIONS.map((key) => [key, { minimumRate: 1, minimumApplicable: 1 }])),
    metrics: Object.fromEntries(EVALUATION_DIMENSIONS.map((key) => [key, { passed: 3, applicable: 3, rate: 1, meetsThreshold: true }])),
    gate: { passed: true, failedDimensions: [] },
  });
}
