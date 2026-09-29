---
phase: "01"
slug: "typed-agent-loop"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-28"
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 with Vite 8.3.1 peer |
| **Config file** | `vitest.config.ts` — Wave 0 creates it |
| **Quick run command** | `vitest run <target-file>` under the bundled Node.js 24 runtime |
| **Full suite command** | `npm run validate` under the bundled Node.js 24 runtime |
| **Estimated runtime** | Under 30 seconds for Phase 1 fixtures and deterministic adapters |

---

## Sampling Rate

- **After every task commit:** Run the nearest contract/unit test file and `tsc -p tsconfig.core.json --noEmit` when core code changes.
- **After every plan wave:** Run `npm run validate` under Node.js 24.
- **Before `$gsd-verify-work`:** The full suite, build, core-only compile, CLI smoke, Fastify injection, and repository integrity checks must be green.
- **Max feedback latency:** 30 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | FOUND-01, ARCH-01, NFR-03 | T-01-01 | Reset/ADR/gate documents preserve recovery and separate governance states | docs/contract | bundled Node 24 `foundation-contract-ok` static check | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | EDU-02, CORE-01, CORE-04, NFR-01 | T-01-01 | Reset, dependency, loop, and teaching specifications are concrete and unskipped | specification | bundled Node 24 `fail-first-specs-ok` static check | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | CORE-01, CORE-03, CORE-04 | T-01-01 | Schema/event specifications enumerate strict boundaries and safe event vocabulary | specification | bundled Node 24 `schema-event-specs-ok` static check | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 2 | CORE-01, CORE-03, CORE-04 | T-01-02 | Strict schemas reject malformed input/actions/events and allow-list journal payloads | contract | bundled Node 24 `schemas-events-ok` static check | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 2 | ARCH-01, NFR-01, NFR-02 | T-01-03 | Five ports remain signal-aware and free of provider/framework/filesystem types | contract | bundled Node 24 `ports-ok` static check | ❌ W0 | ⬜ pending |
| 01-02-03 | 02 | 2 | ARCH-01, NFR-03 | T-01-SC | No install occurs before exact pin verification and Architecture Review Gate | blocking human gate | bundled Node 24 `review-gate-ready` static check | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 3 | ARCH-01, NFR-01, NFR-03 | T-01-SC | Workspace parses the unique completed-gate tuple arrays, validates exact row shape/name/SemVer and rejects within/across-category duplicates before map construction, then exact-compares package.json and package-lock root maps/classes | configuration | bundled Node 24 fail-closed tuple-array summary → validated normalized maps → manifest → lock-root exact predicate; only then `workspace-approved-pins-ok` | ❌ W0 | ⬜ pending |
| 01-03-02 | 03 | 3 | CORE-01, CORE-03, CORE-04 | T-01-04 | Core tracer produces exact result/usage/eight-event path through reviewed ports | unit tracer | focused run-agent test command from 01-03 Task 2 | ❌ W0 | ⬜ pending |
| 01-04-01 | 04 | 4 | EDU-02, NFR-02 | T-01-05 | Controlled Markdown fixtures produce deterministic lexical source references | integration tracer | focused teaching-scenario command from 01-04 Task 1 | ❌ W0 | ⬜ pending |
| 01-04-02 | 04 | 4 | EDU-02, CORE-01, CORE-03 | T-01-05 | First-class deterministic model/clock/ID/journal adapters make the tracer reproducible | unit/integration | focused run-agent + teaching command from 01-04 Task 2 | ❌ W0 | ⬜ pending |
| 01-05-01 | 05 | 5 | CORE-01, CORE-04 | T-01-06 | Runtime schemas cover defaults, bounds, strict shapes, results, and errors | contract | focused schema command from 01-05 Task 1 | ❌ W0 | ⬜ pending |
| 01-05-02 | 05 | 5 | EDU-02, CORE-04, NFR-02 | T-01-06 | Unicode/case, ties, excerpts, empty matches, and trusted roots are deterministic | integration | focused search + teaching command from 01-05 Task 2 | ❌ W0 | ⬜ pending |
| 01-06-01 | 06 | 6 | CORE-01, CORE-03, CORE-04 | T-01-07, T-01-08 | Every failure, timeout, cancel, limit, source, journal, and concurrency path is typed | unit/contract | focused events + run-agent + failures command from 01-06 Task 1 | ❌ W0 | ⬜ pending |
| 01-06-02 | 06 | 6 | NFR-01, NFR-02 | T-01-08 | Core compilation and dependency/port tests fail fast and cannot mask one another | architecture/contract | explicit `$LASTEXITCODE` core compile then dependency/ports tests from 01-06 Task 2 | ❌ W0 | ⬜ pending |
| 01-07-01 | 07 | 7 | CORE-03, CORE-04 | T-01-09 | JSONL validates envelopes, contains paths, excludes content, and fails closed | integration tracer | focused JSONL command from 01-07 Task 1 | ❌ W0 | ⬜ pending |
| 01-07-02 | 07 | 7 | EDU-02, CORE-02, NFR-02 | T-01-10 | CLI shares the use case, maps SIGINT, and leaves one terminal event | smoke/integration | focused CLI + teaching + JSONL command from 01-07 Task 2 | ❌ W0 | ⬜ pending |
| 01-08-01 | 08 | 8 | CORE-02, CORE-04 | T-01-11 | HTTP enforces transport bounds and exact logical/status mapping | integration tracer | focused HTTP command from 01-08 Task 1 | ❌ W0 | ⬜ pending |
| 01-08-02 | 08 | 8 | CORE-02, CORE-03, CORE-04 | T-01-11 | HTTP parity, disconnect cause, and concurrent persisted runs remain isolated | integration | focused HTTP + teaching + JSONL command from 01-08 Task 2 | ❌ W0 | ⬜ pending |
| 01-09-01 | 09 | 9 | FOUND-01, EDU-02, EDU-03, NFR-03 | T-01-12 | Guide/evidence cover every requirement/threat and preserve Pending approval | docs/integrity | focused iteration-evidence command from 01-09 Task 1 | ❌ W0 | ⬜ pending |
| 01-09-02 | 09 | 9 | FOUND-01, ARCH-01, EDU-03, CORE-01, CORE-02, CORE-03, CORE-04, NFR-01, NFR-02, NFR-03 | T-01-12 | Full offline gate validates build, tests, links, traceability, threats, and governance states | gate | bundled Node 24 `npm run validate` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Plans 01-01 and 01-02 create fail-first specifications and reviewed contracts before Plan 01-03 activates `package.json` and the lockfile from exactly one human-gate-authored duplicate-preserving tuple-array pin record.
- [ ] `tsconfig.json` and `tsconfig.core.json` — strict project and forbidden-import boundary compilation.
- [ ] `vitest.config.ts` — deterministic non-watch test execution.
- [ ] `tests/contracts/` — schema, event, dependency-boundary, and port contracts.
- [ ] `tests/unit/` — orchestration success/failure matrix and deterministic builders.
- [ ] `tests/integration/` — reset evidence, Markdown search, JSONL, HTTP, teaching scenario, links, and traceability.
- [ ] `tests/smoke/cli.test.ts` — child-process CLI coverage under Node.js 24.
- [ ] `npm run validate` — typecheck, tests, build, and repository integrity without network access.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Package legitimacy checkpoint before dependency installation | NFR-03 | GSD research flagged current package publications as too new; a human must review exact names/versions before install | Compare proposed exact pins with official package documentation and the Package Legitimacy Audit in `01-RESEARCH.md`, then explicitly approve/replace/reject them and only after architecture review emit one canonical `dependencies`/`devDependencies` array-of-tuples record in 01-02-SUMMARY. |
| Architecture Review Gate | ARCH-01, NFR-03 | Repository governance forbids treating implementation as architectural approval | Review ADR-0003, package boundaries, schemas, ports, tests, and evidence; record findings without setting Approved or Stable. |
| Governing-baseline approval | NFR-03 | Explicit human approval cannot be automated | After findings are corrected, record the human decision separately from Implemented and Architecturally Reviewed states. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verification or Wave 0 dependencies.
- [ ] Sampling continuity: no three consecutive tasks without automated verification.
- [ ] Wave 0 covers every missing test/config reference.
- [ ] No watch-mode flags are used.
- [ ] Feedback latency is below 30 seconds.
- [ ] `nyquist_compliant: true` is set only after validation evidence exists.

**Approval:** pending
