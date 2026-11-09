import { Client } from "pg";
import { z } from "zod";

import { prepareDocument } from "../../application/ingest-document.js";
import type { PassageRepositoryPort } from "../../application/ports/passage-repository-port.js";
import {
  CitationSchema, EmbeddingSchema, IndexedDocumentSchema, IndexedPassageSchema, IndexManifestSchema,
  PassageSchema, RetrievalBoundaryError, RetrievalOutputSchema,
  type Citation, type Embedding, type IndexedDocument, type IndexedPassage, type IndexManifest,
} from "../../domain/retrieval-contracts.js";
import { Sha256ContentIdentity } from "./sha256-content-identity.js";

const DDL = `
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;
CREATE SCHEMA IF NOT EXISTS uaos_retrieval;
CREATE TABLE IF NOT EXISTS uaos_retrieval.indexes (
 index_id text PRIMARY KEY, profile_id text NOT NULL, dimensions integer NOT NULL, chunker text NOT NULL
);
CREATE TABLE IF NOT EXISTS uaos_retrieval.documents (
 index_id text NOT NULL REFERENCES uaos_retrieval.indexes(index_id), document_id text NOT NULL,
 revision text NOT NULL, title text NOT NULL, content text NOT NULL,
 PRIMARY KEY(index_id, document_id, revision)
);
CREATE TABLE IF NOT EXISTS uaos_retrieval.active_documents (
 index_id text NOT NULL, document_id text NOT NULL, revision text NOT NULL,
 PRIMARY KEY(index_id, document_id),
 FOREIGN KEY(index_id, document_id, revision) REFERENCES uaos_retrieval.documents(index_id, document_id, revision)
);
CREATE TABLE IF NOT EXISTS uaos_retrieval.passages (
 index_id text NOT NULL, document_id text NOT NULL, revision text NOT NULL, passage_id text NOT NULL,
 ordinal integer NOT NULL, start_offset integer NOT NULL, end_offset integer NOT NULL,
 body text NOT NULL, embedding public.vector NOT NULL,
 PRIMARY KEY(index_id, passage_id), UNIQUE(index_id, document_id, revision, ordinal),
 FOREIGN KEY(index_id, document_id, revision) REFERENCES uaos_retrieval.documents(index_id, document_id, revision)
);`;

const manifestRowSchema = z.object({ index_id: z.string(), profile_id: z.string(), dimensions: z.number(), chunker: z.string() });
const selectedPassageColumns = `p.index_id AS "indexId", p.document_id AS "documentId", p.revision,
 p.passage_id AS "passageId", d.title, p.ordinal, p.start_offset AS start, p.end_offset AS end, p.body AS text`;

export class PostgresPassageRepository implements PassageRepositoryPort {
  readonly #connectionString: string;
  readonly #operationTimeoutMs: number;
  readonly #identity = new Sha256ContentIdentity();

  constructor(options: { connectionString: string; operationTimeoutMs?: number }) {
    this.#connectionString = z.string().min(1).parse(options.connectionString);
    this.#operationTimeoutMs = z.number().int().min(1).max(30_000).parse(options.operationTimeoutMs ?? 3_000);
  }

  async #withClient<T>(signal: AbortSignal, work: (client: Client) => Promise<T>): Promise<T> {
    signal.throwIfAborted();
    const client = new Client({
      connectionString: this.#connectionString, application_name: "uaos-retrieval",
      connectionTimeoutMillis: 1_000, statement_timeout: 1_000, query_timeout: 1_500,
      lock_timeout: 500, idle_in_transaction_session_timeout: 1_500,
    });
    client.on("error", () => {});
    const disconnect = () => client.connection.stream.destroy();
    const timer = setTimeout(disconnect, this.#operationTimeoutMs);
    signal.addEventListener("abort", disconnect, { once: true });
    try {
      signal.throwIfAborted();
      await client.connect();
      signal.throwIfAborted();
      const result = await work(client);
      signal.throwIfAborted();
      return result;
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (error instanceof RetrievalBoundaryError) throw error;
      throw new RetrievalBoundaryError("REPOSITORY_FAILURE");
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", disconnect);
      await client.end().catch(() => {});
    }
  }

