import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { createRunAgentUseCase } from "../../src/application/run-agent.js";
import { DeterministicTeachingModel } from "../../src/adapters/outbound/deterministic-model.js";
import {
  FixedClock,
  InMemoryJournal,
  SequenceIdGenerator,
} from "../../src/adapters/outbound/deterministic-test-adapters.js";
import { MarkdownSearchDocs } from "../../src/adapters/outbound/markdown-search-docs.js";

describe("Iteration 1 teaching scenario", () => {
  it("shows question → search_docs → answer with source references and exact evidence", async () => {
    const fixtureRoot = fileURLToPath(new URL("../../fixtures/docs", import.meta.url));
    const searchDocs = await MarkdownSearchDocs.load({ root: fixtureRoot });
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

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`unexpected ${result.error.code}`);

    expect(result.answer.length).toBeGreaterThan(0);
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.usage).toEqual({ modelCalls: 2, toolCalls: 1 });

    const events = journal.events();
    expect(events.map((event) => event.eventType)).toEqual([
      "run.started",
      "model.requested",
      "model.responded",
      "tool.requested",
      "tool.succeeded",
      "model.requested",
      "model.responded",
      "run.succeeded",
    ]);

    const searchResult = events.find((event) => event.eventType === "tool.succeeded");
    expect(searchResult?.payload).toMatchObject({
      toolName: "search_docs",
      sourceIds: expect.arrayContaining(result.sources.map(({ documentId }) => documentId)),
    });

    const returnedSourceIds = new Set(
      (searchResult?.payload.sourceIds as string[] | undefined) ?? [],
    );
    expect(result.sources.every(({ documentId }) => returnedSourceIds.has(documentId))).toBe(
      true,
    );
  });
});
