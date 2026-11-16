import type { RunAgentInput } from "../../domain/agent-contracts.js";
import type { RegisteredModelAction } from "../../domain/tool-contracts.js";

export interface RunCheckpointContext { readonly runId: string }
export interface CallCheckpointContext extends RunCheckpointContext { readonly callId: string; readonly step: number }
export interface RunCheckpointsPort<TObservation = unknown> {
  request(input: RunAgentInput, context: RunCheckpointContext, signal: AbortSignal): Promise<boolean>;
  modelAction(action: RegisteredModelAction, context: CallCheckpointContext, signal: AbortSignal): Promise<boolean>;
  toolInvocation(action: Extract<RegisteredModelAction, { type: "call_tool" }>, context: CallCheckpointContext, signal: AbortSignal): Promise<boolean>;
  toolObservation(observation: TObservation, context: CallCheckpointContext, signal: AbortSignal): Promise<boolean>;
}
