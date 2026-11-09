import { describe, expect, it } from "vitest";

import {
  EVALUATION_DIMENSIONS, EvaluationCaseSchema, EvaluationDatasetSchema, EvaluationReportSchema,
  type EvaluationCheck, type EvaluationDimension,
} from "../../src/domain/evaluation-contracts.js";

const execution = { toolName: "retrieve_passages", modelCalls: 2, toolCalls: 1 };
const cases = [
  { caseId: "supported", question: "journal", scenario: "normal", execution, expected: { kind: "answered", requiredDocumentIds: ["journal"], forbiddenDocumentIds: [] } },
  { caseId: "empty", question: "!!!", scenario: "normal", execution, expected: { kind: "abstained" } },
  { caseId: "denied", question: "journal", scenario: "deny_tool", execution: { ...execution, modelCalls: 1 }, expected: { kind: "failed", errorCode: "TOOL_FAILURE" } },
];
const dataset = { schemaVersion: "eval-dataset-1.0", datasetId: "course", version: "1.0.0", cases, revision: "a".repeat(64) };
function report() {
  return {
    schemaVersion: "eval-report-1.0", evaluationId: "evaluation-one", datasetId: "course", datasetVersion: "1.0.0", datasetRevision: "a".repeat(64),
    scorerVersion: "extractive-1.0", startedAt: "2026-11-09T00:00:00.000Z", completedAt: "2026-11-09T00:00:01.000Z",
    cases: cases.map(({ caseId }, index) => ({ caseId, runId: `run-${index}`,
      checks: Object.fromEntries(EVALUATION_DIMENSIONS.map((key) => [key, { status: "passed" }])) as Record<EvaluationDimension, EvaluationCheck>, passed: true })),
    policy: Object.fromEntries(EVALUATION_DIMENSIONS.map((key) => [key, { minimumRate: 1, minimumApplicable: 1 }])),
    metrics: Object.fromEntries(EVALUATION_DIMENSIONS.map((key) => [key, { passed: 3, applicable: 3, rate: 1, meetsThreshold: true }])) as Record<EvaluationDimension, { passed: number; applicable: number; rate: number | null; meetsThreshold: boolean }>,
    gate: { passed: true, failedDimensions: [] as EvaluationDimension[] },
  };
}

describe("Deterministic evaluation contracts", () => {
  it("names a versioned mixed-outcome dataset with unique case identities", () => {
    expect(EvaluationDatasetSchema.parse(dataset).cases).toHaveLength(3);
    expect(EvaluationDatasetSchema.safeParse({ ...dataset, cases: [cases[0], cases[0], cases[2]] }).success).toBe(false);
    expect(EvaluationDatasetSchema.safeParse({ ...dataset, cases: cases.map((item) => ({ ...item, expected: cases[0]!.expected })) }).success).toBe(false);
  });

  it("rejects contradictory document expectations and unregistered fault scenarios", () => {
    expect(EvaluationCaseSchema.safeParse({ ...cases[0], expected: { kind: "answered", requiredDocumentIds: ["journal"], forbiddenDocumentIds: ["journal"] } }).success).toBe(false);
    expect(EvaluationCaseSchema.safeParse({ ...cases[0], scenario: "execute_shell" }).success).toBe(false);
  });

  it("requires internally consistent dimension rates and final gates", () => {
    expect(EvaluationReportSchema.safeParse(report()).success).toBe(true);
    const wrongRate = report(); wrongRate.metrics.grounding = { passed: 2, applicable: 3, rate: 1, meetsThreshold: true };
    expect(EvaluationReportSchema.safeParse(wrongRate).success).toBe(false);
    const wrongGate = report(); wrongGate.gate.passed = false;
    expect(EvaluationReportSchema.safeParse(wrongGate).success).toBe(false);
  });

  it("cannot turn absent applicable coverage into a passing metric", () => {
    const value = report();
    for (const item of value.cases) item.checks.grounding = { status: "not_applicable", reason: "NOT_ANSWERED" };
    value.metrics.grounding = { passed: 0, applicable: 0, rate: null, meetsThreshold: false };
    value.gate = { passed: false, failedDimensions: ["grounding"] };
    expect(EvaluationReportSchema.safeParse(value).success).toBe(true);
    value.metrics.grounding.meetsThreshold = true;
    expect(EvaluationReportSchema.safeParse(value).success).toBe(false);
  });

  it("forbids question, quote, and arbitrary exception fields in reports", () => {
    expect(EvaluationReportSchema.safeParse({ ...report(), question: "secret" }).success).toBe(false);
    const value = report();
    const [first, ...rest] = value.cases;
    const bad = { ...value, cases: [{ ...first!, checks: { ...first!.checks,
      grounding: { status: "failed", code: "QUOTE_MISMATCH", quote: "private document" } } }, ...rest] };
    expect(EvaluationReportSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects reused run IDs and backwards report chronology", () => {
    const value = report(); value.cases[1]!.runId = value.cases[0]!.runId;
    expect(EvaluationReportSchema.safeParse(value).success).toBe(false);
    expect(EvaluationReportSchema.safeParse({ ...report(), completedAt: "2026-11-08T00:00:00.000Z" }).success).toBe(false);
  });
});
