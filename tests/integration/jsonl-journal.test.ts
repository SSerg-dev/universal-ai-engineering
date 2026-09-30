import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createRunAgentUseCase } from "../../src/application/run-agent.js";
import type { JournalPort } from "../../src/application/ports/journal-port.js";
import {
  AgentEventEnvelopeSchema,
  type AgentEventEnvelope,
} from "../../src/domain/agent-events.js";
import {
  FakeSearchDocs,
  FixedClock,
  ScriptedModel,
  SequenceIdGenerator,
} from "../../src/adapters/outbound/deterministic-test-adapters.js";

const temporaryPaths: string[] = [];

async function makeTemporaryPath(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `uaos-${name}-`));
  temporaryPaths.push(root);
  return root;
}

async function loadSystemAdapters() {
  const [journalModule, clockModule, idModule] = await Promise.all([
    import("../../src/adapters/outbound/jsonl-journal.js").catch(() => undefined),
    import("../../src/adapters/outbound/system-clock.js").catch(() => undefined),
    import("../../src/adapters/outbound/system-id-generator.js").catch(
      () => undefined,
    ),
  ]);

  expect(
    journalModule?.JsonlJournal,
    "JsonlJournal should provide the reviewed filesystem journal port",
  ).toBeTypeOf("function");
  expect(clockModule?.SystemClock).toBeTypeOf("function");
  expect(idModule?.SystemIdGenerator).toBeTypeOf("function");

  return {
    JsonlJournal: journalModule!.JsonlJournal,
    SystemClock: clockModule!.SystemClock,
    SystemIdGenerator: idModule!.SystemIdGenerator,
  };
}

function successfulActions(question: string, sourceId = "execution-journal") {
  return [
    {
      type: "call_tool",
      toolName: "search_docs",
      arguments: { query: question, limit: 3 },
    },
    {
      type: "final_answer",
      answer: "Runs are recorded as ordered, safe event envelopes.",
      sourceIds: [sourceId],
    },
  ] as const;
}

function successfulSearchOutput(sourceId = "execution-journal") {
  return {
    matches: [
      {
        documentId: sourceId,
        title: "Execution Journal",
        excerpt: "A protected fixture excerpt that must never reach JSONL.",
        matchedTerms: ["runs", "recorded"],
      },
    ],
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryPaths.splice(0).map((path) =>
      rm(path, { recursive: true, force: true }),
    ),
  );
});

