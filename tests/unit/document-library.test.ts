import { describe, expect, it, vi } from "vitest";
import { decodeUpload } from "../../src/adapters/outbound/decode-upload.js";
import { Sha256ContentIdentity } from "../../src/adapters/outbound/sha256-content-identity.js";
import { FixtureHashEmbedding } from "../../src/adapters/outbound/fixture-hash-embedding.js";
import { createDocumentLibrary, prepareUpload } from "../../src/application/document-library.js";
import { UploadPreviewSchema } from "../../src/domain/document-library-contracts.js";

const identity = new Sha256ContentIdentity(), embeddings = new FixtureHashEmbedding();
const manifest = { indexId: "uploads", embedding: embeddings.profile, chunker: "utf16-v1" } as const;
const file = (text = "# Nebula\n\nNebula recovery code is ORBIT-42.", fileName = "nebula.md") => ({ fileName, base64: Buffer.from(text).toString("base64") });
const prepare = (raw: unknown) => { const decoded = decodeUpload(raw); return prepareUpload(decoded.file, decoded.text, decoded.bytes, manifest, identity); };

describe("Explicit document preparation and confirmation", () => {
  it("preserves original bytes separately and previews canonical LF text", () => {
    const source = file("\uFEFF# Nebula\r\n\r\nRecovery\r\n"), decoded = decodeUpload(source);
    const result = prepare(source);
    expect(decoded.text).toContain("\r\n"); expect(result.document.content).toBe("# Nebula\n\nRecovery\n");
    expect(result.document.documentId).toBe(`upload-${identity.digest(result.document.content)}`);
  });
  it("accepts TXT and headingless Markdown and exposes its generated heading", () => {
    expect(prepare(file("Nebula recovery\nUse ORBIT-42.", "notes.txt")).document.content).toBe("# Nebula recovery\n\nNebula recovery\nUse ORBIT-42.");
    expect(prepare(file("Recovery notes", "notes.md")).document.title).toBe("Recovery notes");
  });
  it.each([file("", "empty.txt"), file(" \n", "blank.md"), file("bad\0text"), file("Hello", "../notes.md"), file("Hello", "notes.pdf"), file("a".repeat(64000), "large.txt"), { fileName: "bad.md", base64: "/w==" }, { fileName: "bad.md", base64: "!!!!" }, file("x".repeat(262145), "too-big.txt")])("rejects invalid original without a searchable write %#", (raw) => {
    expect(() => prepare(raw)).toThrow();
  });
  it("deduplicates canonical text independently of uploaded filename", () => {
    expect(prepare(file()).document).toEqual(prepare(file(undefined, "renamed.md")).document);
  });
  it("does no storage work on preview and rejects changed confirmation", async () => {
    const publishUpload = vi.fn(), store = { publishUpload, listUploads: vi.fn(), readUpload: vi.fn(), disableUpload: vi.fn() };
    const repository = { replaceDocument: vi.fn(), search: vi.fn(), resolve: vi.fn() };
    const library = createDocumentLibrary({ manifest, identity, embeddings, repository, store, decode: decodeUpload });
    const draft = UploadPreviewSchema.parse(library.preview(file()));
    expect(publishUpload).not.toHaveBeenCalled();
    await expect(library.confirm({ ...file("# Changed\n\nDifferent"), revision: draft.document.revision }, AbortSignal.timeout(1000))).rejects.toMatchObject({ code: "UPLOAD_CONFIRMATION_MISMATCH" });
    expect(publishUpload).not.toHaveBeenCalled();
    await library.confirm({ ...file(), revision: draft.document.revision }, AbortSignal.timeout(1000));
    expect(publishUpload).toHaveBeenCalledTimes(1); expect(repository.replaceDocument).not.toHaveBeenCalled();
  });
  it("does not publish an unembeddable source or a cancelled operation", async () => {
    const store = { publishUpload: vi.fn(), listUploads: vi.fn(), readUpload: vi.fn(), disableUpload: vi.fn() };
    const repository = { replaceDocument: vi.fn(), search: vi.fn(), resolve: vi.fn() };
    const library = createDocumentLibrary({ manifest, identity, embeddings, repository, store, decode: decodeUpload });
    const raw = file("!!!", "punctuation.txt"), draft = UploadPreviewSchema.parse(library.preview(raw));
    await expect(library.confirm({ ...raw, revision: draft.document.revision }, AbortSignal.timeout(1000))).rejects.toThrow();
    const valid = UploadPreviewSchema.parse(library.preview(file()));
    await expect(library.confirm({ ...file(), revision: valid.document.revision }, AbortSignal.abort())).rejects.toThrow();
    expect(store.publishUpload).not.toHaveBeenCalled();
  });
});
