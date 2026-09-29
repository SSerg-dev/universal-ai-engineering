# ADR-0003: Typed Agent Loop Contracts

- **Status:** Decided for implementation; architecture review pending
- **Date:** 2026-09-29
- **Decision owner:** Project Founder through Phase 1 context delegation
- **Supersedes:** Nothing
- **Related evidence:** `docs/reviews/ARCH-0001-iteration-01-gate.md`

## Context

Iteration 1 must demonstrate one understandable, provider-neutral agent loop before packages, schemas, ports, orchestration, or adapters depend on its vocabulary. The governing Phase 1 context fixes decisions D-01 through D-21. Research resolved five delegated details: public error stages, composition limits, cancellation evidence cleanup, the runtime model expectation, and the package-legitimacy procedure.

This ADR records those contracts without introducing any Phase 2-9 capability. Architectural review, human approval, and stability remain separate later states.

## Decision

### Tool and lexical search contracts

- **D-01 — Literal tool and input.** The only Phase 1 tool name is `search_docs`. `SearchDocsInput` is `{ query: string; limit?: number }`. At the model boundary, Zod receives `unknown`, rejects unknown keys, trims `query`, requires the trimmed value to be non-empty, defaults `limit` to `3`, and restricts it to an integer from `1` through `5`.
- **D-02 — Search result.** `SearchDocsOutput` is `{ matches: SearchDocumentMatch[] }`. Each match is `{ documentId, title, excerpt, matchedTerms }`. `matches: []` is a successful result.
- **D-03 — Deterministic lexical details.** A small checked-in Markdown fixture set is the search corpus. The filename supplies the stable `documentId`; the first level-one heading supplies `title`. Search normalizes and deduplicates query terms, compares them case-insensitively with Unicode-aware text normalization, ranks by matched-term count, breaks ties by `documentId`, and uses the first matching non-heading content line as the bounded excerpt.
- **D-04 — Source-reference wording.** Returned document IDs are **source references**, not grounded passage citations. There are no embeddings, vector similarities, chunk indexes, generated citations, or PostgreSQL dependencies in Phase 1.
- **D-05 — Narrow port.** The application depends on one `SearchDocsPort`. Markdown loading, trusted fixture-root access, token matching, ranking, and excerpt construction are outbound-adapter concerns.

### Model protocol and state machine

- **D-06 — Provider-neutral model boundary.** `ModelPort` accepts provider-neutral input and returns `unknown`. Provider SDK types and raw provider payloads do not enter domain or application contracts.
- **D-07 — Validated actions.** The action union contains only:
  - `call_tool`: `{ type: "call_tool", toolName: "search_docs", arguments: SearchDocsInput }`
  - `final_answer`: `{ type: "final_answer", answer: string, sourceIds: string[] }`
- **D-08 — Two states.** The state machine begins in `awaiting_tool`; it accepts exactly one valid `call_tool` and transitions to `awaiting_final`. `awaiting_final` accepts exactly one valid `final_answer` and terminates successfully. A final answer before search, another tool call after search, an unknown action, or a final answer containing a source ID outside the returned match set fails without executing another side effect.
- **D-09 — Budgets and cancellation.** One run allows exactly the successful-path maximum of two model calls and one tool call, with no automatic retries. One overall composition deadline defaults to `5000` ms. A caller-provided `AbortSignal` is composed with the deadline and propagated through model, tool, and ordinary journal operations.
- **D-10 — Stable failures.** Public failures use only the following codes and meanings:

| Code | Meaning |
|---|---|
| `INVALID_REQUEST` | Public input failed strict validation before orchestration could proceed. |
| `MODEL_FAILURE` | The model adapter failed while producing an action. |
| `INVALID_MODEL_ACTION` | Model output did not match the strict provider-neutral action union. |
| `INVALID_TRANSITION` | A valid action was not allowed in the current loop state, including invented source references. |
| `TOOL_FAILURE` | The search adapter failed during the permitted tool call. |
| `TIMEOUT` | The composition deadline won before terminal completion. |
| `CANCELLED` | The caller cancellation signal won before terminal completion. |
| `LIMIT_EXCEEDED` | A model/tool call would exceed the two/one policy. |
| `JOURNAL_FAILURE` | Required evidence could not be appended; later model/tool actions must not run. |
| `INTERNAL_ERROR` | An unexpected orchestration failure was normalized without leaking its cause. |

Every error has `stage: "request" | "model" | "tool" | "journal" | "orchestration"`, a stable message, and `retryable: boolean`. Adapter exceptions and stack/cause details never become public values.

### Public execution contract

- **D-11 — One use case.** `RunAgentUseCase` owns validation, transitions, budgets, deadline/cancellation classification, error normalization, and journaling. CLI and Fastify are thin inbound adapters to that same use case.
- **D-12 — Input and result.** The use case assigns a generated `runId`, accepts `unknown`, validates strict `RunAgentInput { question: string }`, and returns either `{ ok: true, runId, answer, sources, usage }` or `{ ok: false, runId, error: { code, message, stage, retryable } }`. `sources` contains only `{ documentId, title }`; `usage` contains model-call and tool-call counts, not provider billing data.
- **D-13 — Synchronous adapters.** The CLI is `uaos ask "<question>"`. HTTP is `POST /api/v1/agent-runs` with `{ "question": "..." }`. Fastify's JSON body limit is `16384` bytes (16 KiB). No polling, job store, SSE, or WebSocket is introduced.
- **D-14 — Shared cancellation path.** CLI `SIGINT` and HTTP request disconnection drive the same caller cancellation signal. Cancellation and timeout remain different public failures and terminal events.

