import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { runCli } from "../../src/adapters/inbound/cli.js";
import { buildHttpApp } from "../../src/adapters/inbound/http.js";
import { FixedClock, ScriptedModel, SequenceIdGenerator } from "../../src/adapters/outbound/deterministic-test-adapters.js";
import { MarkdownSearchDocs } from "../../src/adapters/outbound/markdown-search-docs.js";
import { createRegisteredRunAgentUseCase } from "../../src/application/run-registered-agent.js";
import { defineTool, ToolRegistry, type RegisteredTool } from "../../src/application/tool-registry.js";
import { createIterationRuntime } from "../../src/composition/create-iteration-runtime.js";
import { createToolRuntime } from "../../src/composition/create-tool-runtime.js";
import { startServer } from "../../src/composition/server.js";
import { RunAgentResultSchema, type RunAgentResult } from "../../src/domain/agent-contracts.js";
import type { ToolObservation } from "../../src/domain/tool-contracts.js";
import { RegisteredAgentEventEnvelopeSchema, type RegisteredAgentEventEnvelope } from "../../src/domain/tool-events.js";

const fixtureRoot = fileURLToPath(new URL("../../fixtures/docs", import.meta.url));
const temporaryRoots: string[] = [];
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "uaos-tools-"));
  temporaryRoots.push(root);
  return root;
}
afterEach(async () => {
  vi.useRealTimers();
  for (const root of temporaryRoots.splice(0)) {
    const absolute = resolve(root);
    if (dirname(absolute) !== resolve(tmpdir()) || !basename(absolute).startsWith("uaos-tools-")) {
      throw new Error("Unexpected temporary test path.");
    }
    await rm(absolute, { recursive: true, force: true });
  }
});

function harness(tools: readonly RegisteredTool[], actions: readonly unknown[], allowedTools?: Set<string>) {
  const events: RegisteredAgentEventEnvelope[] = [];
  const model = new ScriptedModel<ToolObservation>(actions);
  const append = vi.fn(async (event: RegisteredAgentEventEnvelope, signal: AbortSignal) => {
    signal.throwIfAborted();
    events.push(RegisteredAgentEventEnvelopeSchema.parse(event));
  });
  const runAgent = createRegisteredRunAgentUseCase({
    model, tools: new ToolRegistry(tools), journal: { append },
    clock: new FixedClock("2026-11-09T00:00:00Z"), ids: new SequenceIdGenerator("registry"),
    policy: { timeoutMs: 5_000, terminalEvidenceTimeoutMs: 250, maxModelCalls: 2, maxToolCalls: 1 },
    toolPolicy: { allowedTools: allowedTools ?? new Set(tools.map(({ descriptor }) => descriptor.name)), timeoutMs: 50 },
  });
  return { runAgent, events, model, append };
}

function echoTool(execute = vi.fn(async (input: { value: string }) => ({ value: input.value }))) {
  return defineTool({
    name: "echo", description: "A test-only third tool",
    inputSchema: z.strictObject({ value: z.string() }),
    outputSchema: z.strictObject({ value: z.string() }), execute,
  });
}
const call = (toolName: string, argumentsValue: unknown) => ({ type: "call_tool", toolName, arguments: argumentsValue });
const final = { type: "final_answer", answer: "Completed", sourceIds: [] };

