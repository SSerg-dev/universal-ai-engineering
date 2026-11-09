import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  MCP_PROTOCOL_VERSION,
  McpBoundaryCodeSchema,
  McpBoundaryError,
  McpConsentSchema,
  McpDiscoverySchema,
  McpReadCallSchema,
} from "../../src/domain/mcp-contracts.js";
import { ToolCallContextSchema } from "../../src/domain/tool-contracts.js";
import { defineTool, ToolRegistry } from "../../src/application/tool-registry.js";

const context = { runId: "run-1", callId: "tool-1" };
const consent = { serverId: "uaos-docs", toolName: "read_doc", granted: true };
const discovery = {
  era: "modern", protocolVersion: MCP_PROTOCOL_VERSION,
  serverId: "uaos-docs", serverVersion: "1.0.0", supportsTools: true,
};

describe("MCP boundary contracts", () => {
  it("requires exact explicit consent without trusting an annotation", () => {
    expect(McpConsentSchema.parse(consent)).toEqual(consent);
    for (const value of [undefined, {}, { ...consent, granted: false },
      { ...consent, serverId: "another-server" }, { ...consent, toolName: "write_doc" },
      { serverId: "uaos-docs", toolName: "read_doc", annotations: { readOnlyHint: true } }]) {
      expect(McpConsentSchema.safeParse(value).success).toBe(false);
    }
  });

  it.each([
    { ...discovery, era: "legacy" },
    { ...discovery, protocolVersion: "2025-11-25" },
    { ...discovery, serverId: "untrusted" },
    { ...discovery, supportsTools: false },
  ])("rejects incompatible discovery %j", (value) => {
    expect(McpDiscoverySchema.safeParse(value).success).toBe(false);
    expect(McpDiscoverySchema.parse(discovery)).toEqual(discovery);
  });

  it("keeps correlation opaque, strict, and independent from question content", () => {
    expect(ToolCallContextSchema.parse(context)).toEqual(context);
    for (const value of [{ ...context, runId: "../escape" }, { ...context, callId: "" },
      { ...context, question: "secret" }, { ...context, callId: "x".repeat(129) }]) {
      expect(ToolCallContextSchema.safeParse(value).success).toBe(false);
    }
    expect(McpReadCallSchema.parse({ name: "read_doc", arguments: { documentId: " a " }, context })).toEqual({
      name: "read_doc", arguments: { documentId: "a" }, context,
    });
    expect(McpReadCallSchema.safeParse({ name: "write_doc", arguments: {}, context }).success).toBe(false);
  });

  it("forwards correlation through registration while retaining stand-alone two-argument handlers", async () => {
    const execute = vi.fn(async () => "value");
    const registry = new ToolRegistry([defineTool({
      name: "read_doc", description: "Context propagation",
      inputSchema: z.unknown(), outputSchema: z.string(), execute,
    })]);
    const signal = new AbortController().signal;
    const options = { allowedTools: new Set(["read_doc"]), timeoutMs: 100, signal };
    await registry.invoke({ toolName: "read_doc", arguments: {} }, options);
    expect(execute.mock.calls[0]).toHaveLength(2);
    await registry.invoke({ toolName: "read_doc", arguments: {} }, { ...options, context });
    expect(execute).toHaveBeenLastCalledWith({}, expect.any(AbortSignal), context);
  });

  it("exposes only host-owned boundary codes and a static error message", () => {
    for (const code of McpBoundaryCodeSchema.options) {
      const error = new McpBoundaryError(code);
      expect(error.code).toBe(code);
      expect(error.message).toBe("The MCP boundary rejected the operation.");
      expect(error.cause).toBeUndefined();
    }
  });
});
