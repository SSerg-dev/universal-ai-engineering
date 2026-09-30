import type { ModelPort, ModelRequest } from "../../application/ports/model-port.js";

const TEACHING_ANSWER =
  "The typed agent loop records ordered execution evidence around model and search actions.";

/**
 * Local, offline teaching behavior for the Phase 1 walkthrough.
 * It is deliberately not an external model-provider integration.
 */
export class DeterministicTeachingModel implements ModelPort {
  async request(input: ModelRequest, signal: AbortSignal): Promise<unknown> {
    signal.throwIfAborted();

    if (input.state === "awaiting_tool") {
      return {
        type: "call_tool",
        toolName: "search_docs",
        arguments: { query: input.question, limit: 3 },
      };
    }

    return {
      type: "final_answer",
      answer: TEACHING_ANSWER,
      sourceIds: input.toolResult.matches
        .slice(0, 2)
        .map(({ documentId }) => documentId),
    };
  }
}
