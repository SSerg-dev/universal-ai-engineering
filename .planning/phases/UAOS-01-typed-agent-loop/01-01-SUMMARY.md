---
phase: UAOS-01-typed-agent-loop
plan: "01"
subsystem: architecture
tags: [contracts, vitest, zod, agent-loop, jsonl, governance]

requires:
  - phase: greenfield-restart
    provides: ADR-0002, recovery commit e4a25e9, and RESET-0001 evidence
provides:
  - ADR-0003 compatibility contracts for D-01 through D-21
  - Pending ARCH-0001 package-legitimacy and architecture review gate
  - Fail-first reset, dependency, loop, teaching, schema, and event specifications
affects: [UAOS-01-plan-02, domain-contracts, run-agent, adapters, review-evidence]

actuals:
  tokens: 9348
  tasks: 3
  commits: 3
plan_head_before: 6eeb451abf68b0ea0892e87768a0867839c9bee6
plan_head_after: 1550452ae6ac0b35dff487e0851801a9d5fe1b6e

tech-stack:
  added: []
  patterns:
    - Contract-first compatibility vocabulary before implementation
    - Strict unknown-value boundaries and provider-neutral actions
    - Versioned allow-listed event evidence with explicit terminal states

key-files:
  created:
    - docs/architecture/decisions/ADR-0003-typed-agent-loop-contracts.md
    - docs/reviews/ARCH-0001-iteration-01-gate.md
    - tests/integration/reset-evidence.test.ts
    - tests/contracts/dependency-boundaries.test.ts
    - tests/unit/run-agent.test.ts
    - tests/integration/teaching-scenario.test.ts
    - tests/contracts/schemas.test.ts
    - tests/contracts/agent-events.test.ts
  modified:
    - docs/reviews/RESET-0001-evidence.md

key-decisions:
  - "D-10 public failures use ten stable codes and stages request | model | tool | journal | orchestration."
  - "Composition defaults are a 5000 ms deadline, 16384-byte HTTP body limit, and independent 250 ms cancellation-evidence cleanup."
  - "Phase 1 uses one per-run JSONL file and a deterministic teaching model; source IDs are source references, not grounded citations."
  - "Package legitimacy, implementation, architectural review, approval, and stability remain independent governance states."

patterns-established:
  - "Compatibility-first: ADR vocabulary and fail-first specifications precede schemas, ports, and orchestration."
  - "Evidence-safe events: only allow-listed metadata enters schemaVersion 1.0 journal envelopes."
  - "Governance separation: passing automation does not imply architectural review, approval, or stability."

requirements-completed: [FOUND-01, ARCH-01, EDU-02, CORE-01, CORE-04, NFR-01, NFR-03]

coverage:
  - id: D1
    description: "RESET-0001 independently preserves the recovery point, retired inventory, migrations, and Pending governance states."
    requirement: FOUND-01
    verification:
      - kind: other
        ref: "Plan 01-01 foundation-contract-ok and reset-inventory-and-decisions-ok static checks"
        status: pass
    human_judgment: false
  - id: D2
    description: "ADR-0003 fixes D-01 through D-21 and ARCH-0001 separates package, implementation, review, approval, and stability gates."
    requirement: ARCH-01
    verification:
      - kind: other
        ref: "Plan 01-01 foundation-contract-ok static check"
        status: pass
    human_judgment: true
    rationale: "ARCH-0001 intentionally leaves architectural review and package legitimacy to the blocking human gate in Plan 01-02."
  - id: D3
    description: "Fail-first reset, dependency, two-state loop, source-subset, and eight-event teaching specifications exist without packages."
    requirement: CORE-01
    verification:
      - kind: other
        ref: "Plan 01-01 fail-first-specs-ok static check"
        status: pass
    human_judgment: false
  - id: D4
    description: "Fail-first strict schema and safe-event specifications enumerate every public error and event boundary."
    requirement: CORE-04
    verification:
      - kind: other
        ref: "Plan 01-01 schema-event-specs-ok static check"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-09-29
status: complete
---

# Phase UAOS-01 Plan 01: Typed Agent Loop Contract Foundation Summary

