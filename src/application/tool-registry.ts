import type { z } from "zod";

import type { RunAgentSource } from "../domain/agent-contracts.js";
import {
  ToolDescriptorSchema,
  ToolCallContextSchema,
  ToolExecutionResultSchema,
  ToolInvocationSchema,
  ToolObservationSchema,
  type ToolDescriptor,
  type ToolErrorCode,
  type ToolExecutionResult,
  type ToolCallContext,
} from "../domain/tool-contracts.js";
import type { ToolDispatcherPort, ToolInvocationOptions } from "./ports/tool-dispatcher-port.js";

export interface ToolDefinition<TInput, TOutput> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: z.ZodType<TInput>;
  readonly outputSchema: z.ZodType<TOutput>;
  execute(input: TInput, signal: AbortSignal, context?: ToolCallContext): Promise<unknown>;
  sources?(output: TOutput): readonly RunAgentSource[];
}

export interface RegisteredTool {
  readonly descriptor: ToolDescriptor;
  execute(input: unknown, signal: AbortSignal, context?: ToolCallContext): Promise<ToolExecutionResult>;
}

function failure(code: ToolErrorCode): ToolExecutionResult {
  return { ok: false, code };
}

export function defineTool<TInput, TOutput>(definition: ToolDefinition<TInput, TOutput>): RegisteredTool {
  const { inputSchema, outputSchema } = definition;
  const execute = definition.execute.bind(definition);
  const sources = definition.sources?.bind(definition);
  const descriptor = Object.freeze(ToolDescriptorSchema.parse({
    name: definition.name,
    description: definition.description,
  }));

  return Object.freeze({
    descriptor,
    async execute(rawInput: unknown, signal: AbortSignal, context?: ToolCallContext): Promise<ToolExecutionResult> {
      signal.throwIfAborted();
      const input = await inputSchema.safeParseAsync(rawInput);
      signal.throwIfAborted();
      if (!input.success) return failure("TOOL_INPUT_INVALID");

      const output = context === undefined
        ? await execute(input.data, signal)
        : await execute(input.data, signal, context);
      signal.throwIfAborted();
      const parsedOutput = await outputSchema.safeParseAsync(output);
      signal.throwIfAborted();
      if (!parsedOutput.success) return failure("TOOL_OUTPUT_INVALID");

      const observation = ToolObservationSchema.safeParse({
        toolName: descriptor.name,
        output: parsedOutput.data,
        sources: sources?.(parsedOutput.data) ?? [],
      });
      return observation.success
        ? { ok: true, observation: observation.data }
        : failure("TOOL_OUTPUT_INVALID");
    },
  });
}

export class ToolRegistry implements ToolDispatcherPort {
  readonly #tools = new Map<string, RegisteredTool>();
  readonly #descriptors: readonly ToolDescriptor[];

  constructor(tools: readonly RegisteredTool[]) {
    for (const tool of tools) {
      const descriptor = Object.freeze(ToolDescriptorSchema.parse(tool.descriptor));
      if (this.#tools.has(descriptor.name)) {
        throw new Error("Duplicate tool registration.");
      }
      this.#tools.set(descriptor.name, Object.freeze({
        descriptor,
        execute: tool.execute.bind(tool),
      }));
    }
    this.#descriptors = Object.freeze([...this.#tools.values()].map((tool) => tool.descriptor));
  }

  descriptors(): readonly ToolDescriptor[] {
    return this.#descriptors;
  }

  async invoke(rawInput: unknown, options: ToolInvocationOptions): Promise<ToolExecutionResult> {
    if (options.signal.aborted) return failure("TOOL_CANCELLED");
    const input = ToolInvocationSchema.safeParse(rawInput);
    if (!input.success) return failure("TOOL_INPUT_INVALID");
    const tool = this.#tools.get(input.data.toolName);
    if (tool === undefined) return failure("TOOL_NOT_FOUND");
    if (!options.allowedTools.has(input.data.toolName)) return failure("TOOL_PERMISSION_DENIED");
    const context = ToolCallContextSchema.optional().safeParse(options.context);
    if (!context.success) return failure("TOOL_INPUT_INVALID");
    if (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0 || options.timeoutMs > 2_147_483_647) {
      return failure("TOOL_EXECUTION_FAILED");
    }

    const controller = new AbortController();
    let cancellationCode: "TOOL_CANCELLED" | "TOOL_TIMEOUT" = "TOOL_CANCELLED";
    const abort = (code: typeof cancellationCode) => {
      if (!controller.signal.aborted) {
        cancellationCode = code;
        controller.abort();
      }
    };
    const cancel = () => abort("TOOL_CANCELLED");
    options.signal.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => abort("TOOL_TIMEOUT"), options.timeoutMs);
    let onAbort!: () => void;
    const aborted = new Promise<ToolExecutionResult>((resolve) => {
      onAbort = () => resolve(failure(cancellationCode));
      controller.signal.addEventListener("abort", onAbort, { once: true });
    });

    try {
      const execution = Promise.resolve()
        .then(() => tool.execute(input.data.arguments, controller.signal, context.data))
        .catch(() => failure("TOOL_EXECUTION_FAILED"));
      const result = await Promise.race([execution, aborted]);
      if (controller.signal.aborted) return failure(cancellationCode);
      const parsedResult = ToolExecutionResultSchema.safeParse(result);
      if (!parsedResult.success) return failure("TOOL_OUTPUT_INVALID");
      if (parsedResult.data.ok && parsedResult.data.observation.toolName !== input.data.toolName) {
        return failure("TOOL_OUTPUT_INVALID");
      }
      return parsedResult.data;
    } finally {
      clearTimeout(timer);
      options.signal.removeEventListener("abort", cancel);
      controller.signal.removeEventListener("abort", onAbort);
    }
  }
}
