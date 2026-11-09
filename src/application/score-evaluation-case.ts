import { z } from "zod";

import {
  EvaluationCaseResultSchema, type EvaluationCase, type EvaluationCheck, type EvaluationFailureCode,
} from "../domain/evaluation-contracts.js";
import { CitationSchema, ContentDigestSchema, GroundedRunAgentResultSchema, PassageSchema } from "../domain/retrieval-contracts.js";
import { ExecutionEventEnvelopeSchema, type ExecutionEventEnvelope } from "../domain/tool-events.js";
import { citationFor, renderGroundedAnswer } from "./grounded-answer.js";
import type { ResolveCitationUseCase } from "./resolve-citation.js";

const pass = (): EvaluationCheck => ({ status: "passed" });
const fail = (code: EvaluationFailureCode): EvaluationCheck => ({ status: "failed", code });
const na = (reason: "NOT_ANSWERED" | "NO_RETRIEVAL_EXPECTATION"): EvaluationCheck => ({ status: "not_applicable", reason });

function evidenceIsOrdered(events: readonly ExecutionEventEnvelope[], runId: string) {
  if (events.length === 0 || new Set(events.map(({ eventId }) => eventId)).size !== events.length) return false;
  const first = events[0]!;
  if (first.eventType !== "run.started" && !(events.length === 1 && first.eventType === "run.failed" &&
    first.payload.errorCode === "INVALID_REQUEST")) return false;
  const terminal = events.filter(({ eventType }) => ["run.succeeded", "run.failed", "run.cancelled"].includes(eventType));
  if (terminal.length !== 1 || terminal[0] !== events.at(-1)) return false;
  const requested = new Set<string>();
  const model = new Map<string, number>(), tool = new Map<string, { step: number; name: string }>();
  let modelStep = 0, toolStep = 0;
  for (const [index, event] of events.entries()) {
    if (event.runId !== runId || event.sequence !== index + 1) return false;
    if (event.eventType === "run.started" && index !== 0) return false;
    if (event.eventType === "model.requested" || event.eventType === "tool.requested") {
      if (requested.has(event.payload.callId)) return false;
      requested.add(event.payload.callId);
    }
    switch (event.eventType) {
      case "model.requested":
        if (event.payload.step !== ++modelStep) return false;
        model.set(event.payload.callId, event.payload.step); break;
      case "model.responded":
        if (model.get(event.payload.callId) !== event.payload.step) return false;
        model.delete(event.payload.callId); break;
      case "tool.requested":
        if (event.payload.step !== ++toolStep) return false;
        tool.set(event.payload.callId, { step: event.payload.step, name: event.payload.toolName }); break;
      case "tool.succeeded": case "tool.failed": {
        const pending = tool.get(event.payload.callId);
        if (pending?.step !== event.payload.step || pending.name !== event.payload.toolName) return false;
        tool.delete(event.payload.callId); break;
      }
    }
  }
  if (events.at(-1)?.eventType === "run.succeeded") {
    const grammar = ["run.started", "model.requested", "model.responded", "tool.requested", "tool.succeeded",
      "model.requested", "model.responded", "run.succeeded"];
    if (model.size !== 0 || tool.size !== 0 || events.length !== grammar.length ||
      events.some(({ eventType }, index) => eventType !== grammar[index])) return false;
    const responses = events.filter((event) => event.eventType === "model.responded");
    if (responses[0]?.payload.actionKind !== "call_tool" || responses[1]?.payload.actionKind !== "final_answer") return false;
  }
  return true;
}

