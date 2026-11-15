import { afterEach, describe, expect, it, vi } from "vitest";

import { RunStreamBroker } from "../../src/application/run-stream-broker.js";
import type { StreamExecutionPort } from "../../src/application/ports/stream-port.js";
import { initialStreamState, reduceStream } from "../../src/application/reduce-stream.js";
import type { StreamEvent } from "../../src/domain/stream-contracts.js";
import { streamJournalFixture, streamResultFixture } from "../fixtures/run-stream.js";

const brokers: RunStreamBroker[] = [];
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
function harness(executor?: StreamExecutionPort, options: { watchdogMs?: number } = {}) {
  let sequence = 0, ticks = 0;
  const broker = new RunStreamBroker({ executor: executor ?? { execute: async (_input, runId, _signal, publish) => {
    for (const event of streamJournalFixture(runId)) publish(event); return streamResultFixture(runId);
  } }, clock: { now: () => "2026-11-15T00:00:00.000Z" }, monotonic: { nowMs: () => ticks },
    ids: { nextRunId: () => `run-${++sequence}` }, ...options });
  brokers.push(broker);
  return { broker, advance: (ms: number) => ticks += ms, read: (runId: string, after = 0) => {
    const frames: StreamEvent[] = []; const subscription = broker.subscribe(runId, after, (frame) => { frames.push(frame); });
    subscription.unsubscribe(); return frames;
  } };
}
afterEach(() => { for (const broker of brokers.splice(0)) broker.close(); vi.useRealTimers(); });

