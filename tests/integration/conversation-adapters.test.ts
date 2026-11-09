import { describe, expect, it, vi } from "vitest";

import { runCli } from "../../src/adapters/inbound/cli.js";
import { buildHttpApp } from "../../src/adapters/inbound/http.js";
import { Sha256ContentIdentity } from "../../src/adapters/outbound/sha256-content-identity.js";
import { createConversationCommandHandler } from "../../src/application/conversation-command.js";
import { createConversationService } from "../../src/application/conversation-service.js";
import { ConversationCommandSchema } from "../../src/domain/conversation-command-contracts.js";
import { StateBoundaryError } from "../../src/domain/state-contracts.js";
import { FakeConversationStore } from "../fixtures/fake-conversation-store.js";

const runAgent = vi.fn(async () => ({ ok: false as const, runId: "unused", error: {
  code: "INTERNAL_ERROR" as const, stage: "orchestration" as const, message: "unused", retryable: false,
} }));
function handler() {
  let sequence = 0;
  return createConversationCommandHandler(createConversationService({
    store: new FakeConversationStore(), clock: { now: () => "2026-11-09T00:00:00.000Z" },
    identity: new Sha256ContentIdentity(), ids: { next: (kind) => `${kind}-${++sequence}` },
    executor: { execute: async (_question, context) => ({ ok: false, runId: context.runId,
      error: { code: "CANCELLED", stage: "orchestration", message: "Cancelled", retryable: false } }) },
  }));
}

describe("Explicit conversation command boundaries", () => {
  it("rejects unregistered operations and extra authority fields", () => {
    for (const value of [{ operation: "create" }, { operation: "delete_all" },
      { operation: "create", retentionSeconds: 60, leaseToken: "forged" },
      { operation: "purge", now: "2099-01-01T00:00:00.000Z" }]) {
      expect(ConversationCommandSchema.safeParse(value).success).toBe(false);
    }
  });

  it("routes the same explicit state command through CLI and HTTP without a standalone run", async () => {
    const conversationCommand = handler(), stdout: string[] = [];
    const status = await runCli({ argv: ["state", JSON.stringify({ operation: "create", retentionSeconds: 60 })],
      stdout: { write: (text) => stdout.push(text) }, stderr: { write: () => {} },
      runtimeFactory: async () => ({ runAgent, conversationCommand }),
    });
    expect(status).toBe(0);
    const created = JSON.parse(stdout.join(""));
    const app = buildHttpApp({ runAgent, conversationCommand });
    try {
      const response = await app.inject({ method: "POST", url: "/api/v1/conversation-commands",
        payload: { operation: "read", conversationId: created.value.conversationId } });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ operation: "read", value: created.value });
      expect(runAgent).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });

  it.each([
    { error: new StateBoundaryError("STATE_INPUT_INVALID"), status: 400, code: "STATE_INPUT_INVALID" },
    { error: new StateBoundaryError("VERSION_CONFLICT"), status: 409, code: "VERSION_CONFLICT" },
    { error: new StateBoundaryError("CONVERSATION_EXPIRED"), status: 410, code: "CONVERSATION_EXPIRED" },
    { error: new Error("secret database URL"), status: 500, code: "STATE_REPOSITORY_FAILURE" },
  ])("normalizes state HTTP $status without content or raw exceptions", async ({ error, status, code }) => {
    const app = buildHttpApp({ runAgent, conversationCommand: async () => { throw error; } });
    try {
      const response = await app.inject({ method: "POST", url: "/api/v1/conversation-commands", payload: { operation: "purge" } });
      expect(response.statusCode).toBe(status); expect(response.json()).toMatchObject({ ok: false, error: { code } });
      expect(response.body).not.toMatch(/secret|database URL|stack/u);
    } finally { await app.close(); }
  });

  it("rejects malformed CLI JSON with a safe typed error", async () => {
    const stderr: string[] = [];
    expect(await runCli({ argv: ["state", "not JSON"], stdout: { write: () => {} }, stderr: { write: (text) => stderr.push(text) },
      runtimeFactory: async () => ({ runAgent, conversationCommand: handler() }),
    })).toBe(1);
    expect(stderr.join("")).toBe("Error [STATE_INPUT_INVALID]: The conversation state operation could not be completed.\n");
  });
});