describe("JsonlJournal", () => {
  it("persists one complete successful run as eight exact schema-valid UTF-8 lines", async () => {
    const { JsonlJournal } = await loadSystemAdapters();
    const root = await makeTemporaryPath("journal-success");
    const question = "How are runs recorded?";
    const journal: JournalPort = new JsonlJournal({ root });
    const runAgent = createRunAgentUseCase({
      model: new ScriptedModel(successfulActions(question)),
      searchDocs: new FakeSearchDocs(successfulSearchOutput()),
      journal,
      clock: new FixedClock("2026-01-01T00:00:00.000Z", 10),
      ids: new SequenceIdGenerator("journal"),
      policy: {
        timeoutMs: 5000,
        terminalEvidenceTimeoutMs: 250,
        maxModelCalls: 2,
        maxToolCalls: 1,
      },
    });

    const result = await runAgent({ question });

    expect(result.ok).toBe(true);
    const files = await readdir(root);
    expect(files).toEqual(["journal-run-1.jsonl"]);
    const content = await readFile(join(root, files[0]!), "utf8");
    expect(Buffer.from(content, "utf8").toString("utf8")).toBe(content);
    expect(content.endsWith("\n")).toBe(true);
    const rawLines = content.trimEnd().split("\n");
    const events = rawLines.map((line) =>
      AgentEventEnvelopeSchema.parse(JSON.parse(line) as unknown),
    );

    expect(events).toHaveLength(8);
    expect(events.map(({ schemaVersion }) => schemaVersion)).toEqual(
      Array.from({ length: 8 }, () => "1.0"),
    );
    expect(events.map(({ sequence }) => sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(events.map(({ eventType }) => eventType)).toEqual([
      "run.started",
      "model.requested",
      "model.responded",
      "tool.requested",
      "tool.succeeded",
      "model.requested",
      "model.responded",
      "run.succeeded",
    ]);
    expect(content).toBe(`${events.map((event) => JSON.stringify(event)).join("\n")}\n`);
    expect(content).not.toContain(question);
    expect(content).not.toContain("Runs are recorded as ordered");
    expect(content).not.toContain("protected fixture excerpt");
  });

  it("rejects malformed envelopes before creating a journal file", async () => {
    const { JsonlJournal } = await loadSystemAdapters();
    const root = await makeTemporaryPath("journal-invalid-envelope");
    const journal: JournalPort = new JsonlJournal({ root });
    const malformed = {
      schemaVersion: "1.0",
      eventId: "event-1",
      runId: "safe-run",
      sequence: 1,
      occurredAt: "2026-01-01T00:00:00.000Z",
      eventType: "run.started",
      payload: { question: "must not persist" },
    } as unknown as AgentEventEnvelope;

    await expect(
      journal.append(malformed, new AbortController().signal),
    ).rejects.toThrow();
    await expect(readdir(root)).resolves.toEqual([]);
  });

  it("rejects traversal-shaped run IDs before touching the configured root", async () => {
    const { JsonlJournal } = await loadSystemAdapters();
    const parent = await makeTemporaryPath("journal-traversal");
    const root = join(parent, "not-created");
    const journal: JournalPort = new JsonlJournal({ root });
    const event = AgentEventEnvelopeSchema.parse({
      schemaVersion: "1.0",
      eventId: "event-1",
      runId: "../escape",
      sequence: 1,
      occurredAt: "2026-01-01T00:00:00.000Z",
      eventType: "run.started",
      payload: {},
    });

    await expect(
      journal.append(event, new AbortController().signal),
    ).rejects.toThrow(/runId/i);
    await expect(readdir(parent)).resolves.toEqual([]);
  });

  it("persists one cancellation terminal after the ordinary run signal aborts", async () => {
    const { JsonlJournal } = await loadSystemAdapters();
    const root = await makeTemporaryPath("journal-cancelled");
    const controller = new AbortController();
    let announceModelRequest!: () => void;
    const modelStarted = new Promise<void>((resolve) => {
      announceModelRequest = resolve;
    });
    const model = {
      request: vi.fn(async (_input: unknown, signal: AbortSignal) => {
        announceModelRequest();
        await new Promise<never>((_resolve, reject) => {
          const abort = () => reject(signal.reason);
          if (signal.aborted) abort();
          else signal.addEventListener("abort", abort, { once: true });
        });
      }),
    };
    const runAgent = createRunAgentUseCase({
      model,
      searchDocs: new FakeSearchDocs(successfulSearchOutput()),
      journal: new JsonlJournal({ root }),
      clock: new FixedClock("2026-01-01T00:00:00.000Z", 10),
      ids: new SequenceIdGenerator("cancel"),
      policy: {
        timeoutMs: 5000,
        terminalEvidenceTimeoutMs: 250,
        maxModelCalls: 2,
        maxToolCalls: 1,
      },
    });

    const pending = runAgent({ question: "cancel me" }, controller.signal);
    await modelStarted;
    controller.abort();
    const result = await pending;

    expect(result).toMatchObject({
      ok: false,
      runId: "cancel-run-1",
      error: { code: "CANCELLED", stage: "orchestration" },
    });
    const content = await readFile(join(root, "cancel-run-1.jsonl"), "utf8");
    const events = content
      .trimEnd()
      .split("\n")
      .map((line) => AgentEventEnvelopeSchema.parse(JSON.parse(line) as unknown));
    expect(events.map(({ eventType }) => eventType)).toEqual([
      "run.started",
      "model.requested",
      "run.cancelled",
    ]);
    expect(events.filter(({ eventType }) => eventType === "run.cancelled")).toHaveLength(1);
  });

  it("fails closed when the first filesystem append cannot be written", async () => {
    const { JsonlJournal } = await loadSystemAdapters();
    const parent = await makeTemporaryPath("journal-write-failure");
    const root = join(parent, "not-a-directory");
    await writeFile(root, "occupied", "utf8");
    const model = new ScriptedModel(successfulActions("question"));
    const searchDocs = new FakeSearchDocs(successfulSearchOutput());
    const runAgent = createRunAgentUseCase({
      model,
      searchDocs,
      journal: new JsonlJournal({ root }),
      clock: new FixedClock("2026-01-01T00:00:00.000Z"),
      ids: new SequenceIdGenerator("failure"),
      policy: {
        timeoutMs: 5000,
        terminalEvidenceTimeoutMs: 250,
        maxModelCalls: 2,
        maxToolCalls: 1,
      },
    });

    await expect(runAgent({ question: "question" })).resolves.toMatchObject({
      ok: false,
      error: { code: "JOURNAL_FAILURE", stage: "journal" },
    });
    expect(model.requests()).toHaveLength(0);
    expect(searchDocs.calls()).toHaveLength(0);
  });
});
