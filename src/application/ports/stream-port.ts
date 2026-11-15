import type { GroundedRunAgentResult } from "../../domain/retrieval-contracts.js";
import type { StreamEvent } from "../../domain/stream-contracts.js";
import type { RegisteredAgentEventEnvelope } from "../../domain/tool-events.js";

export interface StreamExecutionPort {
  execute(input: { question: string }, runId: string, signal: AbortSignal,
    onPersisted: (event: RegisteredAgentEventEnvelope) => void): Promise<GroundedRunAgentResult>;
}
export interface StreamIdGeneratorPort { nextRunId(): string }
export interface StreamSubscription {
  readonly terminal: boolean;
  unsubscribe(): void;
}
export interface RunStreamPort {
  create(input: unknown): { runId: string };
  subscribe(runId: unknown, after: unknown, listener: (event: StreamEvent) => boolean | void): StreamSubscription;
  cancel(runId: unknown): { runId: string; requested: boolean; terminal: boolean };
  close(): void;
}
