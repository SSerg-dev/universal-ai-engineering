---
phase: "01"
slug: "typed-agent-loop"
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-09-28"
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 with Vite 8.3.1 peer |
| **Config file** | `vitest.config.ts` — installed deterministic suite |
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
| 01-01-01 | 01 | 1 | FOUND-01, ARCH-01, NFR-03 | T-01-01 | Reset/ADR/gate documents preserve recovery and separate governance states | docs/contract | `npm test -- tests/integration/reset-evidence.test.ts tests/contracts/dependency-boundaries.test.ts` | Yes | green |
| 01-01-02 | 01 | 1 | EDU-02, CORE-01, CORE-04, NFR-01 | T-01-01 | Reset, dependency, loop, and teaching specifications are concrete and unskipped | specification | `npm test -- tests/unit/run-agent.test.ts tests/integration/teaching-scenario.test.ts` | Yes | green |
| 01-01-03 | 01 | 1 | CORE-01, CORE-03, CORE-04 | T-01-01 | Schema/event specifications enumerate strict boundaries and safe event vocabulary | specification | `npm test -- tests/contracts/schemas.test.ts tests/contracts/agent-events.test.ts` | Yes | green |
| 01-02-01 | 02 | 2 | CORE-01, CORE-03, CORE-04 | T-01-02 | Strict schemas reject malformed input/actions/events and allow-list journal payloads | contract | `npm test -- tests/contracts/schemas.test.ts tests/contracts/agent-events.test.ts` | Yes | green |
| 01-02-02 | 02 | 2 | ARCH-01, NFR-01, NFR-02 | T-01-03 | Five ports remain signal-aware and free of provider/framework/filesystem types | contract | `npm test -- tests/contracts/ports.test.ts tests/contracts/dependency-boundaries.test.ts` | Yes | green |
| 01-02-03 | 02 | 2 | ARCH-01, NFR-03 | T-01-SC | No install occurs before exact pin verification and Architecture Review Gate | blocking human gate | `npm test -- tests/integration/iteration-evidence.test.ts` | Yes | green |
| 01-03-01 | 03 | 3 | ARCH-01, NFR-01, NFR-03 | T-01-SC | Workspace parses the unique completed-gate tuple arrays, validates exact row shape/name/SemVer and rejects within/across-category duplicates before map construction, then exact-compares package.json and package-lock root maps/classes | configuration | `npm test -- tests/integration/iteration-evidence.test.ts` | Yes | green |
| 01-03-02 | 03 | 3 | CORE-01, CORE-03, CORE-04 | T-01-04 | Core tracer produces exact result/usage/eight-event path through reviewed ports | unit tracer | `npm test -- tests/unit/run-agent.test.ts` | Yes | green |
| 01-04-01 | 04 | 4 | EDU-02, NFR-02 | T-01-05 | Controlled Markdown fixtures produce deterministic lexical source references | integration tracer | `npm test -- tests/integration/teaching-scenario.test.ts` | Yes | green |
| 01-04-02 | 04 | 4 | EDU-02, CORE-01, CORE-03 | T-01-05 | First-class deterministic model/clock/ID/journal adapters make the tracer reproducible | unit/integration | `npm test -- tests/unit/run-agent.test.ts tests/integration/teaching-scenario.test.ts` | Yes | green |
| 01-05-01 | 05 | 5 | CORE-01, CORE-04 | T-01-06 | Runtime schemas cover defaults, bounds, strict shapes, results, and errors | contract | `npm test -- tests/contracts/schemas.test.ts` | Yes | green |
| 01-05-02 | 05 | 5 | EDU-02, CORE-04, NFR-02 | T-01-06 | Unicode/case, ties, excerpts, empty matches, and trusted roots are deterministic | integration | `npm test -- tests/integration/search-docs.test.ts tests/integration/teaching-scenario.test.ts` | Yes | green |
| 01-06-01 | 06 | 6 | CORE-01, CORE-03, CORE-04 | T-01-07, T-01-08 | Every failure, timeout, cancel, limit, source, journal, and concurrency path is typed | unit/contract | `npm test -- tests/contracts/agent-events.test.ts tests/unit/run-agent.test.ts tests/unit/run-agent-failures.test.ts` | Yes | green |
| 01-06-02 | 06 | 6 | NFR-01, NFR-02 | T-01-08 | Core compilation and dependency/port tests fail fast and cannot mask one another | architecture/contract | `npm test -- tests/contracts/dependency-boundaries.test.ts tests/contracts/ports.test.ts` | Yes | green |
| 01-07-01 | 07 | 7 | CORE-03, CORE-04 | T-01-09 | JSONL validates envelopes, contains paths, excludes content, and fails closed | integration tracer | `npm test -- tests/integration/jsonl-journal.test.ts` | Yes | green |
| 01-07-02 | 07 | 7 | EDU-02, CORE-02, NFR-02 | T-01-10 | CLI shares the use case, maps SIGINT, and leaves one terminal event | smoke/integration | `npm test -- tests/smoke/cli.test.ts tests/integration/teaching-scenario.test.ts tests/integration/jsonl-journal.test.ts` | Yes | green |
| 01-08-01 | 08 | 8 | CORE-02, CORE-04 | T-01-11 | HTTP enforces transport bounds and exact logical/status mapping | integration tracer | `npm test -- tests/integration/http.test.ts` | Yes | green |
| 01-08-02 | 08 | 8 | CORE-02, CORE-03, CORE-04 | T-01-11 | HTTP parity, disconnect cause, and concurrent persisted runs remain isolated | integration | `npm test -- tests/integration/http.test.ts tests/integration/teaching-scenario.test.ts tests/integration/jsonl-journal.test.ts` | Yes | green |
| 01-09-01 | 09 | 9 | FOUND-01, EDU-02, EDU-03, NFR-03 | T-01-12 | Guide/evidence cover every requirement/threat and preserve Pending approval | docs/integrity | `npm test -- tests/integration/iteration-evidence.test.ts` | Yes | green |
| 01-09-02 | 09 | 9 | FOUND-01, ARCH-01, EDU-03, CORE-01, CORE-02, CORE-03, CORE-04, NFR-01, NFR-02, NFR-03 | T-01-12 | Full offline gate validates build, tests, links, traceability, threats, and governance states | gate | `npm run validate` | Yes | green |

