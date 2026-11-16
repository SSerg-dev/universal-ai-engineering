import { z } from "zod";

import { ContentDigestSchema, GroundedRunAgentResultSchema, RetrievalIdSchema } from "./retrieval-contracts.js";
import { StateIdSchema, StateTimestampSchema, StateVersionSchema } from "./state-contracts.js";
import { ToolNameSchema } from "./tool-contracts.js";

const markers = z.array(z.string().trim().min(1).max(64)).max(8).refine((values) =>
  new Set(values.map((value) => value.normalize("NFKC").toLowerCase())).size === values.length, "Duplicate normalized marker");
const policyFields = {
  schemaVersion: z.literal("guard-policy-1.0"), policyId: RetrievalIdSchema, version: z.string().regex(/^\d+\.\d+\.\d+$/u),
  input: z.strictObject({ maxCharacters: z.number().int().min(1).max(2048), blockedMarkers: markers }),
  output: z.strictObject({ maxCharacters: z.number().int().min(1).max(8192), blockedMarkers: markers }),
  tools: z.strictObject({ allowed: z.array(ToolNameSchema).max(16).refine((names) => new Set(names).size === names.length),
    maxArgumentCharacters: z.number().int().min(1).max(8192), maxObservationCharacters: z.number().int().min(1).max(32768) }),
  budget: z.strictObject({ maxModelCalls: z.number().int().min(0).max(2), maxToolCalls: z.number().int().min(0).max(1),
    timeoutMs: z.number().int().min(100).max(5000), toolTimeoutMs: z.number().int().min(1).max(4000) }),
  approval: z.strictObject({ exportEnabled: z.boolean(), required: z.literal(true), lifetimeSeconds: z.number().int().min(60).max(900),
    leaseSeconds: z.number().int().min(10).max(30), maxPending: z.number().int().min(1).max(16), maxExportBytes: z.number().int().min(1).max(32768) }),
};
const policyBounds = (value: { budget: { timeoutMs: number; toolTimeoutMs: number }; approval: { lifetimeSeconds: number; leaseSeconds: number } }) =>
  value.budget.toolTimeoutMs <= value.budget.timeoutMs && value.approval.leaseSeconds * 1000 > value.budget.timeoutMs + 250 &&
  value.approval.lifetimeSeconds > value.approval.leaseSeconds;
export const GuardPolicyBodySchema = z.strictObject(policyFields).refine(policyBounds);
export const GuardPolicySchema = z.strictObject({ ...policyFields, revision: ContentDigestSchema }).refine(policyBounds);
export type GuardPolicy = z.infer<typeof GuardPolicySchema>;

export const GuardBoundaryCodeSchema = z.enum([
  "GUARD_POLICY_INVALID", "GUARD_INPUT_INVALID", "GUARD_AUDIT_FAILURE", "GUARD_STORE_FAILURE", "GUARD_REQUEST_REUSED",
  "GUARD_CAPACITY_EXCEEDED", "GUARD_ACTION_NOT_FOUND", "GUARD_VERSION_CONFLICT", "GUARD_DIGEST_MISMATCH", "GUARD_POLICY_CHANGED",
  "GUARD_APPROVAL_REQUIRED", "GUARD_DENIED", "GUARD_EXPIRED", "GUARD_BUSY", "GUARD_FENCED", "GUARD_PREPARATION_FAILED",
  "GUARD_EXPORT_DISABLED", "GUARD_EXPORT_LIMIT", "GUARD_EXPORT_FAILURE", "GUARD_EXPORT_MISMATCH", "GUARD_UNCERTAIN",
  "GUARD_RESULT_INVALID", "GUARD_CANCELLED",
]);
export type GuardBoundaryCode = z.infer<typeof GuardBoundaryCodeSchema>;
export class GuardBoundaryError extends Error {
  constructor(readonly code: GuardBoundaryCode) { super("The guarded operation could not be completed."); this.name = "GuardBoundaryError"; }
}
export const GuardGateReasonSchema = z.enum(["ALLOWED", "INPUT_TOO_LONG", "INPUT_MARKER_BLOCKED", "MODEL_OUTPUT_TOO_LARGE",
  "OUTPUT_MARKER_BLOCKED", "TOOL_DENIED", "TOOL_ARGUMENTS_TOO_LARGE", "TOOL_OUTPUT_TOO_LARGE", "VALUE_INVALID"]);
