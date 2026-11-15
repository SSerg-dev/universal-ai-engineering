import { StreamBoundaryError, StreamEventSchema, StreamRunIdSchema, type StreamEvent } from "../domain/stream-contracts.js";

type Phase = "start" | "model1_request" | "model1_response" | "tool_start" | "tool_complete" |
  "model2_request" | "model2_response" | "answer" | "completion" | "failure" | "terminal";
export interface StreamState {
  readonly runId: string;
  readonly events: readonly StreamEvent[];
  readonly phase: Phase;
  readonly modelCallId?: string;
  readonly firstModelCallId?: string;
  readonly toolCallId?: string;
  readonly toolName?: string;
}
export function initialStreamState(runId: unknown): StreamState {
  const id = StreamRunIdSchema.safeParse(runId);
  if (!id.success) throw new StreamBoundaryError("STREAM_EVENT_INVALID");
  return { runId: id.data, events: [], phase: "start" };
}
export function reduceStream(state: StreamState, raw: unknown): StreamState {
  const selected = StreamEventSchema.safeParse(raw);
  if (!selected.success || selected.data.runId !== state.runId) throw new StreamBoundaryError("STREAM_EVENT_INVALID");
  const event = selected.data;
  const fail = (): never => { throw new StreamBoundaryError("STREAM_EVENT_INVALID"); };
  if (event.sequence <= state.events.length) {
    if (JSON.stringify(event) !== JSON.stringify(state.events[event.sequence - 1])) fail();
    return state; // Exact replay duplicates are idempotent, including a repeated terminal.
  }
  if (event.sequence !== state.events.length + 1 || state.phase === "terminal") fail();
  let next: StreamState = { ...state, events: [...state.events, event] };
  if (event.type === "run.failed" || event.type === "run.cancelled") {
    if (state.phase === "start" || state.phase === "completion") fail();
    return { ...next, phase: "terminal" };
  }
  switch (state.phase) {
    case "start":
      if (event.type !== "run.started") return fail();
      return { ...next, phase: "model1_request" };
    case "model1_request": case "model2_request": {
      const first = state.phase === "model1_request";
      if (event.type !== "run.progress" || event.payload.eventType !== "model.requested" || event.payload.step !== (first ? 1 : 2) ||
        event.payload.callId === state.firstModelCallId || event.payload.callId === state.toolCallId) return fail();
      return { ...next, phase: first ? "model1_response" : "model2_response", modelCallId: event.payload.callId,
        ...(first ? { firstModelCallId: event.payload.callId } : {}) };
    }
    case "model1_response": case "model2_response":
      if (event.type !== "run.progress" || event.payload.eventType !== "model.responded" ||
        event.payload.step !== (state.phase === "model1_response" ? 1 : 2) || event.payload.callId !== state.modelCallId) return fail();
      return { ...next, phase: state.phase === "model1_response" ? "tool_start" : "answer" };
    case "tool_start":
      if (event.type !== "tool.started" || event.payload.callId === state.modelCallId) return fail();
      return { ...next, phase: "tool_complete", toolCallId: event.payload.callId, toolName: event.payload.toolName };
    case "tool_complete":
      if ((event.type !== "tool.completed" && event.type !== "tool.failed") || event.payload.callId !== state.toolCallId || event.payload.toolName !== state.toolName) return fail();
      return { ...next, phase: event.type === "tool.failed" ? "failure" : "model2_request" };
    case "answer":
      if (event.type !== "answer") return fail();
      return { ...next, phase: "completion" };
    case "completion":
      if (event.type !== "run.completed") return fail();
      return { ...next, phase: "terminal" };
    default: return fail();
  }
}
