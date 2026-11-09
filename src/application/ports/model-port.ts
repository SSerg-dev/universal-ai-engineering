import type { SearchDocsOutput } from "../../domain/agent-contracts.js";

export type ModelRequest<TObservation = SearchDocsOutput> =
  | {
      readonly state: "awaiting_tool";
      readonly question: string;
    }
  | {
      readonly state: "awaiting_final";
      readonly question: string;
      readonly toolResult: TObservation;
    };

export interface ModelPort<TObservation = SearchDocsOutput> {
  request(input: ModelRequest<TObservation>, signal: AbortSignal): Promise<unknown>;
}
