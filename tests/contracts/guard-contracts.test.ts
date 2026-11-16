import { describe, expect, it } from "vitest";

import policy from "../../fixtures/policies/local-course.v1.json" with { type: "json" };
import { assertApprovalTransition } from "../../src/domain/approval-transitions.js";
import { ApprovalSnapshotSchema, ApprovalViewSchema, ExportReceiptSchema, GuardAuditEventSchema, GuardCommandSchema, GuardPolicyBodySchema, GuardPolicySchema } from "../../src/domain/guard-contracts.js";
import { guardFixture } from "../fixtures/guard.js";

describe("Host guard policy and explicit approval contracts", () => {
  it("pins the canonical teaching policy before effects and refuses an approval bypass", () => {
    const { identity } = guardFixture(), { revision, ...raw } = GuardPolicySchema.parse(policy);
    expect(revision).toBe("83352b220fd36d3fc6b063c135549dbfb8180a11d097a4fc9264499023769a52");
    expect(identity.digest(JSON.stringify(GuardPolicyBodySchema.parse(raw)))).toBe(revision);
    expect(GuardPolicySchema.safeParse({ ...policy, approval: { ...policy.approval, required: false } }).success).toBe(false);
    expect(GuardPolicySchema.safeParse({ ...policy, tools: { ...policy.tools, allowed: ["retrieve_passages", "retrieve_passages"] } }).success).toBe(false);
    expect(GuardPolicySchema.safeParse({ ...policy, input: { ...policy.input, blockedMarkers: ["ABC", "ＡＢＣ"] } }).success).toBe(false);
    expect(GuardPolicySchema.safeParse({ ...policy, budget: { ...policy.budget, timeoutMs: 200, toolTimeoutMs: 201 } }).success).toBe(false);
  });

  it("accepts only strict content/path-free commands and explicit digest/version decisions", () => {
    const { proposalDigest } = guardFixture();
    expect(GuardCommandSchema.parse({ operation: "approve", approvalId: "approval-one", expectedVersion: 1, proposalDigest })).toMatchObject({ operation: "approve" });
    for (const command of [
      { operation: "approve", approvalId: "approval-one", approved: true },
      { operation: "execute", approvalId: "../outside", expectedVersion: 1, proposalDigest },
      { operation: "prepare_export", requestId: "request-one", question: "q", path: "private path" },
      { operation: "approve", approvalId: "approval-one", expectedVersion: 1, proposalDigest, leaseToken: "private" },
      { operation: "prepare_export", requestId: "request-one", question: "x".repeat(2049) },
    ]) expect(GuardCommandSchema.safeParse(command).success).toBe(false);
  });

  it("separates protected proposal review from private leases and safe audit", () => {
    const f = guardFixture(), { inputDigest: _input, ...view } = f.pending;
    expect(ApprovalViewSchema.parse(view)).toMatchObject({ state: "pending", payload: { result: { runId: "run-one" } } });
    expect(ApprovalViewSchema.safeParse({ ...view, lease: { token: "private", expiresAt: view.expiresAt } }).success).toBe(false);
    expect(ApprovalViewSchema.safeParse({ ...view, state: "approved", payload: null }).success).toBe(false);
    const event = { schemaVersion: "guard-audit-1.0", eventId: "operation-one", scopeId: "run-one", sequence: 1,
      timestamp: f.base.createdAt, policyId: f.policy.policyId, policyRevision: f.policy.revision, actor: "host", kind: "policy.checked",
      payload: { checkpoint: "request", allowed: false, reason: "INPUT_MARKER_BLOCKED" } };
    expect(GuardAuditEventSchema.parse(event)).toMatchObject({ payload: { allowed: false } });
    for (const patch of [{ question: "private" }, { answer: "private" }, { quote: "private" }, { path: "private" }, { leaseToken: "private" }])
      expect(GuardAuditEventSchema.safeParse({ ...event, payload: { ...event.payload, ...patch } }).success).toBe(false);
    expect(GuardAuditEventSchema.safeParse({ ...event, payload: { ...event.payload, allowed: true } }).success).toBe(false);
  });

  it("binds snapshot IDs, exact payload, expiry, receipt digest and generated filename", () => {
    const f = guardFixture();
    expect(ApprovalSnapshotSchema.safeParse({ ...f.pending, runId: "run-other" }).success).toBe(false);
    expect(ApprovalSnapshotSchema.safeParse({ ...f.pending, payload: { ...f.payload, markdown: "substituted content\n" } }).success).toBe(false);
    expect(ApprovalSnapshotSchema.safeParse({ ...f.preparing, lease: { token: "lease-one", expiresAt: "2026-11-16T00:01:00.000Z" } }).success).toBe(false);
    expect(ExportReceiptSchema.safeParse({ ...f.receipt, filename: "another.md" }).success).toBe(false);
    expect(ApprovalSnapshotSchema.safeParse({ ...f.succeeded, receipt: { ...f.receipt, contentDigest: "c".repeat(64) } }).success).toBe(false);
    expect(ApprovalSnapshotSchema.safeParse({ ...f.pending, expiresAt: "2026-11-16T01:00:00.000Z" }).success).toBe(false);
  });

  it("requires separate durable preparation, human decision and execution transitions", () => {
    const f = guardFixture();
    expect(() => assertApprovalTransition(f.preparing, f.pending, "lease-prepare")).not.toThrow();
    expect(() => assertApprovalTransition(f.pending, f.approved)).not.toThrow();
    expect(() => assertApprovalTransition(f.approved, f.executing)).not.toThrow();
    expect(() => assertApprovalTransition(f.executing, f.succeeded, "lease-execute")).not.toThrow();
    expect(() => assertApprovalTransition(f.pending, { ...f.executing, version: 2 })).toThrow(expect.objectContaining({ code: "GUARD_APPROVAL_REQUIRED" }));
    expect(() => assertApprovalTransition(f.preparing, { ...f.approved, version: 1 }, "lease-prepare")).toThrow(expect.objectContaining({ code: "GUARD_APPROVAL_REQUIRED" }));
  });

  it("fences stale workers/versions and immutable intent/payload changes", () => {
    const f = guardFixture();
    expect(() => assertApprovalTransition(f.executing, f.succeeded, "lease-stale")).toThrow(expect.objectContaining({ code: "GUARD_FENCED" }));
    expect(() => assertApprovalTransition(f.pending, { ...f.approved, version: 1 })).toThrow(expect.objectContaining({ code: "GUARD_VERSION_CONFLICT" }));
    expect(() => assertApprovalTransition(f.pending, { ...f.approved, policyRevision: "c".repeat(64) })).toThrow();
    expect(() => assertApprovalTransition(f.pending, { ...f.approved, proposalDigest: "c".repeat(64) })).toThrow(expect.objectContaining({ code: "GUARD_DIGEST_MISMATCH" }));
  });

  it("permits receipt reconciliation of uncertainty but never silently retries publication", () => {
    const f = guardFixture();
    expect(() => assertApprovalTransition(f.executing, f.uncertain, "lease-execute")).not.toThrow();
    expect(() => assertApprovalTransition(f.uncertain, { ...f.succeeded, version: 5 })).not.toThrow();
    expect(() => assertApprovalTransition(f.uncertain, { ...f.executing, version: 5, updatedAt: "2026-11-16T00:00:05.000Z" })).toThrow(expect.objectContaining({ code: "GUARD_APPROVAL_REQUIRED" }));
  });

  it("rejects expired worker leases and limits recovery to failed preparation or verified/uncertain effects", () => {
    const f = guardFixture(), late = "2026-11-16T00:00:20.000Z";
    expect(() => assertApprovalTransition(f.preparing, { ...f.pending, updatedAt: late }, "lease-prepare")).toThrow(expect.objectContaining({ code: "GUARD_FENCED" }));
    expect(() => assertApprovalTransition(f.preparing, { ...f.pending, updatedAt: late }, "lease-prepare", true)).toThrow(expect.objectContaining({ code: "GUARD_FENCED" }));
    expect(() => assertApprovalTransition(f.executing, { ...f.succeeded, updatedAt: late }, "lease-execute")).toThrow(expect.objectContaining({ code: "GUARD_FENCED" }));
    expect(() => assertApprovalTransition(f.executing, { ...f.succeeded, updatedAt: late }, "lease-execute", true)).toThrow(expect.objectContaining({ code: "GUARD_FENCED" }));
    expect(() => assertApprovalTransition(f.executing, { ...f.succeeded, updatedAt: late, receipt: { ...f.receipt, acknowledgment: "existing_verified" } }, "lease-execute", true)).not.toThrow();
    expect(() => assertApprovalTransition(f.executing, { ...f.uncertain, updatedAt: late }, "lease-execute", true)).not.toThrow();
  });

  it("purges expired private payload without erasing intent/receipt metadata or resurrecting content", () => {
    const f = guardFixture();
    const purged = { ...f.succeeded, version: 5, updatedAt: f.base.expiresAt, payload: null };
    expect(() => assertApprovalTransition(f.succeeded, purged)).not.toThrow();
    expect(() => assertApprovalTransition(f.succeeded, { ...purged, updatedAt: "2026-11-16T00:00:05.000Z" })).toThrow();
    expect(() => assertApprovalTransition(purged, { ...f.succeeded, version: 6, updatedAt: f.base.expiresAt })).toThrow();
  });
});
