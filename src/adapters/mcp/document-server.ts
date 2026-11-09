import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

import type { ReadDocPort } from "../../application/ports/read-doc-port.js";
import { McpCorrelationMetadataSchema, MCP_SERVER_ID } from "../../domain/mcp-contracts.js";
import { ReadDocInputSchema, ReadDocOutputSchema } from "../../domain/tool-contracts.js";
import { MarkdownSearchDocs } from "../outbound/markdown-search-docs.js";

export function createDocumentMcpServer(documents: ReadDocPort): McpServer {
  const server = new McpServer({ name: MCP_SERVER_ID, version: "1.0.0" });
  server.registerTool("read_doc", {
    description: "Read a controlled documentation fixture by ID",
    inputSchema: ReadDocInputSchema, outputSchema: ReadDocOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, async (input, context) => {
    const receipt = McpCorrelationMetadataSchema.safeParse(context.mcpReq._meta);
    if (!receipt.success) return { content: [{ type: "text", text: "Invalid correlation metadata." }], isError: true };
    const output = await documents.read(input, context.mcpReq.signal);
    return {
      content: [{ type: "text", text: JSON.stringify(output) }],
      structuredContent: output, _meta: receipt.data,
    };
  });
  return server;
}

export async function startDocumentMcpServer(root: string) {
  const documents = await MarkdownSearchDocs.load({ root });
  return serveStdio(() => createDocumentMcpServer(documents), { legacy: "reject", onerror: () => {} });
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && pathToFileURL(resolve(invokedPath)).href === import.meta.url) {
  const fixtureRoot = process.argv[2];
  if (fixtureRoot === undefined || process.argv.length !== 3) {
    process.exitCode = 1;
  } else {
    startDocumentMcpServer(fixtureRoot).catch(() => {
      process.stderr.write("The MCP fixture server could not start.\n");
      process.exitCode = 1;
    });
  }
}
