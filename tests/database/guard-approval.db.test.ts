import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { Client } from "pg";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PostgresApprovalStore } from "../../src/adapters/outbound/postgres-approval-store.js";
import { FilesystemApprovedExport } from "../../src/adapters/outbound/filesystem-approved-export.js";
import { createGuardService } from "../../src/application/guard-service.js";
import { ApprovalSnapshotSchema, type ApprovalSnapshot, type GuardAuditDraft, type ApprovalView } from "../../src/domain/guard-contracts.js";
import { guardFixture } from "../fixtures/guard.js";

const connectionString = process.env.UAOS_TEST_DATABASE_URL;
if (!connectionString || !process.env.UAOS_TEST_DATABASE_OWNER) throw new Error("Use npm run test:database for an owned disposable database");
const store = () => new PostgresApprovalStore({ connectionString: connectionString! });
const signal = () => new AbortController().signal;
async function admin<T>(work: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString, connectionTimeoutMillis: 1000, statement_timeout: 2000 });
  try { await client.connect(); return await work(client); } finally { await client.end(); }
}
function audit(next: ApprovalSnapshot, from: ApprovalSnapshot["state"] | null, code: Extract<GuardAuditDraft, { kind: "approval.transition" }>["payload"]["code"]): GuardAuditDraft {
  return { schemaVersion: "guard-audit-1.0", eventId: `operation-${randomUUID()}`, scopeId: next.approvalId,
    timestamp: next.updatedAt, policyId: next.policyId, policyRevision: next.policyRevision,
    actor: ["OPERATOR_APPROVED", "OPERATOR_DENIED", "EXECUTION_RESERVED"].includes(code) ? "local_operator" : "host",
    kind: "approval.transition", payload: { from, to: next.state, version: next.version, code } };
}
const fixture = () => guardFixture(`approval-${randomUUID()}`, `run-${randomUUID()}`);
async function prepared(f = fixture()) {
  const repository = store();
  await repository.reserve({ snapshot: f.preparing, maxPending: 8, event: audit(f.preparing, null, "PREPARATION_RESERVED") }, signal());
  await repository.transition({ expectedVersion: 0, expectedLeaseToken: f.preparing.lease.token, snapshot: f.pending,
    event: audit(f.pending, "preparing", "PROPOSAL_PREPARED") }, signal());
  return { f, repository };
}
async function executing() {
  const { f, repository } = await prepared();
  await repository.transition({ expectedVersion: 1, snapshot: f.approved, event: audit(f.approved, "pending", "OPERATOR_APPROVED") }, signal());
  await repository.transition({ expectedVersion: 2, snapshot: f.executing, event: audit(f.executing, "approved", "EXECUTION_RESERVED") }, signal());
  return { f, repository };
}
beforeAll(async () => store().initialize(signal()));
beforeEach(async () => { await admin((client) => client.query("TRUNCATE uaos_guard.approvals,uaos_guard.audit")); });

