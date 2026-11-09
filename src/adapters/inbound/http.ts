import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";

import type { RunAgentUseCase } from "../../application/run-agent.js";
import type { RunAgentResult } from "../../domain/agent-contracts.js";
import type { ResolveCitationUseCase } from "../../application/resolve-citation.js";
import { RetrievalBoundaryError } from "../../domain/retrieval-contracts.js";
import type { ConversationCommandHandler } from "../../application/conversation-command.js";
import { StateBoundaryError, type StateBoundaryCode } from "../../domain/state-contracts.js";

const HTTP_BODY_LIMIT_BYTES = 16 * 1024;

export interface BuildHttpAppOptions {
  readonly runAgent: RunAgentUseCase;
  readonly resolveCitation?: ResolveCitationUseCase;
  readonly conversationCommand?: ConversationCommandHandler;
}

function stateStatus(code: StateBoundaryCode): number {
  switch (code) {
    case "STATE_INPUT_INVALID": case "RETENTION_INVALID": return 400;
    case "CONVERSATION_NOT_FOUND": case "MEMORY_NOT_FOUND": return 404;
    case "CONVERSATION_EXPIRED": return 410;
    case "VERSION_CONFLICT": case "CONVERSATION_BUSY": case "REQUEST_KEY_REUSED":
    case "TURN_INTERRUPTED": case "TURN_FENCED": case "STATE_CAPACITY_EXCEEDED": return 409;
    default: return 500;
  }
}

async function bindCallerSignal(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const controller = new AbortController();
  request.setDecorator("agentRunSignal", controller.signal);
  // A complete request body may close while its response is still being computed.
  const onRequestClose = () => { if (!request.raw.complete) controller.abort(); };
  const cleanup = () => {
    request.raw.removeListener("close", onRequestClose);
    reply.raw.removeListener("close", onResponseClose);
    reply.raw.removeListener("finish", cleanup);
  };
  const onResponseClose = () => {
    if (!reply.raw.writableFinished) controller.abort();
    cleanup();
  };
  request.raw.once("close", onRequestClose);
  reply.raw.once("close", onResponseClose);
  reply.raw.once("finish", cleanup);
}

function resultStatus(result: RunAgentResult): number {
  if (result.ok) return 200;

  switch (result.error.code) {
    case "INVALID_REQUEST":
      return 400;
    case "TIMEOUT":
      return 408;
    case "INVALID_MODEL_ACTION":
    case "INVALID_TRANSITION":
    case "LIMIT_EXCEEDED":
      return 422;
    case "CANCELLED":
      return 499;
    case "JOURNAL_FAILURE":
    case "INTERNAL_ERROR":
      return 500;
    case "MODEL_FAILURE":
    case "TOOL_FAILURE":
      return 502;
  }
}

function transportStatus(error: unknown): 400 | 413 | 415 | 500 {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : undefined;
  const statusCode =
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
      ? error.statusCode
      : undefined;

  switch (code) {
    case "FST_ERR_CTP_BODY_TOO_LARGE":
      return 413;
    case "FST_ERR_CTP_INVALID_MEDIA_TYPE":
    case "FST_ERR_ROUTE_MISSING_CONTENT_TYPE":
      return 415;
    case "FST_ERR_CTP_EMPTY_JSON_BODY":
    case "FST_ERR_CTP_INVALID_JSON_BODY":
    case "FST_ERR_CTP_INVALID_CONTENT_LENGTH":
      return 400;
    default:
      return statusCode !== undefined && statusCode < 500 ? 400 : 500;
  }
}

function transportCode(status: 400 | 413 | 415 | 500): string {
  switch (status) {
    case 400:
      return "INVALID_HTTP_REQUEST";
    case 413:
      return "HTTP_BODY_TOO_LARGE";
    case 415:
      return "UNSUPPORTED_MEDIA_TYPE";
    case 500:
      return "HTTP_INTERNAL_ERROR";
  }
}

function transportMessage(status: 400 | 413 | 415 | 500): string {
  switch (status) {
    case 400:
      return "The HTTP request is invalid.";
    case 413:
      return "The HTTP request body exceeds 16384 bytes.";
    case 415:
      return "The HTTP request must use application/json.";
    case 500:
      return "The HTTP request could not be processed.";
  }
}

export function buildHttpApp(options: BuildHttpAppOptions): FastifyInstance {
  const app = Fastify({ bodyLimit: HTTP_BODY_LIMIT_BYTES, logger: false });
  app.decorateRequest("agentRunSignal", null);

  app.removeContentTypeParser("text/plain");
  app.setErrorHandler((error, _request, reply) => {
    const status = transportStatus(error);
    return reply.status(status).send({
      ok: false,
      error: {
        code: transportCode(status),
        message: transportMessage(status),
      },
    });
  });
  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({
      ok: false,
      error: {
        code: "HTTP_NOT_FOUND",
        message: "The HTTP route was not found.",
      },
    }),
  );

  app.post(
    "/api/v1/agent-runs",
    {
      onRequest: bindCallerSignal,
    },
    async (request, reply) => {
      const result = await options.runAgent(
        request.body,
        request.getDecorator<AbortSignal>("agentRunSignal"),
      );
      return reply.status(resultStatus(result)).send(result);
    },
  );

  const resolveCitation = options.resolveCitation;
  if (resolveCitation) {
    app.post("/api/v1/citations/resolve", { onRequest: bindCallerSignal }, async (request, reply) => {
      const signal = request.getDecorator<AbortSignal>("agentRunSignal");
      try {
        const passage = await resolveCitation(request.body, signal);
        if (passage === null) return reply.status(404).send({ ok: false, error: { code: "CITATION_NOT_FOUND", message: "The indexed citation was not found." } });
        return reply.status(200).send({ ok: true, passage });
      } catch (error) {
        if (signal.aborted) return reply.status(499).send({ ok: false, error: { code: "CANCELLED", message: "Citation resolution was cancelled." } });
        const invalid = error instanceof RetrievalBoundaryError && error.code === "CITATION_INVALID";
        return reply.status(invalid ? 400 : 500).send({ ok: false, error: {
          code: invalid ? "INVALID_CITATION" : "CITATION_FAILURE", message: "The indexed citation could not be resolved.",
        } });
      }
    });
  }

  const conversationCommand = options.conversationCommand;
  if (conversationCommand) {
    app.post("/api/v1/conversation-commands", { onRequest: bindCallerSignal }, async (request, reply) => {
      const signal = request.getDecorator<AbortSignal>("agentRunSignal");
      try { return reply.status(200).send(await conversationCommand(request.body, signal)); }
      catch (error) {
        const code = error instanceof StateBoundaryError ? error.code : "STATE_REPOSITORY_FAILURE";
        return reply.status(signal.aborted ? 499 : stateStatus(code)).send({ ok: false, error: {
          code: signal.aborted ? "CANCELLED" : code, message: "The conversation state operation could not be completed.",
        } });
      }
    });
  }

  return app;
}
