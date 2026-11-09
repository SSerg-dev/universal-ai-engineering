import {
  RunAgentInputSchema,
  RunAgentResultSchema,
  type RunAgentResult,
  type RunAgentSource,
} from "../domain/agent-contracts.js";
import type { AgentEventType } from "../domain/agent-events.js";
import type { ExecutionEventEnvelope } from "../domain/tool-events.js";
import type { RegisteredModelAction, ToolErrorCode, ToolCallContext } from "../domain/tool-contracts.js";
import type {
  AgentError,
  AgentErrorCode,
  AgentErrorStage,
} from "../domain/agent-errors.js";
import type { ClockPort } from "./ports/clock-port.js";
import type { IdGeneratorPort } from "./ports/id-generator-port.js";
import type { JournalPort } from "./ports/journal-port.js";
import type { ModelPort, ModelRequest } from "./ports/model-port.js";

export interface RunAgentPolicy {
  readonly timeoutMs: number;
  readonly terminalEvidenceTimeoutMs: number;
  readonly maxModelCalls: number;
  readonly maxToolCalls: number;
}

export type ToolEffectResult<TObservation> =
  | { readonly ok: true; readonly observation: TObservation; readonly sources: readonly RunAgentSource[] }
  | { readonly ok: false; readonly code?: ToolErrorCode };

export interface AgentLoopDependencies<TObservation, TEvent extends ExecutionEventEnvelope> {
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
  readonly journal: JournalPort<TEvent>;
  readonly model: ModelPort<TObservation>;
  readonly policy: RunAgentPolicy;
  readonly schemaVersion: TEvent["schemaVersion"];
  readonly eventSchema: { parse(input: unknown): TEvent };
  readonly actionSchema: {
    safeParse(input: unknown): { success: true; data: RegisteredModelAction } | { success: false };
  };
  executeTool(
    action: Extract<RegisteredModelAction, { type: "call_tool" }>,
    signal: AbortSignal,
    context: ToolCallContext,
  ): Promise<ToolEffectResult<TObservation>>;
}

export type RunAgentUseCase = (
  input: unknown,
  signal?: AbortSignal,
) => Promise<RunAgentResult>;

type LoopState = "awaiting_tool" | "awaiting_final";

const ERROR_MESSAGES: Record<AgentErrorCode, string> = {
  INVALID_REQUEST: "The agent request is invalid.",
  MODEL_FAILURE: "The model could not produce an action.",
  INVALID_MODEL_ACTION: "The model produced an invalid action.",
  INVALID_TRANSITION: "The model action is not valid in the current state.",
  TOOL_FAILURE: "The search tool failed.",
  TIMEOUT: "The agent run timed out.",
  CANCELLED: "The agent run was cancelled.",
  LIMIT_EXCEEDED: "The agent run exceeded its call budget.",
  JOURNAL_FAILURE: "The execution journal could not be updated.",
  INTERNAL_ERROR: "The agent run failed unexpectedly.",
};

type CancellationCode = "TIMEOUT" | "CANCELLED";

class JournalWriteFailure extends Error {
  constructor() {
    super(ERROR_MESSAGES.JOURNAL_FAILURE);
    this.name = "JournalWriteFailure";
  }
}

class RunCancellation extends Error {
  readonly code: CancellationCode;

  constructor(code: CancellationCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "RunCancellation";
    this.code = code;
  }
}

interface RunAbortContext {
  readonly signal: AbortSignal;
  cancellation(): RunCancellation;
  dispose(): void;
}

