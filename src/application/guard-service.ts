import { z } from "zod";
import { ApprovalIntentSchema, ApprovalSnapshotSchema, ApprovalViewSchema, GuardAuditEventSchema,
  GuardBoundaryError, GuardCommandSchema, GuardCommandSuccessSchema, type ApprovalSnapshot, type GuardAuditDraft,
  type GuardBoundaryCode, type GuardCommand, type GuardPolicy } from "../domain/guard-contracts.js";
import { StateIdSchema, StateTimestampSchema } from "../domain/state-contracts.js";
import { GroundedRunAgentResultSchema } from "../domain/retrieval-contracts.js";
import { assertApprovalTransition, assertApprovalTransitionAudit } from "../domain/approval-transitions.js";
import { loadGuardPolicy } from "./guard-policy.js";
import { validateApprovalSnapshot, validatePreparedExport } from "./validate-approval.js";
import type { ClockPort } from "./ports/clock-port.js";
import type { ContentIdentityPort } from "./ports/content-identity-port.js";
import type { ApprovalStorePort, ApprovedExportPort, GuardAuditPort, GuardedAnswerPort, GuardIdPort } from "./ports/guard-ports.js";

type TransitionCode = Extract<GuardAuditDraft, { kind: "approval.transition" }>["payload"]["code"];
type Decision = Extract<GuardCommand, { operation: "approve" | "deny" | "execute" | "reconcile" }>;
const failure = (code: GuardBoundaryCode): never => { throw new GuardBoundaryError(code); };

/** Bound waiting even when an adapter ignores the supplied cancellation signal. */
async function bounded<T>(work: (signal: AbortSignal) => Promise<T>, parent: AbortSignal | undefined, timeoutMs: number, code: GuardBoundaryCode): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort(parent?.reason ?? new GuardBoundaryError("GUARD_CANCELLED"));
  if (parent?.aborted) abort(); else parent?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => controller.abort(new GuardBoundaryError(code)), Math.max(1, timeoutMs));
  let remove = () => {};
  try {
    controller.signal.throwIfAborted();
    return await new Promise<T>((resolve, reject) => {
      const cancelled = () => reject(controller.signal.reason);
      controller.signal.addEventListener("abort", cancelled, { once: true });
      remove = () => controller.signal.removeEventListener("abort", cancelled);
      Promise.resolve().then(() => { controller.signal.throwIfAborted(); return work(controller.signal); }).then(resolve, reject);
    });
  } finally { clearTimeout(timeout); remove(); parent?.removeEventListener("abort", abort); }
}

