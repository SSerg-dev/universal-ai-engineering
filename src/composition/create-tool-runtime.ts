import { JsonlJournal } from "../adapters/outbound/jsonl-journal.js";
import { MarkdownSearchDocs } from "../adapters/outbound/markdown-search-docs.js";
import { RegisteredTeachingModel } from "../adapters/outbound/registered-teaching-model.js";
import { SystemClock } from "../adapters/outbound/system-clock.js";
import { SystemIdGenerator } from "../adapters/outbound/system-id-generator.js";
import { createRegisteredRunAgentUseCase } from "../application/run-registered-agent.js";
import { defineTool, ToolRegistry } from "../application/tool-registry.js";
import { SearchDocsInputSchema, SearchDocsOutputSchema } from "../domain/agent-contracts.js";
import { ReadDocInputSchema, ReadDocOutputSchema } from "../domain/tool-contracts.js";
import type { CreateRuntimeOptions, Runtime } from "./create-runtime.js";

export async function createToolRuntime(options: CreateRuntimeOptions): Promise<Runtime> {
  const documents = await MarkdownSearchDocs.load({ root: options.fixtureRoot });
  const tools = new ToolRegistry([
    defineTool({
      name: "search_docs", description: "Search the controlled documentation snapshot",
      inputSchema: SearchDocsInputSchema, outputSchema: SearchDocsOutputSchema,
      execute: (input, signal) => documents.search(input, signal),
      sources: (output) => output.matches.map(({ documentId, title }) => ({ documentId, title })),
    }),
    defineTool({
      name: "read_doc", description: "Read one controlled document by ID",
      inputSchema: ReadDocInputSchema, outputSchema: ReadDocOutputSchema,
      execute: (input, signal) => documents.read(input, signal),
      sources: (output) => output.document === null ? [] : [{
        documentId: output.document.documentId, title: output.document.title,
      }],
    }),
  ]);
  return {
    runAgent: createRegisteredRunAgentUseCase({
      model: new RegisteredTeachingModel(), tools,
      journal: new JsonlJournal({ root: options.journalRoot }),
      clock: new SystemClock(), ids: new SystemIdGenerator(),
      policy: { timeoutMs: 5_000, terminalEvidenceTimeoutMs: 250, maxModelCalls: 2, maxToolCalls: 1 },
      toolPolicy: { allowedTools: new Set(["search_docs", "read_doc"]), timeoutMs: 1_000 },
    }),
  };
}
