import { describe, expect, it, vi } from "vitest";

import { FixedClock, ScriptedModel, SequenceIdGenerator } from "../../src/adapters/outbound/deterministic-test-adapters.js";
import { GroundedTeachingModel } from "../../src/adapters/outbound/grounded-teaching-model.js";
import { Sha256ContentIdentity } from "../../src/adapters/outbound/sha256-content-identity.js";
import { citationFor } from "../../src/application/grounded-answer.js";
import { prepareDocument } from "../../src/application/ingest-document.js";
import { createGroundedRunAgentUseCase } from "../../src/application/run-grounded-agent.js";
import { createResolveCitation } from "../../src/application/resolve-citation.js";
import { defineTool, ToolRegistry } from "../../src/application/tool-registry.js";
import type { ModelPort } from "../../src/application/ports/model-port.js";
import type { PassageRepositoryPort } from "../../src/application/ports/passage-repository-port.js";
import { GroundedRunAgentResultSchema, RetrievalInputSchema, RetrievalOutputSchema } from "../../src/domain/retrieval-contracts.js";
import type { ToolObservation } from "../../src/domain/tool-contracts.js";
import { RegisteredAgentEventEnvelopeSchema, type RegisteredAgentEventEnvelope } from "../../src/domain/tool-events.js";

const manifest = { indexId: "course", embedding: { id: "fixture", dimensions: 2 }, chunker: "utf16-v1" } as const;
const passage = prepareDocument(manifest, { documentId: "journal", title: "Journal", content: "# Journal\nSensitive controlled quotation.\n" }, new Sha256ContentIdentity()).passages[0]!;
const evidence = { indexId: "course", profileId: "fixture", passages: [{ ...passage, score: 0.8 }] };
const grounding = { version: "1.0", status: "answered", claims: [{ quote: passage.text, citation: citationFor(passage) }] };
const call = { type: "call_tool", toolName: "retrieve_passages", arguments: { query: "journal" } };

function harness(options: { model?: ModelPort<ToolObservation>; output?: unknown; fail?: boolean; journalFailure?: boolean } = {}) {
  const events: RegisteredAgentEventEnvelope[] = [];
  const model = options.model ?? new GroundedTeachingModel();
  const runAgent = createGroundedRunAgentUseCase({
    model, tools: new ToolRegistry([defineTool({
      name: "retrieve_passages", description: "Controlled evidence", inputSchema: RetrievalInputSchema,
      outputSchema: RetrievalOutputSchema, execute: async () => {
        if (options.fail) throw new Error("secret retrieval failure");
        return options.output ?? evidence;
      },
      sources: (output) => [...new Map(output.passages.map(({ documentId, title }) => [documentId, { documentId, title }])).values()],
    })]),
    journal: { append: async (event, signal) => {
      signal.throwIfAborted();
      if (options.journalFailure && event.eventType === "run.succeeded") throw new Error("private journal failure");
      events.push(RegisteredAgentEventEnvelopeSchema.parse(event));
    } },
    clock: new FixedClock("2026-11-09T00:00:00Z"), ids: new SequenceIdGenerator("grounded"),
    policy: { timeoutMs: 5000, terminalEvidenceTimeoutMs: 250, maxModelCalls: 2, maxToolCalls: 1 },
    toolPolicy: { allowedTools: new Set(["retrieve_passages"]), timeoutMs: 100 },
  });
  return { runAgent, events };
}

