# Project Research Summary

**Project:** Universal Agentic OS Course
**Domain:** Educational Agentic OS and internal-documentation assistant
**Researched:** 2026-09-28
**Confidence:** HIGH

## Executive Summary

Build a sequence of vertical, runnable slices around one stable documentation-assistant scenario. Start with an owned typed event and state model, a deterministic agent loop, narrow ports, and adapter-only I/O. Each later capability then extends the same engine rather than replacing it.

Node.js 24 LTS, strict TypeScript, Zod 4, Fastify 5, and Vitest 5 form a coherent initial stack. PostgreSQL/pgvector, MCP, Angular, and Tailwind should be pinned only in the phases that introduce them. The main risk is premature integration: database, UI, memory, provider SDKs, or complex autonomy before the core contracts are observable and testable.

## Key Findings

### Recommended Stack

- Node.js 24 LTS and strict TypeScript for runtime and contracts.
- Zod 4 at every untrusted runtime boundary.
- Fastify as an HTTP adapter, not an application framework.
- Vitest with deterministic fake model and tool adapters.
- JSONL first, then PostgreSQL/pgvector with RAG.
- Angular/Tailwind only after a transport-neutral streaming event model exists.

### Expected Features

**Must have:** typed loop, tool action, shared CLI/API use case, journal, deterministic tests, and per-iteration evidence.

**Differentiators:** ten runnable evolutionary versions, explicit trust boundaries, measurable quality, and a live execution inspector.

**Defer:** multi-tenancy, production SLOs, and autonomous multi-agent coordination.

### Architecture Approach

Use a functional core and imperative shell. Domain contracts and state transitions remain pure; model, tool, storage, transport, clock, and telemetry behavior enters through ports. One discriminated event protocol feeds the JSONL journal first and later tracing, streaming, and UI.

### Critical Pitfalls

1. Framework and SDK types leaking into core contracts.
2. An implicit loop without typed termination, budgets, cancellation, and errors.
3. RAG without resolvable citations and evaluation.
4. Hidden global memory.
5. MCP tools executed without validation, consent, or audit.

## Implications for Roadmap

The ten selected iterations follow the dependency graph:

1. Governed typed agent loop.
2. Typed tools and resilience.
3. MCP boundary.
4. Grounded retrieval.
5. Durable state and controlled memory.
6. Evaluation system.
7. End-to-end observability.
8. Streaming Angular/Tailwind UI.
9. Guardrails and human approval.
10. Typed router and course completion.

Each phase should use MVP mode and preserve earlier behavior. Later integrations need phase-specific research because protocol and framework versions may change before implementation.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Initial versions and compatibility checked against official documentation. |
| Features | HIGH | Scope is explicitly chosen by the user and dependency-ordered. |
| Architecture | HIGH | Boundaries follow portability and learning goals. |
| Pitfalls | HIGH | Risks align with official MCP safety guidance and deterministic testing needs. |

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
- https://modelcontextprotocol.io/specification/latest

---
*Research completed: 2026-09-28*
*Ready for roadmap: yes*