Public HTTP mapping is fixed as follows:

| Result | HTTP status |
|---|---:|
| Success | `200` |
| `INVALID_REQUEST` | `400` |
| `TIMEOUT` | `408` |
| `CANCELLED` | `499` |
| `INVALID_MODEL_ACTION`, `INVALID_TRANSITION`, `LIMIT_EXCEEDED` | `422` |
| `MODEL_FAILURE`, `TOOL_FAILURE` | `502` |
| `JOURNAL_FAILURE`, `INTERNAL_ERROR` | `500` |

### Events and journal

- **D-15 — Versioned envelope.** Each JSONL line is one strict `AgentEventEnvelope { schemaVersion, eventId, runId, sequence, occurredAt, eventType, payload }`. `schemaVersion` is `"1.0"`; sequence starts at `1` and increases monotonically within one run.
- **D-16 — Vocabulary and terminal set.** Event types are `run.started`, `model.requested`, `model.responded`, `tool.requested`, `tool.succeeded`, `tool.failed`, `run.succeeded`, `run.failed`, and `run.cancelled`. Terminal types are `run.succeeded`, `run.failed`, and `run.cancelled`; a writable journal receives exactly one terminal event.
- **D-17 — Safe payloads.** Allow-listed payloads may include step/call identifiers, action kind, literal tool name, durations or counts, normalized error code, answer length, and returned source IDs. They exclude raw prompts, complete questions, document bodies, excerpts, full answers, provider payloads, exception causes, and hidden reasoning.
- **D-18 — Deterministic evidence.** `ClockPort` and `IdGeneratorPort` supply timestamps and identifiers. Deterministic replacements make the event sequence and JSONL reproducible.
- **D-19 — Awaited, fail-closed persistence.** Every append is awaited before a later model or tool effect. Ordinary appends use the composed run signal. When caller cancellation has already aborted that signal, `run.cancelled` uses an independent terminal-evidence cleanup signal bounded to `250` ms. If the terminal append fails, the public result becomes `JOURNAL_FAILURE`.

Journal storage uses one JSONL file per generated `runId`. Paths are derived from configured roots and generated identifiers, never from the question, model arguments, or provider data.

### Dependency boundaries and deterministic adapters

- **D-20 — Inward dependencies.** Domain owns stable values/schemas. Application owns orchestration and narrow ports. Inbound and outbound adapters own Fastify, Node process/CLI, filesystem, and provider concerns. Domain and application must not import Fastify, Angular, PostgreSQL clients, MCP transports, provider SDKs, or filesystem/process APIs.
- **D-21 — First-class test adapters.** A fake model, fake search tool, fake clock, fake ID generator, and in-memory journal implement the same ports and exercise real boundary parsing. Offline tests cover success, model/tool/journal failures, timeout, cancellation, invalid action, invalid transition, source-reference membership, limits, and safe events.

Phase 1's default runnable model is a clearly labeled **deterministic teaching model** used by both CLI and HTTP. It follows the question → `search_docs` → answer script without credentials, provider SDKs, network access, or provider-shaped core types.

## Transition Table

| Current state | Accepted action | Effect | Next state |
|---|---|---|---|
| `awaiting_tool` | `call_tool(search_docs)` | Persist request evidence, execute one search, persist result evidence | `awaiting_final` |
| `awaiting_tool` | `final_answer` | `INVALID_TRANSITION`; no success | terminal failure |
| `awaiting_final` | `final_answer` with source-ID subset | Persist terminal evidence and return success | terminal success |
| `awaiting_final` | `call_tool` | `INVALID_TRANSITION`; do not execute | terminal failure |
| Either | malformed/unknown output | `INVALID_MODEL_ACTION`; do not execute | terminal failure |
| Either | next call exceeds budget | `LIMIT_EXCEEDED`; do not execute | terminal failure |

## Package Legitimacy Procedure

No package is installed or approved by this ADR. Candidate exact pins from research remain unaccepted until Plan 01-02's blocking human package-legitimacy and architecture review gate. A later workspace plan may use only the gate's canonical accepted tuple record and must reject malformed or duplicate entries before generating a package manifest or lockfile.

## Consequences

- Schemas, ports, adapters, and tests can share one explicit vocabulary.
- D-10 failure meanings and the D-15 envelope are compatibility contracts; changes require a new decision and coordinated consumer migration.
- The bounded cancellation evidence path reconciles caller cancellation with fail-closed journaling.
- The first iteration remains small and offline, at the cost of deliberately supporting only one tool and a deterministic teaching model.
- General tool registries, MCP, semantic/RAG retrieval, durable memory, evaluations, full observability, streaming/UI, guardrails, routing, and multi-agent behavior remain deferred to their roadmap phases.

## Review State

- **Implemented:** Pending — dependent contracts and runtime code do not yet exist.
- **Architecturally Reviewed:** Pending
- **Approved:** Pending
- **Stable:** Pending

Recording this decision does not satisfy any of those later governance states.
