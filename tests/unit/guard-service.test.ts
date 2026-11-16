import { afterEach, describe, expect, it, vi } from "vitest";
import policyJson from "../../fixtures/policies/local-course.v1.json" with { type: "json" };
import { Sha256ContentIdentity } from "../../src/adapters/outbound/sha256-content-identity.js";
import { createGuardService } from "../../src/application/guard-service.js";
import { GuardBoundaryError, GuardPolicyBodySchema, GuardPolicySchema, type ApprovalView, type ExportReceipt } from "../../src/domain/guard-contracts.js";
import { FakeApprovalStore } from "../fixtures/fake-approval-store.js";
import { guardFixture } from "../fixtures/guard.js";

function harness(change?: (body: Omit<typeof policyJson, "revision">) => void) {
  const repository = new FakeApprovalStore(), identity = new Sha256ContentIdentity();
  const { revision: _revision, ...body } = structuredClone(policyJson); change?.(body);
  const canonical = GuardPolicyBodySchema.parse(body), policy = GuardPolicySchema.parse({ ...canonical, revision: identity.digest(JSON.stringify(canonical)) });
  let time = Date.parse("2026-11-16T00:00:00.000Z"), counter = 0, artifact: ExportReceipt | null = null;
  const clock = { now: () => new Date(time).toISOString() }, ids = { next: (kind: string) => `${kind}-${++counter}` };
  const answer = vi.fn(async (_question: string, runId: string, _signal: AbortSignal) => guardFixture("approval-fixture", runId).payload.result);
  const publish = vi.fn(async (input: { approvalId: string; runId: string; contentDigest: string; contentBytes: number }, _signal: AbortSignal): Promise<ExportReceipt> => {
    const { approvalId, runId, contentDigest, contentBytes } = input;
    artifact = { approvalId, runId, contentDigest, contentBytes, destinationId: "local-export", filename: `${approvalId}.md`, observedAt: clock.now(), acknowledgment: "published" };
    return artifact;
  });
  const inspect = vi.fn(async (_input: unknown, _signal: AbortSignal) => artifact ? { ...artifact, observedAt: clock.now(), acknowledgment: "existing_verified" as const } : null);
  const service = (selected = policy) => createGuardService({ policy: selected, identity, clock, ids, store: repository, audit: repository,
    answer: { execute: answer }, exporter: { publish, inspect } });
  const command = service().command;
  const prepare = async (requestId = "request-one", question = "private question") => (await command({ operation: "prepare_export", requestId, question })).value as ApprovalView;
  return { repository, identity, policy, service, command, prepare, answer, publish, inspect, advance: (ms: number) => { time += ms; } };
}
const decision = (operation: string, view: ApprovalView) => ({ operation, approvalId: view.approvalId, expectedVersion: view.version, proposalDigest: view.proposalDigest });
const asView = (result: { value: unknown }) => result.value as ApprovalView;
afterEach(() => vi.useRealTimers());

