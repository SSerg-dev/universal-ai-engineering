import type { EvaluationReport } from "../../domain/evaluation-contracts.js";

export interface EvaluationReportPort {
  save(report: EvaluationReport, signal: AbortSignal): Promise<void>;
}
