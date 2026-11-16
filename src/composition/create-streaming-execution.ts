import { JsonlJournal } from "../adapters/outbound/jsonl-journal.js";
import { SystemIdGenerator } from "../adapters/outbound/system-id-generator.js";
import type { StreamExecutionPort } from "../application/ports/stream-port.js";
import { GroundedRunAgentResultSchema } from "../domain/retrieval-contracts.js";
import type { GroundedRuntimeOptions } from "./create-grounded-runtime.js";
import { createObservedGroundedRuntime } from "./create-observed-grounded-runtime.js";

export function createStreamingExecution(options: GroundedRuntimeOptions & { telemetryRoot: string }): StreamExecutionPort {
  return { execute: async (input, runId, signal, onPersisted) => {
    const generated = new SystemIdGenerator(), journal = new JsonlJournal({ root: options.journalRoot });
    const observed = await createObservedGroundedRuntime({ ...options,
      ids: { next: (kind) => kind === "run" ? runId : generated.next(kind) },
      journal: { append: async (event, activeSignal) => { await journal.append(event, activeSignal); onPersisted(event); } },
    });
    return GroundedRunAgentResultSchema.parse(await observed.runAgent(input, signal));
  } };
}