  async initialize(signal: AbortSignal): Promise<void> {
    await this.#withClient(signal, async (client) => {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(16843107)");
      await client.query(DDL);
      await client.query("COMMIT");
    });
  }

  async #checkManifest(client: Client, manifest: IndexManifest, lock = false): Promise<void> {
    const found = await client.query(`SELECT index_id, profile_id, dimensions, chunker FROM uaos_retrieval.indexes WHERE index_id=$1${lock ? " FOR UPDATE" : ""}`, [manifest.indexId]);
    const row = manifestRowSchema.safeParse(found.rows[0]);
    if (!row.success || row.data.profile_id !== manifest.embedding.id || row.data.dimensions !== manifest.embedding.dimensions ||
      row.data.chunker !== manifest.chunker) throw new RetrievalBoundaryError("INDEX_CONFIGURATION_MISMATCH");
  }

  async replaceDocument(rawManifest: IndexManifest, rawDocument: IndexedDocument,
    rawPassages: readonly IndexedPassage[], signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    const manifest = IndexManifestSchema.parse(rawManifest);
    const document = IndexedDocumentSchema.parse(rawDocument);
    const expected = prepareDocument(manifest, { documentId: document.documentId, title: document.title, content: document.content }, this.#identity);
    const entries = z.array(IndexedPassageSchema).min(1).max(4096).parse(rawPassages);
    if (document.revision !== expected.document.revision || entries.length !== expected.passages.length ||
      entries.some(({ passage, embedding }, index) => JSON.stringify(passage) !== JSON.stringify(expected.passages[index]) ||
        embedding.profile.id !== manifest.embedding.id || embedding.profile.dimensions !== manifest.embedding.dimensions)) {
      throw new RetrievalBoundaryError("DOCUMENT_INVALID");
    }
    await this.#withClient(signal, async (client) => {
      await client.query("BEGIN");
      // One immutable manifest row also serializes ingestion for this small teaching index.
      await client.query("INSERT INTO uaos_retrieval.indexes VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
        [manifest.indexId, manifest.embedding.id, manifest.embedding.dimensions, manifest.chunker]);
      await this.#checkManifest(client, manifest, true);
      const inserted = await client.query(`INSERT INTO uaos_retrieval.documents VALUES($1,$2,$3,$4,$5)
        ON CONFLICT DO NOTHING RETURNING revision`, [manifest.indexId, document.documentId, document.revision, document.title, document.content]);
      if (inserted.rowCount === 1) {
        for (const { passage, embedding } of entries) {
          signal.throwIfAborted();
          await client.query(`INSERT INTO uaos_retrieval.passages VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::public.vector)`,
            [manifest.indexId, document.documentId, document.revision, passage.passageId, passage.ordinal,
              passage.start, passage.end, passage.text, JSON.stringify(embedding.values)]);
        }
      } else {
        const retained = await client.query("SELECT title, content FROM uaos_retrieval.documents WHERE index_id=$1 AND document_id=$2 AND revision=$3",
          [manifest.indexId, document.documentId, document.revision]);
        if (retained.rows[0]?.title !== document.title || retained.rows[0]?.content !== document.content) throw new RetrievalBoundaryError("DOCUMENT_INVALID");
      }
      signal.throwIfAborted();
      await client.query(`INSERT INTO uaos_retrieval.active_documents VALUES($1,$2,$3)
        ON CONFLICT(index_id,document_id) DO UPDATE SET revision=EXCLUDED.revision`,
        [manifest.indexId, document.documentId, document.revision]);
      await client.query("COMMIT");
    });
  }

  async search(rawManifest: IndexManifest, rawEmbedding: Embedding, rawLimit: number,
    rawMinimumScore: number, signal: AbortSignal): Promise<unknown> {
    const manifest = IndexManifestSchema.parse(rawManifest);
    const embedding = EmbeddingSchema.parse(rawEmbedding);
    const limit = z.number().int().min(1).max(5).parse(rawLimit);
    const minimumScore = z.number().finite().min(-1).max(1).parse(rawMinimumScore);
    if (embedding.profile.id !== manifest.embedding.id || embedding.profile.dimensions !== manifest.embedding.dimensions) throw new RetrievalBoundaryError("INDEX_CONFIGURATION_MISMATCH");
    return this.#withClient(signal, async (client) => {
      await this.#checkManifest(client, manifest);
      const result = await client.query(`SELECT ${selectedPassageColumns}, d.content,
        GREATEST(-1.0, LEAST(1.0, 1 - (p.embedding <=> $2::public.vector))) AS score
        FROM uaos_retrieval.passages p
        JOIN uaos_retrieval.documents d USING(index_id,document_id,revision)
        JOIN uaos_retrieval.active_documents a USING(index_id,document_id,revision)
        WHERE p.index_id=$1 AND (1 - (p.embedding <=> $2::public.vector)) >= $3
        ORDER BY p.embedding <=> $2::public.vector, p.document_id COLLATE "C", p.ordinal LIMIT $4`,
        [manifest.indexId, JSON.stringify(embedding.values), minimumScore, limit]);
      const passages = result.rows.map(({ content, score, ...rawPassage }) => {
        const passage = this.#validateStoredPassage(rawPassage, content);
        return { ...passage, score };
      });
      return RetrievalOutputSchema.parse({ indexId: manifest.indexId, profileId: manifest.embedding.id, passages });
    });
  }

  async resolve(rawCitation: Citation, signal: AbortSignal): Promise<unknown> {
    const citation = CitationSchema.parse(rawCitation);
    return this.#withClient(signal, async (client) => {
      const result = await client.query(`SELECT ${selectedPassageColumns}, d.content FROM uaos_retrieval.passages p
        JOIN uaos_retrieval.documents d USING(index_id,document_id,revision)
        WHERE p.index_id=$1 AND p.document_id=$2 AND p.revision=$3 AND p.passage_id=$4 AND p.start_offset=$5 AND p.end_offset=$6`,
        [citation.indexId, citation.documentId, citation.revision, citation.passageId, citation.start, citation.end]);
      const row = result.rows[0];
      if (row === undefined) return null;
      const { content, ...rawPassage } = row;
      return this.#validateStoredPassage(rawPassage, content);
    });
  }

  #validateStoredPassage(rawPassage: unknown, content: unknown) {
    const passage = PassageSchema.parse(rawPassage);
    const expectedId = this.#identity.digest(JSON.stringify([
      passage.indexId, passage.documentId, passage.revision, "utf16-v1", passage.ordinal, passage.start, passage.end,
    ]));
    if (typeof content !== "string" || this.#identity.digest(content) !== passage.revision ||
      content.slice(passage.start, passage.end) !== passage.text || passage.passageId !== expectedId ||
      content.split("\n").find((line) => line.trim().length > 0)?.trim().match(/^#\s+(.+?)\s*$/u)?.[1]?.trim() !== passage.title) {
      throw new RetrievalBoundaryError("CITATION_INVALID");
    }
    return passage;
  }
}
