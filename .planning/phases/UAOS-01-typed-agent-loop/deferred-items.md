# Deferred Items

- **Plan 01-06 — core-only TypeScript project:** The full Vitest suite currently has two expected failures in `tests/contracts/dependency-boundaries.test.ts` because `tsconfig.core.json` is intentionally scheduled for Plan 01-06. Plan 01-04 focused verification and project-wide typecheck pass; no Plan 01-06 implementation was pulled forward.
