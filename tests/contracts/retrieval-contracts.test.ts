import { describe, expect, it } from "vitest";

import {
  CitationSchema, EmbeddingSchema, GroundedAnswerSchema, GroundedRunAgentResultSchema,
  IndexedDocumentSchema, IndexManifestSchema, PassageSchema, RetrievalOutputSchema,
} from "../../src/domain/retrieval-contracts.js";
import { RunAgentResultSchema } from "../../src/domain/agent-contracts.js";

const digest = "a".repeat(64);
const passage = {
  indexId: "course-v1", documentId: "journal", revision: digest, passageId: "b".repeat(64),
  title: "Journal", ordinal: 0, start: 2, end: 7, text: "quote",
};
const citation = {
  indexId: passage.indexId, documentId: passage.documentId, revision: passage.revision,
  passageId: passage.passageId, start: passage.start, end: passage.end,
};

describe("Grounded retrieval contracts", () => {
  it("names an immutable index configuration and bounded embedding profile", () => {
    expect(IndexManifestSchema.parse({ indexId: "course-v1", embedding: { id: "fixture-hash-v1", dimensions: 64 }, chunker: "utf16-v1" }).indexId).toBe("course-v1");
    for (const dimensions of [0, -1, 1537, 1.5]) {
      expect(IndexManifestSchema.safeParse({ indexId: "course-v1", embedding: { id: "fake", dimensions }, chunker: "utf16-v1" }).success).toBe(false);
    }
    expect(IndexManifestSchema.safeParse({ indexId: "../escape", embedding: { id: "fake", dimensions: 3 }, chunker: "utf16-v1" }).success).toBe(false);
  });

  it.each([[0, 0], [Number.NaN, 1], [Number.POSITIVE_INFINITY, 1], [2, 0], [0.5]].map((values) => ({ values })))("rejects unusable vectors $values", ({ values }) => {
    expect(EmbeddingSchema.safeParse({ profile: { id: "fixture", dimensions: 2 }, values }).success).toBe(false);
  });

  it("requires normalized finite vectors with the declared dimension", () => {
    const value = { profile: { id: "fixture", dimensions: 2 }, values: [0.6, 0.8] };
    expect(EmbeddingSchema.parse(value)).toEqual(value);
    expect(EmbeddingSchema.safeParse({ ...value, values: [1, 1] }).success).toBe(false);
  });

  it("defines citations as exact half-open UTF-16 spans in immutable revisions", () => {
    expect(PassageSchema.parse(passage)).toEqual(passage);
    expect(CitationSchema.parse(citation)).toEqual(citation);
    for (const value of [{ ...passage, end: 8 }, { ...passage, start: -1 }, { ...passage, revision: "latest" },
      { ...passage, text: "\rquote" }, { ...passage, passageId: "../document" }]) {
      expect(PassageSchema.safeParse(value).success).toBe(false);
    }
    expect(IndexedDocumentSchema.safeParse({ documentId: "journal", revision: digest, title: "Journal", content: "a\r\nb" }).success).toBe(false);
  });

  it("rejects duplicate and cross-index retrieval observations", () => {
    const hit = { ...passage, score: 0.8 };
    const valid = { indexId: "course-v1", profileId: "fixture", passages: [hit] };
    expect(RetrievalOutputSchema.parse(valid)).toEqual(valid);
    expect(RetrievalOutputSchema.safeParse({ ...valid, passages: [hit, hit] }).success).toBe(false);
    expect(RetrievalOutputSchema.safeParse({ ...valid, indexId: "other" }).success).toBe(false);
    expect(RetrievalOutputSchema.safeParse({ ...valid, passages: [{ ...hit, score: 2 }] }).success).toBe(false);
  });

  it("requires claims and citations for answered results and zero claims for abstention", () => {
    const grounded = { version: "1.0", status: "answered", claims: [{ quote: "quote", citation }] };
    expect(GroundedAnswerSchema.parse(grounded)).toEqual(grounded);
    for (const value of [{ ...grounded, claims: [] }, { ...grounded, claims: [{ quote: "quote" }] },
      { ...grounded, answer: "unsupported prose" }, { ...grounded, claims: [{ quote: "", citation }] }]) {
      expect(GroundedAnswerSchema.safeParse(value).success).toBe(false);
    }
    expect(GroundedAnswerSchema.parse({ version: "1.0", status: "abstained", reason: "no_evidence", claims: [] }).status).toBe("abstained");
    expect(GroundedAnswerSchema.safeParse({ version: "1.0", status: "abstained", reason: "no_evidence", claims: grounded.claims }).success).toBe(false);
  });

  it("adds versioned grounding only to the dedicated result schema and preserves legacy strictness", () => {
    const base = { ok: true, runId: "run-1", answer: "quote", sources: [], usage: { modelCalls: 2, toolCalls: 1 } };
    const enriched = { ...base, grounding: { version: "1.0", status: "answered", claims: [{ quote: "quote", citation }] } };
    expect(GroundedRunAgentResultSchema.safeParse(enriched).success).toBe(true);
    expect(RunAgentResultSchema.safeParse(enriched).success).toBe(false);
    expect(GroundedRunAgentResultSchema.safeParse(base).success).toBe(false);
  });
});
