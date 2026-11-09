import { z } from "zod";

import { ReadDocInputSchema, ToolCallContextSchema } from "./tool-contracts.js";

export const MCP_PROTOCOL_VERSION = "2026-07-28";
export const MCP_SERVER_ID = "uaos-docs";
export const MCP_REMOTE_TOOL_NAME = "read_doc";
export const MCP_TOOL_ALIAS = "mcp_read_doc";
export const MCP_MAX_RESULT_BYTES = 65_536;

export const McpConsentSchema = z.strictObject({
  serverId: z.literal(MCP_SERVER_ID),
  toolName: z.literal(MCP_REMOTE_TOOL_NAME),
  granted: z.literal(true),
});
export type McpConsent = z.infer<typeof McpConsentSchema>;

export const McpDiscoverySchema = z.strictObject({
  era: z.literal("modern"),
  protocolVersion: z.literal(MCP_PROTOCOL_VERSION),
  serverId: z.literal(MCP_SERVER_ID),
  serverVersion: z.literal("1.0.0"),
  supportsTools: z.literal(true),
});
export type McpDiscovery = z.infer<typeof McpDiscoverySchema>;

export const McpReadCallSchema = z.strictObject({
  name: z.literal(MCP_REMOTE_TOOL_NAME),
  arguments: ReadDocInputSchema,
  context: ToolCallContextSchema,
});
export type McpReadCall = z.infer<typeof McpReadCallSchema>;

export const McpBoundaryCodeSchema = z.enum([
  "MCP_CONSENT_REQUIRED",
  "MCP_CONTEXT_INVALID",
  "MCP_NEGOTIATION_FAILED",
  "MCP_METADATA_INVALID",
  "MCP_ARGUMENTS_INVALID",
  "MCP_RESULT_INVALID",
  "MCP_TRANSPORT_FAILED",
]);
export type McpBoundaryCode = z.infer<typeof McpBoundaryCodeSchema>;

export class McpBoundaryError extends Error {
  readonly code: McpBoundaryCode;

  constructor(code: McpBoundaryCode) {
    super("The MCP boundary rejected the operation.");
    this.name = "McpBoundaryError";
    this.code = code;
  }
}
