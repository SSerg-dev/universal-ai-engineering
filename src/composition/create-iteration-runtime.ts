import { createRuntime, type CreateRuntimeOptions, type Runtime } from "./create-runtime.js";
import { createToolRuntime } from "./create-tool-runtime.js";
import { resolve } from "node:path";

export interface CreateIterationRuntimeOptions extends CreateRuntimeOptions {
  readonly iteration?: unknown;
  readonly mcpConsent?: unknown;
  readonly databaseUrl?: unknown;
  readonly indexId?: unknown;
  readonly reportRoot?: string;
  readonly telemetryRoot?: string;
}

export function createIterationRuntime(options: CreateIterationRuntimeOptions): Promise<Runtime> {
  const iteration = options.iteration ?? 1;
  if (iteration === 1 || iteration === "1") return createRuntime(options);
  if (iteration === 2 || iteration === "2") return createToolRuntime(options);
  if (iteration === 3 || iteration === "3") {
    return import("./create-mcp-runtime.js").then(({ createMcpRuntime }) => createMcpRuntime(options));
  }
  if (iteration === 4 || iteration === "4") {
    return import("./create-grounded-runtime.js").then(({ createGroundedRuntime }) => createGroundedRuntime(options));
  }
  if (iteration === 5 || iteration === "5") {
    return import("./create-conversation-runtime.js").then(({ createConversationRuntime }) => createConversationRuntime(options));
  }
  if (iteration === 6 || iteration === "6") {
    return import("./create-evaluation-runtime.js").then(({ createEvaluationRuntime }) => createEvaluationRuntime({
      ...options, reportRoot: options.reportRoot ?? resolve(process.cwd(), ".uaos/evaluations"),
    }));
  }
  if (iteration === 7 || iteration === "7") {
    return import("./create-observed-runtime.js").then(({ createObservedRuntime }) => createObservedRuntime({
      ...options, reportRoot: options.reportRoot ?? resolve(process.cwd(), ".uaos/evaluations"),
      telemetryRoot: options.telemetryRoot ?? resolve(process.cwd(), ".uaos/telemetry"),
    }));
  }
  if (iteration === 8 || iteration === "8") {
    return import("./create-streaming-runtime.js").then(({ createStreamingRuntime }) => createStreamingRuntime({
      ...options, reportRoot: options.reportRoot ?? resolve(process.cwd(), ".uaos/evaluations"),
      telemetryRoot: options.telemetryRoot ?? resolve(process.cwd(), ".uaos/telemetry"),
    }));
  }
  throw new Error("The selected iteration is unsupported.");
}
