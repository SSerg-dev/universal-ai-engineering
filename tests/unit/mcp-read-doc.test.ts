import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { McpReadDocAdapter } from "../../src/adapters/outbound/mcp-read-doc.js";
import { MCP_CALL_META_KEY, MCP_PROTOCOL_VERSION, MCP_RUN_META_KEY } from "../../src/domain/mcp-contracts.js";
import { ReadDocInputSchema, ReadDocOutputSchema } from "../../src/domain/tool-contracts.js";

const consent = { serverId: "uaos-docs", toolName: "read_doc", granted: true };
const context = { runId: "run-1", callId: "tool-1" };
const input = { documentId: "execution-journal" };
const output = { document: { documentId: input.documentId, title: "Execution Journal", content: "Controlled text" } };
const signal = () => new AbortController().signal;

function toolMetadata() {
  return {
    name: "read_doc", inputSchema: z.toJSONSchema(ReadDocInputSchema), outputSchema: z.toJSONSchema(ReadDocOutputSchema),
    annotations: { readOnlyHint: true },
  };
}
function toolResult() {
  return {
    resultType: "complete", structuredContent: output,
    content: [{ type: "text", text: JSON.stringify(output) }],
    _meta: { [MCP_RUN_META_KEY]: context.runId, [MCP_CALL_META_KEY]: context.callId },
  };
}
function harness(grant: unknown = consent) {
  const peer = {
    connect: vi.fn(async (_signal: AbortSignal): Promise<unknown> => ({
      era: "modern", protocolVersion: MCP_PROTOCOL_VERSION, serverId: "uaos-docs", serverVersion: "1.0.0", supportsTools: true,
    })),
    listTools: vi.fn(async (_signal: AbortSignal): Promise<unknown> => ({ tools: [toolMetadata()] })),
    callTool: vi.fn(async (_input: unknown, _signal: AbortSignal): Promise<unknown> => toolResult()),
    close: vi.fn(async () => {}),
  };
  const createSession = vi.fn(() => peer);
  const adapter = new McpReadDocAdapter({ consent: grant, createSession });
  return { adapter, peer, createSession };
}

