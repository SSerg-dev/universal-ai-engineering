import type {
  Citation, Embedding, IndexedDocument, IndexedPassage, IndexManifest,
} from "../../domain/retrieval-contracts.js";

export interface PassageRepositoryPort {
  // Atomic replacement of the active revision, with immutable earlier revisions retained.
  replaceDocument(manifest: IndexManifest, document: IndexedDocument,
    passages: readonly IndexedPassage[], signal: AbortSignal): Promise<void>;
  search(manifest: IndexManifest, embedding: Embedding, limit: number,
    minimumScore: number, signal: AbortSignal): Promise<unknown>;
  // Resolve the full identity and exact span, never just the current document ID.
  resolve(citation: Citation, signal: AbortSignal): Promise<unknown>;
}
