import { ConversationCommandSchema, ConversationCommandSuccessSchema } from "../domain/conversation-command-contracts.js";
import { EVALUATION_DIMENSIONS, EvaluationReportSchema, type EvaluationReport } from "../domain/evaluation-contracts.js";
import { StateIdSchema } from "../domain/state-contracts.js";
import { TelemetryErrorCodeSchema } from "../domain/telemetry-contracts.js";
import { BufferedTelemetry } from "./buffered-telemetry.js";
import type { ConversationCommandHandler } from "./conversation-command.js";
import type { ClockPort } from "./ports/clock-port.js";
import type { MonotonicClockPort, SpanIdGeneratorPort, TelemetrySinkPort } from "./ports/telemetry-port.js";

export interface OperationObservationOptions {
  readonly clock: ClockPort;
  readonly monotonic: MonotonicClockPort;
  readonly ids: SpanIdGeneratorPort & { nextOperationId(): string };
  readonly sink: () => TelemetrySinkPort;
  readonly flushTimeoutMs?: number;
}

function tick(options: OperationObservationOptions): number | undefined {
  try { const value = options.monotonic.nowMs(); return Number.isFinite(value) && value >= 0 ? value : undefined; }
  catch { return undefined; }
}
function outcome(error: unknown, failed: boolean, signal?: AbortSignal) {
  if (!failed) return { status: "ok" as const };
  if (signal?.aborted) return { status: "cancelled" as const, errorCode: "CANCELLED" as const };
  const selected = typeof error === "object" && error !== null && "code" in error ? TelemetryErrorCodeSchema.safeParse(error.code) : undefined;
  return { status: "error" as const, errorCode: selected?.success ? selected.data : "INTERNAL_ERROR" as const };
}
async function emit(options: OperationObservationOptions, started: number | undefined, ended: number | undefined,
  traceId: string, operation: "state" | "evaluation", result: ReturnType<typeof outcome>,
  terminal: (buffer: BufferedTelemetry, durationMs: number) => void) {
  try {
    const buffer = new BufferedTelemetry({ traceId: StateIdSchema.parse(traceId), clock: options.clock, sink: options.sink(),
      ...(options.flushTimeoutMs === undefined ? {} : { flushTimeoutMs: options.flushTimeoutMs }) });
    const elapsed = started === undefined || ended === undefined ? Number.NaN : Math.floor(ended - started);
    const valid = Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= 86_400_000;
    if (!valid) buffer.record("span.completed", {});
    const durationMs = valid ? elapsed : 0;
    buffer.record("span.completed", { spanId: options.ids.nextSpanId(), parentSpanId: null, operation, durationMs, ...result });
    terminal(buffer, durationMs);
    await buffer.flush();
  } catch { /* Optional metadata cannot replace a settled operation or its original exception. */ }
}

export function observeStateCommand(handler: ConversationCommandHandler, options: OperationObservationOptions): ConversationCommandHandler {
  return async (raw, signal) => {
    const started = tick(options);
    let result: Awaited<ReturnType<ConversationCommandHandler>> | undefined, failure: unknown, failed = false;
    try { result = await handler(raw, signal); return result; }
    catch (error) { failed = true; failure = error; throw error; }
    finally {
      const ended = tick(options);
      try {
        const input = ConversationCommandSchema.safeParse(raw), output = ConversationCommandSuccessSchema.safeParse(result);
        const payload: { conversationId?: string; requestId?: string; runId?: string; version?: number } = {};
        if (input.success) {
          if ("conversationId" in input.data) payload.conversationId = input.data.conversationId;
          if ("requestId" in input.data) payload.requestId = input.data.requestId;
        }
        if (output.success && output.data.operation !== "audit" && output.data.operation !== "purge") {
          payload.conversationId = output.data.value.conversationId; payload.version = output.data.value.version;
          if (output.data.operation === "run_turn") payload.runId = output.data.value.result.runId;
        }
        const selected = outcome(failure, failed, signal);
        await emit(options, started, ended, options.ids.nextOperationId(), "state", selected, (buffer, durationMs) => {
          buffer.record("state.completed", { operation: input.success ? input.data.operation : "invalid_command",
            durationMs, ...selected, ...payload, bufferDrops: buffer.bufferDrops });
        });
      } catch { /* No optional observation failure changes state behavior. */ }
    }
  };
}

export function observeEvaluation(evaluate: (signal?: AbortSignal) => Promise<EvaluationReport>, options: OperationObservationOptions) {
  return async (signal?: AbortSignal): Promise<EvaluationReport> => {
    const started = tick(options);
    let result: EvaluationReport | undefined, failure: unknown, failed = false;
    try { result = await evaluate(signal); return result; }
    catch (error) { failed = true; failure = error; throw error; }
    finally {
      const ended = tick(options);
      try {
        const report = EvaluationReportSchema.safeParse(result);
        const selected = outcome(failure, failed || !report.success, signal);
        const traceId = report.success ? report.data.evaluationId : options.ids.nextOperationId();
        await emit(options, started, ended, traceId, "evaluation", selected, (buffer, durationMs) => {
          if (report.success) buffer.record("evaluation.metrics", { evaluationId: report.data.evaluationId,
            gatePassed: report.data.gate.passed, durationMs, caseRunIds: report.data.cases.map(({ runId }) => runId),
            dimensions: EVALUATION_DIMENSIONS.map((dimension) => ({ dimension, passed: report.data.metrics[dimension].passed,
              applicable: report.data.metrics[dimension].applicable, rate: report.data.metrics[dimension].rate })), bufferDrops: buffer.bufferDrops });
          else buffer.record("evaluation.failed", { durationMs, ...selected, bufferDrops: buffer.bufferDrops });
        });
      } catch { /* No optional observation failure changes the quality gate or report. */ }
    }
  };
}
