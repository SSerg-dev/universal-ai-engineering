import {
  ModelActionSchema,
  RunAgentInputSchema,
  RunAgentResultSchema,
  SearchDocsOutputSchema,
  type RunAgentResult,
  type SearchDocsOutput,
} from "../domain/agent-contracts.js";
import {
  AgentEventEnvelopeSchema,
  type AgentEventEnvelope,
  type AgentEventType,
} from "../domain/agent-events.js";
import type {
  AgentError,
  AgentErrorCode,
  AgentErrorStage,
} from "../domain/agent-errors.js";
import type { ClockPort } from "./ports/clock-port.js";
import type { IdGeneratorPort } from "./ports/id-generator-port.js";
import type { JournalPort } from "./ports/journal-port.js";
import type { ModelPort, ModelRequest } from "./ports/model-port.js";
import type { SearchDocsPort } from "./ports/search-docs-port.js";

export interface RunAgentPolicy {
  readonly timeoutMs: number;
  readonly terminalEvidenceTimeoutMs: number;
  readonly maxModelCalls: number;
  readonly maxToolCalls: number;
}

export interface RunAgentDependencies {
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
  readonly journal: JournalPort;
  readonly model: ModelPort;
  readonly searchDocs: SearchDocsPort;
  readonly policy: RunAgentPolicy;
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

function createLegacyRunAgentUseCase(
  dependencies: RunAgentDependencies,
): RunAgentUseCase {
  const { clock, ids, journal, model, policy, searchDocs } = dependencies;

  return async (input: unknown, callerSignal?: AbortSignal) => {
    const runId = ids.next("run");
    const signal = callerSignal ?? new AbortController().signal;
    let sequence = 0;
    let modelCalls = 0;
    let toolCalls = 0;

    const appendEvent = async (
      eventType: AgentEventType,
      payload: unknown,
    ): Promise<void> => {
      const event = AgentEventEnvelopeSchema.parse({
        schemaVersion: "1.0",
        eventId: ids.next("event"),
        runId,
        sequence: ++sequence,
        occurredAt: clock.now(),
        eventType,
        payload,
      });

      await journal.append(event, signal);
    };

    const fail = async (
      code: AgentErrorCode,
      stage: AgentError["stage"],
    ): Promise<RunAgentResult> => {
      const error: AgentError = {
        code,
        message: ERROR_MESSAGES[code],
        stage,
        retryable: false,
      };

      await appendEvent("run.failed", {
        errorCode: code,
        stage,
        modelCalls,
        toolCalls,
      });

      return RunAgentResultSchema.parse({ ok: false, runId, error });
    };

    const parsedInput = RunAgentInputSchema.safeParse(input);
    if (!parsedInput.success) {
      return fail("INVALID_REQUEST", "request");
    }

    const { question } = parsedInput.data;
    let state: LoopState = "awaiting_tool";
    let toolResult: SearchDocsOutput | undefined;

    await appendEvent("run.started", {});

    while (true) {
      if (modelCalls >= policy.maxModelCalls) {
        return fail("LIMIT_EXCEEDED", "model");
      }

      const modelCallId = ids.next("model");
      const modelStep = modelCalls + 1;
      await appendEvent("model.requested", {
        step: modelStep,
        callId: modelCallId,
      });

      const modelRequest: ModelRequest =
        state === "awaiting_tool"
          ? { state, question }
          : { state, question, toolResult: toolResult as SearchDocsOutput };
      const unknownAction = await model.request(modelRequest, signal);
      modelCalls += 1;

      const parsedAction = ModelActionSchema.safeParse(unknownAction);
      if (!parsedAction.success) {
        return fail("INVALID_MODEL_ACTION", "model");
      }

      const action = parsedAction.data;
      await appendEvent("model.responded", {
        step: modelStep,
        callId: modelCallId,
        actionKind: action.type,
        durationMs: 0,
      });

      if (state === "awaiting_tool") {
        if (action.type !== "call_tool") {
          return fail("INVALID_TRANSITION", "orchestration");
        }
        if (toolCalls >= policy.maxToolCalls) {
          return fail("LIMIT_EXCEEDED", "tool");
        }

        const toolCallId = ids.next("tool");
        await appendEvent("tool.requested", {
          step: 1,
          callId: toolCallId,
          toolName: "search_docs",
        });

        const unknownToolResult = await searchDocs.search(action.arguments, signal);
        toolCalls += 1;
        toolResult = SearchDocsOutputSchema.parse(unknownToolResult);

        await appendEvent("tool.succeeded", {
          step: 1,
          callId: toolCallId,
          toolName: "search_docs",
          durationMs: 0,
          resultCount: toolResult.matches.length,
          sourceIds: toolResult.matches.map(({ documentId }) => documentId),
        });

        state = "awaiting_final";
        continue;
      }

      if (action.type !== "final_answer") {
        return fail("INVALID_TRANSITION", "orchestration");
      }

      const matchesById = new Map(
        (toolResult?.matches ?? []).map((match) => [match.documentId, match]),
      );
      if (action.sourceIds.some((sourceId) => !matchesById.has(sourceId))) {
        return fail("INVALID_TRANSITION", "orchestration");
      }

      const sources = action.sourceIds.map((sourceId) => {
        const match = matchesById.get(sourceId);
        if (match === undefined) {
          throw new Error("Validated source membership became inconsistent.");
        }
        return { documentId: match.documentId, title: match.title };
      });

      await appendEvent("run.succeeded", {
        answerLength: action.answer.length,
        sourceIds: action.sourceIds,
        modelCalls,
        toolCalls,
      });

      return RunAgentResultSchema.parse({
        ok: true,
        runId,
        answer: action.answer,
        sources,
        usage: { modelCalls, toolCalls },
      });
    }
  };
}

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

export function createRunAgentUseCase(
  dependencies: RunAgentDependencies,
): RunAgentUseCase {
  const { clock, ids, journal, model, policy, searchDocs } = dependencies;

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
    ): AgentEventEnvelope =>
      AgentEventEnvelopeSchema.parse({
        schemaVersion: "1.0",
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
      event: AgentEventEnvelope,
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
      let toolResult: SearchDocsOutput | undefined;

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

        const modelRequest: ModelRequest =
          state === "awaiting_tool"
            ? { state, question }
            : { state, question, toolResult: toolResult as SearchDocsOutput };

        let unknownAction: unknown;
        try {
          unknownAction = await model.request(modelRequest, abortContext.signal);
          abortContext.signal.throwIfAborted();
        } catch {
          if (abortContext.signal.aborted) throw abortContext.cancellation();
          return await terminalize("MODEL_FAILURE", "model");
        }

        const parsedAction = ModelActionSchema.safeParse(unknownAction);
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
            toolName: "search_docs",
          });