export type GuardGateReason = z.infer<typeof GuardGateReasonSchema>;
export const GuardCheckpointSchema = z.enum(["request", "model_action", "tool_invocation", "tool_observation"]);
export type GuardCheckpoint = z.infer<typeof GuardCheckpointSchema>;

export const ApprovalIdSchema = StateIdSchema.refine((value) => /^approval-[A-Za-z0-9_-]+$/u.test(value));
export const GuardRunIdSchema = StateIdSchema.refine((value) => /^run-[A-Za-z0-9_-]+$/u.test(value));
export const ApprovalStateSchema = z.enum(["preparing", "pending", "approved", "denied", "executing", "succeeded", "preparation_failed", "expired", "uncertain"]);
export type ApprovalState = z.infer<typeof ApprovalStateSchema>;
export const ApprovalIntentSchema = z.strictObject({
  kind: z.literal("export_answer"), format: z.literal("markdown-1.0"), destinationId: z.literal("local-export"),
  approvalId: ApprovalIdSchema, runId: GuardRunIdSchema, policyId: RetrievalIdSchema, policyRevision: ContentDigestSchema,
  contentDigest: ContentDigestSchema, contentBytes: z.number().int().min(1).max(32768), expiresAt: StateTimestampSchema,
});
export type ApprovalIntent = z.infer<typeof ApprovalIntentSchema>;
export const PreparedExportPayloadSchema = z.strictObject({
  result: GroundedRunAgentResultSchema.options[0].refine((value) => value.grounding.status === "answered" &&
    value.usage.modelCalls === 2 && value.usage.toolCalls === 1 && JSON.stringify(value).length <= 32768),
  markdown: z.string().min(1).max(32768).refine((value) => value.isWellFormed() && !value.includes("\r") && !value.includes("\0")),
}).refine((value) => value.markdown === `${value.result.answer}\n` && JSON.stringify(value).length <= 65536);
export type PreparedExportPayload = z.infer<typeof PreparedExportPayloadSchema>;
export const ExportReceiptSchema = z.strictObject({
  approvalId: ApprovalIdSchema, runId: GuardRunIdSchema, destinationId: z.literal("local-export"),
  filename: z.string().regex(/^approval-[A-Za-z0-9_-]+\.md$/u), contentDigest: ContentDigestSchema,
  contentBytes: z.number().int().min(1).max(32768), observedAt: StateTimestampSchema,
  acknowledgment: z.enum(["published", "existing_verified"]),
}).refine((value) => value.filename === `${value.approvalId}.md`);
export type ExportReceipt = z.infer<typeof ExportReceiptSchema>;
const lease = z.strictObject({ token: StateIdSchema, expiresAt: StateTimestampSchema });
const privateBase = {
  approvalId: ApprovalIdSchema, requestId: StateIdSchema, inputDigest: ContentDigestSchema, runId: GuardRunIdSchema,
  policyId: RetrievalIdSchema, policyRevision: ContentDigestSchema, version: StateVersionSchema,
  createdAt: StateTimestampSchema, updatedAt: StateTimestampSchema, expiresAt: StateTimestampSchema,
};
const prepared = { intent: ApprovalIntentSchema, proposalDigest: ContentDigestSchema };
const nullablePrepared = { intent: ApprovalIntentSchema.nullable(), proposalDigest: ContentDigestSchema.nullable() };
export const ApprovalSnapshotSchema = z.discriminatedUnion("state", [
  z.strictObject({ ...privateBase, state: z.literal("preparing"), intent: z.null(), proposalDigest: z.null(), payload: z.null(), lease }),
  z.strictObject({ ...privateBase, state: z.literal("pending"), ...prepared, payload: PreparedExportPayloadSchema }),
  z.strictObject({ ...privateBase, state: z.literal("approved"), ...prepared, payload: PreparedExportPayloadSchema, approvedAt: StateTimestampSchema }),
  z.strictObject({ ...privateBase, state: z.literal("denied"), ...prepared, payload: PreparedExportPayloadSchema.nullable(), decidedAt: StateTimestampSchema,
    code: z.enum(["GUARD_DENIED", "GUARD_POLICY_CHANGED", "GUARD_EXPORT_DISABLED"]) }),
  z.strictObject({ ...privateBase, state: z.literal("executing"), ...prepared, payload: PreparedExportPayloadSchema.nullable(), approvedAt: StateTimestampSchema, lease }),
  z.strictObject({ ...privateBase, state: z.literal("succeeded"), ...prepared, payload: PreparedExportPayloadSchema.nullable(), approvedAt: StateTimestampSchema, receipt: ExportReceiptSchema }),
  z.strictObject({ ...privateBase, state: z.literal("preparation_failed"), intent: z.null(), proposalDigest: z.null(), payload: z.null(), code: GuardBoundaryCodeSchema }),
  z.strictObject({ ...privateBase, state: z.literal("expired"), ...nullablePrepared, payload: z.null(), code: z.literal("GUARD_EXPIRED") }),
  z.strictObject({ ...privateBase, state: z.literal("uncertain"), ...prepared, payload: PreparedExportPayloadSchema.nullable(), approvedAt: StateTimestampSchema, code: z.literal("GUARD_UNCERTAIN") }),
]).refine((value) => {
  const created = Date.parse(value.createdAt), updated = Date.parse(value.updatedAt), expires = Date.parse(value.expiresAt);
  if (created > updated || expires <= created || expires - created > 900_000) return false;
  if ((value.intent === null) !== (value.proposalDigest === null)) return false;
  if (value.intent && (value.intent.approvalId !== value.approvalId || value.intent.runId !== value.runId ||
    value.intent.policyId !== value.policyId || value.intent.policyRevision !== value.policyRevision || value.intent.expiresAt !== value.expiresAt)) return false;
  if (value.payload && value.payload.result.runId !== value.runId) return false;
  if ("lease" in value && (Date.parse(value.lease.expiresAt) <= updated || Date.parse(value.lease.expiresAt) - updated > 30_000 || Date.parse(value.lease.expiresAt) > expires)) return false;
  if ("approvedAt" in value && (Date.parse(value.approvedAt) < created || Date.parse(value.approvedAt) > updated || Date.parse(value.approvedAt) >= expires)) return false;
  if ("decidedAt" in value && (Date.parse(value.decidedAt) < created || Date.parse(value.decidedAt) > updated)) return false;
  if ("receipt" in value && (value.receipt.approvalId !== value.approvalId || value.receipt.runId !== value.runId ||
    value.receipt.contentDigest !== value.intent.contentDigest || value.receipt.contentBytes !== value.intent.contentBytes ||
    Date.parse(value.receipt.observedAt) < created || Date.parse(value.receipt.observedAt) > updated)) return false;
  return true;
}, "Approval identity, lifetime or receipt mismatch");
export type ApprovalSnapshot = z.infer<typeof ApprovalSnapshotSchema>;

