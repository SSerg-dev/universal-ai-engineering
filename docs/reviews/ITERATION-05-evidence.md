# ITERATION-05 Evidence

Iteration 5 implements durable turn-boundary conversation resume and explicit scoped TTL memory. It uses the existing PostgreSQL dependencies, a bounded typed JSONB snapshot, private leases/fencing, idempotent request replay, and transactional metadata audit. Content-bearing state and safe telemetry remain distinct.

## Review state

| State | Status |
|---|---|
| Planned | Complete |
| Implemented | Complete |
| Architecturally Reviewed | Pending |
| Approved | Pending |
| Stable | Pending |

The user's continuing implementation authorization covers this work. No Phase 5 human approval or automatic seven-day retention default is inferred. Creation takes explicit bounded retention; the proposed preference remains open to user feedback.

## Implementation

[ADR-0007](../architecture/decisions/ADR-0007-durable-conversation-state.md) defines checkpoint/replay semantics, preallocated run IDs, private leases, versions, explicit memory, logical/physical retention, and atomic audit. [05-01](../../.planning/phases/UAOS-05-durable-state-memory/05-01-SUMMARY.md) records verified contracts before dependent implementation. The [store checkpoint](../../.planning/phases/UAOS-05-durable-state-memory/05-02-STATE-EVIDENCE.md) preserves the earlier six-case live state verification.

The [guide](../iterations/05-durable-state-memory.md) reproduces explicit CLI/HTTP commands, cache replay, follow-up context, scoped memory writes/deletion, audit, purge, and recovery. Ordinary ask/cite remains standalone; explicit state commands select content persistence. Both adapters share one strict application command handler. No new package was added.

## Requirement traceability

| Requirement | Executable evidence | Implementation status |
|---|---|---|
| MEM-01 | [State/memory contracts](../../tests/contracts/state-contracts.test.ts), [service semantics](../../tests/unit/conversation-service.test.ts), [live persistence/restart/fencing/audit](../../tests/database/conversation-state.db.test.ts), [CLI/HTTP boundaries](../../tests/integration/conversation-adapters.test.ts) | Implemented — review pending |

CORE-02/03/04 and NFR-01/02/03 retain the shared grounded executor, strict core compilation, content-free JSONL, deterministic fakes, explicit database tests, and separate review/approval evidence.

## Threat traceability

| Threat | Boundary and control | Evidence |
|---|---|---|
| T-05-01 | Strict command/snapshot/result schemas separate state content and metadata and reject extra authority fields | [Contract tests](../../tests/contracts/state-contracts.test.ts), [command adapters](../../tests/integration/conversation-adapters.test.ts) |
| T-05-02 | Idempotent request keys replay saved results without another effect; input mismatch rejects | [Service replay](../../tests/unit/conversation-service.test.ts), [fresh-store persistence](../../tests/database/conversation-state.db.test.ts) |
| T-05-03 | Row locks, one active turn, expected versions, private tokens, expiry, and late-worker fencing | [Concurrency/recovery tests](../../tests/database/conversation-state.db.test.ts) |
| T-05-04 | Explicit scope/TTL memory, bounded context, and expiry filters prevent cross-conversation or expired-note use | [Service context tests](../../tests/unit/conversation-service.test.ts), [live scope/expiry](../../tests/database/conversation-state.db.test.ts) |
| T-05-05 | Independent bounded cancellation settlement and failure handling avoid a false durable-completion claim | [Cancellation/settlement tests](../../tests/unit/conversation-service.test.ts) |
| T-05-06 | State mutation and metadata audit commit/rollback together; private text remains outside audit/JSONL | [Injected audit rollback and real journal checks](../../tests/database/conversation-state.db.test.ts) |
| T-05-07 | Logical expiry, explicit bounded physical purge, retained safe tombstone, and audit retention | [Live purge/retention](../../tests/database/conversation-state.db.test.ts) |

## Verification

```sh
npm ci
npm run validate
npm run test:database
```

Before documentation closure, Node.js 24.22.1 passed 270 offline tests in 27 files, project/core typecheck, and build in 19.94 seconds. The explicit real-database suite passed 19 cases in two files in 6.74 seconds and removed its exact owner-verified disposable container. This includes all eleven previous retrieval cases and eight state cases, with actual CLI and HTTP processes sharing a persisted conversation.

Live state checks prove fresh-store replay/history, concurrent reservation, busy memory rejection, expired recovery with fencing, injected audit failure rollback, scoped TTL filtering/deletion, conversation purge/tombstone, CLI/HTTP follow-up/memory/replay/run-ID journal continuity, and expired metadata deletion. Service tests additionally prove bounded noncooperative settlement return and returned cancellation persistence with a fresh signal. Final closure passed 273 tests in 27 files in 19.61 seconds, strict project/core typecheck, build, package integrity, links, and requirement/threat traceability. The separate database suite passed 19 cases in 6.92 seconds and removed its exact owned container.

Final implementation inspection found audit expiry using PostgreSQL wall time while other state operations used the injected application clock. The audit port/query now receives the same trusted application timestamp. Unit and live tests prove logical audit expiry before physical purge, so verification does not silently change when calendar time advances. Request envelopes cannot supply or override this timestamp.

## Findings and limits

Content-bearing conversation snapshots intentionally persist questions and grounded results. Explicit memory values are user-authored data, not hidden learned behavior. The seven-day preference is not activated by this evidence; API inputs require an explicit value. The teaching database is local and has no production authentication/encryption policy.

Resume is between settled turns. Abrupt interruption needs explicit recovery after lease expiry and a fresh requestId for a new attempt. There is no middle-of-tool replay or exactly-once external-effect claim. A cancellation/COMMIT acknowledgment race remains possible; inspect persisted state and replay only an already settled identical key. State audit and JSONL are separate stores, joined by the reserved runId, without a cross-store atomicity claim.

History is bounded to the last six settled turns. The deterministic again/memory:key conventions demonstrate data flow rather than semantic conversation understanding. Context is a per-turn snapshot; TTL does not revoke data already given to an in-flight executor. Grounding still requires exact currently observed passages.

Purge and audit inspection are bounded as documented. Purging expired memory can advance a conversation version. No automatic physical-cleanup job is installed. Audit metadata expires separately, while stored PostgreSQL backups/volumes remain operator-managed. Earlier iteration contracts and package pins are preserved. Human architectural review, approval, and stability remain pending.
