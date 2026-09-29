import { describe, expect, it } from "vitest";

import {
  AgentEventEnvelopeSchema,
  AgentEventTypeSchema,
  TERMINAL_EVENT_TYPES,
} from "../../src/domain/agent-events.js";

const eventTypes = [
  "run.started",
  "model.requested",
  "model.responded",
  "tool.requested",
  "tool.succeeded",
  "tool.failed",
  "run.succeeded",
  "run.failed",
  "run.cancelled",
] as const;

const payloadByType = {
  "run.started": {},
  "model.requested": { step: 1, callId: "model-1" },
  "model.responded": {
    step: 1,
    callId: "model-1",
    actionKind: "call_tool",
    durationMs: 4,
  },
  "tool.requested": {
    step: 1,
    callId: "tool-1",
    toolName: "search_docs",
  },
  "tool.succeeded": {
    step: 1,
    callId: "tool-1",
    toolName: "search_docs",
    durationMs: 3,
    resultCount: 1,
    sourceIds: ["execution-journal"],
  },
  "tool.failed": {
    step: 1,
    callId: "tool-1",
    toolName: "search_docs",
    durationMs: 3,
    errorCode: "TOOL_FAILURE",
  },
  "run.succeeded": {
    answerLength: 47,
    sourceIds: ["execution-journal"],
    modelCalls: 2,
    toolCalls: 1,
  },
  "run.failed": {
    errorCode: "JOURNAL_FAILURE",
    stage: "journal",
    modelCalls: 1,
    toolCalls: 0,
  },
  "run.cancelled": {
    errorCode: "CANCELLED",
    stage: "orchestration",
    modelCalls: 1,
    toolCalls: 0,
  },
} as const;

function envelope(eventType: (typeof eventTypes)[number], sequence = 1) {
  return {
    schemaVersion: "1.0",
    eventId: `event-${sequence}`,
    runId: "run-1",
    sequence,
    occurredAt: `2026-01-01T00:00:00.${String(sequence).padStart(3, "0")}Z`,
    eventType,
    payload: payloadByType[eventType],
  };
}

describe("AgentEvent vocabulary and envelope", () => {
  it("fixes the complete event vocabulary and terminal set", () => {
    expect(AgentEventTypeSchema.options).toEqual(eventTypes);
    expect(TERMINAL_EVENT_TYPES).toEqual([
      "run.succeeded",
      "run.failed",
      "run.cancelled",
    ]);
  });

  it("accepts schemaVersion 1.0 envelopes with positive monotonic sequences", () => {
    const parsed = eventTypes.map((eventType, index) =>
      AgentEventEnvelopeSchema.parse(envelope(eventType, index + 1)),
    );

    expect(parsed.map(({ sequence }) => sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(new Set(parsed.map(({ eventId }) => eventId)).size).toBe(parsed.length);
    expect(parsed.every(({ schemaVersion }) => schemaVersion === "1.0")).toBe(true);

    expect(
      AgentEventEnvelopeSchema.safeParse({ ...envelope("run.started"), sequence: 0 })
        .success,
    ).toBe(false);
    expect(
      AgentEventEnvelopeSchema.safeParse({
        ...envelope("run.started"),
        schemaVersion: "1.1",
      }).success,
    ).toBe(false);
    expect(
      AgentEventEnvelopeSchema.safeParse({
        ...envelope("run.started"),
        unknownEnvelopeField: true,
      }).success,
    ).toBe(false);
  });

  it("rejects non-monotonic run evidence in the sequence contract", () => {
    const parsed = [1, 3, 2].map((sequence) =>
      AgentEventEnvelopeSchema.parse(envelope("model.requested", sequence)),
    );

    const monotonic = parsed.every(
      (event, index) => index === 0 || event.sequence === parsed[index - 1]!.sequence + 1,
    );
    expect(monotonic).toBe(false);
  });
});

describe("safe allow-listed event payloads", () => {
  it("accepts metadata-only payloads for every event type", () => {
    for (const [index, eventType] of eventTypes.entries()) {
      expect(AgentEventEnvelopeSchema.parse(envelope(eventType, index + 1))).toMatchObject({
        eventType,
        payload: payloadByType[eventType],
      });
    }
  });

  it("rejects prompts, documents, provider payloads, complete answers, and hidden reasoning", () => {
    const forbiddenFields = {
      rawPrompt: "system and user prompt",
      question: "complete user question",
      documents: [{ body: "complete document" }],
      providerPayload: { choices: [] },
      answer: "complete final answer",
      hiddenReasoning: "private chain of thought",
    };

    for (const [index, eventType] of eventTypes.entries()) {
      for (const [field, value] of Object.entries(forbiddenFields)) {
        expect(
          AgentEventEnvelopeSchema.safeParse({
            ...envelope(eventType, index + 1),
            payload: { ...payloadByType[eventType], [field]: value },
          }).success,
          `${eventType} accepted forbidden payload field ${field}`,
        ).toBe(false);
      }
    }
  });
});
