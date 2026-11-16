import { z } from "zod";
import { RunAgentResultSchema } from "../domain/agent-contracts.js";
import { GroundedRunAgentResultSchema } from "../domain/retrieval-contracts.js";
import { RegisteredAgentEventEnvelopeSchema } from "../domain/tool-events.js";
import { RouteAttemptSchema, RouteAuditEventSchema, RouteBoundaryError, RouteManifestBodySchema, RouteManifestSchema,
  RouteRequestSchema, RouteResultSchema, type RouteAttempt, type RouteAuditEvent, type RouteBoundaryCode, type RouteManifest, type RouteProfile } from "../domain/routing-contracts.js";
import type { GuardPolicy } from "../domain/guard-contracts.js";
import { loadGuardPolicy } from "./guard-policy.js";
import { renderGroundedAnswer } from "./grounded-answer.js";
import type { ClockPort } from "./ports/clock-port.js";
import type { ContentIdentityPort } from "./ports/content-identity-port.js";
import type { RouteExecutionPort, RouteIdPort, RouteJournalPort } from "./ports/routing-port.js";

export function loadRouteManifest(raw: unknown, rawPolicy: GuardPolicy, identity: ContentIdentityPort): RouteManifest {
  try {
    const policy = loadGuardPolicy(rawPolicy, identity), manifest = RouteManifestSchema.parse(raw), { revision, ...body } = manifest;
    if (identity.digest(JSON.stringify(RouteManifestBodySchema.parse(body))) !== revision || manifest.policyId !== policy.policyId ||
      manifest.policyRevision !== policy.revision || Object.values(manifest.profiles).some(({ tools }) => tools.some((tool) => !policy.tools.allowed.includes(tool)))) throw new Error();
    const freeze = (value: unknown) => { if (value !== null && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } };
    freeze(manifest); return manifest;
  } catch { throw new RouteBoundaryError("ROUTE_MANIFEST_INVALID"); }
}

async function wait<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted(); let remove = () => {};
  try {
    const result = await new Promise<T>((resolve, reject) => {
      const abort = () => reject(signal.reason); signal.addEventListener("abort", abort, { once: true });
      remove = () => signal.removeEventListener("abort", abort);
      Promise.resolve().then(() => { signal.throwIfAborted(); return work(); }).then(resolve, reject);
    });
    signal.throwIfAborted(); return result;
  } finally { remove(); }
}

