import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { createRunAgentUseCase } from "../../src/application/run-agent.js";
import type { ModelPort } from "../../src/application/ports/model-port.js";
import type { AgentEventEnvelope } from "../../src/domain/agent-events.js";

async function loadMarkdownSearchDocs() {
  const adapterModule = await import(
    "../../src/adapters/outbound/markdown-search-docs.js"
  ).catch(() => undefined);

  expect(
    adapterModule?.MarkdownSearchDocs,
    "MarkdownSearchDocs should load the controlled Markdown corpus",
  ).toBeTypeOf("function");

  return adapterModule!.MarkdownSearchDocs;
}

describe("Iteration 1 teaching scenario", () => {
  it("shows question → real Markdown search → answer with stable source references", async () => {
    const MarkdownSearchDocs = await loadMarkdownSearchDocs();
    const fixtureRoot = fileURLToPath(new URL("../../fixtures/docs", import.meta.url));
    const searchDocs = await MarkdownSearchDocs.load({ root: fixtureRoot });
    const events: AgentEventEnvelope[] = [];
    const model: ModelPort = {
      async request(input, signal) {
        signal.throwIfAborted();
        if (input.state === "awaiting_tool") {
          return {
            type: "call_tool",
            toolName: "search_docs",
            arguments: { query: input.question, limit: 2 },
          };
        }

        return {
          type: "final_answer",
          answer: "The typed loop awaits every journal event around model and tool effects.",
          sourceIds: input.toolResult.matches.map(({ documentId }) => documentId),
        };
      },
    };
    let id = 0;
    const runAgent = createRunAgentUseCase({
      model,
      searchDocs,
      journal: {
        async append(event, signal) {
          signal.throwIfAborted();
          events.push(event);
        },
      },
      clock: { now: () => "2026-01-01T00:00:00.000Z" },
      ids: { next: (kind) => `${kind}-${++id}` },
      policy: {
        timeoutMs: 5000,
        terminalEvidenceTimeoutMs: 250,
        maxModelCalls: 2,
        maxToolCalls: 1,
      },
    });

    const result = await runAgent({
      question: "How does the agent loop preserve execution journal evidence?",
    });

    expect(result).toMatchObject({
      ok: true,
      sources: [
        { documentId: "execution-journal", title: "Execution Journal" },
        { documentId: "agentic-os", title: "Agentic OS" },
      ],
    });
    expect(events.at(-1)?.eventType).toBe("run.succeeded");
  });

  it("returns an empty successful result when no controlled document matches", async () => {
    const MarkdownSearchDocs = await loadMarkdownSearchDocs();
    const fixtureRoot = fileURLToPath(new URL("../../fixtures/docs", import.meta.url));
    const searchDocs = await MarkdownSearchDocs.load({ root: fixtureRoot });

    await expect(
      searchDocs.search(
        { query: "xylophone zephyr", limit: 3 },
        new AbortController().signal,
      ),
    ).resolves.toEqual({ matches: [] });
  });
});
