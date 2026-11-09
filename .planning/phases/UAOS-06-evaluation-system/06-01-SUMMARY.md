---
phase: UAOS-06-evaluation-system
plan: "01"
status: complete
completed: 2026-11-09
requirements-covered: [EVAL-01, NFR-01, NFR-02, NFR-03]
---

# 06-01 Evaluation Contract Evidence

[ADR-0008](../../../docs/architecture/decisions/ADR-0008-deterministic-evaluation.md) selects versioned mixed-outcome course datasets, verified content revisions, a separate scorer version, host-allocated run IDs, independent schema/outcome/retrieval/grounding/tools/evidence checks, explicit applicable denominators and coverage thresholds, safe reports, and awaited persistence.

Strict schemas reject duplicate/contradictory cases, missing expected outcome families, arbitrary fault scenarios, impossible metrics, absent coverage disguised as a passing rate, inconsistent gates, raw report content, reused run IDs, and backwards report chronology. Executor/report ports are infrastructure-free. Behavioral scoring and dataset revision hashing remain assigned to 06-02.

## Verification

Node.js 24.22.1 passed six new contract checks. Full npm run validate passed 279 tests in 28 files, project/core typecheck, and build in 20.91 seconds. No package or lockfile changed. No fail-first history is inferred. Earlier iteration evidence and approval states remain intact.

## Next

Implement the independent scorer and sequential evaluation runner, then a versioned dataset/report adapter, CLI composition, known-regression reproduction, live database evidence, and teaching closure. Phase 6 is not implemented or human-approved by these contracts alone.