All twenty rows are green. Historical pre-workspace static predicates remain recorded in the earlier summaries; the commands above revalidate their resulting contracts and evidence with the installed offline suite.

---

## Wave 0 Requirements

- [x] Plans 01-01 and 01-02 create fail-first specifications and reviewed contracts before Plan 01-03 activates `package.json` and the lockfile from exactly one human-gate-authored duplicate-preserving tuple-array pin record.
- [x] `tsconfig.json` and `tsconfig.core.json` — strict project and forbidden-import boundary compilation.
- [x] `vitest.config.ts` — deterministic non-watch test execution.
- [x] `tests/contracts/` — schema, event, dependency-boundary, and port contracts.
- [x] `tests/unit/` — orchestration success/failure matrix and deterministic builders.
- [x] `tests/integration/` — reset evidence, Markdown search, JSONL, HTTP, teaching scenario, links, and traceability.
- [x] `tests/smoke/cli.test.ts` — child-process CLI coverage under Node.js 24.
- [x] `npm run validate` — typecheck, tests, build, and repository integrity using installed dependencies and local loopback HTTP only.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Package legitimacy checkpoint before dependency installation | NFR-03 | GSD research flagged current package publications as too new; a human must review exact names/versions before install | Compare proposed exact pins with official package documentation and the Package Legitimacy Audit in `01-RESEARCH.md`, then explicitly approve/replace/reject them and only after architecture review emit one canonical `dependencies`/`devDependencies` array-of-tuples record in 01-02-SUMMARY. |
| Architecture Review Gate | ARCH-01, NFR-03 | Repository governance forbids treating implementation as architectural approval | Review ADR-0003, package boundaries, schemas, ports, tests, and evidence; record findings without setting Approved or Stable. |
| Governing-baseline approval | NFR-03 | Explicit human approval cannot be automated | After findings are corrected, record the human decision separately from Implemented and Architecturally Reviewed states. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verification or Wave 0 dependencies.
- [x] Sampling continuity: no three consecutive tasks without automated verification.
- [x] Wave 0 covers every missing test/config reference.
- [x] No watch-mode flags are used.
- [x] Feedback latency is below 30 seconds.
- [x] `nyquist_compliant: true` is set only after validation evidence exists.

**Approval:** pending

## Final execution evidence

Verified on 2026-11-09 with bundled Node.js 24.22.1 and the accepted package lock. The full npm run validate gate passed project typecheck, explicit core-only compilation, 90 tests in 13 files, and build. The suite completed in 8.43 seconds on the first full closure pass. Repository links, eleven requirement rows, twenty task rows, thirteen threat identities, accepted direct pins, and pending approval/stability are covered by the integrity suite.

Real HTTP lifecycle tests use an ephemeral loopback port. They require local connection permission on a restricted host. Fixtures, fake adapters, and all model execution remain local and credential-free. Package installation is the separate registry-access step.

The 2026-09-30 manual package and contract review is historical evidence. Final implementation review, phase approval, and stability are pending.
