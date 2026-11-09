import { z } from "zod";

import { RunAgentResultSchema } from "./agent-contracts.js";

export const RetrievalIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,127}$/u);
export const ContentDigestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const CanonicalTextSchema = z.string().min(1).max(1_000_000)
  .refine((text) => text.isWellFormed() && !text.includes("\r") && !text.includes("\0"), "Expected canonical LF text");

export const EmbeddingProfileSchema = z.strictObject({
  id: RetrievalIdSchema, dimensions: z.number().int().min(1).max(1536),
});
export type EmbeddingProfile = z.infer<typeof EmbeddingProfileSchema>;

export const EmbeddingSchema = z.strictObject({
  profile: EmbeddingProfileSchema,
  values: z.array(z.number().finite().min(-1).max(1)).min(1).max(1536),
}).refine(({ profile, values }) => values.length === profile.dimensions &&
  Math.abs(Math.hypot(...values) - 1) <= 0.00001, "Expected normalized vector matching profile");
export type Embedding = z.infer<typeof EmbeddingSchema>;

export const IndexManifestSchema = z.strictObject({
  indexId: RetrievalIdSchema, embedding: EmbeddingProfileSchema, chunker: z.literal("utf16-v1"),
});
export type IndexManifest = z.infer<typeof IndexManifestSchema>;

export const IndexedDocumentSchema = z.strictObject({
  documentId: RetrievalIdSchema, revision: ContentDigestSchema,
  title: z.string().trim().min(1).max(256), content: CanonicalTextSchema,
});
export type IndexedDocument = z.infer<typeof IndexedDocumentSchema>;

const citationFields = {
  indexId: RetrievalIdSchema, documentId: RetrievalIdSchema, revision: ContentDigestSchema,
  passageId: ContentDigestSchema, start: z.number().int().min(0).max(1_000_000),
  end: z.number().int().min(1).max(1_000_000),
};
export const CitationSchema = z.strictObject(citationFields)
  .refine(({ start, end }) => end > start, "Expected nonempty half-open span");
export type Citation = z.infer<typeof CitationSchema>;

const passageFields = {
  ...citationFields, title: z.string().trim().min(1).max(256), ordinal: z.number().int().min(0).max(4095),
  text: CanonicalTextSchema.max(1024),
};
export const PassageSchema = z.strictObject(passageFields)
  .refine(({ start, end, text }) => end - start === text.length, "Span must match UTF-16 text length");
export type Passage = z.infer<typeof PassageSchema>;

export const IndexedPassageSchema = z.strictObject({ passage: PassageSchema, embedding: EmbeddingSchema });
export type IndexedPassage = z.infer<typeof IndexedPassageSchema>;

export const RetrievalInputSchema = z.strictObject({
  query: z.string().trim().min(1).max(2048), limit: z.number().int().min(1).max(5).default(3),
});
export type RetrievalInput = z.infer<typeof RetrievalInputSchema>;

export const ScoredPassageSchema = z.strictObject({
  ...passageFields, score: z.number().finite().min(-1).max(1),
}).refine(({ start, end, text }) => end - start === text.length, "Span must match UTF-16 text length");
export const RetrievalOutputSchema = z.strictObject({
  indexId: RetrievalIdSchema, profileId: RetrievalIdSchema, passages: z.array(ScoredPassageSchema).max(5),
}).refine(({ indexId, passages }) => passages.every((passage) => passage.indexId === indexId) &&
  new Set(passages.map(({ passageId }) => passageId)).size === passages.length,
"Expected unique passages belonging to the selected index");
export type RetrievalOutput = z.infer<typeof RetrievalOutputSchema>;

export const GroundedAnswerSchema = z.discriminatedUnion("status", [
  z.strictObject({
    version: z.literal("1.0"), status: z.literal("answered"),
    claims: z.array(z.strictObject({ quote: CanonicalTextSchema.max(1024), citation: CitationSchema })).min(1).max(3),
  }),
  z.strictObject({
    version: z.literal("1.0"), status: z.literal("abstained"),
    reason: z.literal("no_evidence"), claims: z.tuple([]),
  }),
]);
export type GroundedAnswer = z.infer<typeof GroundedAnswerSchema>;

export const GroundedRunAgentResultSchema = z.discriminatedUnion("ok", [
  RunAgentResultSchema.options[0].extend({ grounding: GroundedAnswerSchema }),
  RunAgentResultSchema.options[1],
]);
export type GroundedRunAgentResult = z.infer<typeof GroundedRunAgentResultSchema>;

export const RetrievalBoundaryCodeSchema = z.enum([
  "INDEX_CONFIGURATION_MISMATCH", "DOCUMENT_INVALID", "EMBEDDING_INVALID",
  "RETRIEVAL_INVALID", "CITATION_INVALID", "REPOSITORY_FAILURE",
]);
export type RetrievalBoundaryCode = z.infer<typeof RetrievalBoundaryCodeSchema>;
export class RetrievalBoundaryError extends Error {
  constructor(readonly code: RetrievalBoundaryCode) {
    super("The retrieval boundary rejected the operation.");
    this.name = "RetrievalBoundaryError";
  }
}
