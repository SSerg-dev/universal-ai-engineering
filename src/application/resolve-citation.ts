import {
  CitationSchema, PassageSchema, RetrievalBoundaryError, RetrievalIdSchema, type Passage,
} from "../domain/retrieval-contracts.js";
import { citationFor } from "./grounded-answer.js";
import type { PassageRepositoryPort } from "./ports/passage-repository-port.js";

export type ResolveCitationUseCase = (input: unknown, signal?: AbortSignal) => Promise<Passage | null>;

export function createResolveCitation(indexId: string, repository: PassageRepositoryPort): ResolveCitationUseCase {
  const selected = RetrievalIdSchema.parse(indexId);
  return async (input, signal = new AbortController().signal) => {
    signal.throwIfAborted();
    const citation = CitationSchema.safeParse(input);
    if (!citation.success || citation.data.indexId !== selected) throw new RetrievalBoundaryError("CITATION_INVALID");
    let raw: unknown;
    try { raw = await repository.resolve(citation.data, signal); }
    catch (error) {
      if (signal.aborted) throw signal.reason;
      if (error instanceof RetrievalBoundaryError) throw error;
      throw new RetrievalBoundaryError("REPOSITORY_FAILURE");
    }
    signal.throwIfAborted();
    if (raw === null) return null;
    const passage = PassageSchema.safeParse(raw);
    if (!passage.success || JSON.stringify(citationFor(passage.data)) !== JSON.stringify(citation.data)) throw new RetrievalBoundaryError("CITATION_INVALID");
    return passage.data;
  };
}
