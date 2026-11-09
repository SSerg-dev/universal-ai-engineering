import { describe, expect, it, vi } from "vitest";

import { Sha256ContentIdentity } from "../../src/adapters/outbound/sha256-content-identity.js";
import { createConversationService } from "../../src/application/conversation-service.js";
import type { TurnExecutionPort } from "../../src/application/ports/turn-execution-port.js";
import type { StateIdKind } from "../../src/application/ports/state-id-generator-port.js";
import { FakeConversationStore } from "../fixtures/fake-conversation-store.js";

function harness(options: { store?: FakeConversationStore; execute?: TurnExecutionPort["execute"]; settlementTimeoutMs?: number } = {}) {
  let time = Date.parse("2026-11-09T00:00:00.000Z"), sequence = 0;
  const store = options.store ?? new FakeConversationStore();
  const execute = vi.fn<TurnExecutionPort["execute"]>(options.execute ?? (async (_question, context) => ({
    ok: true, runId: context.runId, answer: "No supporting indexed passages were found.", sources: [],
    usage: { modelCalls: 2, toolCalls: 1 }, grounding: { version: "1.0", status: "abstained", reason: "no_evidence", claims: [] },
  })));
  const service = createConversationService({
    store, executor: { execute }, clock: { now: () => new Date(time).toISOString() },
    ids: { next: (kind: StateIdKind) => `${kind}-${++sequence}` }, identity: new Sha256ContentIdentity(),
    ...(options.settlementTimeoutMs === undefined ? {} : { settlementTimeoutMs: options.settlementTimeoutMs }),
  });
  return { store, execute, service, advance: (ms: number) => { time += ms; } };
}

