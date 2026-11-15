---
phase: UAOS-07-observability
plan: "01"
status: complete
completed: 2026-11-15
requirements-covered: [OBS-01, NFR-01, NFR-02, NFR-03]
---

# 07-01 Safe Telemetry Contracts

[ADR-0009](../../../docs/architecture/decisions/ADR-0009-safe-observability.md) selects a separate optional telemetry protocol, per-trace bounded buffering, post-result bounded export, measured timing, safe correlation, explicit incomplete diagnosis, and preservation of required journal semantics. The initial local protocol does not claim OpenTelemetry/W3C wire compatibility.

Strict contracts define logs, spans, run/state/quality metrics, delivery, and diagnosis, plus infrastructure-free sink/read/monotonic-clock/span-ID ports. They reject raw content/secret fields, mismatched identities, self-parent spans, invalid durations/statuses, impossible quality rates/counts, oversized records, and contradictory diagnostic completeness. IDs remain metadata rather than unbounded metric labels.

## Verification

Node.js 24.22.1 passed fourteen new contract checks. Full npm run validate passed 314 tests in 33 files, strict project/core typecheck, and build in 24.31 seconds. No dependency/lockfile changed. Earlier iteration evidence and approval states remain intact. No fail-first history is inferred for these passing contract tests.

## Next

Implement the bounded exporter and diagnosis with fakes, then actual measured per-run instrumentation, state/quality correlation, safe sink/reader, iteration 7/inspect, live failure diagnosis, guide/evidence, and final validation. Contracts alone do not establish OBS-01 implementation. Architectural review, approval, and stability remain pending.
