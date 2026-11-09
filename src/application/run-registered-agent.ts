import {
  RegisteredModelActionSchema,
  ToolExecutionResultSchema,
  type ToolObservation,
} from "../domain/tool-contracts.js";
import {
  RegisteredAgentEventEnvelopeSchema,
  type RegisteredAgentEventEnvelope,
} from "../domain/tool-events.js";
import { createAgentLoop, type RunAgentPolicy, type RunAgentUseCase } from "./agent-loop.js";
import type { ClockPort } from "./ports/clock-port.js";
import type { IdGeneratorPort } from "./ports/id-generator-port.js";
import type { JournalPort } from "./ports/journal-port.js";
import type { ModelPort } from "./ports/model-port.js";
import type { ToolDispatcherPort, ToolInvocationOptions } from "./ports/tool-dispatcher-port.js";

export interface RegisteredRunAgentDependencies {
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
  readonly journal: JournalPort<RegisteredAgentEventEnvelope>;
  readonly model: ModelPort<ToolObservation>;
  readonly tools: ToolDispatcherPort;
  readonly policy: RunAgentPolicy;
  readonly toolPolicy: Pick<ToolInvocationOptions, "allowedTools" | "timeoutMs">;
}

export function createRegisteredRunAgentUseCase(dependencies: RegisteredRunAgentDependencies): RunAgentUseCase {
  const allowedTools = new Set(dependencies.toolPolicy.allowedTools);
  const timeoutMs = dependencies.toolPolicy.timeoutMs;
  return createAgentLoop<ToolObservation, RegisteredAgentEventEnvelope>({
    ...dependencies,
    schemaVersion: "1.1",
    eventSchema: RegisteredAgentEventEnvelopeSchema,
    actionSchema: RegisteredModelActionSchema,
    executeTool: async (action, signal) => {
      let rawResult: unknown;
      try {
        rawResult = await dependencies.tools.invoke({
          toolName: action.toolName,
          arguments: action.arguments,
        }, { allowedTools, timeoutMs, signal });
      } catch {
        return { ok: false, code: "TOOL_EXECUTION_FAILED" };
      }
      const result = ToolExecutionResultSchema.safeParse(rawResult);
      if (!result.success) return { ok: false, code: "TOOL_OUTPUT_INVALID" };
      if (!result.data.ok) return result.data;
      const observation = result.data.observation;
      if (observation.toolName !== action.toolName) {
        return { ok: false, code: "TOOL_OUTPUT_INVALID" };
      }
      return { ok: true, observation, sources: observation.sources };
    },
  });
}
