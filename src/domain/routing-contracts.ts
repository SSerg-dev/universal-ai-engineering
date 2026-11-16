import { z } from "zod";
import { RunAgentResultSchema } from "./agent-contracts.js";
import { AgentErrorCodeSchema } from "./agent-errors.js";
import { ContentDigestSchema, GroundedRunAgentResultSchema, RetrievalIdSchema } from "./retrieval-contracts.js";
import { GuardRunIdSchema } from "./guard-contracts.js";
import { StateIdSchema, StateTimestampSchema } from "./state-contracts.js";

export const RouteProfileSchema = z.enum(["grounded", "lexical"]);
export type RouteProfile = z.infer<typeof RouteProfileSchema>;
export const RouteIdSchema = StateIdSchema.refine((value) => /^route-[A-Za-z0-9_-]+$/u.test(value));
const manifestFields = {
  schemaVersion: z.literal("route-manifest-1.0"), manifestId: RetrievalIdSchema, version: z.string().regex(/^\d+\.\d+\.\d+$/u),
  policyId: RetrievalIdSchema, policyRevision: ContentDigestSchema, defaultProfile: z.literal("grounded"),
  profiles: z.strictObject({
    grounded: z.strictObject({ model: z.literal("grounded-teaching-v1"), tools: z.tuple([z.literal("retrieve_passages")]),
      retrieval: z.literal("controlled-pgvector-v1"), evidence: z.literal("grounded") }),
    lexical: z.strictObject({ model: z.literal("registered-teaching-v1"), tools: z.tuple([z.literal("search_docs"), z.literal("read_doc")]),
      retrieval: z.literal("controlled-markdown-v1"), evidence: z.literal("source_reference") }),
  }),
  fallback: z.strictObject({ from: z.literal("lexical"), to: z.literal("grounded"), errorCode: z.literal("MODEL_FAILURE"),
    requiresNoToolAttempt: z.literal(true) }),
  budget: z.strictObject({ maxAttempts: z.literal(2), maxModelCalls: z.literal(3), maxToolCalls: z.literal(1), timeoutMs: z.literal(11000) }),
};
export const RouteManifestBodySchema = z.strictObject(manifestFields);
export const RouteManifestSchema = z.strictObject({ ...manifestFields, revision: ContentDigestSchema });
export type RouteManifest = z.infer<typeof RouteManifestSchema>;
export const RouteRequestSchema = z.strictObject({ profile: RouteProfileSchema.default("grounded"), question: z.string().trim().min(1).max(2048) });
export type RouteRequest = z.infer<typeof RouteRequestSchema>;
export const RouteBoundaryCodeSchema = z.enum(["ROUTE_INPUT_INVALID", "ROUTE_MANIFEST_INVALID", "ROUTE_EXECUTION_FAILURE", "ROUTE_EVIDENCE_INVALID",
  "ROUTE_JOURNAL_FAILURE", "ROUTE_TIMEOUT", "ROUTE_CANCELLED", "ROUTE_LIMIT_EXCEEDED"]);
export type RouteBoundaryCode = z.infer<typeof RouteBoundaryCodeSchema>;
export class RouteBoundaryError extends Error {
  constructor(readonly code: RouteBoundaryCode) { super("The routed operation could not be completed."); this.name = "RouteBoundaryError"; }
}
const countFields = { modelCalls: z.number().int().min(0).max(2), toolCalls: z.number().int().min(0).max(1) };
export const RouteAttemptSchema = z.strictObject({ profile: RouteProfileSchema, runId: GuardRunIdSchema,
  ...countFields, ok: z.boolean(), errorCode: AgentErrorCodeSchema.optional() }).refine((value) => value.ok === (value.errorCode === undefined));
export type RouteAttempt = z.infer<typeof RouteAttemptSchema>;
const resultBase = {
  schemaVersion: z.literal("route-result-1.0"), routeId: RouteIdSchema, manifestRevision: ContentDigestSchema, policyRevision: ContentDigestSchema,
  requestedProfile: RouteProfileSchema, selectedProfile: RouteProfileSchema, attempts: z.array(RouteAttemptSchema).min(1).max(2),
};
export const RouteResultSchema = z.discriminatedUnion("evidence", [
  z.strictObject({ ...resultBase, evidence: z.literal("grounded"), result: GroundedRunAgentResultSchema }),
  z.strictObject({ ...resultBase, evidence: z.literal("source_reference"), result: RunAgentResultSchema }),
]).refine((value) => {
  const first = value.attempts[0]!, last = value.attempts.at(-1)!;
  if (first.profile !== value.requestedProfile || last.profile !== value.selectedProfile || last.runId !== value.result.runId ||
    last.ok !== value.result.ok || (value.result.ok && (last.modelCalls !== value.result.usage.modelCalls || last.toolCalls !== value.result.usage.toolCalls)) ||
    (!value.result.ok && last.errorCode !== value.result.error.code) ||
    (value.evidence === "grounded") !== (value.selectedProfile === "grounded") || new Set(value.attempts.map(({ runId }) => runId)).size !== value.attempts.length ||
    value.attempts.reduce((sum, attempt) => sum + attempt.modelCalls, 0) > 3 || value.attempts.reduce((sum, attempt) => sum + attempt.toolCalls, 0) > 1) return false;
  return value.attempts.length === 1 || first.profile === "lexical" && first.errorCode === "MODEL_FAILURE" &&
    first.modelCalls === 1 && first.toolCalls === 0 && last.profile === "grounded";
});
export type RouteResult = z.infer<typeof RouteResultSchema>;
const auditBase = { schemaVersion: z.literal("route-audit-1.0"), routeId: RouteIdSchema, eventId: StateIdSchema,
  sequence: z.number().int().min(1).max(8), timestamp: StateTimestampSchema, manifestRevision: ContentDigestSchema, policyRevision: ContentDigestSchema };
export const RouteAuditEventSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...auditBase, kind: z.literal("route.started"), payload: z.strictObject({ requestedProfile: RouteProfileSchema }) }),
  z.strictObject({ ...auditBase, kind: z.literal("attempt.started"), payload: z.strictObject({ profile: RouteProfileSchema, runId: GuardRunIdSchema,
    attempt: z.number().int().min(1).max(2) }) }),
  z.strictObject({ ...auditBase, kind: z.literal("attempt.completed"), payload: RouteAttemptSchema }),
  z.strictObject({ ...auditBase, kind: z.literal("route.completed"), payload: z.strictObject({ selectedProfile: RouteProfileSchema,
    attempts: z.number().int().min(1).max(2), modelCalls: z.number().int().min(0).max(3), toolCalls: z.number().int().min(0).max(1),
    ok: z.boolean(), errorCode: AgentErrorCodeSchema.optional() }).refine((value) => value.ok === (value.errorCode === undefined)) }),
  z.strictObject({ ...auditBase, kind: z.literal("route.failed"), payload: z.strictObject({ code: RouteBoundaryCodeSchema }) }),
]).refine((value) => JSON.stringify(value).length <= 4096);
export type RouteAuditEvent = z.infer<typeof RouteAuditEventSchema>;
