import { describe, expect, it } from "vitest";
import manifestJson from "../../fixtures/routing/local-course.v1.json" with { type: "json" };
import policyJson from "../../fixtures/policies/local-course-router.v1.json" with { type: "json" };
import { RouteAuditEventSchema, RouteManifestBodySchema, RouteManifestSchema, RouteRequestSchema, RouteResultSchema } from "../../src/domain/routing-contracts.js";
import { loadGuardPolicy } from "../../src/application/guard-policy.js";
import { guardFixture } from "../fixtures/guard.js";

function fixture() {
  const f = guardFixture(), manifest = RouteManifestSchema.parse(manifestJson);
  const primary = { profile: "grounded", runId: f.payload.result.runId, modelCalls: 2, toolCalls: 1, ok: true };
  return { ...f, manifest, value: { schemaVersion: "route-result-1.0", routeId: "route-one", manifestRevision: manifest.revision,
    policyRevision: manifest.policyRevision, requestedProfile: "grounded", selectedProfile: "grounded", attempts: [primary],
    evidence: "grounded", result: f.payload.result } };
}
describe("typed local route contracts", () => {
  it("pins actual model/tool/retrieval/policy tuples and canonical revisions", () => {
    const { identity, manifest } = fixture(), { revision, ...body } = manifest;
    expect(identity.digest(JSON.stringify(RouteManifestBodySchema.parse(body)))).toBe(revision);
    expect(loadGuardPolicy(policyJson, identity).revision).toBe(manifest.policyRevision);
    expect(manifest.profiles.lexical.tools).toEqual(["search_docs", "read_doc"]);
    expect(manifest.profiles.grounded.tools).toEqual(["retrieve_passages"]);
    expect(manifest.profiles.lexical.evidence).toBe("source_reference");
    expect(manifest.profiles.grounded.evidence).toBe("grounded");
  });
  it("refuses reversed/weaker fallback, extra attempts and caller-selected implementations", () => {
    const { manifest } = fixture();
    for (const value of [ { ...manifest, fallback: { ...manifest.fallback, from: "grounded", to: "lexical" } },
      { ...manifest, budget: { ...manifest.budget, maxAttempts: 3 } },
      { ...manifest, profiles: { ...manifest.profiles, grounded: { ...manifest.profiles.grounded, model: "caller-provider" } } },
    ]) expect(RouteManifestSchema.safeParse(value).success).toBe(false);
    expect(RouteRequestSchema.parse({ question: "execution journal" })).toEqual({ profile: "grounded", question: "execution journal" });
    for (const request of [{ profile: "untrusted", question: "q" }, { profile: "lexical", question: "q", approved: true },
      { question: "q", policy: {} }, { question: "q", model: "provider" }, { question: "q", fallback: true }]) expect(RouteRequestSchema.safeParse(request).success).toBe(false);
  });
  it("accepts one actual evidence mode and refuses source-reference results relabeled as grounded", () => {
    const { value } = fixture(); expect(RouteResultSchema.parse(value)).toMatchObject({ evidence: "grounded" });
    const { grounding: _grounding, ...legacy } = value.result;
    expect(RouteResultSchema.safeParse({ ...value, result: legacy }).success).toBe(false);
    expect(RouteResultSchema.safeParse({ ...value, evidence: "source_reference" }).success).toBe(false);
    expect(RouteResultSchema.parse({ ...value, evidence: "source_reference", result: legacy, requestedProfile: "lexical", selectedProfile: "lexical",
      attempts: [{ ...value.attempts[0], profile: "lexical" }] })).toMatchObject({ evidence: "source_reference" });
  });
  it("permits only a one-model zero-tool lexical failure followed by one fresh grounded attempt", () => {
    const { value } = fixture();
    const first = { profile: "lexical", runId: "run-first", modelCalls: 1, toolCalls: 0, ok: false, errorCode: "MODEL_FAILURE" };
    const fallback = { ...value, requestedProfile: "lexical", attempts: [first, ...value.attempts] };
    expect(RouteResultSchema.safeParse(fallback).success).toBe(true);
    for (const invalid of [{ ...first, toolCalls: 1 }, { ...first, modelCalls: 2 }, { ...first, errorCode: "TOOL_FAILURE" },
      { ...first, runId: value.result.runId }, { ...first, profile: "grounded" }]) expect(RouteResultSchema.safeParse({ ...fallback, attempts: [invalid, ...value.attempts] }).success).toBe(false);
  });
  it("keeps routing journal metadata strict and content-free", () => {
    const { manifest } = fixture(), event = { schemaVersion: "route-audit-1.0", routeId: "route-one", eventId: "event-one", sequence: 1,
      timestamp: "2026-11-16T00:00:00.000Z", manifestRevision: manifest.revision, policyRevision: manifest.policyRevision,
      kind: "route.started", payload: { requestedProfile: "lexical" } };
    expect(RouteAuditEventSchema.safeParse(event).success).toBe(true);
    expect(RouteAuditEventSchema.safeParse({ ...event, question: "private question" }).success).toBe(false);
    expect(RouteAuditEventSchema.safeParse({ ...event, payload: { ...event.payload, answer: "private answer" } }).success).toBe(false);
  });
});
