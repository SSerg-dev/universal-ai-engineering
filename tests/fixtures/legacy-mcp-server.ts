import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";

const server = new McpServer({ name: "legacy-only", version: "1.0.0" });
await server.connect(new StdioServerTransport());
