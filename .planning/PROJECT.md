# Universal Agentic OS Course

## What This Is

A personal educational course and reference implementation that builds one internal-documentation assistant through ten runnable TypeScript iterations. Each iteration adds one major Agentic OS capability while keeping the core small, typed, testable, and understandable.

The stable walkthrough is: question → document search → tools → answer → state → quality evaluation.

## Core Value

A learner can understand, build, test, and review a reusable Agentic OS one working iteration at a time.

## Requirements

### Validated

(None yet — ship to validate.)

### Active

- [ ] Deliver ten runnable and comparable versions of one documentation assistant.
- [ ] Begin with one agent, one tool, a typed agent loop, shared CLI/API use case, JSONL journal, and deterministic tests.
- [ ] Add tools, MCP, RAG, memory, evaluations, observability, streaming UI, guardrails, and routing progressively.
- [ ] Preserve a provider-neutral domain and application core behind explicit ports.
- [ ] Produce explanation, tests, traceability, and review evidence for every iteration.

### Out of Scope

- React and Next.js — Angular with Tailwind is the selected UI path.
- UI, RAG, durable memory, MCP, and multi-agent behavior in Iteration 1 — the first slice must remain understandable end to end.
- Multi-tenant product administration and production SLOs — this milestone is a personal learning system and reference implementation.
- Architecture driven by one model provider, database, transport, or UI framework — those concerns remain adapters.
- Automatic acceptance of implemented work — human review remains distinct from implementation.

## Context

- Primary user and learner: Sergei.
- Scenario: an assistant answers questions from internal documentation and progressively gains retrieval, state, quality, and governance capabilities.
- The previous documentation-heavy Draft foundation was retired by ADR-0002 and remains recoverable from Git commit `e4a25e9`.
- The project is greenfield: there is no application code or package manifest yet.
- Open GSD Core 1.15.0 provides the operational planning workflow and is installed locally under ignored `.codex/`.

## Constraints

- **Runtime**: TypeScript on Node.js 24 — one language across the core, CLI, API, and later UI contracts.
- **Validation**: Zod at runtime boundaries — external and model-produced values are untrusted.
- **Architecture**: Functional domain/application core with explicit ports — frameworks and providers remain replaceable adapters.
- **Interfaces**: Node CLI and Fastify HTTP API call the same application use case — no duplicated orchestration.
- **Testing**: Vitest with deterministic fake model and fake tools — core tests require no network or paid provider.
- **Persistence**: JSONL first; PostgreSQL/pgvector only when RAG and durable state justify it.
- **UI**: Angular and Tailwind begin with streaming in Iteration 8 — no early frontend burden.
- **Process**: One logical task at a time with planning, implementation, review, and approval kept distinct.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use one documentation-assistant scenario for all ten iterations | Stable behavior makes architectural changes easy to compare | — Pending |
| Use TypeScript/Node.js, Zod, Fastify, and Vitest | A compact typed stack supports both learning and production-grade boundaries | — Pending |
| Keep the core independent of infrastructure and UI frameworks | The course teaches stable contracts rather than framework coupling | — Pending |
| Introduce PostgreSQL/pgvector only with RAG | Avoid infrastructure before it provides user value | — Pending |
| Introduce Angular/Tailwind only with streaming in Iteration 8 | The UI should consume a proven event contract | — Pending |
| Exclude React and Next.js | A second frontend stack adds complexity without serving the learning goal | — Pending |
| Use GSD as an operational workflow | Planning discipline is useful, but architecture and approval remain human responsibilities | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition:**
1. Move only shipped and confirmed requirements to Validated.
2. Move invalidated requirements to Out of Scope with a reason.
3. Record new requirements and material decisions.
4. Recheck that the project description and Core Value remain accurate.

**After each milestone:**
1. Review every section.
2. Recheck the Core Value.
3. Audit Out of Scope decisions.
4. Update context with evidence and lessons.

---
*Last updated: 2026-09-28 after greenfield restart initialization*
