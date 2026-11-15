import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import dataset from "../../fixtures/evaluations/internal-docs.v1.json" with { type: "json" };
import { FilesystemEvaluationReport } from "../../src/adapters/outbound/filesystem-evaluation-report.js";
import { Sha256ContentIdentity } from "../../src/adapters/outbound/sha256-content-identity.js";
import { SystemClock } from "../../src/adapters/outbound/system-clock.js";
import { createRunEvaluation } from "../../src/application/run-evaluation.js";
import type { EvaluationExecutionPort } from "../../src/application/ports/evaluation-execution-port.js";
import { createEvaluationExecution } from "../../src/composition/create-evaluation-execution.js";
import { createGroundedRuntime } from "../../src/composition/create-grounded-runtime.js";
import { ingestFixtures } from "../../src/composition/ingest-fixtures.js";
import { EvaluationDatasetSchema, EvaluationReportSchema } from "../../src/domain/evaluation-contracts.js";
import { GroundedRunAgentResultSchema } from "../../src/domain/retrieval-contracts.js";
import { RegisteredAgentEventEnvelopeSchema } from "../../src/domain/tool-events.js";

const databaseUrl = process.env.UAOS_TEST_DATABASE_URL;
if (!databaseUrl || !process.env.UAOS_TEST_DATABASE_OWNER) throw new Error("Use npm run test:database for an owned disposable database");
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const fixtureRoot = join(repositoryRoot, "fixtures/docs"), roots: string[] = [];
const signal = () => new AbortController().signal;
async function context() {
  const root = await mkdtemp(join(tmpdir(), "uaos-evaluation-")); roots.push(root);
  const options = { databaseUrl, indexId: `test-${randomUUID()}`, fixtureRoot, journalRoot: join(root, "journal") };
  await ingestFixtures(options, signal());
  return { root, options, reportRoot: join(root, "reports") };
}
afterEach(async () => {
  for (const root of roots.splice(0)) {
    expect(dirname(resolve(root))).toBe(resolve(tmpdir())); expect(basename(root)).toMatch(/^uaos-evaluation-/u);
    await rm(root, { recursive: true, force: true });
  }
});

describe("Real grounded evaluation", () => {
  it("captures observed passage IDs and only actually persisted journal events", async () => {
    const { options } = await context(), runId = `run-${randomUUID()}`;
    const testCase = EvaluationDatasetSchema.parse(dataset).cases[0]!;
    const execution = await createEvaluationExecution(options).execute(testCase, runId, signal());
    const result = GroundedRunAgentResultSchema.parse(execution.result);
    expect(result).toMatchObject({ ok: true, runId, grounding: { status: "answered" } });
    const raw = await readFile(join(options.journalRoot, `${runId}.jsonl`), "utf8");
    const persisted = raw.trimEnd().split("\n").map((line) => RegisteredAgentEventEnvelopeSchema.parse(JSON.parse(line)));
    expect(execution.events).toEqual(persisted); expect(persisted).toHaveLength(8);
    expect(execution.observedPassageIds).toBeInstanceOf(Array);
    if (!result.ok || result.grounding.status !== "answered") throw new Error("Expected grounded answer");
    for (const claim of result.grounding.claims) expect(execution.observedPassageIds).toContain(claim.citation.passageId);
    expect(raw).not.toContain(testCase.question); expect(raw).not.toContain(databaseUrl!);
  });

  it("persists a passing baseline and fails a known unsupported-answer regression", async () => {
    const { options, reportRoot } = await context();
    const executor = createEvaluationExecution(options), runtime = await createGroundedRuntime(options);
    const run = (selected: EvaluationExecutionPort) => createRunEvaluation({
      executor: selected, resolveCitation: runtime.resolveCitation!, reports: new FilesystemEvaluationReport({ root: reportRoot }),
      identity: new Sha256ContentIdentity(), clock: new SystemClock(), ids: { next: (kind) => `${kind}-${randomUUID()}` },
    });
    const baseline = await run(executor)(dataset, signal());
    expect(baseline.gate).toEqual({ passed: true, failedDimensions: [] });
    const regression = await run({ execute: async (...args) => {
      const execution = await executor.execute(...args);
      const result = GroundedRunAgentResultSchema.parse(execution.result);
      // Explicit test-only corruption: the real persisted journal is deliberately unchanged.
      if (result.ok && result.grounding.status === "answered") result.answer += "\nUnsupported injected assertion.";
      return { ...execution, result };
    } })(dataset, signal());
    expect(regression.gate.passed).toBe(false);
    expect(regression.gate.failedDimensions).toEqual(["grounding", "evidence"]);
    expect(regression.cases[0]?.checks.grounding).toEqual({ status: "failed", code: "UNSUPPORTED_ANSWER" });
    expect(regression.metrics.schema.rate).toBe(1);
    const files = await readdir(reportRoot); expect(files).toHaveLength(2);
    for (const report of [baseline, regression]) {
      const raw = await readFile(join(reportRoot, `${report.evaluationId}.json`), "utf8");
      expect(EvaluationReportSchema.parse(JSON.parse(raw))).toEqual(report);
      expect(raw).not.toContain("execution journal"); expect(raw).not.toContain("Unsupported injected assertion");
      expect(raw).not.toContain(databaseUrl!);
      for (const { runId } of report.cases) expect(await readFile(join(options.journalRoot, `${runId}.jsonl`), "utf8")).not.toBe("");
    }
  });

  it("runs the bundled dataset through the real iteration 6 CLI from another directory", async () => {
    const { root, options, reportRoot } = await context();
    const child = spawnSync(process.execPath, [join(repositoryRoot, "dist/src/adapters/inbound/cli.js"), "eval"], {
      cwd: root, encoding: "utf8", timeout: 15_000,
      env: { ...process.env, UAOS_ITERATION: "6", UAOS_DATABASE_URL: databaseUrl, UAOS_INDEX_ID: options.indexId,
        UAOS_FIXTURE_ROOT: fixtureRoot, UAOS_JOURNAL_ROOT: options.journalRoot, UAOS_REPORT_ROOT: reportRoot },
    });
    expect(child.status, child.stderr).toBe(0); expect(child.stderr).toBe("");
    const report = EvaluationReportSchema.parse(JSON.parse(child.stdout));
    expect(report.gate.passed).toBe(true); expect(report.datasetRevision).toBe(dataset.revision);
    expect(await readdir(reportRoot)).toEqual([`${report.evaluationId}.json`]);
    expect(await readdir(options.journalRoot)).toHaveLength(3);
  });
});
