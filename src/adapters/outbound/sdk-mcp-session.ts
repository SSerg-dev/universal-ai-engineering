import { Client, SdkError, SdkErrorCode } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import type { McpSessionPort } from "../../application/ports/mcp-session-port.js";
import {
  MCP_CALL_META_KEY, MCP_PROTOCOL_VERSION, MCP_RUN_META_KEY, McpBoundaryError,
  type McpReadCall,
} from "../../domain/mcp-contracts.js";

export interface SdkMcpSessionOptions {
  readonly command: string;
  readonly args: readonly string[];
}

export class SdkMcpSession implements McpSessionPort {
  readonly #client = new Client({ name: "uaos-host", version: "0.1.0" }, {
    versionNegotiation: { mode: { pin: MCP_PROTOCOL_VERSION }, probe: { timeoutMs: 1_000, maxRetries: 0 } },
    listMaxPages: 1,
  });
  readonly #transport: StdioClientTransport;

  constructor(options: SdkMcpSessionOptions) {
    this.#transport = new StdioClientTransport({
      command: options.command, args: [...options.args], stderr: "ignore", maxBufferSize: 128 * 1024,
    });
  }

  async connect(signal: AbortSignal): Promise<unknown> {
    try {
      await this.#client.connect(this.#transport, { signal, timeout: 1_000 });
    } catch (error) {
      if (error instanceof SdkError && error.code === SdkErrorCode.EraNegotiationFailed) {
        throw new McpBoundaryError("MCP_NEGOTIATION_FAILED");
      }
      throw error;
    }
    return {
      era: this.#client.getProtocolEra(),
      protocolVersion: this.#client.getNegotiatedProtocolVersion(),
      serverId: this.#client.getServerVersion()?.name,
      serverVersion: this.#client.getServerVersion()?.version,
      supportsTools: this.#client.getServerCapabilities()?.tools !== undefined,
    };
  }

  listTools(signal: AbortSignal): Promise<unknown> {
    return this.#client.listTools(undefined, { signal, timeout: 1_000 });
  }

  callTool(input: McpReadCall, signal: AbortSignal): Promise<unknown> {
    return this.#client.callTool({
      name: input.name,
      arguments: input.arguments,
      _meta: { [MCP_RUN_META_KEY]: input.context.runId, [MCP_CALL_META_KEY]: input.context.callId },
    }, { signal, timeout: 1_000 });
  }

  close(): Promise<void> {
    return this.#client.close();
  }
}