describe("Durable conversation service semantics", () => {
  it("replays a settled request without another executor effect or audit mutation", async () => {
    const { service, execute, store } = harness();
    const created = await service.create({ retentionSeconds: 3600 });
    const request = { conversationId: created.conversationId, requestId: "first", expectedVersion: 0, question: "journal" };
    const first = await service.runTurn(request);
    const replay = await service.runTurn(request);
    expect(first).toMatchObject({ version: 2, cached: false });
    expect(replay).toMatchObject({ version: 2, cached: true, result: first.result });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(store.events.map(({ eventType }) => eventType)).toEqual(["conversation.created", "turn.started", "turn.settled"]);
    await expect(service.runTurn({ ...request, question: "another" })).rejects.toMatchObject({ code: "REQUEST_KEY_REUSED" });
  });

  it("excludes concurrent turns and memory writes while the reserved turn is active", async () => {
    const started = Promise.withResolvers<void>(), finish = Promise.withResolvers<void>();
    const { service } = harness({ execute: async (_question, context) => {
      started.resolve(); await finish.promise;
      return { ok: false, runId: context.runId, error: { code: "CANCELLED", stage: "orchestration", message: "Cancelled", retryable: false } };
    } });
    const created = await service.create({ retentionSeconds: 3600 });
    const pending = service.runTurn({ conversationId: created.conversationId, requestId: "first", expectedVersion: 0, question: "journal" });
    await started.promise;
    await expect(service.runTurn({ conversationId: created.conversationId, requestId: "second", expectedVersion: 1, question: "another" })).rejects.toMatchObject({ code: "CONVERSATION_BUSY" });
    await expect(service.writeMemory({ conversationId: created.conversationId, expectedVersion: 1, key: "topic", value: "journals", ttlSeconds: 60 })).rejects.toMatchObject({ code: "CONVERSATION_BUSY" });
    finish.resolve(); expect(await pending).toMatchObject({ version: 2 });
  });

  it("rejects stale versions and constrains memory to explicit scope and retention", async () => {
    const { service, execute, advance } = harness();
    const first = await service.create({ retentionSeconds: 3600 });
    const other = await service.create({ retentionSeconds: 3600 });
    const written = await service.writeMemory({ conversationId: first.conversationId, expectedVersion: 0, key: "topic", value: "private note", ttlSeconds: 30 });
    expect(written.version).toBe(1);
    expect((await service.read(other.conversationId)).memories).toEqual([]);
    await expect(service.runTurn({ conversationId: first.conversationId, requestId: "first", expectedVersion: 0, question: "journal" })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await expect(service.writeMemory({ conversationId: first.conversationId, expectedVersion: 1, key: "topic", value: "note", ttlSeconds: 3601 })).rejects.toMatchObject({ code: "RETENTION_INVALID" });
    advance(30_000);
    expect((await service.read(first.conversationId)).memories).toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });

  it("passes only bounded settled history and unexpired explicit memories to execution", async () => {
    const { service, execute } = harness();
    const created = await service.create({ retentionSeconds: 3600 });
    await service.writeMemory({ conversationId: created.conversationId, expectedVersion: 0, key: "topic", value: "journal", ttlSeconds: 300 });
    let version = 1;
    for (let index = 0; index < 8; index++) {
      const result = await service.runTurn({ conversationId: created.conversationId, requestId: `request-${index}`, expectedVersion: version, question: `question ${index}` });
      version = result.version;
    }
    const context = execute.mock.calls.at(-1)![1];
    expect(context.history).toHaveLength(6);
    expect(context.history[0]?.question).toBe("question 1");
    expect(context.memories.map(({ value }) => value)).toEqual(["journal"]);
    expect(JSON.stringify(await service.audit(created.conversationId))).not.toContain("question 1");
    expect(JSON.stringify(await service.audit(created.conversationId))).not.toContain('"value"');
  });

  it("settles a returned cancellation result after caller cancellation using a fresh signal", async () => {
    const caller = new AbortController();
    const { service, store } = harness({ execute: async (_question, context) => {
      caller.abort(new Error("caller cancelled"));
      return { ok: false, runId: context.runId, error: { code: "CANCELLED", stage: "orchestration", message: "Cancelled", retryable: false } };
    } });
    const settle = vi.spyOn(store, "settle");
    const created = await service.create({ retentionSeconds: 3600 });
    expect(await service.runTurn({ conversationId: created.conversationId, requestId: "first", expectedVersion: 0, question: "journal" }, caller.signal))
      .toMatchObject({ result: { ok: false, error: { code: "CANCELLED" } } });
    expect(settle.mock.calls[0]?.[1]).not.toBe(caller.signal);
    expect(settle.mock.calls[0]?.[1].aborted).toBe(false);
  });

  it("requires explicit expired-turn recovery and fences a late executor", async () => {
    const started = Promise.withResolvers<void>(), finish = Promise.withResolvers<void>();
    const { service, advance } = harness({ execute: async (_question, context) => {
      started.resolve(); await finish.promise;
      return { ok: false, runId: context.runId, error: { code: "CANCELLED", stage: "orchestration", message: "Cancelled", retryable: false } };
    } });
    const created = await service.create({ retentionSeconds: 3600 });
    const request = { conversationId: created.conversationId, requestId: "first", expectedVersion: 0, question: "journal" };
    const pending = service.runTurn(request);
    const rejected = expect(pending).rejects.toMatchObject({ code: "TURN_FENCED" });
    await started.promise;
    await expect(service.recover({ conversationId: created.conversationId, requestId: "first", expectedVersion: 1 })).rejects.toMatchObject({ code: "CONVERSATION_BUSY" });
    advance(30_000);
    expect(await service.recover({ conversationId: created.conversationId, requestId: "first", expectedVersion: 1 })).toMatchObject({ version: 2, turns: [{ status: "interrupted" }] });
    finish.resolve(); await rejected;
    await expect(service.runTurn(request)).rejects.toMatchObject({ code: "TURN_INTERRUPTED" });
  });

  it("does not report completion or repeat execution after settlement failure", async () => {
    const { service, store, execute } = harness();
    const created = await service.create({ retentionSeconds: 3600 }); store.failSettlement = true;
    const request = { conversationId: created.conversationId, requestId: "first", expectedVersion: 0, question: "journal" };
    await expect(service.runTurn(request)).rejects.toMatchObject({ code: "STATE_REPOSITORY_FAILURE" });
    await expect(service.runTurn(request)).rejects.toMatchObject({ code: "CONVERSATION_BUSY" });
    expect(execute).toHaveBeenCalledTimes(1);
    expect((await service.read(created.conversationId)).turns[0]?.status).toBe("running");
  });

  it("bounds settlement even when a substituted store ignores cancellation", async () => {
    const store = new FakeConversationStore();
    store.settle = async () => new Promise(() => {});
    const { service } = harness({ store, settlementTimeoutMs: 10 });
    const created = await service.create({ retentionSeconds: 3600 });
    await expect(service.runTurn({ conversationId: created.conversationId, requestId: "first", expectedVersion: 0, question: "journal" }))
      .rejects.toMatchObject({ code: "STATE_REPOSITORY_FAILURE" });
  });

  it("excludes expired conversation content before explicit physical purge", async () => {
    const { service, store, advance } = harness();
    const created = await service.create({ retentionSeconds: 60 });
    await service.writeMemory({ conversationId: created.conversationId, expectedVersion: 0, key: "topic", value: "private value", ttlSeconds: 30 });
    advance(60_000);
    await expect(service.read(created.conversationId)).rejects.toMatchObject({ code: "CONVERSATION_EXPIRED" });
    expect(store.records.has(created.conversationId)).toBe(true);
    expect(await service.purge()).toEqual({ conversations: 1, memories: 1, audits: 0 });
    expect(store.records.has(created.conversationId)).toBe(false);
    const audit = await service.audit(created.conversationId);
    expect(audit.at(-1)?.eventType).toBe("conversation.purged");
    expect(JSON.stringify(audit)).not.toContain("private value");
  });

  it("rejects substituted state identities before executing effects", async () => {
    const { service, store, execute } = harness();
    const created = await service.create({ retentionSeconds: 3600 });
    const original = store.reserve.bind(store);
    store.reserve = async (...args) => {
      const raw = await original(...args);
      return { ...raw, snapshot: { ...raw.snapshot, conversationId: "another" } };
    };
    await expect(service.runTurn({ conversationId: created.conversationId, requestId: "first", expectedVersion: 0, question: "journal" }))
      .rejects.toMatchObject({ code: "STATE_INVALID" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("uses the injected clock to hide expired audit before physical removal", async () => {
    const { service, store, advance } = harness();
    const created = await service.create({ retentionSeconds: 60 });
    advance(31 * 86400_000);
    expect(await service.audit(created.conversationId)).toEqual([]);
    expect(store.events).toHaveLength(1);
    expect(await service.purge()).toMatchObject({ audits: 1 });
    expect((await service.audit(created.conversationId)).map(({ eventType }) => eventType)).toEqual(["conversation.purged"]);
  });
});
