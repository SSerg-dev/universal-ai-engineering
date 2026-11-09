import type { EvaluationCase } from "../../domain/evaluation-contracts.js";

export interface EvaluationExecutionPort {
  execute(testCase: EvaluationCase, runId: string, signal: AbortSignal): Promise<{ result: unknown; events: unknown }>;
}
