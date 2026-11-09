import type { ModelPort, ModelRequest } from "../../application/ports/model-port.js";
import { SearchDocsOutputSchema } from "../../domain/agent-contracts.js";
import { ReadDocOutputSchema, type ToolObservation } from "../../domain/tool-contracts.js";

export class RegisteredTeachingModel implements ModelPort<ToolObservation> {
  async request(input: ModelRequest<ToolObservation>, signal: AbortSignal): Promise<unknown> {
    signal.throwIfAborted();
    if (input.state === "awaiting_tool") {
      return input.question.startsWith("doc:")
        ? { type: "call_tool", toolName: "read_doc", arguments: { documentId: input.question.slice(4).trim() } }
        : { type: "call_tool", toolName: "search_docs", arguments: { query: input.question, limit: 3 } };
    }

    const { toolName, output, sources } = input.toolResult;
    let answer: string;
    if (toolName === "read_doc") {
      const { document } = ReadDocOutputSchema.parse(output);
      answer = document?.content ?? "No document matches that ID.";
    } else {
      const { matches } = SearchDocsOutputSchema.parse(output);
      answer = matches.length === 0
        ? "No matching documentation was found."
        : matches.map(({ excerpt, title }) => excerpt || title).join("\n");
    }
    return { type: "final_answer", answer, sourceIds: sources.map(({ documentId }) => documentId) };
  }
}
