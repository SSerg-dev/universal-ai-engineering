# Architecture Research

**Domain:** Educational Agentic OS and internal-documentation assistant
**Researched:** 2026-09-28
**Confidence:** HIGH for boundaries; MEDIUM for later adapters

## System Overview

```text
CLI ─────┐
         ├──> Application use case ──> Agent loop ──> Ports
HTTP API ┘                                  │           ├── Model
                                           │           ├── Tools / MCP
                                           │           ├── Retrieval
                                           │           ├── State
                                           │           └── Journal / Telemetry
                                           └── typed events
                                                   └── Streaming API ──> Angular UI
```

## Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| Domain contracts | Run state, actions, events, errors, results | Pure TypeScript and Zod boundary schemas |
| Application use case | Start, cancel, and resume a run; enforce policies | Framework-independent orchestration |
| Agent loop | Select the next model/tool action until a terminal result | Explicit transition function plus effect runner |
| Ports | Declare model, tool, storage, retrieval, journal, and clock needs | Narrow TypeScript function contracts |
| Adapters | Translate provider, transport, storage, and UI protocols | Fastify, CLI, JSONL, MCP, PostgreSQL, Angular |

## Recommended Project Structure

```text
src/
├── domain/          # stable types, schemas, state transitions
├── application/     # use cases and ports
├── adapters/        # model, tool, journal, CLI, HTTP
└── composition/     # dependency wiring only
tests/
├── unit/
├── contract/
└── integration/
```

Add separate packages only when API and Angular create a real build boundary. Do not begin with a large monorepo matrix.

## Architectural Patterns

### Functional Core, Imperative Shell

State transitions remain deterministic; adapters perform I/O. The cost is explicit effect modeling, which is valuable for teaching and testing.

### Ports and Adapters

Application code depends on narrow capabilities rather than SDKs. Provider, database, protocol, and framework choices remain replaceable.

### Typed Event Protocol

Journal, telemetry, streaming, and UI consume one discriminated event model. Introduce it in Phase 1; do not build streaming infrastructure until Phase 8.

## Request Flow

```text
Question
  → boundary validation
  → application use case
  → agent-loop transition
  → requested effect through a port
  → validated effect result
  → journal event and next transition
  → terminal answer or typed failure
```

## Integration Points

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Model provider | Adapter behind model port | Normalize tool requests, usage, errors, and cancellation. |
| MCP | Adapter behind tool registry | JSON-RPC and capability negotiation; treat metadata and outputs as untrusted. |
| PostgreSQL/pgvector | Repository adapters | Keep chunk, citation, and state semantics outside SQL-specific types. |
| Angular | HTTP and streaming client | No imports from core to UI. |

## Build Order

1. Contracts and deterministic loop.
2. Tool registry and protocol adapters.
3. Grounded retrieval and state.
4. Evaluation and observability.
5. Streaming UI, guardrails, and routing.

## Sources

- https://modelcontextprotocol.io/specification/latest
- https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/
- https://zod.dev/
- https://www.postgresql.org/docs/current/index.html
- https://github.com/pgvector/pgvector

---
*Architecture research for: Universal Agentic OS Course*
*Researched: 2026-09-28*