export const ApprovalViewSchema = z.strictObject({
  approvalId: ApprovalIdSchema, requestId: StateIdSchema, runId: GuardRunIdSchema, state: ApprovalStateSchema, version: StateVersionSchema,
  policyId: RetrievalIdSchema, policyRevision: ContentDigestSchema, createdAt: StateTimestampSchema, updatedAt: StateTimestampSchema, expiresAt: StateTimestampSchema,
  ...nullablePrepared, payload: PreparedExportPayloadSchema.nullable(), receipt: ExportReceiptSchema.optional(), code: GuardBoundaryCodeSchema.optional(),
}).refine((value) => {
  if ((value.intent === null) !== (value.proposalDigest === null) || (value.state === "succeeded") !== (value.receipt !== undefined)) return false;
  if (["pending", "approved", "denied", "executing", "succeeded", "uncertain"].includes(value.state) && value.intent === null) return false;
  if (["preparing", "preparation_failed"].includes(value.state) && (value.intent !== null || value.payload !== null)) return false;
  if (["pending", "approved"].includes(value.state) && value.payload === null || value.state === "expired" && value.payload !== null) return false;
  if (value.intent && (value.intent.approvalId !== value.approvalId || value.intent.runId !== value.runId ||
    value.intent.policyId !== value.policyId || value.intent.policyRevision !== value.policyRevision || value.intent.expiresAt !== value.expiresAt)) return false;
  if (value.payload && value.payload.result.runId !== value.runId) return false;
  return value.receipt === undefined || value.intent !== null && value.receipt.approvalId === value.approvalId && value.receipt.runId === value.runId &&
    value.receipt.contentDigest === value.intent.contentDigest && value.receipt.contentBytes === value.intent.contentBytes;
});
export type ApprovalView = z.infer<typeof ApprovalViewSchema>;

