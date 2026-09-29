import type { SearchDocsOutput } from "../../domain/agent-contracts.js";

export type ModelRequest =
  | {
      readonly state: "awaiting_tool";
      readonly question: string;
    }
  | {
      readonly state: "awaiting_final";
      readonly question: string;
      readonly toolResult: SearchDocsOutput;
    };

export interface ModelPort {
  request(input: ModelRequest, signal: AbortSignal): Promise<unknown>;
}
