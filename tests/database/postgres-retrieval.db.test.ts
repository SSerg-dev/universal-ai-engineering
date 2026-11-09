import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { beforeAll, describe, expect, it } from "vitest";

import { PostgresPassageRepository } from "../../src/adapters/outbound/postgres-passage-repository.js";
import { FixtureHashEmbedding } from "../../src/adapters/outbound/fixture-hash-embedding.js";
import { Sha256ContentIdentity } from "../../src/adapters/outbound/sha256-content-identity.js";
import { createIngestDocument, prepareDocument } from "../../src/application/ingest-document.js";
import { createRetrievePassages } from "../../src/application/retrieve-passages.js";
import { EmbeddingSchema, PassageSchema, RetrievalOutputSchema, type Citation } from "../../src/domain/retrieval-contracts.js";

const connectionString = process.env.UAOS_TEST_DATABASE_URL;
if (!connectionString || !process.env.UAOS_TEST_DATABASE_OWNER) throw new Error("Use npm run test:database for an owned disposable database");
const repo = new PostgresPassageRepository({ connectionString });
const embeddings = new FixtureHashEmbedding();
const identity = new Sha256ContentIdentity();
const signal = () => new AbortController().signal;
const manifest = () => ({ indexId: `test-${randomUUID()}`, embedding: embeddings.profile, chunker: "utf16-v1" } as const);
const source = { documentId: "journal", title: "Journal", content: "# Journal\n\nJournal evidence is durable and ordered.\n" };
const citationFor = (passage: ReturnType<typeof prepareDocument>["passages"][number]): Citation => ({
  indexId: passage.indexId, documentId: passage.documentId, revision: passage.revision,
  passageId: passage.passageId, start: passage.start, end: passage.end,
});
async function admin<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString, connectionTimeoutMillis: 1000, statement_timeout: 2000 });
  try { await client.connect(); return await work(client); } finally { await client.end(); }
}

beforeAll(async () => { await repo.initialize(signal()); });

