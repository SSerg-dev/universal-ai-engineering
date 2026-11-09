import {
  EVALUATION_DIMENSIONS, EvaluationBoundaryError, EvaluationCaseSchema, EvaluationDatasetBodySchema, EvaluationDatasetSchema,
  EvaluationPolicySchema, EvaluationReportSchema, type EvaluationCaseResult, type EvaluationCheck,
  type EvaluationDimension, type EvaluationPolicy,
} from "../domain/evaluation-contracts.js";
import { StateIdSchema, StateTimestampSchema } from "../domain/state-contracts.js";
import type { ClockPort } from "./ports/clock-port.js";
import type { ContentIdentityPort } from "./ports/content-identity-port.js";
import type { EvaluationExecutionPort } from "./ports/evaluation-execution-port.js";
import type { EvaluationReportPort } from "./ports/evaluation-report-port.js";
import type { StateIdGeneratorPort } from "./ports/state-id-generator-port.js";
import type { ResolveCitationUseCase } from "./resolve-citation.js";
import { scoreEvaluationCase } from "./score-evaluation-case.js";

export function createRunEvaluation(deps: {
  executor: EvaluationExecutionPort; reports: EvaluationReportPort; resolveCitation: ResolveCitationUseCase;
  clock: ClockPort; ids: StateIdGeneratorPort; identity: ContentIdentityPort; policy?: EvaluationPolicy;
}) {
  const policy = EvaluationPolicySchema.parse(deps.policy ?? Object.fromEntries(
    EVALUATION_DIMENSIONS.map((key) => [key, { minimumRate: 1, minimumApplicable: 1 }])));
  return async (rawDataset: unknown, signal: AbortSignal) => {
    signal.throwIfAborted();
    const parsed = EvaluationDatasetSchema.safeParse(rawDataset);
    if (!parsed.success) throw new EvaluationBoundaryError("DATASET_INVALID");
    const dataset = parsed.data;
    const { revision, ...body } = dataset;
    if (deps.identity.digest(JSON.stringify(EvaluationDatasetBodySchema.parse(body))) !== revision) throw new EvaluationBoundaryError("DATASET_REVISION_MISMATCH");
    const evaluationId = StateIdSchema.parse(deps.ids.next("operation"));
    const runIds = dataset.cases.map(() => StateIdSchema.parse(deps.ids.next("run")));
    if (new Set([evaluationId, ...runIds]).size !== runIds.length + 1) throw new EvaluationBoundaryError("EVALUATION_INVALID");
    const startedAt = StateTimestampSchema.parse(deps.clock.now());
    const cases: EvaluationCaseResult[] = [];
    for (const [index, testCase] of dataset.cases.entries()) {
      signal.throwIfAborted();
      const runId = runIds[index]!;
      let execution: Awaited<ReturnType<EvaluationExecutionPort["execute"]>>;
      try { execution = await deps.executor.execute(EvaluationCaseSchema.parse(testCase), runId, signal); }
      catch {
        if (signal.aborted) throw signal.reason;
        const checks = Object.fromEntries(EVALUATION_DIMENSIONS.map((key) => [key,
          { status: "failed", code: "EXECUTION_FAILURE" }])) as Record<EvaluationDimension, EvaluationCheck>;
        cases.push({ caseId: testCase.caseId, runId, checks, passed: false });
        continue;
      }
      signal.throwIfAborted();
      cases.push(await scoreEvaluationCase({ testCase, runId, ...execution, resolveCitation: deps.resolveCitation, signal }));
    }
    const metrics = Object.fromEntries(EVALUATION_DIMENSIONS.map((key) => {
      const applicable = cases.filter((item) => item.checks[key].status !== "not_applicable").length;
      const passed = cases.filter((item) => item.checks[key].status === "passed").length;
      const rate = applicable === 0 ? null : passed / applicable;
      return [key, { passed, applicable, rate, meetsThreshold:
        applicable >= policy[key].minimumApplicable && rate !== null && rate >= policy[key].minimumRate }];
    })) as Record<EvaluationDimension, { passed: number; applicable: number; rate: number | null; meetsThreshold: boolean }>;
    const failedDimensions = EVALUATION_DIMENSIONS.filter((key) => !metrics[key].meetsThreshold);
    const report = EvaluationReportSchema.parse({ schemaVersion: "eval-report-1.0", evaluationId,
      datasetId: dataset.datasetId, datasetVersion: dataset.version, datasetRevision: revision,
      scorerVersion: "extractive-1.0", startedAt, completedAt: StateTimestampSchema.parse(deps.clock.now()),
      cases, policy, metrics, gate: { passed: failedDimensions.length === 0, failedDimensions } });
    try { await deps.reports.save(EvaluationReportSchema.parse(report), signal); }
    catch { if (signal.aborted) throw signal.reason; throw new EvaluationBoundaryError("REPORT_FAILURE"); }
    signal.throwIfAborted();
    return report;
  };
}
