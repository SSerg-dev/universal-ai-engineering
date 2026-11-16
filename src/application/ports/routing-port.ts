import type { RouteAuditEvent, RouteProfile } from "../../domain/routing-contracts.js";

export interface RouteExecutionPort {
  execute(profile: RouteProfile, question: string, runId: string, signal: AbortSignal): Promise<{ result: unknown; events: unknown }>;
}
export interface RouteJournalPort { append(event: RouteAuditEvent, signal: AbortSignal): Promise<void> }
export interface RouteIdPort { next(kind: "route" | "run" | "event"): string }
