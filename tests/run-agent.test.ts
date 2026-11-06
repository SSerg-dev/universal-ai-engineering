import { describe, expect, it, vi } from "vitest";
import { createReferenceRun } from "../src/composition/reference-run.js";
import { fixtureTool } from "../src/adapters/fixture-tool.js";
import { referenceModel } from "../src/adapters/reference-model.js";
import { runAgent } from "../src/application/run-agent.js";
import type { RunEvent } from "../src/domain/contracts.js";
import { runEventSchema } from "../src/domain/contracts.js";

const input = { question: "How do I check the installed Node.js version?" };
const callTool = { kind: "call_tool", arguments: {} };
const answer = { kind: "answer", text: "Run node --version." };

function harness() {
  const events: RunEvent[] = [];
  const model = vi.fn(referenceModel.nextAction);
  const tool = vi.fn(fixtureTool.execute);
  const append = vi.fn(async (event: RunEvent) => { events.push(event); });
  const ports = {
    model: { nextAction: model },
    tool: { execute: tool },
    journal: { append },
    createRunId: () => "run-1",
    now: () => new Date("2026-11-06T00:00:00Z"),
  };
  return { events, model, tool, append, ports };
}

function pendingEffect() {
  let resolve!: (value: unknown) => void;
  let started!: (signal: AbortSignal) => void;
  const invoked = new Promise<AbortSignal>((notify) => { started = notify; });
  const result = new Promise<unknown>((complete) => { resolve = complete; });
  return { invoked, result, resolve, started };
}

