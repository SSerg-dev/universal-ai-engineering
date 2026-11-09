import { describe, expect, it, vi } from "vitest";

import { FixedClock } from "../../src/adapters/outbound/deterministic-test-adapters.js";
import { GroundedTeachingModel } from "../../src/adapters/outbound/grounded-teaching-model.js";
import { Sha256ContentIdentity } from "../../src/adapters/outbound/sha256-content-identity.js";
import { prepareDocument } from "../../src/application/ingest-document.js";
import { createRunEvaluation } from "../../src/application/run-evaluation.js";
import { createGroundedRunAgentUseCase } from "../../src/application/run-grounded-agent.js";
import { defineTool, ToolRegistry } from "../../src/application/tool-registry.js";
import type { EvaluationExecutionPort } from "../../src/application/ports/evaluation-execution-port.js";
import { EvaluationDatasetBodySchema, EvaluationReportSchema, type EvaluationReport } from "../../src/domain/evaluation-contracts.js";
import { RetrievalInputSchema, RetrievalOutputSchema } from "../../src/domain/retrieval-contracts.js";
import { RegisteredAgentEventEnvelopeSchema, type RegisteredAgentEventEnvelope } from "../../src/domain/tool-events.js";

const identity = new Sha256ContentIdentity();
const manifest = { indexId: "course", embedding: { id: "fixture", dimensions: 2 }, chunker: "utf16-v1" } as const;
const passage = prepareDocument(manifest, { documentId: "journal", title: "Journal", content: "# Journal\nPrivate fixture quotation.\n" }, identity).passages[0]!;
const body = EvaluationDatasetBodySchema.parse({ schemaVersion: "eval-dataset-1.0", datasetId: "course", version: "1.0.0", cases: [
  { caseId: "supported", question: "private evaluation question", scenario: "normal", expected: { kind: "answered", requiredDocumentIds: ["journal"], forbiddenDocumentIds: [] }, execution: { toolName: "retrieve_passages", modelCalls: 2, toolCalls: 1 } },
  { caseId: "empty", question: "!!!", scenario: "normal", expected: { kind: "abstained" }, execution: { toolName: "retrieve_passages", modelCalls: 2, toolCalls: 1 } },
  { caseId: "denied", question: "journal", scenario: "deny_tool", expected: { kind: "failed", errorCode: "TOOL_FAILURE" }, execution: { toolName: "retrieve_passages", modelCalls: 1, toolCalls: 1 } },
] });
const dataset = { ...body, revision: identity.digest(JSON.stringify(body)) };
const signal = () => new AbortController().signal;

function harness(options: { regression?: boolean; hideObservation?: boolean; unresolved?: boolean; reorder?: boolean; omitFailureStart?: boolean; reportFailure?: boolean } = {}) {
  let sequence = 0, eventSequence = 0;
  const reports: EvaluationReport[] = [];
  const execute = vi.fn<EvaluationExecutionPort["execute"]>(async (testCase, runId, activeSignal) => {
    const events: RegisteredAgentEventEnvelope[] = [], observedPassageIds: string[] = [];
    const tool = defineTool({ name: "retrieve_passages", description: "Controlled evaluation fixture",
      inputSchema: RetrievalInputSchema, outputSchema: RetrievalOutputSchema,
      execute: async ({ query }) => {
        const passages = query === "!!!" ? [] : [{ ...passage, score: 0.8 }];
        observedPassageIds.push(...passages.map(({ passageId }) => passageId));
        return { indexId: "course", profileId: "fixture", passages };
      }, sources: (output) => output.passages.map(({ documentId, title }) => ({ documentId, title })),
    });
    const run = createGroundedRunAgentUseCase({
      model: new GroundedTeachingModel(), tools: new ToolRegistry([tool]),
      journal: { append: async (event, journalSignal) => { journalSignal.throwIfAborted(); events.push(RegisteredAgentEventEnvelopeSchema.parse(event)); } },
      clock: new FixedClock("2026-11-09T00:00:00Z"), ids: { next: (kind) => kind === "run" ? runId : `${kind}-${++eventSequence}` },
      policy: { timeoutMs: 5000, terminalEvidenceTimeoutMs: 250, maxModelCalls: 2, maxToolCalls: 1 },
      toolPolicy: { allowedTools: new Set(testCase.scenario === "deny_tool" ? [] : ["retrieve_passages"]), timeoutMs: 100 },
    });
    const result = await run({ question: testCase.question }, activeSignal);
    if (options.regression && result.ok && result.grounding.status === "answered") {
      result.answer += "\nUnsupported added assertion.";
      const terminal = events.at(-1)!;
      if (terminal.eventType === "run.succeeded") terminal.payload.answerLength = result.answer.length;
    }
    if (options.reorder && result.ok) {
      [events[2], events[5]] = [events[5]!, events[2]!];
      events.forEach((event, index) => { event.sequence = index + 1; });
    }
    if (options.omitFailureStart && !result.ok) {
      events.shift(); events.forEach((event, index) => { event.sequence = index + 1; });
    }
    return { result, events, observedPassageIds: options.hideObservation ? [] : observedPassageIds };
  });
  const save = vi.fn(async (report: EvaluationReport) => {
    if (options.reportFailure) throw new Error("private report path");
    reports.push(structuredClone(report));
  });
  const run = createRunEvaluation({ executor: { execute }, reports: { save },
    resolveCitation: async () => options.unresolved ? null : passage,
    clock: new FixedClock("2026-11-09T00:00:00Z", 10), ids: { next: (kind) => `${kind}-${++sequence}` }, identity });
  return { run, execute, save, reports };
}

