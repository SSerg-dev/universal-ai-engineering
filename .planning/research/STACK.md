# Stack Research

**Domain:** Educational Agentic OS and internal-documentation assistant
**Researched:** 2026-09-28
**Confidence:** HIGH for the initial stack; MEDIUM for later-phase version pins

## Recommended Stack

| Technology | Version policy | Purpose | Why Recommended |
|------------|----------------|---------|-----------------|
| Node.js | 24 LTS, latest patch | Runtime | Active LTS and already required by local GSD. |
| TypeScript | Current stable; strict mode | Language and contracts | One typed language across core, adapters, tests, and UI contracts. |
| Zod | 4.x | Runtime schemas | TypeScript-first validation, inference, and JSON Schema conversion. |
| Fastify | 5.x | HTTP adapter | Small Node framework with explicit validation, serialization, logging, and TypeScript support. |
| Vitest | 5.x | Tests | Async tests, mocks, type tests, coverage, and sequential execution. |

## Phase-Scoped Technologies

| Technology | Introduce | Purpose |
|------------|-----------|---------|
| PostgreSQL 18.x | Phase 4 | Durable data and retrieval |
| pgvector 0.8.x | Phase 4 | Vector similarity search |
| MCP SDK | Phase 3 | Protocol adapter |
| Angular supported stable | Phase 8 | Streaming run inspector |
| Tailwind current stable | Phase 8 | UI styling through official Angular/PostCSS integration |

## Development Tools

- npm workspaces only when real package boundaries exist.
- ESLint and Prettier after the first package is scaffolded.
- TypeScript project references only when multiple packages justify build ordering.

Iteration 1 installs only what it uses. Database, MCP, and UI dependencies are not initial scaffolding.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Fastify | Native Node HTTP | A deliberately framework-free HTTP exercise |
| Vitest | Node test runner | Minimizing dependencies outweighs reporting and TypeScript ergonomics |
| PostgreSQL + pgvector | Separate vector database | Measured scale or retrieval needs exceed PostgreSQL's fit |
| Angular | Native TypeScript DOM UI | The UI stays a tiny single-page teaching demo |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| React or Next.js | Adds a second frontend model and conflicts with the chosen path | Angular in Phase 8 |
| Provider SDK types in core | Couples behavior to one provider and harms testing | Owned ports and adapter translations |
| ORM/database in Iteration 1 | Infrastructure before persistence value | JSONL journal and in-memory fakes |
| Floating major versions | Makes ten versions irreproducible | Lockfile and explicit major policy |

## Version Compatibility

- Node.js 24 is LTS through April 2028.
- Zod 4 supports TypeScript 5.5+ and requires strict mode.
- Vitest 5 requires Node 22.12+, so Node 24 is compatible.
- Confirm Fastify 5 against Node 24 in CI when scaffolding because its published support table still names earlier LTS lines.
- Pin Angular and Tailwind together only in Phase 8 using official guides.

## Sources

- https://nodejs.org/en/about/previous-releases
- https://nodejs.org/en/blog/migrations/v22-to-v24
- https://www.typescriptlang.org/docs/
- https://zod.dev/
- https://fastify.dev/docs/latest/Reference/LTS/
- https://vitest.dev/guide/
- https://angular.dev/reference/releases
- https://tailwindcss.com/docs/installation/framework-guides/angular
- https://www.postgresql.org/docs/current/index.html
- https://github.com/pgvector/pgvector

---
*Stack research for: Universal Agentic OS Course*
*Researched: 2026-09-28*
