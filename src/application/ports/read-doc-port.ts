import type { ReadDocInput, ReadDocOutput } from "../../domain/tool-contracts.js";

export interface ReadDocPort {
  read(input: ReadDocInput, signal: AbortSignal): Promise<ReadDocOutput>;
}
