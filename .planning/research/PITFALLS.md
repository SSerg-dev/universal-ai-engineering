# Pitfalls Research

**Domain:** Educational Agentic OS and internal-documentation assistant
**Researched:** 2026-09-28
**Confidence:** HIGH

## Critical Pitfalls

### Framework Types Leak Into the Core

Provider responses, Fastify requests, PostgreSQL rows, or Angular models become domain types. Parse and translate at adapter boundaries; add dependency-boundary tests in Phase 1.

**Warning sign:** Core imports vendor SDKs, Fastify, database clients, MCP transports, or Angular.

### The Loop Is Only a While Statement

Termination, budgets, cancellation, retries, errors, and evidence remain implicit. Model explicit actions, terminal states, iteration limits, typed errors, and journal events from the first version.

**Warning sign:** Tests must inspect logs or mock internals to understand why a run stopped.

### RAG Precedes a Grounding Contract

Retrieval returns plausible text without resolvable citations. Define source identity, passage, score, citation, and grounding contracts before pgvector.

**Warning sign:** An answer cannot identify the exact passage supporting it.

### Memory Becomes Hidden Global State

Behavior changes across runs without an inspectable write, scope, or retention policy. Separate run state, conversation state, and learned memory.

**Warning sign:** Replaying identical inputs produces unexplained differences.

### MCP Is Treated as Trusted Local Code

Remote descriptions, arguments, results, and effects bypass validation or consent. Allow-list capabilities, validate every message, minimize disclosure, and require approval for consequential tools.

**Warning sign:** Server-supplied annotations directly decide authorization.

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | Acceptable? |
|----------|-------------------|----------------|-------------|
| One giant `agent.ts` | Fast demo | Boundaries disappear | Throwaway spike only |
| Real model in every test | Realistic output | Slow, costly, nondeterministic | Opt-in smoke tests only |
| Database from day one | Production appearance | Slows the first learning slice | No |
| UI-owned event shapes | Fast frontend progress | Backend/UI drift | No |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Logging prompts/documents by default | Internal data disclosure | Redaction and content-off telemetry defaults |
| Trusting model tool arguments | Malformed or unauthorized actions | Zod validation and permissions |
| MCP tools without consent | Arbitrary data access or execution | Allow-list, approval, audit |
| Unlimited loops and calls | Cost and denial-of-service | Iteration, time, token, and tool budgets |

## Looks Done But Isn't

- [ ] Successful answer: also verify failure, timeout, cancellation, and malformed model output.
- [ ] Citation: verify it resolves to the exact indexed passage.
- [ ] Trace: verify sensitive content is redacted.
- [ ] UI completion: verify reconnect, cancellation, duplicate, and out-of-order events.
- [ ] Implementation: keep approval state separate.

## Sources

- https://modelcontextprotocol.io/specification/latest
- https://zod.dev/
- https://vitest.dev/guide/
- https://github.com/pgvector/pgvector

---
*Pitfalls research for: Universal Agentic OS Course*
*Researched: 2026-09-28*