describe("explicit resumable guarded export commands", () => {
  it("prepares once, requires a separate approval, resumes from a fresh service and publishes once", async () => {
    const h = harness(), pending = await h.prepare();
    expect(pending).toMatchObject({ state: "pending", version: 1 });
    expect(await h.prepare()).toEqual(pending); expect(h.answer).toHaveBeenCalledTimes(1);
    await expect(h.command(decision("execute", pending))).rejects.toMatchObject({ code: "GUARD_APPROVAL_REQUIRED" });
    expect(h.publish).not.toHaveBeenCalled();
    const approved = asView(await h.command(decision("approve", pending)));
    const succeeded = asView(await h.service().command(decision("execute", approved)));
    expect(succeeded).toMatchObject({ state: "succeeded", version: 4 });
    expect(h.answer).toHaveBeenCalledTimes(1); expect(h.publish).toHaveBeenCalledTimes(1);
    expect(asView(await h.service().command({ operation: "read", approvalId: pending.approvalId }))).toEqual(succeeded);
    await expect(h.command(decision("execute", approved))).rejects.toMatchObject({ code: "GUARD_VERSION_CONFLICT" });
    expect(h.publish).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(succeeded)).not.toMatch(/lease-|inputDigest|private question/u);
    const audit = await h.command({ operation: "audit", scopeId: pending.approvalId });
    expect(JSON.stringify(audit)).not.toMatch(/private question|Controlled evidence|lease-/u);
  });

  it("rejects self-approval flags, unknown paths and reused request input before another question", async () => {
    const h = harness();
    await expect(h.command({ operation: "prepare_export", requestId: "request-one", question: "private question", approved: true })).rejects.toMatchObject({ code: "GUARD_INPUT_INVALID" });
    expect(h.answer).not.toHaveBeenCalled();
    const pending = await h.prepare();
    await expect(h.prepare("request-one", "changed private question")).rejects.toMatchObject({ code: "GUARD_REQUEST_REUSED" });
    await expect(h.command({ ...decision("approve", pending), path: "outside" })).rejects.toMatchObject({ code: "GUARD_INPUT_INVALID" });
    expect(h.answer).toHaveBeenCalledTimes(1); expect(h.publish).not.toHaveBeenCalled();
  });

  it("binds decisions to exact digest and version and records explicit denial", async () => {
    const h = harness(), pending = await h.prepare();
    await expect(h.command({ ...decision("approve", pending), proposalDigest: "c".repeat(64) })).rejects.toMatchObject({ code: "GUARD_DIGEST_MISMATCH" });
    await expect(h.command({ ...decision("approve", pending), expectedVersion: 0 })).rejects.toMatchObject({ code: "GUARD_VERSION_CONFLICT" });
    const denied = asView(await h.command(decision("deny", pending)));
    expect(denied).toMatchObject({ state: "denied", code: "GUARD_DENIED" });
    await expect(h.command(decision("execute", denied))).rejects.toMatchObject({ code: "GUARD_DENIED" });
    expect(h.publish).not.toHaveBeenCalled();
  });

  it("invalidates unexecuted proposals after a policy revision change", async () => {
    const h = harness(), pending = await h.prepare(), { revision: _revision, ...body } = h.policy;
    body.version = "1.0.1";
    const policy = GuardPolicySchema.parse({ ...body, revision: h.identity.digest(JSON.stringify(GuardPolicyBodySchema.parse(body))) });
    const fresh = h.service(policy);
    await expect(fresh.command(decision("approve", pending))).rejects.toMatchObject({ code: "GUARD_POLICY_CHANGED" });
    expect(asView(await fresh.command({ operation: "read", approvalId: pending.approvalId }))).toMatchObject({ state: "denied", code: "GUARD_POLICY_CHANGED" });
    expect(h.publish).not.toHaveBeenCalled(); expect(h.answer).toHaveBeenCalledTimes(1);
  });

  it("does not rerun an active duplicate preparation", async () => {
    const h = harness(), started = Promise.withResolvers<void>(), finish = Promise.withResolvers<void>();
    h.answer.mockImplementation(async (_question, runId) => { started.resolve(); await finish.promise; return guardFixture("approval-fixture", runId).payload.result; });
    const first = h.prepare(); await started.promise;
    expect(await h.prepare()).toMatchObject({ state: "preparing", version: 0 });
    expect(h.answer).toHaveBeenCalledTimes(1); finish.resolve(); expect(await first).toMatchObject({ state: "pending" });
  });

  it("requires acknowledged transactional approval before claiming any effect", async () => {
    const h = harness(), pending = await h.prepare(); h.repository.rejectCode = "OPERATOR_APPROVED";
    await expect(h.command(decision("approve", pending))).rejects.toMatchObject({ code: "GUARD_AUDIT_FAILURE" });
    expect(h.repository.snapshots.get(pending.approvalId)).toMatchObject({ state: "pending", version: 1 });
    expect(h.publish).not.toHaveBeenCalled();
  });

  it("keeps lost publication acknowledgments uncertain and reconciles only positive existing evidence", async () => {
    const h = harness(), pending = await h.prepare(), approved = asView(await h.command(decision("approve", pending)));
    const original = h.publish.getMockImplementation()!;
    h.publish.mockImplementation(async (input, signal) => { await original(input, signal); throw new GuardBoundaryError("GUARD_EXPORT_FAILURE"); });
    await expect(h.command(decision("execute", approved))).rejects.toMatchObject({ code: "GUARD_UNCERTAIN" });
    const uncertain = asView(await h.command({ operation: "read", approvalId: pending.approvalId }));
    expect(uncertain).toMatchObject({ state: "uncertain", version: 4 });
    await expect(h.command(decision("execute", uncertain))).rejects.toMatchObject({ code: "GUARD_UNCERTAIN" });
    h.inspect.mockResolvedValueOnce(null);
    expect(asView(await h.command(decision("reconcile", uncertain)))).toEqual(uncertain);
    expect(asView(await h.command(decision("reconcile", uncertain)))).toMatchObject({ state: "succeeded", receipt: { acknowledgment: "existing_verified" } });
    expect(h.publish).toHaveBeenCalledTimes(1); expect(h.answer).toHaveBeenCalledTimes(1);
  });

  it("records uncertainty after cancellation during uncooperative publication and ignores late success", async () => {
    const h = harness(), pending = await h.prepare(), approved = asView(await h.command(decision("approve", pending)));
    const started = Promise.withResolvers<void>(), finish = Promise.withResolvers<ExportReceipt>();
    h.publish.mockImplementation(async () => { started.resolve(); return finish.promise; });
    const controller = new AbortController(), result = h.command(decision("execute", approved), controller.signal);
    await started.promise; controller.abort();
    await expect(result).rejects.toMatchObject({ code: "GUARD_UNCERTAIN" });
    const uncertain = asView(await h.command({ operation: "read", approvalId: pending.approvalId }));
    expect(uncertain.state).toBe("uncertain");
    finish.resolve({ ...guardFixture(pending.approvalId, pending.runId).receipt }); await Promise.resolve();
    expect(asView(await h.command({ operation: "read", approvalId: pending.approvalId }))).toEqual(uncertain);
    expect(h.publish).toHaveBeenCalledTimes(1);
  });

  it("expires proposals and prunes private payloads without publishing", async () => {
    const h = harness(), pending = await h.prepare(); h.advance(300_000);
    const expired = asView(await h.command({ operation: "read", approvalId: pending.approvalId }));
    expect(expired).toMatchObject({ state: "expired", payload: null });
    await expect(h.command(decision("approve", expired))).rejects.toMatchObject({ code: "GUARD_EXPIRED" });
    expect(h.publish).not.toHaveBeenCalled();
  });

  it("recovers interrupted preparation without rerunning its question", async () => {
    const h = harness(), f = guardFixture(); h.repository.snapshots.set(f.preparing.approvalId, f.preparing);
    h.advance(16_000);
    expect(asView(await h.command({ operation: "read", approvalId: f.preparing.approvalId }))).toMatchObject({ state: "preparation_failed", payload: null });
    expect(await h.prepare()).toMatchObject({ state: "preparation_failed" });
    expect(h.answer).not.toHaveBeenCalled(); expect(h.publish).not.toHaveBeenCalled();
  });

  it("bounds an uncooperative publisher by the action deadline", async () => {
    vi.useFakeTimers();
    const h = harness(), pending = await h.prepare(), approved = asView(await h.command(decision("approve", pending)));
    h.publish.mockImplementation(() => new Promise(() => {}));
    const result = h.command(decision("execute", approved));
    const rejected = expect(result).rejects.toMatchObject({ code: "GUARD_UNCERTAIN" });
    await vi.advanceTimersByTimeAsync(5000); await rejected;
    expect(h.repository.snapshots.get(pending.approvalId)?.state).toBe("uncertain");
    expect(h.publish).toHaveBeenCalledTimes(1);
  });

  it("enforces capacity and export bytes and keeps failed preparation non-replayable", async () => {
    const h = harness((body) => { body.approval.maxPending = 1; }), pending = await h.prepare();
    await expect(h.prepare("request-two")).rejects.toMatchObject({ code: "GUARD_CAPACITY_EXCEEDED" });
    expect(h.answer).toHaveBeenCalledTimes(1);
    await h.command(decision("deny", pending)); expect(await h.prepare("request-two")).toMatchObject({ state: "pending" });
    const limited = harness((body) => { body.approval.maxExportBytes = 1; });
    await expect(limited.prepare()).rejects.toMatchObject({ code: "GUARD_EXPORT_LIMIT" });
    expect(await limited.prepare()).toMatchObject({ state: "preparation_failed", code: "GUARD_EXPORT_LIMIT" });
    expect(limited.answer).toHaveBeenCalledTimes(1); expect(limited.publish).not.toHaveBeenCalled();
  });
});
