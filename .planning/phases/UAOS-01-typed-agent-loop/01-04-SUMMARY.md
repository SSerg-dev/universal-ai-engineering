---
phase: UAOS-01-typed-agent-loop
plan: "04"
subsystem: outbound-adapters
tags: [markdown, lexical-search, deterministic-model, test-adapters, vitest]

requires:
  - phase: UAOS-01-plan-03
    provides: Provider-neutral RunAgentUseCase, strict contracts, and reproducible Node.js 24 workspace
provides:
  - Immutable startup-loaded lexical Markdown search over three controlled fixtures
  - Clearly labeled local deterministic teaching model with no provider or network dependency
  - Abort-aware deterministic clock, ID, model, search, and journal adapters
  - Reproducible source-backed teaching tracer with exact eight-event evidence
affects: [UAOS-01-plan-05, UAOS-01-plan-06, composition, CLI, HTTP]

actuals:
  tokens: 4135
  tasks: 2
  commits: 4
plan_head_before: fcbe072f7b9008509c42d44d634d4f21c3e0a215
plan_head_after: d812c61b3067fe2fdf9b101ff9b90a2061174b23

tech-stack:
  added: []
  patterns:
    - Trusted-root Markdown loading once at startup with immutable in-memory records
    - Unicode-normalized unique-term ranking with ordinal source identity tie breaks
    - Signal-aware deterministic port adapters with explicit failure controls

key-files:
  created:
    - src/adapters/outbound/markdown-search-docs.ts
    - src/adapters/outbound/deterministic-model.ts
    - src/adapters/outbound/deterministic-test-adapters.ts
    - fixtures/docs/agentic-os.md
    - fixtures/docs/execution-journal.md
    - fixtures/docs/ports-and-adapters.md
    - .planning/phases/UAOS-01-typed-agent-loop/01-04-TASK-1-TDD-RED.json
    - .planning/phases/UAOS-01-typed-agent-loop/01-04-TASK-2-TDD-RED.json
  modified:
    - tests/integration/teaching-scenario.test.ts

key-decisions:
  - "Kept the runnable model explicitly local and deterministic: it maps provider-neutral loop state to the reviewed call_tool/final_answer actions without credentials, SDKs, or network access."
  - "Loaded only sorted .md files from the composition-supplied trusted root and retained immutable searchable records so individual runs never enumerate the filesystem."
  - "Kept Phase 1 evidence as lexical document source references; no grounded-passage citation or semantic-retrieval claim was introduced."

patterns-established:
  - "Controlled corpus: filename basename is documentId, first H1 is title, and the first matching non-heading line is the bounded excerpt."
  - "Deterministic evidence: fixed clock, sequence IDs, scripted ports, and in-memory journal expose ordered calls and planned failures behind the production interfaces."

requirements-completed: [EDU-02, CORE-01, CORE-03, CORE-04, NFR-02]

coverage:
  - id: D1
    description: "Three checked-in Markdown documents load once from a trusted root and return deterministic bounded lexical source references, including successful empty results."
    requirement: EDU-02
    verification:
      - kind: integration
        ref: "tests/integration/teaching-scenario.test.ts#returns an empty successful result when no controlled document matches"
        status: pass
      - kind: integration
        ref: "tests/integration/teaching-scenario.test.ts#shows question → search_docs → answer with exact reproducible evidence"
        status: pass
    human_judgment: false
  - id: D2
    description: "The offline teaching path produces the same answer, source references, 2/1 usage, and sequence 1..8 with exactly one run.succeeded across repeated executions."
    requirement: CORE-03
    verification:
      - kind: integration
        ref: "tests/integration/teaching-scenario.test.ts#shows question → search_docs → answer with exact reproducible evidence"
        status: pass
      - kind: unit
        ref: "tests/unit/run-agent.test.ts#moves awaiting_tool to awaiting_final with exactly 2/1 calls and eight events"
        status: pass
    human_judgment: false

duration: 26min
completed: 2026-09-30
status: complete
---

# Phase UAOS-01 Plan 04: Controlled Search and Deterministic Teaching Adapters Summary

**A trusted-root lexical Markdown corpus and local teaching model now drive the real agent loop through a reproducible source-backed eight-event trace.**

## Performance

- **Duration:** 26 min
- **Started:** 2026-09-30T09:14:41Z
- **Completed:** 2026-09-30T09:40:14Z
- **Tasks:** 2
- **Files changed:** 10 implementation, test, fixture, evidence, and deferred-item files
- **Runtime:** bundled Node.js 24; Vitest 5.0.2; TypeScript 7.0.2

## Accomplishments

- Added exactly three controlled Markdown fixtures with stable basenames and required H1 titles.
- Implemented startup-only sorted fixture loading, Unicode-normalized case-insensitive unique-term matching, deterministic scoring/ties/excerpts, validated limits, and successful empty results.
- Added an explicitly offline `DeterministicTeachingModel` plus abort-aware scripted model/search, fixed clock, sequence IDs, and in-memory journal adapters behind the reviewed ports.
- Proved two repeated real teaching runs are deeply equal and each returns `execution-journal` plus `agentic-os`, usage `2/1`, sequence `1..8`, and exactly one `run.succeeded`.

