import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "pg";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { PostgresConversationStore } from "../../src/adapters/outbound/postgres-conversation-store.js";
import { Sha256ContentIdentity } from "../../src/adapters/outbound/sha256-content-identity.js";
import { createConversationService } from "../../src/application/conversation-service.js";
import type { TurnExecutionPort } from "../../src/application/ports/turn-execution-port.js";
import { ConversationCommandSuccessSchema } from "../../src/domain/conversation-command-contracts.js";
import { RegisteredAgentEventEnvelopeSchema } from "../../src/domain/tool-events.js";
import { ingestFixtures } from "../../src/composition/ingest-fixtures.js";
import { startServer } from "../../src/composition/server.js";

const connectionString = process.env.UAOS_TEST_DATABASE_URL;
if (!connectionString || !process.env.UAOS_TEST_DATABASE_OWNER) throw new Error("Use npm run test:database for an owned disposable database");
const makeStore = () => new PostgresConversationStore({ connectionString: connectionString! });
const signal = () => new AbortController().signal;
let time = Date.parse("2026-11-09T00:00:00.000Z");
const clock = { now: () => new Date(time).toISOString() };
function harness(execute?: TurnExecutionPort["execute"]) {
  const executor = vi.fn<TurnExecutionPort["execute"]>(execute ?? (async (_question, context) => ({
    ok: true, runId: context.runId, answer: "No supporting indexed passages were found.", sources: [],
    usage: { modelCalls: 2, toolCalls: 1 }, grounding: { version: "1.0", status: "abstained", reason: "no_evidence", claims: [] },
  })));
  const store = makeStore();
  const service = createConversationService({ store, executor: { execute: executor }, clock,
    ids: { next: (kind) => `${kind}-${randomUUID()}` }, identity: new Sha256ContentIdentity() });
  return { store, service, executor };
}
async function admin<T>(work: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString, connectionTimeoutMillis: 1000, statement_timeout: 2000 });
  try { await client.connect(); return await work(client); } finally { await client.end(); }
}
beforeAll(async () => { await makeStore().initialize(signal()); });

