import { describe, expect, it } from "vitest";

import { createDiagnoseTelemetry } from "../../src/application/diagnose-telemetry.js";
import { observeEvaluation, observeStateCommand, type OperationObservationOptions } from "../../src/application/observe-operations.js";
import { StateBoundaryError } from "../../src/domain/state-contracts.js";
import type { TelemetryRecord } from "../../src/domain/telemetry-contracts.js";
import { evaluationReportFixture } from "../fixtures/evaluation-report.js";

function harness() {
  let ticks = 0, sequence = 0;
  const records: TelemetryRecord[] = [];
  const options: OperationObservationOptions = { clock: { now: () => "2026-11-15T00:00:00.000Z" },
    monotonic: { nowMs: () => ticks += 7 }, ids: { nextOperationId: () => `operation-${++sequence}`, nextSpanId: () => `span-${++sequence}` },
    sink: () => ({ append: async (record) => { records.push(record); } }), flushTimeoutMs: 10 };
  return { records, options, diagnose: (traceId: string) => createDiagnoseTelemetry({ read: async () => records.filter((record) => record.traceId === traceId) })(traceId) };
}

describe("State and evaluation observation", () => {
  it("links a persisted turn to its run without exporting private request or result fields", async () => {
    const h = harness(), report = evaluationReportFixture();
    const result = { ok: true as const, operation: "run_turn" as const, value: { conversationId: "conversation-one", version: 2, cached: false,
      result: { ok: false as const, runId: report.cases[0]!.runId, error: { code: "TOOL_FAILURE" as const, stage: "tool" as const, message: "The tool failed.", retryable: false } } } };
    // A completed state transaction can contain a failed domain run; the linked run explains it.
    const run = observeStateCommand(async () => result, h.options);
    expect(await run({ operation: "run_turn", conversationId: "conversation-one", requestId: "request-one", expectedVersion: 0, question: "private question" })).toBe(result);
    expect(h.records.at(-1)).toMatchObject({ kind: "state.completed", payload: { operation: "run_turn", status: "ok",
      conversationId: "conversation-one", requestId: "request-one", runId: report.cases[0]!.runId, version: 2, durationMs: 7 } });
    expect(await h.diagnose(h.records[0]!.traceId)).toMatchObject({ complete: true, relatedRunIds: [report.cases[0]!.runId] });
    expect(JSON.stringify(h.records)).not.toMatch(/private question|The tool failed/u);
  });

  it("preserves the exact state exception and records a closed failure code", async () => {
    const h = harness(), error = new StateBoundaryError("VERSION_CONFLICT");
    const run = observeStateCommand(async () => { throw error; }, h.options);
    await expect(run({ operation: "read", conversationId: "conversation-one" })).rejects.toBe(error);
    expect(h.records.at(-1)).toMatchObject({ payload: { status: "error", errorCode: "VERSION_CONFLICT" } });
    expect(await h.diagnose(h.records[0]!.traceId)).toMatchObject({ complete: true });
  });

  it("labels invalid commands without copying unvalidated input", async () => {
    const h = harness();
    await expect(observeStateCommand(async () => { throw new Error("private failure"); }, h.options)({ operation: "private command", question: "secret" })).rejects.toThrow("private failure");
    expect(h.records.at(-1)).toMatchObject({ payload: { operation: "invalid_command", status: "error", errorCode: "INTERNAL_ERROR" } });
    expect(JSON.stringify(h.records)).not.toMatch(/private|secret/u);
  });

  it("exports validated quality rates and actual case IDs without changing the report", async () => {
    const h = harness(), report = evaluationReportFixture();
    expect(await observeEvaluation(async () => report, h.options)()).toBe(report);
    expect(h.records.at(-1)).toMatchObject({ kind: "evaluation.metrics", traceId: report.evaluationId,
      payload: { gatePassed: true, caseRunIds: report.cases.map(({ runId }) => runId), dimensions: expect.arrayContaining([
        { dimension: "schema", passed: 3, applicable: 3, rate: 1 },
      ]) } });
    expect(await h.diagnose(report.evaluationId)).toMatchObject({ complete: true, relatedRunIds: report.cases.map(({ runId }) => runId) });
  });

  it("records cancellation without fabricating quality rates when evaluation throws", async () => {
    const h = harness(), controller = new AbortController(), error = new Error("private cancellation"); controller.abort(error);
    await expect(observeEvaluation(async () => { throw error; }, h.options)(controller.signal)).rejects.toBe(error);
    expect(h.records.at(-1)).toMatchObject({ kind: "evaluation.failed", payload: { status: "cancelled", errorCode: "CANCELLED" } });
    expect(JSON.stringify(h.records)).not.toMatch(/private|dimensions|caseRunIds/u);
    expect(await h.diagnose(h.records[0]!.traceId)).toMatchObject({ complete: true });
  });

  it("contains optional sink creation failures for both successful and failed primary operations", async () => {
    const h = harness(), report = evaluationReportFixture(), error = new Error("original");
    const options = { ...h.options, sink: () => { throw new Error("optional"); } };
    expect(await observeEvaluation(async () => report, options)()).toBe(report);
    await expect(observeStateCommand(async () => { throw error; }, options)({})).rejects.toBe(error);
  });

  it("marks a broken clock as incomplete instead of claiming a measured zero duration", async () => {
    const h = harness(), options = { ...h.options, monotonic: { nowMs: () => Number.NaN } }, report = evaluationReportFixture();
    expect(await observeEvaluation(async () => report, options)()).toBe(report);
    expect(await h.diagnose(report.evaluationId)).toMatchObject({ complete: false, issues: ["BUFFER_DROPS"] });
  });
});
