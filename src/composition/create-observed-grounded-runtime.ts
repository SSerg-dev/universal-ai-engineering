import { randomUUID } from "node:crypto";

import { FilesystemTelemetry } from "../adapters/outbound/filesystem-telemetry.js";
import { JsonlJournal } from "../adapters/outbound/jsonl-journal.js";
import { PerformanceClock } from "../adapters/outbound/performance-clock.js";
import { SystemClock } from "../adapters/outbound/system-clock.js";
import { SystemIdGenerator } from "../adapters/outbound/system-id-generator.js";
import { ObservedRun } from "../application/observed-run.js";
import type { TelemetrySinkPort } from "../application/ports/telemetry-port.js";
import { createGroundedRuntime, type GroundedRuntimeOptions } from "./create-grounded-runtime.js";
import type { Runtime } from "./create-runtime.js";

export interface ObservedGroundedOptions extends GroundedRuntimeOptions {
  readonly telemetryRoot: string;
  readonly telemetrySink?: TelemetrySinkPort;
  readonly telemetryFlushTimeoutMs?: number;
}

export async function createObservedGroundedRuntime(options: ObservedGroundedOptions): Promise<Runtime> {
  const base = await createGroundedRuntime(options);
  return { ...base, runAgent: async (input, signal) => {
    const generated = options.ids ?? new SystemIdGenerator();
    const runId = generated.next("run");
    const observation = new ObservedRun({ runId,
      journal: options.journal ?? new JsonlJournal({ root: options.journalRoot }),
      clock: new SystemClock(), monotonic: new PerformanceClock(),
      ids: { nextSpanId: () => `span-${randomUUID()}` },
      sink: options.telemetrySink ?? new FilesystemTelemetry({ root: options.telemetryRoot }),
      ...(options.telemetryFlushTimeoutMs === undefined ? {} : { flushTimeoutMs: options.telemetryFlushTimeoutMs }),
    });
    const runtime = await createGroundedRuntime({ ...options,
      ids: { next: (kind) => kind === "run" ? runId : generated.next(kind) },
      journal: observation, retrievalMeasurement: observation,
    });
    const result = await runtime.runAgent(input, signal);
    // Optional export is outside the primary deadline and cannot replace its result.
    try { await observation.finish(result); } catch { /* Metadata export is best effort. */ }
    return result;
  } };
}
