import type { EmbeddingProfile } from "../../domain/retrieval-contracts.js";

export interface EmbeddingPort {
  readonly profile: EmbeddingProfile;
  embed(text: string, signal: AbortSignal): Promise<unknown>;
}
