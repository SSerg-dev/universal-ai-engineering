import { randomUUID } from "node:crypto";

import { FilesystemTelemetry } from "../adapters/outbound/filesystem-telemetry.js";
import { PerformanceClock } from "../adapters/outbound/performance-clock.js";
import { SystemClock } from "../adapters/outbound/system-clock.js";
import { observeEvaluation, observeStateCommand, type OperationObservationOptions } from "../application/observe-operations.js";
import type { RetrievalResourceOptions } from "./create-retrieval-resources.js";
import type { CreateRuntimeOptions, Runtime } from "./create-runtime.js";
import { createEvaluationRuntime } from "./create-evaluation-runtime.js";
import { createObservedGroundedRuntime } from "./create-observed-grounded-runtime.js";
import { createTelemetryInspector } from "./create-telemetry-inspector.js";
import type { GroundedRuntimeFactory } from "./create-grounded-runtime.js";

export async function createObservedRuntime(options: CreateRuntimeOptions & RetrievalResourceOptions & {
  reportRoot: string; telemetryRoot: string; groundedFactory?: GroundedRuntimeFactory;
}): Promise<Runtime> {
  const runtime = await createEvaluationRuntime({ ...options,
    groundedFactory: options.groundedFactory ?? ((grounded) => createObservedGroundedRuntime({ ...grounded, telemetryRoot: options.telemetryRoot })),
  });
  const observation: OperationObservationOptions = {
    clock: new SystemClock(), monotonic: new PerformanceClock(),
    ids: { nextOperationId: () => `operation-${randomUUID()}`, nextSpanId: () => `span-${randomUUID()}` },
    sink: () => new FilesystemTelemetry({ root: options.telemetryRoot }),
  };
  return { ...runtime,
    conversationCommand: observeStateCommand(runtime.conversationCommand!, observation),
    evaluate: observeEvaluation(runtime.evaluate!, observation),
    inspect: createTelemetryInspector(options.telemetryRoot),
  };
}
