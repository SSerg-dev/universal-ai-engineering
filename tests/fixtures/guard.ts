import policy from "../../fixtures/policies/local-course.v1.json" with { type: "json" };
import { Sha256ContentIdentity } from "../../src/adapters/outbound/sha256-content-identity.js";
import { renderGroundedAnswer } from "../../src/application/grounded-answer.js";
import { ApprovalIntentSchema, ApprovalSnapshotSchema, ExportReceiptSchema, GuardPolicySchema, PreparedExportPayloadSchema } from "../../src/domain/guard-contracts.js";
import { GroundedAnswerSchema } from "../../src/domain/retrieval-contracts.js";

export function guardFixture(approvalId = "approval-one", runId = "run-one") {
  const identity = new Sha256ContentIdentity(), quote = "# Controlled evidence\nOnly the reviewed answer is exported.";
  const grounding = GroundedAnswerSchema.parse({ version: "1.0", status: "answered", claims: [{ quote,
    citation: { indexId: "course", documentId: "guide", revision: "a".repeat(64), passageId: "b".repeat(64), start: 0, end: quote.length } }] });
  const selected = GuardPolicySchema.parse(policy);
  const base = { approvalId, requestId: "request-one", inputDigest: identity.digest("private question"), runId,
    policyId: selected.policyId, policyRevision: selected.revision, createdAt: "2026-11-16T00:00:00.000Z", expiresAt: "2026-11-16T00:05:00.000Z" };
  const payload = PreparedExportPayloadSchema.parse({ result: { ok: true, runId, answer: renderGroundedAnswer(grounding), grounding,
    sources: [{ documentId: "guide", title: "Controlled evidence" }], usage: { modelCalls: 2, toolCalls: 1 } }, markdown: `${renderGroundedAnswer(grounding)}\n` });
  const intent = ApprovalIntentSchema.parse({ kind: "export_answer", format: "markdown-1.0", destinationId: "local-export", approvalId, runId,
    policyId: selected.policyId, policyRevision: selected.revision, expiresAt: base.expiresAt,
    contentDigest: identity.digest(payload.markdown), contentBytes: Buffer.byteLength(payload.markdown, "utf8") });
  const proposalDigest = identity.digest(JSON.stringify(intent)), approvedAt = "2026-11-16T00:00:02.000Z";
  const preparing = ApprovalSnapshotSchema.parse({ ...base, state: "preparing", version: 0, updatedAt: base.createdAt,
    intent: null, proposalDigest: null, payload: null, lease: { token: "lease-prepare", expiresAt: "2026-11-16T00:00:15.000Z" } });
  const pending = ApprovalSnapshotSchema.parse({ ...base, state: "pending", version: 1, updatedAt: "2026-11-16T00:00:01.000Z", intent, proposalDigest, payload });
  const approved = ApprovalSnapshotSchema.parse({ ...base, state: "approved", version: 2, updatedAt: approvedAt, approvedAt, intent, proposalDigest, payload });
  const executing = ApprovalSnapshotSchema.parse({ ...base, state: "executing", version: 3, updatedAt: "2026-11-16T00:00:03.000Z", approvedAt,
    intent, proposalDigest, payload, lease: { token: "lease-execute", expiresAt: "2026-11-16T00:00:18.000Z" } });
  const receipt = ExportReceiptSchema.parse({ approvalId, runId, destinationId: "local-export", filename: `${approvalId}.md`,
    contentDigest: intent.contentDigest, contentBytes: intent.contentBytes, observedAt: "2026-11-16T00:00:04.000Z", acknowledgment: "published" });
  const succeeded = ApprovalSnapshotSchema.parse({ ...base, state: "succeeded", version: 4, updatedAt: receipt.observedAt, approvedAt, intent, proposalDigest, payload, receipt });
  const uncertain = ApprovalSnapshotSchema.parse({ ...base, state: "uncertain", version: 4, updatedAt: receipt.observedAt, approvedAt, intent, proposalDigest, payload, code: "GUARD_UNCERTAIN" });
  if (preparing.state !== "preparing" || pending.state !== "pending" || approved.state !== "approved" || executing.state !== "executing" ||
    succeeded.state !== "succeeded" || uncertain.state !== "uncertain") throw new Error("Unexpected guard fixture state");
  return { identity, policy: selected, base, payload, intent, proposalDigest, preparing, pending, approved, executing, succeeded, uncertain, receipt };
}
