# 09-02 Durable Approval Store Checkpoint

2026-11-16 — PostgreSQL approval state and strict metadata audit now share transactions. Preparation reservation serializes duplicate request IDs/capacity; transitions lock and compare versions, validate immutable snapshot/digest bindings, fence private leases, and require the correct event scope/from/to/version/code/actor. A distinct operator event is required for approval and execution claim. Independent policy audit writers serialize per scope. Reads revalidate relational/JSON identities and canonical payload/proposal bindings.

The transition contract now explicitly refuses new pending/approval/execution states at expiry and requires an `existing_verified` receipt to reconcile uncertainty. This tightens ADR-0013's already selected no-retry rule; the original contract test was updated to distinguish a new-publication acknowledgment from positive existing-artifact verification.

Node.js 24.22.1 passed all 427 root tests in 49 files (34.20s), root/core compilation and build. The isolated real PostgreSQL/pgvector runner passed 35 tests in six files (17.75s), including seven new guard-store tests: concurrent duplicate reservation, durable rehydration, explicit approval, concurrent decision CAS, forged actor rejection, audit-trigger rollback, expired-worker fencing, verified reconciliation, uncertainty capacity, expired-payload pruning, concurrent policy audits, corruption detection and pre-abort. Its exact owner-verified container was removed.

The command service must still supply current policy/expiry/digest checks, bounded execution, maintenance and denials, then wire all iteration 9 factories and CLI/API. Phase 9 remains incomplete; review, human approval and stability are pending.
