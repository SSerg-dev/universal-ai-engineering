---
quick_id: 261127-lns
status: complete
completed: 2026-11-27
---

# Node.js 26 runtime migration — Summary

The active workspace runtime contract is now Node.js `26.x`, initially verified on `26.11.1`. ADR-0017 records the architecture change without rewriting historical Node.js 24 evidence.

## Delivered

- Root and Angular manifests/locks require Node.js `26.x`.
- The exact Node type surface moved from `@types/node@24.19.0` to admitted `@types/node@26.6.11`.
- `DEPENDENCIES-RUNTIME-26.json` records authorization, integrity, runtime/npm identity and a zero-vulnerability production audit.
- Runtime, UI boundary and historical-evidence contracts distinguish the active baseline from original Node.js 24 approvals.
- Database, browser and preview runner guards now require Node.js 26.
- Current project/operator documentation and the downloadable Russian persistent-database guide use Node.js 26.

## Atomic commits

- `d0ae67e` — select the Node.js 26 architecture baseline.
- `a8372ba` — migrate manifests, locks, dependency admission and runtime tests.
- `71047c4` — update local launch guides for Node.js 26.
- `f892258` — align executable database/browser runner guards.

## Verification

- `node --version`: `v26.11.1`.
- Root `npm run validate`: 58 files and 502 tests passed, followed by TypeScript build.
- Real PostgreSQL/pgvector `npm run test:database`: 8 files and 51 tests passed; owned container removed.
- Clean isolated UI `npm --prefix ui run validate`: 3 files and 27 tests passed plus Angular AOT build.
- `npm audit --omit=dev --json`: zero production vulnerabilities.
- `npm ls @types/node --depth=0`: exact `@types/node@26.6.11`.

The main working tree still contains pre-existing, uncommitted PDF/DOCX implementation. Its in-progress UI component currently disagrees with its old UI tests; those files were neither staged nor modified by this migration. Clean committed Node.js 26 UI validation passed.

Implementation is complete. Architectural review, human approval and stability remain separate pending states.

