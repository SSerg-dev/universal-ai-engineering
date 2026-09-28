# Universal Agentic OS Course

A ten-iteration TypeScript course and reference implementation for building an Agentic OS around one internal-documentation assistant.

The assistant evolves through a stable walkthrough:

`question → document search → tools → answer → state → quality evaluation`

## Current Scope

The first iteration is intentionally small:

- one agent;
- one tool;
- a typed agent loop;
- Node CLI and Fastify API adapters;
- a structured JSONL execution journal;
- deterministic automated tests;
- no RAG, durable memory, MCP, UI, or multi-agent coordination.

Later iterations add typed tools, MCP, RAG, memory, evaluations, observability, streaming with Angular/Tailwind, guardrails, and routing.

## Technology

- TypeScript and Node.js 24
- Zod
- Fastify
- Vitest
- PostgreSQL and pgvector when retrieval is introduced
- Angular and Tailwind when the UI is introduced

React and Next.js are not part of the selected architecture.

## Documentation

- [Project brief](docs/PROJECT-BRIEF.md)
- [Greenfield restart decision](docs/architecture/decisions/ADR-0002-greenfield-restart.md)
- [Legacy baseline index](docs/archive/LEGACY-BASELINE.md)
- [Reset evidence](docs/reviews/RESET-0001-evidence.md)
- [GSD project context](.planning/PROJECT.md)
- [Requirements](.planning/REQUIREMENTS.md)
- [Roadmap](.planning/ROADMAP.md)
- [Current state](.planning/STATE.md)

## Status

Greenfield planning. No implementation capability has been approved or shipped yet.
