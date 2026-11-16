import type { ApprovalSnapshot, ExportReceipt, GuardAuditDraft, GuardAuditEvent, PreparedExportPayload } from "../../domain/guard-contracts.js";
import type { GroundedRunAgentResult } from "../../domain/retrieval-contracts.js";

export interface GuardIdPort { next(kind: "operation" | "approval" | "lease" | "run"): string }
export interface GuardAuditPort {
  append(event: GuardAuditDraft, signal: AbortSignal): Promise<void>;
  read(scopeId: string, signal: AbortSignal): Promise<readonly GuardAuditEvent[]>;
}
export interface ApprovalStorePort {
  reserve(input: { snapshot: Extract<ApprovalSnapshot, { state: "preparing" }>; maxPending: number; event: GuardAuditDraft }, signal: AbortSignal): Promise<{ created: boolean; snapshot: unknown }>;
  load(approvalId: string, signal: AbortSignal): Promise<unknown | null>;
  transition(input: { expectedVersion: number; expectedLeaseToken?: string; recoverExpiredLease?: boolean; snapshot: ApprovalSnapshot; event: GuardAuditDraft }, signal: AbortSignal): Promise<unknown>;
  listExpired(now: string, signal: AbortSignal): Promise<readonly unknown[]>;
}
export interface GuardedAnswerPort {
  execute(question: string, runId: string, signal: AbortSignal): Promise<GroundedRunAgentResult>;
}
export interface ApprovedExportPort {
  publish(input: { approvalId: string; runId: string; payload: PreparedExportPayload; contentDigest: string; contentBytes: number }, signal: AbortSignal): Promise<ExportReceipt>;
  inspect(input: { approvalId: string; runId: string; contentDigest: string; contentBytes: number }, signal: AbortSignal): Promise<ExportReceipt | null>;
}
