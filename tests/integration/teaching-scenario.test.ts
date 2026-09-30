import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { createRunAgentUseCase } from "../../src/application/run-agent.js";
import { MarkdownSearchDocs } from "../../src/adapters/outbound/markdown-search-docs.js";

async function loadDeterministicAdapters() {
  const [modelModule, testAdaptersModule] = await Promise.all([
    import("../../src/adapters/outbound/deterministic-model.js").catch(
      () => undefined,
    ),
    import("../../src/adapters/outbound/deterministic-test-adapters.js").catch(
      () => undefined,
    ),
  ]);

  expect(
    modelModule?.DeterministicTeachingModel,
    "DeterministicTeachingModel should provide the offline model path",
  ).toBeTypeOf("function");
  expect(
    testAdaptersModule?.InMemoryJournal,
    "deterministic evidence adapters should be first-class ports",
  ).toBeTypeOf("function");

  return {
    DeterministicTeachingModel: modelModule!.DeterministicTeachingModel,
    FixedClock: testAdaptersModule!.FixedClock,
    InMemoryJournal: testAdaptersModule!.InMemoryJournal,
    SequenceIdGenerator: testAdaptersModule!.SequenceIdGenerator,
  };
}

describe("Iteration 1 teaching scenario", () => {
  it("shows question → search_docs → answer with exact reproducible evidence", async () => {
    const {
      DeterministicTeachingModel,
      FixedClock,
      InMemoryJournal,
      SequenceIdGenerator,
    } = await loadDeterministicAdapters();
    const fixtureRoot = fileURLToPath(new URL("../../fixtures/docs", import.meta.url));
    const searchDocs = await MarkdownSearchDocs.load({ root: fixtureRoot });
    const execute = async () => {
      const journal = new InMemoryJournal();
      const runAgent = createRunAgentUseCase({
        model: new DeterministicTeachingModel(),
        searchDocs,
        journal,
        clock: new FixedClock("2026-01-01T00:00:00.000Z", 10),
        ids: new SequenceIdGenerator("teaching"),
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

      return { result, events: journal.events() };
    };

    const firstRun = await execute();
    const secondRun = await execute();

    expect(secondRun).toEqual(firstRun);
    expect(firstRun.result).toEqual({
      ok: true,
      runId: "teaching-run-1",
      answer:
        "The typed agent loop records ordered execution evidence around model and search actions.",
      sources: [
        { documentId: "execution-journal", title: "Execution Journal" },
        { documentId: "agentic-os", title: "Agentic OS" },
      ],
      usage: { modelCalls: 2, toolCalls: 1 },
    });
    expect(firstRun.events.map(({ sequence }) => sequence)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(firstRun.events.map(({ eventType }) => eventType)).toEqual([
      "run.started",
      "model.requested",
      "model.responded",
      "tool.requested",
      "tool.succeeded",
      "model.requested",
      "model.responded",
      "run.succeeded",
    ]);
    expect(
      firstRun.events.filter(({ eventType }) => eventType === "run.succeeded"),
    ).toHaveLength(1);
  });

  it("returns an empty successful result when no controlled document matches", async () => {
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