describe("PostgreSQL durable conversation state", () => {
  it("resumes history and cached results from a fresh store without executing again", async () => {
    const first = harness();
    const created = await first.service.create({ retentionSeconds: 3600 });
    const request = { conversationId: created.conversationId, requestId: "first", expectedVersion: 0, question: "private question" };
    const completed = await first.service.runTurn(request);
    const fresh = harness();
    expect(await fresh.service.runTurn(request)).toMatchObject({ cached: true, version: 2, result: completed.result });
    expect(fresh.executor).not.toHaveBeenCalled();
    expect((await fresh.service.read(created.conversationId)).turns).toMatchObject([{ status: "settled", question: "private question", runId: completed.result.runId }]);
    const audit = await fresh.service.audit(created.conversationId);
    expect(audit.map(({ sequence }) => sequence)).toEqual([0, 1, 2]);
    expect(JSON.stringify(audit)).not.toContain("private question");
    expect(JSON.stringify(audit)).not.toContain(completed.result.ok ? completed.result.answer : "unused");
    await expect(fresh.service.runTurn({ ...request, question: "changed" })).rejects.toMatchObject({ code: "REQUEST_KEY_REUSED" });
  });

  it("serializes concurrent reservations and rejects memory mutation during a running turn", async () => {
    const started = Promise.withResolvers<void>(), finish = Promise.withResolvers<void>();
    const first = harness(async (_question, context) => {
      started.resolve(); await finish.promise;
      return { ok: false, runId: context.runId, error: { code: "CANCELLED", stage: "orchestration", message: "Cancelled", retryable: false } };
    });
    const created = await first.service.create({ retentionSeconds: 3600 });
    const pending = first.service.runTurn({ conversationId: created.conversationId, requestId: "first", expectedVersion: 0, question: "journal" });
    await started.promise;
    try {
      const second = harness();
      await expect(second.service.runTurn({ conversationId: created.conversationId, requestId: "second", expectedVersion: 1, question: "journal" })).rejects.toMatchObject({ code: "CONVERSATION_BUSY" });
      await expect(second.service.writeMemory({ conversationId: created.conversationId, expectedVersion: 1, key: "topic", value: "private memory", ttlSeconds: 60 })).rejects.toMatchObject({ code: "CONVERSATION_BUSY" });
      expect(second.executor).not.toHaveBeenCalled();
    } finally { finish.resolve(); await pending; }
  });

  it("recovers an expired lease and fences a late worker across store instances", async () => {
    const started = Promise.withResolvers<void>(), finish = Promise.withResolvers<void>();
    const first = harness(async (_question, context) => {
      started.resolve(); await finish.promise;
      return { ok: false, runId: context.runId, error: { code: "CANCELLED", stage: "orchestration", message: "Cancelled", retryable: false } };
    });
    const created = await first.service.create({ retentionSeconds: 3600 });
    const request = { conversationId: created.conversationId, requestId: "first", expectedVersion: 0, question: "journal" };
    const pending = first.service.runTurn(request);
    const rejected = expect(pending).rejects.toMatchObject({ code: "TURN_FENCED" });
    await started.promise; time += 30_000;
    const second = harness();
    expect(await second.service.recover({ conversationId: created.conversationId, requestId: "first", expectedVersion: 1 })).toMatchObject({ version: 2, turns: [{ status: "interrupted" }] });
    finish.resolve(); await rejected;
    await expect(second.service.runTurn(request)).rejects.toMatchObject({ code: "TURN_INTERRUPTED" });
    expect(second.executor).not.toHaveBeenCalled();
  });

  it("rolls back memory state when its audit insertion fails", async () => {
    const { service } = harness();
    const created = await service.create({ retentionSeconds: 3600 });
    await admin((client) => client.query(`CREATE FUNCTION uaos_state.reject_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.metadata->>'eventType' = 'memory.written' THEN RAISE EXCEPTION 'fixture rejection'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_test_audit BEFORE INSERT ON uaos_state.audit FOR EACH ROW EXECUTE FUNCTION uaos_state.reject_test_audit();`));
    try {
      await expect(service.writeMemory({ conversationId: created.conversationId, expectedVersion: 0, key: "topic", value: "private memory", ttlSeconds: 60 })).rejects.toMatchObject({ code: "STATE_REPOSITORY_FAILURE" });
      expect(await service.read(created.conversationId)).toMatchObject({ version: 0, memories: [] });
      expect(await service.audit(created.conversationId)).toHaveLength(1);
    } finally {
      await admin((client) => client.query("DROP TRIGGER reject_test_audit ON uaos_state.audit; DROP FUNCTION uaos_state.reject_test_audit();"));
    }
  });

  it("filters expired scoped memory and physically purges it with safe audit", async () => {
    const { service } = harness();
    const first = await service.create({ retentionSeconds: 3600 });
    const other = await service.create({ retentionSeconds: 3600 });
    await service.writeMemory({ conversationId: first.conversationId, expectedVersion: 0, key: "topic", value: "private memory", ttlSeconds: 1 });
    expect((await service.read(other.conversationId)).memories).toEqual([]);
    time += 1000;
    expect((await service.read(first.conversationId)).memories).toEqual([]);
    expect(await service.purge()).toMatchObject({ memories: 1 });
    const raw = await admin((client) => client.query("SELECT snapshot->'memories' AS memories FROM uaos_state.conversations WHERE conversation_id=$1", [first.conversationId]));
    expect(raw.rows[0]?.memories).toEqual([]);
    expect(JSON.stringify(await service.audit(first.conversationId))).not.toContain("private memory");
  });

  it("expires and purges content while retaining a metadata tombstone", async () => {
    const { service } = harness();
    const created = await service.create({ retentionSeconds: 60 });
    await service.runTurn({ conversationId: created.conversationId, requestId: "first", expectedVersion: 0, question: "private expired question" });
    time += 60_000;
    await expect(service.read(created.conversationId)).rejects.toMatchObject({ code: "CONVERSATION_EXPIRED" });
    expect(await service.purge()).toMatchObject({ conversations: 1 });
    await expect(service.read(created.conversationId)).rejects.toMatchObject({ code: "CONVERSATION_NOT_FOUND" });
    const audit = await service.audit(created.conversationId);
    expect(audit.at(-1)?.eventType).toBe("conversation.purged");
    expect(JSON.stringify(audit)).not.toContain("private expired question");
  });

  it("shares durable CLI/HTTP conversations, replay, follow-up context, and explicit memory", async () => {
    const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
    const fixtureRoot = join(repositoryRoot, "fixtures/docs"), indexId = `test-${randomUUID()}`;
    await ingestFixtures({ databaseUrl: connectionString, indexId, fixtureRoot }, signal());
    const root = await mkdtemp(join(tmpdir(), "uaos-conversation-"));
    const journalRoot = join(root, "journal");
    const cliPath = join(repositoryRoot, "dist/src/adapters/inbound/cli.js");
    const env = { ...process.env, UAOS_ITERATION: "5", UAOS_DATABASE_URL: connectionString, UAOS_INDEX_ID: indexId,
      UAOS_FIXTURE_ROOT: fixtureRoot, UAOS_JOURNAL_ROOT: journalRoot };
    const app = await startServer({ iteration: 5, databaseUrl: connectionString, indexId, fixtureRoot, journalRoot, port: 0 });
    try {
      const cli = spawnSync(process.execPath, [cliPath, "state", JSON.stringify({ operation: "create", retentionSeconds: 3600 })],
        { cwd: root, env, encoding: "utf8", timeout: 10_000 });
      expect(cli.status, cli.stderr).toBe(0);
      const created = ConversationCommandSuccessSchema.parse(JSON.parse(cli.stdout));
      if (created.operation !== "create") throw new Error("Expected create result");
      const conversationId = created.value.conversationId;
      const address = app.server.address();
      if (!address || typeof address === "string") throw new Error("Expected TCP address");
      const endpoint = `http://127.0.0.1:${address.port}/api/v1/conversation-commands`;
      const send = async (command: unknown) => {
        const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(command) });
        expect(response.status).toBe(200);
        return ConversationCommandSuccessSchema.parse(await response.json());
      };
      const request = { operation: "run_turn", conversationId, requestId: "first", expectedVersion: 0, question: "execution journal" };
      const first = await send(request);
      if (first.operation !== "run_turn") throw new Error("Expected turn result");
      expect(first.value.result).toMatchObject({ ok: true, grounding: { status: "answered" } });
      const again = await send({ ...request, requestId: "again", expectedVersion: 2, question: "again" });
      if (again.operation !== "run_turn" || !again.value.result.ok || !first.value.result.ok) throw new Error("Expected grounded follow-up");
      expect(again.value.result.answer).toBe(first.value.result.answer);
      await send({ operation: "write_memory", conversationId, expectedVersion: 4, key: "topic", value: "execution journal", ttlSeconds: 60 });
      const remembered = await send({ ...request, requestId: "memory", expectedVersion: 5, question: "memory:topic" });
      expect(remembered).toMatchObject({ operation: "run_turn", value: { version: 7, result: { ok: true, grounding: { status: "answered" } } } });
      const replay = await send(request);
      expect(replay).toMatchObject({ operation: "run_turn", value: { cached: true, version: 7, result: first.value.result } });
      const read = spawnSync(process.execPath, [cliPath, "state", JSON.stringify({ operation: "read", conversationId })],
        { cwd: root, env, encoding: "utf8", timeout: 10_000 });
      expect(read.status, read.stderr).toBe(0);
      const loaded = ConversationCommandSuccessSchema.parse(JSON.parse(read.stdout));
      if (loaded.operation !== "read") throw new Error("Expected snapshot");
      expect(loaded.value.turns).toHaveLength(3);
      expect(loaded.value.memories[0]?.value).toBe("execution journal");
      const files = await readdir(journalRoot); expect(files).toHaveLength(3);
      for (const turn of loaded.value.turns) {
        const raw = await readFile(join(journalRoot, `${turn.runId}.jsonl`), "utf8");
        expect(raw.trimEnd().split("\n").map((line) => RegisteredAgentEventEnvelopeSchema.parse(JSON.parse(line)))).toHaveLength(8);
        expect(raw).not.toContain("execution journal");
        expect(raw).not.toContain("memory:topic");
        expect(raw).not.toContain(connectionString!);
      }
      const audit = await send({ operation: "audit", conversationId });
      expect(JSON.stringify(audit)).not.toContain("execution journal");
      expect(JSON.stringify(audit)).toContain(first.value.result.runId);
    } finally {
      await app.close();
      expect(dirname(resolve(root))).toBe(resolve(tmpdir())); expect(basename(root)).toMatch(/^uaos-conversation-/u);
      await rm(root, { recursive: true, force: true });
    }
  });

  it("physically removes expired audit metadata while retaining a new purge tombstone", async () => {
    const { service } = harness();
    const created = await service.create({ retentionSeconds: 60 });
    time += 31 * 86400_000;
    expect(await service.audit(created.conversationId)).toEqual([]);
    expect((await service.purge()).audits).toBeGreaterThan(0);
    const audit = await service.audit(created.conversationId);
    expect(audit.map(({ eventType }) => eventType)).toEqual(["conversation.purged"]);
  });
});
