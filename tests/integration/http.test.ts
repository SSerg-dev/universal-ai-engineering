import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runCli } from "../../src/adapters/inbound/cli.js";
import {
  createRunAgentUseCase,
  type RunAgentUseCase,
} from "../../src/application/run-agent.js";
import { createRuntime } from "../../src/composition/create-runtime.js";
import type { RunAgentResult } from "../../src/domain/agent-contracts.js";
import type {
  AgentErrorCode,
  AgentErrorStage,
} from "../../src/domain/agent-errors.js";
import { AgentEventEnvelopeSchema } from "../../src/domain/agent-events.js";
import {
  FakeSearchDocs,
  FixedClock,
  InMemoryJournal,
  SequenceIdGenerator,
} from "../../src/adapters/outbound/deterministic-test-adapters.js";

const temporaryPaths: string[] = [];

async function makeTemporaryPath(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `uaos-http-${name}-`));
  temporaryPaths.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryPaths.splice(0).map((path) =>
      rm(path, { recursive: true, force: true }),
    ),
  );
});

async function loadHttpAdapter() {
  const module = await import("../../src/adapters/inbound/http.js").catch(
    () => undefined,
  );

  expect(
    module?.buildHttpApp,
    "buildHttpApp should expose the bounded Fastify adapter",
  ).toBeTypeOf("function");

  return module!;
}

function successResult(runId = "http-run-1"): RunAgentResult {
  return {
    ok: true,
    runId,
    answer: "Runs are recorded as ordered execution evidence.",
    sources: [
      { documentId: "execution-journal", title: "Execution Journal" },
    ],
    usage: { modelCalls: 2, toolCalls: 1 },
  };
}

function failureResult(
  code: AgentErrorCode,
  stage: AgentErrorStage,
  runId = `http-${code.toLowerCase()}`,
): RunAgentResult {
  return {
    ok: false,
    runId,
    error: {
      code,
      message: `Public ${code} message.`,
      stage,
      retryable: false,
    },
  };
}