describe("Grounding through the existing loop", () => {
  it("returns exact quotations and full immutable citation identities after one tool call", async () => {
    const { runAgent, events } = harness();
    const result = GroundedRunAgentResultSchema.parse(await runAgent({ question: "private question" }));
    expect(result).toMatchObject({ ok: true, grounding, usage: { modelCalls: 2, toolCalls: 1 } });
    if (!result.ok) throw new Error("Expected success");
    expect(result.answer).toContain(passage.text.replaceAll("\n", "\n> "));
    expect(result.answer).toContain(passage.passageId);
    expect(result.sources).toEqual([{ documentId: "journal", title: "Journal" }]);
    expect(events).toHaveLength(8);
    expect(events.at(-1)?.eventType).toBe("run.succeeded");
    expect(JSON.stringify(events)).not.toContain("private question");
    expect(JSON.stringify(events)).not.toContain("Sensitive controlled quotation");
    expect(JSON.stringify(events)).not.toContain(passage.revision);
  });

  it.each([
    { name: "altered quote", value: { ...grounding, claims: [{ quote: "Unsupported answer", citation: citationFor(passage) }] } },
    { name: "forged revision", value: { ...grounding, claims: [{ quote: passage.text, citation: { ...citationFor(passage), revision: "f".repeat(64) } }] } },
    { name: "unobserved passage", value: { ...grounding, claims: [{ quote: passage.text, citation: { ...citationFor(passage), passageId: "f".repeat(64) } }] } },
    { name: "shifted span", value: { ...grounding, claims: [{ quote: passage.text, citation: { ...citationFor(passage), start: 1 } }] } },
    { name: "duplicate claim", value: { ...grounding, claims: [...grounding.claims, ...grounding.claims] } },
    { name: "missing citation", value: { ...grounding, claims: [{ quote: passage.text }] } },
    { name: "unsupported prose", value: { ...grounding, answer: "Another uncited assertion" } },
    { name: "false abstention", value: { version: "1.0", status: "abstained", reason: "no_evidence", claims: [] } },
  ])("rejects $name before terminal success", async ({ value }) => {
    const model = new ScriptedModel<ToolObservation>([call, { type: "grounded_answer", grounding: value }]);
    const { runAgent, events } = harness({ model });
    expect(await runAgent({ question: "journal" })).toMatchObject({ ok: false, error: { code: "INVALID_MODEL_ACTION" } });
    expect(events.some(({ eventType }) => eventType === "run.succeeded")).toBe(false);
    expect(events.at(-1)?.eventType).toBe("run.failed");
    expect(model.requests()).toHaveLength(2);
  });

  it("abstains only for a successful empty observation, still after one tool call", async () => {
    const { runAgent } = harness({ output: { ...evidence, passages: [] } });
    expect(await runAgent({ question: "unknown" })).toMatchObject({
      ok: true, sources: [], grounding: { status: "abstained", reason: "no_evidence", claims: [] },
      usage: { modelCalls: 2, toolCalls: 1 },
    });
    const failed = harness({ fail: true });
    expect(await failed.runAgent({ question: "unknown" })).toMatchObject({ ok: false, error: { code: "TOOL_FAILURE" } });
  });

  it("keeps the success journal append fail-closed", async () => {
    const { runAgent, events } = harness({ journalFailure: true });
    expect(await runAgent({ question: "journal" })).toMatchObject({ ok: false, error: { code: "JOURNAL_FAILURE" } });
    expect(events.some(({ eventType }) => eventType === "run.succeeded")).toBe(false);
  });

  it("keeps request-scoped grounding isolated when calls overlap", async () => {
    const teaching = new GroundedTeachingModel();
    const model: ModelPort<ToolObservation> = {
      request: async (input, signal) => {
        if (input.state === "awaiting_final" && input.question === "invalid") {
          await Promise.resolve();
          return { type: "grounded_answer", grounding: { ...grounding, claims: [] } };
        }
        return teaching.request(input, signal);
      },
    };
    const { runAgent } = harness({ model });
    const [valid, invalid] = await Promise.all([runAgent({ question: "valid" }), runAgent({ question: "invalid" })]);
    expect(valid).toMatchObject({ ok: true, grounding });
    expect(invalid).toMatchObject({ ok: false, error: { code: "INVALID_MODEL_ACTION" } });
  });

  it("restricts resolution to the configured index and validates the returned full identity", async () => {
    const resolve = vi.fn<PassageRepositoryPort["resolve"]>(async () => passage);
    const repo: PassageRepositoryPort = { replaceDocument: async () => {}, search: async () => null, resolve };
    const resolveCitation = createResolveCitation("course", repo);
    await expect(resolveCitation({ ...citationFor(passage), indexId: "another" })).rejects.toMatchObject({ code: "CITATION_INVALID" });
    expect(resolve).not.toHaveBeenCalled();
    expect(await resolveCitation(citationFor(passage))).toEqual(passage);
    resolve.mockResolvedValueOnce({ ...passage, revision: "f".repeat(64) });
    await expect(resolveCitation(citationFor(passage))).rejects.toMatchObject({ code: "CITATION_INVALID" });
  });
});
