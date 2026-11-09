import type { McpReadCall } from "../../domain/mcp-contracts.js";

export interface McpSessionPort {
  connect(signal: AbortSignal): Promise<unknown>;
  listTools(signal: AbortSignal): Promise<unknown>;
  callTool(input: McpReadCall, signal: AbortSignal): Promise<unknown>;
  close(): Promise<void>;
}

export type McpSessionFactory = () => McpSessionPort;
