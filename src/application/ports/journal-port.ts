import type { AgentEventEnvelope } from "../../domain/agent-events.js";
import type { ExecutionEventEnvelope } from "../../domain/tool-events.js";

export interface JournalPort<TEvent extends ExecutionEventEnvelope = AgentEventEnvelope> {
  append(event: TEvent, signal: AbortSignal): Promise<void>;
}
