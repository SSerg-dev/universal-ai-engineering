import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import { buildHttpApp } from "../../src/adapters/inbound/http.js";
import { initialStreamState, reduceStream } from "../../src/application/reduce-stream.js";
import { createIterationRuntime } from "../../src/composition/create-iteration-runtime.js";
import { ingestFixtures } from "../../src/composition/ingest-fixtures.js";
import { StreamEventSchema, type StreamEvent } from "../../src/domain/stream-contracts.js";

const databaseUrl = process.env.UAOS_TEST_DATABASE_URL;
if (!databaseUrl || !process.env.UAOS_TEST_DATABASE_OWNER) throw new Error("Use npm run test:database for an owned disposable database");
const fixtureRoot = fileURLToPath(new URL("../../fixtures/docs", import.meta.url)), roots: string[] = [], apps: FastifyInstance[] = [];
async function context() {
  const root = await mkdtemp(join(tmpdir(), "uaos-streaming-")); roots.push(root);
  const options = { databaseUrl, indexId: `test-${randomUUID()}`, fixtureRoot, journalRoot: join(root, "journal"),
    telemetryRoot: join(root, "telemetry"), reportRoot: join(root, "reports"), iteration: 8 };
  await ingestFixtures(options, new AbortController().signal);
  const runtime = await createIterationRuntime(options), app = buildHttpApp(runtime); apps.push(app);
  return { root, options, runtime, app };
}
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const root of roots.splice(0)) {
    expect(dirname(resolve(root))).toBe(resolve(tmpdir())); expect(basename(root)).toMatch(/^uaos-streaming-/u);
    await rm(root, { recursive: true, force: true });
  }
});
function parse(text: string) {
  return text.split("\n\n").filter((block) => block.includes("data: "))
    .map((block) => StreamEventSchema.parse(JSON.parse(block.split("\n").find((line) => line.startsWith("data: "))!.slice(6))));
}
describe("Real grounded iteration eight streaming", () => {
  it("streams real indexed citations through HTTP and preserves safe required journal/telemetry", async () => {
    const { app, runtime, options } = await context();
    const created = await app.inject({ method: "POST", url: "/api/v1/stream-runs", payload: { question: "execution journal" } });
    expect(created.statusCode).toBe(202); const { runId } = created.json() as { runId: string };
    const response = await app.inject({ method: "GET", url: `/api/v1/stream-runs/${runId}/events` });
    expect(response.statusCode).toBe(200);
    const frames = parse(response.body); expect(frames.reduce(reduceStream, initialStreamState(runId)).phase).toBe("terminal");
    const answer = frames.find((frame) => frame.type === "answer");
    if (answer?.type !== "answer" || answer.payload.grounding.status !== "answered") throw new Error("Expected actual grounded content");
    expect(frames.at(-1)!.type).toBe("run.completed");
    for (const claim of answer.payload.grounding.claims) expect(await runtime.resolveCitation!(claim.citation, new AbortController().signal)).not.toBeNull();
    expect(await runtime.inspect!(runId)).toMatchObject({ complete: true, runMetrics: { modelCalls: 2, toolCalls: 1 } });
    for (const filename of [join(options.journalRoot, `${runId}.jsonl`), join(options.telemetryRoot, `${runId}.telemetry.jsonl`)]) {
      const raw = await readFile(filename, "utf8"); expect(raw).not.toContain("execution journal");
      for (const claim of answer.payload.grounding.claims) expect(raw).not.toContain(claim.quote);
      expect(raw).not.toContain(databaseUrl!);
    }
    const replay = await app.inject({ method: "GET", url: `/api/v1/stream-runs/${runId}/events?after=7` });
    expect(parse(replay.body)).toEqual(frames.slice(7));
  });

  it("cancels before execution starts while preserving required cancellation evidence", async () => {
    const { runtime, options } = await context(), { runId } = runtime.streams!.create({ question: "execution journal" });
    expect(runtime.streams!.cancel(runId)).toMatchObject({ requested: true, terminal: false });
    const frames = await new Promise<StreamEvent[]>((resolve) => {
      const received: StreamEvent[] = [];
      runtime.streams!.subscribe(runId, 0, (event) => {
        received.push(event); if (["run.cancelled", "run.failed", "run.completed"].includes(event.type)) resolve(received);
      });
    });
    expect(frames.map(({ type }) => type)).toEqual(["run.started", "run.cancelled"]);
    expect(await readFile(join(options.journalRoot, `${runId}.jsonl`), "utf8")).toContain('"eventType":"run.cancelled"');
    expect(await runtime.inspect!(runId)).toMatchObject({ complete: true, runMetrics: { status: "cancelled", modelCalls: 0, toolCalls: 0 } });
  });
});