describe("registered tools through the shared loop", () => {
  it("runs a third registered tool without changing the loop algorithm", async () => {
    const execute = vi.fn(async (input: { value: string }) => ({ value: input.value }));
    const { runAgent, model, events } = harness([echoTool(execute)], [call("echo", { value: "third" }), final]);
    const result = await runAgent({ question: "Use a third tool" });
    expect(result).toMatchObject({ ok: true, answer: "Completed", usage: { modelCalls: 2, toolCalls: 1 } });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(model.requests()[1]).toMatchObject({
      state: "awaiting_final", toolResult: { toolName: "echo", output: { value: "third" }, sources: [] },
    });
    expect(events).toHaveLength(8);
    expect(events.every(({ schemaVersion }) => schemaVersion === "1.1")).toBe(true);
    expect(events.at(-1)?.eventType).toBe("run.succeeded");
  });

  it.each([
    { action: call("missing", {}), allowed: ["echo"], code: "TOOL_NOT_FOUND" },
    { action: call("echo", { value: "secret" }), allowed: [], code: "TOOL_PERMISSION_DENIED" },
    { action: call("echo", { value: 42 }), allowed: ["echo"], code: "TOOL_INPUT_INVALID" },
  ])("preserves public failure shape and journals $code before any handler", async ({ action, allowed, code }) => {
    const execute = vi.fn(async (input: { value: string }) => input);
    const { runAgent, model, events } = harness([echoTool(execute)], [action, final], new Set(allowed));
    const result = await runAgent({ question: "Reject the invocation" });
    expect(RunAgentResultSchema.parse(result)).toMatchObject({ ok: false, error: { code: "TOOL_FAILURE", stage: "tool" } });
    expect(execute).not.toHaveBeenCalled();
    expect(model.requests()).toHaveLength(1);
    expect(events.find(({ eventType }) => eventType === "tool.failed")?.payload).toMatchObject({
      errorCode: "TOOL_FAILURE", toolErrorCode: code,
    });
    expect(events.at(-1)?.eventType).toBe("run.failed");
    expect(JSON.stringify(events)).not.toContain("secret");
  });

  it("snapshots an operator allow-list before later mutation", async () => {
    const allowed = new Set<string>();
    const { runAgent } = harness([echoTool()], [call("echo", { value: "a" }), final], allowed);
    allowed.add("echo");
    expect(await runAgent({ question: "Policy snapshot" })).toMatchObject({ ok: false, error: { code: "TOOL_FAILURE" } });
  });

  it("preserves two-argument Phase 2 handlers and existing in-memory identifier formats", async () => {
    const execute = vi.fn(async (input: { value: string }) => input);
    const runAgent = createRegisteredRunAgentUseCase({
      model: new ScriptedModel<ToolObservation>([call("echo", { value: "a" }), final]),
      tools: new ToolRegistry([echoTool(execute)]), journal: { append: async () => {} },
      clock: new FixedClock("2026-11-09T00:00:00Z"), ids: new SequenceIdGenerator("legacy.ids"),
      policy: { timeoutMs: 5000, terminalEvidenceTimeoutMs: 250, maxModelCalls: 2, maxToolCalls: 1 },
      toolPolicy: { allowedTools: new Set(["echo"]), timeoutMs: 100 },
    });
    expect(await runAgent({ question: "Preserve existing callers" })).toMatchObject({ ok: true });
    expect(execute.mock.calls[0]).toHaveLength(2);
  });

  it("rejects invented source references after a valid registered result", async () => {
    const { runAgent } = harness([echoTool()], [call("echo", { value: "a" }), { ...final, sourceIds: ["invented"] }]);
    expect(await runAgent({ question: "Use only observed sources" })).toMatchObject({
      ok: false, error: { code: "INVALID_TRANSITION" },
    });
  });

  it("does no tool work after tool-request evidence fails", async () => {
    const execute = vi.fn(async (input: { value: string }) => input);
    const { runAgent, append, model, events } = harness([echoTool(execute)], [call("echo", { value: "a" }), final]);
    append.mockImplementation(async (event) => {
      if (event.eventType === "tool.requested") throw new Error("secret disk failure");
      events.push(event);
    });
    expect(await runAgent({ question: "Required evidence" })).toMatchObject({ ok: false, error: { code: "JOURNAL_FAILURE" } });
    expect(execute).not.toHaveBeenCalled();
    expect(model.requests()).toHaveLength(1);
  });

  it("keeps invocation timeout distinct from run-wide cancellation", async () => {
    vi.useFakeTimers();
    const started = Promise.withResolvers<void>();
    const tool = defineTool({
      name: "wait", description: "Wait indefinitely", inputSchema: z.unknown(), outputSchema: z.string(),
      execute: async () => { started.resolve(); return new Promise<string>(() => {}); },
    });
    const { runAgent, events, model } = harness([tool], [call("wait", {}), final]);
    const pending = runAgent({ question: "Bound a tool" });
    await started.promise;
    await vi.advanceTimersByTimeAsync(50);
    expect(await pending).toMatchObject({ ok: false, error: { code: "TOOL_FAILURE" } });
    expect(events.find(({ eventType }) => eventType === "tool.failed")?.payload).toMatchObject({ toolErrorCode: "TOOL_TIMEOUT" });
    expect(model.requests()).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("isolates cancellation across simultaneous calls sharing one registry", async () => {
    const started = Promise.withResolvers<void>();
    const late = Promise.withResolvers<{ value: string }>();
    const tool = echoTool(vi.fn(async (input: { value: string }) => {
      if (input.value === "cancel") { started.resolve(); return late.promise; }
      return input;
    }));
    const { runAgent, events } = harness([tool], [
      call("echo", { value: "cancel" }), call("echo", { value: "healthy" }), final,
    ]);
    const caller = new AbortController();
    const cancelled = runAgent({ question: "Cancelled" }, caller.signal);
    await started.promise;
    const healthy = runAgent({ question: "Healthy" });
    caller.abort();
    expect(await cancelled).toMatchObject({ ok: false, error: { code: "CANCELLED" } });
    const result = await healthy;
    expect(result).toMatchObject({ ok: true, usage: { modelCalls: 2, toolCalls: 1 } });
    late.resolve({ value: "ignored" });
    await late.promise;
    const runIds = new Set(events.map(({ runId }) => runId));
    expect(runIds.size).toBe(2);
    for (const runId of runIds) {
      const run = events.filter((event) => event.runId === runId);
      expect(run.map(({ sequence }) => sequence)).toEqual(run.map((_, index) => index + 1));
      expect(run.filter(({ eventType }) => ["run.succeeded", "run.failed", "run.cancelled"].includes(eventType))).toHaveLength(1);
    }
  });
});

describe("Iteration 2 composition", () => {
  it("reads documents by ID from the loaded snapshot and treats path-shaped IDs as absent", async () => {
    const documents = await MarkdownSearchDocs.load({ root: fixtureRoot });
    const signal = new AbortController().signal;
    const result = await documents.read({ documentId: "execution-journal" }, signal);
    expect(result.document?.content).toBe(await readFile(join(fixtureRoot, "execution-journal.md"), "utf8"));
    expect(await documents.read({ documentId: "../../package.json" }, signal)).toEqual({ document: null });
  });

  it.each(["execution journal", "doc:execution-journal", "doc:missing"])("persists one safe version 1.1 run for %s", async (question) => {
    const journalRoot = await temporaryRoot();
    const runtime = await createToolRuntime({ fixtureRoot, journalRoot });
    const result = await runtime.runAgent({ question });
    expect(result).toMatchObject({ ok: true, usage: { modelCalls: 2, toolCalls: 1 } });
    const files = await readdir(journalRoot);
    expect(files).toHaveLength(1);
    const content = await readFile(join(journalRoot, files[0]!), "utf8");
    const events = content.trimEnd().split("\n").map((line) => RegisteredAgentEventEnvelopeSchema.parse(JSON.parse(line)));
    expect(events).toHaveLength(8);
    expect(events.at(-1)?.eventType).toBe("run.succeeded");
    expect(events.find(({ eventType }) => eventType === "tool.requested")?.payload).toMatchObject({
      toolName: question.startsWith("doc:") ? "read_doc" : "search_docs",
    });
    expect(content).not.toContain(question);
    expect(content).not.toContain("The execution journal preserves evidence");
  });

  it("keeps CLI and HTTP results equivalent for the registered read tool", async () => {
    const runtime = await createToolRuntime({ fixtureRoot, journalRoot: await temporaryRoot() });
    const stdout: string[] = [];
    let cliResult: RunAgentResult | undefined;
    expect(await runCli({
      argv: ["ask", "doc:execution-journal"],
      stdout: { write: (text) => stdout.push(text) }, stderr: { write: () => {} },
      runtimeFactory: async () => ({ runAgent: async (input, signal) => {
        cliResult = await runtime.runAgent(input, signal);
        return cliResult;
      } }),
    })).toBe(0);
    const app = buildHttpApp(runtime);
    try {
      const response = await app.inject({ method: "POST", url: "/api/v1/agent-runs", payload: { question: "doc:execution-journal" } });
      expect(response.statusCode).toBe(200);
      const httpResult = response.json<RunAgentResult>();
      expect(httpResult).toMatchObject({ ...cliResult, runId: expect.any(String) });
      expect(httpResult.runId).not.toBe(cliResult?.runId);
      expect(stdout.join("")).toContain("Execution Journal");
    } finally {
      await app.close();
    }
  });

  it("rejects an unsupported iteration instead of selecting a fallback", async () => {
    expect(() => createIterationRuntime({ fixtureRoot, journalRoot: "unused", iteration: "99" })).toThrow(/unsupported/u);
  });

  it("selects iteration 2 through real HTTP server composition", async () => {
    const journalRoot = await temporaryRoot();
    const app = await startServer({ fixtureRoot, journalRoot, iteration: 2, host: "127.0.0.1", port: 0 });
    try {
      const address = app.server.address();
      if (address === null || typeof address === "string") throw new Error("Expected a TCP listener.");
      const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/agent-runs`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: "doc:execution-journal" }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        ok: true, sources: [{ documentId: "execution-journal", title: "Execution Journal" }],
        usage: { modelCalls: 2, toolCalls: 1 },
      });
      const files = await readdir(journalRoot);
      const events = (await readFile(join(journalRoot, files[0]!), "utf8")).trimEnd().split("\n")
        .map((line) => RegisteredAgentEventEnvelopeSchema.parse(JSON.parse(line)));
      expect(events).toHaveLength(8);
    } finally {
      await app.close();
    }
  });
});
