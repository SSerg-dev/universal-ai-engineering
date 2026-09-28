# Repository Agent Instructions

This repository builds a ten-iteration Universal Agentic OS course. Read `docs/PROJECT-BRIEF.md` and `.planning/PROJECT.md` before planning or implementation.

## Working Rules

- Use GSD planning artifacts for execution context and progress.
- Define or update architectural contracts before implementation that depends on them.
- Keep the domain and application core independent of model vendors, Fastify, Angular, PostgreSQL, and MCP transports.
- Implement one logical task at a time.
- Keep planning, implementation, architectural review, and human approval as distinct states.
- Produce reproducible tests and a reviewable evidence record before advancing.
- Do not mark work Approved or Stable without explicit human approval.
- Preserve ADR identifiers and changelog history.
- Record architecture-changing decisions in a new ADR; never reuse an ADR number.
- Treat unexpected pre-existing content as a discovery finding, not disposable material.
- Validate internal links and requirement traceability before review.
- Do not assume Pull Requests, feature branches, or merge commits are required.

## Current Technical Direction

- TypeScript and Node.js 24
- Zod at runtime boundaries
- Fastify HTTP adapter and Node CLI adapter
- Vitest with deterministic fakes
- JSONL journal first; PostgreSQL/pgvector when RAG is introduced
- Angular and Tailwind only in the streaming UI iteration
- No React or Next.js

## GSD

- `.planning/PROJECT.md` defines current project context.
- `.planning/REQUIREMENTS.md` defines committed milestone scope.
- `.planning/ROADMAP.md` defines phase order and coverage.
- `.planning/STATE.md` records the current execution position.
- GSD is an operational workflow, not a substitute for architectural reasoning or human approval.
