import { GroundedTeachingModel } from "../adapters/outbound/grounded-teaching-model.js";
import { JsonlJournal } from "../adapters/outbound/jsonl-journal.js";
import { SystemClock } from "../adapters/outbound/system-clock.js";
import { SystemIdGenerator } from "../adapters/outbound/system-id-generator.js";
import { createRetrievePassages } from "../application/retrieve-passages.js";
import { createResolveCitation } from "../application/resolve-citation.js";
import { createGroundedRunAgentUseCase } from "../application/run-grounded-agent.js";
import { defineTool, ToolRegistry } from "../application/tool-registry.js";
import { RetrievalInputSchema, RetrievalOutputSchema } from "../domain/retrieval-contracts.js";
import { createRetrievalResources, type RetrievalResourceOptions } from "./create-retrieval-resources.js";
import type { CreateRuntimeOptions, Runtime } from "./create-runtime.js";

export async function createGroundedRuntime(options: CreateRuntimeOptions & RetrievalResourceOptions): Promise<Runtime> {
  const resources = createRetrievalResources(options);
  const retrieve = createRetrievePassages({ ...resources, minimumScore: 0.15 });
  const tools = new ToolRegistry([defineTool({
    name: "retrieve_passages", description: "Retrieve controlled indexed evidence",
    inputSchema: RetrievalInputSchema, outputSchema: RetrievalOutputSchema, execute: retrieve,
    sources: (output) => [...new Map(output.passages.map(({ documentId, title }) => [documentId, { documentId, title }])).values()],
  })]);
  return {
    runAgent: createGroundedRunAgentUseCase({
      model: new GroundedTeachingModel(), tools, journal: new JsonlJournal({ root: options.journalRoot }),
      clock: new SystemClock(), ids: new SystemIdGenerator(),
      policy: { timeoutMs: 5000, terminalEvidenceTimeoutMs: 250, maxModelCalls: 2, maxToolCalls: 1 },
      toolPolicy: { allowedTools: new Set(["retrieve_passages"]), timeoutMs: 4000 },
    }),
    resolveCitation: createResolveCitation(resources.manifest.indexId, resources.repository),
  };
}
