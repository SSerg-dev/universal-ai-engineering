import { describe, expect, it } from "vitest";

import { EVALUATION_DIMENSIONS } from "../../src/domain/evaluation-contracts.js";
import { TelemetryDiagnosisSchema, TelemetryRecordSchema } from "../../src/domain/telemetry-contracts.js";

const meta = { schemaVersion: "telemetry-1.0", traceId: "run-one", sequence: 1, timestamp: "2026-11-15T00:00:00.000Z" };
const span = { ...meta, kind: "span.completed", payload: {
  spanId: "span-model", parentSpanId: "span-root", operation: "model", durationMs: 12, status: "ok", callId: "model-one",
} };

describe("Safe observability contracts", () => {
  it("admits measured operation spans and rejects self-parenting or invalid outcomes", () => {
    expect(TelemetryRecordSchema.parse(span)).toEqual(span);
    for (const payload of [{ ...span.payload, parentSpanId: span.payload.spanId }, { ...span.payload, durationMs: -1 },
      { ...span.payload, durationMs: Number.POSITIVE_INFINITY }, { ...span.payload, durationMs: 0.5 },
      { ...span.payload, status: "ok", errorCode: "MODEL_FAILURE" }, { ...span.payload, status: "error" },
      { ...span.payload, status: "cancelled", errorCode: "INVALID_REQUEST" }]) {
      expect(TelemetryRecordSchema.safeParse({ ...span, payload }).success).toBe(false);
    }
  });

  it.each(["question", "answer", "document", "quote", "arguments", "memory", "leaseToken", "stack", "url", "path"])(
    "rejects protected %s content rather than silently dropping it", (field) => {
      expect(TelemetryRecordSchema.safeParse({ ...span, payload: { ...span.payload, [field]: "private content" } }).success).toBe(false);
    });

  it("requires run/log identity agreement and bounded host metadata", () => {
    const log = { ...meta, kind: "execution.log", payload: { runId: "run-one", eventId: "event-one", eventType: "run.started" } };
    expect(TelemetryRecordSchema.parse(log)).toEqual(log);
    expect(TelemetryRecordSchema.safeParse({ ...log, traceId: "another" }).success).toBe(false);
    expect(TelemetryRecordSchema.safeParse({ ...log, sequence: 65 }).success).toBe(false);
    expect(TelemetryRecordSchema.safeParse({ ...log, payload: { ...log.payload, eventId: "../escape" } }).success).toBe(false);
  });

  it("keeps quality rates bounded, distinct, correlated, and content-free", () => {
    const record = { ...meta, traceId: "operation-eval", kind: "evaluation.metrics", payload: {
      evaluationId: "operation-eval", gatePassed: true, durationMs: 100, caseRunIds: ["run-a", "run-b", "run-c"], bufferDrops: 0,
      dimensions: EVALUATION_DIMENSIONS.map((dimension) => ({ dimension, passed: 1, applicable: 1, rate: 1 })),
    } };
    expect(TelemetryRecordSchema.parse(record)).toEqual(record);
    expect(TelemetryRecordSchema.safeParse({ ...record, payload: { ...record.payload, caseRunIds: ["run-a", "run-a", "run-c"] } }).success).toBe(false);
    expect(TelemetryRecordSchema.safeParse({ ...record, payload: { ...record.payload,
      dimensions: record.payload.dimensions.map((item) => ({ ...item, passed: 4, applicable: 4 })) } }).success).toBe(false);
    const oversized = { ...record, payload: { ...record.payload, caseRunIds: Array.from({ length: 100 }, (_, i) => `${i}-${"x".repeat(120)}`) } };
    expect(TelemetryRecordSchema.safeParse(oversized).success).toBe(false);
  });

  it("does not permit an incomplete diagnosis to claim complete", () => {
    const diagnosis = { traceId: "run-one", complete: false, issues: ["SEQUENCE_GAP"], records: 2, spans: [], relatedRunIds: [] };
    expect(TelemetryDiagnosisSchema.parse(diagnosis)).toEqual(diagnosis);
    expect(TelemetryDiagnosisSchema.safeParse({ ...diagnosis, complete: true }).success).toBe(false);
    expect(TelemetryDiagnosisSchema.safeParse({ ...diagnosis, issues: ["SEQUENCE_GAP", "SEQUENCE_GAP"] }).success).toBe(false);
  });
});
