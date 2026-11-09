import type { GroundedRunAgentResult } from "../../domain/retrieval-contracts.js";
import type { StateAuditEvent } from "../../domain/state-contracts.js";

export interface StateMutationMetadata {
  readonly operationId: string;
  readonly now: string;
}
export interface ConversationStorePort {
  create(input: StateMutationMetadata & { conversationId: string; expiresAt: string; retentionSeconds: number }, signal: AbortSignal): Promise<unknown>;
  load(conversationId: string, now: string, signal: AbortSignal): Promise<unknown>;
  reserve(input: StateMutationMetadata & {
    conversationId: string; requestId: string; expectedVersion: number; question: string; inputHash: string;
    runId: string; leaseToken: string; leaseExpiresAt: string;
  }, signal: AbortSignal): Promise<unknown>;
  settle(input: StateMutationMetadata & { conversationId: string; requestId: string; leaseToken: string; result: GroundedRunAgentResult }, signal: AbortSignal): Promise<unknown>;
  recover(input: StateMutationMetadata & { conversationId: string; requestId: string; expectedVersion: number }, signal: AbortSignal): Promise<unknown>;
  writeMemory(input: StateMutationMetadata & { conversationId: string; expectedVersion: number; key: string; value: string; expiresAt: string }, signal: AbortSignal): Promise<unknown>;
  deleteMemory(input: StateMutationMetadata & { conversationId: string; expectedVersion: number; key: string }, signal: AbortSignal): Promise<unknown>;
  purge(input: StateMutationMetadata, signal: AbortSignal): Promise<{ conversations: number; memories: number; audits: number }>;
  audit(conversationId: string, now: string, signal: AbortSignal): Promise<readonly StateAuditEvent[]>;
}
