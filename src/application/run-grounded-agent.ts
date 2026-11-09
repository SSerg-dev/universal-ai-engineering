import {
  GroundedModelActionSchema, GroundedRunAgentResultSchema,
  type GroundedAnswer, type GroundedRunAgentResult,
} from "../domain/retrieval-contracts.js";
import { renderGroundedAnswer, validateGroundedAnswer } from "./grounded-answer.js";
import { createRegisteredRunAgentUseCase, type RegisteredRunAgentDependencies } from "./run-registered-agent.js";

export function createGroundedRunAgentUseCase(dependencies: RegisteredRunAgentDependencies) {
  return async (input: unknown, signal?: AbortSignal): Promise<GroundedRunAgentResult> => {
    // Each invocation owns its evidence/grounding; concurrent runs share no mutable answer state.
    let grounding: GroundedAnswer | undefined;
    const run = createRegisteredRunAgentUseCase({
      ...dependencies,
      model: {
        async request(request, activeSignal) {
          const raw = await dependencies.model.request(request, activeSignal);
          activeSignal.throwIfAborted();
          const action = GroundedModelActionSchema.safeParse(raw);
          if (!action.success) return { type: "invalid_grounded_action" };
          if (action.data.type === "call_tool") return action.data;
          if (request.state !== "awaiting_final") return { type: "invalid_grounded_action" };
          try { grounding = validateGroundedAnswer(action.data.grounding, request.toolResult.output); }
          catch { return { type: "invalid_grounded_action" }; }
          return {
            type: "final_answer", answer: renderGroundedAnswer(grounding),
            sourceIds: [...new Set(grounding.claims.map(({ citation }) => citation.documentId))],
          };
        },
      },
    });
    const result = await run(input, signal);
    if (!result.ok) return result;
    return GroundedRunAgentResultSchema.parse({ ...result, grounding });
  };
}