describe("MCP read boundary", () => {
  it("validates the capability and correlation before returning a controlled document", async () => {
    const { adapter, peer } = harness();
    const caller = signal();
    expect(await adapter.read(input, caller, context)).toEqual(output);
    expect(peer.connect).toHaveBeenCalledExactlyOnceWith(caller);
    expect(peer.callTool).toHaveBeenCalledExactlyOnceWith({ name: "read_doc", arguments: input, context }, caller);
    expect(peer.close).toHaveBeenCalledTimes(1);
  });

  it.each([null, false, {}, { ...consent, granted: false }, { ...consent, serverId: "another" },
    { ...consent, toolName: "delete_all" }, { annotations: { readOnlyHint: true } }])(
    "performs no session work without exact consent %j", async (grant) => {
      const { adapter, createSession } = harness(grant);
      await expect(adapter.read(input, signal(), context)).rejects.toMatchObject({ code: "MCP_CONSENT_REQUIRED" });
      expect(createSession).not.toHaveBeenCalled();
    },
  );

  it("rejects missing context and invalid arguments before constructing a session", async () => {
    const { adapter, createSession } = harness();
    await expect(adapter.read(input, signal())).rejects.toMatchObject({ code: "MCP_CONTEXT_INVALID" });
    await expect(adapter.read({ documentId: " " }, signal(), context)).rejects.toMatchObject({ code: "MCP_ARGUMENTS_INVALID" });
    expect(createSession).not.toHaveBeenCalled();
  });

  it("rejects incompatible discovery before listing or calling tools", async () => {
    const { adapter, peer } = harness();
    peer.connect.mockResolvedValueOnce({ era: "legacy", protocolVersion: "2025-11-25" });
    await expect(adapter.read(input, signal(), context)).rejects.toMatchObject({ code: "MCP_NEGOTIATION_FAILED" });
    expect(peer.listTools).not.toHaveBeenCalled();
    expect(peer.callTool).not.toHaveBeenCalled();
    expect(peer.close).toHaveBeenCalledTimes(1);
  });

  it.each([
    { tools: [] },
    { tools: [toolMetadata(), toolMetadata()] },
    { tools: [{ ...toolMetadata(), inputSchema: { type: "object", additionalProperties: true } }] },
    { tools: [{ ...toolMetadata(), inputSchema: { $ref: "https://untrusted.invalid/schema" } }] },
    { tools: [{ name: "read_doc", inputSchema: {} }] },
    { tools: [toolMetadata()], ignored: "x".repeat(66_000) },
  ])("rejects altered or oversized metadata without invocation", async (metadata) => {
    const { adapter, peer } = harness();
    peer.listTools.mockResolvedValueOnce(metadata);
    await expect(adapter.read(input, signal(), context)).rejects.toMatchObject({ code: "MCP_METADATA_INVALID" });
    expect(peer.callTool).not.toHaveBeenCalled();
    expect(peer.close).toHaveBeenCalledTimes(1);
  });

  it("ignores unrelated capabilities instead of exposing them", async () => {
    const { adapter, peer } = harness();
    peer.listTools.mockResolvedValueOnce({ tools: [
      { name: "delete_all", inputSchema: {}, annotations: { readOnlyHint: true } }, toolMetadata(),
    ] });
    expect(await adapter.read(input, signal(), context)).toEqual(output);
    expect(peer.callTool.mock.calls[0]?.[0]).toMatchObject({ name: "read_doc" });
  });

  it.each([
    { ...toolResult(), isError: true },
    { ...toolResult(), resultType: "input_required" },
    { ...toolResult(), structuredContent: { document: "bad" } },
    { ...toolResult(), content: [{ type: "text", text: JSON.stringify({ document: null }) }] },
    { ...toolResult(), content: [{ type: "image", data: "secret" }] },
    { ...toolResult(), _meta: { [MCP_RUN_META_KEY]: "wrong", [MCP_CALL_META_KEY]: context.callId } },
    { ...toolResult(), _meta: {} },
    { ...toolResult(), structuredContent: { document: { ...output.document, documentId: "other" } } },
    { ...toolResult(), ignored: "x".repeat(66_000) },
  ])("rejects malformed, contradictory, or mismatched results", async (result) => {
    const { adapter, peer } = harness();
    peer.callTool.mockResolvedValueOnce(result);
    await expect(adapter.read(input, signal(), context)).rejects.toMatchObject({ code: "MCP_RESULT_INVALID" });
    expect(peer.close).toHaveBeenCalledTimes(1);
  });

  it.each(["connect", "listTools", "callTool"] as const)("normalizes %s failures and always closes", async (method) => {
    const { adapter, peer } = harness();
    peer[method].mockRejectedValueOnce(new Error("secret peer stack"));
    await expect(adapter.read(input, signal(), context)).rejects.toMatchObject({
      code: "MCP_TRANSPORT_FAILED", message: "The MCP boundary rejected the operation.",
    });
    expect(peer.close).toHaveBeenCalledTimes(1);
  });

  it("normalizes a factory failure without exposing its exception", async () => {
    const adapter = new McpReadDocAdapter({ consent, createSession: () => { throw new Error("secret factory failure"); } });
    await expect(adapter.read(input, signal(), context)).rejects.toMatchObject({
      code: "MCP_TRANSPORT_FAILED", message: "The MCP boundary rejected the operation.",
    });
  });

  it("normalizes cleanup failure instead of leaking its exception", async () => {
    const { adapter, peer } = harness();
    peer.close.mockRejectedValueOnce(new Error("secret cleanup failure"));
    await expect(adapter.read(input, signal(), context)).rejects.toMatchObject({
      code: "MCP_TRANSPORT_FAILED", message: "The MCP boundary rejected the operation.",
    });
  });

  it("preserves caller cancellation and closes an active call", async () => {
    const { adapter, peer } = harness();
    const caller = new AbortController();
    const started = Promise.withResolvers<void>();
    peer.callTool.mockImplementationOnce(async (_input, activeSignal) => {
      started.resolve();
      return new Promise((_, reject) => activeSignal.addEventListener("abort", () => reject(new Error("secret transport abort")), { once: true }));
    });
    const reason = new Error("caller cancelled");
    const pending = adapter.read(input, caller.signal, context);
    await started.promise;
    caller.abort(reason);
    await expect(pending).rejects.toBe(reason);
    expect(peer.close).toHaveBeenCalledTimes(1);
  });
});
