import { JsonlJournal } from "../adapters/outbound/jsonl-journal.js";
import { SystemIdGenerator } from "../adapters/outbound/system-id-generator.js";
import type { EvaluationExecutionPort } from "../application/ports/evaluation-execution-port.js";
import { EvaluationBoundaryError, EvaluationCaseSchema } from "../domain/evaluation-contracts.js";
import { RegisteredAgentEventEnvelopeSchema, type RegisteredAgentEventEnvelope } from "../domain/tool-events.js";
import { createGroundedRuntime, type GroundedRuntimeFactory, type GroundedRuntimeOptions } from "./create-grounded-runtime.js";

export function createEvaluationExecution(options: Pick<GroundedRuntimeOptions,
  "databaseUrl" | "indexId" | "fixtureRoot" | "journalRoot"> & { groundedFactory?: GroundedRuntimeFactory }): EvaluationExecutionPort {
  return {
    async execute(rawCase, runId, signal) {
      signal.throwIfAborted();
      const testCase = EvaluationCaseSchema.parse(rawCase);
      if (!/^run-[A-Za-z0-9_-]{1,123}$/u.test(runId)) throw new EvaluationBoundaryError("EVALUATION_INVALID");
      const events: RegisteredAgentEventEnvelope[] = [], observedPassageIds: string[] = [];
      const journal = new JsonlJournal({ root: options.journalRoot });
      const generated = new SystemIdGenerator();
      const runtime = await (options.groundedFactory ?? createGroundedRuntime)({
        ...options, ids: { next: (kind) => kind === "run" ? runId : generated.next(kind) },
        allowedTools: new Set(testCase.scenario === "deny_tool" ? [] : ["retrieve_passages"]),
        onRetrieved: (ids) => observedPassageIds.push(...ids),
        journal: { append: async (event, activeSignal) => {
          const parsed = RegisteredAgentEventEnvelopeSchema.parse(event);
          await journal.append(parsed, activeSignal);
          events.push(parsed);
        } },
      });
      const result = await runtime.runAgent({ question: testCase.question }, signal);
      return { result, events, observedPassageIds };
    },
  };
}
