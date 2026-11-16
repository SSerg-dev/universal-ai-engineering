import { ApprovalSnapshotSchema, GuardAuditEventSchema, GuardBoundaryError, type ApprovalSnapshot, type ApprovalState, type GuardAuditDraft } from "./guard-contracts.js";

const edges: Readonly<Record<ApprovalState, readonly ApprovalState[]>> = {
  preparing: ["pending", "preparation_failed", "expired"], pending: ["approved", "denied", "expired"],
  approved: ["executing", "denied", "expired"], denied: [], executing: ["succeeded", "uncertain"],
  succeeded: [], preparation_failed: [], expired: [], uncertain: ["succeeded"],
};
export function assertApprovalTransition(rawCurrent: ApprovalSnapshot, rawNext: ApprovalSnapshot, expectedLeaseToken?: string, recoverExpiredLease = false): void {
  const before = ApprovalSnapshotSchema.safeParse(rawCurrent), after = ApprovalSnapshotSchema.safeParse(rawNext);
  if (!before.success || !after.success) throw new GuardBoundaryError("GUARD_RESULT_INVALID");
  const current = before.data, next = after.data;
  if (next.version !== current.version + 1) throw new GuardBoundaryError("GUARD_VERSION_CONFLICT");
  if ("lease" in current && current.lease.token !== expectedLeaseToken) throw new GuardBoundaryError("GUARD_FENCED");
  if ("lease" in current && Date.parse(next.updatedAt) >= Date.parse(current.lease.expiresAt)) {
    const safeRecovery = recoverExpiredLease && (current.state === "preparing" && ["preparation_failed", "expired"].includes(next.state) ||
      current.state === "executing" && (next.state === "uncertain" || next.state === "succeeded" && next.receipt.acknowledgment === "existing_verified"));
    if (!safeRecovery) throw new GuardBoundaryError("GUARD_FENCED");
  }
  const immutable = ["approvalId", "requestId", "inputDigest", "runId", "policyId", "policyRevision", "createdAt", "expiresAt"] as const;
  if (immutable.some((key) => next[key] !== current[key]) || Date.parse(next.updatedAt) < Date.parse(current.updatedAt)) throw new GuardBoundaryError("GUARD_RESULT_INVALID");
  if (current.intent !== null && (JSON.stringify(current.intent) !== JSON.stringify(next.intent) || current.proposalDigest !== next.proposalDigest)) throw new GuardBoundaryError("GUARD_DIGEST_MISMATCH");
  if (current.payload !== null && next.payload !== null && JSON.stringify(current.payload) !== JSON.stringify(next.payload)) throw new GuardBoundaryError("GUARD_DIGEST_MISMATCH");
  if (current.payload === null && next.payload !== null && current.state !== "preparing") throw new GuardBoundaryError("GUARD_RESULT_INVALID");
  if ("approvedAt" in current && "approvedAt" in next && current.approvedAt !== next.approvedAt) throw new GuardBoundaryError("GUARD_RESULT_INVALID");
  if (next.state === current.state) {
    const strip = (value: ApprovalSnapshot) => { const { version: _version, updatedAt: _updated, payload: _payload, ...rest } = value; return rest; };
    if (!["denied", "succeeded", "uncertain"].includes(current.state) || current.payload === null || next.payload !== null ||
      Date.parse(next.updatedAt) < Date.parse(next.expiresAt) || JSON.stringify(strip(current)) !== JSON.stringify(strip(next))) throw new GuardBoundaryError("GUARD_RESULT_INVALID");
    return;
  }
  if (!edges[current.state].includes(next.state)) throw new GuardBoundaryError("GUARD_APPROVAL_REQUIRED");
  if (["pending", "approved", "executing"].includes(next.state) && Date.parse(next.updatedAt) >= Date.parse(next.expiresAt) ||
    next.state === "expired" && Date.parse(next.updatedAt) < Date.parse(next.expiresAt) ||
    next.state === "approved" && next.approvedAt !== next.updatedAt ||
    current.state === "uncertain" && next.state === "succeeded" && next.receipt.acknowledgment !== "existing_verified") {
    throw new GuardBoundaryError("GUARD_RESULT_INVALID");
  }
}

export function assertApprovalTransitionAudit(current: ApprovalSnapshot | null, next: ApprovalSnapshot, draft: GuardAuditDraft): void {
  const parsed = GuardAuditEventSchema.safeParse({ ...draft, sequence: 1 });
  if (!parsed.success) throw new GuardBoundaryError("GUARD_RESULT_INVALID");
  const event = parsed.data;
  if (event.kind !== "approval.transition" || event.scopeId !== next.approvalId || event.policyId !== next.policyId ||
    event.policyRevision !== next.policyRevision || event.timestamp !== next.updatedAt || event.payload.from !== (current?.state ?? null) ||
    event.payload.to !== next.state || event.payload.version !== next.version) throw new GuardBoundaryError("GUARD_RESULT_INVALID");
  let code: Extract<GuardAuditDraft, { kind: "approval.transition" }>["payload"]["code"];
  let actor: "host" | "local_operator" = "host";
  if (!current) {
    if (next.state !== "preparing" || next.version !== 0) throw new GuardBoundaryError("GUARD_RESULT_INVALID");
    code = "PREPARATION_RESERVED";
  } else if (current.state === next.state) code = "PAYLOAD_PURGED";
  else switch (next.state) {
    case "pending": code = "PROPOSAL_PREPARED"; break;
    case "approved": code = "OPERATOR_APPROVED"; actor = "local_operator"; break;
    case "denied":
      code = next.code === "GUARD_DENIED" ? "OPERATOR_DENIED" : next.code === "GUARD_POLICY_CHANGED" ? "POLICY_CHANGED" : "EXPORT_DISABLED";
      if (next.code === "GUARD_DENIED") actor = "local_operator";
      break;
    case "executing": code = "EXECUTION_RESERVED"; actor = "local_operator"; break;
    case "succeeded": code = "EXPORT_SUCCEEDED"; break;
    case "preparation_failed": code = "PREPARATION_FAILED"; break;
    case "expired": code = "APPROVAL_EXPIRED"; break;
    case "uncertain": code = "EXECUTION_UNCERTAIN"; break;
    default: throw new GuardBoundaryError("GUARD_RESULT_INVALID");
  }
  if (event.payload.code !== code || event.actor !== actor) throw new GuardBoundaryError("GUARD_RESULT_INVALID");
}
