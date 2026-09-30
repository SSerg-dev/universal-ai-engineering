---
phase: UAOS-01-typed-agent-loop
plan: "06"
subsystem: typed-loop-failures-and-core-boundaries
tags: [typescript, vitest, abort-signal, ports, dependency-boundaries, tdd]

requires:
  - phase: UAOS-01-plan-05
    provides: Strict runtime schemas, lexical search boundaries, and the unchanged deterministic teaching path
provides:
  - Complete typed loop failure, deadline, cancellation, limit, terminal, and concurrency semantics
  - Exact D-16 vocabulary and D-17 metadata-only event evidence
  - Strict no-emit domain/application compilation boundary
  - Public-interface substitution proofs for scripted and concrete deterministic adapters
affects: [UAOS-01-plan-07, inbound-composition, CLI, HTTP, JSONL-journal, iteration-evidence]

actuals:
  tokens: 12306
  tasks: 2
  commits: 6
plan_head_before: 202ef49c3d5e5d96383573d23fc3553af65db567
plan_head_after: ef6fb59634620603cefa053159db3c303f17417a

tech-stack:
  added: []
  patterns:
    - Per-invocation tagged caller/deadline signal composition with timer cleanup
    - Request-before-effect and observation-before-next-effect evidence ordering
    - Central typed terminalization with bounded independent cancellation evidence
    - Core-only strict TypeScript project plus static forbidden-import checks

key-files:
  created:
    - tsconfig.core.json
    - tests/contracts/ports.test.ts
    - tests/unit/run-agent-failures.test.ts
    - .planning/phases/UAOS-01-typed-agent-loop/01-06-TASK-1-TDD-RED.json
    - .planning/phases/UAOS-01-typed-agent-loop/01-06-TASK-2-TDD-RED.json
  modified:
    - src/application/run-agent.ts
    - src/adapters/outbound/deterministic-test-adapters.ts
    - tests/contracts/dependency-boundaries.test.ts

key-decisions:
  - "The overall deadline and caller abort are composed per invocation with tagged origins; an exact-deadline race resolves to TIMEOUT while a caller abort remains CANCELLED."
  - "Model/tool usage increments at attempt start, and request/observation events must persist before the corresponding or later side effect."
  - "Aborted runs write their terminal evidence through an independent policy-bounded signal; rejection or expiry of that append returns JOURNAL_FAILURE without a duplicate terminal attempt."
  - "tsconfig.core.json compiles only domain/application with strict no-emit settings; dependency tests separately reject adapters, vendors, filesystem modules, and process access."

patterns-established:
  - "Typed terminalization: stable code/stage/retryable values are created in one application boundary."
  - "Fail-closed evidence: a rejected append prevents every later model or tool effect."
  - "Deterministic boundary races: Vitest fake timers prove just-before, exact-deadline, and the 250 ms cleanup bound."

requirements-completed: [CORE-01, CORE-03, CORE-04, NFR-01, NFR-02]

coverage:
  - id: D1
    description: "Every invalid request/action/transition/source, adapter failure, limit, deadline, cancellation, journal, and internal path returns the reviewed typed result without forbidden later effects."
    requirement: CORE-04
    verification:
      - kind: unit
        ref: "tests/unit/run-agent-failures.test.ts#RunAgentUseCase typed failure matrix (21 scenarios)"
        status: pass
      - kind: unit
        ref: "tests/unit/run-agent.test.ts#RunAgentUseCase happy state machine"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-16 event vocabulary, D-17 payload allow-lists, terminal cardinality, source IDs, and safe counts remain exact and content-free."
    requirement: CORE-03
    verification:
      - kind: unit
        ref: "tests/contracts/agent-events.test.ts#AgentEvent vocabulary and safe allow-listed event payloads (5 scenarios)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Domain/application compile independently while scripted/fixed and concrete deterministic adapters substitute through unchanged public ports."
    requirement: NFR-01
    verification:
      - kind: other
        ref: "bundled Node 24 tsc -p tsconfig.core.json --noEmit"
        status: pass
      - kind: unit
        ref: "tests/contracts/dependency-boundaries.test.ts and tests/contracts/ports.test.ts (6 scenarios)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The full offline project suite and build are green after closing the prior tsconfig.core.json debt."
    requirement: NFR-02
    verification:
      - kind: other
        ref: "bundled Node 24 npm run validate (9 files, 54 tests, build)"
        status: pass
    human_judgment: false

duration: 38min
completed: 2026-09-30
status: complete
---

