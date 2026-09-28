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
| 01-01-01 | 01 | 1 | FOUND-01, ARCH-01, NFR-01 | T-01-01 | Contracts reject unknown values and core has no forbidden imports | docs/contract | `vitest run tests/integration/reset-evidence.test.ts tests/contracts/dependency-boundaries.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | CORE-01, CORE-03 | T-01-02 | Schemas reject invalid actions/events and preserve safe event payloads | contract | `vitest run tests/contracts/agent-events.test.ts tests/contracts/ports.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 2 | CORE-01, CORE-04, NFR-02 | T-01-03 | State and call limits prevent unbounded or invalid execution | unit | `vitest run tests/unit/run-agent.test.ts tests/unit/run-agent-failures.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 2 | EDU-02, NFR-02 | T-01-04 | Lexical search uses controlled fixture paths and deterministic ordering | integration | `vitest run tests/integration/search-docs.test.ts tests/integration/teaching-scenario.test.ts` | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 3 | CORE-02, CORE-03 | T-01-05 | CLI/API share the use case and journal paths cannot be user-controlled | smoke/integration | `vitest run tests/smoke/cli.test.ts tests/integration/http.test.ts tests/integration/jsonl-journal.test.ts` | ❌ W0 | ⬜ pending |
| 01-03-02 | 03 | 3 | EDU-03, NFR-03 | T-01-06 | Evidence records validation and keeps Implemented, Reviewed, and Approved distinct | gate | `npm run validate` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `package.json` and lockfile — exact dependency pins and reproducible scripts.
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
| Package legitimacy checkpoint before dependency installation | NFR-03 | GSD research flagged current package publications as too new; a human must review exact names/versions before install | Compare proposed exact pins with official package documentation and the Package Legitimacy Audit in `01-RESEARCH.md`, then explicitly approve or replace them. |
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
