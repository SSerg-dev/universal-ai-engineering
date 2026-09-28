# Phase 1: Typed Agent Loop - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-28
**Phase:** 1-Typed Agent Loop
**Areas discussed:** First tool contract, Model-to-loop protocol, Public run contract, Event and journal contract

---

## First tool contract

| Option | Description | Selected |
|--------|-------------|----------|
| Deterministic `search_docs` | Search a small checked-in Markdown fixture set with Zod input, lexical matching, and stable ordering. | ✓ |
| Hard-coded lookup | Return one fixed document or answer with almost no meaningful tool boundary. | |
| Semantic retrieval | Introduce embeddings or vector search during Phase 1. | |

**User's choice:** Accepted the recommended deterministic `search_docs` contract.
**Notes:** The user accepted all four recommendations and delegated the remaining details. RAG behavior remains reserved for Phase 4.

---

## Model-to-loop protocol

| Option | Description | Selected |
|--------|-------------|----------|
| Validated action union | Validate provider-neutral `call_tool` and `final_answer` actions and enforce explicit state and execution limits. | ✓ |
| Provider-native protocol | Allow one model SDK's response types to define the core loop. | |
| Free-form parsing | Infer actions from unstructured text. | |

**User's choice:** Accepted the recommended typed agent-loop protocol.
**Notes:** The delegated detail resolves to a two-state, one-tool-call flow with no retries and typed terminal failures.

---

## Public run contract

| Option | Description | Selected |
|--------|-------------|----------|
| Shared synchronous use case | One `RunAgentUseCase` returns a typed result to both CLI and Fastify adapters. | ✓ |
| Separate orchestration | Implement independent CLI and HTTP execution paths. | |
| Asynchronous jobs | Add submission, persistence, polling, and job lifecycle in Phase 1. | |

**User's choice:** Accepted the recommended shared synchronous contract.
**Notes:** The delegated detail selects `uaos ask` and `POST /api/v1/agent-runs`; streaming remains deferred.

---

## Event and journal contract

| Option | Description | Selected |
|--------|-------------|----------|
| Versioned correlated events | Write ordered JSONL envelopes with run correlation, typed event payloads, and safe metadata. | ✓ |
| Console logging | Emit unstructured text without a stable evidence contract. | |
| Full-content capture | Persist complete prompts, provider payloads, answers, and document bodies. | |

**User's choice:** Accepted the recommended versioned JSONL event contract.
**Notes:** The delegated detail uses injected clock/ID ports and excludes raw prompt and document content from the journal.

---

## the agent's Discretion

- Exact schema field constraints, state transitions, event names, source-reference checks, and initial failure codes were delegated to the agent and are recorded in `01-CONTEXT.md`.
- Exact filenames, internal helper types, fixture prose, console formatting, and HTTP status mapping remain planning/implementation discretion within those contracts.

## Deferred Ideas

- General tool registry (Phase 2), MCP (Phase 3), RAG and citations (Phase 4), durable state (Phase 5), evaluations (Phase 6), full observability (Phase 7), streaming UI (Phase 8), guardrails (Phase 9), and routing (Phase 10).
