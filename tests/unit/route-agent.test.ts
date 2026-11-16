import { afterEach, describe, expect, it, vi } from "vitest";
import manifestJson from "../../fixtures/routing/local-course.v1.json" with { type: "json" };
import policyJson from "../../fixtures/policies/local-course-router.v1.json" with { type: "json" };
import { FixedClock, ScriptedModel, SequenceIdGenerator } from "../../src/adapters/outbound/deterministic-test-adapters.js";
import { Sha256ContentIdentity } from "../../src/adapters/outbound/sha256-content-identity.js";
import { createRegisteredRunAgentUseCase } from "../../src/application/run-registered-agent.js";
import { createRouteAgent, loadRouteManifest, validateRouteExecution } from "../../src/application/route-agent.js";
import type { RouteExecutionPort } from "../../src/application/ports/routing-port.js";
import { GuardPolicySchema } from "../../src/domain/guard-contracts.js";
import { RouteAuditEventSchema, RouteManifestSchema, type RouteAuditEvent, type RouteProfile } from "../../src/domain/routing-contracts.js";
import type { RegisteredAgentEventEnvelope } from "../../src/domain/tool-events.js";
import type { ToolObservation } from "../../src/domain/tool-contracts.js";
import { guardFixture } from "../fixtures/guard.js";

function harness(mode = "success") {
  const manifest = RouteManifestSchema.parse(manifestJson), policy = GuardPolicySchema.parse(policyJson), identity = new Sha256ContentIdentity();
  const journal: RouteAuditEvent[] = [], executions: { profile: RouteProfile; runId: string; events: RegisteredAgentEventEnvelope[] }[] = []; let id = 0;
  const clock = new FixedClock("2026-11-16T00:00:00.000Z");
  const execute = vi.fn<RouteExecutionPort["execute"]>(async (profile, _question, runId, signal) => {
    const f = guardFixture("approval-fixture", runId), events: RegisteredAgentEventEnvelope[] = [];
    executions.push({ profile, runId, events });
    const toolName = profile === "grounded" ? "retrieve_passages" : "search_docs";
    const scripted = new ScriptedModel<ToolObservation>([{ type: "call_tool", toolName, arguments: { query: "private question" } },
      { type: "final_answer", answer: profile === "grounded" ? f.payload.result.answer : "Private lexical answer", sourceIds: ["guide"] }]);
    const generated = new SequenceIdGenerator("routing");
    const run = createRegisteredRunAgentUseCase({ clock, ids: { next: (kind) => kind === "run" ? runId : generated.next(kind) },
      journal: { append: async (event) => { events.push(event); } },
      model: { request: async (request, active) => {
        if (profile === "lexical" && (mode === "first_model" && request.state === "awaiting_tool" || mode === "late_model" && request.state === "awaiting_final")) throw new Error("private model error");
        return scripted.request(request, active);
      } }, tools: { descriptors: () => [], invoke: async () => mode === "tool" ? { ok: false, code: "TOOL_PERMISSION_DENIED" } :
        { ok: true, observation: { toolName, output: {}, sources: f.payload.result.sources } } },
      policy: { timeoutMs: 5000, terminalEvidenceTimeoutMs: 250, maxModelCalls: mode === "budget" ? 0 : 2, maxToolCalls: 1 },
      toolPolicy: { allowedTools: new Set([toolName]), timeoutMs: 100 },
      ...(mode === "policy" ? { checkpoints: { request: async () => false, modelAction: async () => true, toolInvocation: async () => true, toolObservation: async () => true } } : {}),
    });
    const result = await run({ question: _question }, signal);
    return { result: result.ok && profile === "grounded" ? { ...result, grounding: f.payload.result.grounding } : result, events };
  });
  const append = vi.fn(async (event: RouteAuditEvent, signal: AbortSignal) => { signal.throwIfAborted(); journal.push(RouteAuditEventSchema.parse(event)); });
  const route = createRouteAgent({ manifest, policy, identity, clock, ids: { next: (kind) => `${kind}-${++id}` }, executor: { execute }, journal: { append } });
  return { route, append, execute, executions, journal, manifest, policy, identity };
}
afterEach(() => vi.useRealTimers());

