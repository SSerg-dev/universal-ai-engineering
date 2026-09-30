import { describe, expect, it, vi } from "vitest";

import { createRunAgentUseCase } from "../../src/application/run-agent.js";
import type { ClockPort } from "../../src/application/ports/clock-port.js";
import type { IdGeneratorPort } from "../../src/application/ports/id-generator-port.js";
import type { JournalPort } from "../../src/application/ports/journal-port.js";
import type { ModelPort } from "../../src/application/ports/model-port.js";
import type { SearchDocsPort } from "../../src/application/ports/search-docs-port.js";

const policy = {
  timeoutMs: 5000,
  terminalEvidenceTimeoutMs: 250,
  maxModelCalls: 2,
  maxToolCalls: 1,
} as const;

function deterministicPorts(options?: { sourceIds?: string[] }) {
  const returnedSourceIds = options?.sourceIds ?? ["agentic-os"];
  const actions: unknown[] = [
    {
      type: "call_tool",
      toolName: "search_docs",
      arguments: { query: "agent loop journal", limit: 3 },
    },
    {
      type: "final_answer",
      answer: "The journal preserves ordered evidence for the agent loop.",
      sourceIds: returnedSourceIds,
    },
  ];

  const model: ModelPort = {
    request: vi.fn(async () => actions.shift()),
  };
  const searchDocs: SearchDocsPort = {
    search: vi.fn(async () => ({
      matches: [
        {
          documentId: "agentic-os",
          title: "Agentic OS",
          excerpt: "The loop records ordered execution evidence.",
          matchedTerms: ["agent", "loop", "journal"],
        },
      ],
    })),
  };
  const journal: JournalPort = {
    append: vi.fn(async () => undefined),
  };
  const occurredAt = [
    "2026-01-01T00:00:00.000Z",
    "2026-01-01T00:00:00.010Z",
    "2026-01-01T00:00:00.020Z",
    "2026-01-01T00:00:00.030Z",
    "2026-01-01T00:00:00.040Z",
    "2026-01-01T00:00:00.050Z",
    "2026-01-01T00:00:00.060Z",
    "2026-01-01T00:00:00.070Z",
  ];
  const clock: ClockPort = {
    now: vi.fn(() => occurredAt.shift() ?? "2026-01-01T00:00:00.070Z"),
  };
  let id = 0;
  const ids: IdGeneratorPort = {
    next: vi.fn((kind) => `${kind}-${++id}`),
  };

  return { clock, ids, journal, model, searchDocs };
}

describe("RunAgentUseCase happy state machine", () => {
  it("moves awaiting_tool to awaiting_final with exactly 2/1 calls and eight events", async () => {
    const ports = deterministicPorts();
    const runAgent = createRunAgentUseCase({ ...ports, policy });

    const result = await runAgent({ question: "How does the agent journal work?" });

    expect(result).toEqual({
      ok: true,
      runId: "run-1",
      answer: "The journal preserves ordered evidence for the agent loop.",
      sources: [{ documentId: "agentic-os", title: "Agentic OS" }],
      usage: { modelCalls: 2, toolCalls: 1 },
    });
    expect(ports.model.request).toHaveBeenCalledTimes(2);
    expect(ports.searchDocs.search).toHaveBeenCalledTimes(1);

    const eventTypes = vi.mocked(ports.journal.append).mock.calls.map(
      ([event]) => event.eventType,
    );
    expect(eventTypes).toEqual([
      "run.started",
      "model.requested",
      "model.responded",
      "tool.requested",
      "tool.succeeded",
      "model.requested",
      "model.responded",
      "run.succeeded",
    ]);
    expect(eventTypes).toHaveLength(8);
  });

  it("rejects a final answer whose source IDs are not a subset of search results", async () => {
    const ports = deterministicPorts({ sourceIds: ["agentic-os", "invented-source"] });
    const runAgent = createRunAgentUseCase({ ...ports, policy });

    const result = await runAgent({ question: "How does the agent journal work?" });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_TRANSITION", stage: "orchestration" },
    });
    expect(ports.model.request).toHaveBeenCalledTimes(2);
    expect(ports.searchDocs.search).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(ports.journal.append).mock.calls.some(
        ([event]) => event.eventType === "run.succeeded",
      ),
    ).toBe(false);
  });
});
