import { TelemetryRecordSchema, type TelemetryOperation, type TelemetryRecord } from "../../src/domain/telemetry-contracts.js";

export function telemetryTraceFixture() {
  const traceId = "run-fixture", records: TelemetryRecord[] = [];
  const add = (kind: TelemetryRecord["kind"], payload: unknown) => records.push(TelemetryRecordSchema.parse({
    schemaVersion: "telemetry-1.0", traceId, sequence: records.length + 1, timestamp: "2026-11-15T00:00:00.000Z", kind, payload,
  }));
  const span = (spanId: string, parentSpanId: string | null, operation: TelemetryOperation, durationMs: number, callId?: string) =>
    add("span.completed", { spanId, parentSpanId, operation, durationMs, status: "ok", ...(callId === undefined ? {} : { callId }) });
  const eventTypes = ["run.started", "model.requested", "model.responded", "tool.requested", "tool.succeeded",
    "model.requested", "model.responded", "run.succeeded"];
  for (const [index, eventType] of eventTypes.entries()) {
    const eventId = `event-${index + 1}`;
    span(`span-journal-${index}`, "span-root", "journal", 1, eventId);
    add("execution.log", { runId: traceId, eventId, eventType });
  }
  span("span-model-1", "span-root", "model", 12, "model-1");
  span("span-tool", "span-root", "tool", 10, "tool-1");
  span("span-retrieval", "span-tool", "retrieval", 9);
  span("span-model-2", "span-root", "model", 7, "model-2");
  span("span-root", null, "run", 37);
  add("run.metrics", { runId: traceId, status: "ok", durationMs: 37, modelCalls: 2, toolCalls: 1, retries: 0,
    modelDurationMs: 19, toolDurationMs: 10, retrievalDurationMs: 9, journalDurationMs: 8, bufferDrops: 0 });
  return records;
}
