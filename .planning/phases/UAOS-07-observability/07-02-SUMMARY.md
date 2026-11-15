---
phase: UAOS-07-observability
plan: "02"
status: complete
completed: 2026-11-15
requirements-covered: [OBS-01, CORE-02, CORE-03, CORE-04, NFR-01, NFR-02, NFR-03]
---

# 07-02 Observability Closure

Implemented bounded optional telemetry, monotonic control/retrieval/journal spans, per-run isolation, state/evaluation correlation, validated quality metrics, safe filesystem batches, and CLI inspect without database initialization. Only iteration 7 replaces its response/tool journal duration placeholders with measured intervals; earlier selected iterations and primary result schemas remain compatible. Required execution/state audit persistence retains its failure policy.

## Verification and discoveries

Node.js 24.22.1 passed full validation with 363 tests in 40 files in 29.74 seconds, strict project/core compilation, and build. Internal links, dependency integrity, OBS-01 coverage, seven threat boundaries, and independent pending review states passed. No package/lockfile changed.

The real PostgreSQL suite passed 26 tests in four files in 13.32 seconds and removed its exact owner-verified disposable container. It proves CLI/HTTP/state/evaluation correlation, actual persisted durations, quality/case-run links, database-free CLI inspection, injected permission diagnosis, optional exporter isolation, and required journal failure preservation.

The first live run exposed per-record filesystem synchronization exhausting the optional 250 ms budget. [The retained RED record](07-02-LIVE-RED.md) and [ADR-0010](../../../docs/architecture/decisions/ADR-0010-bounded-telemetry-batches.md) explain why one bounded validated batch replaced repeated synchronization without changing the budget or required journal. Unit tests first failed against the old implementation, then proved batch acknowledgment/failure/timeout/no-fallback behavior.

One full attempt failed three earlier live MCP tests. The isolated six-test MCP suite, direct pinned handshake, and final full suite passed without source/timeout changes. The exact environmental cause remains unconfirmed; the failed run is retained in [evidence](../../../docs/reviews/ITERATION-07-evidence.md).

## Limits and next

Timeout bounds waiting, not arbitrary noncooperative work; partial or late writes are possible. Delivery counts are acknowledgment snapshots, not exactly-once proof. Missing/corrupt evidence is explicitly incomplete. Integer durations may be zero; state/evaluation intervals include nested run flushes and exclude their own final flush. Instrumentation has overhead. IDs remain operationally sensitive metadata. No portable directory-entry power-loss guarantee, production exporter/authentication/retention, W3C/OTel propagation, or SLO is claimed.

[Guide](../../../docs/iterations/07-observability.md) documents the failure runbook, commands, and hard exercises. Phase 8 next defines ordered content-bearing streaming events, replay/cancellation semantics, and an Angular/Tailwind UI contract before implementation.

Implemented: Complete

Architecturally Reviewed: Pending

Approved: Pending

Stable: Pending