export function validateRouteExecution(raw: { result: unknown; events: unknown }, profile: RouteProfile, runId: string) {
  try {
    const result = profile === "grounded" ? GroundedRunAgentResultSchema.parse(raw.result) : RunAgentResultSchema.parse(raw.result);
    const events = z.array(RegisteredAgentEventEnvelopeSchema).min(1).max(8).parse(raw.events);
    if (result.runId !== runId || events.some((event, index) => event.runId !== runId || event.sequence !== index + 1 ||
      index > 0 && Date.parse(event.occurredAt) < Date.parse(events[index - 1]!.occurredAt)) || new Set(events.map(({ eventId }) => eventId)).size !== events.length) throw new Error();
    const terminals = events.filter(({ eventType }) => ["run.succeeded", "run.failed", "run.cancelled"].includes(eventType)), last = events.at(-1)!;
    if (terminals.length !== 1 || terminals[0] !== last) throw new Error();
    const model = events.filter((event) => event.eventType === "model.requested"), tool = events.filter((event) => event.eventType === "tool.requested");
    const attempt = RouteAttemptSchema.parse({ profile, runId, modelCalls: model.length, toolCalls: tool.length, ok: result.ok,
      ...(!result.ok ? { errorCode: result.error.code } : {}) });
    const requested = [...model, ...tool];
    const responded = events.filter((event) => event.eventType === "model.responded" || event.eventType === "tool.succeeded" || event.eventType === "tool.failed");
    if (new Set(requested.map(({ payload }) => payload.callId)).size !== requested.length ||
      new Set(responded.map(({ payload }) => payload.callId)).size !== responded.length ||
      model.some(({ payload }, index) => payload.step !== index + 1) || tool.some(({ payload }, index) => payload.step !== index + 1) ||
      tool.some(({ payload }) => !(profile === "grounded" ? ["retrieve_passages"] : ["search_docs", "read_doc"]).includes(payload.toolName)) ||
      !("modelCalls" in last.payload) || last.payload.modelCalls !== model.length || last.payload.toolCalls !== tool.length ||
      events.some((event, index) => event.eventType === "run.started" && index !== 0)) throw new Error();
    if (events[0]!.eventType !== "run.started" && !(events.length === 1 && model.length === 0 && tool.length === 0)) throw new Error();
    for (const event of events) {
      if (event.eventType === "model.responded" && !model.some((request) => request.sequence < event.sequence && request.payload.callId === event.payload.callId && request.payload.step === event.payload.step)) throw new Error();
      if ((event.eventType === "tool.succeeded" || event.eventType === "tool.failed") && !tool.some((request) => request.sequence < event.sequence && request.payload.callId === event.payload.callId && request.payload.step === event.payload.step && request.payload.toolName === event.payload.toolName)) throw new Error();
    }
    if (result.ok) {
      const grammar = ["run.started", "model.requested", "model.responded", "tool.requested", "tool.succeeded", "model.requested", "model.responded", "run.succeeded"];
      if (events.length !== grammar.length || events.some(({ eventType }, index) => eventType !== grammar[index]) ||
        events[2]?.eventType !== "model.responded" || events[2].payload.actionKind !== "call_tool" ||
        events[6]?.eventType !== "model.responded" || events[6].payload.actionKind !== "final_answer" ||
        result.usage.modelCalls !== model.length || result.usage.toolCalls !== tool.length || last.eventType !== "run.succeeded" ||
        last.payload.answerLength !== result.answer.length || JSON.stringify(last.payload.sourceIds) !== JSON.stringify(result.sources.map(({ documentId }) => documentId))) throw new Error();
      if (profile === "grounded") {
        const grounded = GroundedRunAgentResultSchema.parse(result);
        if (!grounded.ok || grounded.answer !== renderGroundedAnswer(grounded.grounding) ||
          new Set(grounded.grounding.claims.map(({ citation }) => citation.documentId)).size !== grounded.sources.length ||
          grounded.sources.some(({ documentId }) => !grounded.grounding.claims.some(({ citation }) => citation.documentId === documentId))) throw new Error();
      }
    } else if (last.eventType !== (result.error.code === "CANCELLED" ? "run.cancelled" : "run.failed") ||
      !("errorCode" in last.payload) || last.payload.errorCode !== result.error.code || last.payload.stage !== result.error.stage) throw new Error();
    const safeFallback = profile === "lexical" && !result.ok && result.error.code === "MODEL_FAILURE" && result.error.stage === "model" &&
      model.length === 1 && tool.length === 0 && events.length === 3 && events[0]?.eventType === "run.started" && events[1]?.eventType === "model.requested" && last.eventType === "run.failed";
    return { result, attempt, safeFallback };
  } catch { throw new RouteBoundaryError("ROUTE_EVIDENCE_INVALID"); }
}

