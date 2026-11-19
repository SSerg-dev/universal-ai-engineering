import { randomUUID } from "node:crypto";

import { PerformanceClock } from "../adapters/outbound/performance-clock.js";
import { SystemClock } from "../adapters/outbound/system-clock.js";
import { RunStreamBroker } from "../application/run-stream-broker.js";
import type { StreamExecutionPort } from "../application/ports/stream-port.js";
import type { RetrievalResourceOptions } from "./create-retrieval-resources.js";
import type { CreateRuntimeOptions, Runtime } from "./create-runtime.js";
import { createObservedRuntime } from "./create-observed-runtime.js";
import { createStreamingExecution } from "./create-streaming-execution.js";
import type { GroundedRuntimeFactory } from "./create-grounded-runtime.js";

export async function createStreamingRuntime(options: CreateRuntimeOptions & RetrievalResourceOptions & {
  reportRoot: string; telemetryRoot: string; streamExecutor?: StreamExecutionPort; groundedFactory?: GroundedRuntimeFactory; documentLibrary?: boolean;
}): Promise<Runtime> {
  const runtime = await createObservedRuntime(options);
  const streams = new RunStreamBroker({ clock: new SystemClock(), monotonic: new PerformanceClock(),
    ids: { nextRunId: () => `run-${randomUUID()}` }, executor: options.streamExecutor ?? createStreamingExecution(options),
  });
  const documents = options.documentLibrary ? await import("./create-document-library.js").then(({ createLocalDocumentLibrary }) => createLocalDocumentLibrary(options)) : undefined;
  return { ...runtime, streams, ...(documents ? { documents } : {}) };
}
