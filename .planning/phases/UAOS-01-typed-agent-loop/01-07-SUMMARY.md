---
phase: UAOS-01-typed-agent-loop
plan: "07"
subsystem: jsonl-persistence-and-cli-composition
tags: [typescript, node-cli, jsonl, abort-signal, filesystem, tdd]

requires:
  - phase: UAOS-01-plan-06
    provides: Fail-closed typed agent loop, stable ports, deterministic adapters, and cancellation semantics
provides:
  - Awaited schema-validated per-run JSONL persistence under a trusted root
  - System clock and UUID-backed identifier adapters behind reviewed ports
  - One default offline runtime composition root for the deterministic teaching path
  - Thin uaos ask CLI with shared RunAgentUseCase cancellation and normalized output
affects: [UAOS-01-plan-08, Fastify-parity, HTTP-composition, iteration-evidence]

actuals:
  tokens: 8007
  tasks: 2
  commits: 4
plan_head_before: 29a5aee5b455d76db4b7f08e5770e142ddbf2f58
plan_head_after: 182c505683b2a041a1a8a66c97dba6097949baae

tech-stack:
  added: []
  patterns:
    - Schema-validate, contain, append, sync, and close every per-run JSONL record
    - Composition-owned defaults over unchanged provider-neutral application ports
    - Thin process adapter with one AbortController and finally-based SIGINT cleanup

key-files:
  created:
    - src/adapters/outbound/jsonl-journal.ts
    - src/adapters/outbound/system-clock.ts
    - src/adapters/outbound/system-id-generator.ts
    - src/adapters/inbound/cli.ts
    - src/composition/create-runtime.ts
    - tests/integration/jsonl-journal.test.ts
    - tests/smoke/cli.test.ts
    - .planning/phases/UAOS-01-typed-agent-loop/01-07-TASK-1-TDD-RED.json
    - .planning/phases/UAOS-01-typed-agent-loop/01-07-TASK-2-TDD-RED.json
  modified:
    - package.json
    - tests/integration/teaching-scenario.test.ts

key-decisions:
  - "The JSONL adapter accepts only schema-valid envelopes and filename-safe generated run IDs, proves resolved-path containment, and syncs each awaited UTF-8 line before returning."
  - "createRuntime is the only default wiring site and fixes the reviewed 5000 ms deadline, 250 ms terminal-evidence bound, and two-model/one-tool budgets."
  - "runCli owns only argv, process IO, exit status, and one SIGINT AbortController; semantic validation, failures, cancellation classification, and journaling stay in RunAgentUseCase."
  - "The existing approved dependency set and package lock remain unchanged because this plan uses only Node.js standard-library adapters."

patterns-established:
  - "Trusted-root persistence: operator composition supplies roots; run data can select only a validated contained filename."
  - "Shared inbound behavior: CLI formats RunAgentResult without reimplementing loop policy or error semantics."

requirements-completed: [EDU-02, CORE-02, CORE-03, CORE-04, NFR-02]

coverage:
  - id: D1
    description: "A complete run persists as ordered, schema-valid, content-safe UTF-8 JSONL and fails closed on malformed paths, cancellation, or write failure."
    requirement: CORE-03
    verification:
      - kind: integration
        ref: "tests/integration/jsonl-journal.test.ts#JsonlJournal (5 scenarios)"
        status: pass
    human_judgment: false
  - id: D2
    description: "uaos ask calls the shared use case, prints answer/source/usage/runId fields, normalizes failures, and writes one eight-event journal."
    requirement: CORE-02
    verification:
      - kind: e2e
        ref: "tests/smoke/cli.test.ts#uaos ask CLI (4 child-process scenarios)"
        status: pass
    human_judgment: false
  - id: D3
    description: "SIGINT reaches the caller AbortSignal, produces one cancellation terminal when writable, and leaves no process listener behind."
    requirement: CORE-04
    verification:
      - kind: e2e
        ref: "tests/smoke/cli.test.ts#maps SIGINT to one caller signal, one cancellation event, and listener cleanup"
        status: pass
    human_judgment: false
  - id: D4
    description: "The offline teaching scenario runs through default replaceable composition and produces the reviewed result plus eight persisted events."
    requirement: EDU-02
    verification:
      - kind: integration
        ref: "tests/integration/teaching-scenario.test.ts#runs the same scenario through default composition and persisted evidence"
        status: pass
      - kind: other
        ref: "bundled Node.js 24 npm run validate (11 files, 64 tests, typecheck, build)"
        status: pass
    human_judgment: false

duration: 38min active across resumed execution
completed: 2026-10-01
status: complete
---

# Phase UAOS-01 Plan 07: Safe JSONL and Shared CLI Composition Summary

**An offline `uaos ask` command now runs the shared typed use case and leaves flushed, schema-valid, content-safe per-run JSONL evidence.**

## Performance

- **Duration:** 38 min active across the interrupted and resumed executor sessions
- **Started:** 2026-09-30T14:54:51Z
- **Completed:** 2026-10-01T08:54:03Z
- **Tasks:** 2
- **Files changed:** 11 implementation, package, test, and RED-evidence files
- **Runtime:** bundled Node.js 24.19.0; Vitest 5.0.2; TypeScript 7.0.2

## Accomplishments

- Added `JsonlJournal`, `SystemClock`, and `SystemIdGenerator` adapters that preserve the reviewed ports while validating every envelope, containing every generated filename, and awaiting a flushed UTF-8 append.
- Added the sole default composition root for the deterministic model, controlled Markdown fixtures, JSONL journal, system time/IDs, and reviewed call/deadline policy.
- Added the exact `uaos ask "<question>"` package entry point as a thin adapter over `RunAgentUseCase`, including normalized success/failure formatting and shared SIGINT cancellation.
- Proved the vertical slice through real child processes, persisted evidence, invalid input, cancellation cardinality/listener cleanup, deterministic teaching tests, and the full offline suite.