## Task Commits

1. **Task 1 RED: Controlled Markdown search tracer** — `302801b` (test)
2. **Task 1 GREEN: Controlled lexical Markdown path** — `3e99fcb` (feat)
3. **Task 2 RED: Deterministic teaching/evidence tracer** — `ec5f2b6` (test)
4. **Task 2 GREEN: Deterministic teaching and port adapters** — `d812c61` (feat)

## Fixture Inventory

| Filename | `documentId` | H1 title |
|---|---|---|
| `agentic-os.md` | `agentic-os` | Agentic OS |
| `execution-journal.md` | `execution-journal` | Execution Journal |
| `ports-and-adapters.md` | `ports-and-adapters` | Ports and Adapters |

The teaching answer exposes document identities as lexical source references only. It does not describe them as grounded passages or semantic citations.

## Verification Evidence

- `npm run test -- tests/integration/teaching-scenario.test.ts` — Task 1 passed 2/2, then the tracer feedback gate passed 2/2.
- `npm run test -- tests/unit/run-agent.test.ts tests/integration/teaching-scenario.test.ts` — passed 4/4 after Task 2.
- The same focused command was rerun twice after both GREEN commits; both executions passed 4/4, while the test itself deep-compared two fresh complete runs.
- `npm run typecheck` — passed under bundled Node.js 24.
- Full `npm test` — 19/21 passed; the only failures are the known Plan 01-06 `tsconfig.core.json` debt in `tests/contracts/dependency-boundaries.test.ts`. The previously missing Plan 01-04 adapters are resolved.
- Forbidden-capability scan found no provider SDK/network, JSONL, transport, UI, database, RAG, MCP, memory, registry, or multi-agent behavior in the changed implementation.

## Deterministic Teaching Evidence

- **Answer:** `The typed agent loop records ordered execution evidence around model and search actions.`
- **Returned sources:** `execution-journal` (`Execution Journal`), then `agentic-os` (`Agentic OS`).
- **Usage:** `modelCalls: 2`, `toolCalls: 1`.
- **Event order:** `run.started` → `model.requested` → `model.responded` → `tool.requested` → `tool.succeeded` → `model.requested` → `model.responded` → `run.succeeded`.
- **Sequences:** integers `1` through `8`; exactly one terminal `run.succeeded`.

## TDD Gate Compliance

- **Task 1 RED:** `302801b`; `01-04-TASK-1-TDD-RED.json` validates as `RED_EVIDENCE_OK` because the named tracer failed on the missing `MarkdownSearchDocs` assertion.
- **Task 1 GREEN:** `3e99fcb`; the same tracer passed 2/2 and passed its immediate feedback rerun.
- **Task 2 RED:** `ec5f2b6`; `01-04-TASK-2-TDD-RED.json` validates as `RED_EVIDENCE_OK` because the named tracer failed on the missing `DeterministicTeachingModel` assertion.
- **Task 2 GREEN:** `d812c61`; focused unit/integration verification passed 4/4 and strict typecheck passed.
- No REFACTOR commit was needed; the minimal GREEN implementations remained clear and within plan scope.

## Lockfile Continuity

No dependency was added or changed. `package.json` and `package-lock.json` remain untouched from the human-approved Plan 01-03 state.

## Decisions Made

- The deterministic teaching model is a local educational adapter, not a simulation of any named provider and not a provider integration.
- Search data is loaded from one trusted composition root before serving requests; query/model values never influence filesystem paths.
- Search matches remain document-level lexical source references. Semantic retrieval and grounded passage citations remain deferred to Phase 4.

## ADR Assumption Delta

None. Implementation follows ADR-0003 D-01 through D-09 and D-11 through D-21 without changing an architectural contract or governance state.

## Deviations from Plan

None - the plan executed exactly as written.

## Issues Encountered

- The sandbox required scoped permission for the new `src/adapters/outbound` directory and Git metadata writes; this changed no implementation decision.
- The full suite retains the pre-existing Plan 01-06 `tsconfig.core.json` failures. They are recorded in `deferred-items.md` and were not implemented early.

## Known Stubs

None.

## User Setup Required

None - the complete teaching path is offline and needs no credentials, provider account, database, or network access.

## Next Phase Readiness

- Plan 01-05 can add exhaustive lexical/schema boundary tests against the same adapter without changing the visible teaching scenario.
- Plan 01-06 still owns `tsconfig.core.json` and the full failure/deadline/cancellation expansion.
- Implementation is complete for this plan; Approved and Stable remain Pending explicit human governance.

## Self-Check: PASSED

- All adapter, fixture, teaching-test, RED-evidence, deferred-item, and summary files exist.
- Commits `302801b`, `3e99fcb`, `ec5f2b6`, and `d812c61` exist in repository history.
- Both RED evidence records return `RED_EVIDENCE_OK`; focused repeated tests and typecheck pass.
- No unexpected deletion, stub, skipped test, unrun plan verification, or unmodelled threat surface was found.

---
*Phase: UAOS-01-typed-agent-loop*  
*Completed: 2026-09-30*
