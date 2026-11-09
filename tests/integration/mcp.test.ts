import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { McpReadDocAdapter } from "../../src/adapters/outbound/mcp-read-doc.js";
import { SdkMcpSession } from "../../src/adapters/outbound/sdk-mcp-session.js";
import { RegisteredAgentEventEnvelopeSchema } from "../../src/domain/tool-events.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const fixtureRoot = join(root, "fixtures/docs");
const serverPath = join(root, "dist/src/adapters/mcp/document-server.js");
const consent = { serverId: "uaos-docs", toolName: "read_doc", granted: true };
const temporaryRoots: string[] = [];
async function temporaryRoot(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "uaos-mcp-"));
  temporaryRoots.push(directory);
  return directory;
}
afterEach(async () => {
  for (const directory of temporaryRoots.splice(0)) {
    const absolute = resolve(directory);
    if (dirname(absolute) !== resolve(tmpdir()) || !basename(absolute).startsWith("uaos-mcp-")) throw new Error("Unexpected MCP test path.");
    await rm(absolute, { recursive: true, force: true });
  }
});

async function compiledRuntime() {
  return await import(pathToFileURL(join(root, "dist/src/composition/create-mcp-runtime.js")).href) as typeof import("../../src/composition/create-mcp-runtime.js");
}

beforeAll(() => {
  execFileSync(process.execPath, [join(root, "node_modules/typescript/bin/tsc")], {
    cwd: root, encoding: "utf8", timeout: 30_000,
  });
}, 30_000);

describe("pinned MCP stdio boundary", () => {
  it("reads the controlled document with a matching modern correlation receipt", async () => {
    const adapter = new McpReadDocAdapter({
      consent,
      createSession: () => new SdkMcpSession({ command: process.execPath, args: [serverPath, fixtureRoot] }),
    });
    const result = await adapter.read({ documentId: "execution-journal" }, new AbortController().signal, {
      runId: "mcp-run-1", callId: "mcp-tool-1",
    });
    expect(result).toEqual({ document: {
      documentId: "execution-journal", title: "Execution Journal",
      content: await readFile(join(fixtureRoot, "execution-journal.md"), "utf8"),
    } });
  }, 10_000);

  it("rejects a legacy-only server without falling back", async () => {
    const adapter = new McpReadDocAdapter({
      consent,
      createSession: () => new SdkMcpSession({
        command: process.execPath, args: [join(root, "dist/tests/fixtures/legacy-mcp-server.js")],
      }),
    });
    await expect(adapter.read({ documentId: "execution-journal" }, new AbortController().signal, {
      runId: "legacy-run-1", callId: "legacy-tool-1",
    })).rejects.toMatchObject({ code: "MCP_NEGOTIATION_FAILED" });
  }, 10_000);

  it("cancels a live SDK connection while preserving the caller's reason", async () => {
    const caller = new AbortController();
    const reason = new Error("caller cancelled");
    const adapter = new McpReadDocAdapter({
      consent,
      createSession: () => {
        const session = new SdkMcpSession({ command: process.execPath, args: [serverPath, fixtureRoot] });
        queueMicrotask(() => caller.abort(reason));
        return session;
      },
    });
    await expect(adapter.read({ documentId: "execution-journal" }, caller.signal, {
      runId: "cancel-run-1", callId: "cancel-tool-1",
    })).rejects.toBe(reason);
  }, 10_000);

  it("runs iteration 3 through the shared loop and persists correlated safe evidence", async () => {
    const journalRoot = await temporaryRoot();
    const { createMcpRuntime } = await compiledRuntime();
    const runtime = await createMcpRuntime({ fixtureRoot, journalRoot, mcpConsent: "read_doc" });
    const result = await runtime.runAgent({ question: "doc:execution-journal" });
    expect(result).toMatchObject({
      ok: true, sources: [{ documentId: "execution-journal", title: "Execution Journal" }],
      usage: { modelCalls: 2, toolCalls: 1 },
    });
    const files = await readdir(journalRoot);
    expect(files).toEqual([`${result.runId}.jsonl`]);
    const raw = await readFile(join(journalRoot, files[0]!), "utf8");
    const events = raw.trimEnd().split("\n").map((line) => RegisteredAgentEventEnvelopeSchema.parse(JSON.parse(line)));
    expect(events).toHaveLength(8);
    expect(events.every(({ runId }) => runId === result.runId)).toBe(true);
    expect(events.find(({ eventType }) => eventType === "tool.requested")?.payload).toMatchObject({
      toolName: "mcp_read_doc", callId: expect.any(String),
    });
    expect(raw).not.toContain("doc:execution-journal");
    expect(raw).not.toContain("The execution journal preserves evidence");
  }, 10_000);

  it("denies an ungranted capability and leaves a typed failure journal", async () => {
    const journalRoot = await temporaryRoot();
    const { createMcpRuntime } = await compiledRuntime();
    const runtime = await createMcpRuntime({ fixtureRoot: "unused-without-consent", journalRoot });
    const result = await runtime.runAgent({ question: "doc:execution-journal" });
    expect(result).toMatchObject({ ok: false, error: { code: "TOOL_FAILURE" } });
    const raw = await readFile(join(journalRoot, `${result.runId}.jsonl`), "utf8");
    const events = raw.trimEnd().split("\n").map((line) => RegisteredAgentEventEnvelopeSchema.parse(JSON.parse(line)));
    expect(events.find(({ eventType }) => eventType === "tool.failed")?.payload).toMatchObject({ toolErrorCode: "TOOL_PERMISSION_DENIED" });
    expect(events.at(-1)?.eventType).toBe("run.failed");
  });

  it("runs the consented MCP capability through a real HTTP entry point", async () => {
    const { startServer } = await import(pathToFileURL(join(root, "dist/src/composition/server.js")).href) as typeof import("../../src/composition/server.js");
    const app = await startServer({ fixtureRoot, journalRoot: await temporaryRoot(), iteration: 3, mcpConsent: "read_doc", port: 0 });
    try {
      const address = app.server.address();
      if (address === null || typeof address === "string") throw new Error("Expected a TCP listener.");
      const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/agent-runs`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: "doc:execution-journal" }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true, usage: { modelCalls: 2, toolCalls: 1 } });
    } finally {
      await app.close();
    }
  }, 10_000);
});
