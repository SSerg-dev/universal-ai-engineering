import type { ModelPort, ModelRequest } from "../../application/ports/model-port.js";
import { MCP_TOOL_ALIAS } from "../../domain/mcp-contracts.js";
import { ReadDocOutputSchema, type ToolObservation } from "../../domain/tool-contracts.js";

export class McpTeachingModel implements ModelPort<ToolObservation> {
  async request(input: ModelRequest<ToolObservation>, signal: AbortSignal): Promise<unknown> {
    signal.throwIfAborted();
    if (input.state === "awaiting_tool") {
      const documentId = input.question.startsWith("doc:") ? input.question.slice(4).trim() : input.question;
      return { type: "call_tool", toolName: MCP_TOOL_ALIAS, arguments: { documentId } };
    }
    const { document } = ReadDocOutputSchema.parse(input.toolResult.output);
    return {
      type: "final_answer",
      answer: document?.content ?? "No document matches that ID.",
      sourceIds: input.toolResult.sources.map(({ documentId }) => documentId),
    };
  }
}
