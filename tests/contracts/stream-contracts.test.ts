import { describe, expect, it } from "vitest";

import { StreamEventSchema, StreamInputSchema, StreamRunIdSchema } from "../../src/domain/stream-contracts.js";

const base = { schemaVersion: "stream-1.0", runId: "run-one", sequence: 1, timestamp: "2026-11-15T00:00:00.000Z" };
describe("Content streaming boundary contracts", () => {
  it("requires bounded questions and safe generated run identities", () => {
    expect(StreamInputSchema.parse({ question: " query " })).toEqual({ question: "query" });
    for (const input of [{ question: "" }, { question: "x".repeat(2049) }, { question: "q", path: "private" }]) expect(StreamInputSchema.safeParse(input).success).toBe(false);
    for (const id of ["../run-one", "operation-one", "run-", "run-" + "x".repeat(128)]) expect(StreamRunIdSchema.safeParse(id).success).toBe(false);
  });
  it("validates start/progress/tool/final outcomes and rejects content in metadata frames", () => {
    expect(StreamEventSchema.parse({ ...base, type: "run.started", payload: {} })).toMatchObject({ sequence: 1 });
    expect(StreamEventSchema.safeParse({ ...base, type: "run.progress", payload: { eventType: "model.requested", callId: "call-one", step: 1, question: "secret" } }).success).toBe(false);
    expect(StreamEventSchema.safeParse({ ...base, type: "tool.started", payload: { callId: "call-one", toolName: "retrieve_passages", arguments: {} } }).success).toBe(false);
    expect(StreamEventSchema.safeParse({ ...base, type: "run.failed", payload: { code: "TOOL_FAILURE", stage: "tool", retryable: false, message: "raw exception" } }).success).toBe(false);
  });
  it("separates cancellation from errors and bounds ordering/serialized frames", () => {
    expect(StreamEventSchema.parse({ ...base, type: "run.cancelled", payload: { code: "CANCELLED", stage: "orchestration", retryable: false } }).type).toBe("run.cancelled");
    for (const sequence of [0, 25, 1.5]) expect(StreamEventSchema.safeParse({ ...base, sequence, type: "run.started", payload: {} }).success).toBe(false);
    expect(StreamEventSchema.safeParse({ ...base, type: "run.failed", payload: { code: "CANCELLED", stage: "orchestration", retryable: false } }).success).toBe(false);
    expect(StreamEventSchema.safeParse({ ...base, type: "run.completed", payload: { modelCalls: 1, toolCalls: 0 } }).success).toBe(false);
  });
});
