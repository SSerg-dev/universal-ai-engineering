import Fastify, { type FastifyInstance } from "fastify";

import type { RunAgentUseCase } from "../../application/run-agent.js";
import type { RunAgentResult } from "../../domain/agent-contracts.js";

const HTTP_BODY_LIMIT_BYTES = 16 * 1024;

export interface BuildHttpAppOptions {
  readonly runAgent: RunAgentUseCase;
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
      onRequest: async (request, reply) => {
        const controller = new AbortController();
        request.setDecorator("agentRunSignal", controller.signal);

        // IncomingMessage closes after a complete body, even while the client
        // is still waiting for its answer. Only an incomplete body is a cancel.
        const onRequestClose = () => {
          if (!request.raw.complete) controller.abort();
        };
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
      },
    },
    async (request, reply) => {
      const result = await options.runAgent(
        request.body,
        request.getDecorator<AbortSignal>("agentRunSignal"),
      );
      return reply.status(resultStatus(result)).send(result);
    },
  );

  return app;
}
