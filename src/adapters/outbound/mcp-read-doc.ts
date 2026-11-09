import { z } from "zod";

import type { McpSessionFactory, McpSessionPort } from "../../application/ports/mcp-session-port.js";
import {
  MCP_CALL_META_KEY, MCP_MAX_RESULT_BYTES, MCP_RUN_META_KEY,
  McpBoundaryError, McpConsentSchema, McpCorrelationMetadataSchema, McpDiscoverySchema,
} from "../../domain/mcp-contracts.js";
import {
  ReadDocInputSchema, ReadDocOutputSchema, ToolCallContextSchema,
  type ReadDocInput, type ReadDocOutput, type ToolCallContext,
} from "../../domain/tool-contracts.js";

const listedToolSchema = z.object({
  name: z.string().min(1).max(128),
  inputSchema: z.record(z.string(), z.unknown()),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
});
const toolListSchema = z.object({ tools: z.array(listedToolSchema).max(16) });
const resultSchema = z.object({
  resultType: z.literal("complete").optional(),
  isError: z.literal(false).optional(),
  structuredContent: ReadDocOutputSchema,
  content: z.tuple([z.strictObject({ type: z.literal("text"), text: z.string().max(MCP_MAX_RESULT_BYTES) })]),
  _meta: McpCorrelationMetadataSchema,
});

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonical(record[key])]));
  }
  return value;
}

function bounded(value: unknown): boolean {
  return Buffer.byteLength(JSON.stringify(value), "utf8") <= MCP_MAX_RESULT_BYTES;
}

function sameSchema(actual: Record<string, unknown>, expected: Record<string, unknown>): boolean {
  const { $schema: actualRevision, ...actualBody } = actual;
  const expectedBody = { ...expected };
  delete expectedBody.$schema;
  if (actualRevision !== undefined && actualRevision !== "https://json-schema.org/draft/2020-12/schema") return false;
  return JSON.stringify(canonical(actualBody)) === JSON.stringify(canonical(expectedBody));
}

function validateTools(raw: unknown): void {
  try {
    if (!bounded(raw)) throw new Error("metadata size");
    const listed = toolListSchema.parse(raw);
    const selected = listed.tools.filter(({ name }) => name === "read_doc");
    if (selected.length !== 1) throw new Error("capability count");
    const tool = selected[0]!;
    if (!sameSchema(tool.inputSchema, z.toJSONSchema(ReadDocInputSchema)) ||
        tool.outputSchema === undefined || !sameSchema(tool.outputSchema, z.toJSONSchema(ReadDocOutputSchema))) {
      throw new Error("capability schema");
    }
  } catch {
    throw new McpBoundaryError("MCP_METADATA_INVALID");
  }
}

function validateResult(raw: unknown, input: ReadDocInput, context: ToolCallContext): ReadDocOutput {
  try {
    if (!bounded(raw)) throw new Error("result size");
    const result = resultSchema.parse(raw);
    const text = ReadDocOutputSchema.parse(JSON.parse(result.content[0].text));
    if (JSON.stringify(canonical(text)) !== JSON.stringify(canonical(result.structuredContent))) throw new Error("result mismatch");
    if (result._meta[MCP_RUN_META_KEY] !== context.runId || result._meta[MCP_CALL_META_KEY] !== context.callId) throw new Error("receipt mismatch");
    const document = result.structuredContent.document;
    if (document !== null && document.documentId !== input.documentId) throw new Error("document mismatch");
    return result.structuredContent;
  } catch {
    throw new McpBoundaryError("MCP_RESULT_INVALID");
  }
}

export interface McpReadDocOptions {
  readonly consent?: unknown;
  readonly createSession: McpSessionFactory;
}

export class McpReadDocAdapter {
  readonly #consentGranted: boolean;
  readonly #createSession: McpSessionFactory;

  constructor(options: McpReadDocOptions) {
    this.#consentGranted = McpConsentSchema.safeParse(options.consent).success;
    this.#createSession = options.createSession;
  }

  async read(rawInput: ReadDocInput, signal: AbortSignal, rawContext?: ToolCallContext): Promise<ReadDocOutput> {
    signal.throwIfAborted();
    if (!this.#consentGranted) throw new McpBoundaryError("MCP_CONSENT_REQUIRED");
    const context = ToolCallContextSchema.safeParse(rawContext);
    if (!context.success) throw new McpBoundaryError("MCP_CONTEXT_INVALID");
    const input = ReadDocInputSchema.safeParse(rawInput);
    if (!input.success) throw new McpBoundaryError("MCP_ARGUMENTS_INVALID");

    let session: McpSessionPort | undefined;
    try {
      session = this.#createSession();
      const discovered = await session.connect(signal);
      signal.throwIfAborted();
      if (!McpDiscoverySchema.safeParse(discovered).success) throw new McpBoundaryError("MCP_NEGOTIATION_FAILED");
      validateTools(await session.listTools(signal));
      signal.throwIfAborted();
      const rawResult = await session.callTool({ name: "read_doc", arguments: input.data, context: context.data }, signal);
      signal.throwIfAborted();
      return validateResult(rawResult, input.data, context.data);
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (error instanceof McpBoundaryError) throw error;
      throw new McpBoundaryError("MCP_TRANSPORT_FAILED");
    } finally {
      try {
        await session?.close();
      } catch {
        if (signal.aborted) throw signal.reason;
        throw new McpBoundaryError("MCP_TRANSPORT_FAILED");
      }
    }
  }
}
