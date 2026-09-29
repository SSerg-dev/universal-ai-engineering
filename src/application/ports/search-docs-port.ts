import type {
  SearchDocsInput,
  SearchDocsOutput,
} from "../../domain/agent-contracts.js";

export interface SearchDocsPort {
  search(input: SearchDocsInput, signal: AbortSignal): Promise<SearchDocsOutput>;
}
