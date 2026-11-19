import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { createLocalDocumentLibrary } from "../../src/composition/create-document-library.js";
import { createRetrievalResources } from "../../src/composition/create-retrieval-resources.js";
import { UploadPreviewSchema, LibraryDocumentSchema, LibraryListSchema } from "../../src/domain/document-library-contracts.js";
import { PassageSchema, RetrievalOutputSchema } from "../../src/domain/retrieval-contracts.js";

const databaseUrl = process.env.UAOS_TEST_DATABASE_URL;
if (!databaseUrl || !process.env.UAOS_TEST_DATABASE_OWNER) throw new Error("Use the owned database runner");
const signal = () => AbortSignal.timeout(10000);
const file = (text = "# Nebula recovery\n\nNebula recovery code is ORBIT-42.\n", fileName = "recovery.md") => ({ fileName, base64: Buffer.from(text).toString("base64") });
const options = () => ({ databaseUrl, indexId: `upload-test-${randomUUID()}` });

describe("Real document library transactions", () => {
  it("previews without persistence, publishes once under concurrency and survives fresh runtime", async () => {
    const config = options(), library = await createLocalDocumentLibrary(config);
    const preview = UploadPreviewSchema.parse(library.preview(file()));
    expect(await library.list(signal())).toEqual([]);
    const confirmation = { ...file(), revision: preview.document.revision };
    await Promise.all([library.confirm(confirmation, signal()), library.confirm(confirmation, signal())]);
    const fresh = await createLocalDocumentLibrary(config), list = LibraryListSchema.parse(await fresh.list(signal()));
    expect(list).toHaveLength(1); expect(list[0]?.active).toBe(true);
    const stored = LibraryDocumentSchema.parse(await fresh.read({ documentId: preview.document.documentId }, signal()));
    expect(stored.content).toBe(preview.document.content); expect(stored.original).toEqual(file());
    await fresh.confirm({ ...file(undefined, "renamed.md"), revision: preview.document.revision }, signal());
    expect(await fresh.list(signal())).toHaveLength(1);
  });
  it("searches confirmed content, disables only new retrieval and keeps exact old citations", async () => {
    const config = options(), library = await createLocalDocumentLibrary(config), resources = createRetrievalResources(config);
    const preview = UploadPreviewSchema.parse(library.preview(file()));
    await library.confirm({ ...file(), revision: preview.document.revision }, signal());
    const vector = await resources.embeddings.embed("Nebula recovery", signal());
    const found = RetrievalOutputSchema.parse(await resources.repository.search(resources.manifest, vector as never, 3, 0.15, signal()));
    expect(found.passages).toHaveLength(1);
    const { score: _score, title: _title, ordinal: _ordinal, text: _text, ...citation } = found.passages[0]!;
    await library.disable({ documentId: preview.document.documentId }, signal());
    const empty = RetrievalOutputSchema.parse(await resources.repository.search(resources.manifest, vector as never, 3, 0.15, signal()));
    expect(empty.passages).toHaveLength(0);
    expect(PassageSchema.parse(await resources.repository.resolve(citation, signal())).text).toBe(preview.document.content);
    expect(LibraryListSchema.parse(await library.list(signal()))[0]?.active).toBe(false);
    await library.confirm({ ...file(), revision: preview.document.revision }, signal());
    expect(LibraryListSchema.parse(await library.list(signal()))[0]?.active).toBe(true);
  });
  it("rolls back original, passages and active pointer on failed publication", async () => {
    const config = options(), library = await createLocalDocumentLibrary(config), preview = UploadPreviewSchema.parse(library.preview(file()));
    const client = new Client({ connectionString: databaseUrl }); await client.connect();
    // Unique index-filtered trigger cannot affect other test fixtures.
    const name = `reject_upload_${randomUUID().replaceAll("-", "")}`;
    try {
      await client.query(`CREATE FUNCTION uaos_retrieval.${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.index_id='${config.indexId}' THEN RAISE EXCEPTION 'fixture failure'; END IF; RETURN NEW; END $$`);
      await client.query(`CREATE TRIGGER ${name} BEFORE INSERT ON uaos_retrieval.uploads FOR EACH ROW EXECUTE FUNCTION uaos_retrieval.${name}()`);
      await expect(library.confirm({ ...file(), revision: preview.document.revision }, signal())).rejects.toThrow();
      for (const table of ["uploads", "passages", "active_documents", "documents"]) {
        expect((await client.query(`SELECT count(*) AS count FROM uaos_retrieval.${table} WHERE index_id=$1`, [config.indexId])).rows[0].count).toBe("0");
      }
    } finally { await client.query(`DROP TRIGGER IF EXISTS ${name} ON uaos_retrieval.uploads`); await client.query(`DROP FUNCTION IF EXISTS uaos_retrieval.${name}()`); await client.end(); }
  });
});
