import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { buildHttpApp } from "../../src/adapters/inbound/http.js";
import { PostgresApprovalStore } from "../../src/adapters/outbound/postgres-approval-store.js";
import { createIterationRuntime } from "../../src/composition/create-iteration-runtime.js";
import { createGuardedRuntime } from "../../src/composition/create-guarded-runtime.js";
import { ingestFixtures } from "../../src/composition/ingest-fixtures.js";
import { initialStreamState, reduceStream } from "../../src/application/reduce-stream.js";
import { GuardCommandSuccessSchema, type ApprovalView } from "../../src/domain/guard-contracts.js";
import policyJson from "../../fixtures/policies/local-course.v1.json" with { type: "json" };
import { GuardPolicyBodySchema } from "../../src/domain/guard-contracts.js";
import { Sha256ContentIdentity } from "../../src/adapters/outbound/sha256-content-identity.js";
import { StreamEventSchema } from "../../src/domain/stream-contracts.js";
import type { Runtime } from "../../src/composition/create-runtime.js";
import { Client } from "pg";

const databaseUrl = process.env.UAOS_TEST_DATABASE_URL;
if (!databaseUrl || !process.env.UAOS_TEST_DATABASE_OWNER) throw new Error("Use npm run test:database for an owned disposable database");
const fixtureRoot = fileURLToPath(new URL("../../fixtures/docs", import.meta.url)), roots: string[] = [], runtimes: Runtime[] = [];
const signal = () => new AbortController().signal;
async function context() {
  const root = await mkdtemp(join(tmpdir(), "uaos-guard-runtime-")); roots.push(root);
  const options = { databaseUrl, indexId: `test-${randomUUID()}`, fixtureRoot, journalRoot: join(root, "journal"),
    telemetryRoot: join(root, "telemetry"), reportRoot: join(root, "reports"), exportRoot: join(root, "exports"), iteration: 9 };
  await ingestFixtures(options, signal());
  const runtime = await createIterationRuntime(options); runtimes.push(runtime);
  const audit = new PostgresApprovalStore({ connectionString: databaseUrl! });
  return { root, options, runtime, audit };
}
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) runtime.streams?.close();
  for (const root of roots.splice(0)) {
    const absolute = resolve(root);
    if (dirname(absolute) !== resolve(tmpdir()) || !basename(absolute).startsWith("uaos-guard-runtime-")) throw new Error("Unexpected owned test root");
    await rm(absolute, { recursive: true, force: true });
  }
});
const parseFrames = (text: string) => text.split("\n\n").filter((block) => block.includes("data: "))
  .map((block) => StreamEventSchema.parse(JSON.parse(block.split("\n").find((line) => line.startsWith("data: "))!.slice(6))));