describe("typed agent loop", () => {
  it("answers through the production composition with the local fixture", async () => {
    const { append, events } = harness();
    const run = createReferenceRun({ append });
    const result = await run(input);

    expect(result).toMatchObject({ ...answer, kind: "answered", journalStatus: "complete" });
    expect(events.map(({ eventType }) => eventType)).toEqual([
      "run_started", "model_requested", "model_responded", "tool_started",
      "tool_observed", "model_requested", "model_responded", "run_answered",
    ]);
    expect(events.every((event) => runEventSchema.safeParse(event).success)).toBe(true);
    expect(new Set(events.map(({ runId }) => runId)).size).toBe(1);
    expect(events.map(({ seq }) => seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("passes the observed section back to the same model and calls the tool once", async () => {
    const { ports, model, tool } = harness();
    expect(await runAgent(input, ports)).toMatchObject({ kind: "answered", text: answer.text });
    expect(model).toHaveBeenCalledTimes(2);
    expect(model).toHaveBeenNthCalledWith(2, {
      question: input.question,
      observation: { text: "node --version" },
    }, expect.any(AbortSignal));
    expect(tool).toHaveBeenCalledExactlyOnceWith({}, expect.any(AbortSignal));
  });

  it("rejects invalid input before starting a run", async () => {
    const { ports, events, model, tool } = harness();
    expect(await runAgent({ question: "  " }, ports)).toEqual({
      kind: "failed", code: "INVALID_INPUT",
    });
    expect(model).not.toHaveBeenCalled();
    expect(tool).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it.each([
    { action: { kind: "unexpected" }, code: "INVALID_MODEL_ACTION" },
    { action: { ...callTool, arguments: { section: "other" } }, code: "INVALID_TOOL_INPUT" },
    { action: answer, code: "TOOL_REQUIRED" },
  ])("returns $code without invoking the tool", async ({ action, code }) => {
    const { ports, events, model, tool } = harness();
    model.mockResolvedValueOnce(action);

    expect(await runAgent(input, ports)).toMatchObject({ kind: "failed", code });
    expect(model).toHaveBeenCalledTimes(1);
    expect(tool).not.toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({ eventType: "run_failed", code });
  });

  it("rejects a second tool request before invoking it", async () => {
    const { ports, model, tool } = harness();
    model.mockResolvedValue(callTool);

    expect(await runAgent(input, ports)).toMatchObject({
      kind: "failed", code: "TOOL_ALREADY_CALLED",
    });
    expect(model).toHaveBeenCalledTimes(2);
    expect(tool).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid observation before the second model request", async () => {
    const { ports, model, tool } = harness();
    tool.mockResolvedValueOnce({ text: "" });

    expect(await runAgent(input, ports)).toMatchObject({
      kind: "failed", code: "INVALID_TOOL_OUTPUT",
    });
    expect(model).toHaveBeenCalledTimes(1);
    expect(tool).toHaveBeenCalledTimes(1);
  });

  it.each(["model", "tool"] as const)("normalizes a %s failure", async (effect) => {
    const { ports, model, tool, events } = harness();
    const sensitive = "raw exception text";
    const code = effect === "model" ? "MODEL_FAILED" : "TOOL_FAILED";
    (effect === "model" ? model : tool).mockRejectedValueOnce(new Error(sensitive));

    expect(await runAgent(input, ports)).toMatchObject({ kind: "failed", code });
    expect(model).toHaveBeenCalledTimes(1);
    expect(tool).toHaveBeenCalledTimes(effect === "model" ? 0 : 1);
    expect(events.at(-1)).toMatchObject({ eventType: "run_failed", code });
    expect(JSON.stringify(events)).not.toContain(sensitive);
  });

  it("enforces the step budget before requesting another model action", async () => {
    const { ports, model, tool } = harness();
    expect(await runAgent(input, ports, { maxSteps: 1 })).toMatchObject({
      kind: "failed", code: "LIMIT_EXCEEDED",
    });
    expect(model).toHaveBeenCalledTimes(1);
    expect(tool).toHaveBeenCalledTimes(1);
  });

  it("does not invoke a port if the caller already cancelled", async () => {
    const { ports, model, tool } = harness();
    expect(await runAgent(input, ports, { signal: AbortSignal.abort() })).toMatchObject({
      kind: "failed", code: "CANCELLED",
    });
    expect(model).not.toHaveBeenCalled();
    expect(tool).not.toHaveBeenCalled();
  });

  it.each(["CANCELLED", "TIMEOUT"] as const)(
    "keeps %s when it wins the race against a pending tool",
    async (code) => {
      vi.useFakeTimers();
      try {
        const { ports, events, model, tool } = harness();
        const caller = new AbortController();
        const effect = pendingEffect();
        tool.mockImplementationOnce(async (_arguments, signal) => {
          effect.started(signal);
          return effect.result;
        });

        const run = runAgent(input, ports, { signal: caller.signal, timeoutMs: 10 });
        const toolSignal = await effect.invoked;
        if (code === "CANCELLED") {
          caller.abort();
          vi.advanceTimersByTime(10);
        } else {
          vi.advanceTimersByTime(10);
          caller.abort();
        }

        expect(await run).toMatchObject({ kind: "failed", code });
        expect(toolSignal.aborted).toBe(true);
        effect.resolve({ text: "late observation" });
        await effect.result;

        expect(model).toHaveBeenCalledTimes(1);
        expect(tool).toHaveBeenCalledTimes(1);
        expect(events.filter(({ eventType }) => eventType.startsWith("run_"))).toEqual([
          expect.objectContaining({ eventType: "run_started" }),
          expect.objectContaining({ eventType: "run_failed", code }),
        ]);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("times out a pending model and ignores its late tool request", async () => {
    vi.useFakeTimers();
    try {
      const { ports, model, tool } = harness();
      const effect = pendingEffect();
      model.mockImplementationOnce(async (_context, signal) => {
        effect.started(signal);
        return effect.result;
      });
      const run = runAgent(input, ports, { timeoutMs: 10 });

      expect((await effect.invoked).aborted).toBe(false);
      vi.advanceTimersByTime(10);
      expect(await run).toMatchObject({ kind: "failed", code: "TIMEOUT" });
      effect.resolve(callTool);
      await effect.result;
      expect(tool).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the answer and stops appending after a journal write fails", async () => {
    const { ports, append, events } = harness();
    append.mockRejectedValueOnce(new Error("journal unavailable"));

    expect(await runAgent(input, ports)).toMatchObject({
      kind: "answered", text: answer.text, journalStatus: "incomplete",
    });
    expect(append).toHaveBeenCalledTimes(1);
    expect(events).toEqual([]);
  });
});