describe("Real PostgreSQL/pgvector repository", () => {
  it("ingests idempotently, retrieves ranked passages, and resolves exact text", async () => {
    const selected = manifest();
    const ingest = createIngestDocument({ manifest: selected, identity, embeddings, repository: repo });
    const first = await ingest(source, signal());
    expect(await ingest(source, signal())).toEqual(first);
    const result = await createRetrievePassages({ manifest: selected, embeddings, repository: repo, minimumScore: 0.1 })({ query: "durable ordered" }, signal());
    expect(result.passages).toHaveLength(1);
    const hit = result.passages[0]!;
    expect(hit.text).toBe(source.content);
    expect(await repo.resolve(citationFor(hit), signal())).toEqual(PassageSchema.parse({ ...prepareDocument(selected, source, identity).passages[0] }));
    const count = await admin((client) => client.query("SELECT count(*)::integer AS count FROM uaos_retrieval.passages WHERE index_id=$1", [selected.indexId]));
    expect(count.rows[0]?.count).toBe(1);
  });

  it("searches only the new revision while old citations still resolve", async () => {
    const selected = manifest();
    const ingest = createIngestDocument({ manifest: selected, identity, embeddings, repository: repo });
    await ingest(source, signal());
    const old = prepareDocument(selected, source, identity).passages[0]!;
    const updated = { ...source, content: "# Journal\n\nChanged journal retention policy.\n" };
    await ingest(updated, signal());
    const result = await createRetrievePassages({ manifest: selected, embeddings, repository: repo, minimumScore: -1 })({ query: "journal" }, signal());
    expect(result.passages).toHaveLength(1);
    expect(result.passages[0]?.text).toBe(updated.content);
    expect(PassageSchema.parse(await repo.resolve(citationFor(old), signal())).text).toBe(source.content);
    expect(await repo.resolve({ ...citationFor(old), end: old.end - 1 }, signal())).toBeNull();
  });

  it("rejects embedding-profile changes for an existing index", async () => {
    const selected = manifest();
    await createIngestDocument({ manifest: selected, identity, embeddings, repository: repo })(source, signal());
    const wrong = { ...selected, embedding: { ...selected.embedding, id: "changed-profile" } };
    const vector = EmbeddingSchema.parse(await embeddings.embed("journal", signal()));
    await expect(repo.search(wrong, { ...vector, profile: wrong.embedding }, 3, 0.1, signal()))
      .rejects.toMatchObject({ code: "INDEX_CONFIGURATION_MISMATCH" });
  });

  it("serializes concurrent replacements without exposing partial passage sets", async () => {
    const selected = manifest();
    const ingest = createIngestDocument({ manifest: selected, identity, embeddings, repository: repo });
    const second = { ...source, content: "# Journal\n\nConcurrent journal replacement.\n" };
    await Promise.all([ingest(source, signal()), ingest(second, signal())]);
    const result = await createRetrievePassages({ manifest: selected, embeddings, repository: repo, minimumScore: -1 })({ query: "journal" }, signal());
    expect(result.passages).toHaveLength(1);
    expect([source.content, second.content]).toContain(result.passages[0]?.text);
    for (const value of [source, second]) {
      expect(PassageSchema.parse(await repo.resolve(citationFor(prepareDocument(selected, value, identity).passages[0]!), signal())).text).toBe(value.content);
    }
  });

  it("rolls back a failed replacement and keeps the previous active revision", async () => {
    const selected = manifest();
    const ingest = createIngestDocument({ manifest: selected, identity, embeddings, repository: repo });
    await ingest(source, signal());
    // A test-only trigger fails after the new document row has been inserted.
    await admin((client) => client.query(`CREATE FUNCTION uaos_retrieval.reject_test_passage() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.body LIKE '%INJECTED_FAILURE%' THEN RAISE EXCEPTION 'fixture rejection'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_test_passage BEFORE INSERT ON uaos_retrieval.passages FOR EACH ROW EXECUTE FUNCTION uaos_retrieval.reject_test_passage();`));
    const updated = { ...source, content: "# Journal\nINJECTED_FAILURE\n" };
    try {
      await expect(ingest(updated, signal())).rejects.toMatchObject({ code: "REPOSITORY_FAILURE" });
      const rows = await admin((client) => client.query("SELECT revision FROM uaos_retrieval.documents WHERE index_id=$1", [selected.indexId]));
      expect(rows.rows).toEqual([{ revision: identity.digest(source.content) }]);
      const result = await createRetrievePassages({ manifest: selected, embeddings, repository: repo, minimumScore: -1 })({ query: "journal" }, signal());
      expect(result.passages[0]?.text).toBe(source.content);
    } finally {
      await admin((client) => client.query("DROP TRIGGER reject_test_passage ON uaos_retrieval.passages; DROP FUNCTION uaos_retrieval.reject_test_passage();"));
    }
  });

  it("treats SQL-shaped query text as data and isolates index identities", async () => {
    const first = manifest(); const other = manifest();
    const ingest = (selected: typeof first) => createIngestDocument({ manifest: selected, identity, embeddings, repository: repo });
    await ingest(first)(source, signal());
    await ingest(other)({ documentId: "private", title: "Private", content: "# Private\nPrivate fixture contents.\n" }, signal());
    const result = await createRetrievePassages({ manifest: first, embeddings, repository: repo, minimumScore: -1 })({ query: "'; DROP TABLE uaos_retrieval.documents; --" }, signal());
    expect(RetrievalOutputSchema.parse(result).passages.every(({ indexId }) => indexId === first.indexId)).toBe(true);
    expect(result.passages.map(({ documentId }) => documentId)).toEqual(["journal"]);
    const count = await admin((client) => client.query("SELECT count(*)::integer AS count FROM uaos_retrieval.documents WHERE index_id=$1", [other.indexId]));
    expect(count.rows[0]?.count).toBe(1);
  });

  it("orders equal vector distances by document ID and detects corrupted retained content", async () => {
    const selected = manifest();
    const ingest = createIngestDocument({ manifest: selected, identity, embeddings, repository: repo });
    await ingest({ ...source, documentId: "zeta" }, signal());
    await ingest({ ...source, documentId: "alpha" }, signal());
    const retrieve = createRetrievePassages({ manifest: selected, embeddings, repository: repo, minimumScore: -1 });
    const result = await retrieve({ query: "journal" }, signal());
    expect(result.passages.map(({ documentId }) => documentId)).toEqual(["alpha", "zeta"]);
    const citation = citationFor(result.passages[0]!);
    await admin((client) => client.query("UPDATE uaos_retrieval.passages SET body=$1 WHERE index_id=$2 AND passage_id=$3",
      [source.content.replace("durable", "altered"), selected.indexId, citation.passageId]));
    await expect(repo.resolve(citation, signal())).rejects.toMatchObject({ code: "CITATION_INVALID" });
    await expect(retrieve({ query: "journal" }, signal())).rejects.toMatchObject({ code: "CITATION_INVALID" });
  });

  it("cancels blocked SQL and releases the owned connection", async () => {
    const selected = manifest();
    await createIngestDocument({ manifest: selected, identity, embeddings, repository: repo })(source, signal());
    const lock = new Client({ connectionString, connectionTimeoutMillis: 1000, statement_timeout: 2000 });
    const caller = new AbortController();
    const reason = new Error("test caller cancellation");
    await lock.connect();
    try {
      await lock.query("BEGIN");
      await lock.query("LOCK TABLE uaos_retrieval.passages IN ACCESS EXCLUSIVE MODE");
      const pending = createRetrievePassages({ manifest: selected, embeddings, repository: repo, minimumScore: -1 })({ query: "journal" }, caller.signal);
      const rejection = expect(pending).rejects.toBe(reason);
      const deadline = Date.now() + 1000;
      while (true) {
        const waiting = await lock.query("SELECT count(*)::integer AS count FROM pg_stat_activity WHERE application_name='uaos-retrieval' AND wait_event_type='Lock'");
        if (waiting.rows[0]?.count > 0) break;
        if (Date.now() > deadline) throw new Error("Fixture query did not block");
        await new Promise((resolve) => setTimeout(resolve, 10));
        await lock.query("SELECT pg_stat_clear_snapshot()");
      }
      caller.abort(reason);
      await rejection;
      await lock.query("ROLLBACK");
      const cleanupDeadline = Date.now() + 1000;
      while (true) {
        await lock.query("SELECT pg_stat_clear_snapshot()");
        const remaining = await lock.query("SELECT count(*)::integer AS count FROM pg_stat_activity WHERE application_name='uaos-retrieval'");
        if (remaining.rows[0]?.count === 0) break;
        if (Date.now() >= cleanupDeadline) throw new Error("Cancelled database backend did not close");
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    } finally {
      caller.abort(reason);
      await lock.end();
    }
  });
});
