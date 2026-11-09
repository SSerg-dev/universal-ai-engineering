import { randomUUID } from "node:crypto";

import { PostgresConversationStore } from "../adapters/outbound/postgres-conversation-store.js";
import { Sha256ContentIdentity } from "../adapters/outbound/sha256-content-identity.js";
import { SystemClock } from "../adapters/outbound/system-clock.js";
import { SystemIdGenerator } from "../adapters/outbound/system-id-generator.js";
import { createConversationCommandHandler } from "../application/conversation-command.js";
import { createConversationService } from "../application/conversation-service.js";
import { GroundedRunAgentResultSchema } from "../domain/retrieval-contracts.js";
import { createGroundedRuntime } from "./create-grounded-runtime.js";
import { createRetrievalResources, type RetrievalResourceOptions } from "./create-retrieval-resources.js";
import type { CreateRuntimeOptions, Runtime } from "./create-runtime.js";

export async function createConversationRuntime(options: CreateRuntimeOptions & RetrievalResourceOptions): Promise<Runtime> {
  createRetrievalResources(options); // Validate configuration before constructing a store.
  const store = new PostgresConversationStore({ connectionString: options.databaseUrl as string });
  await store.initialize(new AbortController().signal);
  const standalone = await createGroundedRuntime(options);
  const service = createConversationService({
    store, clock: new SystemClock(), identity: new Sha256ContentIdentity(),
    ids: { next: (kind) => `${kind}-${randomUUID()}` },
    executor: { execute: async (question, context, signal) => {
      const generated = new SystemIdGenerator();
      const runtime = await createGroundedRuntime({ ...options, context,
        ids: { next: (kind) => kind === "run" ? context.runId : generated.next(kind) } });
      return GroundedRunAgentResultSchema.parse(await runtime.runAgent({ question }, signal));
    } },
  });
  return { ...standalone, conversationCommand: createConversationCommandHandler(service) };
}