function createRunAbortContext(
  timeoutMs: number,
  callerSignal?: AbortSignal,
): RunAbortContext {
  const controller = new AbortController();
  const timeoutReason = Object.freeze({ origin: "deadline" });
  const callerReason = Object.freeze({ origin: "caller" });

  const abortFromCaller = () => controller.abort(callerReason);
  if (callerSignal?.aborted === true) {
    abortFromCaller();
  } else {
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  const timeout = setTimeout(
    () => controller.abort(timeoutReason),
    Math.max(0, timeoutMs),
  );

  return {
    signal: controller.signal,
    cancellation: () =>
      new RunCancellation(
        controller.signal.reason === timeoutReason ? "TIMEOUT" : "CANCELLED",
      ),
    dispose: () => {
      clearTimeout(timeout);
      callerSignal?.removeEventListener("abort", abortFromCaller);
    },
  };
}

function createFailureResult(
  runId: string,
  code: AgentErrorCode,
  stage: AgentErrorStage,
): RunAgentResult {
  const error: AgentError = {
    code,
    message: ERROR_MESSAGES[code],
    stage,
    retryable: false,
  };

  return RunAgentResultSchema.parse({ ok: false, runId, error });
}

export function createAgentLoop<TObservation, TEvent extends ExecutionEventEnvelope>(
  dependencies: AgentLoopDependencies<TObservation, TEvent>,
): RunAgentUseCase {
  const { clock, ids, journal, model, policy, executeTool, eventSchema, actionSchema, schemaVersion } = dependencies;

  return async (input: unknown, callerSignal?: AbortSignal) => {
    const runId = ids.next("run");
    const abortContext = createRunAbortContext(policy.timeoutMs, callerSignal);
    let sequence = 0;
    let modelCalls = 0;
    let toolCalls = 0;
    let terminalAttempted = false;

    const createEvent = (
      eventType: AgentEventType,
      payload: unknown,
    ): TEvent =>
      eventSchema.parse({
        schemaVersion,
        eventId: ids.next("event"),
        runId,
        sequence: sequence + 1,
        occurredAt: clock.now(),
        eventType,
        payload,
      });

    const appendOrdinaryEvent = async (
      eventType: AgentEventType,
      payload: unknown,
    ): Promise<void> => {
      if (abortContext.signal.aborted) {
        throw abortContext.cancellation();
      }

      const event = createEvent(eventType, payload);
      try {
        await journal.append(event, abortContext.signal);
      } catch {
        if (abortContext.signal.aborted) {
          throw abortContext.cancellation();
        }
        throw new JournalWriteFailure();
      }
      sequence = event.sequence;

      if (abortContext.signal.aborted) {
        throw abortContext.cancellation();
      }
    };

    const appendTerminalEvent = async (
      event: TEvent,
      signal: AbortSignal,
    ): Promise<boolean> => {
      terminalAttempted = true;
      try {
        await journal.append(event, signal);
        sequence = event.sequence;
        return true;
      } catch {
        return false;
      }
    };

    const appendSuccessTerminalEvent = async (payload: unknown): Promise<void> => {
      const event = createEvent("run.succeeded", payload);
      try {
        await journal.append(event, abortContext.signal);
      } catch {
        if (abortContext.signal.aborted) {
          throw abortContext.cancellation();
        }
        throw new JournalWriteFailure();
      }
      sequence = event.sequence;
      terminalAttempted = true;
    };

    const terminalize = async (
      code: AgentErrorCode,
      stage: AgentErrorStage,
    ): Promise<RunAgentResult> => {
      if (terminalAttempted) {
        return createFailureResult(runId, "JOURNAL_FAILURE", "journal");
      }

      const result = createFailureResult(runId, code, stage);
      const eventType = code === "CANCELLED" ? "run.cancelled" : "run.failed";
      const payload = { errorCode: code, stage, modelCalls, toolCalls };
      let cleanupController: AbortController | undefined;
      let cleanupTimeout: ReturnType<typeof setTimeout> | undefined;
      let terminalSignal = abortContext.signal;

      if (abortContext.signal.aborted) {
        cleanupController = new AbortController();
        terminalSignal = cleanupController.signal;
        cleanupTimeout = setTimeout(
          () => cleanupController?.abort(new JournalWriteFailure()),
          Math.max(0, policy.terminalEvidenceTimeoutMs),
        );
      }

      try {
        const event = createEvent(eventType, payload);
        const appended = await appendTerminalEvent(event, terminalSignal);
        return appended
          ? result
          : createFailureResult(runId, "JOURNAL_FAILURE", "journal");
      } catch {
        return createFailureResult(runId, "JOURNAL_FAILURE", "journal");
      } finally {
        if (cleanupTimeout !== undefined) clearTimeout(cleanupTimeout);
      }
    };

    try {
      const parsedInput = RunAgentInputSchema.safeParse(input);
      if (!parsedInput.success) {
        return await terminalize("INVALID_REQUEST", "request");
      }

      const { question } = parsedInput.data;
      let state: LoopState = "awaiting_tool";
      let toolResult: TObservation | undefined;
      let observedSources: readonly RunAgentSource[] = [];

      await appendOrdinaryEvent("run.started", {});

      while (true) {
        if (modelCalls >= policy.maxModelCalls) {
          return await terminalize("LIMIT_EXCEEDED", "model");
        }

        modelCalls += 1;
        const modelCallId = ids.next("model");
        const modelStep = modelCalls;
        await appendOrdinaryEvent("model.requested", {
          step: modelStep,
          callId: modelCallId,
        });

        const modelRequest: ModelRequest<TObservation> =
          state === "awaiting_tool"
            ? { state, question }
            : { state, question, toolResult: toolResult as TObservation };

        let unknownAction: unknown;
        try {
          unknownAction = await model.request(modelRequest, abortContext.signal);
          abortContext.signal.throwIfAborted();
        } catch {
          if (abortContext.signal.aborted) throw abortContext.cancellation();
          return await terminalize("MODEL_FAILURE", "model");
        }

        const parsedAction = actionSchema.safeParse(unknownAction);
        if (!parsedAction.success) {
          return await terminalize("INVALID_MODEL_ACTION", "model");
        }

        const action = parsedAction.data;
        await appendOrdinaryEvent("model.responded", {
          step: modelStep,
          callId: modelCallId,
          actionKind: action.type,
          durationMs: 0,
        });

        if (state === "awaiting_tool") {
          if (action.type !== "call_tool") {
            return await terminalize("INVALID_TRANSITION", "orchestration");
          }
          if (toolCalls >= policy.maxToolCalls) {
            return await terminalize("LIMIT_EXCEEDED", "tool");
          }

          toolCalls += 1;
          const toolCallId = ids.next("tool");
          await appendOrdinaryEvent("tool.requested", {
            step: toolCalls,
            callId: toolCallId,
            toolName: action.toolName,
          });

          let effect: ToolEffectResult<TObservation>;
          try {
            effect = await executeTool(action, abortContext.signal, { runId, callId: toolCallId });
            abortContext.signal.throwIfAborted();
          } catch {
            if (abortContext.signal.aborted) throw abortContext.cancellation();
            effect = { ok: false };
          }
          if (!effect.ok) {
            await appendOrdinaryEvent("tool.failed", {
              step: toolCalls,
              callId: toolCallId,
              toolName: action.toolName,
              durationMs: 0,
              errorCode: "TOOL_FAILURE",
              ...(effect.code === undefined ? {} : { toolErrorCode: effect.code }),
            });
            return await terminalize("TOOL_FAILURE", "tool");
          }
          toolResult = effect.observation;
          observedSources = effect.sources;

          await appendOrdinaryEvent("tool.succeeded", {
            step: toolCalls,
            callId: toolCallId,
            toolName: action.toolName,
            durationMs: 0,
            resultCount: observedSources.length,
            sourceIds: observedSources.map(({ documentId }) => documentId),
          });

          state = "awaiting_final";
          continue;
        }

        if (action.type !== "final_answer") {
          return await terminalize("INVALID_TRANSITION", "orchestration");
        }

        const sourcesById = new Map(
          observedSources.map((source) => [source.documentId, source]),
        );
        if (action.sourceIds.some((sourceId) => !sourcesById.has(sourceId))) {
          return await terminalize("INVALID_TRANSITION", "orchestration");
        }

        const sources = action.sourceIds.map((sourceId) => {
          const match = sourcesById.get(sourceId);
          if (match === undefined) {
            throw new Error("Validated source membership became inconsistent.");
          }
          return { documentId: match.documentId, title: match.title };
        });

        const result = RunAgentResultSchema.parse({
          ok: true,
          runId,
          answer: action.answer,
          sources,
          usage: { modelCalls, toolCalls },
        });
        await appendSuccessTerminalEvent({
          answerLength: action.answer.length,
          sourceIds: action.sourceIds,
          modelCalls,
          toolCalls,
        });
        return result;
      }
    } catch (error) {
      if (error instanceof JournalWriteFailure) {
        return createFailureResult(runId, "JOURNAL_FAILURE", "journal");
      }
      if (error instanceof RunCancellation) {
        return await terminalize(error.code, "orchestration");
      }
      return await terminalize("INTERNAL_ERROR", "orchestration");
    } finally {
      abortContext.dispose();
    }
  };
}
