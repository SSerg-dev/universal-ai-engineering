import { createRuntime, type CreateRuntimeOptions, type Runtime } from "./create-runtime.js";
import { createToolRuntime } from "./create-tool-runtime.js";

export interface CreateIterationRuntimeOptions extends CreateRuntimeOptions {
  readonly iteration?: unknown;
}

export function createIterationRuntime(options: CreateIterationRuntimeOptions): Promise<Runtime> {
  const iteration = options.iteration ?? 1;
  if (iteration === 1 || iteration === "1") return createRuntime(options);
  if (iteration === 2 || iteration === "2") return createToolRuntime(options);
  throw new Error("The selected iteration is unsupported.");
}
