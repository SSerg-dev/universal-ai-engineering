import { describe, expect, it } from "vitest";

import { initialStreamState, reduceStream } from "../../src/application/reduce-stream.js";
import { StreamEventSchema } from "../../src/domain/stream-contracts.js";
import { streamResultFixture } from "../fixtures/run-stream.js";

function frames() {
  const data = [
    { type: "run.started", payload: {} },
    { type: "run.progress", payload: { eventType: "model.requested", callId: "model-one", step: 1 } },
    { type: "run.progress", payload: { eventType: "model.responded", callId: "model-one", step: 1 } },
    { type: "tool.started", payload: { callId: "tool-one", toolName: "retrieve_passages" } },
    { type: "tool.completed", payload: { callId: "tool-one", toolName: "retrieve_passages", durationMs: 0 } },
    { type: "run.progress", payload: { eventType: "model.requested", callId: "model-two", step: 2 } },
    { type: "run.progress", payload: { eventType: "model.responded", callId: "model-two", step: 2 } },
    { type: "answer", payload: streamResultFixture("run-one") },
    { type: "run.completed", payload: { modelCalls: 2, toolCalls: 1 } },
  ];
  return data.map((event, index) => StreamEventSchema.parse({ schemaVersion: "stream-1.0", runId: "run-one",
    sequence: index + 1, timestamp: "2026-11-15T00:00:00.000Z", ...event }));
}
describe("Pure stream acceptance reducer", () => {
  it("accepts exact duplicates across reconnect without duplicating steps or reopening a terminal", () => {
    const events = frames(); let state = initialStreamState("run-one");
    for (const event of events) { state = reduceStream(state, event); expect(reduceStream(state, structuredClone(event))).toBe(state); }
    expect(state.phase).toBe("terminal"); expect(state.events).toHaveLength(9);
    expect(reduceStream(state, events[0])).toBe(state);
    expect(() => reduceStream(state, { ...events[0], sequence: 10 })).toThrow(expect.objectContaining({ code: "STREAM_EVENT_INVALID" }));
  });
  it("rejects gaps, conflicting duplicates, another run, malformed payloads and premature completion", () => {
    const events = frames(), initial = initialStreamState("run-one"), started = reduceStream(initial, events[0]);
    const invalid = [events[2], { ...events[1], runId: "run-other" }, { ...events[1], schemaVersion: "stream-99" },
      { ...events[1], payload: { question: "private" } }, { ...events[8], sequence: 2 },
      { ...events[0], timestamp: "2026-11-15T00:00:01.000Z" }, { ...events[7], sequence: 2 }];
    for (const event of invalid) expect(() => reduceStream(started, event)).toThrow(expect.objectContaining({ code: "STREAM_EVENT_INVALID" }));
    expect(() => reduceStream(initial, { ...events[8], sequence: 1 })).toThrow();
  });
  it("requires model/tool call correlation and refuses reused IDs", () => {
    const events = frames(); let state = events.slice(0, 2).reduce(reduceStream, initialStreamState("run-one"));
    const response = events[2]!;
    expect(() => reduceStream(state, { ...response, payload: { ...response.payload, callId: "model-other" } })).toThrow();
    state = events.slice(0, 4).reduce(reduceStream, initialStreamState("run-one"));
    const tool = events[4]!;
    expect(() => reduceStream(state, { ...tool, payload: { ...tool.payload, toolName: "read_doc" } })).toThrow();
    state = reduceStream(state, tool);
    expect(() => reduceStream(state, { ...events[5], payload: { eventType: "model.requested", callId: "model-one", step: 2 } })).toThrow();
  });
  it("allows a failed/cancelled run after start and a failed tool only before a terminal error", () => {
    const events = frames(), started = reduceStream(initialStreamState("run-one"), events[0]);
    for (const code of ["CANCELLED", "JOURNAL_FAILURE"] as const) {
      expect(reduceStream(started, { ...events[0], sequence: 2, type: code === "CANCELLED" ? "run.cancelled" : "run.failed",
        payload: { code, stage: "journal", retryable: false } }).phase).toBe("terminal");
    }
    let state = events.slice(0, 4).reduce(reduceStream, initialStreamState("run-one"));
    state = reduceStream(state, { ...events[4], type: "tool.failed", payload: { callId: "tool-one", toolName: "retrieve_passages", durationMs: 0, code: "TOOL_PERMISSION_DENIED" } });
    expect(() => reduceStream(state, events[5])).toThrow();
    expect(reduceStream(state, { ...events[0], sequence: 6, type: "run.failed", payload: { code: "TOOL_FAILURE", stage: "tool", retryable: false } }).phase).toBe("terminal");
  });
});