export function createGuardService(deps: {
  policy: GuardPolicy; identity: ContentIdentityPort; clock: ClockPort; ids: GuardIdPort;
  store: ApprovalStorePort; audit: GuardAuditPort; answer: GuardedAnswerPort; exporter: ApprovedExportPort;
}) {
  const policy = loadGuardPolicy(deps.policy, deps.identity);
  const now = () => StateTimestampSchema.parse(deps.clock.now());
  const id = (kind: Parameters<GuardIdPort["next"]>[0]) => StateIdSchema.parse(deps.ids.next(kind));
  const stamp = (current: ApprovalSnapshot) => ({ version: current.version + 1, updatedAt: now() });
  const event = (next: ApprovalSnapshot, from: ApprovalSnapshot["state"] | null, code: TransitionCode): GuardAuditDraft => ({
    schemaVersion: "guard-audit-1.0", eventId: id("operation"), scopeId: next.approvalId, timestamp: next.updatedAt,
    policyId: next.policyId, policyRevision: next.policyRevision,
    actor: ["OPERATOR_APPROVED", "OPERATOR_DENIED", "EXECUTION_RESERVED"].includes(code) ? "local_operator" : "host",
    kind: "approval.transition", payload: { from, to: next.state, version: next.version, code },
  });
  const storeCall = async <T>(work: (signal: AbortSignal) => Promise<T>, signal: AbortSignal) => {
    try { return await bounded(work, signal, 4000, "GUARD_STORE_FAILURE"); }
    catch (error) { if (error instanceof GuardBoundaryError) throw error; return failure("GUARD_STORE_FAILURE"); }
  };
  const view = (value: ApprovalSnapshot) => {
    return ApprovalViewSchema.parse({ approvalId: value.approvalId, requestId: value.requestId, runId: value.runId,
      state: value.state, version: value.version, policyId: value.policyId, policyRevision: value.policyRevision,
      createdAt: value.createdAt, updatedAt: value.updatedAt, expiresAt: value.expiresAt,
      intent: value.intent, proposalDigest: value.proposalDigest, payload: value.payload,
      ...("receipt" in value ? { receipt: value.receipt } : {}), ...("code" in value ? { code: value.code } : {}) });
  };

  async function transition(current: ApprovalSnapshot, rawNext: unknown, code: TransitionCode, signal: AbortSignal, recover = false): Promise<ApprovalSnapshot> {
    const next = validateApprovalSnapshot(rawNext, deps.identity), draft = event(next, current.state, code);
    const token = "lease" in current ? current.lease.token : undefined;
    assertApprovalTransition(current, next, token, recover); assertApprovalTransitionAudit(current, next, draft);
    const saved = validateApprovalSnapshot(await storeCall((active) => deps.store.transition({ expectedVersion: current.version,
      ...(token ? { expectedLeaseToken: token } : {}), ...(recover ? { recoverExpiredLease: true } : {}), snapshot: next, event: draft }, active), signal), deps.identity);
    if (JSON.stringify(saved) !== JSON.stringify(next)) failure("GUARD_RESULT_INVALID");
    return saved;
  }

  async function refresh(current: ApprovalSnapshot, signal: AbortSignal): Promise<ApprovalSnapshot> {
    const at = now(), expired = Date.parse(at) >= Date.parse(current.expiresAt), update = { version: current.version + 1, updatedAt: at };
    if (current.state === "preparing" && (expired || Date.parse(at) >= Date.parse(current.lease.expiresAt))) {
      const { lease: _lease, ...base } = current;
      return transition(current, { ...base, ...update, state: expired ? "expired" : "preparation_failed",
        code: expired ? "GUARD_EXPIRED" : "GUARD_PREPARATION_FAILED" }, expired ? "APPROVAL_EXPIRED" : "PREPARATION_FAILED", signal, true);
    }
    if (current.state === "executing" && Date.parse(at) >= Date.parse(current.lease.expiresAt)) {
      const { lease: _lease, ...base } = current;
      const uncertain = await transition(current, { ...base, ...update, state: "uncertain", code: "GUARD_UNCERTAIN" }, "EXECUTION_UNCERTAIN", signal, true);
      return expired ? refresh(uncertain, signal) : uncertain;
    }
    if (expired && (current.state === "pending" || current.state === "approved")) {
      const { approvedAt: _approved, ...base } = current as typeof current & { approvedAt?: string };
      return transition(current, { ...base, ...update, state: "expired", payload: null, code: "GUARD_EXPIRED" }, "APPROVAL_EXPIRED", signal);
    }
    if (expired && current.payload && ["denied", "succeeded", "uncertain"].includes(current.state)) {
      return transition(current, { ...current, ...update, payload: null }, "PAYLOAD_PURGED", signal);
    }
    if ((current.state === "pending" || current.state === "approved") &&
      (current.policyId !== policy.policyId || current.policyRevision !== policy.revision || !policy.approval.exportEnabled)) {
      const { approvedAt: _approved, ...base } = current as typeof current & { approvedAt?: string };
      const changed = current.policyId !== policy.policyId || current.policyRevision !== policy.revision;
      return transition(current, { ...base, ...update, state: "denied", decidedAt: at,
        code: changed ? "GUARD_POLICY_CHANGED" : "GUARD_EXPORT_DISABLED" }, changed ? "POLICY_CHANGED" : "EXPORT_DISABLED", signal);
    }
    return current;
  }

  async function read(approvalId: string, signal: AbortSignal) {
    const raw = await storeCall((active) => deps.store.load(approvalId, active), signal);
    if (raw === null) return failure("GUARD_ACTION_NOT_FOUND");
    const current = validateApprovalSnapshot(raw, deps.identity);
    if (current.approvalId !== approvalId) failure("GUARD_RESULT_INVALID");
    return refresh(current, signal);
  }

  async function maintain(signal: AbortSignal) {
    const rows = await storeCall((active) => deps.store.listExpired(now(), active), signal);
    if (!Array.isArray(rows) || rows.length > 1000) failure("GUARD_RESULT_INVALID");
    let purged = 0;
    for (const row of rows) {
      const current = validateApprovalSnapshot(row, deps.identity);
      try { if ((await refresh(current, signal)).version !== current.version) purged += 1; }
      catch (error) { if (!(error instanceof GuardBoundaryError && error.code === "GUARD_VERSION_CONFLICT")) throw error; }
    }
    return { purged };
  }

  async function cleanup(current: ApprovalSnapshot, uncertain: boolean, code: GuardBoundaryCode) {
    try {
      await bounded(async (signal) => {
        const { lease: _lease, ...base } = current as typeof current & { lease?: unknown };
        await transition(current, { ...base, ...stamp(current), state: uncertain ? "uncertain" : "preparation_failed",
          code: uncertain ? "GUARD_UNCERTAIN" : code }, uncertain ? "EXECUTION_UNCERTAIN" : "PREPARATION_FAILED", signal, true);
      }, undefined, 1000, "GUARD_STORE_FAILURE");
    } catch { /* A lost write acknowledgment or expired lease remains durable and recoverable; do not retry an effect. */ }
  }

  async function prepare(command: Extract<GuardCommand, { operation: "prepare_export" }>, signal: AbortSignal) {
    if (!policy.approval.exportEnabled) failure("GUARD_EXPORT_DISABLED");
    await maintain(signal);
    const at = now();
    const initial = ApprovalSnapshotSchema.parse({ approvalId: id("approval"), requestId: command.requestId, inputDigest: deps.identity.digest(command.question),
      runId: id("run"), policyId: policy.policyId, policyRevision: policy.revision, version: 0, createdAt: at, updatedAt: at,
      expiresAt: new Date(Date.parse(at) + policy.approval.lifetimeSeconds * 1000).toISOString(),
      state: "preparing", intent: null, proposalDigest: null, payload: null,
      lease: { token: id("lease"), expiresAt: new Date(Date.parse(at) + policy.approval.leaseSeconds * 1000).toISOString() } });
    if (initial.state !== "preparing") return failure("GUARD_RESULT_INVALID");
    const reservation = await storeCall((active) => deps.store.reserve({ snapshot: initial, maxPending: policy.approval.maxPending,
      event: event(initial, null, "PREPARATION_RESERVED") }, active), signal);
    const current = validateApprovalSnapshot(reservation.snapshot, deps.identity);
    if (typeof reservation.created !== "boolean" || current.requestId !== command.requestId || current.inputDigest !== initial.inputDigest) failure("GUARD_RESULT_INVALID");
    if (!reservation.created) return refresh(current, signal);
    if (JSON.stringify(current) !== JSON.stringify(initial)) failure("GUARD_RESULT_INVALID");
    try {
      const raw = await bounded((active) => deps.answer.execute(command.question, current.runId, active), signal, policy.budget.timeoutMs + 250, "GUARD_PREPARATION_FAILED");
      const result = GroundedRunAgentResultSchema.parse(raw);
      if (!result.ok || result.runId !== current.runId) return failure("GUARD_PREPARATION_FAILED");
      const checked = validatePreparedExport({ result, markdown: `${result.answer}\n` }, deps.identity);
      if (checked.contentBytes > policy.approval.maxExportBytes) failure("GUARD_EXPORT_LIMIT");
      const intent = ApprovalIntentSchema.parse({ kind: "export_answer", format: "markdown-1.0", destinationId: "local-export",
        approvalId: current.approvalId, runId: current.runId, policyId: policy.policyId, policyRevision: policy.revision,
        contentDigest: checked.contentDigest, contentBytes: checked.contentBytes, expiresAt: current.expiresAt });
      const { lease: _lease, ...base } = current as Extract<ApprovalSnapshot, { state: "preparing" }>;
      return await transition(current, { ...base, ...stamp(current), state: "pending", intent,
        proposalDigest: deps.identity.digest(JSON.stringify(intent)), payload: checked.payload }, "PROPOSAL_PREPARED", signal);
    } catch (error) {
      const code = error instanceof GuardBoundaryError ? error.code : "GUARD_PREPARATION_FAILED";
      await cleanup(current, false, code); throw new GuardBoundaryError(code);
    }
  }

  function checkDecision(current: ApprovalSnapshot, command: Decision) {
    if (current.state === "expired") failure("GUARD_EXPIRED");
    if (current.state === "denied") failure(current.code);
    if (command.expectedVersion !== current.version) failure("GUARD_VERSION_CONFLICT");
    if (command.proposalDigest !== current.proposalDigest) failure("GUARD_DIGEST_MISMATCH");
  }

  async function decide(command: Decision, signal: AbortSignal) {
    const current = await read(command.approvalId, signal); checkDecision(current, command);
    if (command.operation === "approve") {
      if (current.state !== "pending") return failure("GUARD_APPROVAL_REQUIRED");
      const update = stamp(current);
      return transition(current, { ...current, ...update, state: "approved", approvedAt: update.updatedAt }, "OPERATOR_APPROVED", signal);
    }
    if (command.operation === "deny") {
      if (current.state !== "pending" && current.state !== "approved") return failure("GUARD_APPROVAL_REQUIRED");
      const { approvedAt: _approved, ...base } = current as typeof current & { approvedAt?: string }, update = stamp(current);
      return transition(current, { ...base, ...update, state: "denied", decidedAt: update.updatedAt, code: "GUARD_DENIED" }, "OPERATOR_DENIED", signal);
    }
    if (command.operation === "reconcile") {
      if (current.state === "executing") return failure("GUARD_BUSY");
      if (current.state !== "uncertain") return failure("GUARD_APPROVAL_REQUIRED");
      const receipt = await bounded((active) => deps.exporter.inspect({ approvalId: current.approvalId, runId: current.runId,
        contentDigest: current.intent.contentDigest, contentBytes: current.intent.contentBytes }, active), signal, 5000, "GUARD_UNCERTAIN");
      if (!receipt) return current;
      const { code: _code, ...base } = current;
      return transition(current, { ...base, ...stamp(current), state: "succeeded", receipt }, "EXPORT_SUCCEEDED", signal);
    }
    if (current.state !== "approved") return failure(current.state === "executing" ? "GUARD_BUSY" : current.state === "uncertain" ? "GUARD_UNCERTAIN" : "GUARD_APPROVAL_REQUIRED");
    const update = stamp(current), leaseEnd = Math.min(Date.parse(update.updatedAt) + policy.approval.leaseSeconds * 1000, Date.parse(current.expiresAt));
    const claimed = await transition(current, { ...current, ...update, state: "executing",
      lease: { token: id("lease"), expiresAt: new Date(leaseEnd).toISOString() } }, "EXECUTION_RESERVED", signal);
    if (claimed.state !== "executing" || !claimed.payload) return failure("GUARD_RESULT_INVALID");
    try {
      const receipt = await bounded((active) => deps.exporter.publish({ approvalId: claimed.approvalId, runId: claimed.runId, payload: claimed.payload!,
        contentDigest: claimed.intent.contentDigest, contentBytes: claimed.intent.contentBytes }, active), signal,
        Math.min(5000, Date.parse(claimed.lease.expiresAt) - Date.parse(now()) - 250), "GUARD_UNCERTAIN");
      const { lease: _lease, ...base } = claimed;
      return await transition(claimed, { ...base, ...stamp(claimed), state: "succeeded", receipt }, "EXPORT_SUCCEEDED", signal);
    } catch {
      await cleanup(claimed, true, "GUARD_UNCERTAIN");
      return failure("GUARD_UNCERTAIN");
    }
  }

  async function run(command: GuardCommand, signal: AbortSignal) {
    switch (command.operation) {
      case "prepare_export": return prepare(command, signal);
      case "read": return read(command.approvalId, signal);
      case "audit": {
        const rows = await bounded((active) => deps.audit.read(command.scopeId, active), signal, 4000, "GUARD_AUDIT_FAILURE");
        return z.array(GuardAuditEventSchema).max(1024).parse(rows).map((row, index) => {
          if (row.scopeId !== command.scopeId || row.sequence !== index + 1) failure("GUARD_RESULT_INVALID");
          return row;
        });
      }
      case "purge_expired": return maintain(signal);
      default: return decide(command, signal);
    }
  }

  return { command: async (raw: unknown, caller?: AbortSignal) => {
    const controller = new AbortController();
    const abort = () => controller.abort(new GuardBoundaryError("GUARD_CANCELLED"));
    if (caller?.aborted) abort(); else caller?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(() => controller.abort(new GuardBoundaryError("GUARD_BUSY")), policy.approval.leaseSeconds * 1000);
    let parsed: GuardCommand | undefined;
    try {
      controller.signal.throwIfAborted();
      const candidate = GuardCommandSchema.safeParse(raw);
      if (!candidate.success) return failure("GUARD_INPUT_INVALID");
      parsed = candidate.data;
      const result = await run(parsed, controller.signal);
      const value = ["audit", "purge_expired"].includes(parsed.operation) ? result : view(result as ApprovalSnapshot);
      return GuardCommandSuccessSchema.parse({ ok: true, operation: parsed.operation, value });
    } catch (error) {
      const code = error instanceof GuardBoundaryError ? error.code : "GUARD_RESULT_INVALID";
      try {
        await bounded((signal) => deps.audit.append({ schemaVersion: "guard-audit-1.0", eventId: id("operation"),
          scopeId: parsed && "approvalId" in parsed ? parsed.approvalId : id("operation"), timestamp: now(), policyId: policy.policyId,
          policyRevision: policy.revision, actor: "host", kind: "approval.denial", payload: { code } }, signal), undefined, 1000, "GUARD_AUDIT_FAILURE");
      } catch { if (code !== "GUARD_UNCERTAIN") return failure("GUARD_AUDIT_FAILURE"); }
      throw new GuardBoundaryError(code);
    } finally { clearTimeout(timeout); caller?.removeEventListener("abort", abort); }
  } };
}