describe("durable guarded approval and required metadata audit", () => {
  it("resumes the actual command service and fixed-root publication over independent durable store instances", async () => {
    const root = await mkdtemp(join(tmpdir(), "uaos-guard-db-")), f = fixture();
    const clock = { now: () => "2026-11-16T00:00:00.000Z" }; let executions = 0;
    const service = () => createGuardService({ policy: f.policy, identity: f.identity, clock,
      ids: { next: (kind) => `${kind}-${randomUUID()}` }, store: store(), audit: store(),
      exporter: new FilesystemApprovedExport({ root, clock }), answer: { execute: async (_question, runId) => {
        executions += 1; return guardFixture("approval-result", runId).payload.result;
      } } });
    const decision = (operation: string, value: ApprovalView) => ({ operation, approvalId: value.approvalId,
      expectedVersion: value.version, proposalDigest: value.proposalDigest });
    try {
      const pending = (await service().command({ operation: "prepare_export", requestId: "request-service", question: "private question" })).value as ApprovalView;
      expect(pending.state).toBe("pending");
      const duplicate = (await service().command({ operation: "prepare_export", requestId: "request-service", question: "private question" })).value;
      expect(duplicate).toEqual(pending);
      const approved = (await service().command(decision("approve", pending))).value as ApprovalView;
      const succeeded = (await service().command(decision("execute", approved))).value as ApprovalView;
      expect(succeeded.state).toBe("succeeded"); expect(executions).toBe(1);
      expect(await readFile(join(root, `${pending.approvalId}.md`), "utf8")).toBe(pending.payload?.markdown);
      expect(JSON.stringify(await service().command({ operation: "audit", scopeId: pending.approvalId }))).not.toMatch(/private question|Controlled evidence|lease-/u);
    } finally {
      const absolute = resolve(root);
      if (dirname(absolute) !== resolve(tmpdir()) || !basename(absolute).startsWith("uaos-guard-db-")) throw new Error("Unexpected owned test root");
      await rm(absolute, { recursive: true, force: true });
    }
  });
  it("reserves a request once across instances, rejects changed input, and keeps content out of audit", async () => {
    const f = fixture(), input = { snapshot: f.preparing, maxPending: 1, event: audit(f.preparing, null, "PREPARATION_RESERVED") };
    const results = await Promise.all([store().reserve(input, signal()), store().reserve({ ...input, event: audit(f.preparing, null, "PREPARATION_RESERVED") }, signal())]);
    expect(results.map(({ created }) => created).sort()).toEqual([false, true]);
    await expect(store().reserve({ ...input, snapshot: { ...f.preparing, inputDigest: "c".repeat(64) } }, signal())).rejects.toMatchObject({ code: "GUARD_REQUEST_REUSED" });
    expect(await store().read(f.preparing.approvalId, signal())).toHaveLength(1);
    expect(JSON.stringify(await store().read(f.preparing.approvalId, signal()))).not.toMatch(/private question|Controlled evidence|lease-prepare/u);
  });

  it("rehydrates exact pending/approved payloads and claims execution with a distinct explicit operator transition", async () => {
    const { f, repository } = await prepared();
    expect(await store().load(f.pending.approvalId, signal())).toEqual(f.pending);
    await expect(repository.transition({ expectedVersion: 1, snapshot: { ...f.executing, version: 2 },
      event: audit({ ...f.executing, version: 2 }, "pending", "EXECUTION_RESERVED") }, signal())).rejects.toMatchObject({ code: "GUARD_APPROVAL_REQUIRED" });
    await repository.transition({ expectedVersion: 1, snapshot: f.approved, event: audit(f.approved, "pending", "OPERATOR_APPROVED") }, signal());
    expect(await store().load(f.approved.approvalId, signal())).toEqual(f.approved);
    await store().transition({ expectedVersion: 2, snapshot: f.executing, event: audit(f.executing, "approved", "EXECUTION_RESERVED") }, signal());
    await store().transition({ expectedVersion: 3, expectedLeaseToken: f.executing.lease.token, snapshot: f.succeeded,
      event: audit(f.succeeded, "executing", "EXPORT_SUCCEEDED") }, signal());
    const events = await store().read(f.pending.approvalId, signal());
    expect(events.map(({ sequence }) => sequence)).toEqual([1, 2, 3, 4, 5]);
    expect(JSON.stringify(events)).not.toContain(f.payload.markdown);
    expect(JSON.stringify(events)).not.toContain(f.executing.lease.token);
  });

  it("serializes two decision writers and refuses stale versions and substituted audit actors", async () => {
    const { f } = await prepared();
    const results = await Promise.allSettled([0, 1].map(() => store().transition({ expectedVersion: 1, snapshot: f.approved,
      event: audit(f.approved, "pending", "OPERATOR_APPROVED") }, signal())));
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.find(({ status }) => status === "rejected")).toMatchObject({ reason: { code: "GUARD_VERSION_CONFLICT" } });
    const denied = ApprovalSnapshotSchema.parse({ ...f.pending, state: "denied", version: 3, updatedAt: f.executing.updatedAt,
      decidedAt: f.executing.updatedAt, code: "GUARD_DENIED" });
    const event = audit(denied, "approved", "OPERATOR_DENIED");
    await expect(store().transition({ expectedVersion: 2, snapshot: denied, event: { ...event, actor: "host" } }, signal())).rejects.toMatchObject({ code: "GUARD_RESULT_INVALID" });
    expect(await store().load(f.pending.approvalId, signal())).toMatchObject({ state: "approved", version: 2 });
  });

  it("rolls back the approval mutation when mandatory audit insertion fails", async () => {
    const { f } = await prepared();
    await admin((client) => client.query(`CREATE FUNCTION uaos_guard.reject_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.metadata->'payload'->>'code' = 'OPERATOR_APPROVED' THEN RAISE EXCEPTION 'fixture rejection'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_test_audit BEFORE INSERT ON uaos_guard.audit FOR EACH ROW EXECUTE FUNCTION uaos_guard.reject_test_audit();`));
    try {
      await expect(store().transition({ expectedVersion: 1, snapshot: f.approved, event: audit(f.approved, "pending", "OPERATOR_APPROVED") }, signal())).rejects.toMatchObject({ code: "GUARD_AUDIT_FAILURE" });
      expect(await store().load(f.pending.approvalId, signal())).toMatchObject({ state: "pending", version: 1 });
      expect(await store().read(f.pending.approvalId, signal())).toHaveLength(2);
    } finally { await admin((client) => client.query("DROP TRIGGER reject_test_audit ON uaos_guard.audit; DROP FUNCTION uaos_guard.reject_test_audit();")); }
  });

  it("fences an expired publisher, retains uncertainty and only accepts a verified-existing reconciliation", async () => {
    const { f } = await executing();
    const now = "2026-11-16T00:00:20.000Z";
    const late = ApprovalSnapshotSchema.parse({ ...f.succeeded, updatedAt: now, receipt: { ...f.receipt, observedAt: now } });
    await expect(store().transition({ expectedVersion: 3, expectedLeaseToken: f.executing.lease.token, recoverExpiredLease: true,
      snapshot: late, event: audit(late, "executing", "EXPORT_SUCCEEDED") }, signal())).rejects.toMatchObject({ code: "GUARD_FENCED" });
    const uncertain = ApprovalSnapshotSchema.parse({ ...f.uncertain, updatedAt: now });
    await store().transition({ expectedVersion: 3, expectedLeaseToken: f.executing.lease.token, recoverExpiredLease: true,
      snapshot: uncertain, event: audit(uncertain, "executing", "EXECUTION_UNCERTAIN") }, signal());
    await expect(store().transition({ expectedVersion: 3, expectedLeaseToken: f.executing.lease.token,
      snapshot: late, event: audit(late, "executing", "EXPORT_SUCCEEDED") }, signal())).rejects.toMatchObject({ code: "GUARD_VERSION_CONFLICT" });
    const reconciled = ApprovalSnapshotSchema.parse({ ...f.succeeded, version: 5, updatedAt: now,
      receipt: { ...f.receipt, observedAt: now, acknowledgment: "existing_verified" } });
    const unverified = ApprovalSnapshotSchema.parse({ ...reconciled, receipt: { ...f.receipt, observedAt: now } });
    await expect(store().transition({ expectedVersion: 4, snapshot: unverified, event: audit(unverified, "uncertain", "EXPORT_SUCCEEDED") }, signal())).rejects.toMatchObject({ code: "GUARD_RESULT_INVALID" });
    await store().transition({ expectedVersion: 4, snapshot: reconciled, event: audit(reconciled, "uncertain", "EXPORT_SUCCEEDED") }, signal());
    expect(await store().load(f.preparing.approvalId, signal())).toMatchObject({ state: "succeeded", version: 5 });
  });

  it("accounts uncertain work under capacity and enumerates payload expiry for maintenance", async () => {
    const { f } = await executing();
    await store().transition({ expectedVersion: 3, expectedLeaseToken: f.executing.lease.token, snapshot: f.uncertain,
      event: audit(f.uncertain, "executing", "EXECUTION_UNCERTAIN") }, signal());
    const other = fixture(), preparing = { ...other.preparing, requestId: "request-other" };
    await expect(store().reserve({ snapshot: preparing, maxPending: 1, event: audit(preparing, null, "PREPARATION_RESERVED") }, signal())).rejects.toMatchObject({ code: "GUARD_CAPACITY_EXCEEDED" });
    expect(await store().listExpired("2026-11-16T00:06:00.000Z", signal())).toMatchObject([{ state: "uncertain" }]);
    const pruned = ApprovalSnapshotSchema.parse({ ...f.uncertain, version: 5, updatedAt: "2026-11-16T00:06:00.000Z", payload: null });
    await store().transition({ expectedVersion: 4, snapshot: pruned, event: audit(pruned, "uncertain", "PAYLOAD_PURGED") }, signal());
    expect(await store().listExpired(pruned.updatedAt, signal())).toEqual([]);
    expect(await store().load(f.pending.approvalId, signal())).toMatchObject({ state: "uncertain", payload: null });
    expect(await store().read(f.pending.approvalId, signal())).toHaveLength(6);
  });

  it("serializes independent policy audit writers and validates rehydrated state bindings", async () => {
    const f = fixture(), draft: GuardAuditDraft = { schemaVersion: "guard-audit-1.0", eventId: "operation-first", scopeId: f.intent.runId,
      timestamp: f.preparing.createdAt, policyId: f.intent.policyId, policyRevision: f.intent.policyRevision,
      actor: "host", kind: "policy.checked", payload: { checkpoint: "request", allowed: true, reason: "ALLOWED" } };
    await Promise.all([0, 1, 2].map((id) => store().append({ ...draft, eventId: `operation-audit-${id}` }, signal())));
    expect((await store().read(f.intent.runId, signal())).map(({ sequence }) => sequence)).toEqual([1, 2, 3]);
    await prepared(f);
    await admin((client) => client.query("UPDATE uaos_guard.approvals SET snapshot=jsonb_set(snapshot,'{proposalDigest}',to_jsonb($2::text)) WHERE approval_id=$1", [f.pending.approvalId, "c".repeat(64)]));
    await expect(store().load(f.pending.approvalId, signal())).rejects.toMatchObject({ code: "GUARD_RESULT_INVALID" });
    const controller = new AbortController(), reason = new Error("caller aborted"); controller.abort(reason);
    await expect(store().append(draft, controller.signal)).rejects.toBe(reason);
  });
});
