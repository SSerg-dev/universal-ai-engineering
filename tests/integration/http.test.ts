import { describe, expect, it, vi } from "vitest";

import type { RunAgentUseCase } from "../../src/application/run-agent.js";
import type { RunAgentResult } from "../../src/domain/agent-contracts.js";
import type {
  AgentErrorCode,
  AgentErrorStage,
} from "../../src/domain/agent-errors.js";

async function loadHttpAdapter() {
  const module = await import("../../src/adapters/inbound/http.js").catch(
    () => undefined,
  );

  expect(
    module?.buildHttpApp,
    "buildHttpApp should expose the bounded Fastify adapter",
  ).toBeTypeOf("function");

  return module!;
}

function successResult(runId = "http-run-1"): RunAgentResult {
  return {
    ok: true,
    runId,
    answer: "Runs are recorded as ordered execution evidence.",
    sources: [
      { documentId: "execution-journal", title: "Execution Journal" },
    ],
    usage: { modelCalls: 2, toolCalls: 1 },
  };
}

function failureResult(
  code: AgentErrorCode,
  stage: AgentErrorStage,
  runId = `http-${code.toLowerCase()}`,
): RunAgentResult {
  return {
    ok: false,
    runId,
    error: {
      code,
      message: `Public ${code} message.`,
      stage,
      retryable: false,
    },
  };
}

describe("Fastify agent-runs adapter", () => {
  it("exports a bounded app builder and keeps server startup separate", async () => {
    const httpModule = await loadHttpAdapter();
    const serverModule = await import("../../src/composition/server.js").catch(
      () => undefined,
    );

    expect(httpModule.buildHttpApp).toBeTypeOf("function");
    expect(serverModule?.startServer).toBeTypeOf("function");
  });

  it("registers only POST /api/v1/agent-runs and returns the shared result unchanged", async () => {
    const { buildHttpApp } = await loadHttpAdapter();
    const result = successResult();
    let observedSignal: AbortSignal | undefined;
    const runAgent: RunAgentUseCase = vi.fn(async (_input, signal) => {
      observedSignal = signal;
      return result;
    });
    const app = buildHttpApp({ runAgent });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/agent-runs",
        payload: { question: "How are runs recorded?" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(result);
      expect(runAgent).toHaveBeenCalledWith(
        { question: "How are runs recorded?" },
        expect.any(AbortSignal),
      );
      expect(observedSignal).toBeInstanceOf(AbortSignal);
      expect(observedSignal?.aborted).toBe(false);
      expect(app.hasRoute({ method: "POST", url: "/api/v1/agent-runs" })).toBe(
        true,
      );
      expect(app.hasRoute({ method: "GET", url: "/api/v1/agent-runs" })).toBe(
        false,
      );
      expect(
        (await app.inject({ method: "POST", url: "/api/v1/other" }))
          .statusCode,
      ).toBe(404);
    } finally {
      await app.close();
    }
  });

  it("passes semantic invalid input to the use case so its runId and failure survive", async () => {
    const { buildHttpApp } = await loadHttpAdapter();
    const result = failureResult("INVALID_REQUEST", "request", "semantic-run-1");
    const runAgent: RunAgentUseCase = vi.fn(async () => result);
    const app = buildHttpApp({ runAgent });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/agent-runs",
        payload: { question: "   " },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual(result);
      expect(runAgent).toHaveBeenCalledOnce();
    } finally {
      await app.close();
    }
  });

  it.each([
    ["INVALID_REQUEST", "request", 400],
    ["TIMEOUT", "orchestration", 408],
    ["CANCELLED", "orchestration", 499],
    ["INVALID_MODEL_ACTION", "model", 422],
    ["INVALID_TRANSITION", "orchestration", 422],
    ["LIMIT_EXCEEDED", "model", 422],
    ["MODEL_FAILURE", "model", 502],
    ["TOOL_FAILURE", "tool", 502],
    ["JOURNAL_FAILURE", "journal", 500],
    ["INTERNAL_ERROR", "orchestration", 500],
  ] as const)("maps %s at %s to HTTP %i without reshaping the failure", async (code, stage, status) => {
    const { buildHttpApp } = await loadHttpAdapter();
    const result = failureResult(code, stage);
    const app = buildHttpApp({ runAgent: async () => result });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/agent-runs",
        payload: { question: "status mapping" },
      });

      expect(response.statusCode).toBe(status);
      expect(response.json()).toEqual(result);
    } finally {
      await app.close();
    }
  });

  it("transport-rejects malformed JSON, unsupported content type, and bodies over 16 KiB", async () => {
    const { buildHttpApp } = await loadHttpAdapter();
    const runAgent: RunAgentUseCase = vi.fn(async () => successResult());
    const app = buildHttpApp({ runAgent });

    try {
      const malformed = await app.inject({
        method: "POST",
        url: "/api/v1/agent-runs",
        headers: { "content-type": "application/json" },
        payload: '{"question":',
      });
      const unsupported = await app.inject({
        method: "POST",
        url: "/api/v1/agent-runs",
        headers: { "content-type": "text/plain" },
        payload: "question",
      });
      const oversized = await app.inject({
        method: "POST",
        url: "/api/v1/agent-runs",
        payload: { question: "x".repeat(16 * 1024) },
      });

      expect(malformed.statusCode).toBe(400);
      expect(unsupported.statusCode).toBe(415);
      expect(oversized.statusCode).toBe(413);
      for (const response of [malformed, unsupported, oversized]) {
        expect(response.headers["content-type"]).toContain("application/json");
        expect(response.body).not.toMatch(/stack|cause|node_modules|[A-Z]:\\/i);
      }
      expect(runAgent).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("sanitizes an unexpected adapter exception instead of leaking its details", async () => {
    const { buildHttpApp } = await loadHttpAdapter();
    const app = buildHttpApp({
      runAgent: async () => {
        throw new Error("secret C:\\internal\\agent.ts node_modules stack cause");
      },
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/agent-runs",
        payload: { question: "Do not leak" },
      });

      expect(response.statusCode).toBe(500);
      expect(response.headers["content-type"]).toContain("application/json");
      expect(response.body).not.toContain("secret");
      expect(response.body).not.toMatch(/stack|cause|node_modules|[A-Z]:\\/i);
    } finally {
      await app.close();
    }
  });
});
