# ITERATION-09 Evidence

Iteration 9 enforces a sealed host policy across the existing grounded execution paths and implements one explicitly approved fixed-root Markdown export. PostgreSQL persists exact proposals, decisions, CAS/private leases and transactional safe audit; publication and positive-existing reconciliation remain separate filesystem operations.

## Review state

| State | Status |
|---|---|
| Planned | Complete |
| Implemented | Complete |
| Architecturally Reviewed | Pending |
| Approved | Pending |
| Stable | Pending |

[ADR-0013](../architecture/decisions/ADR-0013-guarded-execution-and-approved-export.md), [walkthrough](../iterations/09-guardrails-approval.md), [command boundary](../architecture/guard-command-io.md) and [threat model](../../.planning/phases/UAOS-09-guardrails-approval/09-THREAT-MODEL.md) define selected scope and practical limits. Earlier checkpoints retain their historical counts: [contracts](../../.planning/phases/UAOS-09-guardrails-approval/09-01-SUMMARY.md), [loop/policy](../../.planning/phases/UAOS-09-guardrails-approval/09-02-CHECKPOINT-EVIDENCE.md), [publication](../../.planning/phases/UAOS-09-guardrails-approval/09-02-PUBLICATION-EVIDENCE.md), [durable store](../../.planning/phases/UAOS-09-guardrails-approval/09-02-DURABLE-EVIDENCE.md), [command service](../../.planning/phases/UAOS-09-guardrails-approval/09-02-SERVICE-EVIDENCE.md).

## Requirement traceability

| Requirement | Executable evidence | Implementation status |
|---|---|---|
| GUARD-01 | [Strict contracts](../../tests/contracts/guard-contracts.test.ts), [immutable policy](../../tests/unit/guard-policy.test.ts), [loop boundaries](../../tests/integration/guard-checkpoints.test.ts), [resumable commands](../../tests/unit/guard-service.test.ts), [filesystem receipts](../../tests/unit/filesystem-approved-export.test.ts), [real transactional store](../../tests/database/guard-approval.db.test.ts), [actual grounded paths/TCP/CLI](../../tests/database/guard-runtime.db.test.ts) | Implemented — review pending |

CORE-02/03/04 and NFR-01/02/03 preserve framework/vendor-independent core compilation, shared adapter semantics, safe required evidence, deterministic models, explicit version selection and reproducible isolated infrastructure. Root/UI dependencies and lockfiles are unchanged. Phase 1 remains the default; earlier iteration 8 is independently tested without guard commands/rules.

## Threat traceability

| Threat | Boundary and control | Evidence |
|---|---|---|
| T-09-01 | Canonical immutable host policy/revision; bounded normalized literal/size rules; no request/model self-approval/config substitution | [Policy tests](../../tests/unit/guard-policy.test.ts), [strict contracts](../../tests/contracts/guard-contracts.test.ts), [adapter bypasses](../../tests/integration/guard-adapters.test.ts) |
| T-09-02 | Actual input/output/permission/argument/observation/model/tool budgets across standalone/conversation/evaluation/streaming/preparation; unchanged public errors | [Loop boundaries](../../tests/integration/guard-checkpoints.test.ts), [seven actual policy variants and all paths](../../tests/database/guard-runtime.db.test.ts) |
| T-09-03 | Required acknowledged safe audit before later work; transactional rollback; rejected/delayed actual PostgreSQL audit prevents any model/tool work | [Checkpoint failures/cancellation](../../tests/integration/guard-checkpoints.test.ts), [real rollback](../../tests/database/guard-approval.db.test.ts), [real rejected/delayed gates](../../tests/database/guard-runtime.db.test.ts) |
| T-09-04 | Exact action/content/destination/policy/expiry digest and version bind each explicit decision; policy restart invalidates unexecuted proposals | [Binding contracts](../../tests/contracts/guard-contracts.test.ts), [service stale-policy/decision tests](../../tests/unit/guard-service.test.ts), [semantic rehydration](../../tests/unit/filesystem-approved-export.test.ts) |
| T-09-05 | Transactional version CAS and private leases fence concurrent/late workers; audit from/to/version/actor cannot be forged | [Real concurrent preparation/decisions/execution and lease recovery](../../tests/database/guard-approval.db.test.ts), [transition contracts](../../tests/contracts/guard-contracts.test.ts) |
| T-09-06 | Durable pause/resume without another question; duplicate request, interrupted preparation, expiry/pruning and uncertain capacity are explicit | [Service lifecycle/maintenance](../../tests/unit/guard-service.test.ts), [independent durable stores](../../tests/database/guard-approval.db.test.ts), [fresh CLI process](../../tests/database/guard-runtime.db.test.ts) |
| T-09-07 | Fixed root/generated name, exclusive flushed staging, no replacement, bounded inspection, ambiguity retained; no automatic retry | [Actual filesystem concurrency/Unicode/lost ack](../../tests/unit/filesystem-approved-export.test.ts), [cancelled/hung/uncertain service](../../tests/unit/guard-service.test.ts), [positive receipt recovery](../../tests/database/guard-approval.db.test.ts) |
| T-09-08 | Strict CLI/JSON/Origin boundary, no-store public proposals, private leases/content-free audit, independent inspector and no public fault/path/policy flags | [Adapter tests](../../tests/integration/guard-adapters.test.ts), [actual TCP/CLI/privacy](../../tests/database/guard-runtime.db.test.ts), [core import rules](../../tests/contracts/dependency-boundaries.test.ts) |

## Verification

Node.js 24.22.1: final root validation passed 451 tests in 51 files (38.76s), strict project/core compilation and build, including requirement/threat/link checks. The preceding complete all-package run passed 449 root tests, 21 UI tests in two files (2.40s) and Angular AOT (4.345s); only evidence checks and additional database adversarial tests changed afterward. UI assets retain main-FZMHIYSR.js/styles-MI2B4LPG.css, 633.50kB raw / 125.41kB estimated transfer. The final real database run passed 48 tests in seven files (24.16s), including actual rejected/delayed audit and concurrent execution claims. The exact owner-verified disposable container was removed.

Reproduce with `npm run validate:all` and `npm run test:database`. Live checks ingest only controlled repository fixtures, use ephemeral loopback services, and clean up owner-verified test roots/container. A previous mixed-suite failure exposed a deliberately corrupted guard-store fixture left by its corruption test; that fixture is now removed explicitly before later runtime maintenance. The production service correctly refuses corrupted rehydration. No corruption is silently repaired/deleted by application code.

## Limits and acceptance

One trusted local operator/host/database/filesystem is assumed. Actor labels and hashes bind/correlate evidence; they are not remote authentication or policy signing. Literal rules do not prove semantic prompt-injection safety, PII detection or factual truth. Grounded evidence remains controlled extractive citations. No provider-token/cost estimate, new model vendor, dependency, approval UI, external message/payment, deployment or production SLO is introduced.

Exact proposal content is intentionally available/stored privately for review; questions are hashed in approval state and remain outside audit/journal. PostgreSQL audit retains metadata after private payload expiry. Published artifacts remain user files. Database and filesystem are not one transaction: timeout/disconnect/lost acknowledgment may leave a real file and executing/uncertain state. A late underlying effect may finish despite bounded waiting; safe recovery inspects existing evidence only. There is no exactly-once, automatic retry or arbitrary rollback claim. Human architectural review, approval and stability remain pending.
