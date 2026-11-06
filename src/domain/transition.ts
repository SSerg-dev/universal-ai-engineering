import type { ModelAction, RunOutcome, ToolObservation } from "./contracts.js";

export type RunState =
  | { kind: "awaiting_tool" }
  | { kind: "holding_observation"; observation: ToolObservation };

export function transition(state: RunState, action: ModelAction):
  | RunOutcome
  | { kind: "execute_tool"; arguments: unknown } {
  if (action.kind === "answer") {
    return state.kind === "holding_observation"
      ? { kind: "answered", text: action.text }
      : { kind: "failed", code: "TOOL_REQUIRED" };
  }

  return state.kind === "awaiting_tool"
    ? { kind: "execute_tool", arguments: action.arguments }
    : { kind: "failed", code: "TOOL_ALREADY_CALLED" };
}
