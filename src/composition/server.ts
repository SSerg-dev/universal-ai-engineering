import { resolve } from "node:path";

import type { FastifyInstance } from "fastify";

import { buildHttpApp } from "../adapters/inbound/http.js";
import { createIterationRuntime } from "./create-iteration-runtime.js";

export interface StartServerOptions {
  readonly fixtureRoot?: string;
  readonly host?: string;
  readonly journalRoot?: string;
  readonly port?: number;
  readonly iteration?: 1 | 2 | 3;
  readonly mcpConsent?: "read_doc";
}

export async function startServer(
  options: StartServerOptions = {},
): Promise<FastifyInstance> {
  const runtime = await createIterationRuntime({
    iteration: options.iteration,
    mcpConsent: options.mcpConsent,
    fixtureRoot:
      options.fixtureRoot ?? resolve(process.cwd(), "fixtures", "docs"),
    journalRoot:
      options.journalRoot ?? resolve(process.cwd(), ".uaos", "journal"),
  });
  const app = buildHttpApp(runtime);

  await app.listen({
    host: options.host ?? "127.0.0.1",
    port: options.port ?? 3_000,
  });
  return app;
}
