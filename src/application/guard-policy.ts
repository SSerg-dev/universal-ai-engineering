import { GuardBoundaryError, GuardPolicyBodySchema, GuardPolicySchema, GuardAuditEventSchema,
  type GuardPolicy, type GuardGateReason, type GuardCheckpoint } from "../domain/guard-contracts.js";
import type { ToolObservation } from "../domain/tool-contracts.js";
import type { ContentIdentityPort } from "./ports/content-identity-port.js";
import type { ClockPort } from "./ports/clock-port.js";
import type { GuardAuditPort, GuardIdPort } from "./ports/guard-ports.js";
import type { RunCheckpointsPort, RunCheckpointContext, CallCheckpointContext } from "./ports/run-checkpoints-port.js";

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Canonical schema property order, not the input JSON object's key order. */
export function loadGuardPolicy(input: unknown, identity: ContentIdentityPort): GuardPolicy {
  try {
    const parsed = GuardPolicySchema.parse(input);
    const { revision, ...body } = parsed;
    if (identity.digest(JSON.stringify(GuardPolicyBodySchema.parse(body))) !== revision) throw new Error();
    return freeze(parsed);
  } catch { throw new GuardBoundaryError("GUARD_POLICY_INVALID"); }
}

function containsMarker(value: string, markers: readonly string[]): boolean {
  const normalized = value.normalize("NFKC").toLowerCase();
  return markers.some((marker) => normalized.includes(marker.normalize("NFKC").toLowerCase()));
}

function serializedReason(value: unknown, limit: number, tooLarge: GuardGateReason): GuardGateReason {
  try {
    const text = JSON.stringify(value);
    return typeof text !== "string" ? "VALUE_INVALID" : text.length > limit ? tooLarge : "ALLOWED";
  } catch { return "VALUE_INVALID"; }
}

export function createGuardCheckpoints(options: {
  policy: GuardPolicy; identity: ContentIdentityPort; audit: GuardAuditPort; clock: ClockPort; ids: GuardIdPort;
}): RunCheckpointsPort<ToolObservation> {
  const policy = loadGuardPolicy(options.policy, options.identity);
  const checked = async (checkpoint: GuardCheckpoint, reason: GuardGateReason, context: RunCheckpointContext | CallCheckpointContext, signal: AbortSignal) => {
    signal.throwIfAborted();
    try {
      const { sequence: _sequence, ...draft } = GuardAuditEventSchema.parse({
        schemaVersion: "guard-audit-1.0", eventId: options.ids.next("operation"), scopeId: context.runId,
        sequence: 1, timestamp: options.clock.now(), policyId: policy.policyId, policyRevision: policy.revision,
        actor: "host", kind: "policy.checked", payload: { checkpoint, allowed: reason === "ALLOWED", reason,
          ...("callId" in context ? { callId: context.callId, step: context.step } : {}) },
      });
      await options.audit.append(draft, signal);
    } catch { throw new GuardBoundaryError("GUARD_AUDIT_FAILURE"); }
    signal.throwIfAborted();
    return reason === "ALLOWED";
  };
  return {
    request: async ({ question }, context, signal) => checked("request", question.length > policy.input.maxCharacters ? "INPUT_TOO_LONG"
      : containsMarker(question, policy.input.blockedMarkers) ? "INPUT_MARKER_BLOCKED" : "ALLOWED", context, signal),
    modelAction: async (action, context, signal) => {
      const reason = action.type !== "final_answer" ? "ALLOWED" : action.answer.length > policy.output.maxCharacters ? "MODEL_OUTPUT_TOO_LARGE"
        : containsMarker(action.answer, policy.output.blockedMarkers) ? "OUTPUT_MARKER_BLOCKED" : "ALLOWED";
      return checked("model_action", reason, context, signal);
    },
    toolInvocation: async (action, context, signal) => checked("tool_invocation", !policy.tools.allowed.includes(action.toolName) ? "TOOL_DENIED"
      : serializedReason(action.arguments, policy.tools.maxArgumentCharacters, "TOOL_ARGUMENTS_TOO_LARGE"), context, signal),
    toolObservation: async (observation, context, signal) => checked("tool_observation",
      serializedReason(observation, policy.tools.maxObservationCharacters, "TOOL_OUTPUT_TOO_LARGE"), context, signal),
  };
}
