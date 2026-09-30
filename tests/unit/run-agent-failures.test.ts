import { describe, expect, it, vi } from "vitest";

import {
  createRunAgentUseCase,
  type RunAgentPolicy,
} from "../../src/application/run-agent.js";
import type { ClockPort } from "../../src/application/ports/clock-port.js";
import type { IdGeneratorPort } from "../../src/application/ports/id-generator-port.js";
import type { JournalPort } from "../../src/application/ports/journal-port.js";
import type { ModelPort, ModelRequest } from "../../src/application/ports/model-port.js";
import type { SearchDocsPort } from "../../src/application/ports/search-docs-port.js";
import type {
  SearchDocsInput,
  SearchDocsOutput,
} from "../../src/domain/agent-contracts.js";
import {
  TERMINAL_EVENT_TYPES,
  type AgentEventEnvelope,
} from "../../src/domain/agent-events.js";

const defaultPolicy: RunAgentPolicy = {
  timeoutMs: 100,
  terminalEvidenceTimeoutMs: 25,
  maxModelCalls: 2,
  maxToolCalls: 1,
};

const searchOutput: SearchDocsOutput = {
  matches: [
    {
      documentId: "agent-loop",
      title: "Agent Loop",
      excerpt: "The loop records ordered evidence.",
      matchedTerms: ["loop"],
    },
  ],
};

const toolAction = {
  type: "call_tool",
  toolName: "search_docs",
  arguments: { query: "agent loop", limit: 3 },
} as const;

const finalAction = {
  type: "final_answer",
  answer: "The loop records ordered evidence.",
  sourceIds: ["agent-loop"],
} as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface HarnessOptions {
  readonly actions?: readonly unknown[];
  readonly modelRequest?: (input: ModelRequest, signal: AbortSignal) => Promise<unknown>;
  readonly search?: (
    input: SearchDocsInput,
    signal: AbortSignal,
  ) => Promise<SearchDocsOutput>;
  readonly append?: (
    event: AgentEventEnvelope,
    signal: AbortSignal,
    appendNumber: number,
  ) => Promise<void>;
  readonly clock?: ClockPort;
  readonly policy?: Partial<RunAgentPolicy>;
}

function createHarness(options: HarnessOptions = {}) {
  const events: AgentEventEnvelope[] = [];
  const attempts: AgentEventEnvelope[] = [];
  const modelRequests: ModelRequest[] = [];
  const searchInputs: SearchDocsInput[] = [];
  const actions = [...(options.actions ?? [toolAction, finalAction])];
  let id = 0;

  const ids: IdGeneratorPort = {
    next: vi.fn((kind) => `${kind}-${++id}`),
  };
  const clock: ClockPort =
    options.clock ??
    ({
      now: vi.fn(() => "2026-01-01T00:00:00.000Z"),
    } satisfies ClockPort);
  const model: ModelPort = {
    request: vi.fn(async (input, signal) => {
      modelRequests.push(structuredClone(input));
      if (options.modelRequest !== undefined) {
        return options.modelRequest(input, signal);
      }
      return actions.shift();
    }),
  };
  const searchDocs: SearchDocsPort = {
    search: vi.fn(async (input, signal) => {
      searchInputs.push(structuredClone(input));
      if (options.search !== undefined) {
        return options.search(input, signal);
      }
      return structuredClone(searchOutput);
    }),
  };
  const journal: JournalPort = {
    append: vi.fn(async (event, signal) => {
      attempts.push(structuredClone(event));
      await options.append?.(event, signal, attempts.length);
      events.push(structuredClone(event));
    }),
  };
  const runAgent = createRunAgentUseCase({
    clock,
    ids,
    journal,
    model,
    searchDocs,
    policy: { ...defaultPolicy, ...options.policy },
  });

  return {
    events,
    attempts,
    model,
    modelRequests,
    runAgent,
    searchDocs,
    searchInputs,
  };
}

function eventTypes(events: readonly AgentEventEnvelope[]) {
  return events.map(({ eventType }) => eventType);
}