## Task Commits

1. **Task 1 RED: JSONL persistence contract** — `bbfd13a` (test)
2. **Task 1 GREEN: safe per-run JSONL evidence** — `5e7cdf3` (feat)
3. **Task 2 RED: CLI composition contract** — `c7dd005` (test)
4. **Task 2 GREEN: shared runtime through uaos CLI** — `182c505` (feat)

## CLI and JSONL Contract

- Build with bundled Node.js 24 using `npm run build`, then invoke `npm run uaos -- ask "How are runs recorded?"` or the installed `uaos ask "How are runs recorded?"` binary.
- Success writes the answer, source references, `modelCalls`/`toolCalls`, and `runId` to stdout; failures write only the reviewed public code, stage, message, and `runId` to stderr.
- `UAOS_FIXTURE_ROOT` and `UAOS_JOURNAL_ROOT` configure composition-owned trusted roots. Defaults remain repository-relative controlled fixtures and `.uaos/journal` for local execution.
- Each writable run owns `<runId>.jsonl`; every line is one `AgentEventEnvelopeSchema`-validated schema version `1.0` object followed by one newline and synced before later work.
- Persisted payloads contain only reviewed metadata. Tests prove questions, full answers, fixture excerpts, stacks, causes, and traversal-shaped IDs do not cross the durable boundary.

## Exported Symbols

- `JsonlJournal` — awaited, schema-valid, per-run JSONL `JournalPort` adapter.
- `SystemClock` — ISO timestamp `ClockPort` adapter.
- `SystemIdGenerator` — kind-prefixed UUID `IdGeneratorPort` adapter.
- `createRuntime` — sole default offline adapter/policy wiring site.
- `runCli` — argv/stdio/exit/SIGINT translation over the shared `RunAgentUseCase`.

## Verification Evidence

- Both TDD RED evidence records returned `RED_EVIDENCE_OK` for the named target assertion failures.
- Task 1 focused JSONL verification passed 5/5 under bundled Node.js 24.
- Task 2 focused CLI/teaching/JSONL verification passed 12/12 under bundled Node.js 24.
- Full `npm run validate` passed typecheck, 11 test files / 64 tests, and build under bundled Node.js 24.
- Package-lock continuity was preserved: no dependency or lockfile change occurred.
- Stub/skip scan found no `TODO`, `FIXME`, placeholder, coming-soon, not-available, or skipped-test markers in changed files.

## TDD Gate Compliance

- **Task 1 RED:** `bbfd13a`; `01-07-TASK-1-TDD-RED.json` verifies the named JsonlJournal export assertion failed before implementation.
- **Task 1 GREEN:** `5e7cdf3`; JSONL verification passed 5/5.
- **Task 2 RED:** `c7dd005`; `01-07-TASK-2-TDD-RED.json` verifies the named runCli export assertion failed before implementation.
- **Task 2 GREEN:** `182c505`; CLI/teaching/JSONL verification passed 12/12.
- **REFACTOR:** Not required; the GREEN implementations already keep persistence, composition, and process translation responsibilities separate.

## Decisions Made

- Journal filenames are selected only from the short validated run-ID alphabet, then resolved and checked relative to the canonical configured root before any directory or file access.
- The filesystem adapter opens, appends, syncs, and closes per event so persistence remains awaited and fail-closed rather than optional telemetry.
- CLI command-shape failures are passed as unknown invalid input to the shared use case, preserving its run-ID allocation, semantic validation, normalized failure, and journal ownership.
- SIGINT owns one CLI `AbortController`; the listener is always removed in `finally`, while the use case remains responsible for cancellation classification and bounded terminal evidence.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Execution resumed after the prior executor reached its usage limit. The three existing partial commits and both RED evidence records were inspected and verified rather than duplicated or rewritten.
- The checkout retained pre-existing untracked `.gsd/`, `.planning/milestone.lock`, and `.planning/state.json`; all were preserved untouched as instructed.
- The managed sandbox required elevated filesystem permission to create the two already-planned source directories and to update Git metadata. This did not change implementation scope or repository content.

## ADR Assumption Delta

None. The implementation confirms ADR-0003 and research assumptions A2, A3, and A5: the default model remains offline, cancellation evidence uses the shared use-case policy, and one file per generated `runId` avoids shared-file interleaving.

## Known Stubs

None.

## Threat Surface Scan

No unplanned trust boundary was introduced. Task 1 implements T-01-09 at the reviewed event-to-filesystem boundary, and Task 2 implements T-01-10 at the reviewed argv/SIGINT-to-use-case boundary. No endpoint, authentication path, provider integration, schema expansion, or user-controlled filesystem path was added.

## User Setup Required

None - the default teaching runtime is offline and requires no external service or credentials.

## Next Phase Readiness

- Plan 01-08 can inject the same `Runtime`/`RunAgentUseCase` into one bounded Fastify route without changing core behavior or persistence.
- JSONL, CLI, cancellation, and default composition are green with no implementation blocker.
- Architectural review, human approval, and stability remain separate pending governance states; this plan does not mark any of them complete.

## Self-Check: PASSED

- All nine created artifacts, both modified files, and this canonical summary exist on disk.
- All four production/TDD commits resolve in Git in RED → GREEN order for both tasks.
- Both plan verification commands, full typecheck, 64-test suite, and build pass under bundled Node.js 24.
- Coverage metadata classifies all four deliverables with passing automated evidence.

