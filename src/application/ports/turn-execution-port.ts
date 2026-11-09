import type { GroundedRunAgentResult } from "../../domain/retrieval-contracts.js";
import type { ConversationTurn, MemoryRecord } from "../../domain/state-contracts.js";

export interface TurnContext {
  readonly conversationId: string;
  readonly requestId: string;
  readonly runId: string;
  readonly history: readonly Extract<ConversationTurn, { status: "settled" }>[];
  readonly memories: readonly MemoryRecord[];
}
export interface TurnExecutionPort {
  execute(question: string, context: TurnContext, signal: AbortSignal): Promise<GroundedRunAgentResult>;
}