export function createRouteAgent(deps: { manifest: RouteManifest; policy: GuardPolicy; identity: ContentIdentityPort;
  clock: ClockPort; ids: RouteIdPort; executor: RouteExecutionPort; journal: RouteJournalPort }) {
  const manifest = loadRouteManifest(deps.manifest, deps.policy, deps.identity);
  return async (raw: unknown, caller?: AbortSignal) => {
    const routeId = deps.ids.next("route"), controller = new AbortController();
    const cancel = () => controller.abort(new RouteBoundaryError("ROUTE_CANCELLED"));
    if (caller?.aborted) cancel(); else caller?.addEventListener("abort", cancel, { once: true });
    const timeout = setTimeout(() => controller.abort(new RouteBoundaryError("ROUTE_TIMEOUT")), manifest.budget.timeoutMs);
    let sequence = 0, terminalAttempted = false;
    const attempts: RouteAttempt[] = [];
    const append = async (kind: RouteAuditEvent["kind"], payload: unknown, independent = false) => {
      const event = RouteAuditEventSchema.parse({ schemaVersion: "route-audit-1.0", routeId, eventId: deps.ids.next("event"),
        sequence: sequence + 1, timestamp: deps.clock.now(), manifestRevision: manifest.revision, policyRevision: manifest.policyRevision, kind, payload });
      const auditController = new AbortController();
      const abort = () => auditController.abort(controller.signal.reason);
      if (!independent) { if (controller.signal.aborted) abort(); else controller.signal.addEventListener("abort", abort, { once: true }); }
      const timer = setTimeout(() => auditController.abort(new RouteBoundaryError("ROUTE_JOURNAL_FAILURE")), independent ? 250 : 500);
      try { await wait(() => deps.journal.append(event, auditController.signal), auditController.signal); sequence = event.sequence; }
      catch (error) { if (!independent && controller.signal.aborted) throw controller.signal.reason; throw new RouteBoundaryError("ROUTE_JOURNAL_FAILURE"); }
      finally { clearTimeout(timer); controller.signal.removeEventListener("abort", abort); }
    };
    try {
      controller.signal.throwIfAborted();
      const parsed = RouteRequestSchema.safeParse(raw);
      if (!parsed.success) throw new RouteBoundaryError("ROUTE_INPUT_INVALID");
      const request = parsed.data;
      await append("route.started", { requestedProfile: request.profile });
      let profile = request.profile;
      while (true) {
        if (attempts.length >= manifest.budget.maxAttempts) throw new RouteBoundaryError("ROUTE_LIMIT_EXCEEDED");
        const runId = deps.ids.next("run");
        await append("attempt.started", { profile, runId, attempt: attempts.length + 1 });
        let rawExecution;
        try { rawExecution = await wait(() => deps.executor.execute(profile, request.question, runId, controller.signal), controller.signal); }
        catch (error) { if (controller.signal.aborted) throw controller.signal.reason; throw new RouteBoundaryError("ROUTE_EXECUTION_FAILURE"); }
        const execution = validateRouteExecution(rawExecution, profile, runId);
        attempts.push(execution.attempt);
        await append("attempt.completed", execution.attempt);
        const modelCalls = attempts.reduce((sum, attempt) => sum + attempt.modelCalls, 0), toolCalls = attempts.reduce((sum, attempt) => sum + attempt.toolCalls, 0);
        if (modelCalls > manifest.budget.maxModelCalls || toolCalls > manifest.budget.maxToolCalls) throw new RouteBoundaryError("ROUTE_LIMIT_EXCEEDED");
        if (execution.safeFallback && attempts.length === 1 && modelCalls + 2 <= manifest.budget.maxModelCalls && toolCalls + 1 <= manifest.budget.maxToolCalls) {
          profile = manifest.fallback.to; continue;
        }
        const result = RouteResultSchema.parse({ schemaVersion: "route-result-1.0", routeId, manifestRevision: manifest.revision, policyRevision: manifest.policyRevision,
          requestedProfile: request.profile, selectedProfile: profile, attempts, evidence: manifest.profiles[profile].evidence, result: execution.result });
        terminalAttempted = true;
        await append("route.completed", { selectedProfile: profile, attempts: attempts.length, modelCalls, toolCalls, ok: execution.result.ok,
          ...(!execution.result.ok ? { errorCode: execution.result.error.code } : {}) });
        return result;
      }
    } catch (error) {
      const code: RouteBoundaryCode = controller.signal.aborted ? (controller.signal.reason as RouteBoundaryError).code
        : error instanceof RouteBoundaryError ? error.code : "ROUTE_EVIDENCE_INVALID";
      if (!terminalAttempted && code !== "ROUTE_JOURNAL_FAILURE") { terminalAttempted = true; await append("route.failed", { code }, true); }
      throw new RouteBoundaryError(code);
    } finally { clearTimeout(timeout); caller?.removeEventListener("abort", cancel); }
  };
}