# Phase UAOS-01 Plan 06: Typed Failure Matrix and Core Boundary Summary

**A fail-closed two-state agent loop now returns every reviewed typed outcome, preserves one bounded terminal record, and compiles as an infrastructure-independent core.**

## Performance

- **Duration:** 38 min
- **Started:** 2026-09-30T13:39:56Z
- **Completed:** 2026-09-30T14:18:08Z
- **Tasks:** 2
- **Files changed:** 8 implementation, config, test, and RED-evidence files
- **Runtime:** bundled Node.js 24; Vitest 5.0.2; TypeScript 7.0.2

## Accomplishments

- Closed a 21-scenario RunAgent failure matrix covering invalid input/action/transition/source, model/tool/journal failures, both budgets, just-before/exact deadline, explicit abort, bounded cancellation evidence, internal fallback, terminal rejection, and concurrent run isolation.
- Centralized public error normalization and terminalization so every reviewed outcome has the exact D-10 `code`, `stage`, and `retryable: false`, while evidence rejection prevents later side effects.
- Proved exact D-16 event vocabulary and strict D-17 metadata allow-lists: no prompt, question, provider payload, document body, complete answer, or hidden reasoning can enter an event payload.
- Added `tsconfig.core.json`, strengthened forbidden-import/process scans, and proved scripted/fixed plus concrete deterministic adapters remain substitutable through public ports.
- Closed the only prior full-suite debt: `npm run validate` now passes 9 test files / 54 tests plus typecheck and build.

## Task Commits

1. **Task 1 RED: complete typed loop outcome matrix** — `0d18524` (test)
2. **Task 1 GREEN: typed failure/deadline/cancellation semantics** — `839145d` (feat)
3. **Task 2 RED: core boundary and port contracts** — `ba92ea6` (test)
4. **Task 2 GREEN: strict core-only compilation boundary** — `303faa1` (feat)
5. **REFACTOR: centralized terminal append paths** — `242c0dd` (refactor)
6. **Evidence refinement: deterministic boundary timers** — `ef6fb59` (test)

## Scenario Matrix

| Scenario family | Public code | Stage | Retryable | Terminal evidence |
|---|---|---|---|---|
| Invalid request | `INVALID_REQUEST` | `request` | `false` | `run.failed` |
| Model exception | `MODEL_FAILURE` | `model` | `false` | `run.failed` |
| Malformed model action | `INVALID_MODEL_ACTION` | `model` | `false` | `run.failed` |
| Early answer, second tool call, invented source | `INVALID_TRANSITION` | `orchestration` | `false` | `run.failed` |
| Tool exception or malformed tool result | `TOOL_FAILURE` | `tool` | `false` | `tool.failed`, then `run.failed` |
| Exact overall deadline | `TIMEOUT` | `orchestration` | `false` | `run.failed` via independent cleanup signal |
| Explicit caller abort | `CANCELLED` | `orchestration` | `false` | `run.cancelled` via independent cleanup signal |
| Model/tool budget exhausted | `LIMIT_EXCEEDED` | `model` / `tool` | `false` | `run.failed` |
| Any rejected evidence append | `JOURNAL_FAILURE` | `journal` | `false` | no later append/effect after unwritable evidence |
| Unexpected orchestration fault | `INTERNAL_ERROR` | `orchestration` | `false` | `run.failed` when journal remains writable |

Every writable run has exactly one event from `run.succeeded | run.failed | run.cancelled`. A success-terminal rejection returns `JOURNAL_FAILURE` without attempting a contradictory second terminal record.

## Verification Evidence

- Task 1 focused event/happy/failure command — passed 28/28.
- Core-only compiler command — passed with no emit.
- Task 2 fail-fast dependency/port command — passed 6/6; the test command ran only after the compiler returned zero.
- Consolidated event, dependency, port, happy, and failure matrix — passed 34/34.
- Full `npm run validate` — passed typecheck, 9 test files / 54 tests, and build under bundled Node.js 24.
- Repeated stub scan found no `TODO`, `FIXME`, placeholder, coming-soon, or not-available markers in changed files.

## Core Boundary Results

- `tsconfig.core.json` includes only `src/domain/**/*.ts` and `src/application/**/*.ts`, uses strict/no-emit settings, and excludes adapters/tests/output.
- Static scanning rejects adapter imports, Fastify, Angular, PostgreSQL packages, MCP packages, provider SDKs, Node filesystem imports, Node process imports, and direct `process.*` access.
- `createRunAgentUseCase` depends only on the five reviewed ports and domain-owned schemas/types; no transport, provider, persistence, UI, database, RAG, MCP, memory, registry, or multi-agent behavior was added.
- Scripted model/search/journal plus fixed clock/IDs and concrete deterministic model/Markdown search both produce the same 2/1 use-case shape and ordered terminal evidence through public interfaces.

