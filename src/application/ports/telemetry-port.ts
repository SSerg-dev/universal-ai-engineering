import type { TelemetryRecord } from "../../domain/telemetry-contracts.js";

export interface TelemetrySinkPort {
  append(record: TelemetryRecord, signal: AbortSignal): Promise<void>;
  appendBatch?(records: readonly TelemetryRecord[], signal: AbortSignal): Promise<void>;
}
export interface TelemetryReadPort {
  read(traceId: string, signal: AbortSignal): Promise<unknown>;
}
export interface MonotonicClockPort {
  nowMs(): number;
}
export interface SpanIdGeneratorPort {
  nextSpanId(): string;
}
export interface RetrievalMeasurementPort {
  measure<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T>;
}
