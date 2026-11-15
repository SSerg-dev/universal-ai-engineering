import { z } from "zod";

import type { AgentError } from "../domain/agent-errors.js";
import { GroundedRunAgentResultSchema } from "../domain/retrieval-contracts.js";
import { StateTimestampSchema } from "../domain/state-contracts.js";
import { STREAM_MAX_CHARACTERS, STREAM_MAX_FRAMES, StreamBoundaryError, StreamCursorSchema, StreamEventSchema,
  StreamInputSchema, StreamRunIdSchema, isStreamTerminal, type StreamEvent } from "../domain/stream-contracts.js";
import { RegisteredAgentEventEnvelopeSchema, type RegisteredAgentEventEnvelope } from "../domain/tool-events.js";
import type { ClockPort } from "./ports/clock-port.js";
import type { RunStreamPort, StreamExecutionPort, StreamIdGeneratorPort, StreamSubscription } from "./ports/stream-port.js";
import type { MonotonicClockPort } from "./ports/telemetry-port.js";
import { initialStreamState, reduceStream, type StreamState } from "./reduce-stream.js";

type Listener = (event: StreamEvent) => boolean | void;
interface Entry {
  runId: string; controller: AbortController; frames: StreamEvent[]; characters: number;
  listeners: Set<Listener>; terminal: boolean; inflight: boolean; settledAt: number | undefined;
  timestamp: string; timer: ReturnType<typeof setTimeout> | undefined;
  protocol: StreamState;
}

export class RunStreamBroker implements RunStreamPort {
  readonly #entries = new Map<string, Entry>();
  readonly #executor: StreamExecutionPort;
  readonly #ids: StreamIdGeneratorPort;
  readonly #clock: ClockPort;
  readonly #monotonic: MonotonicClockPort;
  readonly #watchdogMs: number;
  #closed = false;
  #tick = 0;

