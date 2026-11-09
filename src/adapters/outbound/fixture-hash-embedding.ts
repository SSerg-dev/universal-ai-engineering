import { createHash } from "node:crypto";

import type { EmbeddingPort } from "../../application/ports/embedding-port.js";
import { EmbeddingSchema } from "../../domain/retrieval-contracts.js";

// Lexical feature hashing for plumbing/reproducibility, not a semantic embedding model.
export class FixtureHashEmbedding implements EmbeddingPort {
  readonly profile = Object.freeze({ id: "fixture-hash-512-v1", dimensions: 512 });

  async embed(text: string, signal: AbortSignal): Promise<unknown> {
    signal.throwIfAborted();
    const terms = text.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    if (terms.length === 0) return null;
    const values = Array<number>(this.profile.dimensions).fill(0);
    for (const term of terms) {
      const bucket = createHash("sha256").update(term, "utf8").digest().readUInt32BE(0) % values.length;
      values[bucket] = values[bucket]! + 1;
    }
    const norm = Math.hypot(...values);
    signal.throwIfAborted();
    return EmbeddingSchema.parse({ profile: this.profile, values: values.map((value) => value / norm) });
  }
}
