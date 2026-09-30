---
phase: UAOS-01-typed-agent-loop
plan: "05"
subsystem: domain-contracts-and-lexical-search
tags: [zod, markdown, lexical-search, unicode, deterministic-tests, vitest]

requires:
  - phase: UAOS-01-plan-04
    provides: Trusted-root Markdown adapter, deterministic teaching model, and reproducible teaching scenario
provides:
  - Exhaustive executable D-01/D-02/D-07/D-10/D-12 schema boundary evidence
  - Deterministic Unicode and ordinal lexical-search edge coverage
  - Fail-fast trusted-root and canonical first-H1 fixture validation
  - Unchanged learner-visible teaching scenario
affects: [UAOS-01-plan-06, composition, CLI, HTTP, iteration-evidence]

actuals:
  tokens: 4483
  tasks: 2
  commits: 4
plan_head_before: c40b3057a22196cb3098393ce0e7d3851784ec57
plan_head_after: aca356454ddc7a318cd1b9bbaf3180297c38df16

tech-stack:
  added: []
  patterns:
    - Strict nested Zod boundaries with semantic non-empty values
    - First non-empty Markdown line as the required canonical H1 title
    - Temporary controlled corpora for deterministic lexical integration evidence

key-files:
  created:
    - tests/integration/search-docs.test.ts
    - .planning/phases/UAOS-01-typed-agent-loop/01-05-TASK-1-TDD-RED.json
    - .planning/phases/UAOS-01-typed-agent-loop/01-05-TASK-2-TDD-RED.json
  modified:
    - src/domain/agent-contracts.ts
    - src/domain/agent-errors.ts
    - src/adapters/outbound/markdown-search-docs.ts
    - tests/contracts/schemas.test.ts

key-decisions:
  - "A successful SearchDocumentMatch must contain at least one normalized matched term; matchedTerms: [] remains reserved for no result, represented by matches: []."
  - "Public error messages are trimmed and whitespace-only values are rejected without changing the D-10 code/stage vocabulary."
  - "A controlled Markdown fixture is valid only when its first non-empty line is the H1 title; a later H1 cannot legitimize prefaced or malformed content."

requirements-completed: [EDU-02, CORE-01, CORE-04, NFR-02]

coverage:
  - id: D1
    description: "Strict schemas prove query trimming, limit default/bounds, nested unknown-key rejection, exact model actions/results, all D-10 code/stage values, source metadata, and provider-neutral usage counts."
    requirement: CORE-01
    verification:
      - kind: unit
        ref: "tests/contracts/schemas.test.ts#strict public, tool, model-action, error, and result schemas"
        status: pass
      - kind: other
        ref: "npm run test -- tests/contracts/schemas.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Lexical search deterministically handles Unicode/case normalization, unique repeated terms, numeric tokens, score and ordinal ties, excerpts, limits, empty results, and repeated runs."
    requirement: EDU-02
    verification:
      - kind: integration
        ref: "tests/integration/search-docs.test.ts#MarkdownSearchDocs lexical determinism"
        status: pass
      - kind: other
        ref: "focused schema/search/teaching command repeated twice (18/18 each)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Search startup rejects invalid roots and malformed fixtures while query/model text cannot select a filesystem path outside the configured root."
    requirement: CORE-04
    verification:
      - kind: integration
        ref: "tests/integration/search-docs.test.ts#MarkdownSearchDocs startup boundaries"
        status: pass
    human_judgment: false
  - id: D4
    description: "The original question → search_docs → answer teaching behavior remains byte-for-byte stable at the public result and event sequence."
    requirement: NFR-02
    verification:
      - kind: e2e
        ref: "tests/integration/teaching-scenario.test.ts#shows question → search_docs → answer with exact reproducible evidence"
        status: pass
    human_judgment: false

duration: 16min
completed: 2026-09-30
status: complete
---

# Phase UAOS-01 Plan 05: Strict Schemas and Lexical Edge Matrix Summary

**Strict Zod boundaries and a trusted-root Markdown adapter now have exhaustive deterministic evidence without changing the source-backed teaching path.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-09-30T12:49:37Z
- **Completed:** 2026-09-30T13:05:57Z
- **Tasks:** 2
- **Files changed:** 7 implementation, test, and RED-evidence files
- **Runtime:** bundled Node.js 24; Vitest 5.0.2; TypeScript 7.0.2

## Accomplishments

- Expanded real Zod parsing evidence across D-01, D-02, D-07, D-10, and D-12, including every nested unknown-key boundary, numeric limits, exact discriminants, malformed sources/errors/matches, and provider-neutral usage.
- Added a controlled temporary-corpus matrix proving Unicode NFKC/case behavior, explicit letter/number tokens, repeated-term deduplication, unique-term scores, ordinal ties, deterministic excerpts, limits, empty results, shuffled creation order, and repeated-run equality.
- Hardened fixture startup so invalid roots/files fail and the first non-empty line must be the H1 title, while path-shaped query text remains lexical data and cannot influence the configured root.
- Preserved the existing teaching result, source-reference wording, usage `2/1`, and exact eight-event sequence unchanged.

