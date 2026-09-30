import { describe, expect, it } from "vitest";

import {
  ModelActionSchema,
  RunAgentInputSchema,
  RunAgentResultSchema,
  SearchDocsInputSchema,
  SearchDocsOutputSchema,
} from "../../src/domain/agent-contracts.js";
import {
  AgentErrorCodeSchema,
  AgentErrorSchema,
  AgentErrorStageSchema,
} from "../../src/domain/agent-errors.js";

const errorCodes = [
  "INVALID_REQUEST",
  "MODEL_FAILURE",
  "INVALID_MODEL_ACTION",
  "INVALID_TRANSITION",
  "TOOL_FAILURE",
  "TIMEOUT",
  "CANCELLED",
  "LIMIT_EXCEEDED",
  "JOURNAL_FAILURE",
  "INTERNAL_ERROR",
] as const;

const errorStages = ["request", "model", "tool", "journal", "orchestration"] as const;

describe("strict public and tool schemas", () => {
  it("trims questions and rejects blank or unknown request fields", () => {
    expect(RunAgentInputSchema.parse({ question: "  What is an agent loop?  " })).toEqual({
      question: "What is an agent loop?",
    });
    expect(RunAgentInputSchema.safeParse({ question: "   " }).success).toBe(false);
    expect(
      RunAgentInputSchema.safeParse({ question: "valid", provider: "vendor" }).success,
    ).toBe(false);
  });

  it("trims search_docs query, defaults limit to 3, and enforces integer bounds 1..5", () => {
    expect(SearchDocsInputSchema.parse({ query: "  execution journal  " })).toEqual({
      query: "execution journal",
      limit: 3,
    });
    expect(SearchDocsInputSchema.parse({ query: "ports", limit: 1 }).limit).toBe(1);
    expect(SearchDocsInputSchema.parse({ query: "ports", limit: 5 }).limit).toBe(5);

    for (const limit of [0, 6, 1.5]) {
      expect(SearchDocsInputSchema.safeParse({ query: "ports", limit }).success).toBe(
        false,
      );
    }

    expect(SearchDocsInputSchema.safeParse({ query: " " }).success).toBe(false);
    expect(
      SearchDocsInputSchema.safeParse({ query: "ports", limit: 3, raw: true }).success,
    ).toBe(false);
  });

  it("accepts empty search results and strict source-reference metadata", () => {
    expect(SearchDocsOutputSchema.parse({ matches: [] })).toEqual({ matches: [] });
    expect(
      SearchDocsOutputSchema.parse({
        matches: [
          {
            documentId: "ports-and-adapters",
            title: "Ports and Adapters",
            excerpt: "The application core depends on narrow ports.",
            matchedTerms: ["ports", "adapters"],
          },
        ],
      }),
    ).toMatchObject({ matches: [{ documentId: "ports-and-adapters" }] });
    expect(
      SearchDocsOutputSchema.safeParse({ matches: [], providerPayload: {} }).success,
    ).toBe(false);
  });

  it("rejects semantically empty search matches and malformed match values", () => {
    const validMatch = {
      documentId: "ports-and-adapters",
      title: "Ports and Adapters",
      excerpt: "The application core depends on narrow ports.",
      matchedTerms: ["ports"],
    };

    expect(
      SearchDocsOutputSchema.safeParse({
        matches: [{ ...validMatch, matchedTerms: [] }],
      }).success,
    ).toBe(false);

    for (const malformedMatch of [
      { ...validMatch, documentId: " " },
      { ...validMatch, title: " " },
      { ...validMatch, matchedTerms: [" "] },
      { ...validMatch, score: 1 },
    ]) {
      expect(
        SearchDocsOutputSchema.safeParse({ matches: [malformedMatch] }).success,
      ).toBe(false);
    }
  });
});

describe("provider-neutral model action schema", () => {
  it("accepts only the literal search_docs call_tool action", () => {
    expect(
      ModelActionSchema.parse({
        type: "call_tool",
        toolName: "search_docs",
        arguments: { query: "journal", limit: 2 },
      }),
    ).toEqual({
      type: "call_tool",
      toolName: "search_docs",
      arguments: { query: "journal", limit: 2 },
    });

    expect(
      ModelActionSchema.safeParse({
        type: "call_tool",
        toolName: "another_tool",
        arguments: { query: "journal" },
      }).success,
    ).toBe(false);

    expect(
      ModelActionSchema.safeParse({
        type: "call_tool",
        toolName: "search_docs",
        arguments: { query: "journal", root: "../outside" },
      }).success,
    ).toBe(false);

    expect(
      ModelActionSchema.safeParse({
        type: "call_tool",
        toolName: "search_docs",
        arguments: { query: "journal" },
        requestId: "provider-request-1",
      }).success,
    ).toBe(false);
  });

  it("accepts a strict final_answer and rejects provider-shaped extras", () => {
    expect(
      ModelActionSchema.parse({
        type: "final_answer",
        answer: "The journal records ordered evidence.",
        sourceIds: ["execution-journal"],
      }),
    ).toMatchObject({ type: "final_answer", sourceIds: ["execution-journal"] });

    expect(
      ModelActionSchema.safeParse({
        type: "final_answer",
        answer: "answer",
        sourceIds: [],
        providerResponse: { choices: [] },
      }).success,
    ).toBe(false);

    expect(
      ModelActionSchema.safeParse({
        type: "final_answer",
        answer: "answer",
        sourceIds: [" "],
      }).success,
    ).toBe(false);

    expect(
      ModelActionSchema.safeParse({
        type: "call_tool",
        answer: "answer",
        sourceIds: [],
      }).success,
    ).toBe(false);
  });
});