  constructor(options: { executor: StreamExecutionPort; ids: StreamIdGeneratorPort; clock: ClockPort;
    monotonic: MonotonicClockPort; watchdogMs?: number }) {
    this.#executor = options.executor; this.#ids = options.ids; this.#clock = options.clock; this.#monotonic = options.monotonic;
    this.#watchdogMs = z.number().int().min(1).max(6000).parse(options.watchdogMs ?? 6000);
  }
  #now() {
    try { const value = this.#monotonic.nowMs(); if (Number.isFinite(value) && value >= this.#tick) this.#tick = value; } catch { /* Keep the last known tick. */ }
    return this.#tick;
  }
  #prune() {
    const now = this.#now();
    for (const [id, entry] of this.#entries) if (!entry.inflight && entry.settledAt !== undefined && now - entry.settledAt >= 300_000) this.#entries.delete(id);
  }
  #select(rawId: unknown) {
    const selected = StreamRunIdSchema.safeParse(rawId);
    if (!selected.success) throw new StreamBoundaryError("STREAM_INPUT_INVALID");
    this.#prune();
    const entry = this.#entries.get(selected.data);
    if (!entry) throw new StreamBoundaryError("STREAM_RUN_NOT_FOUND");
    return entry;
  }

  create(raw: unknown): { runId: string } {
    if (this.#closed) throw new StreamBoundaryError("STREAM_CLOSED");
    const input = StreamInputSchema.safeParse(raw);
    if (!input.success) throw new StreamBoundaryError("STREAM_INPUT_INVALID");
    this.#prune();
    if ([...this.#entries.values()].filter(({ inflight }) => inflight).length >= 8) throw new StreamBoundaryError("STREAM_CAPACITY_EXCEEDED");
    if (this.#entries.size >= 32) {
      const candidate = [...this.#entries.values()].filter(({ inflight, terminal }) => !inflight && terminal)
        .sort((a, b) => a.settledAt! - b.settledAt!)[0];
      if (!candidate) throw new StreamBoundaryError("STREAM_CAPACITY_EXCEEDED");
      this.#entries.delete(candidate.runId);
    }
    let runId: string, timestamp: string;
    try { runId = StreamRunIdSchema.parse(this.#ids.nextRunId()); timestamp = StateTimestampSchema.parse(this.#clock.now()); }
    catch { throw new StreamBoundaryError("STREAM_EVENT_INVALID"); }
    if (this.#entries.has(runId)) throw new StreamBoundaryError("STREAM_EVENT_INVALID");
    const entry: Entry = { runId, timestamp, controller: new AbortController(), frames: [], characters: 0,
      listeners: new Set(), terminal: false, inflight: true, settledAt: undefined, timer: undefined, protocol: initialStreamState(runId) };
    this.#entries.set(runId, entry);
    this.#publish(entry, "run.started", {});
    entry.timer = setTimeout(() => this.#fail(entry, "TIMEOUT", "orchestration"), this.#watchdogMs);
    void this.#execute(entry, input.data);
    return { runId };
  }

  async #execute(entry: Entry, input: { question: string }) {
    // Begin in a microtask so creation/subscription is independent of synchronous host behavior.
    await Promise.resolve();
    try {
      if (entry.terminal) return;
      const raw = await this.#executor.execute(input, entry.runId, entry.controller.signal, (event) => this.#project(entry, event));
      if (entry.terminal) return;
      const result = GroundedRunAgentResultSchema.parse(raw);
      if (result.runId !== entry.runId) throw new Error("Stream result identity mismatch");
      if (result.ok) {
        if (this.#publish(entry, "answer", result)) this.#publish(entry, "run.completed", result.usage);
      } else this.#publish(entry, result.error.code === "CANCELLED" ? "run.cancelled" : "run.failed", {
        code: result.error.code, stage: result.error.stage, retryable: false,
      });
    } catch { this.#fail(entry, "INTERNAL_ERROR", "orchestration"); }
    finally {
      entry.inflight = false; entry.settledAt = this.#now();
      if (entry.timer !== undefined) clearTimeout(entry.timer);
      if (!entry.terminal) this.#fail(entry, "INTERNAL_ERROR", "orchestration");
    }
  }

  #project(entry: Entry, raw: RegisteredAgentEventEnvelope) {
    if (entry.terminal) return;
    try {
      const event = RegisteredAgentEventEnvelopeSchema.parse(raw);
      if (event.runId !== entry.runId) throw new Error("Stream event identity mismatch");
      if (event.eventType === "model.requested" || event.eventType === "model.responded") this.#publish(entry, "run.progress", {
        eventType: event.eventType, callId: event.payload.callId, step: event.payload.step,
      });
      if (event.eventType === "tool.requested") this.#publish(entry, "tool.started", { callId: event.payload.callId, toolName: event.payload.toolName });
      if (event.eventType === "tool.succeeded") this.#publish(entry, "tool.completed", {
        callId: event.payload.callId, toolName: event.payload.toolName, durationMs: event.payload.durationMs,
      });
      if (event.eventType === "tool.failed") this.#publish(entry, "tool.failed", {
        callId: event.payload.callId, toolName: event.payload.toolName, durationMs: event.payload.durationMs,
        code: event.payload.toolErrorCode ?? "TOOL_EXECUTION_FAILED",
      });
    } catch { this.#fail(entry, "INTERNAL_ERROR", "orchestration"); }
  }

  #publish(entry: Entry, type: StreamEvent["type"], payload: unknown): boolean {
    if (entry.terminal) return false;
    try { entry.timestamp = StateTimestampSchema.parse(this.#clock.now()); } catch { /* Retain the last valid timestamp for terminal cleanup. */ }
    const event = StreamEventSchema.safeParse({ schemaVersion: "stream-1.0", runId: entry.runId,
      sequence: entry.frames.length + 1, timestamp: entry.timestamp, type, payload });
    const terminal = type === "run.completed" || type === "run.failed" || type === "run.cancelled";
    const reserve = terminal ? 0 : 1024;
    if (!event.success || entry.frames.length >= (terminal ? STREAM_MAX_FRAMES : type === "answer" ? STREAM_MAX_FRAMES - 1 : STREAM_MAX_FRAMES - 2) ||
      entry.characters + (event.success ? JSON.stringify(event.data).length : 0) + reserve > STREAM_MAX_CHARACTERS) {
      this.#fail(entry, "LIMIT_EXCEEDED", "orchestration"); return false;
    }
    try { entry.protocol = reduceStream(entry.protocol, event.data); }
    catch { this.#fail(entry, "INTERNAL_ERROR", "orchestration"); return false; }
    entry.frames = [...entry.protocol.events]; entry.characters += JSON.stringify(event.data).length;
    if (isStreamTerminal(event.data)) {
      entry.terminal = true;
      if (entry.timer !== undefined) clearTimeout(entry.timer);
    }
    for (const listener of [...entry.listeners]) {
      if (!entry.listeners.has(listener)) continue;
      try { if (listener(StreamEventSchema.parse(event.data)) === false) entry.listeners.delete(listener); }
      catch { entry.listeners.delete(listener); }
    }
    if (entry.terminal) entry.listeners.clear();
    return true;
  }
  #fail(entry: Entry, code: AgentError["code"], stage: AgentError["stage"]) {
    if (entry.terminal) return;
    if (code === "CANCELLED" && entry.frames.at(-1)?.type === "answer") return;
    this.#publish(entry, code === "CANCELLED" ? "run.cancelled" : "run.failed", { code, stage, retryable: false });
    entry.controller.abort();
  }

  subscribe(rawId: unknown, rawAfter: unknown, listener: Listener): StreamSubscription {
    const entry = this.#select(rawId), after = StreamCursorSchema.safeParse(rawAfter);
    if (!after.success || after.data > entry.frames.length) throw new StreamBoundaryError("STREAM_CURSOR_INVALID");
    if (entry.listeners.size >= 4) throw new StreamBoundaryError("STREAM_SUBSCRIBER_LIMIT");
    let detached = false;
    const delivery: Listener = (event) => listener(event);
    // Read a live length: a reentrant cancellation callback cannot cause replay to skip frames.
    for (let index = after.data; index < entry.frames.length && !detached; index += 1) {
      try { if (delivery(StreamEventSchema.parse(entry.frames[index]!)) === false) detached = true; }
      catch { detached = true; }
    }
    if (!detached && !entry.terminal) entry.listeners.add(delivery);
    return { terminal: entry.terminal, unsubscribe: () => { detached = true; entry.listeners.delete(delivery); } };
  }
  cancel(rawId: unknown) {
    const entry = this.#select(rawId), requested = !entry.terminal;
    if (requested) entry.controller.abort();
    return { runId: entry.runId, requested, terminal: entry.terminal };
  }
  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const entry of this.#entries.values()) this.#fail(entry, "CANCELLED", "orchestration");
  }
}
