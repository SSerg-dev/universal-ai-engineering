import type { AgentEventEnvelope } from "../../domain/agent-events.js";

export interface JournalPort {
  append(event: AgentEventEnvelope, signal: AbortSignal): Promise<void>;
}
