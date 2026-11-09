import type { ModelPort, ModelRequest } from "../../application/ports/model-port.js";
import { citationFor } from "../../application/grounded-answer.js";
import { RetrievalOutputSchema } from "../../domain/retrieval-contracts.js";
import type { ToolObservation } from "../../domain/tool-contracts.js";
import type { TurnContext } from "../../application/ports/turn-execution-port.js";

export class GroundedTeachingModel implements ModelPort<ToolObservation> {
  constructor(private readonly context?: TurnContext) {}

  async request(input: ModelRequest<ToolObservation>, signal: AbortSignal): Promise<unknown> {
    signal.throwIfAborted();
    if (input.state === "awaiting_tool") {
      let query = input.question;
      if (this.context && query === "again") query = this.context.history.at(-1)?.question ?? "!!!";
      if (this.context && query.startsWith("memory:")) query = this.context.memories.find(({ key }) => key === query.slice(7))?.value ?? "!!!";
      return { type: "call_tool", toolName: "retrieve_passages", arguments: { query, limit: 3 } };
    }
    const evidence = RetrievalOutputSchema.parse(input.toolResult.output);
    const grounding = evidence.passages.length === 0
      ? { version: "1.0", status: "abstained", reason: "no_evidence", claims: [] }
      : { version: "1.0", status: "answered", claims: evidence.passages.slice(0, 3).map((passage) => ({ quote: passage.text, citation: citationFor(passage) })) };
    return { type: "grounded_answer", grounding };
  }
}
