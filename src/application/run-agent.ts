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
  type AgentEventType,
} from "../domain/agent-events.js";
import type { AgentError, AgentErrorCode } from "../domain/agent-errors.js";
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

export function createRunAgentUseCase(
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
