---
phase: UAOS-05-durable-state-memory
plan: "01"
status: complete
completed: 2026-11-09
requirements-covered: [MEM-01, NFR-01, NFR-02, NFR-03]
---

# 05-01 State and Memory Contract Evidence

[ADR-0007](../../../docs/architecture/decisions/ADR-0007-durable-conversation-state.md) selects explicit content retention, turn-boundary resume, idempotent request keys, preallocated run IDs, optimistic versions, private leases/fencing, explicit scoped TTL memory, and transactional metadata audit. A seven-day teaching preference was presented to the user; no default retention or human approval is inferred. Conversation creation requires its own explicit bounded retention input.

Strict schemas separate content-bearing snapshots/turns/memory from metadata-only audit. They reject invalid lifetimes, multiple running turns, duplicate keys/run IDs, private lease tokens in snapshots, mismatched result IDs, cross-conversation memory, excess versions/expiry, audit content, and inconsistent outcome codes. Store/executor/ID ports contain no infrastructure types.

## Verification

Node.js 24.22.1 passed 11 new contract cases. Full npm run validate passed 253 tests in 25 files, strict project/core typecheck, and build in 19.11 seconds. Existing packages and lockfile were unchanged. No fail-first history is claimed for these contract checks.

## Next

Implement service semantics and deterministic fake-store tests, then PostgreSQL atomic state/audit and live restart/concurrency/retention checks, followed by explicit CLI/HTTP operations and teaching/evidence. Contracts alone do not claim durable implementation. Phase 2–4 review and approval remain pending; Phase 5 architectural review, approval, and stability are also pending.