export async function scoreEvaluationCase(input: {
  testCase: EvaluationCase; runId: string; result: unknown; events: unknown; observedPassageIds: unknown;
  resolveCitation: ResolveCitationUseCase; signal: AbortSignal;
}) {
  input.signal.throwIfAborted();
  const parsed = GroundedRunAgentResultSchema.safeParse(input.result);
  const result = parsed.success && parsed.data.runId === input.runId ? parsed.data : undefined;
  const parsedEvents = z.array(ExecutionEventEnvelopeSchema).min(1).max(32).safeParse(input.events);
  const events = parsedEvents.success ? parsedEvents.data : [];
  const observed = z.array(ContentDigestSchema).max(5).refine((ids) => new Set(ids).size === ids.length).safeParse(input.observedPassageIds);
  const expected = input.testCase.expected;
  const schema = result === undefined ? fail("INVALID_RESULT") : pass();
  const outcome = result === undefined ? fail("INVALID_RESULT") :
    (expected.kind === "failed" ? !result.ok && result.error.code === expected.errorCode :
      result.ok && result.grounding.status === expected.kind) ? pass() : fail("OUTCOME_MISMATCH");

  const successes = events.filter((event) => event.eventType === "tool.succeeded");
  const retrievedIds = new Set(successes.flatMap(({ payload }) => payload.sourceIds));
  const retrieval = expected.kind === "failed" ? na("NO_RETRIEVAL_EXPECTATION") : !observed.success ? fail("RETRIEVAL_MISMATCH") :
    successes.length !== 1 ? fail("RETRIEVAL_MISMATCH") : expected.kind === "abstained" ?
      (retrievedIds.size === 0 && observed.data.length === 0 ? pass() : fail("RETRIEVAL_MISMATCH")) :
      expected.requiredDocumentIds.every((id) => retrievedIds.has(id)) && expected.forbiddenDocumentIds.every((id) => !retrievedIds.has(id)) ? pass() : fail("RETRIEVAL_MISMATCH");

  const last = events.at(-1);
  let evidence = parsedEvents.success && evidenceIsOrdered(events, input.runId) ? pass() : fail("INVALID_EVIDENCE");
  if (!result || !last) evidence = fail("INVALID_EVIDENCE");
  else if (result.ok) {
    if (last.eventType !== "run.succeeded" || last.payload.answerLength !== result.answer.length ||
      JSON.stringify(last.payload.sourceIds) !== JSON.stringify(result.sources.map(({ documentId }) => documentId))) evidence = fail("INVALID_EVIDENCE");
  } else if (last.eventType !== (result.error.code === "CANCELLED" ? "run.cancelled" : "run.failed") ||
    !("errorCode" in last.payload) || last.payload.errorCode !== result.error.code ||
    !("stage" in last.payload) || last.payload.stage !== result.error.stage) evidence = fail("INVALID_EVIDENCE");

  const modelRequests = events.filter(({ eventType }) => eventType === "model.requested");
  const toolRequests = events.filter((event) => event.eventType === "tool.requested");
  const usage = input.testCase.execution;
  const terminalCounts = last && "modelCalls" in last.payload && "toolCalls" in last.payload &&
    last.payload.modelCalls === usage.modelCalls && last.payload.toolCalls === usage.toolCalls;
  const tools = modelRequests.length === usage.modelCalls && toolRequests.length === usage.toolCalls &&
    toolRequests.every(({ payload }) => payload.toolName === usage.toolName) && terminalCounts && result !== undefined &&
    (!result.ok || (result.usage.modelCalls === usage.modelCalls && result.usage.toolCalls === usage.toolCalls)) ? pass() : fail("TOOL_USAGE_MISMATCH");

  let grounding: EvaluationCheck = na("NOT_ANSWERED");
  if (result?.ok && result.grounding.status === "answered") {
    grounding = pass();
    const seen = new Set<string>();
    const sourceTitles = new Map<string, string>();
    if (result.answer !== renderGroundedAnswer(result.grounding)) grounding = fail("UNSUPPORTED_ANSWER");
    for (const claim of result.grounding.claims) {
      input.signal.throwIfAborted();
      if (grounding.status === "failed") break;
      if (!observed.success || !observed.data.includes(claim.citation.passageId)) { grounding = fail("UNOBSERVED_CITATION"); break; }
      if (seen.has(claim.citation.passageId)) { grounding = fail("DUPLICATE_CITATION"); break; }
      seen.add(claim.citation.passageId);
      let rawPassage: unknown;
      try { rawPassage = await input.resolveCitation(CitationSchema.parse(claim.citation), input.signal); }
      catch { if (input.signal.aborted) throw input.signal.reason; grounding = fail("CITATION_UNRESOLVED"); break; }
      input.signal.throwIfAborted();
      if (rawPassage === null) { grounding = fail("CITATION_UNRESOLVED"); break; }
      const passage = PassageSchema.safeParse(rawPassage);
      if (!passage.success || JSON.stringify(citationFor(passage.data)) !== JSON.stringify(claim.citation)) { grounding = fail("CITATION_INVALID"); break; }
      if (passage.data.text !== claim.quote) { grounding = fail("QUOTE_MISMATCH"); break; }
      const priorTitle = sourceTitles.get(passage.data.documentId);
      if (priorTitle !== undefined && priorTitle !== passage.data.title) { grounding = fail("SOURCE_MISMATCH"); break; }
      sourceTitles.set(passage.data.documentId, passage.data.title);
    }
    if (grounding.status === "passed" && (result.sources.length !== sourceTitles.size ||
      result.sources.some(({ documentId, title }) => sourceTitles.get(documentId) !== title) ||
      new Set(result.sources.map(({ documentId }) => documentId)).size !== result.sources.length)) grounding = fail("SOURCE_MISMATCH");
  }
  const checks = { schema, outcome, retrieval, grounding, tools, evidence };
  return EvaluationCaseResultSchema.parse({ caseId: input.testCase.caseId, runId: input.runId, checks,
    passed: Object.values(checks).every(({ status }) => status !== "failed") });
}