describe("evidence-bound invocation-local routing", () => {
  it("selects both existing evidence modes explicitly and defaults to grounded", async () => {
    const h = harness();
    expect(await h.route({ question: "private question" })).toMatchObject({ requestedProfile: "grounded", selectedProfile: "grounded", evidence: "grounded", attempts: [{ modelCalls: 2, toolCalls: 1 }] });
    expect(await h.route({ profile: "lexical", question: "private question" })).toMatchObject({ evidence: "source_reference", attempts: [{ profile: "lexical" }] });
    expect(h.execute.mock.calls.map(([profile]) => profile)).toEqual(["grounded", "lexical"]);
    expect(JSON.stringify(h.journal)).not.toMatch(/private question|Private lexical|Controlled evidence|private model/u);
  });
  it("upgrades only a proven first-model failure, with fresh IDs and aggregate actual 3/1 usage", async () => {
    const h = harness("first_model"), result = await h.route({ profile: "lexical", question: "private question" });
    expect(result).toMatchObject({ evidence: "grounded", selectedProfile: "grounded", attempts: [
      { profile: "lexical", modelCalls: 1, toolCalls: 0, errorCode: "MODEL_FAILURE" }, { profile: "grounded", modelCalls: 2, toolCalls: 1, ok: true },
    ] });
    expect(new Set(result.attempts.map(({ runId }) => runId)).size).toBe(2);
    expect(h.journal.map(({ kind }) => kind)).toEqual(["route.started", "attempt.started", "attempt.completed", "attempt.started", "attempt.completed", "route.completed"]);
    expect(h.journal.at(-1)).toMatchObject({ payload: { attempts: 2, modelCalls: 3, toolCalls: 1 } });
  });
  it.each([ ["late_model", "MODEL_FAILURE"], ["tool", "TOOL_FAILURE"], ["policy", "INVALID_REQUEST"], ["budget", "LIMIT_EXCEEDED"] ])("never retries %s failure", async (mode, code) => {
    const h = harness(mode), result = await h.route({ profile: "lexical", question: "q" });
    expect(result.result).toMatchObject({ ok: false, error: { code } }); expect(h.execute).toHaveBeenCalledTimes(1); expect(result.attempts).toHaveLength(1);
  });
  it("does not downgrade a grounded failure", async () => {
    const h = harness("tool"), result = await h.route({ profile: "grounded", question: "q" });
    expect(result.result.ok).toBe(false); expect(h.execute).toHaveBeenCalledTimes(1); expect(result.selectedProfile).toBe("grounded");
  });
  it.each(["attempt.started", "attempt.completed", "route.completed"] as const)("stops subsequent work/return if required %s evidence fails", async (kind) => {
    const h = harness("first_model"), base = h.append.getMockImplementation()!;
    h.append.mockImplementation(async (event, signal) => { if (event.kind === kind) throw new Error("private disk fault"); return base(event, signal); });
    await expect(h.route({ profile: "lexical", question: "q" })).rejects.toMatchObject({ code: "ROUTE_JOURNAL_FAILURE" });
    expect(h.execute).toHaveBeenCalledTimes(kind === "attempt.started" ? 0 : kind === "attempt.completed" ? 1 : 2);
    expect(JSON.stringify(h.journal)).not.toContain("private disk fault");
  });
  it.each(["caller", "deadline"] as const)("bounds uncooperative execution by %s and ignores late success", async (origin) => {
    vi.useFakeTimers();
    const h = harness(), controller = new AbortController(), finish = Promise.withResolvers<Awaited<ReturnType<RouteExecutionPort["execute"]>>>();
    const original = h.execute.getMockImplementation()!; h.execute.mockImplementation(() => finish.promise);
    const pending = h.route({ profile: "lexical", question: "q" }, controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ code: origin === "caller" ? "ROUTE_CANCELLED" : "ROUTE_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(0);
    if (origin === "caller") controller.abort(); else await vi.advanceTimersByTimeAsync(11000);
    await rejected;
    finish.resolve(await original("lexical", "q", h.execute.mock.calls[0]![2], new AbortController().signal));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.execute).toHaveBeenCalledTimes(1); expect(h.journal.at(-1)?.kind).toBe("route.failed");
  });
  it("rejects corrupted or mismatched first-attempt evidence before any fallback", async () => {
    const h = harness("first_model"), original = h.execute.getMockImplementation()!;
    h.execute.mockImplementation(async (...args) => { const execution = await original(...args); return { ...execution, events: [] }; });
    await expect(h.route({ profile: "lexical", question: "q" })).rejects.toMatchObject({ code: "ROUTE_EVIDENCE_INVALID" });
    expect(h.execute).toHaveBeenCalledTimes(1);
  });
  it("isolates concurrent request IDs, counters, evidence and decisions", async () => {
    const h = harness("first_model"), results = await Promise.all([h.route({ profile: "lexical", question: "one" }), h.route({ profile: "grounded", question: "two" })]);
    expect(results.map(({ attempts }) => attempts.length)).toEqual([2, 1]);
    expect(new Set(results.map(({ routeId }) => routeId)).size).toBe(2);
    expect(new Set(results.flatMap(({ attempts }) => attempts.map(({ runId }) => runId))).size).toBe(3);
    for (const result of results) expect(h.journal.filter(({ routeId }) => routeId === result.routeId).map(({ sequence }) => sequence)).toEqual(result.attempts.length === 2 ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4]);
  });
  it("validates manifest/policy bindings before execution and refuses private request overrides", async () => {
    const h = harness();
    expect(() => loadRouteManifest({ ...h.manifest, policyRevision: "c".repeat(64) }, h.policy, h.identity)).toThrowError(expect.objectContaining({ code: "ROUTE_MANIFEST_INVALID" }));
    await expect(h.route({ profile: "lexical", question: "q", approved: true })).rejects.toMatchObject({ code: "ROUTE_INPUT_INVALID" });
    expect(h.execute).not.toHaveBeenCalled();
  });
  it("checks success action kinds and repeated call correlation independently of schema", async () => {
    const h = harness(); await h.route({ question: "q" });
    const recorded = h.executions[0]!, raw = await h.execute.mock.results[0]!.value;
    const invalid = structuredClone(recorded.events);
    const response = invalid[6];
    if (response?.eventType !== "model.responded") throw new Error("Expected final model event");
    response.payload.callId = invalid[1]!.eventType === "model.requested" ? invalid[1]!.payload.callId : "invalid";
    response.payload.step = 1;
    expect(() => validateRouteExecution({ ...raw, events: invalid }, "grounded", recorded.runId)).toThrowError(expect.objectContaining({ code: "ROUTE_EVIDENCE_INVALID" }));
  });
});
