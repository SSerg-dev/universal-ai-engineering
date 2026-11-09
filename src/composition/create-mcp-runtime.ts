import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { JsonlJournal } from "../adapters/outbound/jsonl-journal.js";
import { McpReadDocAdapter } from "../adapters/outbound/mcp-read-doc.js";
import { McpTeachingModel } from "../adapters/outbound/mcp-teaching-model.js";
import { SdkMcpSession } from "../adapters/outbound/sdk-mcp-session.js";
import { SystemClock } from "../adapters/outbound/system-clock.js";
import { SystemIdGenerator } from "../adapters/outbound/system-id-generator.js";
import { createRegisteredRunAgentUseCase } from "../application/run-registered-agent.js";
import { defineTool, ToolRegistry } from "../application/tool-registry.js";
import { MCP_REMOTE_TOOL_NAME, MCP_SERVER_ID, MCP_TOOL_ALIAS } from "../domain/mcp-contracts.js";
import { ReadDocInputSchema, ReadDocOutputSchema } from "../domain/tool-contracts.js";
import type { CreateRuntimeOptions, Runtime } from "./create-runtime.js";

export interface CreateMcpRuntimeOptions extends CreateRuntimeOptions {
  readonly mcpConsent?: unknown;
}

export async function createMcpRuntime(options: CreateMcpRuntimeOptions): Promise<Runtime> {
  const granted = options.mcpConsent === MCP_REMOTE_TOOL_NAME;
  const adapter = new McpReadDocAdapter({
    consent: granted ? { serverId: MCP_SERVER_ID, toolName: MCP_REMOTE_TOOL_NAME, granted: true } : undefined,
    createSession: () => new SdkMcpSession({
      command: process.execPath,
      args: [fileURLToPath(new URL("../adapters/mcp/document-server.js", import.meta.url)), resolve(options.fixtureRoot)],
    }),
  });
  const tools = new ToolRegistry([defineTool({
    name: MCP_TOOL_ALIAS, description: "Read an approved controlled MCP documentation fixture",
    inputSchema: ReadDocInputSchema, outputSchema: ReadDocOutputSchema,
    execute: (input, signal, context) => adapter.read(input, signal, context),
    sources: (output) => output.document === null ? [] : [{
      documentId: output.document.documentId, title: output.document.title,
    }],
  })]);
  return {
    runAgent: createRegisteredRunAgentUseCase({
      model: new McpTeachingModel(), tools,
      journal: new JsonlJournal({ root: options.journalRoot }),
      clock: new SystemClock(), ids: new SystemIdGenerator(),
      policy: { timeoutMs: 5_000, terminalEvidenceTimeoutMs: 250, maxModelCalls: 2, maxToolCalls: 1 },
      toolPolicy: { allowedTools: new Set(granted ? [MCP_TOOL_ALIAS] : []), timeoutMs: 4_000 },
      includeCallContext: true,
    }),
  };
}
