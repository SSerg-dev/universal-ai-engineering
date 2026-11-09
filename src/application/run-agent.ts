import {
  ModelActionSchema,
  SearchDocsInputSchema,
  SearchDocsOutputSchema,
  type SearchDocsOutput,
} from "../domain/agent-contracts.js";
import { AgentEventEnvelopeSchema, type AgentEventEnvelope } from "../domain/agent-events.js";
import {
  createAgentLoop,
  type RunAgentPolicy,
  type RunAgentUseCase,
} from "./agent-loop.js";
import type { ClockPort } from "./ports/clock-port.js";
import type { IdGeneratorPort } from "./ports/id-generator-port.js";
import type { JournalPort } from "./ports/journal-port.js";
import type { ModelPort } from "./ports/model-port.js";
import type { SearchDocsPort } from "./ports/search-docs-port.js";

export type { RunAgentPolicy, RunAgentUseCase } from "./agent-loop.js";

export interface RunAgentDependencies {
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
  readonly journal: JournalPort;
  readonly model: ModelPort;
  readonly searchDocs: SearchDocsPort;
  readonly policy: RunAgentPolicy;
}

export function createRunAgentUseCase(dependencies: RunAgentDependencies): RunAgentUseCase {
  return createAgentLoop<SearchDocsOutput, AgentEventEnvelope>({
    ...dependencies,
    schemaVersion: "1.0",
    eventSchema: AgentEventEnvelopeSchema,
    actionSchema: ModelActionSchema,
    executeTool: async (action, signal) => {
      const input = SearchDocsInputSchema.parse(action.arguments);
      const observation = SearchDocsOutputSchema.parse(await dependencies.searchDocs.search(input, signal));
      return {
        ok: true,
        observation,
        sources: observation.matches.map(({ documentId, title }) => ({ documentId, title })),
      };
    },
  });
}
