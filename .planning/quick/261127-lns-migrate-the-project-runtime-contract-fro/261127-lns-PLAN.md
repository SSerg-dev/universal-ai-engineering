---
quick_id: 261127-lns
status: planned
mode: quick-full
description: Migrate the project runtime contract from Node.js 24 to Node.js 26.x, verify on 26.11.1, preserve historical Node 24 evidence, and update packages, tests, and current documentation
must_haves:
  truths:
    - The active root and Angular packages require Node.js 26.x and validate on Node.js 26.11.1.
    - Historical Node.js 24 approval and review evidence remains unchanged and explicitly historical.
    - The Node type surface is aligned to the Node.js 26 runtime through an exact admitted package pin.
  artifacts:
    - docs/architecture/decisions/ADR-0017-node-26-runtime-baseline.md
    - docs/reviews/DEPENDENCIES-RUNTIME-26.json
    - package.json
    - package-lock.json
    - ui/package.json
    - ui/package-lock.json
  key_links:
    - Current runtime documentation points to Node.js 26 while preserved phase evidence continues to describe its original Node.js 24 verification.
    - Runtime contract tests bind package manifests, lockfiles, process runtime, and the dependency admission record.
---

# Quick Task 261127-lns — Node.js 26 runtime migration

## Task 1 — Record the architecture decision before dependent implementation

**Files:** `docs/architecture/decisions/ADR-0017-node-26-runtime-baseline.md`, `docs/PROJECT-BRIEF.md`, `.planning/PROJECT.md`, `AGENTS.md`, `README.md`, `CHANGELOG.md`

**Action:** Add ADR-0017 selecting active Node.js `26.x`, with `26.11.1` as the verified host version and historical Node.js 24 evidence retained rather than rewritten. Update only current technical-direction and operator-facing statements; leave historical phase summaries and evidence intact.

**Verify:** `rg -n "Node(?:\.js)? 26|Node 26" AGENTS.md README.md docs/PROJECT-BRIEF.md .planning/PROJECT.md docs/architecture/decisions/ADR-0017-node-26-runtime-baseline.md CHANGELOG.md`

**Done:** The architecture-changing runtime decision exists before package and test changes, and current documentation consistently distinguishes the active baseline from historical Node 24 evidence.

## Task 2 — Align manifests, type surface, locks, and runtime gates

**Files:** `package.json`, `package-lock.json`, `ui/package.json`, `ui/package-lock.json`, `docs/reviews/DEPENDENCIES-RUNTIME-26.json`, `tests/integration/iteration-evidence.test.ts`, `tests/contracts/ui-boundaries.test.ts`, `tests/contracts/runtime-baseline.test.ts`

**Action:** Set both package engines to `26.x`; replace exact `@types/node@24.19.0` with admitted `@types/node@26.6.11`; regenerate only the affected lock metadata. Add a machine-readable admission record with exact integrity and runtime verification. Update current runtime checks while preserving assertions over the original accepted Node 24 pins and evidence records.

**Verify:** `node --version; npm ls @types/node --depth=0; npm run typecheck; npm run typecheck:core; npm --prefix ui run test`

**Done:** Manifests and locks agree on Node 26 and the new type pin, historical package acceptance remains traceable, and focused contract/type checks pass under Node 26.11.1.

## Task 3 — Prove the migrated workspace

**Files:** `.planning/quick/261127-lns-migrate-the-project-runtime-contract-fro/261127-lns-SUMMARY.md`, `.planning/quick/261127-lns-migrate-the-project-runtime-contract-fro/261127-lns-VERIFICATION.md`

**Action:** Run full root and UI validation under Node.js 26.11.1, record exact results and any database/browser exclusions honestly, and verify no unrelated PDF/DOCX working-tree changes were staged or overwritten.

**Verify:** `npm run validate; npm --prefix ui run validate; git diff --check`

**Done:** Both validation gates pass under Node.js 26.11.1 and the migration has reviewable evidence without claiming approval or stability.
