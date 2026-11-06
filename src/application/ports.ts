import type { RunEvent, ToolInput, ToolObservation } from "../domain/contracts.js";

export interface Model {
  nextAction(
    context: { question: string; observation?: ToolObservation },
    signal: AbortSignal,
  ): Promise<unknown>;
}

export interface Tool {
  execute(input: ToolInput, signal: AbortSignal): Promise<unknown>;
}

export interface Journal {
  append(event: RunEvent): Promise<void>;
}

export interface RunPorts {
  model: Model;
  tool: Tool;
  journal: Journal;
  createRunId(): string;
  now(): Date;
}