describe("Independent deterministic evaluation", () => {
  it("passes the mixed baseline with explicit applicable denominators and safe persisted metadata", async () => {
    const { run, save, reports } = harness();
    const report = EvaluationReportSchema.parse(await run(dataset, signal()));
    expect(report.gate).toEqual({ passed: true, failedDimensions: [] });
    expect(report.metrics.grounding).toEqual({ passed: 1, applicable: 1, rate: 1, meetsThreshold: true });
    expect(report.metrics.retrieval.applicable).toBe(2);
    expect(report.metrics.schema.applicable).toBe(3);
    expect(report.cases[2]?.checks.outcome.status).toBe("passed");
    expect(save).toHaveBeenCalledTimes(1); expect(reports).toEqual([report]);
    expect(JSON.stringify(report)).not.toContain("private evaluation question");
    expect(JSON.stringify(report)).not.toContain("Private fixture quotation");
  });

  it("detects a known unsupported-answer regression while schema and journal remain valid", async () => {
    const report = await harness({ regression: true }).run(dataset, signal());
    expect(report.gate).toEqual({ passed: false, failedDimensions: ["grounding"] });
    expect(report.cases[0]?.checks.schema.status).toBe("passed");
    expect(report.cases[0]?.checks.evidence.status).toBe("passed");
    expect(report.cases[0]?.checks.grounding).toEqual({ status: "failed", code: "UNSUPPORTED_ANSWER" });
  });

  it("verifies the dataset revision before any execution or report effect", async () => {
    const { run, execute, save } = harness();
    await expect(run({ ...dataset, revision: "f".repeat(64) }, signal())).rejects.toMatchObject({ code: "DATASET_REVISION_MISMATCH" });
    expect(execute).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
  });

  it("rejects valid stored citations that were not observed in that run", async () => {
    const report = await harness({ hideObservation: true }).run(dataset, signal());
    expect(report.gate.passed).toBe(false);
    expect(report.cases[0]?.checks.grounding).toEqual({ status: "failed", code: "UNOBSERVED_CITATION" });
  });

  it("fails closed on unresolved citations and reordered successful evidence", async () => {
    const missing = await harness({ unresolved: true }).run(dataset, signal());
    expect(missing.cases[0]?.checks.grounding).toEqual({ status: "failed", code: "CITATION_UNRESOLVED" });
    const reordered = await harness({ reorder: true }).run(dataset, signal());
    expect(reordered.cases[0]?.checks.evidence).toEqual({ status: "failed", code: "INVALID_EVIDENCE" });
  });

  it("does not confuse a harness exception with an expected operational failure", async () => {
    const { run, execute } = harness();
    execute.mockRejectedValue(new Error("private executor exception"));
    const report = await run(dataset, signal());
    expect(report.gate.passed).toBe(false);
    expect(report.cases[2]?.checks.outcome).toEqual({ status: "failed", code: "EXECUTION_FAILURE" });
    expect(JSON.stringify(report)).not.toContain("private executor exception");
  });

  it("does not report publication success when the report store fails", async () => {
    await expect(harness({ reportFailure: true }).run(dataset, signal())).rejects.toMatchObject({ code: "REPORT_FAILURE" });
  });

  it("cancels before later cases and does not publish a partial success", async () => {
    const caller = new AbortController();
    const { run, execute, save } = harness();
    const original = execute.getMockImplementation()!;
    const reason = new Error("caller cancelled");
    execute.mockImplementationOnce(async (...args) => { const result = await original(...args); caller.abort(reason); return result; });
    await expect(run(dataset, caller.signal)).rejects.toBe(reason);
    expect(execute).toHaveBeenCalledTimes(1); expect(save).not.toHaveBeenCalled();
  });

  it("protects expected outcomes from executor mutation", async () => {
    const { run, execute } = harness();
    const original = execute.getMockImplementation()!;
    execute.mockImplementation(async (testCase, ...rest) => {
      testCase.expected = { kind: "abstained" };
      return original(testCase, ...rest);
    });
    expect((await run(dataset, signal())).gate.passed).toBe(true);
  });

  it("rejects a failed trace missing its run.started even when counts and IDs are valid", async () => {
    const report = await harness({ omitFailureStart: true }).run(dataset, signal());
    expect(report.cases[2]?.checks.evidence).toEqual({ status: "failed", code: "INVALID_EVIDENCE" });
  });
});
