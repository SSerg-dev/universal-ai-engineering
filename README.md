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

- [Iteration 4 grounded retrieval](docs/iterations/04-grounded-retrieval.md)
- [Iteration 4 evidence](docs/reviews/ITERATION-04-evidence.md)
- [Iteration 3 MCP boundary](docs/iterations/03-mcp-boundary.md)
- [Iteration 3 evidence](docs/reviews/ITERATION-03-evidence.md)
- [Iteration 2 typed tools](docs/iterations/02-typed-tool-system.md)
- [Iteration 2 evidence](docs/reviews/ITERATION-02-evidence.md)
- [Iteration 1 walkthrough](docs/iterations/01-typed-agent-loop.md)
- [Iteration 1 evidence](docs/reviews/ITERATION-01-evidence.md)
- [Project brief](docs/PROJECT-BRIEF.md)
- [Greenfield restart decision](docs/architecture/decisions/ADR-0002-greenfield-restart.md)
- [Legacy baseline index](docs/archive/LEGACY-BASELINE.md)
- [Reset evidence](docs/reviews/RESET-0001-evidence.md)
- [GSD project context](.planning/PROJECT.md)
- [Requirements](.planning/REQUIREMENTS.md)
- [Roadmap](.planning/ROADMAP.md)
- [Current state](.planning/STATE.md)

## Status

Phase 1 implementation is complete with offline CLI, Fastify HTTP, JSONL evidence, and deterministic tests. See the walkthrough for Node.js 24 installation, execution, and validation. Phase 1 was explicitly approved on 2026-11-09. Phase 2 adds a typed registry and a second tool. Phase 3 adds a consented local stdio MCP capability. Phase 4 adds PostgreSQL/pgvector ingestion, extractive grounding, and immutable passage citations. Select iterations explicitly through composition; iteration 1 remains the default. Phase 2–4 review and approval are pending. Stability remains a separate decision.
