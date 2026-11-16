# Phase 9 Threat Model

Scope: one trusted local operator, a host-owned policy, the existing guarded documentation assistant, and one explicitly approved fixed-root export. No remote identity, broad semantic prompt-injection detection, malicious administrator, external message/payment, or exactly-once filesystem/database transaction is claimed. Implementation controls below are obligations until 09-02 evidence proves them.

| Threat | Required boundary/control | Evidence obligation |
|---|---|---|
| T-09-01 | Strict host policy/revision, normalized bounded literal/size rules; request/model data cannot replace configuration or approve itself | [Contract bounds](../../../tests/contracts/guard-contracts.test.ts); policy/checkpoint adversarial tests in 09-02 |
| T-09-02 | Existing call/time budgets plus permission intersection and pre-effect request/action/tool/observation checkpoints | Shared-loop integration tests prove denied later effects do not occur and earlier versions remain compatible |
| T-09-03 | Acknowledged typed metadata audit before a gate allows later work; rollback/fail-closed behavior and no content/token/path/raw-error fields | [Audit shape](../../../tests/contracts/guard-contracts.test.ts); failed/aborted audit and PostgreSQL rollback checks |
| T-09-04 | Exact proposal/destination/content/policy digest and expected version bind each explicit local approval/denial | [Decision/state contracts](../../../tests/contracts/guard-contracts.test.ts); stale/substituted/cross-action/policy-restart attempts |
| T-09-05 | Version CAS/private leases and immutable transition graph fence concurrent/late workers; expired worker cannot complete without safe recovery | [Transition/fencing checks](../../../tests/contracts/guard-contracts.test.ts); concurrent reserve/execute and late worker tests |
| T-09-06 | Durable preparation/pause/decision/audit; duplicate request never reruns a question; interrupted preparation is not fake mid-turn recovery | Restart/resume, duplicate input/hash, expiry, pending capacity and audit/state atomicity tests |
| T-09-07 | Generated filename/fixed trusted root, exclusive no-overwrite publication, bound receipt, no automatic retry; absent evidence remains uncertain | [Receipt contract](../../../tests/contracts/guard-contracts.test.ts); filesystem/cancellation/lost-ack/reconciliation tests |
| T-09-08 | Strict CLI/same-origin HTTP command adapters, protected proposal view separated from private tokens and safe audit; no public/model fault or path switch | [Command/view contracts](../../../tests/contracts/guard-contracts.test.ts); real CLI/API/content-privacy/bypass checks |

Hashes bind content and detect corruption; they do not authenticate a malicious replacement of the trusted host/database. Retain the selected manifest history alongside its revision for reproduction. Approval resumes the prepared action, not a crashed in-flight agent step. Database/filesystem ambiguity must remain visible and never become an automatic second publication.