describe("Bounded reconnectable run broker", () => {
  it("publishes one ordered grounded answer/terminal and replays without executing again", async () => {
    const h = harness(), { runId } = h.broker.create({ question: "private question" });
    expect(h.read(runId).map(({ type }) => type)).toEqual(["run.started"]);
    await flush(); const frames = h.read(runId);
    expect(frames.map(({ type }) => type)).toEqual(["run.started", "run.progress", "run.progress", "tool.started", "tool.completed",
      "run.progress", "run.progress", "answer", "run.completed"]);
    expect(frames.map(({ sequence }) => sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(h.read(runId, 4)).toEqual(frames.slice(4)); expect(h.read(runId, 9)).toEqual([]);
    expect(frames.reduce(reduceStream, initialStreamState(runId)).phase).toBe("terminal");
    expect(JSON.stringify(frames)).not.toContain("private question");
    expect(h.broker.cancel(runId)).toEqual({ runId, requested: false, terminal: true });
  });

  it("isolates subscriber failure/mutation/backpressure and counts duplicate callbacks as separate subscriptions", async () => {
    const pending = Promise.withResolvers<never>(), h = harness({ execute: async () => pending.promise });
    const { runId } = h.broker.create({ question: "q" });
    h.broker.subscribe(runId, 0, () => { throw new Error("private subscriber"); });
    h.broker.subscribe(runId, 0, (frame) => { frame.runId = "run-corrupt"; return false; });
    expect(h.read(runId)[0]!.runId).toBe(runId);
    const callback = () => {}, subscriptions = Array.from({ length: 4 }, () => h.broker.subscribe(runId, 0, callback));
    expect(() => h.broker.subscribe(runId, 0, callback)).toThrow(expect.objectContaining({ code: "STREAM_SUBSCRIBER_LIMIT" }));
    subscriptions[0]!.unsubscribe(); expect(() => h.broker.subscribe(runId, 0, callback)).not.toThrow();
  });

  it("validates input/cursors before effects and keeps missing/expired runs explicit", async () => {
    const execute = vi.fn<StreamExecutionPort["execute"]>(async () => { throw new Error("private"); }), h = harness({ execute });
    expect(() => h.broker.create({ question: " " })).toThrow(expect.objectContaining({ code: "STREAM_INPUT_INVALID" })); expect(execute).not.toHaveBeenCalled();
    const { runId } = h.broker.create({ question: "q" });
    for (const after of [-1, 2, "0", 0.5]) expect(() => h.broker.subscribe(runId, after, () => {})).toThrow(expect.objectContaining({ code: "STREAM_CURSOR_INVALID" }));
    await flush(); expect(h.read(runId).at(-1)).toMatchObject({ type: "run.failed", payload: { code: "INTERNAL_ERROR" } });
    expect(JSON.stringify(h.read(runId))).not.toContain("private");
    h.advance(300_000);
    expect(() => h.read(runId)).toThrow(expect.objectContaining({ code: "STREAM_RUN_NOT_FOUND" }));
    expect(() => h.read("../outside")).toThrow(expect.objectContaining({ code: "STREAM_INPUT_INVALID" }));
  });

  it("does not cancel on disconnect, but explicit cancellation preserves the primary cancellation outcome", async () => {
    let active: AbortSignal | undefined;
    const h = harness({ execute: async (_input, runId, signal) => {
      active = signal;
      await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
      return { ok: false, runId, error: { code: "CANCELLED", stage: "model", message: "private cancellation", retryable: false } };
    } });
    const { runId } = h.broker.create({ question: "q" }); await flush();
    h.broker.subscribe(runId, 0, () => {}).unsubscribe(); expect(active?.aborted).toBe(false);
    expect(h.broker.cancel(runId).requested).toBe(true); await flush();
    expect(h.read(runId).at(-1)).toMatchObject({ type: "run.cancelled", payload: { code: "CANCELLED", stage: "model" } });
    expect(JSON.stringify(h.read(runId))).not.toContain("private cancellation");
  });

  it("bounds noncooperative watchdog work and holds active slots until actual settlement", async () => {
    vi.useFakeTimers(); const pending = Promise.withResolvers<void>();
    const h = harness({ execute: async (_input, runId, _signal, publish) => {
      await pending.promise; for (const event of streamJournalFixture(runId)) publish(event); return streamResultFixture(runId);
    } }, { watchdogMs: 10 });
    const ids = Array.from({ length: 8 }, () => h.broker.create({ question: "q" }).runId); await flush();
    await vi.advanceTimersByTimeAsync(10);
    for (const runId of ids) expect(h.read(runId).at(-1)).toMatchObject({ type: "run.failed", payload: { code: "TIMEOUT" } });
    expect(() => h.broker.create({ question: "q" })).toThrow(expect.objectContaining({ code: "STREAM_CAPACITY_EXCEEDED" }));
    pending.resolve(); await flush();
    for (const runId of ids) expect(h.read(runId)).toHaveLength(2);
    expect(() => h.broker.create({ question: "q" })).not.toThrow();
  });

  it("evicts only settled inactive runs under retained capacity pressure", async () => {
    const h = harness(); let first = "";
    for (let index = 0; index < 33; index += 1) { const { runId } = h.broker.create({ question: "q" }); if (index === 0) first = runId; await flush(); h.advance(1); }
    expect(() => h.read(first)).toThrow(expect.objectContaining({ code: "STREAM_RUN_NOT_FOUND" }));
    expect(h.read("run-33").at(-1)?.type).toBe("run.completed");
  });

  it("terminates malformed/mismatched host events and never reopens after shutdown", async () => {
    const h = harness({ execute: async (_input, runId, _signal, publish) => {
      publish(streamJournalFixture("run-other")[1]!); return streamResultFixture(runId);
    } });
    const { runId } = h.broker.create({ question: "q" }); await flush();
    expect(h.read(runId).at(-1)).toMatchObject({ type: "run.failed", payload: { code: "INTERNAL_ERROR" } });
    expect(h.read(runId)).toHaveLength(2);
    h.broker.close(); expect(() => h.broker.create({ question: "q" })).toThrow(expect.objectContaining({ code: "STREAM_CLOSED" }));
  });

  it("reserves a terminal when the validated primary answer exceeds the content frame bound", async () => {
    const h = harness({ execute: async (_input, runId, _signal, publish) => {
      for (const event of streamJournalFixture(runId)) publish(event);
      const result = streamResultFixture(runId); if (result.ok) result.answer = "private".repeat(6000); return result;
    } });
    const { runId } = h.broker.create({ question: "q" }); await flush();
    const frames = h.read(runId);
    expect(frames.at(-1)).toMatchObject({ type: "run.failed", payload: { code: "LIMIT_EXCEEDED" } });
    expect(frames.some(({ type }) => type === "answer")).toBe(false); expect(JSON.stringify(frames)).not.toContain("private");
  });

  it("lets a settled primary success win a late cancellation or reentrant shutdown", async () => {
    const h = harness(), { runId } = h.broker.create({ question: "q" });
    h.broker.subscribe(runId, 0, (event) => { if (event.type === "answer") { h.broker.cancel(runId); h.broker.close(); } });
    await flush(); expect(h.read(runId).at(-1)?.type).toBe("run.completed");
  });
});
