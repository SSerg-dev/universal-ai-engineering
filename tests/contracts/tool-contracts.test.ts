import { describe, expect, it } from "vitest";

import { ModelActionSchema } from "../../src/domain/agent-contracts.js";
import { AgentEventEnvelopeSchema } from "../../src/domain/agent-events.js";
import {
  ReadDocInputSchema,
  ReadDocOutputSchema,
  RegisteredModelActionSchema,
  ToolDescriptorSchema,
  ToolErrorCodeSchema,
  ToolExecutionResultSchema,
  ToolInvocationSchema,
} from "../../src/domain/tool-contracts.js";
import {
  ExecutionEventEnvelopeSchema,
  RegisteredAgentEventEnvelopeSchema,
} from "../../src/domain/tool-events.js";

const toolEvent = {
  schemaVersion: "1.1",
  eventId: "event-1",
  runId: "run-1",
  sequence: 1,
  occurredAt: "2026-11-09T00:00:00Z",
  eventType: "tool.failed",
  payload: {
    step: 1,
    callId: "tool-1",
    toolName: "read_doc",
    durationMs: 0,
    errorCode: "TOOL_FAILURE",
    toolErrorCode: "TOOL_PERMISSION_DENIED",
  },
};

describe("registered tool contracts", () => {
  it.each(["../secret", "ReadDoc", "", "x".repeat(65)])("rejects invalid name %s", (name) => {
    expect(ToolDescriptorSchema.safeParse({ name, description: "A tool" }).success).toBe(false);
  });

  it("preserves unknown arguments for validation at the registry boundary", () => {
    const action = { type: "call_tool", toolName: "read_doc", arguments: { documentId: 42 } };
    expect(RegisteredModelActionSchema.parse(action)).toEqual(action);
    expect(ModelActionSchema.safeParse(action).success).toBe(false);
    expect(ToolInvocationSchema.safeParse({ toolName: "read_doc", arguments: {}, extra: true }).success).toBe(false);
  });

  it("keeps failure outcomes distinct and rejects raw exception metadata", () => {
    expect(ToolErrorCodeSchema.options).toEqual([
      "TOOL_NOT_FOUND", "TOOL_PERMISSION_DENIED", "TOOL_INPUT_INVALID",
      "TOOL_OUTPUT_INVALID", "TOOL_TIMEOUT", "TOOL_CANCELLED", "TOOL_EXECUTION_FAILED",
    ]);
    for (const code of ToolErrorCodeSchema.options) {
      expect(ToolExecutionResultSchema.parse({ ok: false, code })).toEqual({ ok: false, code });
      expect(ToolExecutionResultSchema.safeParse({ ok: false, code, message: "secret exception" }).success).toBe(false);
    }
    expect(ToolExecutionResultSchema.safeParse({ ok: false, code: "UNKNOWN_ERROR" }).success).toBe(false);
  });

  it("normalizes read IDs and validates found and missing documents", () => {
    expect(ReadDocInputSchema.parse({ documentId: "  execution-journal  " })).toEqual({
      documentId: "execution-journal",
    });
    expect(ReadDocInputSchema.safeParse({ documentId: " " }).success).toBe(false);
    expect(ReadDocInputSchema.safeParse({ documentId: "a", path: "secret" }).success).toBe(false);
    expect(ReadDocOutputSchema.parse({ document: null })).toEqual({ document: null });
    expect(ReadDocOutputSchema.parse({
      document: { documentId: "a", title: "A", content: "Document text" },
    }).document?.content).toBe("Document text");
    expect(ReadDocOutputSchema.safeParse({ document: { documentId: "a", content: "text" } }).success).toBe(false);
  });
});

describe("versioned registered-tool journal", () => {
  it("accepts version 1.1 with a typed error while the original schema remains strict", () => {
    expect(RegisteredAgentEventEnvelopeSchema.parse(toolEvent)).toEqual(toolEvent);
    expect(ExecutionEventEnvelopeSchema.parse(toolEvent)).toEqual(toolEvent);
    expect(AgentEventEnvelopeSchema.safeParse(toolEvent).success).toBe(false);
    const legacy = {
      ...toolEvent,
      schemaVersion: "1.0",
      eventType: "run.started",
      payload: {},
    };
    expect(AgentEventEnvelopeSchema.parse(legacy)).toEqual(legacy);
    expect(ExecutionEventEnvelopeSchema.parse(legacy)).toEqual(legacy);
    expect(RegisteredAgentEventEnvelopeSchema.safeParse(legacy).success).toBe(false);
    expect(ExecutionEventEnvelopeSchema.safeParse({ ...legacy, schemaVersion: "2.0" }).success).toBe(false);
  });

  it.each(["question", "arguments", "output", "document", "answer", "cause", "stack"])(
    "excludes %s from registered-tool journal payloads", (key) => {
      expect(RegisteredAgentEventEnvelopeSchema.safeParse({
        ...toolEvent,
        payload: { ...toolEvent.payload, [key]: "sensitive marker" },
      }).success).toBe(false);
    },
  );
});
