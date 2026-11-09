import { describe, expect, it, vi } from "vitest";

import { createIngestDocument, prepareDocument } from "../../src/application/ingest-document.js";
import { createRetrievePassages } from "../../src/application/retrieve-passages.js";
import { FixtureHashEmbedding } from "../../src/adapters/outbound/fixture-hash-embedding.js";
import { Sha256ContentIdentity } from "../../src/adapters/outbound/sha256-content-identity.js";
import type { PassageRepositoryPort } from "../../src/application/ports/passage-repository-port.js";

const identity = new Sha256ContentIdentity();
const embeddings = new FixtureHashEmbedding();
const manifest = { indexId: "course-v1", embedding: embeddings.profile, chunker: "utf16-v1" } as const;
const source = { documentId: "journal", title: "Journal", content: "# Journal\n\nThe journal keeps ordered evidence.\n" };
const signal = () => new AbortController().signal;
const repository = () => ({
  replaceDocument: vi.fn<PassageRepositoryPort["replaceDocument"]>(async () => {}),
  search: vi.fn<PassageRepositoryPort["search"]>(async () => ({ indexId: manifest.indexId, profileId: embeddings.profile.id, passages: [] })),
  resolve: vi.fn<PassageRepositoryPort["resolve"]>(async () => null),
});

describe("Controlled ingestion and retrieval", () => {
  it("canonicalizes newlines and produces stable full-coverage Unicode spans without splitting surrogates", () => {
    const content = "# Journal\r\n" + "x".repeat(1013) + "😀" + "z".repeat(1030) + "\r";
    const first = prepareDocument(manifest, { ...source, content }, identity);
    const repeated = prepareDocument(manifest, { ...source, content: content.replace(/\r\n?/gu, "\n") }, identity);
    expect(first).toEqual(repeated);
    expect(first.document.revision).toBe(identity.digest(first.document.content));
    expect(first.passages).toHaveLength(3);
    expect(first.passages.map(({ text }) => text).join("")).toBe(first.document.content);
    for (const [ordinal, passage] of first.passages.entries()) {
      expect(passage.ordinal).toBe(ordinal);
      expect(passage.text.isWellFormed()).toBe(true);
      expect(passage.text).toBe(first.document.content.slice(passage.start, passage.end));
      expect(passage.text.length).toBeLessThanOrEqual(1024);
    }
    expect(first.passages[0]?.end).toBe(1023);
  });

  it("rejects title substitution and malformed source text", () => {
    for (const candidate of [{ ...source, title: "Another" }, { ...source, content: "# Journal\n\uD800" },
      { ...source, documentId: "../../package" }, { ...source, content: "no heading" }]) {
      expect(() => prepareDocument(manifest, candidate, identity)).toThrowError(expect.objectContaining({ code: "DOCUMENT_INVALID" }));
    }
  });

  it("validates every embedding before one atomic repository call", async () => {
    const repo = repository();
    const ingest = createIngestDocument({ manifest, identity, embeddings, repository: repo });
    const result = await ingest(source, signal());
    expect(result.passageCount).toBe(1);
    expect(repo.replaceDocument).toHaveBeenCalledTimes(1);
    expect(repo.replaceDocument.mock.calls[0]?.[2][0]?.embedding.profile).toEqual(embeddings.profile);
  });

  it("performs no repository write on invalid or failed embedding", async () => {
    for (const embed of [async () => ({ profile: embeddings.profile, values: [0] }), async () => { throw new Error("secret provider data"); }]) {
      const repo = repository();
      const ingest = createIngestDocument({ manifest, identity, embeddings: { profile: embeddings.profile, embed }, repository: repo });
      await expect(ingest(source, signal())).rejects.toMatchObject({ code: "EMBEDDING_INVALID", message: "The retrieval boundary rejected the operation." });
      expect(repo.replaceDocument).not.toHaveBeenCalled();
    }
  });

  it("rejects configuration mismatch before provider or repository work", async () => {
    const embed = vi.fn(async () => null);
    const repo = repository();
    const wrong = { profile: { id: "another", dimensions: 512 }, embed };
    await expect(createIngestDocument({ manifest, identity, embeddings: wrong, repository: repo })(source, signal()))
      .rejects.toMatchObject({ code: "INDEX_CONFIGURATION_MISMATCH" });
    await expect(createRetrievePassages({ manifest, embeddings: wrong, repository: repo, minimumScore: 0.1 })({ query: "journal" }, signal()))
      .rejects.toMatchObject({ code: "INDEX_CONFIGURATION_MISMATCH" });
    expect(embed).not.toHaveBeenCalled();
    expect(repo.search).not.toHaveBeenCalled();
  });

  it("returns empty evidence for a zero-information query without querying the database", async () => {
    const repo = repository();
    const retrieve = createRetrievePassages({ manifest, embeddings, repository: repo, minimumScore: 0.1 });
    expect(await retrieve({ query: "!!!" }, signal())).toMatchObject({ passages: [] });
    expect(repo.search).not.toHaveBeenCalled();
  });

  it("passes explicit profile, limit, threshold, and signal to retrieval", async () => {
    const repo = repository();
    const caller = signal();
    await createRetrievePassages({ manifest, embeddings, repository: repo, minimumScore: 0.2 })({ query: "journal", limit: 2 }, caller);
    expect(repo.search).toHaveBeenCalledExactlyOnceWith(manifest, expect.objectContaining({ profile: embeddings.profile }), 2, 0.2, caller);
  });

  it("rejects malformed, cross-profile, excessive, and below-threshold returned evidence", async () => {
    const passage = { ...prepareDocument(manifest, source, identity).passages[0]!, score: 0.3 };
    const base = { indexId: manifest.indexId, profileId: embeddings.profile.id, passages: [passage] };
    for (const raw of [{ ...base, profileId: "another" }, { ...base, passages: [{ ...passage, score: 0 }] },
      { ...base, passages: [passage, { ...passage, passageId: "c".repeat(64) }] }, { unexpected: "secret" }]) {
      const repo = repository(); repo.search.mockResolvedValueOnce(raw);
      await expect(createRetrievePassages({ manifest, embeddings, repository: repo, minimumScore: 0.2 })({ query: "journal", limit: 1 }, signal()))
        .rejects.toMatchObject({ code: "RETRIEVAL_INVALID" });
    }
  });

  it("preserves cancellation after embedding without writing or searching", async () => {
    const caller = new AbortController();
    const reason = new Error("caller stop");
    const fake = { profile: embeddings.profile, embed: async () => { caller.abort(reason); return null; } };
    const repo = repository();
    await expect(createIngestDocument({ manifest, identity, embeddings: fake, repository: repo })(source, caller.signal)).rejects.toBe(reason);
    expect(repo.replaceDocument).not.toHaveBeenCalled();
    await expect(createRetrievePassages({ manifest, embeddings, repository: repo, minimumScore: 0.1 })({ query: "journal" }, caller.signal)).rejects.toBe(reason);
    expect(repo.search).not.toHaveBeenCalled();
  });

  it("normalizes repository exceptions without returning their text", async () => {
    const repo = repository();
    repo.search.mockRejectedValueOnce(new Error("secret SQL connection string"));
    await expect(createRetrievePassages({ manifest, embeddings, repository: repo, minimumScore: 0.1 })({ query: "journal" }, signal()))
      .rejects.toMatchObject({ code: "REPOSITORY_FAILURE", message: "The retrieval boundary rejected the operation." });
  });
});
