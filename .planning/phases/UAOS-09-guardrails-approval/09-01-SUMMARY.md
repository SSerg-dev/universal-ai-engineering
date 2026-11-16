---
phase: UAOS-09-guardrails-approval
plan: "01"
status: implemented
date: 2026-11-16
requirements: [GUARD-01, CORE-02, CORE-03, CORE-04, NFR-01, NFR-02, NFR-03]
review: pending
approval: pending
---

# Policy and Approval Contract Checkpoint

[ADR-0013](../../../docs/architecture/decisions/ADR-0013-guarded-execution-and-approved-export.md) selects a host-owned bounded policy, required metadata audit, optional shared-loop checkpoints, and one consequential effect: export of an exact prepared grounded answer to a fixed local Markdown destination. Approval is a separate operator command bound to proposal digest and version. Development authorization is never runtime approval.

Strict schemas and framework-free ports cover private preparation leases, public proposal views, decisions, CAS transitions, expiry, safe receipts and uncertain publication. Expired workers cannot complete ordinary transitions; recovery can only record safe failure/uncertainty or a positively verified existing receipt. No database/filesystem atomic transaction or automatic retry is claimed. The sealed fixture has revision `83352b220fd36d3fc6b063c135549dbfb8180a11d097a4fc9264499023769a52`.

Verification: Node.js 24.22.1, root/core type checks, all 399 tests in 46 files (35.52s), and root build passed. Nine new contract tests exercise policy/command bypasses, private/public separation, identity/receipt binding, explicit decisions, versions, leases, uncertainty and payload pruning. The [threat map](09-THREAT-MODEL.md) records the remaining executable obligations.

This closes contract plan 09-01 only. Policy enforcement, durable approval storage, publication and CLI/API commands remain in [09-02](09-02-PLAN.md). GUARD-01 remains pending until that evidence exists. Architectural review, human approval and stability are pending.
