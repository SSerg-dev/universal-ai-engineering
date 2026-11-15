import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { buildHttpApp } from "../../src/adapters/inbound/http.js";
import { FilesystemTelemetry } from "../../src/adapters/outbound/filesystem-telemetry.js";
import { createDiagnoseTelemetry } from "../../src/application/diagnose-telemetry.js";
import { createIterationRuntime } from "../../src/composition/create-iteration-runtime.js";
import { createObservedGroundedRuntime } from "../../src/composition/create-observed-grounded-runtime.js";
import { ingestFixtures } from "../../src/composition/ingest-fixtures.js";
import { GroundedRunAgentResultSchema } from "../../src/domain/retrieval-contracts.js";
import { TelemetryDiagnosisSchema, TelemetryRecordSchema } from "../../src/domain/telemetry-contracts.js";
import { RegisteredAgentEventEnvelopeSchema } from "../../src/domain/tool-events.js";

const databaseUrl = process.env.UAOS_TEST_DATABASE_URL;
if (!databaseUrl || !process.env.UAOS_TEST_DATABASE_OWNER) throw new Error("Use npm run test:database for an owned disposable database");
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url)), fixtureRoot = join(repositoryRoot, "fixtures/docs");
const roots: string[] = [], signal = () => new AbortController().signal;
async function context() {
  const root = await mkdtemp(join(tmpdir(), "uaos-observability-")); roots.push(root);
  const options = { databaseUrl, indexId: `test-${randomUUID()}`, fixtureRoot, journalRoot: join(root, "journal"),
    reportRoot: join(root, "reports"), telemetryRoot: join(root, "telemetry"), iteration: 7 };
  await ingestFixtures(options, signal());
  return { root, options, inspect: createDiagnoseTelemetry(new FilesystemTelemetry({ root: options.telemetryRoot })) };
}
afterEach(async () => {
  for (const root of roots.splice(0)) {
    expect(dirname(resolve(root))).toBe(resolve(tmpdir())); expect(basename(root)).toMatch(/^uaos-observability-/u);
    await rm(root, { recursive: true, force: true });
  }
});
async function records(root: string, traceId: string) {
  const raw = await readFile(join(root, `${traceId}.telemetry.jsonl`), "utf8");
  expect(raw).not.toMatch(/execution journal|postgres(?:ql)?:\/\/|# Execution Journal|claim|quote|question|answer/u);
  return raw.trimEnd().split("\n").map((line) => TelemetryRecordSchema.parse(JSON.parse(line)));
}

describe("Live iteration seven observability", () => {
  it("correlates an HTTP result, measured journal events, and all real operation spans", async () => {
    const { options, inspect } = await context(), runtime = await createIterationRuntime(options), app = buildHttpApp(runtime);
    try {
      const response = await app.inject({ method: "POST", url: "/api/v1/agent-runs", payload: { question: "execution journal" } });
      expect(response.statusCode).toBe(200);
      const result = GroundedRunAgentResultSchema.parse(response.json()); expect(result.ok).toBe(true);
      const diagnosis = await inspect(result.runId);
      expect(diagnosis).toMatchObject({ complete: true, issues: [], runMetrics: { modelCalls: 2, toolCalls: 1, retries: 0 } });
      expect(diagnosis.spans.map(({ operation }) => operation)).toEqual(expect.arrayContaining(["run", "model", "tool", "retrieval", "journal"]));
      const telemetry = await records(options.telemetryRoot, result.runId);
      const events = (await readFile(join(options.journalRoot, `${result.runId}.jsonl`), "utf8")).trimEnd().split("\n")
        .map((line) => RegisteredAgentEventEnvelopeSchema.parse(JSON.parse(line)));
      for (const event of events) if (event.eventType === "model.responded" || event.eventType === "tool.succeeded") {
        expect(telemetry).toContainEqual(expect.objectContaining({ kind: "span.completed", payload: expect.objectContaining({
          callId: event.payload.callId, durationMs: event.payload.durationMs,
        }) }));
      }
    } finally { await app.close(); }
  });

  it("links state turns and evaluation quality to real independently inspectable case runs", async () => {
    const { options, inspect } = await context(), runtime = await createIterationRuntime(options);
    const created = await runtime.conversationCommand!({ operation: "create", retentionSeconds: 60 });
    if (created.operation !== "create") throw new Error("Expected created conversation");
    const turn = await runtime.conversationCommand!({ operation: "run_turn", conversationId: created.value.conversationId,
      requestId: `request-${randomUUID()}`, expectedVersion: created.value.version, question: "execution journal" });
    if (turn.operation !== "run_turn") throw new Error("Expected settled turn");
    expect(turn.value.result.ok).toBe(true);
    const report = await runtime.evaluate!(); expect(report.gate.passed).toBe(true);
    expect(await inspect(report.evaluationId)).toMatchObject({ complete: true, relatedRunIds: report.cases.map(({ runId }) => runId) });
    for (const { runId } of report.cases) expect(await inspect(runId)).toMatchObject({ complete: true });
    let linked = false;
    for (const filename of await readdir(options.telemetryRoot)) {
      const traceId = filename.replace(/\.telemetry\.jsonl$/u, ""), trace = await records(options.telemetryRoot, traceId);
      const terminal = trace.at(-1)!;
      if (terminal.kind === "state.completed" && terminal.payload.operation === "run_turn") {
        linked = true; expect(terminal.payload).toMatchObject({ conversationId: created.value.conversationId, runId: turn.value.result.runId });
        expect(await inspect(traceId)).toMatchObject({ complete: true, relatedRunIds: [turn.value.result.runId] });
      }
    }
    expect(linked).toBe(true);
    const quality = (await records(options.telemetryRoot, report.evaluationId)).at(-1)!;
    if (quality.kind !== "evaluation.metrics") throw new Error("Expected quality summary");
    for (const { dimension, rate } of quality.payload.dimensions) expect(rate).toBe(report.metrics[dimension].rate);
  });

  it("inspects a real CLI run from another directory without any database configuration", async () => {
    const { root, options } = await context(), cli = join(repositoryRoot, "dist/src/adapters/inbound/cli.js");
    const env = { ...process.env, UAOS_ITERATION: "7", UAOS_DATABASE_URL: databaseUrl, UAOS_INDEX_ID: options.indexId,
      UAOS_FIXTURE_ROOT: fixtureRoot, UAOS_JOURNAL_ROOT: options.journalRoot, UAOS_TELEMETRY_ROOT: options.telemetryRoot };
    const ask = spawnSync(process.execPath, [cli, "ask", "execution journal"], { cwd: root, env, encoding: "utf8", timeout: 15_000 });
    expect(ask.status, ask.stderr).toBe(0);
    const runId = /Run ID: (run-[A-Za-z0-9_-]+)/u.exec(ask.stdout)?.[1]; expect(runId).toBeDefined();
    const inspect = spawnSync(process.execPath, [cli, "inspect", runId!], { cwd: root,
      env: { ...env, UAOS_DATABASE_URL: "", UAOS_INDEX_ID: "invalid index ID" }, encoding: "utf8", timeout: 5_000 });
    expect(inspect.status, inspect.stderr).toBe(0); expect(inspect.stderr).toBe("");
    expect(TelemetryDiagnosisSchema.parse(JSON.parse(inspect.stdout))).toMatchObject({ traceId: runId, complete: true });
  });

  it("diagnoses denied permission and preserves required journal failures despite optional exporter failure", async () => {
    const { root, options, inspect } = await context();
    const denied = await createObservedGroundedRuntime({ ...options, allowedTools: new Set() });
    const result = await denied.runAgent({ question: "execution journal" });
    expect(result).toMatchObject({ ok: false, error: { code: "TOOL_FAILURE" } });
    expect(await inspect(result.runId)).toMatchObject({ complete: true, spans: expect.arrayContaining([
      expect.objectContaining({ operation: "tool", status: "error", errorCode: "TOOL_PERMISSION_DENIED" }),
    ]) });
    const blockedRoot = join(root, "blocked"); await writeFile(blockedRoot, "existing operator artifact");
    const exportFailure = await createObservedGroundedRuntime({ ...options, telemetryRoot: blockedRoot });
    expect(await exportFailure.runAgent({ question: "execution journal" })).toMatchObject({ ok: true });
    expect(await readFile(blockedRoot, "utf8")).toBe("existing operator artifact");
    const journalFailure = await createObservedGroundedRuntime({ ...options, journalRoot: blockedRoot });
    const failed = await journalFailure.runAgent({ question: "execution journal" });
    expect(failed).toMatchObject({ ok: false, error: { code: "JOURNAL_FAILURE" } });
    expect(await inspect(failed.runId)).toMatchObject({ complete: true, runMetrics: { errorCode: "JOURNAL_FAILURE" } });
  });
});
