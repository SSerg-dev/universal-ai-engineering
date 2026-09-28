# Phase 1: Typed Agent Loop - Context

**Gathered:** 2026-09-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the smallest complete Agentic OS slice for the internal-documentation assistant: accept one question, obtain a typed next action from a model, execute exactly one documentation-search tool, obtain a terminal answer, and return a typed success or failure through both CLI and HTTP. Every run produces ordered JSONL evidence and is testable offline with deterministic adapters.

Phase 1 does not add a general tool registry, MCP, semantic retrieval, embeddings, PostgreSQL, durable conversation state, evaluations, streaming, UI, guardrails, routing, multi-agent behavior, or production deployment.

</domain>

<decisions>
## Implementation Decisions

### First tool contract

- **D-01:** The only tool is identified by the literal name `search_docs`. Its input is `SearchDocsInput { query: string; limit?: number }`, validated with Zod after model output crosses into the application. `query` is trimmed and non-empty; `limit` defaults to `3` and is restricted to `1..5`.
- **D-02:** The tool returns `SearchDocsOutput { matches: SearchDocumentMatch[] }`. Each match contains `documentId`, `title`, `excerpt`, and `matchedTerms`. An empty `matches` array is a successful tool result, not an exception.
- **D-03:** Phase 1 uses a small, checked-in Markdown fixture set. The filename supplies the stable document ID and the first level-one heading supplies the title. The adapter performs case-insensitive Unicode token matching, ranks by matched query-term count, and breaks ties by `documentId`, so results are deterministic.
- **D-04:** `search_docs` is deliberately lexical. It has no embeddings, vector similarity, chunk index, generated citation, or PostgreSQL dependency. Returned document IDs are simple source references; grounded passage citations remain a Phase 4 capability.
- **D-05:** The application depends on one narrow `SearchDocsPort`; loading Markdown and searching fixture content are adapter concerns. Phase 2 may replace this with a multi-tool registry without changing the Phase 1 behavior contract.

### Model-to-loop protocol

- **D-06:** `ModelPort` accepts provider-neutral input and returns `unknown`. The application validates every returned action with Zod before using it. Provider SDK request and response types must not enter domain or application modules.
- **D-07:** A validated model action is a discriminated union:
  - `call_tool`: `{ type: "call_tool", toolName: "search_docs", arguments: SearchDocsInput }`
  - `final_answer`: `{ type: "final_answer", answer: string, sourceIds: string[] }`
- **D-08:** The successful Phase 1 loop is an explicit two-state machine: `awaiting_tool` accepts one `call_tool`; `awaiting_final` accepts one `final_answer`. A final answer before search, a second tool call, an unknown action, or an answer referencing source IDs not returned by the tool becomes a typed failure.
- **D-09:** The policy permits at most two model calls and one tool call. It applies one overall deadline and propagates a caller-provided `AbortSignal` through model, tool, and journal ports. There are no automatic retries in Phase 1.
- **D-10:** Terminal failures use stable codes: `INVALID_REQUEST`, `MODEL_FAILURE`, `INVALID_MODEL_ACTION`, `INVALID_TRANSITION`, `TOOL_FAILURE`, `TIMEOUT`, `CANCELLED`, `LIMIT_EXCEEDED`, `JOURNAL_FAILURE`, and `INTERNAL_ERROR`. Adapter-specific exceptions are normalized at their boundary and never leak as public contracts. — **Reversibility:** costly — later phases, adapters, tests, and evidence will branch on these codes, so changing their meaning requires a compatibility update across every consumer.

### Public run contract

- **D-11:** One `RunAgentUseCase` owns orchestration. Both CLI and Fastify are inbound adapters and must not duplicate loop, validation, timeout, error-mapping, or journaling logic.
- **D-12:** The use case accepts unknown input, assigns a `runId`, validates `RunAgentInput { question: string }`, and returns a discriminated `RunAgentResult`:
  - success: `{ ok: true, runId, answer, sources, usage }`
  - failure: `{ ok: false, runId, error: { code, message, stage, retryable } }`
  `sources` contains only `{ documentId, title }`; `usage` reports model-call and tool-call counts rather than provider billing data.
- **D-13:** Phase 1 execution is synchronous. The CLI command is `uaos ask "<question>"`; it prints the answer, source references, and `runId`, and exits non-zero on failure. The HTTP endpoint is `POST /api/v1/agent-runs` with `{ "question": "..." }`; it returns the same logical result mapped to an appropriate HTTP status. No polling, job store, SSE, or WebSocket contract is introduced.
- **D-14:** CLI `SIGINT` and HTTP request disconnection map to the same `AbortSignal` cancellation path. Timeout and cancellation are distinct public failures and distinct terminal events.

### Event and journal contract

