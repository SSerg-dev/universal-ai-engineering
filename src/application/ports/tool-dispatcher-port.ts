import type {
  ToolDescriptor,
  ToolExecutionResult,
  ToolInvocation,
} from "../../domain/tool-contracts.js";

export interface ToolInvocationOptions {
  readonly allowedTools: ReadonlySet<string>;
  readonly timeoutMs: number;
  readonly signal: AbortSignal;
}

export interface ToolDispatcherPort {
  descriptors(): readonly ToolDescriptor[];
  invoke(input: ToolInvocation, options: ToolInvocationOptions): Promise<ToolExecutionResult>;
}