function terminalEvents(events: readonly AgentEventEnvelope[]) {
  return events.filter(({ eventType }) =>
    TERMINAL_EVENT_TYPES.includes(
      eventType as (typeof TERMINAL_EVENT_TYPES)[number],
    ),
  );
}

describe("RunAgentUseCase typed failure matrix", () => {
  it("rejects invalid input before model or tool work and records one terminal failure", async () => {
    const harness = createHarness();

    const result = await harness.runAgent({ question: "   " });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST", stage: "request", retryable: false },
    });
    expect(harness.model.request).not.toHaveBeenCalled();
    expect(harness.searchDocs.search).not.toHaveBeenCalled();
    expect(eventTypes(harness.events)).toEqual(["run.failed"]);
    expect(terminalEvents(harness.events)).toHaveLength(1);
  });

  it("normalizes a model exception after counting the attempted call", async () => {
    const harness = createHarness({
      modelRequest: async () => {
        throw new Error("provider secret and stack must not escape");
      },
    });

    const result = await harness.runAgent({ question: "How does the loop work?" });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "MODEL_FAILURE",
        message: "The model could not produce an action.",
        stage: "model",
        retryable: false,
      },
    });
    expect(harness.events.at(-1)).toMatchObject({
      eventType: "run.failed",
      payload: { errorCode: "MODEL_FAILURE", modelCalls: 1, toolCalls: 0 },
    });
  });

  it("maps a malformed model action to INVALID_MODEL_ACTION", async () => {
    const harness = createHarness({ actions: [{ type: "unknown", rawPrompt: "secret" }] });

    const result = await harness.runAgent({ question: "How does the loop work?" });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_MODEL_ACTION", stage: "model" },
    });
    expect(terminalEvents(harness.events)).toHaveLength(1);
  });

  it("rejects a final answer before the search transition", async () => {
    const harness = createHarness({ actions: [finalAction] });

    const result = await harness.runAgent({ question: "How does the loop work?" });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_TRANSITION", stage: "orchestration" },
    });
    expect(harness.searchDocs.search).not.toHaveBeenCalled();
  });

  it("rejects a second tool call without executing a second tool effect", async () => {
    const harness = createHarness({ actions: [toolAction, toolAction] });

    const result = await harness.runAgent({ question: "How does the loop work?" });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_TRANSITION", stage: "orchestration" },
    });
    expect(harness.model.request).toHaveBeenCalledTimes(2);
    expect(harness.searchDocs.search).toHaveBeenCalledTimes(1);
  });

  it("records tool.failed and normalizes a tool exception after counting the attempt", async () => {
    const harness = createHarness({
      actions: [toolAction],
      search: async () => {
        throw new Error("filesystem path and stack must not escape");
      },
    });

    const result = await harness.runAgent({ question: "How does the loop work?" });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "TOOL_FAILURE",
        message: "The search tool failed.",
        stage: "tool",
        retryable: false,
      },
    });
    expect(eventTypes(harness.events)).toEqual([
      "run.started",
      "model.requested",
      "model.responded",
      "tool.requested",
      "tool.failed",
      "run.failed",
    ]);
    expect(harness.events.at(-1)).toMatchObject({
      payload: { modelCalls: 1, toolCalls: 1 },
    });
  });

  it("normalizes a malformed tool result as TOOL_FAILURE", async () => {
    const harness = createHarness({
      actions: [toolAction],
      search: async () => ({ matches: [{ documentId: "unsafe" }] }) as SearchDocsOutput,
    });

    const result = await harness.runAgent({ question: "How does the loop work?" });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "TOOL_FAILURE", stage: "tool" },
    });
    expect(eventTypes(harness.events)).toContain("tool.failed");
  });

  it("rejects invented final source IDs", async () => {
    const harness = createHarness({
      actions: [toolAction, { ...finalAction, sourceIds: ["invented-source"] }],
    });

    const result = await harness.runAgent({ question: "How does the loop work?" });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_TRANSITION", stage: "orchestration" },
    });
    expect(eventTypes(harness.events)).not.toContain("run.succeeded");
  });

  it("enforces the model-call limit before another request", async () => {
    const harness = createHarness({ policy: { maxModelCalls: 0 } });

    const result = await harness.runAgent({ question: "How does the loop work?" });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "LIMIT_EXCEEDED", stage: "model" },
    });
    expect(harness.model.request).not.toHaveBeenCalled();
  });

  it("enforces the tool-call limit before the tool request", async () => {
    const harness = createHarness({
      actions: [toolAction],
      policy: { maxToolCalls: 0 },
    });

    const result = await harness.runAgent({ question: "How does the loop work?" });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "LIMIT_EXCEEDED", stage: "tool" },
    });
    expect(harness.searchDocs.search).not.toHaveBeenCalled();
  });

  it("lets work finishing just before the overall deadline succeed", async () => {
    const harness = createHarness({
      policy: { timeoutMs: 80 },
      modelRequest: async (input) => {
        await sleep(5);
        return input.state === "awaiting_tool" ? toolAction : finalAction;
      },
    });

    const result = await harness.runAgent({ question: "How does the loop work?" });

    expect(result).toMatchObject({ ok: true, usage: { modelCalls: 2, toolCalls: 1 } });
    expect(terminalEvents(harness.events)).toHaveLength(1);
  });

  it("times out work completing at the exact deadline boundary", async () => {
    const harness = createHarness({
      policy: { timeoutMs: 20 },
      modelRequest: async () => {
        await sleep(20);
        return toolAction;
      },
    });

    const result = await harness.runAgent({ question: "How does the loop work?" });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "TIMEOUT", stage: "orchestration", retryable: false },
    });
    expect(harness.searchDocs.search).not.toHaveBeenCalled();
    expect(terminalEvents(harness.events)).toHaveLength(1);
  });

  it("keeps explicit caller cancellation distinct from timeout", async () => {
    const controller = new AbortController();
    const harness = createHarness({
      policy: { timeoutMs: 100 },
      modelRequest: async (_input, signal) => {
        controller.abort(new Error("caller disconnected"));
        signal.throwIfAborted();
        return toolAction;
      },
    });

    const result = await harness.runAgent(
      { question: "How does the loop work?" },
      controller.signal,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "CANCELLED", stage: "orchestration" },
    });
    expect(eventTypes(harness.events).at(-1)).toBe("run.cancelled");
    expect(terminalEvents(harness.events)).toHaveLength(1);
  });

  it("uses an independent non-aborted signal for cancellation terminal evidence", async () => {
    const controller = new AbortController();
    let terminalSignalWasAborted: boolean | undefined;
    const harness = createHarness({
      modelRequest: async (_input, signal) => {
        controller.abort();
        signal.throwIfAborted();
        return toolAction;
      },
      append: async (event, signal) => {
        if (event.eventType === "run.cancelled") {
          terminalSignalWasAborted = signal.aborted;
        }
      },
    });

    const result = await harness.runAgent(
      { question: "How does the loop work?" },
      controller.signal,
    );

    expect(result).toMatchObject({ ok: false, error: { code: "CANCELLED" } });
    expect(terminalSignalWasAborted).toBe(false);
  });

  it("bounds cancellation evidence to the configured cleanup window", async () => {
    const controller = new AbortController();
    const startedAt = performance.now();
    const harness = createHarness({
      policy: { terminalEvidenceTimeoutMs: 25 },
      modelRequest: async (_input, signal) => {
        controller.abort();
        signal.throwIfAborted();
        return toolAction;
      },
      append: async (event, signal) => {
        if (event.eventType !== "run.cancelled") return;
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      },
    });

    const result = await harness.runAgent(
      { question: "How does the loop work?" },
      controller.signal,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "JOURNAL_FAILURE", stage: "journal" },
    });
    expect(performance.now() - startedAt).toBeLessThan(250);
  });

  it("returns JOURNAL_FAILURE and performs no model or tool effect after a rejected append", async () => {
    const harness = createHarness({
      append: async (_event, _signal, appendNumber) => {
        if (appendNumber === 1) throw new Error("disk rejected append");
      },
    });

    const result = await harness.runAgent({ question: "How does the loop work?" });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "JOURNAL_FAILURE", stage: "journal" },
    });
    expect(harness.model.request).not.toHaveBeenCalled();
    expect(harness.searchDocs.search).not.toHaveBeenCalled();
    expect(harness.attempts).toHaveLength(1);
  });

  it("does not call the model when model.requested evidence is rejected", async () => {
    const harness = createHarness({
      append: async (event) => {
        if (event.eventType === "model.requested") throw new Error("append rejected");
      },
    });

    const result = await harness.runAgent({ question: "How does the loop work?" });

    expect(result).toMatchObject({ ok: false, error: { code: "JOURNAL_FAILURE" } });
    expect(harness.model.request).not.toHaveBeenCalled();
    expect(harness.searchDocs.search).not.toHaveBeenCalled();
  });

  it("does not make the second model call when tool observation evidence is rejected", async () => {
    const harness = createHarness({
      append: async (event) => {
        if (event.eventType === "tool.succeeded") throw new Error("append rejected");
      },
    });

    const result = await harness.runAgent({ question: "How does the loop work?" });

    expect(result).toMatchObject({ ok: false, error: { code: "JOURNAL_FAILURE" } });
    expect(harness.model.request).toHaveBeenCalledTimes(1);
    expect(harness.searchDocs.search).toHaveBeenCalledTimes(1);
  });

  it("turns a failed success-terminal append into JOURNAL_FAILURE without a duplicate terminal", async () => {
    const harness = createHarness({
      append: async (event) => {
        if (event.eventType === "run.succeeded") throw new Error("append rejected");
      },
    });

    const result = await harness.runAgent({ question: "How does the loop work?" });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "JOURNAL_FAILURE", stage: "journal" },
    });
    expect(harness.attempts.filter(({ eventType }) => eventType === "run.succeeded")).toHaveLength(1);
    expect(harness.attempts.filter(({ eventType }) => eventType === "run.failed")).toHaveLength(0);
  });

  it("maps an unexpected internal orchestration fault and still writes one terminal event", async () => {
    let clockCalls = 0;
    const harness = createHarness({
      clock: {
        now: () => {
          clockCalls += 1;
          if (clockCalls === 1) throw new Error("unexpected clock failure");
          return "2026-01-01T00:00:00.000Z";
        },
      },
    });

    const result = await harness.runAgent({ question: "How does the loop work?" });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INTERNAL_ERROR", stage: "orchestration" },
    });
    expect(eventTypes(harness.events)).toEqual(["run.failed"]);
  });

  it("isolates concurrent run state, abort causes, sequences, and terminal evidence", async () => {
    const controller = new AbortController();
    const events: AgentEventEnvelope[] = [];
    let id = 0;
    const runAgent = createRunAgentUseCase({
      ids: { next: (kind) => `${kind}-${++id}` },
      clock: { now: () => "2026-01-01T00:00:00.000Z" },
      journal: {
        append: async (event, signal) => {
          signal.throwIfAborted();
          events.push(structuredClone(event));
        },
      },
      model: {
        request: async (input, signal) => {
          if (input.question === "cancel peer") {
            controller.abort();
            signal.throwIfAborted();
          }
          return input.state === "awaiting_tool" ? toolAction : finalAction;
        },
      },
      searchDocs: { search: async () => structuredClone(searchOutput) },
      policy: defaultPolicy,
    });

    const [cancelled, succeeded] = await Promise.all([
      runAgent({ question: "cancel peer" }, controller.signal),
      runAgent({ question: "healthy peer" }),
    ]);

    expect(cancelled).toMatchObject({ ok: false, error: { code: "CANCELLED" } });
    expect(succeeded).toMatchObject({ ok: true });
    expect(cancelled.runId).not.toBe(succeeded.runId);
    for (const runId of [cancelled.runId, succeeded.runId]) {
      const runEvents = events.filter((event) => event.runId === runId);
      expect(runEvents.map(({ sequence }) => sequence)).toEqual(
        runEvents.map((_, index) => index + 1),
      );
      expect(terminalEvents(runEvents)).toHaveLength(1);
    }
  });
});
