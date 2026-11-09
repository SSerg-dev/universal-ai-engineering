import type { ModelPort, ModelRequest } from "../../application/ports/model-port.js";
import { citationFor } from "../../application/grounded-answer.js";
import { RetrievalOutputSchema } from "../../domain/retrieval-contracts.js";
import type { ToolObservation } from "../../domain/tool-contracts.js";

export class GroundedTeachingModel implements ModelPort<ToolObservation> {
  async request(input: ModelRequest<ToolObservation>, signal: AbortSignal): Promise<unknown> {
    signal.throwIfAborted();
    if (input.state === "awaiting_tool") {
      return { type: "call_tool", toolName: "retrieve_passages", arguments: { query: input.question, limit: 3 } };
    }
    const evidence = RetrievalOutputSchema.parse(input.toolResult.output);
    const grounding = evidence.passages.length === 0
      ? { version: "1.0", status: "abstained", reason: "no_evidence", claims: [] }
      : { version: "1.0", status: "answered", claims: evidence.passages.slice(0, 3).map((passage) => ({ quote: passage.text, citation: citationFor(passage) })) };
    return { type: "grounded_answer", grounding };
  }
}
