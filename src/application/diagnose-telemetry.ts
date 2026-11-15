import { z } from "zod";

import { StateIdSchema } from "../domain/state-contracts.js";
import {
  TelemetryBoundaryError, TelemetryDiagnosisSchema, TelemetryRecordSchema,
  type TelemetryDiagnosis, type TelemetryRecord,
} from "../domain/telemetry-contracts.js";
import type { TelemetryReadPort } from "./ports/telemetry-port.js";

type Issue = TelemetryDiagnosis["issues"][number];
export function createDiagnoseTelemetry(reader: TelemetryReadPort) {
  return async (rawTraceId: unknown, signal = new AbortController().signal): Promise<TelemetryDiagnosis> => {
    const selected = StateIdSchema.safeParse(rawTraceId);
    if (!selected.success || !/^(?:run|operation|evaluation)-[A-Za-z0-9_-]+$/u.test(selected.data)) throw new TelemetryBoundaryError("INVALID_TRACE_ID");
    const traceId = selected.data, issues = new Set<Issue>();
    const empty = (issue: Issue) => TelemetryDiagnosisSchema.parse({ traceId, complete: false,
      issues: [issue], records: 0, spans: [], relatedRunIds: [] });
    signal.throwIfAborted();
    let raw: unknown;
    try { raw = await reader.read(traceId, signal); }
    catch { if (signal.aborted) throw signal.reason; return empty("TELEMETRY_INVALID"); }
    signal.throwIfAborted();
    if (raw === null || (Array.isArray(raw) && raw.length === 0)) return empty("TELEMETRY_MISSING");
    const parsed = z.array(TelemetryRecordSchema).min(1).max(64).safeParse(raw);
    if (!parsed.success) return empty("TELEMETRY_INVALID");
    const records = parsed.data;
    if (records.some((record) => record.traceId !== traceId)) issues.add("CORRELATION_MISMATCH");
    if (records.some(({ sequence }, index) => sequence !== index + 1)) issues.add("SEQUENCE_GAP");
    const spans = records.filter((record) => record.kind === "span.completed");
    const byId = new Map(spans.map(({ payload }) => [payload.spanId, payload]));
    if (byId.size !== spans.length) issues.add("CORRELATION_MISMATCH");
    const roots = spans.filter(({ payload }) => payload.parentSpanId === null);
    if (roots.length !== 1) issues.add("MISSING_ROOT_SPAN");
    for (const { payload } of spans) {
      const seen = new Set<string>([payload.spanId]);
      let parent = payload.parentSpanId;
      while (parent !== null) {
        if (seen.has(parent) || !byId.has(parent)) { issues.add("CORRELATION_MISMATCH"); break; }
        seen.add(parent); parent = byId.get(parent)!.parentSpanId;
      }
    }
    const terminals = records.filter((record): record is Extract<TelemetryRecord,
      { kind: "run.metrics" | "state.completed" | "evaluation.metrics" | "evaluation.failed" }> =>
      record.kind === "run.metrics" || record.kind === "state.completed" || record.kind === "evaluation.metrics" || record.kind === "evaluation.failed");
    if (terminals.length !== 1 || terminals[0] !== records.at(-1)) issues.add("MISSING_TERMINAL_METRICS");
    const terminal = terminals[0];
    const root = roots[0]?.payload;
    if (terminal) {
      const expectedOperation = terminal.kind === "run.metrics" ? "run" : terminal.kind === "state.completed" ? "state" : "evaluation";
      if (root?.operation !== expectedOperation || root.durationMs !== terminal.payload.durationMs) issues.add("CORRELATION_MISMATCH");
      if ("status" in terminal.payload && (root?.status !== terminal.payload.status || root.errorCode !== terminal.payload.errorCode)) issues.add("CORRELATION_MISMATCH");
      if ("bufferDrops" in terminal.payload && terminal.payload.bufferDrops > 0) issues.add("BUFFER_DROPS");
    }
    let runMetrics: TelemetryDiagnosis["runMetrics"];
    const relatedRunIds: string[] = [];
    if (terminal?.kind === "run.metrics") {
      const metrics = terminal.payload; runMetrics = metrics; relatedRunIds.push(metrics.runId);
      if (root?.status !== metrics.status || root.errorCode !== metrics.errorCode) issues.add("CORRELATION_MISMATCH");
      const operations = (operation: string) => spans.filter(({ payload }) => payload.operation === operation);
      const sum = (operation: string) => operations(operation).reduce((total, { payload }) => total + payload.durationMs, 0);
      if (operations("model").length !== metrics.modelCalls || operations("tool").length !== metrics.toolCalls ||
        operations("retrieval").length > metrics.toolCalls || sum("model") !== metrics.modelDurationMs ||
        sum("tool") !== metrics.toolDurationMs || sum("retrieval") !== metrics.retrievalDurationMs ||
        sum("journal") !== metrics.journalDurationMs) issues.add("MISSING_OPERATION_SPAN");
      const effectSpans = spans.filter(({ payload }) => payload.operation === "model" || payload.operation === "tool");
      const calls = effectSpans.map(({ payload }) => payload.callId);
      if (calls.some((id) => id === undefined) || new Set(calls).size !== calls.length) issues.add("CORRELATION_MISMATCH");
      const logs = records.filter((record) => record.kind === "execution.log");
      if (new Set(logs.map(({ payload }) => payload.eventId)).size !== logs.length) issues.add("CORRELATION_MISMATCH");
      for (const { payload } of logs) {
        if (!operations("journal").some(({ payload: journal }) => journal.callId === payload.eventId && journal.status === "ok")) issues.add("MISSING_OPERATION_SPAN");
      }
      if (logs.some(({ payload }) => payload.eventType === "tool.succeeded") && operations("retrieval").length !== 1) issues.add("MISSING_OPERATION_SPAN");
      const lastLog = logs.at(-1)?.payload;
      if (metrics.status === "ok") {
        const grammar = ["run.started", "model.requested", "model.responded", "tool.requested", "tool.succeeded", "model.requested", "model.responded", "run.succeeded"];
        if (metrics.modelCalls !== 2 || metrics.toolCalls !== 1 || logs.length !== 8 ||
          logs.some(({ payload }, index) => payload.eventType !== grammar[index])) issues.add("MISSING_OPERATION_SPAN");
      } else if (metrics.errorCode !== "JOURNAL_FAILURE") {
        if (lastLog?.eventType !== (metrics.status === "cancelled" ? "run.cancelled" : "run.failed") ||
          lastLog.errorCode !== metrics.errorCode) issues.add("CORRELATION_MISMATCH");
      } else if (!operations("journal").some(({ payload }) => payload.status === "error")) issues.add("MISSING_OPERATION_SPAN");
      const first = logs[0]?.payload;
      const noCalls = metrics.modelCalls === 0 && metrics.toolCalls === 0;
      const terminalBeforeStart = logs.length === 1 && noCalls &&
        ((["INVALID_REQUEST", "TIMEOUT"].includes(metrics.errorCode ?? "") && first?.eventType === "run.failed") ||
          (metrics.errorCode === "CANCELLED" && first?.eventType === "run.cancelled"));
      if (first?.eventType !== "run.started" && !terminalBeforeStart &&
        !(logs.length === 0 && noCalls && metrics.errorCode === "JOURNAL_FAILURE")) issues.add("CORRELATION_MISMATCH");
    } else if (terminal?.kind === "evaluation.metrics") relatedRunIds.push(...terminal.payload.caseRunIds);
    else if (terminal?.kind === "state.completed" && terminal.payload.runId) relatedRunIds.push(terminal.payload.runId);
    return TelemetryDiagnosisSchema.parse({ traceId, complete: issues.size === 0, issues: [...issues], records: records.length,
      spans: spans.map(({ payload }) => ({ operation: payload.operation, durationMs: payload.durationMs,
        status: payload.status, ...(payload.errorCode === undefined ? {} : { errorCode: payload.errorCode }) })),
      ...(runMetrics === undefined ? {} : { runMetrics }), relatedRunIds });
  };
}
