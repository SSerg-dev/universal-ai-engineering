import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { PostgresConversationStore } from "../../src/adapters/outbound/postgres-conversation-store.js";
import { Sha256ContentIdentity } from "../../src/adapters/outbound/sha256-content-identity.js";
import { createConversationService } from "../../src/application/conversation-service.js";
import type { TurnExecutionPort } from "../../src/application/ports/turn-execution-port.js";

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
});