## Task Commits

1. **Task 1 RED: Strict schema edge matrix** — `f30e338` (test)
2. **Task 1 GREEN: Semantic schema boundaries** — `cd38f37` (feat)
3. **Task 2 RED: Lexical and trusted-root edge matrix** — `0a3a394` (test)
4. **Task 2 GREEN: Canonical fixture title validation** — `aca3564` (feat)

## Verification Evidence

- `npm run test -- tests/contracts/schemas.test.ts` — passed 9/9.
- `npm run test -- tests/integration/search-docs.test.ts tests/integration/teaching-scenario.test.ts` — passed 9/9.
- Combined schema/search/teaching command — passed 18/18 twice under bundled Node.js 24; the corpus test independently compares differently ordered fixture creation and repeated queries.
- `npm run typecheck` — passed.
- `npm run build` — passed.
- Full `npm run test` — 28/30 passed; the only two failures are the known Plan 01-06 dependency-boundary checks for the intentionally absent `tsconfig.core.json`. Plan 01-06 was not implemented early.
- Source and package diff scans found no dependency change or embeddings, vectors, chunks, generated citations, PostgreSQL, MCP, provider SDK, second tool, transport, or database capability.

## Deterministic Search Evidence

- NFKC-normalized `ＡＧＥＮＴ`/`１２` and ASCII/case variants collapse to first-seen `agent`/`12` terms.
- Repeated query terms do not inflate scores or `matchedTerms`.
- Equal unique-term scores sort by ordinal `documentId`; `limit: 1` and `limit: 5` slice that stable order.
- The first matching non-heading line supplies an excerpt bounded to 240 Unicode code points.
- Differently ordered file creation and repeated searches return deeply equal results.
- No-match queries return `{ matches: [] }`; path-shaped query text cannot load a sibling fixture.

## TDD Gate Compliance

- **Task 1 RED:** `f30e338`; `01-05-TASK-1-TDD-RED.json` returns `RED_EVIDENCE_OK` after the named match-boundary assertion failed against `matchedTerms: []` (the related blank-error assertion also failed intentionally).
- **Task 1 GREEN:** `cd38f37`; schema verification passed 9/9.
- **Task 2 RED:** `0a3a394`; `01-05-TASK-2-TDD-RED.json` returns `RED_EVIDENCE_OK` after the named malformed-first-H1 startup assertion failed.
- **Task 2 GREEN:** `aca3564`; search plus unchanged teaching verification passed 9/9, then combined verification passed 18/18 twice.
- No REFACTOR commit was needed; both minimal GREEN changes remained direct and within the reviewed contract.

## Lockfile Continuity

No dependency was added or changed. `package.json` and `package-lock.json` remain untouched from the accepted Plan 01-03 state.

## Decisions Made

- Treat a structurally present but empty `matchedTerms` list as malformed output; a successful no-match search remains `{ matches: [] }`.
- Normalize public error messages at their Zod boundary so whitespace-only content cannot become a stable failure message.
- Require the controlled Markdown title to be the first non-empty line, removing ambiguity from prefaced fixtures while retaining filename-derived stable identities.

## ADR Assumption Delta

None. The refinements make ADR-0003 D-02/D-03/D-10 executable at their semantic edges without changing public shapes, codes, stages, or deferred capability boundaries.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Context7 CLI was unavailable, so no external package documentation was queried; implementation used only already pinned Zod APIs present in the reviewed codebase.
- The full suite retains the explicitly known Plan 01-06 `tsconfig.core.json` debt (two dependency-boundary failures). Focused Plan 01-05 suites, typecheck, and build are green.

## Known Stubs

None. The empty `rootsToRemove` array is intentional per-test cleanup state, not product or UI data.

## User Setup Required

None - tests and teaching behavior remain fully offline and require no credentials, database, provider, or network access.

## Next Phase Readiness

- Plan 01-06 can implement its owned core-only TypeScript project and loop failure/cancellation matrix against stricter unchanged contracts.
- Search/root behavior is exhaustive and reproducible; no Plan 01-06 work was pulled forward.
- Implementation is complete for this plan; Approved and Stable remain Pending explicit human governance.

## Self-Check: PASSED

- All seven implementation, test, and RED-evidence files plus this summary exist.
- Commits `f30e338`, `cd38f37`, `0a3a394`, and `aca3564` exist in repository history.
- Both RED evidence records return `RED_EVIDENCE_OK`; coverage classification reports all four deliverables auto-covered with no schema errors.
- No unexpected deletion, dependency change, stub, skipped test, unrun plan verification, or unmodelled threat surface was found.

---
*Phase: UAOS-01-typed-agent-loop*  
*Completed: 2026-09-30*
