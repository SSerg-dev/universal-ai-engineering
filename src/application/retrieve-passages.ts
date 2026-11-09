import {
  EmbeddingSchema, IndexManifestSchema, RetrievalBoundaryError, RetrievalInputSchema, RetrievalOutputSchema,
  type IndexManifest, type RetrievalOutput,
} from "../domain/retrieval-contracts.js";
import type { EmbeddingPort } from "./ports/embedding-port.js";
import type { PassageRepositoryPort } from "./ports/passage-repository-port.js";

export function createRetrievePassages(deps: {
  manifest: IndexManifest; embeddings: EmbeddingPort; repository: PassageRepositoryPort; minimumScore: number;
}) {
  const manifest = IndexManifestSchema.parse(deps.manifest);
  const { minimumScore } = deps;
  if (!Number.isFinite(minimumScore) || minimumScore < -1 || minimumScore > 1) throw new RetrievalBoundaryError("INDEX_CONFIGURATION_MISMATCH");
  return async (rawInput: unknown, signal: AbortSignal): Promise<RetrievalOutput> => {
    signal.throwIfAborted();
    const input = RetrievalInputSchema.parse(rawInput);
    if (deps.embeddings.profile.id !== manifest.embedding.id || deps.embeddings.profile.dimensions !== manifest.embedding.dimensions) {
      throw new RetrievalBoundaryError("INDEX_CONFIGURATION_MISMATCH");
    }
    let rawEmbedding: unknown;
    try { rawEmbedding = await deps.embeddings.embed(input.query, signal); }
    catch { if (signal.aborted) throw signal.reason; throw new RetrievalBoundaryError("EMBEDDING_INVALID"); }
    signal.throwIfAborted();
    // A provider may explicitly report no usable query information; never index a zero vector.
    if (rawEmbedding === null) return { indexId: manifest.indexId, profileId: manifest.embedding.id, passages: [] };
    const parsed = EmbeddingSchema.safeParse(rawEmbedding);
    if (!parsed.success || parsed.data.profile.id !== manifest.embedding.id ||
      parsed.data.profile.dimensions !== manifest.embedding.dimensions) throw new RetrievalBoundaryError("EMBEDDING_INVALID");
    let raw: unknown;
    try {
      raw = await deps.repository.search(manifest, parsed.data, input.limit, minimumScore, signal);
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (error instanceof RetrievalBoundaryError) throw error;
      throw new RetrievalBoundaryError("REPOSITORY_FAILURE");
    }
    signal.throwIfAborted();
    const output = RetrievalOutputSchema.safeParse(raw);
    if (!output.success || output.data.indexId !== manifest.indexId || output.data.profileId !== manifest.embedding.id ||
      output.data.passages.length > input.limit || output.data.passages.some(({ score }) => score < minimumScore)) {
      throw new RetrievalBoundaryError("RETRIEVAL_INVALID");
    }
    return output.data;
  };
}