- **D-15:** Every journal line is one valid JSON object matching `AgentEventEnvelope { schemaVersion, eventId, runId, sequence, occurredAt, eventType, payload }`. `schemaVersion` begins as `"1.0"`; `sequence` starts at `1` and increases monotonically within a run. — **Reversibility:** costly — every later phase will extend this envelope and the Angular inspector will eventually consume it, so breaking it would require journal and consumer migration.
- **D-16:** Phase 1 event types are `run.started`, `model.requested`, `model.responded`, `tool.requested`, `tool.succeeded`, `tool.failed`, `run.succeeded`, `run.failed`, and `run.cancelled`. A run has exactly one terminal event whenever the journal remains writable.
- **D-17:** Model and tool events include step/call identifiers, action kind, tool name, durations or counts, error code, and returned source IDs as applicable. They do not record raw provider payloads, complete prompts, document bodies, or hidden model reasoning. The final answer remains in the public result; the journal records its length and source IDs.
- **D-18:** `ClockPort` and `IdGeneratorPort` supply timestamps and identifiers. Tests replace both, so complete event sequences and JSONL output are reproducible without depending on wall-clock time or random UUIDs.
- **D-19:** `JournalPort.append` is awaited in sequence. A write failure terminates execution as `JOURNAL_FAILURE`; no later model or tool action may run after evidence persistence fails.

### Package and dependency boundaries

- **D-20:** Organize implementation around `domain` contracts, `application` orchestration and ports, and outbound/inbound `adapters`. Domain and application code may import TypeScript types and Zod schemas owned by the core, but must not import Fastify, provider SDKs, filesystem APIs, or CLI libraries.
- **D-21:** Deterministic fake model, fake search tool, clock, ID generator, and in-memory journal are first-class test adapters. Contract tests exercise the real Zod boundaries; orchestration tests exercise success, model failure, tool failure, timeout, cancellation, invalid action, invalid transition, limit, and journal failure paths offline.

### the agent's Discretion

The user accepted all four recommended areas and explicitly delegated the remaining detailed decisions. Planning may choose exact filenames, module names, internal helper types, fixture prose, console formatting, and the HTTP status mapping, provided the contracts and boundaries above remain intact.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Repository governance and project direction

- `AGENTS.md` — repository working rules, contract-first requirement, review states, and validation expectations.
- `docs/PROJECT-BRIEF.md` — course purpose, ten-iteration sequence, technical direction, and Phase 1 boundary.
- `.planning/PROJECT.md` — active project requirements, constraints, exclusions, and project-level decisions.
- `.planning/ROADMAP.md` § Phase 1 — phase goal, requirements, success criteria, and planned work breakdown.
- `.planning/REQUIREMENTS.md` — authoritative Phase 1 requirement identifiers and quality attributes.

### Reset and recovery evidence

- `docs/architecture/decisions/ADR-0002-greenfield-restart.md` — rationale and consequences of the authorized greenfield restart.
- `docs/reviews/RESET-0001-evidence.md` — retired inventory, recovery point, validation, and current review state required by `FOUND-01`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- No application code, package manifest, schemas, or runtime adapters exist yet; Phase 1 starts from the intentionally minimal greenfield baseline.
- Existing planning, ADR, and reset-evidence documents provide the traceability foundation and must be preserved.

### Established Patterns

- Documents consistently require contract-first work, provider-neutral core modules, deterministic offline testing, and explicit separation of implementation, architectural review, and approval.
- The repository uses GSD planning artifacts under `.planning/` and keeps local GSD runtime files under ignored `.codex/`.

### Integration Points

- CLI and Fastify will be new inbound adapters around the same `RunAgentUseCase`.
- Model, document search, journal, clock, and ID generation will be outbound ports with deterministic test adapters.
- JSONL files will be the first persisted runtime evidence; PostgreSQL remains deferred.

</code_context>

<specifics>
## Specific Ideas

- Keep the complete happy path visible to a learner: question → model requests `search_docs` → tool returns source references → model returns `final_answer` → CLI/API returns the result → JSONL shows the same run in order.
- Make every trust boundary executable through a Zod schema and demonstrate at least one rejected invalid value in tests.
- Treat source references in Phase 1 as document identity only, not as the resolvable passage citations promised by Phase 4.
- Prefer explicit small unions and state transitions over a framework abstraction or generic workflow engine.

</specifics>

<deferred>
## Deferred Ideas

- Multiple tools, registration, permissions, and generalized tool failures belong to Phase 2.
- MCP interoperability belongs to Phase 3.
- Semantic retrieval, chunking, embeddings, PostgreSQL/pgvector, and resolvable citations belong to Phase 4.
- Durable conversation state and controlled memory belong to Phase 5.
- Formal evaluation datasets and regression gates belong to Phase 6.
- Full telemetry and redaction policy belong to Phase 7; Phase 1 only establishes safe correlated events.
- Streaming and the Angular/Tailwind inspector belong to Phase 8.
- Configurable guardrails, budgets, and approval belong to Phase 9.

</deferred>

---

*Phase: 1-Typed Agent Loop*
*Context gathered: 2026-09-28*