describe("stable public errors and results", () => {
  it("enumerates every D-10 code and every stable error stage", () => {
    expect(AgentErrorCodeSchema.options).toEqual(errorCodes);
    expect(AgentErrorStageSchema.options).toEqual(errorStages);

    for (const code of errorCodes) {
      for (const stage of errorStages) {
        expect(
          AgentErrorSchema.parse({
            code,
            message: "Normalized public failure",
            stage,
            retryable: false,
          }),
        ).toMatchObject({ code, stage });
      }
    }

    expect(
      AgentErrorSchema.safeParse({
        code: "PROVIDER_ERROR",
        message: "Normalized public failure",
        stage: "model",
        retryable: false,
      }).success,
    ).toBe(false);
    expect(
      AgentErrorSchema.safeParse({
        code: "MODEL_FAILURE",
        message: "Normalized public failure",
        stage: "provider",
        retryable: false,
      }).success,
    ).toBe(false);
  });

  it("rejects blank or extended public error values", () => {
    const validError = {
      code: "MODEL_FAILURE",
      message: "The model failed",
      stage: "model",
      retryable: true,
    } as const;

    expect(AgentErrorSchema.safeParse({ ...validError, message: "   " }).success).toBe(
      false,
    );
    expect(AgentErrorSchema.safeParse({ ...validError, cause: "vendor stack" }).success).toBe(
      false,
    );
  });

  it("keeps success and failure results strict and provider-neutral", () => {
    expect(
      RunAgentResultSchema.parse({
        ok: true,
        runId: "run-1",
        answer: "Ports keep the core replaceable.",
        sources: [{ documentId: "ports-and-adapters", title: "Ports and Adapters" }],
        usage: { modelCalls: 2, toolCalls: 1 },
      }),
    ).toMatchObject({ ok: true, usage: { modelCalls: 2, toolCalls: 1 } });

    expect(
      RunAgentResultSchema.parse({
        ok: false,
        runId: "run-2",
        error: {
          code: "JOURNAL_FAILURE",
          message: "Evidence could not be persisted",
          stage: "journal",
          retryable: false,
        },
      }),
    ).toMatchObject({ ok: false, error: { code: "JOURNAL_FAILURE" } });

    expect(
      RunAgentResultSchema.safeParse({
        ok: true,
        runId: "run-3",
        answer: "answer",
        sources: [],
        usage: { modelCalls: 2, toolCalls: 1, providerTokens: 100 },
      }).success,
    ).toBe(false);

    for (const malformedSuccess of [
      {
        ok: true,
        runId: "run-3",
        answer: "answer",
        sources: [{ documentId: " ", title: "Ports" }],
        usage: { modelCalls: 2, toolCalls: 1 },
      },
      {
        ok: true,
        runId: "run-3",
        answer: "answer",
        sources: [{ documentId: "ports", title: " " }],
        usage: { modelCalls: 2, toolCalls: 1 },
      },
      {
        ok: true,
        runId: "run-3",
        answer: "answer",
        sources: [{ documentId: "ports", title: "Ports", excerpt: "hidden" }],
        usage: { modelCalls: 2, toolCalls: 1 },
      },
      {
        ok: true,
        runId: "run-3",
        answer: "answer",
        sources: [],
        usage: { modelCalls: -1, toolCalls: 1 },
      },
      {
        ok: true,
        runId: "run-3",
        answer: "answer",
        sources: [],
        usage: { modelCalls: 2, toolCalls: 0.5 },
      },
      {
        ok: true,
        runId: "run-3",
        answer: "answer",
        sources: [],
        usage: { modelCalls: 2, toolCalls: 1 },
        providerResponseId: "response-1",
      },
    ]) {
      expect(RunAgentResultSchema.safeParse(malformedSuccess).success).toBe(false);
    }

    expect(
      RunAgentResultSchema.safeParse({
        ok: false,
        runId: "run-4",
        error: {
          code: "MODEL_FAILURE",
          message: "The model failed",
          stage: "model",
          retryable: true,
          cause: "provider stack",
        },
      }).success,
    ).toBe(false);
  });
});
