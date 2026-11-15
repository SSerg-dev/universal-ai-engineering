import { randomUUID } from "node:crypto";

import { JsonlJournal } from "../adapters/outbound/jsonl-journal.js";
import { PerformanceClock } from "../adapters/outbound/performance-clock.js";
import { SystemClock } from "../adapters/outbound/system-clock.js";
import { SystemIdGenerator } from "../adapters/outbound/system-id-generator.js";
import { RunStreamBroker } from "../application/run-stream-broker.js";
import { GroundedRunAgentResultSchema } from "../domain/retrieval-contracts.js";
import type { RetrievalResourceOptions } from "./create-retrieval-resources.js";
import type { CreateRuntimeOptions, Runtime } from "./create-runtime.js";
import { createObservedGroundedRuntime } from "./create-observed-grounded-runtime.js";
import { createObservedRuntime } from "./create-observed-runtime.js";

export async function createStreamingRuntime(options: CreateRuntimeOptions & RetrievalResourceOptions & {
  reportRoot: string; telemetryRoot: string;
}): Promise<Runtime> {
  const runtime = await createObservedRuntime(options);
  const streams = new RunStreamBroker({ clock: new SystemClock(), monotonic: new PerformanceClock(),
    ids: { nextRunId: () => `run-${randomUUID()}` }, executor: {
      execute: async (input, runId, signal, onPersisted) => {
        const generated = new SystemIdGenerator(), journal = new JsonlJournal({ root: options.journalRoot });
        const observed = await createObservedGroundedRuntime({ ...options,
          ids: { next: (kind) => kind === "run" ? runId : generated.next(kind) },
          journal: { append: async (event, activeSignal) => { await journal.append(event, activeSignal); onPersisted(event); } },
        });
        return GroundedRunAgentResultSchema.parse(await observed.runAgent(input, signal));
      },
    },
  });
  return { ...runtime, streams };
}
