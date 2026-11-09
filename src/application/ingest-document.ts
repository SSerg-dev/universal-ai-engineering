import { z } from "zod";

import {
  EmbeddingSchema, IndexedDocumentSchema, IndexManifestSchema, PassageSchema, RetrievalBoundaryError,
  type IndexedDocument, type IndexedPassage, type IndexManifest, type Passage,
} from "../domain/retrieval-contracts.js";
import type { ContentIdentityPort } from "./ports/content-identity-port.js";
import type { EmbeddingPort } from "./ports/embedding-port.js";
import type { PassageRepositoryPort } from "./ports/passage-repository-port.js";

const SourceDocumentSchema = IndexedDocumentSchema.omit({ revision: true }).extend({
  content: z.string().min(1).max(1_000_000),
});

export function prepareDocument(rawManifest: IndexManifest, rawSource: unknown,
  identity: ContentIdentityPort): { document: IndexedDocument; passages: Passage[] } {
  try {
    const manifest = IndexManifestSchema.parse(rawManifest);
    const source = SourceDocumentSchema.parse(rawSource);
    const content = source.content.replace(/\r\n?/gu, "\n");
    const document = IndexedDocumentSchema.parse({ ...source, content, revision: identity.digest(content) });
    const title = content.split("\n").find((line) => line.trim().length > 0)?.trim().match(/^#\s+(.+?)\s*$/u)?.[1]?.trim();
    if (title !== document.title) throw new Error("title mismatch");
    const passages: Passage[] = [];
    for (let start = 0; start < content.length;) {
      let end = Math.min(start + 1024, content.length);
      const last = content.charCodeAt(end - 1);
      if (end < content.length && last >= 0xD800 && last <= 0xDBFF) end -= 1;
      const ordinal = passages.length;
      const passageId = identity.digest(JSON.stringify([
        manifest.indexId, document.documentId, document.revision, manifest.chunker, ordinal, start, end,
      ]));
      passages.push(PassageSchema.parse({
        indexId: manifest.indexId, documentId: document.documentId, revision: document.revision,
        passageId, title: document.title, ordinal, start, end, text: content.slice(start, end),
      }));
      start = end;
    }
    return { document, passages };
  } catch {
    throw new RetrievalBoundaryError("DOCUMENT_INVALID");
  }
}

export function createIngestDocument(deps: {
  manifest: IndexManifest; identity: ContentIdentityPort; embeddings: EmbeddingPort; repository: PassageRepositoryPort;
}) {
  const manifest = IndexManifestSchema.parse(deps.manifest);
  return async (source: unknown, signal: AbortSignal) => {
    signal.throwIfAborted();
    const { document, passages } = prepareDocument(manifest, source, deps.identity);
    if (deps.embeddings.profile.id !== manifest.embedding.id || deps.embeddings.profile.dimensions !== manifest.embedding.dimensions) {
      throw new RetrievalBoundaryError("INDEX_CONFIGURATION_MISMATCH");
    }
    const entries: IndexedPassage[] = [];
    for (const passage of passages) {
      signal.throwIfAborted();
      let raw: unknown;
      try { raw = await deps.embeddings.embed(passage.text, signal); }
      catch { if (signal.aborted) throw signal.reason; throw new RetrievalBoundaryError("EMBEDDING_INVALID"); }
      signal.throwIfAborted();
      const parsed = EmbeddingSchema.safeParse(raw);
      if (!parsed.success || parsed.data.profile.id !== manifest.embedding.id ||
        parsed.data.profile.dimensions !== manifest.embedding.dimensions) throw new RetrievalBoundaryError("EMBEDDING_INVALID");
      entries.push({ passage, embedding: parsed.data });
    }
    try {
      await deps.repository.replaceDocument(manifest, document, entries, signal);
      signal.throwIfAborted();
      return { indexId: manifest.indexId, documentId: document.documentId, revision: document.revision, passageCount: entries.length };
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (error instanceof RetrievalBoundaryError) throw error;
      throw new RetrievalBoundaryError("REPOSITORY_FAILURE");
    }
  };
}