          try {
            const unknownToolResult = await searchDocs.search(
              action.arguments,
              abortContext.signal,
            );
            abortContext.signal.throwIfAborted();
            toolResult = SearchDocsOutputSchema.parse(unknownToolResult);
          } catch {
            if (abortContext.signal.aborted) throw abortContext.cancellation();
            await appendOrdinaryEvent("tool.failed", {
              step: toolCalls,
              callId: toolCallId,
              toolName: "search_docs",
              durationMs: 0,
              errorCode: "TOOL_FAILURE",
            });
            return await terminalize("TOOL_FAILURE", "tool");
          }

          await appendOrdinaryEvent("tool.succeeded", {
            step: toolCalls,
            callId: toolCallId,
            toolName: "search_docs",
            durationMs: 0,
            resultCount: toolResult.matches.length,
            sourceIds: toolResult.matches.map(({ documentId }) => documentId),
          });

          state = "awaiting_final";
          continue;
        }

        if (action.type !== "final_answer") {
          return await terminalize("INVALID_TRANSITION", "orchestration");
        }

        const matchesById = new Map(
          (toolResult?.matches ?? []).map((match) => [match.documentId, match]),
        );
        if (action.sourceIds.some((sourceId) => !matchesById.has(sourceId))) {
          return await terminalize("INVALID_TRANSITION", "orchestration");
        }

        const sources = action.sourceIds.map((sourceId) => {
          const match = matchesById.get(sourceId);
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
        await appendOrdinaryEvent("run.succeeded", {
          answerLength: action.answer.length,
          sourceIds: action.sourceIds,
          modelCalls,
          toolCalls,
        });
        terminalAttempted = true;
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