describe("actual guarded iteration nine composition", () => {
  it.each(["rejected", "delayed"] as const)("fails closed before model work when actual required audit is %s", async (mode) => {
    const { options, audit } = await context();
    const admin = async (sql: string) => {
      const client = new Client({ connectionString: databaseUrl!, connectionTimeoutMillis: 1000, statement_timeout: 2000 });
      try { await client.connect(); await client.query(sql); } finally { await client.end(); }
    };
    const { revision: _revision, ...body } = structuredClone(policyJson);
    body.budget.timeoutMs = 100; body.budget.toolTimeoutMs = 50;
    const canonical = GuardPolicyBodySchema.parse(body), identity = new Sha256ContentIdentity();
    const runtime = await createGuardedRuntime({ ...options, guardPolicy: { ...canonical, revision: identity.digest(JSON.stringify(canonical)) } }); runtimes.push(runtime);
    const action = mode === "rejected" ? "RAISE EXCEPTION 'fixture rejection';" : "PERFORM pg_sleep(0.2);";
    await admin(`CREATE FUNCTION uaos_guard.block_test_gate() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.metadata->>'kind' = 'policy.checked' THEN ${action} END IF; RETURN NEW; END $$;
      CREATE TRIGGER block_test_gate BEFORE INSERT ON uaos_guard.audit FOR EACH ROW EXECUTE FUNCTION uaos_guard.block_test_gate();`);
    try {
      const result = await runtime.runAgent({ question: "execution journal" });
      expect(result).toMatchObject({ ok: false, error: { code: mode === "rejected" ? "INTERNAL_ERROR" : "TIMEOUT" } });
      const journal = (await readFile(join(options.journalRoot, `${result.runId}.jsonl`), "utf8")).trimEnd().split("\n").map((line) => JSON.parse(line) as unknown);
      expect(journal).toMatchObject([{ eventType: "run.failed", payload: { modelCalls: 0, toolCalls: 0 } }]);
      expect(await audit.read(result.runId, signal())).toEqual([]);
    } finally { await admin("DROP TRIGGER block_test_gate ON uaos_guard.audit; DROP FUNCTION uaos_guard.block_test_gate();"); }
  });
  it.each([
    { rule: "input", code: "INVALID_REQUEST", modelCalls: 0, toolCalls: 0 },
    { rule: "output", code: "INVALID_MODEL_ACTION", modelCalls: 2, toolCalls: 1 },
    { rule: "permission", code: "TOOL_FAILURE", modelCalls: 1, toolCalls: 1 },
    { rule: "arguments", code: "TOOL_FAILURE", modelCalls: 1, toolCalls: 1 },
    { rule: "observation", code: "TOOL_FAILURE", modelCalls: 1, toolCalls: 1 },
    { rule: "model-budget", code: "LIMIT_EXCEEDED", modelCalls: 0, toolCalls: 0 },
    { rule: "tool-budget", code: "LIMIT_EXCEEDED", modelCalls: 1, toolCalls: 0 },
  ])("enforces the host $rule rule in the actual grounded engine", async ({ rule, code, modelCalls, toolCalls }) => {
    const { options, audit } = await context(), { revision: _revision, ...body } = structuredClone(policyJson);
    if (rule === "input") body.input.maxCharacters = 1;
    if (rule === "output") body.output.maxCharacters = 1;
    if (rule === "permission") body.tools.allowed = [];
    if (rule === "arguments") body.tools.maxArgumentCharacters = 1;
    if (rule === "observation") body.tools.maxObservationCharacters = 1;
    if (rule === "model-budget") body.budget.maxModelCalls = 0;
    if (rule === "tool-budget") body.budget.maxToolCalls = 0;
    const canonical = GuardPolicyBodySchema.parse(body), identity = new Sha256ContentIdentity();
    const runtime = await createGuardedRuntime({ ...options, guardPolicy: { ...canonical, revision: identity.digest(JSON.stringify(canonical)) } }); runtimes.push(runtime);
    const result = await runtime.runAgent({ question: "execution journal" });
    expect(result).toMatchObject({ ok: false, error: { code } });
    const lines = (await readFile(join(options.journalRoot, `${result.runId}.jsonl`), "utf8")).trimEnd().split("\n").map((line) => JSON.parse(line) as { eventType: string; payload: unknown });
    expect(lines.at(-1)).toMatchObject({ eventType: "run.failed", payload: { errorCode: code, modelCalls, toolCalls } });
    expect(lines.some(({ eventType }) => eventType === "run.succeeded")).toBe(false);
    expect(JSON.stringify(await audit.read(result.runId, signal()))).not.toContain("execution journal");
  });
  it("guards standalone and conversation execution with correlated metadata and leaves earlier iteration selection intact", async () => {
    const { runtime, audit, options } = await context();
    const denied = await runtime.runAgent({ question: "private question <<PRIVATE>>" });
    expect(denied).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
    const events = await audit.read(denied.runId, signal());
    expect(events).toMatchObject([{ kind: "policy.checked", payload: { checkpoint: "request", allowed: false, reason: "INPUT_MARKER_BLOCKED" } }]);
    expect(JSON.stringify(events)).not.toContain("private question");
    const success = await runtime.runAgent({ question: "execution journal" });
    expect(success).toMatchObject({ ok: true, usage: { modelCalls: 2, toolCalls: 1 } });
    expect((await audit.read(success.runId, signal())).map((event) => event.kind === "policy.checked" && event.payload.checkpoint)).toEqual([
      "request", "model_action", "tool_invocation", "tool_observation", "model_action",
    ]);
    const created = await runtime.conversationCommand!({ operation: "create", retentionSeconds: 3600 });
    if (created.operation !== "create") throw new Error("Expected conversation creation");
    const turn = await runtime.conversationCommand!({ operation: "run_turn", conversationId: created.value.conversationId,
      expectedVersion: 0, requestId: "request-guard-turn", question: "<<private>>" });
    expect(turn).toMatchObject({ value: { result: { ok: false, error: { code: "INVALID_REQUEST" } } } });
    const old = await createIterationRuntime({ ...options, iteration: 8 }); runtimes.push(old);
    expect(old.guardCommand).toBeUndefined(); expect(await old.runAgent({ question: "<<private>>" })).toMatchObject({ ok: true });
  });

  it("keeps streaming frames compatible while guarding actual execution and evaluation factory paths", async () => {
    const { runtime, audit } = await context(), app = buildHttpApp(runtime);
    try {
      const created = await app.inject({ method: "POST", url: "/api/v1/stream-runs", payload: { question: "execution journal" } });
      const { runId } = created.json() as { runId: string };
      const stream = await app.inject({ method: "GET", url: `/api/v1/stream-runs/${runId}/events` });
      const frames = parseFrames(stream.body);
      expect(frames.reduce(reduceStream, initialStreamState(runId)).phase).toBe("terminal");
      expect(frames.some(({ type }) => type === "answer")).toBe(true); expect(await audit.read(runId, signal())).toHaveLength(5);
      const denied = runtime.streams!.create({ question: "<<private>>" });
      const rejection = await app.inject({ method: "GET", url: `/api/v1/stream-runs/${denied.runId}/events` });
      expect(parseFrames(rejection.body).some(({ type }) => type === "answer")).toBe(false);
      expect(await audit.read(denied.runId, signal())).toMatchObject([{ payload: { allowed: false } }]);
      const report = await runtime.evaluate!(); expect(report.gate.passed).toBe(true);
      for (const item of report.cases) expect((await audit.read(item.runId, signal()))[0]).toMatchObject({ kind: "policy.checked", payload: { checkpoint: "request" } });
    } finally { await app.close(); }
  });

  it("prepares over actual TCP, approves in a fresh CLI process, and exports exactly the reviewed grounded bytes", async () => {
    const { runtime, options } = await context(), app = buildHttpApp(runtime);
    try {
      const base = await app.listen({ host: "127.0.0.1", port: 0 });
      const post = async (payload: unknown) => {
        const response = await fetch(`${base}/api/v1/guard-commands`, { method: "POST", headers: { "content-type": "application/json", origin: base },
          body: JSON.stringify(payload), signal: AbortSignal.timeout(15_000) });
        const body: unknown = await response.json();
        expect(response.status, response.ok ? "successful command" : JSON.stringify(body)).toBe(200);
        return GuardCommandSuccessSchema.parse(body).value as ApprovalView;
      };
      const pending = await post({ operation: "prepare_export", requestId: `request-${randomUUID()}`, question: "execution journal" });
      expect(pending.state).toBe("pending"); expect(pending.payload?.result.grounding.status).toBe("answered");
      const child = spawnSync(process.execPath, ["dist/src/adapters/inbound/cli.js", "guard", JSON.stringify({ operation: "approve",
        approvalId: pending.approvalId, expectedVersion: pending.version, proposalDigest: pending.proposalDigest })], { encoding: "utf8", timeout: 15_000,
        env: { ...process.env, UAOS_ITERATION: "9", UAOS_DATABASE_URL: databaseUrl, UAOS_INDEX_ID: options.indexId,
          UAOS_JOURNAL_ROOT: options.journalRoot, UAOS_TELEMETRY_ROOT: options.telemetryRoot, UAOS_REPORT_ROOT: options.reportRoot,
          UAOS_FIXTURE_ROOT: fixtureRoot, UAOS_EXPORT_ROOT: options.exportRoot } });
      expect(child.status).toBe(0); expect(child.stderr).toBe("");
      const approved = GuardCommandSuccessSchema.parse(JSON.parse(child.stdout)).value as ApprovalView;
      const succeeded = await post({ operation: "execute", approvalId: approved.approvalId, expectedVersion: approved.version, proposalDigest: approved.proposalDigest });
      expect(succeeded.state).toBe("succeeded");
      expect(await readFile(join(options.exportRoot, `${pending.approvalId}.md`), "utf8")).toBe(pending.payload?.markdown);
      expect(await readdir(options.journalRoot)).toEqual([`${pending.runId}.jsonl`]);
      const journal = await readFile(join(options.journalRoot, `${pending.runId}.jsonl`), "utf8");
      expect(journal).not.toContain("execution journal"); expect(journal).not.toContain(pending.payload!.result.answer);
    } finally { await app.close(); }
  });
});
