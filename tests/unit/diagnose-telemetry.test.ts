import { describe, expect, it, vi } from "vitest";

import { createDiagnoseTelemetry } from "../../src/application/diagnose-telemetry.js";
import type { TelemetryReadPort } from "../../src/application/ports/telemetry-port.js";
import { telemetryTraceFixture } from "../fixtures/telemetry-trace.js";

describe("Honest telemetry completeness diagnosis", () => {
  it("correlates a complete run, parent tree, operation counts, and measured totals", async () => {
    const diagnose = createDiagnoseTelemetry({ read: async () => telemetryTraceFixture() });
    const result = await diagnose("run-fixture");
    expect(result.complete).toBe(true); expect(result.issues).toEqual([]);
    expect(result.runMetrics).toMatchObject({ modelCalls: 2, toolCalls: 1, modelDurationMs: 19, journalDurationMs: 8 });
  });

  it.each(["missing-root", "missing-model", "gap", "cross-trace", "cycle", "no-terminal", "buffer-loss"])("reports %s as incomplete", async (mode) => {
    let records = telemetryTraceFixture();
    if (mode === "missing-root") records = records.filter((item) => item.kind !== "span.completed" || item.payload.parentSpanId !== null);
    if (mode === "missing-model") records = records.filter((item) => item.kind !== "span.completed" || item.payload.spanId !== "span-model-1");
    if (mode === "gap") records[0]!.sequence = 2;
    if (mode === "cross-trace") records[0]!.traceId = "run-other";
    if (mode === "cycle") {
      const first = records.find((item) => item.kind === "span.completed" && item.payload.spanId === "span-model-1");
      const second = records.find((item) => item.kind === "span.completed" && item.payload.spanId === "span-model-2");
      if (first?.kind === "span.completed" && second?.kind === "span.completed") {
        first.payload.parentSpanId = second.payload.spanId; second.payload.parentSpanId = first.payload.spanId;
      }
    }
    if (mode === "no-terminal") records.pop();
    if (mode === "buffer-loss") { const last = records.at(-1)!; if (last.kind === "run.metrics") last.payload.bufferDrops = 1; }
    if (mode === "missing-root" || mode === "missing-model") records.forEach((item, index) => { item.sequence = index + 1; });
    const result = await createDiagnoseTelemetry({ read: async () => records })("run-fixture");
    expect(result.complete).toBe(false);
    const issue = mode === "missing-root" ? "MISSING_ROOT_SPAN" : mode === "missing-model" ? "MISSING_OPERATION_SPAN" :
      mode === "gap" ? "SEQUENCE_GAP" : mode === "no-terminal" ? "MISSING_TERMINAL_METRICS" :
      mode === "buffer-loss" ? "BUFFER_DROPS" : "CORRELATION_MISMATCH";
    expect(result.issues).toContain(issue);
  });

  it("never fabricates complete metrics for missing, malformed, or unavailable artifacts", async () => {
    for (const read of [async () => null, async () => [{ question: "private" }], async () => { throw new Error("private file path"); }]) {
      const result = await createDiagnoseTelemetry({ read })("run-fixture");
      expect(result.complete).toBe(false); expect(JSON.stringify(result)).not.toContain("private");
    }
  });

  it("rejects an invalid trace path before reader work and preserves cancellation", async () => {
    const read = vi.fn<TelemetryReadPort["read"]>(async () => null), diagnose = createDiagnoseTelemetry({ read });
    await expect(diagnose("../escape")).rejects.toMatchObject({ code: "INVALID_TRACE_ID" }); expect(read).not.toHaveBeenCalled();
    const caller = new AbortController(), reason = new Error("caller stop"); caller.abort(reason);
    await expect(diagnose("run-fixture", caller.signal)).rejects.toBe(reason); expect(read).not.toHaveBeenCalled();
  });

  it("rejects an apparently complete success with corrupted event grammar", async () => {
    const records = telemetryTraceFixture();
    const modelLog = records.find((item) => item.kind === "execution.log" && item.payload.eventType === "model.responded");
    if (modelLog?.kind === "execution.log") modelLog.payload.eventType = "run.started";
    expect((await createDiagnoseTelemetry({ read: async () => records })("run-fixture")).issues).toContain("MISSING_OPERATION_SPAN");
  });

  it("represents a fully diagnosed evaluation failure without invented quality results", async () => {
    const records = [
      { schemaVersion: "telemetry-1.0", traceId: "operation-eval", sequence: 1, timestamp: "2026-11-15T00:00:00.000Z", kind: "span.completed",
        payload: { spanId: "span-root", parentSpanId: null, operation: "evaluation", durationMs: 10, status: "error", errorCode: "REPORT_FAILURE" } },
      { schemaVersion: "telemetry-1.0", traceId: "operation-eval", sequence: 2, timestamp: "2026-11-15T00:00:00.000Z", kind: "evaluation.failed",
        payload: { durationMs: 10, status: "error", errorCode: "REPORT_FAILURE", bufferDrops: 0 } },
    ];
    const result = await createDiagnoseTelemetry({ read: async () => records })("operation-eval");
    expect(result.complete).toBe(true); expect(result.runMetrics).toBeUndefined(); expect(result.relatedRunIds).toEqual([]);
    expect(result.spans[0]?.errorCode).toBe("REPORT_FAILURE");
  });
});
