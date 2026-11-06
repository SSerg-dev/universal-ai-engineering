import {
  modelActionSchema,
  runInputSchema,
  toolInputSchema,
  toolObservationSchema,
} from "../domain/contracts.js";
import type {
  RunErrorCode,
  RunEvent,
  RunEventData,
  RunOutcome,
  RunResult,
} from "../domain/contracts.js";
import { transition } from "../domain/transition.js";
import type { RunState } from "../domain/transition.js";
import type { RunPorts } from "./ports.js";

export interface RunOptions {
  maxSteps?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

const cancellation = Symbol("cancelled");
const timeout = Symbol("timeout");

async function runEffect(
  effect: () => Promise<unknown>,
  signal: AbortSignal,
): Promise<unknown> {
  signal.throwIfAborted();
  let onAbort!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
  });

  try {
    const result = await Promise.race([aborted, Promise.resolve().then(() => {
      signal.throwIfAborted();
      return effect();
    })]);
    signal.throwIfAborted();
    return result;
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

async function runLoop(
  question: string,
  ports: RunPorts,
  maxSteps: number,
  signal: AbortSignal,
  record: (event: RunEventData) => void,
): Promise<RunOutcome> {
  let state: RunState = { kind: "awaiting_tool" };
  let effectFailure: RunErrorCode = "MODEL_FAILED";

  try {
    signal.throwIfAborted();
    for (let step = 0; step < maxSteps; step++) {
      const observation = state.kind === "holding_observation" ? state.observation : undefined;
      effectFailure = "MODEL_FAILED";
      record({ eventType: "model_requested" });
      const response = await runEffect(
        () => ports.model.nextAction({ question, observation }, signal), signal,
      );
      const action = modelActionSchema.safeParse(response);
      if (!action.success) return { kind: "failed", code: "INVALID_MODEL_ACTION" };

      record({ eventType: "model_responded" });
      const next = transition(state, action.data);
      if (next.kind !== "execute_tool") return next;

      const input = toolInputSchema.safeParse(next.arguments);
      if (!input.success) return { kind: "failed", code: "INVALID_TOOL_INPUT" };

      effectFailure = "TOOL_FAILED";
      record({ eventType: "tool_started" });
      const output = await runEffect(() => ports.tool.execute(input.data, signal), signal);
      const observed = toolObservationSchema.safeParse(output);
      if (!observed.success) return { kind: "failed", code: "INVALID_TOOL_OUTPUT" };

      record({ eventType: "tool_observed" });
      state = { kind: "holding_observation", observation: observed.data };
    }
  } catch {
    if (signal.aborted) {
      return { kind: "failed", code: signal.reason === timeout ? "TIMEOUT" : "CANCELLED" };
    }
    return { kind: "failed", code: effectFailure };
  }

  return { kind: "failed", code: "LIMIT_EXCEEDED" };
}

export async function runAgent(
  rawInput: unknown,
  ports: RunPorts,
  options: RunOptions = {},
): Promise<RunResult> {
  const input = runInputSchema.safeParse(rawInput);
  if (!input.success) return { kind: "failed", code: "INVALID_INPUT" };

  const runId = ports.createRunId();
  const events: RunEvent[] = [];
  const record = (event: RunEventData) => {
    events.push({ ...event, runId, seq: events.length + 1, timestamp: ports.now().toISOString() });
  };

  const caller = new AbortController();
  const callerSignal = options.signal;
  const cancel = () => caller.abort(cancellation);
  if (callerSignal?.aborted) cancel();
  else callerSignal?.addEventListener("abort", cancel, { once: true });

  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(timeout), options.timeoutMs ?? 5000);
  const signal = AbortSignal.any([caller.signal, deadline.signal]);

  let outcome: RunOutcome;
  try {
    record({ eventType: "run_started" });
    outcome = await runLoop(input.data.question, ports, options.maxSteps ?? 2, signal, record);
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", cancel);
  }

  record(outcome.kind === "answered"
    ? { eventType: "run_answered" }
    : { eventType: "run_failed", code: outcome.code });

  try {
    for (const event of events) await ports.journal.append(event);
  } catch {
    return { ...outcome, runId, journalStatus: "incomplete" };
  }
  return { ...outcome, runId, journalStatus: "complete" };
}
