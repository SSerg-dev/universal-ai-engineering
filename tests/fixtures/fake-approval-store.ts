import type { ApprovalStorePort, GuardAuditPort } from "../../src/application/ports/guard-ports.js";
import { assertApprovalTransition, assertApprovalTransitionAudit } from "../../src/domain/approval-transitions.js";
import { GuardAuditEventSchema, GuardBoundaryError, type ApprovalSnapshot, type GuardAuditDraft, type GuardAuditEvent } from "../../src/domain/guard-contracts.js";

export class FakeApprovalStore implements ApprovalStorePort, GuardAuditPort {
  readonly snapshots = new Map<string, ApprovalSnapshot>();
  readonly events: GuardAuditEvent[] = [];
  rejectCode: string | undefined;
  async append(draft: GuardAuditDraft, signal: AbortSignal) {
    signal.throwIfAborted();
    if (draft.kind === "approval.transition" && draft.payload.code === this.rejectCode) throw new GuardBoundaryError("GUARD_AUDIT_FAILURE");
    const count = this.events.filter(({ scopeId }) => scopeId === draft.scopeId).length;
    this.events.push(GuardAuditEventSchema.parse({ ...draft, sequence: count + 1 }));
  }
  async read(scopeId: string, signal: AbortSignal) { signal.throwIfAborted(); return structuredClone(this.events.filter((event) => event.scopeId === scopeId)); }
  async reserve(input: Parameters<ApprovalStorePort["reserve"]>[0], signal: AbortSignal) {
    signal.throwIfAborted();
    const current = [...this.snapshots.values()].find(({ requestId }) => requestId === input.snapshot.requestId);
    if (current) {
      if (current.inputDigest !== input.snapshot.inputDigest) throw new GuardBoundaryError("GUARD_REQUEST_REUSED");
      return { created: false, snapshot: structuredClone(current) };
    }
    if ([...this.snapshots.values()].filter(({ state }) => ["preparing", "pending", "approved", "executing", "uncertain"].includes(state)).length >= input.maxPending) throw new GuardBoundaryError("GUARD_CAPACITY_EXCEEDED");
    assertApprovalTransitionAudit(null, input.snapshot, input.event);
    await this.append(input.event, signal);
    this.snapshots.set(input.snapshot.approvalId, structuredClone(input.snapshot));
    return { created: true, snapshot: structuredClone(input.snapshot) };
  }
  async load(approvalId: string, signal: AbortSignal) { signal.throwIfAborted(); return structuredClone(this.snapshots.get(approvalId) ?? null); }
  async transition(input: Parameters<ApprovalStorePort["transition"]>[0], signal: AbortSignal) {
    signal.throwIfAborted();
    const current = this.snapshots.get(input.snapshot.approvalId);
    if (!current) throw new GuardBoundaryError("GUARD_ACTION_NOT_FOUND");
    if (current.version !== input.expectedVersion) throw new GuardBoundaryError("GUARD_VERSION_CONFLICT");
    assertApprovalTransition(current, input.snapshot, input.expectedLeaseToken, input.recoverExpiredLease);
    assertApprovalTransitionAudit(current, input.snapshot, input.event);
    await this.append(input.event, signal);
    // Recheck after the asynchronous acknowledgment to model transactional CAS.
    if (this.snapshots.get(input.snapshot.approvalId)?.version !== input.expectedVersion) throw new GuardBoundaryError("GUARD_VERSION_CONFLICT");
    this.snapshots.set(input.snapshot.approvalId, structuredClone(input.snapshot));
    return structuredClone(input.snapshot);
  }
  async listExpired(now: string, signal: AbortSignal) {
    signal.throwIfAborted();
    return structuredClone([...this.snapshots.values()].filter((row) => "lease" in row && row.lease.expiresAt <= now ||
      row.expiresAt <= now && (row.payload !== null || ["preparing", "pending", "approved", "executing"].includes(row.state))));
  }
}
