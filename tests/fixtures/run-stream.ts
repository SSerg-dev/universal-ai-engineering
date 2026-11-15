import { GroundedRunAgentResultSchema } from "../../src/domain/retrieval-contracts.js";
import { RegisteredAgentEventEnvelopeSchema } from "../../src/domain/tool-events.js";

export function streamResultFixture(runId: string) {
  return GroundedRunAgentResultSchema.parse({ ok: true, runId, answer: "No indexed evidence supports this answer.", sources: [],
    usage: { modelCalls: 2, toolCalls: 1 }, grounding: { version: "1.0", status: "abstained", reason: "no_evidence", claims: [] } });
}
export function streamJournalFixture(runId: string) {
  const data = [
    { eventType: "run.started", payload: {} },
    { eventType: "model.requested", payload: { callId: "model-one", step: 1 } },
    { eventType: "model.responded", payload: { callId: "model-one", step: 1, actionKind: "call_tool", durationMs: 0 } },
    { eventType: "tool.requested", payload: { callId: "tool-one", step: 1, toolName: "retrieve_passages" } },
    { eventType: "tool.succeeded", payload: { callId: "tool-one", step: 1, toolName: "retrieve_passages", durationMs: 0, resultCount: 0, sourceIds: [] } },
    { eventType: "model.requested", payload: { callId: "model-two", step: 2 } },
    { eventType: "model.responded", payload: { callId: "model-two", step: 2, actionKind: "final_answer", durationMs: 0 } },
    { eventType: "run.succeeded", payload: { answerLength: 43, sourceIds: [], modelCalls: 2, toolCalls: 1 } },
  ];
  return data.map((item, index) => RegisteredAgentEventEnvelopeSchema.parse({ schemaVersion: "1.1", runId,
    sequence: index + 1, eventId: `event-${index + 1}`, occurredAt: "2026-11-15T00:00:00.000Z", ...item }));
}