## TDD Gate Compliance

- **Task 1 RED:** `0d18524`; `01-06-TASK-1-TDD-RED.json` returns `RED_EVIDENCE_OK` for the exact-deadline assertion (`INVALID_TRANSITION` before implementation versus required `TIMEOUT`).
- **Task 1 GREEN:** `839145d`; focused event/happy/failure verification passed 28/28.
- **Task 2 RED:** `ba92ea6`; `01-06-TASK-2-TDD-RED.json` returns `RED_EVIDENCE_OK` for the missing executable core compilation boundary.
- **Task 2 GREEN:** `303faa1`; fail-fast core compile plus dependency/port verification passed 6/6.
- **REFACTOR:** `242c0dd`; removed the superseded tracer-only implementation and separated success-terminal persistence; consolidated verification stayed 34/34.
- **Deterministic evidence refinement:** `ef6fb59`; fake timers prove just-before, exact-deadline, and the canonical 250 ms cleanup bound without wall-clock flakiness.

## Decisions Made

- Deadline and caller cancellation use one invocation-local signal while retaining distinct tagged origins; cleanup always removes the caller listener and deadline timer.
- A model/tool attempt consumes budget before its request evidence, while the underlying effect cannot start until that evidence append resolves.
- Cancellation and timeout terminal evidence use a fresh bounded signal because the ordinary composed signal has already aborted; cleanup rejection maps to `JOURNAL_FAILURE`.
- Success terminal persistence has its own append path so an abort after a resolved append cannot create duplicate or contradictory terminal evidence.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected failure-matrix spy assertions during GREEN**
- **Found during:** Task 1 focused GREEN verification
- **Issue:** Nine assertions targeted port wrapper objects instead of their mocked `request`/`search` methods, producing Vitest spy-type errors after the application behavior itself passed.
- **Fix:** Pointed call-count assertions at the public mocked methods; no production behavior or scenario expectation changed.
- **Files modified:** `tests/unit/run-agent-failures.test.ts`
- **Verification:** Task 1 focused suite passed 28/28.
- **Committed in:** `839145d`

**2. [Rule 2 - Missing Critical] Made deadline and 250 ms cleanup proofs timer-deterministic**
- **Found during:** Final evidence review
- **Issue:** Initial boundary tests used small wall-clock sleeps, which could become flaky under scheduler load and did not name the canonical 250 ms cleanup bound directly.
- **Fix:** Replaced wall-clock races with Vitest fake timers for just-before, exact deadline, and exactly 250 ms cancellation cleanup.
- **Files modified:** `tests/unit/run-agent-failures.test.ts`
- **Verification:** Failure matrix passed 21/21; full suite passed 54/54.
- **Committed in:** `ef6fb59`

---

**Total deviations:** 2 auto-fixed (1 Rule 1 bug, 1 Rule 2 missing critical evidence property). **Impact:** Both changes strengthen correctness and reproducibility without expanding product scope or altering ADR-0003.

## Issues Encountered

- The checkout already contained untracked `.gsd/`, `.planning/milestone.lock`, and `.planning/state.json`; they were treated as discovery findings and left untouched.
- The Context7 CLI was unavailable. No new library API research was required beyond the phase research's official Node.js AbortSignal references, and no dependency was added.

## ADR Assumption Delta

None. The implementation confirms ADR-0003 and research assumption A3: cancellation/timeout terminal evidence needs an independent bounded signal to satisfy D-14, D-16, and D-19 together.

## Known Stubs

None.

## Threat Surface Scan

No unplanned trust boundary was introduced. Task 1 implements T-01-07/T-01-08 mitigations in the reviewed core, and Task 2 adds compile/static evidence only; there are no new endpoints, auth paths, filesystem journal operations, or schema changes at an external boundary.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 01-07 can add JSONL persistence and CLI composition against a fully typed, fail-closed core.
- There are no implementation blockers; architectural review, human approval, and stability remain separate pending governance states.

## Self-Check: PASSED

- All five created artifacts and the canonical summary exist on disk.
- All six production/TDD commits resolve in Git.
- Coverage metadata classifies all four deliverables as automatically proven with passing evidence.
- Core compile, focused suites, full typecheck, 54-test suite, and build are green.

