import type { RunAgentResult } from "../domain/agent-contracts.js";
import { RetrievalBoundaryCodeSchema } from "../domain/retrieval-contracts.js";
import { StateIdSchema } from "../domain/state-contracts.js";
import { RegisteredAgentEventEnvelopeSchema, type RegisteredAgentEventEnvelope } from "../domain/tool-events.js";
import type { TelemetryDelivery, TelemetryErrorCode, TelemetryOperation } from "../domain/telemetry-contracts.js";
import { BufferedTelemetry } from "./buffered-telemetry.js";
import type { ClockPort } from "./ports/clock-port.js";
import type { JournalPort } from "./ports/journal-port.js";
import type { MonotonicClockPort, RetrievalMeasurementPort, SpanIdGeneratorPort, TelemetrySinkPort } from "./ports/telemetry-port.js";

interface Pending { spanId: string; operation: "model" | "tool"; callId: string; start: number | null }
type Status = "ok" | "error" | "cancelled";

export class ObservedRun implements JournalPort<RegisteredAgentEventEnvelope>, RetrievalMeasurementPort {
  readonly #runId: string;
  readonly #journal: JournalPort<RegisteredAgentEventEnvelope>;
  readonly #monotonic: MonotonicClockPort;
  readonly #ids: SpanIdGeneratorPort;
  readonly #buffer: BufferedTelemetry;
  readonly #rootId: string;
  readonly #started: number;
  readonly #pending = new Map<string, Pending>();
  readonly #retrievals = new Map<string, { parent: string; started: number }>();
  readonly #totals = { model: 0, tool: 0, retrieval: 0, journal: 0 };
  #tick = 0;
  #fallback = 0;
  #modelCalls = 0;
  #toolCalls = 0;
  #finished = false;
  #toolError: TelemetryErrorCode | undefined;

