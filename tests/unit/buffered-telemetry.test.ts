import { describe, expect, it, vi } from "vitest";

import { BufferedTelemetry } from "../../src/application/buffered-telemetry.js";
import type { TelemetrySinkPort } from "../../src/application/ports/telemetry-port.js";
import { telemetryTraceFixture } from "../fixtures/telemetry-trace.js";

const clock = { now: () => "2026-11-15T00:00:00.000Z" };
const record = telemetryTraceFixture()[0]!;
describe("Bounded best-effort telemetry export", () => {
  it("acknowledges a whole validated batch once and does no sink I/O for an empty buffer", async () => {
    const append = vi.fn<TelemetrySinkPort["append"]>(async () => {});
    const appendBatch = vi.fn<NonNullable<TelemetrySinkPort["appendBatch"]>>(async () => {});
    const buffer = new BufferedTelemetry({ traceId: "run-fixture", clock, sink: { append, appendBatch } });
    buffer.record(record.kind, record.payload);
    expect(await buffer.flush()).toEqual({ exported: 1, dropped: 0, timedOut: false });
    expect(appendBatch.mock.calls[0]![0][0]).toEqual(record); expect(append).not.toHaveBeenCalled();
    const empty = new BufferedTelemetry({ traceId: "run-empty", clock, sink: { append, appendBatch } });
    expect(await empty.flush()).toEqual({ exported: 0, dropped: 0, timedOut: false });
    expect(appendBatch).toHaveBeenCalledTimes(1);
  });
  it("prefers one bounded batch and never retries through append after batch failure", async () => {
    const append = vi.fn<TelemetrySinkPort["append"]>(async () => {});
    const appendBatch = vi.fn<NonNullable<TelemetrySinkPort["appendBatch"]>>(async () => { throw new Error("private batch failure"); });
    const buffer = new BufferedTelemetry({ traceId: "run-fixture", clock, sink: { append, appendBatch } });
    buffer.record(record.kind, record.payload); buffer.record(record.kind, record.payload);
    expect(await buffer.flush()).toEqual({ exported: 0, dropped: 2, timedOut: false });
    expect(appendBatch).toHaveBeenCalledTimes(1); expect(appendBatch.mock.calls[0]![0]).toHaveLength(2);
    expect(append).not.toHaveBeenCalled();
  });

  it("bounds a late batch acknowledgment without changing delivery counts or falling back", async () => {
    const pending = Promise.withResolvers<void>();
    const append = vi.fn<TelemetrySinkPort["append"]>(async () => {});
    const appendBatch = vi.fn<NonNullable<TelemetrySinkPort["appendBatch"]>>(async () => pending.promise);
    const buffer = new BufferedTelemetry({ traceId: "run-fixture", clock, sink: { append, appendBatch }, flushTimeoutMs: 10 });
    buffer.record(record.kind, record.payload);
    const delivered = await buffer.flush();
    expect(delivered).toEqual({ exported: 0, dropped: 1, timedOut: true });
    pending.resolve(); await new Promise((resolve) => setImmediate(resolve));
    expect(await buffer.flush()).toBe(delivered); expect(appendBatch).toHaveBeenCalledTimes(1); expect(append).not.toHaveBeenCalled();
  });
  it("performs no exporter I/O before flush and preserves validated copies", async () => {
    const append = vi.fn<TelemetrySinkPort["append"]>(async () => {});
    const buffer = new BufferedTelemetry({ traceId: "run-fixture", clock, sink: { append } });
    const payload = structuredClone(record.payload);
    expect(buffer.record(record.kind, payload)).toBe(true);
    if ("durationMs" in payload) payload.durationMs = 999;
    expect(append).not.toHaveBeenCalled();
    expect(await buffer.flush()).toEqual({ exported: 1, dropped: 0, timedOut: false });
    expect(append.mock.calls[0]?.[0].payload).toEqual(record.payload);
  });

  it("bounds invalid/full buffers and counts drops without throwing raw failures", async () => {
    const append = vi.fn<TelemetrySinkPort["append"]>(async () => {});
    const buffer = new BufferedTelemetry({ traceId: "run-fixture", clock, sink: { append }, maximumRecords: 1 });
    expect(buffer.record(record.kind, { question: "private" })).toBe(false);
    expect(buffer.record(record.kind, record.payload)).toBe(true);
    expect(buffer.record(record.kind, record.payload)).toBe(false);
    expect(buffer.bufferDrops).toBe(2);
    expect(await buffer.flush()).toEqual({ exported: 1, dropped: 2, timedOut: false });
  });

  it("isolates clock/exporter failures and attempts later records without retries", async () => {
    const append = vi.fn<TelemetrySinkPort["append"]>(async () => { throw new Error("private sink URL"); });
    const buffer = new BufferedTelemetry({ traceId: "run-fixture", clock, sink: { append } });
    buffer.record(record.kind, record.payload); buffer.record(record.kind, record.payload);
    expect(await buffer.flush()).toEqual({ exported: 0, dropped: 2, timedOut: false }); expect(append).toHaveBeenCalledTimes(2);
    const badClock = new BufferedTelemetry({ traceId: "run-fixture", clock: { now: () => { throw new Error("private clock"); } }, sink: { append } });
    expect(badClock.record(record.kind, record.payload)).toBe(false);
    expect(await badClock.flush()).toEqual({ exported: 0, dropped: 1, timedOut: false });
  });

  it("bounds a noncooperative sink and prevents further export after late settlement", async () => {
    const pending = Promise.withResolvers<void>();
    const append = vi.fn<TelemetrySinkPort["append"]>(async () => pending.promise);
    const buffer = new BufferedTelemetry({ traceId: "run-fixture", clock, sink: { append }, flushTimeoutMs: 10 });
    buffer.record(record.kind, record.payload); buffer.record(record.kind, record.payload);
    const delivered = await buffer.flush();
    expect(delivered).toEqual({ exported: 0, dropped: 2, timedOut: true });
    expect(append.mock.calls[0]?.[1].aborted).toBe(true);
    pending.resolve(); await new Promise((resolve) => setImmediate(resolve));
    expect(append).toHaveBeenCalledTimes(1); expect(await buffer.flush()).toBe(delivered);
  });

  it("makes flush idempotent even for a reentrant sink", async () => {
    let buffer: BufferedTelemetry;
    const append = vi.fn<TelemetrySinkPort["append"]>(async () => { void buffer.flush(); });
    buffer = new BufferedTelemetry({ traceId: "run-fixture", clock, sink: { append } });
    buffer.record(record.kind, record.payload);
    const first = buffer.flush(), second = buffer.flush();
    expect(second).toBe(first); expect(await first).toEqual({ exported: 1, dropped: 0, timedOut: false });
    expect(buffer.record(record.kind, record.payload)).toBe(false); expect(append).toHaveBeenCalledTimes(1);
  });
});
