import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import { McpReadDocAdapter } from "../../src/adapters/outbound/mcp-read-doc.js";
import { SdkMcpSession } from "../../src/adapters/outbound/sdk-mcp-session.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const fixtureRoot = join(root, "fixtures/docs");
const serverPath = join(root, "dist/src/adapters/mcp/document-server.js");
const consent = { serverId: "uaos-docs", toolName: "read_doc", granted: true };

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
});