**ADR-0003 fixes the provider-neutral two-state loop and safe JSONL vocabulary while concrete fail-first specifications preserve reset and governance evidence.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-09-29T18:14:48Z
- **Completed:** 2026-09-29T18:24:25Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Revalidated `e4a25e9`, all declared legacy retirements, the ADR-0001 migration, and Pending reset review/approval/stability without rewriting recovery history.
- Recorded D-01 through D-21 plus the five research resolutions, including exact failure stages, limits, cancellation evidence, HTTP status mapping, lexical rules, and deterministic runtime expectations.
- Created concrete fail-first Vitest specifications for the recovery point, dependency direction, two-state loop, teaching path, strict schemas, stable errors, event vocabulary, monotonic envelopes, and content-safe payloads.
- Preserved the contract-first boundary: no package manifest, lockfile, schema implementation, port, loop, or adapter was created.

## Task Commits

Each task was committed atomically:

1. **Task 1: Revalidate reset evidence and decide ADR-0003** — `98141fc` (docs)
2. **Task 2: Write fail-first reset, architecture, loop, and teaching specifications** — `3736d9a` (test)
3. **Task 3: Write fail-first schema and event specifications** — `1550452` (test)

## Files Created/Modified

- `docs/reviews/RESET-0001-evidence.md` — Adds independent recovery/inventory revalidation while preserving Pending governance states.
- `docs/architecture/decisions/ADR-0003-typed-agent-loop-contracts.md` — Defines D-01 through D-21, stable errors/stages, limits, status mapping, event safety, and dependency direction.
- `docs/reviews/ARCH-0001-iteration-01-gate.md` — Separates package legitimacy, implementation, architecture review, approval, and stability decisions.
- `tests/integration/reset-evidence.test.ts` — Specifies recovery-tree, retirement, migration, and state integrity.
- `tests/contracts/dependency-boundaries.test.ts` — Specifies forbidden core imports and strict core-only compilation.
- `tests/unit/run-agent.test.ts` — Specifies the 2/1 two-state path, source-reference subset validation, and exact eight-event sequence.
- `tests/integration/teaching-scenario.test.ts` — Specifies the deterministic question → `search_docs` → answer teaching slice.
- `tests/contracts/schemas.test.ts` — Specifies strict public, tool, model-action, result, error-code, and error-stage boundaries.
- `tests/contracts/agent-events.test.ts` — Specifies schemaVersion 1.0 envelopes, terminal types, sequence behavior, and allow-listed metadata.

## Decisions Made

- Kept every D-01 through D-21 decision verbatim in meaning while adding only the five delegated research resolutions.
- Defined invented final-answer source IDs as `INVALID_TRANSITION` at the `orchestration` stage because the action shape is valid but illegal against the current run's returned source set.
- Made event payload schemas metadata-only and strict so raw prompts, questions, documents, provider payloads, complete answers, and hidden reasoning cannot be journaled.
- Kept all package candidates explicitly pending; no accepted-package record or lockfile exists before Plan 01-02's blocking human gate.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Initial execution was safely halted on protected `master`; the orchestrator re-homed work to `codex/phase-01-typed-agent-loop` before any plan file was changed.
- The sandbox denied direct `.git` ledger/index writes; the same scoped Git operations were rerun through the approved escalation path. No hook was bypassed.

## Verification Evidence

- `foundation-contract-ok`
- `reset-inventory-and-decisions-ok`
- `fail-first-specs-ok`
- `schema-event-specs-ok`
- `no-early-runtime-artifacts-ok`
- `diff-check-ok`

The Vitest files are intentionally fail-first and were verified statically because package installation and workspace activation are reserved for Plans 01-02 and 01-03.

## User Setup Required

None - no external services or package installation are part of this plan.

## Next Phase Readiness

- Plan 01-02 can implement strict schemas and five narrow ports against ADR-0003 and the fail-first specifications.
- Package legitimacy and architecture review remain blocking-human decisions before Plan 01-03 may create a package manifest, lockfile, or dependent implementation.
- Implemented, Approved, and Stable remain Pending.

## Self-Check: PASSED

- All nine task-owned files and this summary exist.
- Task commits `98141fc`, `3736d9a`, and `1550452` are present in repository history.
- No missing artifact or unexpected deletion was found.

---
*Phase: UAOS-01-typed-agent-loop*
*Completed: 2026-09-29*
