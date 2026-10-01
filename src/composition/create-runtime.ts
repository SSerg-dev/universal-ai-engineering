import { DeterministicTeachingModel } from "../adapters/outbound/deterministic-model.js";
import { JsonlJournal } from "../adapters/outbound/jsonl-journal.js";
import { MarkdownSearchDocs } from "../adapters/outbound/markdown-search-docs.js";
import { SystemClock } from "../adapters/outbound/system-clock.js";
import { SystemIdGenerator } from "../adapters/outbound/system-id-generator.js";
import {
  createRunAgentUseCase,
  type RunAgentUseCase,
} from "../application/run-agent.js";

export interface Runtime {
  readonly runAgent: RunAgentUseCase;
}

export interface CreateRuntimeOptions {
  readonly fixtureRoot: string;
  readonly journalRoot: string;
}

export async function createRuntime(
  options: CreateRuntimeOptions,
): Promise<Runtime> {
  const searchDocs = await MarkdownSearchDocs.load({ root: options.fixtureRoot });

  return {
    runAgent: createRunAgentUseCase({
      model: new DeterministicTeachingModel(),
      searchDocs,
      journal: new JsonlJournal({ root: options.journalRoot }),
      clock: new SystemClock(),
      ids: new SystemIdGenerator(),
      policy: {
        timeoutMs: 5_000,
        terminalEvidenceTimeoutMs: 250,
        maxModelCalls: 2,
        maxToolCalls: 1,
      },
    }),
  };
}
