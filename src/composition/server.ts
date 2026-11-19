import { resolve } from "node:path";

import type { FastifyInstance } from "fastify";

import { buildHttpApp } from "../adapters/inbound/http.js";
import { createIterationRuntime } from "./create-iteration-runtime.js";

export interface StartServerOptions {
  readonly documentLibrary?: boolean;
  readonly fixtureRoot?: string;
  readonly host?: string;
  readonly journalRoot?: string;
  readonly port?: number;
  readonly iteration?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  readonly mcpConsent?: "read_doc";
  readonly databaseUrl?: string;
  readonly indexId?: string;
  readonly telemetryRoot?: string;
  readonly reportRoot?: string;
  readonly exportRoot?: string;
}

export async function startServer(
  options: StartServerOptions = {},
): Promise<FastifyInstance> {
  const runtime = await createIterationRuntime({
    ...(options.documentLibrary === undefined ? {} : { documentLibrary: options.documentLibrary }),
    iteration: options.iteration,
    mcpConsent: options.mcpConsent,
    databaseUrl: options.databaseUrl,
    indexId: options.indexId,
    ...(options.telemetryRoot === undefined ? {} : { telemetryRoot: options.telemetryRoot }),
    ...(options.reportRoot === undefined ? {} : { reportRoot: options.reportRoot }),
    ...(options.exportRoot === undefined ? {} : { exportRoot: options.exportRoot }),
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
