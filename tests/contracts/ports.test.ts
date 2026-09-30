import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { createRunAgentUseCase } from "../../src/application/run-agent.js";
import { DeterministicTeachingModel } from "../../src/adapters/outbound/deterministic-model.js";
import {
  FakeSearchDocs,
  FixedClock,
  InMemoryJournal,
  ScriptedModel,
  SequenceIdGenerator,
} from "../../src/adapters/outbound/deterministic-test-adapters.js";
import { MarkdownSearchDocs } from "../../src/adapters/outbound/markdown-search-docs.js";
import type { AgentEventEnvelope } from "../../src/domain/agent-events.js";

const policy = {
  timeoutMs: 5000,
  terminalEvidenceTimeoutMs: 250,
  maxModelCalls: 2,
  maxToolCalls: 1,
} as const;

const eventTypes = (events: readonly AgentEventEnvelope[]) =>
  events.map(({ eventType }) => eventType);

describe("outbound port substitution", () => {
  it("runs the same use case through scripted/fixed and concrete deterministic adapters", async () => {
    const scriptedJournal = new InMemoryJournal();
    const scriptedRun = createRunAgentUseCase({
      model: new ScriptedModel([
        {
          type: "call_tool",
          toolName: "search_docs",
          arguments: { query: "agent loop journal", limit: 3 },
        },
        {
          type: "final_answer",
          answer: "The typed loop records evidence.",
          sourceIds: ["agentic-os"],
        },
      ]),
      searchDocs: new FakeSearchDocs({
        matches: [
          {
            documentId: "agentic-os",
            title: "Agentic OS",
            excerpt: "A typed loop records evidence.",
            matchedTerms: ["agent", "loop"],
          },
        ],
      }),
      journal: scriptedJournal,
      clock: new FixedClock("2026-01-01T00:00:00.000Z", 1),
      ids: new SequenceIdGenerator("scripted"),
      policy,
    });

    const fixtureRoot = fileURLToPath(new URL("../../fixtures/docs", import.meta.url));
    const concreteJournal = new InMemoryJournal();
    const concreteRun = createRunAgentUseCase({
      model: new DeterministicTeachingModel(),
      searchDocs: await MarkdownSearchDocs.load({ root: fixtureRoot }),
      journal: concreteJournal,
      clock: new FixedClock("2026-01-01T00:00:00.000Z", 1),
      ids: new SequenceIdGenerator("concrete"),
      policy,
    });

    const [scriptedResult, concreteResult] = await Promise.all([
      scriptedRun({ question: "How does the agent loop preserve journal evidence?" }),
      concreteRun({ question: "How does the agent loop preserve journal evidence?" }),
    ]);

    expect(scriptedResult).toMatchObject({
      ok: true,
      usage: { modelCalls: 2, toolCalls: 1 },
    });
    expect(concreteResult).toMatchObject({
      ok: true,
      usage: { modelCalls: 2, toolCalls: 1 },
    });
    const expectedOrder = [
      "run.started",
      "model.requested",
      "model.responded",
      "tool.requested",
      "tool.succeeded",
      "model.requested",
      "model.responded",
      "run.succeeded",
    ];
    expect(eventTypes(scriptedJournal.events())).toEqual(expectedOrder);
    expect(eventTypes(concreteJournal.events())).toEqual(expectedOrder);
  });

  it("propagates AbortSignal through public ports and preserves cancellation ordering", async () => {
    const controller = new AbortController();
    const journal = new InMemoryJournal();
    const runAgent = createRunAgentUseCase({
      model: new ScriptedModel([], { delayMs: 50 }),
      searchDocs: new FakeSearchDocs({ matches: [] }),
      journal,
      clock: new FixedClock("2026-01-01T00:00:00.000Z"),
      ids: new SequenceIdGenerator("cancel"),
      policy,
    });

    const pending = runAgent(
      { question: "Cancel this deterministic port call." },
      controller.signal,
    );
    setTimeout(() => controller.abort(), 5);
    const result = await pending;

    expect(result).toMatchObject({
      ok: false,
      error: { code: "CANCELLED", stage: "orchestration" },
    });
    expect(eventTypes(journal.events())).toEqual([
      "run.started",
      "model.requested",
      "run.cancelled",
    ]);
  });

  it("normalizes scripted model, search, and journal exceptions through port interfaces", async () => {
    const modelFailure = createRunAgentUseCase({
      model: new ScriptedModel([], { failAtCall: 1 }),
      searchDocs: new FakeSearchDocs({ matches: [] }),
      journal: new InMemoryJournal(),
      clock: new FixedClock("2026-01-01T00:00:00.000Z"),
      ids: new SequenceIdGenerator("model-failure"),
      policy,
    });
    const toolFailure = createRunAgentUseCase({
      model: new ScriptedModel([
        {
          type: "call_tool",
          toolName: "search_docs",
          arguments: { query: "loop", limit: 3 },
        },
      ]),
      searchDocs: new FakeSearchDocs({ matches: [] }, { failAtCall: 1 }),
      journal: new InMemoryJournal(),
      clock: new FixedClock("2026-01-01T00:00:00.000Z"),
      ids: new SequenceIdGenerator("tool-failure"),
      policy,
    });
    const journalFailure = createRunAgentUseCase({
      model: new ScriptedModel([]),
      searchDocs: new FakeSearchDocs({ matches: [] }),
      journal: new InMemoryJournal({ failAtAppend: 1 }),
      clock: new FixedClock("2026-01-01T00:00:00.000Z"),
      ids: new SequenceIdGenerator("journal-failure"),
      policy,
    });

    await expect(modelFailure({ question: "model" })).resolves.toMatchObject({
      ok: false,
      error: { code: "MODEL_FAILURE", stage: "model" },
    });
    await expect(toolFailure({ question: "tool" })).resolves.toMatchObject({
      ok: false,
      error: { code: "TOOL_FAILURE", stage: "tool" },
    });
    await expect(journalFailure({ question: "journal" })).resolves.toMatchObject({
      ok: false,
      error: { code: "JOURNAL_FAILURE", stage: "journal" },
    });
  });
});
