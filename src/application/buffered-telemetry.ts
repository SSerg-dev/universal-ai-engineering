import { z } from "zod";

import { StateIdSchema } from "../domain/state-contracts.js";
import { TelemetryDeliverySchema, TelemetryRecordSchema, type TelemetryDelivery, type TelemetryRecord } from "../domain/telemetry-contracts.js";
import type { ClockPort } from "./ports/clock-port.js";
import type { TelemetrySinkPort } from "./ports/telemetry-port.js";

export class BufferedTelemetry {
  readonly #traceId: string;
  readonly #clock: ClockPort;
  readonly #sink: TelemetrySinkPort;
  readonly #maximum: number;
  readonly #timeoutMs: number;
  readonly #records: TelemetryRecord[] = [];
  #drops = 0;
  #closed = false;
  #flushing: Promise<TelemetryDelivery> | undefined;

  constructor(options: { traceId: string; clock: ClockPort; sink: TelemetrySinkPort; maximumRecords?: number; flushTimeoutMs?: number }) {
    this.#traceId = StateIdSchema.parse(options.traceId);
    this.#clock = options.clock; this.#sink = options.sink;
    this.#maximum = z.number().int().min(1).max(64).parse(options.maximumRecords ?? 64);
    this.#timeoutMs = z.number().int().min(1).max(5000).parse(options.flushTimeoutMs ?? 250);
  }
  get bufferDrops() { return this.#drops; }
  #drop() { this.#drops = Math.min(1_000_000, this.#drops + 1); }

  record(kind: TelemetryRecord["kind"], payload: unknown): boolean {
    if (this.#closed || this.#records.length >= this.#maximum) { this.#drop(); return false; }
    try {
      const parsed = TelemetryRecordSchema.safeParse({ schemaVersion: "telemetry-1.0", traceId: this.#traceId,
        sequence: this.#records.length + 1, timestamp: this.#clock.now(), kind, payload });
      if (!parsed.success) { this.#drop(); return false; }
      this.#records.push(parsed.data); return true;
    } catch { this.#drop(); return false; }
  }

  flush(): Promise<TelemetryDelivery> {
    if (this.#flushing) return this.#flushing;
    this.#closed = true;
    this.#flushing = Promise.resolve().then(() => this.#drain());
    return this.#flushing;
  }

  async #drain(): Promise<TelemetryDelivery> {
    const controller = new AbortController();
    let exported = 0, timer: ReturnType<typeof setTimeout> | undefined;
    const delivery = (timedOut: boolean) => Object.freeze(TelemetryDeliverySchema.parse({ exported,
      dropped: Math.min(1_000_000, this.#drops + this.#records.length - exported), timedOut }));
    const deadline = new Promise<TelemetryDelivery>((resolve) => {
      timer = setTimeout(() => { controller.abort(); resolve(delivery(true)); }, this.#timeoutMs);
    });
    const drain = async () => {
      if (this.#sink.appendBatch && this.#records.length > 0) {
        try {
          await this.#sink.appendBatch(this.#records.map((record) => TelemetryRecordSchema.parse(record)), controller.signal);
          if (!controller.signal.aborted) exported = this.#records.length;
        } catch { /* Batch failure has no per-record fallback or retry. */ }
        return delivery(false);
      }
      for (const record of this.#records) {
        if (controller.signal.aborted) break;
        try {
          await this.#sink.append(TelemetryRecordSchema.parse(record), controller.signal);
          if (controller.signal.aborted) break;
          exported += 1;
        } catch { /* Optional telemetry failure never propagates to the primary operation. */ }
      }
      return delivery(false);
    };
    try { return await Promise.race([drain(), deadline]); }
    finally { if (timer !== undefined) clearTimeout(timer); }
  }
}