const auditBase = { schemaVersion: z.literal("guard-audit-1.0"), eventId: StateIdSchema, scopeId: StateIdSchema,
  sequence: z.number().int().min(1).max(1024), timestamp: StateTimestampSchema,
  policyId: RetrievalIdSchema, policyRevision: ContentDigestSchema, actor: z.enum(["host", "local_operator"]) };
export const GuardAuditEventSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...auditBase, kind: z.literal("policy.checked"), payload: z.strictObject({ checkpoint: GuardCheckpointSchema,
    allowed: z.boolean(), reason: GuardGateReasonSchema, callId: StateIdSchema.optional(), step: z.number().int().min(1).max(2).optional(),
  }).refine((value) => value.allowed === (value.reason === "ALLOWED") && (value.checkpoint === "request" ? value.callId === undefined && value.step === undefined
    : value.callId !== undefined && value.step !== undefined && (value.checkpoint === "model_action" || value.step === 1))) }),
  z.strictObject({ ...auditBase, kind: z.literal("approval.transition"), payload: z.strictObject({
    from: ApprovalStateSchema.nullable(), to: ApprovalStateSchema, version: StateVersionSchema,
    code: z.enum(["PREPARATION_RESERVED", "PROPOSAL_PREPARED", "OPERATOR_APPROVED", "OPERATOR_DENIED", "POLICY_CHANGED", "EXPORT_DISABLED",
      "EXECUTION_RESERVED", "EXPORT_SUCCEEDED", "PREPARATION_FAILED", "APPROVAL_EXPIRED", "EXECUTION_UNCERTAIN", "PAYLOAD_PURGED"]),
  }) }),
  z.strictObject({ ...auditBase, kind: z.literal("approval.denial"), payload: z.strictObject({ code: GuardBoundaryCodeSchema }) }),
]).refine((event) => JSON.stringify(event).length <= 4096 &&
  (event.kind === "policy.checked" ? /^run-[A-Za-z0-9_-]+$/u.test(event.scopeId)
    : /^(?:approval|operation)-[A-Za-z0-9_-]+$/u.test(event.scopeId)));
export type GuardAuditEvent = z.infer<typeof GuardAuditEventSchema>;
type WithoutSequence<T> = T extends unknown ? Omit<T, "sequence"> : never;
export type GuardAuditDraft = WithoutSequence<GuardAuditEvent>;

const decision = { approvalId: ApprovalIdSchema, expectedVersion: StateVersionSchema, proposalDigest: ContentDigestSchema };
export const GuardCommandSchema = z.discriminatedUnion("operation", [
  z.strictObject({ operation: z.literal("prepare_export"), requestId: StateIdSchema, question: z.string().trim().min(1).max(2048) }),
  z.strictObject({ operation: z.literal("read"), approvalId: ApprovalIdSchema }),
  z.strictObject({ operation: z.literal("approve"), ...decision }),
  z.strictObject({ operation: z.literal("deny"), ...decision }),
  z.strictObject({ operation: z.literal("execute"), ...decision }),
  z.strictObject({ operation: z.literal("reconcile"), ...decision }),
  z.strictObject({ operation: z.literal("audit"), scopeId: StateIdSchema.refine((value) => /^(?:run|approval|operation)-[A-Za-z0-9_-]+$/u.test(value)) }),
  z.strictObject({ operation: z.literal("purge_expired") }),
]);
export type GuardCommand = z.infer<typeof GuardCommandSchema>;
const success = { ok: z.literal(true) };
const viewSuccess = <T extends string>(operation: T) => z.strictObject({ ...success, operation: z.literal(operation), value: ApprovalViewSchema });
export const GuardCommandSuccessSchema = z.discriminatedUnion("operation", [
  viewSuccess("prepare_export"), viewSuccess("read"), viewSuccess("approve"), viewSuccess("deny"), viewSuccess("execute"), viewSuccess("reconcile"),
  z.strictObject({ ...success, operation: z.literal("audit"), value: z.array(GuardAuditEventSchema).max(1024) }),
  z.strictObject({ ...success, operation: z.literal("purge_expired"), value: z.strictObject({ purged: z.number().int().min(0).max(1000) }) }),
]);
export type GuardCommandSuccess = z.infer<typeof GuardCommandSuccessSchema>;
