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
import type { IdGeneratorPort } from "../application/ports/id-generator-port.js";
import type { TurnContext } from "../application/ports/turn-execution-port.js";
import type { JournalPort } from "../application/ports/journal-port.js";
import type { RegisteredAgentEventEnvelope } from "../domain/tool-events.js";
import type { RetrievalMeasurementPort } from "../application/ports/telemetry-port.js";

export interface GroundedRuntimeOptions extends CreateRuntimeOptions, RetrievalResourceOptions {
  readonly ids?: IdGeneratorPort;
  readonly context?: TurnContext;
  readonly journal?: JournalPort<RegisteredAgentEventEnvelope>;
  readonly allowedTools?: ReadonlySet<string>;
  readonly onRetrieved?: (passageIds: readonly string[]) => void;
  readonly retrievalMeasurement?: RetrievalMeasurementPort;
}

export type GroundedRuntimeFactory = (options: GroundedRuntimeOptions) => Promise<Runtime>;

export async function createGroundedRuntime(options: GroundedRuntimeOptions): Promise<Runtime> {
  const resources = createRetrievalResources(options);
  const retrieve = createRetrievePassages({ ...resources, minimumScore: 0.15 });
  const tools = new ToolRegistry([defineTool({
    name: "retrieve_passages", description: "Retrieve controlled indexed evidence",
    inputSchema: RetrievalInputSchema, outputSchema: RetrievalOutputSchema,
    execute: async (input, signal) => {
      const output = options.retrievalMeasurement
        ? await options.retrievalMeasurement.measure(() => retrieve(input, signal), signal)
        : await retrieve(input, signal);
      options.onRetrieved?.(Object.freeze(output.passages.map(({ passageId }) => passageId)));
      return output;
    },
    sources: (output) => [...new Map(output.passages.map(({ documentId, title }) => [documentId, { documentId, title }])).values()],
  })]);
  return {
    runAgent: createGroundedRunAgentUseCase({
      model: new GroundedTeachingModel(options.context), tools,
      journal: options.journal ?? new JsonlJournal({ root: options.journalRoot }),
      clock: new SystemClock(), ids: options.ids ?? new SystemIdGenerator(),
      policy: { timeoutMs: 5000, terminalEvidenceTimeoutMs: 250, maxModelCalls: 2, maxToolCalls: 1 },
      toolPolicy: { allowedTools: options.allowedTools ?? new Set(["retrieve_passages"]), timeoutMs: 4000 },
    }),
    resolveCitation: createResolveCitation(resources.manifest.indexId, resources.repository),
  };
}