describe("Fastify agent-runs adapter", () => {
  it("exports a bounded app builder and keeps server startup separate", async () => {
    const httpModule = await loadHttpAdapter();
    const serverModule = await import("../../src/composition/server.js").catch(
      () => undefined,
    );

    expect(httpModule.buildHttpApp).toBeTypeOf("function");
    expect(serverModule?.startServer).toBeTypeOf("function");
  });

  it("registers only POST /api/v1/agent-runs and returns the shared result unchanged", async () => {
    const { buildHttpApp } = await loadHttpAdapter();
    const result = successResult();
    let observedSignal: AbortSignal | undefined;
    const runAgent: RunAgentUseCase = vi.fn(async (_input, signal) => {
      observedSignal = signal;
      return result;
    });
    const app = buildHttpApp({ runAgent });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/agent-runs",
        payload: { question: "How are runs recorded?" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(result);
      expect(runAgent).toHaveBeenCalledWith(
        { question: "How are runs recorded?" },
        expect.any(AbortSignal),
      );
      expect(observedSignal).toBeInstanceOf(AbortSignal);
      expect(observedSignal?.aborted).toBe(false);
      expect(app.hasRoute({ method: "POST", url: "/api/v1/agent-runs" })).toBe(
        true,
      );
      expect(app.hasRoute({ method: "GET", url: "/api/v1/agent-runs" })).toBe(
        false,
      );
      expect(
        (await app.inject({ method: "POST", url: "/api/v1/other" }))
          .statusCode,
      ).toBe(404);
    } finally {
      await app.close();
    }
  });

  it("passes semantic invalid input to the use case so its runId and failure survive", async () => {
    const { buildHttpApp } = await loadHttpAdapter();
    const result = failureResult("INVALID_REQUEST", "request", "semantic-run-1");
    const runAgent: RunAgentUseCase = vi.fn(async () => result);
    const app = buildHttpApp({ runAgent });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/agent-runs",
        payload: { question: "   " },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual(result);
      expect(runAgent).toHaveBeenCalledOnce();
    } finally {
      await app.close();
    }
  });

  it("completes a real HTTP request after its body has been fully read", async () => {
    const { buildHttpApp } = await loadHttpAdapter();
    const runtime = await createRuntime({
      fixtureRoot: fileURLToPath(new URL("../../fixtures/docs", import.meta.url)),
      journalRoot: await makeTemporaryPath("real-http"),
    });
    const app = buildHttpApp(runtime);

    try {
      const address = await app.listen({ host: "127.0.0.1", port: 0 });
      const response = await fetch(`${address}/api/v1/agent-runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: "How are runs recorded?" }),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        ok: true,
        usage: { modelCalls: 2, toolCalls: 1 },
      });
    } finally {
      await app.close();
    }
  });

  it("cancels an active model when the real HTTP client disconnects", async () => {
    const { buildHttpApp } = await loadHttpAdapter();
    const journal = new InMemoryJournal();
    const started = Promise.withResolvers<void>();
    const completed = Promise.withResolvers<RunAgentResult>();
    const caller = new AbortController();
    const runAgent = createRunAgentUseCase({
      model: {
        request: async (_input, signal) => {
          started.resolve();
          return new Promise<never>((_resolve, reject) => {
            const abort = () => reject(signal.reason);
            if (signal.aborted) abort();
            else signal.addEventListener("abort", abort, { once: true });
          });
        },
      },
      searchDocs: new FakeSearchDocs({ matches: [] }),
      journal,
      clock: new FixedClock("2026-01-01T00:00:00.000Z", 10),
      ids: new SequenceIdGenerator("real-disconnect"),
      policy: {
        timeoutMs: 5_000,
        terminalEvidenceTimeoutMs: 250,
        maxModelCalls: 2,
        maxToolCalls: 1,
      },
    });
    const app = buildHttpApp({
      runAgent: async (input, signal) => {
        const result = await runAgent(input, signal);
        completed.resolve(result);
        return result;
      },
    });

    try {
      const address = await app.listen({ host: "127.0.0.1", port: 0 });
      const response = fetch(`${address}/api/v1/agent-runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: "Cancel after the model starts" }),
        signal: caller.signal,
      }).then(
        () => "unexpected response",
        (error: Error) => error.name,
      );

      await started.promise;
      caller.abort();
      expect(await response).toBe("AbortError");
      expect(await completed.promise).toMatchObject({
        ok: false,
        error: { code: "CANCELLED", stage: "orchestration" },
      });
      expect(journal.events().map(({ eventType }) => eventType)).toEqual([
        "run.started", "model.requested", "run.cancelled",
      ]);
    } finally {
      caller.abort();
      await app.close();
    }
  });

  it.each([
    ["INVALID_REQUEST", "request", 400],
    ["TIMEOUT", "orchestration", 408],
    ["CANCELLED", "orchestration", 499],
    ["INVALID_MODEL_ACTION", "model", 422],
    ["INVALID_TRANSITION", "orchestration", 422],
    ["LIMIT_EXCEEDED", "model", 422],
    ["MODEL_FAILURE", "model", 502],
    ["TOOL_FAILURE", "tool", 502],
    ["JOURNAL_FAILURE", "journal", 500],
    ["INTERNAL_ERROR", "orchestration", 500],
  ] as const)("maps %s at %s to HTTP %i without reshaping the failure", async (code, stage, status) => {
    const { buildHttpApp } = await loadHttpAdapter();
    const result = failureResult(code, stage);
    const app = buildHttpApp({ runAgent: async () => result });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/agent-runs",
        payload: { question: "status mapping" },
      });

      expect(response.statusCode).toBe(status);
      expect(response.json()).toEqual(result);
    } finally {
      await app.close();
    }
  });

  it("transport-rejects malformed JSON, unsupported content type, and bodies over 16 KiB", async () => {
    const { buildHttpApp } = await loadHttpAdapter();
    const runAgent: RunAgentUseCase = vi.fn(async () => successResult());
    const app = buildHttpApp({ runAgent });

    try {
      const malformed = await app.inject({
        method: "POST",
        url: "/api/v1/agent-runs",
        headers: { "content-type": "application/json" },
        payload: '{"question":',
      });
      const unsupported = await app.inject({
        method: "POST",
        url: "/api/v1/agent-runs",
        headers: { "content-type": "text/plain" },
        payload: "question",
      });
      const oversized = await app.inject({
        method: "POST",
        url: "/api/v1/agent-runs",
        payload: { question: "x".repeat(16 * 1024) },
      });

      expect(malformed.statusCode).toBe(400);
      expect(unsupported.statusCode).toBe(415);
      expect(oversized.statusCode).toBe(413);
      for (const response of [malformed, unsupported, oversized]) {
        expect(response.headers["content-type"]).toContain("application/json");
        expect(response.body).not.toMatch(/stack|cause|node_modules|[A-Z]:\\/i);
      }
      expect(runAgent).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("sanitizes an unexpected adapter exception instead of leaking its details", async () => {
    const { buildHttpApp } = await loadHttpAdapter();
    const app = buildHttpApp({
      runAgent: async () => {
        throw new Error("secret C:\\internal\\agent.ts node_modules stack cause");
      },
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/agent-runs",
        payload: { question: "Do not leak" },
      });

      expect(response.statusCode).toBe(500);
      expect(response.headers["content-type"]).toContain("application/json");
      expect(response.body).not.toContain("secret");
      expect(response.body).not.toMatch(/stack|cause|node_modules|[A-Z]:\\/i);
    } finally {
      await app.close();
    }
  });

  it("maps a request disconnect to CANCELLED before the use-case deadline", async () => {
    const { buildHttpApp } = await loadHttpAdapter();
    const journal = new InMemoryJournal();
    const sharedRunAgent = createRunAgentUseCase({
      model: {
        request: async (_input, signal) => {
          await new Promise<never>((_resolve, reject) => {
            const abort = () => reject(signal.reason);
            if (signal.aborted) abort();
            else signal.addEventListener("abort", abort, { once: true });
          });
        },
      },
      searchDocs: new FakeSearchDocs({ matches: [] }),
      journal,
      clock: new FixedClock("2026-01-01T00:00:00.000Z", 10),
      ids: new SequenceIdGenerator("disconnect"),
      policy: {
        timeoutMs: 100,
        terminalEvidenceTimeoutMs: 250,
        maxModelCalls: 2,
        maxToolCalls: 1,
      },
    });
    const app = buildHttpApp({ runAgent: sharedRunAgent });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/agent-runs",
        payload: { question: "Disconnect this request" },
        simulate: { end: true, split: false, error: false, close: true },
      });

      expect(response.statusCode).toBe(499);
      expect(response.json()).toMatchObject({
        ok: false,
        error: { code: "CANCELLED", stage: "orchestration" },
      });
    } finally {
      await app.close();
    }

    expect(journal.events().map(({ eventType }) => eventType)).toEqual([
      "run.cancelled",
    ]);
  });

  it("keeps the shared use-case deadline distinct from request disconnect", async () => {
    const { buildHttpApp } = await loadHttpAdapter();
    const journal = new InMemoryJournal();
    const runAgent = createRunAgentUseCase({
      model: {
        request: async (_input, signal) => {
          await new Promise<never>((_resolve, reject) => {
            const abort = () => reject(signal.reason);
            if (signal.aborted) abort();
            else signal.addEventListener("abort", abort, { once: true });
          });
        },
      },
      searchDocs: new FakeSearchDocs({ matches: [] }),
      journal,
      clock: new FixedClock("2026-01-01T00:00:00.000Z", 10),
      ids: new SequenceIdGenerator("timeout"),
      policy: {
        timeoutMs: 20,
        terminalEvidenceTimeoutMs: 250,
        maxModelCalls: 2,
        maxToolCalls: 1,
      },
    });
    const app = buildHttpApp({ runAgent });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/agent-runs",
        payload: { question: "Let the use-case deadline win" },
      });

      expect(response.statusCode).toBe(408);
      expect(response.json()).toMatchObject({
        ok: false,
        error: { code: "TIMEOUT", stage: "orchestration" },
      });
      expect(journal.events().map(({ eventType }) => eventType).at(-1)).toBe(
        "run.failed",
      );
    } finally {
      await app.close();
    }
  });

  it("exposes equivalent logical fields through the default CLI and HTTP adapters", async () => {
    const { buildHttpApp } = await loadHttpAdapter();
    const fixtureRoot = fileURLToPath(
      new URL("../../fixtures/docs", import.meta.url),
    );
    const cliJournalRoot = await makeTemporaryPath("cli-parity");
    const httpJournalRoot = await makeTemporaryPath("api-parity");
    const cliRuntime = await createRuntime({ fixtureRoot, journalRoot: cliJournalRoot });
    const httpRuntime = await createRuntime({ fixtureRoot, journalRoot: httpJournalRoot });
    const stdout: string[] = [];
    const stderr: string[] = [];
    let cliResult: RunAgentResult | undefined;
    const question = "How are runs recorded?";

    const exitCode = await runCli({
      argv: ["ask", question],
      stdout: { write: (value) => stdout.push(value) },
      stderr: { write: (value) => stderr.push(value) },
      runtimeFactory: async () => ({
        runAgent: async (input, signal) => {
          cliResult = await cliRuntime.runAgent(input, signal);
          return cliResult;
        },
      }),
    });
    const app = buildHttpApp(httpRuntime);

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/agent-runs",
        payload: { question },
      });
      const httpResult = response.json<RunAgentResult>();

      expect(exitCode).toBe(0);
      expect(stderr).toEqual([]);
      expect(response.statusCode).toBe(200);
      expect(cliResult).toMatchObject({ ok: true });
      expect(httpResult).toMatchObject({ ok: true });
      if (cliResult === undefined || !cliResult.ok || !httpResult.ok) {
        throw new Error("Both adapters must expose a successful logical result.");
      }
      const { runId: cliRunId, ...cliLogicalResult } = cliResult;
      const { runId: httpRunId, ...httpLogicalResult } = httpResult;
      expect(httpLogicalResult).toEqual(cliLogicalResult);
      expect(cliRunId).not.toBe(httpRunId);
      expect(stdout.join("")).toContain(cliRunId);
      expect(stdout.join("")).toContain(cliResult.answer);
      for (const source of cliResult.sources) {
        expect(stdout.join("")).toContain(source.documentId);
        expect(stdout.join("")).toContain(source.title);
      }
      expect(stdout.join("")).toContain(
        `modelCalls=${cliResult.usage.modelCalls}, toolCalls=${cliResult.usage.toolCalls}`,
      );
    } finally {
      await app.close();
    }
  });

  it("isolates concurrent default-composition IDs, counters, signals, events, terminals, and JSONL files", async () => {
    const { buildHttpApp } = await loadHttpAdapter();
    const fixtureRoot = fileURLToPath(
      new URL("../../fixtures/docs", import.meta.url),
    );
    const journalRoot = await makeTemporaryPath("concurrent-runs");
    const runtime = await createRuntime({ fixtureRoot, journalRoot });
    const app = buildHttpApp(runtime);

    try {
      const [cancelledResponse, healthyResponse] = await Promise.all([
        app.inject({
          method: "POST",
          url: "/api/v1/agent-runs",
          payload: { question: "Cancel only this request" },
          simulate: { end: true, split: false, error: false, close: true },
        }),
        app.inject({
          method: "POST",
          url: "/api/v1/agent-runs",
          payload: { question: "How are runs recorded?" },
        }),
      ]);
      const cancelled = cancelledResponse.json<RunAgentResult>();
      const healthy = healthyResponse.json<RunAgentResult>();

      expect(cancelledResponse.statusCode).toBe(499);
      expect(cancelled).toMatchObject({
        ok: false,
        error: { code: "CANCELLED" },
      });
      expect(healthyResponse.statusCode).toBe(200);
      expect(healthy).toMatchObject({
        ok: true,
        usage: { modelCalls: 2, toolCalls: 1 },
      });
      expect(cancelled.runId).not.toBe(healthy.runId);

      const files = (await readdir(journalRoot)).sort();
      expect(files).toEqual(
        [`${cancelled.runId}.jsonl`, `${healthy.runId}.jsonl`].sort(),
      );
      const allEventIds = new Set<string>();
      for (const result of [cancelled, healthy]) {
        const content = await readFile(
          join(journalRoot, `${result.runId}.jsonl`),
          "utf8",
        );
        const events = content
          .trimEnd()
          .split("\n")
          .map((line) =>
            AgentEventEnvelopeSchema.parse(JSON.parse(line) as unknown),
          );
        expect(events.every(({ runId }) => runId === result.runId)).toBe(true);
        expect(events.map(({ sequence }) => sequence)).toEqual(
          events.map((_, index) => index + 1),
        );
        const terminals = events.filter(({ eventType }) =>
          ["run.succeeded", "run.failed", "run.cancelled"].includes(eventType),
        );
        expect(terminals).toHaveLength(1);
        for (const { eventId } of events) {
          expect(allEventIds.has(eventId)).toBe(false);
          allEventIds.add(eventId);
        }
        if (result.ok) {
          expect(events).toHaveLength(8);
          expect(terminals[0]?.eventType).toBe("run.succeeded");
        } else {
          expect(events).toHaveLength(1);
          expect(terminals[0]?.eventType).toBe("run.cancelled");
          expect(terminals[0]?.payload).toMatchObject({
            modelCalls: 0,
            toolCalls: 0,
          });
        }
      }
    } finally {
      await app.close();
    }
  });
});
