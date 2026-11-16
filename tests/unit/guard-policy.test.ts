import { describe, expect, it } from "vitest";
import policyJson from "../../fixtures/policies/local-course.v1.json" with { type: "json" };
import { Sha256ContentIdentity } from "../../src/adapters/outbound/sha256-content-identity.js";
import { FixedClock } from "../../src/adapters/outbound/deterministic-test-adapters.js";
import { createGuardCheckpoints, loadGuardPolicy } from "../../src/application/guard-policy.js";
import { GuardAuditEventSchema, GuardPolicyBodySchema, type GuardAuditEvent } from "../../src/domain/guard-contracts.js";

const identity = new Sha256ContentIdentity();
export function testPolicy(change: (body: Omit<typeof policyJson, "revision">) => void = () => {}) {
  const { revision: _revision, ...body } = structuredClone(policyJson);
  change(body);
  const canonical = GuardPolicyBodySchema.parse(body);
  return loadGuardPolicy({ ...canonical, revision: identity.digest(JSON.stringify(canonical)) }, identity);
}
function setup(change?: Parameters<typeof testPolicy>[0]) {
  const events: GuardAuditEvent[] = []; let id = 0;
  const policy = testPolicy(change);
  const checkpoints = createGuardCheckpoints({ policy, identity, clock: new FixedClock("2026-11-16T00:00:00.000Z"),
    ids: { next: () => `operation-${++id}` }, audit: { read: async () => events,
      append: async (draft, signal) => { signal.throwIfAborted(); events.push(GuardAuditEventSchema.parse({ ...draft, sequence: events.length + 1 })); } } });
  return { policy, events, checkpoints, signal: new AbortController().signal };
}
const ctx = { runId: "run-policy", callId: "tool-one", step: 1 };

describe("required-audit host policy checkpoints", () => {
  it("rejects tampered revisions before creating a checkpoint and freezes a detached snapshot", () => {
    expect(() => loadGuardPolicy({ ...policyJson, version: "9.9.9" }, identity)).toThrowError(expect.objectContaining({ code: "GUARD_POLICY_INVALID" }));
    const mutable = structuredClone(policyJson), snapshot = loadGuardPolicy(mutable, identity);
    mutable.tools.allowed.push("export_answer");
    expect(snapshot.tools.allowed).toEqual(["retrieve_passages"]);
    expect(Object.isFrozen(snapshot.tools.allowed)).toBe(true);
    expect(() => snapshot.tools.allowed.push("export_answer")).toThrow();
    expect(loadGuardPolicy(Object.fromEntries(Object.entries(policyJson).reverse()), identity)).toEqual(snapshot);
  });

  it.each(["<<private>>", "<<PRIVATE>>", "＜＜ＰＲＩＶＡＴＥ＞＞"])("denies normalized bounded marker %s without putting content in audit", async (marker) => {
    const { checkpoints, events, signal } = setup();
    expect(await checkpoints.request({ question: `private question ${marker}` }, { runId: ctx.runId }, signal)).toBe(false);
    expect(events[0]).toMatchObject({ kind: "policy.checked", payload: { allowed: false, reason: "INPUT_MARKER_BLOCKED" } });
    expect(JSON.stringify(events)).not.toMatch(/private|PRIVATE|ＰＲＩＶＡＴＥ|question/u);
  });

  it("distinguishes character budgets, output markers, permissions, argument and observation size", async () => {
    const { checkpoints, events, signal } = setup((body) => {
      body.input.maxCharacters = 2; body.output.maxCharacters = 64; body.tools.maxArgumentCharacters = 8; body.tools.maxObservationCharacters = 8;
    });
    expect(await checkpoints.request({ question: "😀" }, { runId: ctx.runId }, signal)).toBe(true);
    expect(await checkpoints.request({ question: "😀x" }, { runId: ctx.runId }, signal)).toBe(false);
    expect(await checkpoints.modelAction({ type: "final_answer", answer: "x".repeat(65), sourceIds: [] }, ctx, signal)).toBe(false);
    expect(await checkpoints.modelAction({ type: "final_answer", answer: "<<PRIVATE>>", sourceIds: [] }, ctx, signal)).toBe(false);
    expect(await checkpoints.toolInvocation({ type: "call_tool", toolName: "export_answer", arguments: {} }, ctx, signal)).toBe(false);
    expect(await checkpoints.toolInvocation({ type: "call_tool", toolName: "retrieve_passages", arguments: { private: "argument" } }, ctx, signal)).toBe(false);
    expect(await checkpoints.toolObservation({ toolName: "retrieve_passages", output: "private document", sources: [] }, ctx, signal)).toBe(false);
    expect(events.map((event) => event.kind === "policy.checked" && event.payload.reason)).toEqual([
      "ALLOWED", "INPUT_TOO_LONG", "MODEL_OUTPUT_TOO_LARGE", "OUTPUT_MARKER_BLOCKED", "TOOL_DENIED", "TOOL_ARGUMENTS_TOO_LARGE", "TOOL_OUTPUT_TOO_LARGE",
    ]);
    expect(JSON.stringify(events)).not.toMatch(/private document|argument|😀/u);
  });

  it("does not allow a value when required audit rejects or returns after cancellation", async () => {
    const controller = new AbortController();
    const common = { policy: testPolicy(), identity, clock: new FixedClock("2026-11-16T00:00:00.000Z"), ids: { next: () => "operation-one" } };
    const broken = createGuardCheckpoints({ ...common, audit: { read: async () => [], append: async () => { throw new Error("private credential"); } } });
    await expect(broken.request({ question: "allowed" }, { runId: ctx.runId }, controller.signal)).rejects.toMatchObject({ code: "GUARD_AUDIT_FAILURE", message: "The guarded operation could not be completed." });
    const cancelled = createGuardCheckpoints({ ...common, audit: { read: async () => [], append: async () => { controller.abort(); } } });
    await expect(cancelled.request({ question: "allowed" }, { runId: ctx.runId }, controller.signal)).rejects.toBeDefined();
  });
});
