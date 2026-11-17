import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildHttpApp } from "../dist/src/adapters/inbound/http.js";
import { createStreamingRuntime } from "../dist/src/composition/create-streaming-runtime.js";
import { ingestFixtures } from "../dist/src/composition/ingest-fixtures.js";

const databaseUrl = process.env.UAOS_TEST_DATABASE_URL;
if (!databaseUrl || !process.env.UAOS_TEST_DATABASE_OWNER || process.versions.node.split(".")[0] !== "24") {
  throw new Error("Use node scripts/test-database.mjs --preview with Node.js 24");
}
const root = fileURLToPath(new URL("../", import.meta.url));
const assets = join(root, "ui/dist/inspector/browser"), owner = randomUUID();
const evidenceRoot = join(root, ".uaos/ui-preview", owner);
// Bound preview lifetime even if its launching terminal is abandoned.
let stopped = false, finish;
const done = new Promise((resolve) => { finish = resolve; });
const stop = () => { stopped = true; finish(); };
process.once("SIGINT", stop); process.once("SIGTERM", stop);
const timer = setTimeout(stop, 30 * 60 * 1000);
let app;
try {
  const html = await readFile(join(assets, "index.html"));
  const files = new Set((await readdir(assets, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.(?:js|css)$/u.test(entry.name)).map(({ name }) => name));
  const options = { databaseUrl, fixtureRoot: join(root, "fixtures/docs"), indexId: `preview-${owner}`,
    journalRoot: join(evidenceRoot, "journal"), telemetryRoot: join(evidenceRoot, "telemetry"), reportRoot: join(evidenceRoot, "reports") };
  await ingestFixtures(options, AbortSignal.timeout(20_000));
  if (!stopped) {
    app = buildHttpApp(await createStreamingRuntime(options));
    app.get("/", async (_request, reply) => reply.type("text/html; charset=utf-8").send(html));
    app.get("/:asset", async (request, reply) => {
      const name = request.params?.asset;
      if (typeof name !== "string" || !files.has(name)) return reply.code(404).send();
      return reply.type(name.endsWith(".js") ? "text/javascript; charset=utf-8" : "text/css; charset=utf-8")
        .send(await readFile(join(assets, name)));
    });
    await app.listen({ host: "127.0.0.1", port: 0 });
    console.log(`Local iteration 8 preview: http://127.0.0.1:${app.server.address().port}`);
    console.log("Controlled fixtures only. Stops automatically after 30 minutes; Ctrl+C also stops it.");
    await done;
  }
} finally {
  clearTimeout(timer); process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
  if (app) await app.close();
}