  constructor(options: { runId: string; journal: JournalPort<RegisteredAgentEventEnvelope>; clock: ClockPort;
    monotonic: MonotonicClockPort; ids: SpanIdGeneratorPort; sink: TelemetrySinkPort; flushTimeoutMs?: number }) {
    this.#runId = options.runId; this.#journal = options.journal; this.#monotonic = options.monotonic; this.#ids = options.ids;
    this.#buffer = new BufferedTelemetry({ traceId: options.runId, clock: options.clock, sink: options.sink,
      ...(options.flushTimeoutMs === undefined ? {} : { flushTimeoutMs: options.flushTimeoutMs }) });
    this.#rootId = this.#spanId(); this.#started = this.#now();
  }

  #drop() { this.#buffer.record("span.completed", {}); }
  #spanId() {
    try { return StateIdSchema.parse(this.#ids.nextSpanId()); }
    catch { this.#drop(); return `span-fallback-${++this.#fallback}`; }
  }
  #now() {
    try {
      const value = this.#monotonic.nowMs();
      if (!Number.isFinite(value) || value < this.#tick || value < 0) throw new Error("invalid monotonic clock");
      this.#tick = value; return value;
    } catch { this.#drop(); return this.#tick; }
  }
  #elapsed(start: number, end = this.#now()) {
    const duration = Math.floor(end - start);
    if (duration < 0 || duration > 86_400_000 || !Number.isFinite(duration)) { this.#drop(); return 0; }
    return duration;
  }
  #span(spanId: string, parentSpanId: string | null, operation: TelemetryOperation, durationMs: number,
    status: Status, errorCode?: TelemetryErrorCode, callId?: string) {
    this.#buffer.record("span.completed", { spanId, parentSpanId, operation, durationMs, status,
      ...(errorCode === undefined ? {} : { errorCode }), ...(callId === undefined ? {} : { callId }) });
    if (operation === "model" || operation === "tool" || operation === "retrieval" || operation === "journal") this.#totals[operation] += durationMs;
  }
  #finishPending(pending: Pending, end: number, errorCode?: TelemetryErrorCode) {
    const duration = pending.start === null ? 0 : this.#elapsed(pending.start, end);
    this.#span(pending.spanId, this.#rootId, pending.operation, duration,
      errorCode === undefined ? "ok" : ["CANCELLED", "TOOL_CANCELLED"].includes(errorCode) ? "cancelled" : "error", errorCode, pending.callId);
    this.#pending.delete(pending.callId); return duration;
  }

  async append(raw: RegisteredAgentEventEnvelope, signal: AbortSignal): Promise<void> {
    let event = RegisteredAgentEventEnvelopeSchema.parse(raw);
    if (event.runId !== this.#runId) this.#drop();
    let requested: Pending | undefined;
    if (event.eventType === "model.requested" || event.eventType === "tool.requested") {
      const operation = event.eventType === "model.requested" ? "model" : "tool";
      if (operation === "model") this.#modelCalls += 1; else this.#toolCalls += 1;
      requested = { operation, callId: event.payload.callId, spanId: this.#spanId(), start: null };
      if (this.#pending.has(requested.callId)) this.#drop();
      this.#pending.set(requested.callId, requested);
    }
    if (event.eventType === "model.responded" || event.eventType === "tool.succeeded" || event.eventType === "tool.failed") {
      const pending = this.#pending.get(event.payload.callId);
      if (!pending) this.#drop();
      const errorCode = event.eventType === "tool.failed" ? event.payload.toolErrorCode ?? event.payload.errorCode : undefined;
      if (event.eventType === "tool.failed") this.#toolError = errorCode;
      const durationMs = pending ? this.#finishPending(pending, this.#now(), errorCode) : 0;
      event = RegisteredAgentEventEnvelopeSchema.parse({ ...event, payload: { ...event.payload, durationMs } });
    }
    const journalId = this.#spanId(), started = this.#now();
    try {
      await this.#journal.append(event, signal);
      this.#span(journalId, this.#rootId, "journal", this.#elapsed(started), "ok", undefined, event.eventId);
      this.#buffer.record("execution.log", { runId: event.runId, eventId: event.eventId, eventType: event.eventType,
        ...("errorCode" in event.payload ? { errorCode: event.payload.errorCode } : {}) });
      if (requested) requested.start = this.#now();
    } catch (error) {
      this.#span(journalId, this.#rootId, "journal", this.#elapsed(started), "error", "JOURNAL_FAILURE", event.eventId);
      if (requested) this.#finishPending(requested, this.#now(), "JOURNAL_FAILURE");
      throw error;
    }
  }

  async measure<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
    const parent = [...this.#pending.values()].find(({ operation }) => operation === "tool")?.spanId ?? this.#rootId;
    const spanId = this.#spanId(), started = this.#now();
    this.#retrievals.set(spanId, { parent, started });
    try {
      const value = await work();
      this.#finishRetrieval(spanId, this.#now()); return value;
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? RetrievalBoundaryCodeSchema.safeParse(error.code) : undefined;
      const errorCode = signal.aborted ? "TOOL_CANCELLED" : code?.success ? code.data : "TOOL_EXECUTION_FAILED";
      this.#finishRetrieval(spanId, this.#now(), errorCode);
      throw error;
    }
  }

  #finishRetrieval(spanId: string, ended: number, errorCode?: TelemetryErrorCode) {
    const pending = this.#retrievals.get(spanId);
    if (!pending) return;
    this.#retrievals.delete(spanId);
    this.#span(spanId, pending.parent, "retrieval", this.#elapsed(pending.started, ended),
      errorCode === undefined ? "ok" : ["CANCELLED", "TOOL_CANCELLED"].includes(errorCode) ? "cancelled" : "error", errorCode);
  }

  finish(result: RunAgentResult): Promise<TelemetryDelivery> {
    if (this.#finished) return this.#buffer.flush();
    this.#finished = true;
    if (result.runId !== this.#runId) this.#drop();
    const ended = this.#now(), status: Status = result.ok ? "ok" : result.error.code === "CANCELLED" ? "cancelled" : "error";
    const errorCode = result.ok ? undefined : result.error.code;
    for (const pending of this.#pending.values()) this.#finishPending(pending, ended, errorCode ?? "INTERNAL_ERROR");
    for (const spanId of this.#retrievals.keys()) this.#finishRetrieval(spanId, ended, this.#toolError ?? errorCode ?? "INTERNAL_ERROR");
    const durationMs = this.#elapsed(this.#started, ended);
    this.#span(this.#rootId, null, "run", durationMs, status, errorCode);
    this.#buffer.record("run.metrics", { runId: this.#runId, durationMs, status,
      ...(errorCode === undefined ? {} : { errorCode }), modelCalls: this.#modelCalls, toolCalls: this.#toolCalls, retries: 0,
      modelDurationMs: this.#totals.model, toolDurationMs: this.#totals.tool,
      retrievalDurationMs: this.#totals.retrieval, journalDurationMs: this.#totals.journal, bufferDrops: this.#buffer.bufferDrops });
    return this.#buffer.flush();
  }
}
