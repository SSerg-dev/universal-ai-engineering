import { describe, expect, it } from "vitest";

import {
  ConversationSnapshotSchema, ConversationTurnSchema, CreateConversationInputSchema,
  MemoryRecordSchema, RunConversationTurnInputSchema, StateAuditEventSchema, WriteMemoryInputSchema,
} from "../../src/domain/state-contracts.js";

const createdAt = "2026-11-09T00:00:00.000Z";
const expiresAt = "2026-11-09T01:00:00.000Z";
const turn = {
  requestId: "request-one", runId: "run-one", inputHash: "a".repeat(64), question: "journal",
  startedAt: createdAt, status: "running", leaseExpiresAt: "2026-11-09T00:00:30.000Z",
} as const;
const snapshot = { conversationId: "conversation-one", version: 1, createdAt, expiresAt, turns: [turn], memories: [] };
const memory = { conversationId: snapshot.conversationId, key: "preferred_topic", value: "journals", version: 1,
  createdAt, updatedAt: createdAt, expiresAt };

describe("Durable conversation and explicit memory contracts", () => {
  it("requires explicit bounded retention with no automatic default", () => {
    expect(CreateConversationInputSchema.parse({ retentionSeconds: 3600 })).toEqual({ retentionSeconds: 3600 });
    for (const raw of [{}, { retentionSeconds: 0 }, { retentionSeconds: 604801 }, { retentionSeconds: 3600, question: "secret" }]) {
      expect(CreateConversationInputSchema.safeParse(raw).success).toBe(false);
    }
  });

  it("accepts bounded versioned snapshots and omits private lease tokens", () => {
    expect(ConversationSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(ConversationSnapshotSchema.safeParse({ ...snapshot, turns: [{ ...turn, leaseToken: "private" }] }).success).toBe(false);
  });

  it.each([
    { ...snapshot, turns: [turn, turn] },
    { ...snapshot, turns: [turn, { ...turn, requestId: "another", runId: "another-run" }] },
    { ...snapshot, turns: [{ ...turn, leaseExpiresAt: "2026-11-09T00:00:31.000Z" }] },
    { ...snapshot, expiresAt: "2026-11-09T00:00:00.000Z" },
    { ...snapshot, expiresAt: "2026-11-17T00:00:00.000Z" },
  ])("rejects invalid scope, duplicate/parallel turns, and lease lifetimes", (value) => {
    expect(ConversationSnapshotSchema.safeParse(value).success).toBe(false);
  });

  it("requires safe request keys, expected versions, and bounded questions", () => {
    const request = { conversationId: snapshot.conversationId, requestId: "request-one", expectedVersion: 0, question: " journal " };
    expect(RunConversationTurnInputSchema.parse(request).question).toBe("journal");
    for (const raw of [{ ...request, requestId: "../escape" }, { ...request, expectedVersion: -1 },
      { ...request, question: "x".repeat(2049) }, { ...request, leaseToken: "forged" }]) {
      expect(RunConversationTurnInputSchema.safeParse(raw).success).toBe(false);
    }
  });

  it("ties a settled turn to its allocated run ID", () => {
    const { leaseExpiresAt: _lease, ...identity } = turn;
    const settled = { ...identity, status: "settled", settledAt: createdAt, result: {
      ok: false, runId: "run-another", error: { code: "CANCELLED", stage: "orchestration", message: "Cancelled", retryable: false },
    } };
    expect(ConversationTurnSchema.safeParse(settled).success).toBe(false);
    expect(ConversationTurnSchema.safeParse({ ...settled, result: { ...settled.result, runId: turn.runId } }).success).toBe(true);
  });

  it("scopes memory by conversation, bounds TTL, and requires an explicit write payload", () => {
    expect(MemoryRecordSchema.parse(memory)).toEqual(memory);
    expect(ConversationSnapshotSchema.safeParse({ ...snapshot, memories: [{ ...memory, conversationId: "another" }] }).success).toBe(false);
    expect(ConversationSnapshotSchema.safeParse({ ...snapshot, memories: [{ ...memory, version: 2 }] }).success).toBe(false);
    expect(ConversationSnapshotSchema.safeParse({ ...snapshot, memories: [{ ...memory, expiresAt: "2026-11-09T02:00:00.000Z" }] }).success).toBe(false);
    expect(WriteMemoryInputSchema.safeParse({ conversationId: snapshot.conversationId, expectedVersion: 1, key: "topic", value: "journal", ttlSeconds: 60 }).success).toBe(true);
    expect(WriteMemoryInputSchema.safeParse({ conversationId: snapshot.conversationId, expectedVersion: 1, key: "topic", value: "journal", ttlSeconds: 0 }).success).toBe(false);
  });

  it("rejects content in audit events and matches settlement outcome codes", () => {
    const audit = { schemaVersion: "state-1.0", operationId: "operation-one", conversationId: snapshot.conversationId,
      sequence: 1, occurredAt: createdAt, eventType: "turn.started", payload: { requestId: turn.requestId, runId: turn.runId } };
    expect(StateAuditEventSchema.parse(audit)).toEqual(audit);
    expect(StateAuditEventSchema.safeParse({ ...audit, payload: { ...audit.payload, question: "secret" } }).success).toBe(false);
    const settled = { ...audit, eventType: "turn.settled", payload: { ...audit.payload, ok: false } };
    expect(StateAuditEventSchema.safeParse(settled).success).toBe(false);
    expect(StateAuditEventSchema.safeParse({ ...settled, payload: { ...settled.payload, errorCode: "CANCELLED" } }).success).toBe(true);
  });
});
