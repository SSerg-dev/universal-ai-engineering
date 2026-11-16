import { afterEach, describe, expect, it, vi } from "vitest";
import { FixedClock, ScriptedModel, SequenceIdGenerator } from "../../src/adapters/outbound/deterministic-test-adapters.js";
import { createRegisteredRunAgentUseCase } from "../../src/application/run-registered-agent.js";
import type { RunCheckpointsPort } from "../../src/application/ports/run-checkpoints-port.js";
import type { ToolObservation } from "../../src/domain/tool-contracts.js";
import { RegisteredAgentEventEnvelopeSchema, type RegisteredAgentEventEnvelope } from "../../src/domain/tool-events.js";

const call = { type: "call_tool", toolName: "retrieve_passages", arguments: { query: "question" } };
const final = { type: "final_answer", answer: "Private answer", sourceIds: [] };
const allow = (): RunCheckpointsPort<ToolObservation> => ({ request: vi.fn(async () => true), modelAction: vi.fn(async () => true),
  toolInvocation: vi.fn(async () => true), toolObservation: vi.fn(async () => true) });
function harness(checkpoints?: RunCheckpointsPort<ToolObservation>, budget = { maxModelCalls: 2, maxToolCalls: 1 }) {
  const events: RegisteredAgentEventEnvelope[] = [];
  const model = new ScriptedModel<ToolObservation>([call, final]);
  const invoke = vi.fn(async () => ({ ok: true as const, observation: { toolName: "retrieve_passages", output: { passages: [] }, sources: [] } }));
  const run = createRegisteredRunAgentUseCase({ model, tools: { invoke, descriptors: () => [] }, ids: new SequenceIdGenerator("guard"),
    clock: new FixedClock("2026-11-16T00:00:00.000Z"),
    journal: { append: async (event) => { events.push(RegisteredAgentEventEnvelopeSchema.parse(event)); } },
    policy: { timeoutMs: 100, terminalEvidenceTimeoutMs: 250, ...budget },
    toolPolicy: { allowedTools: new Set(["retrieve_passages"]), timeoutMs: 50 }, ...(checkpoints ? { checkpoints } : {}) });
  return { run, events, invoke, model };
}
afterEach(() => vi.useRealTimers());

describe("shared-loop guard checkpoints", () => {
  it("retains the original event grammar with no port and correlates the four boundaries when enabled", async () => {
    const plain = harness(); expect(await plain.run({ question: "q" })).toMatchObject({ ok: true });
    const checkpoints = allow(), guarded = harness(checkpoints);
    expect(await guarded.run({ question: "q" })).toMatchObject({ ok: true, usage: { modelCalls: 2, toolCalls: 1 } });
    expect(guarded.events).toEqual(plain.events);
    expect(checkpoints.request).toHaveBeenCalledWith({ question: "q" }, { runId: guarded.events[0]?.runId }, expect.any(AbortSignal));
    for (const boundary of ["modelAction", "toolInvocation", "toolObservation"] as const) {
      const requested = guarded.events.find((event) => event.eventType === (boundary === "modelAction" ? "model.requested" : "tool.requested"));
      const payload = requested?.payload as { callId: string; step: number };
      expect(checkpoints[boundary]).toHaveBeenCalledWith(expect.anything(), { runId: requested?.runId, callId: payload.callId, step: payload.step }, expect.any(AbortSignal));
    }
  });

  it.each([
    ["request", "INVALID_REQUEST", 0, 0], ["modelAction", "INVALID_MODEL_ACTION", 1, 0],
    ["toolInvocation", "TOOL_FAILURE", 1, 0], ["toolObservation", "TOOL_FAILURE", 1, 1],
  ] as const)("denied %s stops subsequent work", async (boundary, code, modelCalls, toolCalls) => {
    const checkpoints = allow(); checkpoints[boundary] = vi.fn(async () => false);
    const { run, model, invoke, events } = harness(checkpoints);
    expect(await run({ question: "private question" })).toMatchObject({ ok: false, error: { code } });
    expect(model.requests()).toHaveLength(modelCalls); expect(invoke).toHaveBeenCalledTimes(toolCalls);
    expect(events.at(-1)?.eventType).toBe("run.failed");
    expect(events.some((event) => event.eventType === "run.succeeded")).toBe(false);
    if (boundary.startsWith("tool")) expect(events.find((event) => event.eventType === "tool.failed")?.payload).toMatchObject({
      toolErrorCode: boundary === "toolInvocation" ? "TOOL_PERMISSION_DENIED" : "TOOL_OUTPUT_INVALID",
    });
    expect(JSON.stringify(events)).not.toMatch(/private question|Private answer/u);
  });

  it.each(["request", "modelAction", "toolInvocation", "toolObservation"] as const)("failed %s audit fails closed with the unchanged public internal code", async (boundary) => {
    const checkpoints = allow(); checkpoints[boundary] = vi.fn(async () => { throw new Error("private audit error"); });
    const { run, model, invoke, events } = harness(checkpoints);
    expect(await run({ question: "q" })).toMatchObject({ ok: false, error: { code: "INTERNAL_ERROR", stage: "orchestration" } });
    expect(model.requests()).toHaveLength(boundary === "request" ? 0 : 1);
    expect(invoke).toHaveBeenCalledTimes(boundary === "toolObservation" ? 1 : 0);
    expect(JSON.stringify(events)).not.toContain("private audit error");
  });

  it("refuses a truthy malformed acknowledgment", async () => {
    const checkpoints = allow(); checkpoints.request = async () => "approved" as unknown as boolean;
    const { run, model } = harness(checkpoints);
    expect(await run({ question: "q" })).toMatchObject({ ok: false, error: { code: "INTERNAL_ERROR" } });
    expect(model.requests()).toHaveLength(0);
  });

  it.each(["caller", "deadline"] as const)("bounds an uncooperative audit by %s cancellation and ignores its late success", async (source) => {
    vi.useFakeTimers();
    const checkpoints = allow(); let resolveAudit!: (value: boolean) => void;
    checkpoints.request = () => new Promise((resolve) => { resolveAudit = resolve; });
    const { run, invoke, model, events } = harness(checkpoints), controller = new AbortController();
    const result = run({ question: "q" }, controller.signal);
    await vi.advanceTimersByTimeAsync(0);
    if (source === "caller") controller.abort(); else await vi.advanceTimersByTimeAsync(100);
    expect(await result).toMatchObject({ ok: false, error: { code: source === "caller" ? "CANCELLED" : "TIMEOUT" } });
    resolveAudit(true); await vi.advanceTimersByTimeAsync(0);
    expect(model.requests()).toHaveLength(0); expect(invoke).not.toHaveBeenCalled(); expect(events).toHaveLength(1);
  });

  it.each([{ maxModelCalls: 0, maxToolCalls: 1 }, { maxModelCalls: 2, maxToolCalls: 0 }])("preserves actual call budgets $maxModelCalls/$maxToolCalls", async (budget) => {
    const { run, model, invoke, events } = harness(allow(), budget);
    expect(await run({ question: "q" })).toMatchObject({ ok: false, error: { code: "LIMIT_EXCEEDED" } });
    expect(model.requests()).toHaveLength(budget.maxModelCalls === 0 ? 0 : 1); expect(invoke).not.toHaveBeenCalled();
    expect(events.at(-1)?.payload).toMatchObject({ modelCalls: model.requests().length, toolCalls: 0 });
  });
});
