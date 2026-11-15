import { randomUUID } from "node:crypto";

import dataset from "../../fixtures/evaluations/internal-docs.v1.json" with { type: "json" };
import { FilesystemEvaluationReport } from "../adapters/outbound/filesystem-evaluation-report.js";
import { Sha256ContentIdentity } from "../adapters/outbound/sha256-content-identity.js";
import { SystemClock } from "../adapters/outbound/system-clock.js";
import { createRunEvaluation } from "../application/run-evaluation.js";
import { createConversationRuntime } from "./create-conversation-runtime.js";
import { createEvaluationExecution } from "./create-evaluation-execution.js";
import type { RetrievalResourceOptions } from "./create-retrieval-resources.js";
import type { CreateRuntimeOptions, Runtime } from "./create-runtime.js";
import type { GroundedRuntimeFactory } from "./create-grounded-runtime.js";

export async function createEvaluationRuntime(options: CreateRuntimeOptions & RetrievalResourceOptions & { reportRoot: string; groundedFactory?: GroundedRuntimeFactory }): Promise<Runtime> {
  const runtime = await createConversationRuntime(options);
  const evaluate = createRunEvaluation({
    executor: createEvaluationExecution(options), reports: new FilesystemEvaluationReport({ root: options.reportRoot }),
    resolveCitation: runtime.resolveCitation!, clock: new SystemClock(), identity: new Sha256ContentIdentity(),
    ids: { next: (kind) => `${kind}-${randomUUID()}` },
  });
  return { ...runtime, evaluate: (signal = new AbortController().signal) => evaluate(dataset, signal) };
}
