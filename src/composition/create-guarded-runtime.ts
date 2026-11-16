import { randomUUID } from "node:crypto";
import policyJson from "../../fixtures/policies/local-course.v1.json" with { type: "json" };
import { FilesystemApprovedExport } from "../adapters/outbound/filesystem-approved-export.js";
import { PostgresApprovalStore } from "../adapters/outbound/postgres-approval-store.js";
import { Sha256ContentIdentity } from "../adapters/outbound/sha256-content-identity.js";
import { SystemClock } from "../adapters/outbound/system-clock.js";
import { SystemIdGenerator } from "../adapters/outbound/system-id-generator.js";
import { createGuardCheckpoints, loadGuardPolicy } from "../application/guard-policy.js";
import { createGuardService } from "../application/guard-service.js";
import { GroundedRunAgentResultSchema } from "../domain/retrieval-contracts.js";
import type { GroundedRuntimeFactory } from "./create-grounded-runtime.js";
import { createObservedGroundedRuntime } from "./create-observed-grounded-runtime.js";
import { createRetrievalResources, type RetrievalResourceOptions } from "./create-retrieval-resources.js";
import { createStreamingRuntime } from "./create-streaming-runtime.js";
import type { CreateRuntimeOptions, Runtime } from "./create-runtime.js";

export async function createGuardedRuntime(options: CreateRuntimeOptions & RetrievalResourceOptions & {
  reportRoot: string; telemetryRoot: string; exportRoot: string; guardPolicy?: unknown;
}): Promise<Runtime> {
  const identity = new Sha256ContentIdentity(), clock = new SystemClock();
  // Reject policy substitution before connecting to or initializing a database.
  const policy = loadGuardPolicy(options.guardPolicy ?? policyJson, identity);
  createRetrievalResources(options);
  const store = new PostgresApprovalStore({ connectionString: options.databaseUrl as string });
  await store.initialize(new AbortController().signal);
  const ids = { next: (kind: "operation" | "approval" | "lease" | "run") => `${kind}-${randomUUID()}` };
  const groundedFactory: GroundedRuntimeFactory = (grounded) => createObservedGroundedRuntime({ ...grounded,
    telemetryRoot: options.telemetryRoot,
    allowedTools: new Set(policy.tools.allowed.filter((name) => grounded.allowedTools === undefined || grounded.allowedTools.has(name))),
    runPolicy: { timeoutMs: policy.budget.timeoutMs, terminalEvidenceTimeoutMs: 250,
      maxModelCalls: policy.budget.maxModelCalls, maxToolCalls: policy.budget.maxToolCalls },
    toolTimeoutMs: policy.budget.toolTimeoutMs,
    checkpoints: createGuardCheckpoints({ policy, identity, clock, ids, audit: store }),
  });
  const runtime = await createStreamingRuntime({ ...options, groundedFactory });
  const service = createGuardService({ policy, identity, clock, ids, store, audit: store,
    exporter: new FilesystemApprovedExport({ root: options.exportRoot, clock }),
    answer: { execute: async (question, runId, signal) => {
      const generated = new SystemIdGenerator();
      const guarded = await groundedFactory({ ...options,
        ids: { next: (kind) => kind === "run" ? runId : generated.next(kind) } });
      return GroundedRunAgentResultSchema.parse(await guarded.runAgent({ question }, signal));
    } },
  });
  return { ...runtime, guardCommand: service.command };
}
