import { FixtureHashEmbedding } from "../adapters/outbound/fixture-hash-embedding.js";
import { PostgresPassageRepository } from "../adapters/outbound/postgres-passage-repository.js";
import { Sha256ContentIdentity } from "../adapters/outbound/sha256-content-identity.js";
import { IndexManifestSchema } from "../domain/retrieval-contracts.js";

export interface RetrievalResourceOptions {
  readonly databaseUrl?: unknown;
  readonly indexId?: unknown;
}

export function createRetrievalResources(options: RetrievalResourceOptions) {
  if (typeof options.databaseUrl !== "string" || options.databaseUrl.trim().length === 0) {
    throw new Error("The retrieval database is not configured.");
  }
  const embeddings = new FixtureHashEmbedding();
  const manifest = IndexManifestSchema.parse({
    indexId: options.indexId ?? "course-docs-v1", embedding: embeddings.profile, chunker: "utf16-v1",
  });
  return {
    manifest, embeddings, identity: new Sha256ContentIdentity(),
    repository: new PostgresPassageRepository({ connectionString: options.databaseUrl }),
  };
}
