# Phase 1: Typed Agent Loop - Research

**Researched:** 2026-09-28
**Domain:** Provider-neutral typed agent loop, ports/adapters, runtime validation, deterministic execution evidence
**Confidence:** MEDIUM

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

DATA_7F3C9A2B_START
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
DATA_7F3C9A2B_END

### the agent's Discretion

DATA_B8E41D6C_START
The user accepted all four recommended areas and explicitly delegated the remaining detailed decisions. Planning may choose exact filenames, module names, internal helper types, fixture prose, console formatting, and the HTTP status mapping, provided the contracts and boundaries above remain intact.
DATA_B8E41D6C_END

### Deferred Ideas (OUT OF SCOPE)

DATA_5D2A8C71_START
- Multiple tools, registration, permissions, and generalized tool failures belong to Phase 2.
- MCP interoperability belongs to Phase 3.
- Semantic retrieval, chunking, embeddings, PostgreSQL/pgvector, and resolvable citations belong to Phase 4.
- Durable conversation state and controlled memory belong to Phase 5.
- Formal evaluation datasets and regression gates belong to Phase 6.
- Full telemetry and redaction policy belong to Phase 7; Phase 1 only establishes safe correlated events.
- Streaming and the Angular/Tailwind inspector belong to Phase 8.
- Configurable guardrails, budgets, and approval belong to Phase 9.
DATA_5D2A8C71_END
</user_constraints>

<phase_requirements>
## Phase Requirements

The requirement wording below is copied verbatim from the authoritative requirement source. [VERIFIED: `.planning/REQUIREMENTS.md:10-24,67-69`]

DATA_D03C7E9A_START
| ID | Description | Research Support |
|----|-------------|------------------|
| FOUND-01 | Maintainer can verify the greenfield reset, retired paths, recovery point, and new minimal project structure from one evidence record. | Preserve and revalidate RESET-0001; add Phase 1 evidence without changing its pending review/approval state. |
| ARCH-01 | Developer can review stable domain, application, port, adapter, event, and error contracts before implementation depends on them. | Create ADR-0003 plus executable Zod/type contracts and dependency checks before loop implementation. |
| EDU-02 | Learner can follow the internal-documentation assistant scenario consistently from question to grounded answer. | Keep the full question → model action → `search_docs` → final answer path visible in docs and tests. |
| EDU-03 | Learner can inspect explanation, tests, validation output, and review state for every iteration. | Produce an iteration guide and evidence record with commands, outputs, requirement links, and explicit state fields. |
| CORE-01 | Learner can run a typed agent loop that accepts a question, asks a model for the next action, executes one tool, and returns a terminal answer or typed failure. | Implement the two-state transition table, Zod model-action boundary, budgets, and normalized failures. |
| CORE-02 | Learner can invoke the same application use case through a Node CLI and Fastify HTTP API. | Keep CLI and HTTP as thin inbound adapters that call one `RunAgentUseCase`. |
| CORE-03 | Learner can inspect a correlated JSONL journal of loop, model, tool, error, and result events. | Define versioned event schemas, deterministic sequence assignment, safe payloads, and an awaited JSONL adapter. |
| CORE-04 | Learner can run deterministic success, failure, timeout, cancellation, and limit tests without network access. | Use scripted fake ports, fake clock/IDs, controlled aborts, and exact event-sequence assertions. |
| NFR-01 | Core domain and application modules compile without provider SDK, Fastify, Angular, PostgreSQL client, or MCP transport imports. | Add a core-only TypeScript config and a forbidden-import architecture test. |
| NFR-02 | Infrastructure adapters can be replaced through stable ports without changing agent-loop behavior. | Run the same use-case contract suite with fake and real outbound adapters where applicable. |
| NFR-03 | Every phase produces reproducible tests, traceability updates, reviewable evidence, and an explicit human approval state. | Add deterministic validation commands and keep Implemented, Reviewed, and Approved as separate evidence fields. |
DATA_D03C7E9A_END
</phase_requirements>

## Summary

Phase 1 should be planned as a contract-first vertical slice, not as a framework exercise. The repository already fixes the public vocabulary, state machine, budgets, journal envelope, errors, and dependency direction. [VERIFIED: `.planning/phases/UAOS-01-typed-agent-loop/01-CONTEXT.md:20-57`] The first plan must therefore create ADR-0003 and executable contract tests before any orchestration or adapter implementation; this also follows the repository rule that architecture contracts precede dependent implementation. [VERIFIED: `AGENTS.md:7-18`]

Use one npm package with internal `domain`, `application`, and `adapters` folders. This is the smallest structure that can demonstrate NFR-01/NFR-02 without introducing workspace/package-management complexity. [ASSUMED design recommendation] The application core owns validation of unknown use-case input, model actions, state transitions, budgets, source-ID checks, error normalization, ordered event emission, and deadline/cancellation classification. Fastify and the CLI translate transport concerns only; the lexical Markdown search, JSONL persistence, ID generation, clock, and deterministic teaching model stay behind ports.

The main planning risk is cancellation finalization. Normal journal appends can receive the composed caller/deadline signal, but an already-aborted caller signal cannot also be used to persist `run.cancelled`. The contract plan should explicitly define a bounded terminal-evidence append using an independent cleanup signal; if that append fails, the public result is `JOURNAL_FAILURE`. [ASSUMED design recommendation derived from D-09, D-14, D-16, and D-19] The second risk is runtime drift: the machine default is Node.js 22.20.0, while the mandated bundled runtime is Node.js 24.19.0. [VERIFIED: command probes on 2026-09-28; `.planning/STATE.md:56-59`]

**Primary recommendation:** Lock ADR-0003, Zod schemas, transition/event tables, and acceptance tests first; then implement one end-to-end offline tracer through a deterministic model adapter, real Markdown search, shared use case, JSONL journal, CLI, and Fastify.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Domain vocabulary, result/error/event contracts | Domain core | Application core | Stable provider-neutral values must exist before framework code. [VERIFIED: `AGENTS.md:8-9`; `01-CONTEXT.md:28-57`] |
| Model-action parsing, state machine, budgets, source validation | Application core | Domain schemas | These rules define behavior shared by every inbound and outbound adapter. [VERIFIED: `01-CONTEXT.md:28-44`] |
| `search_docs` lexical behavior | Outbound adapter | Application port | Markdown loading/tokenization are explicitly adapter concerns behind `SearchDocsPort`. [VERIFIED: `01-CONTEXT.md:20-24`] |
| CLI command and SIGINT handling | Inbound adapter | Application core | CLI parses process concerns and passes unknown input plus `AbortSignal` to the same use case. [VERIFIED: `01-CONTEXT.md:38-44`] |
| HTTP endpoint and disconnect handling | Inbound adapter | Application core | Fastify handles HTTP lifecycle/status only; current Fastify exposes `request.signal` for timeout/disconnect cancellation. [CITED: https://fastify.dev/docs/latest/Reference/Request/] |
| JSONL persistence | Outbound adapter / Storage | Application event contract | The core defines event meaning/order; filesystem append/flush and paths are infrastructure. [VERIFIED: `01-CONTEXT.md:48-56`; CITED: https://nodejs.org/api/fs.html] |
| Deterministic model/search/clock/ID/journal doubles | Test adapters | Application contract tests | Fakes replace ports while real Zod boundaries and orchestration remain under test. [VERIFIED: `01-CONTEXT.md:51-57`] |
| Review/evidence state | Documentation / Governance | Validation scripts | Implementation, architectural review, and approval remain distinct. [VERIFIED: `AGENTS.md:11-17`; `docs/reviews/RESET-0001-evidence.md:3-9`] |

## Project Constraints (from AGENTS.md)

- Use GSD planning artifacts for execution context and progress. [VERIFIED: `AGENTS.md:7`]
- Define or update architectural contracts before implementation that depends on them. [VERIFIED: `AGENTS.md:8`]
- Keep domain and application independent of model vendors, Fastify, Angular, PostgreSQL, and MCP transports. [VERIFIED: `AGENTS.md:9`]
- Implement one logical task at a time; keep planning, implementation, architectural review, and approval distinct. [VERIFIED: `AGENTS.md:10-11`]
- Produce reproducible tests and reviewable evidence; never mark Approved or Stable without explicit human approval. [VERIFIED: `AGENTS.md:12-13`]
- Preserve ADR identifiers/changelog history and use a new ADR number for architecture-changing decisions. [VERIFIED: `AGENTS.md:14-15`]
- Treat unexpected pre-existing content as a discovery finding; validate internal links and requirement traceability before review. [VERIFIED: `AGENTS.md:16-17`]
- Do not assume PRs, branches, or merge commits are required. [VERIFIED: `AGENTS.md:18`]
- Use TypeScript/Node.js 24, Zod boundaries, Fastify and Node CLI adapters, Vitest deterministic fakes, and JSONL before PostgreSQL; do not introduce React or Next.js. [VERIFIED: `AGENTS.md:20-28`]

## Standard Stack

### Runtime and Core

| Component | Version / Line | Purpose | Recommendation and provenance |
|-----------|----------------|---------|-------------------------------|
| Node.js | 24.19.0 bundled for this host; Node 24 LTS line | Runtime, CLI, filesystem, aborts, IDs | Use the bundled 24.19.0 binary for Phase 1 commands; Node 24 is an active LTS line. [VERIFIED: command probe; CITED: https://nodejs.org/en/about/previous-releases] |
| TypeScript | 7.0.2 | Strict compilation and ESM output | Pin exactly; registry legitimacy verdict `OK`, official TypeScript docs confirm strict and Node module modes. [VERIFIED: npm registry; CITED: https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options] |
| Zod | 4.6.5 | Runtime schemas for unknown inputs/actions/events | Pin exactly and use `safeParse`, `strictObject`, and `discriminatedUnion`. [CITED: https://zod.dev/basics; https://zod.dev/api] `zod` [WARNING: package-legitimacy seam flagged the current release as suspicious only because it was published recently; planner must insert `checkpoint:human-verify` before install.] |

### Adapters and Testing

| Component | Version / Line | Purpose | Recommendation and provenance |
|-----------|----------------|---------|-------------------------------|
| Fastify | 5.12.5 | HTTP inbound adapter and in-process injection tests | Pin exactly; use `request.signal`, body limits, response schemas, and a thin route handler. [CITED: https://fastify.dev/docs/latest/Reference/Request/; https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/] `fastify` [WARNING: package-legitimacy seam flagged the current release as suspicious only because it was published recently; planner must insert `checkpoint:human-verify` before install.] |
| Vitest | 5.0.2 | Unit, contract, integration, and smoke tests | Pin exactly; its declared engine supports Node 24 and official migration documentation requires a Vite peer. [VERIFIED: npm registry `engines`/`peerDependencies`; CITED: https://vitest.dev/api/vi; https://vitest.dev/guide/migration/] `vitest` [WARNING: package-legitimacy seam flagged the current release as suspicious only because it was published recently; planner must insert `checkpoint:human-verify` before install.] |
| Vite | 8.3.1 | Required Vitest 5 peer dependency; no application bundling role | Pin explicitly so the lockfile does not select the peer implicitly; do not add Vite build/dev-server tasks. [VERIFIED: npm registry declared engine; CITED: https://vitest.dev/guide/migration/] `vite` [WARNING: package-legitimacy seam flagged the current release as suspicious only because it was published recently; planner must insert `checkpoint:human-verify` before install.] |
| `@types/node` | 24.19.0 | Type surface aligned to the bundled Node 24 minor | Pin the Node 24 line, not registry-latest major 26. [VERIFIED: npm registry version-line query] `@types/node` [WARNING: package-legitimacy seam flagged the package's latest publication as too new; planner must insert `checkpoint:human-verify` before install.] |

No model SDK, CLI parsing library, UUID package, JSONL library, Markdown parser, workflow engine, tool registry, database client, or web UI package is needed. This follows the locked Phase 1 exclusions and keeps the ports visible to learners. [VERIFIED: `.planning/phases/UAOS-01-typed-agent-loop/01-CONTEXT.md:9-11,20-24,28-33,56-57`]

**Installation after the required human package checkpoint:**

```powershell
npm install --save-exact zod@4.6.5 fastify@5.12.5
npm install --save-dev --save-exact typescript@7.0.2 vitest@5.0.2 vite@8.3.1 @types/node@24.19.0
```

The repository must commit the generated lockfile so installation is reproducible. [ASSUMED design recommendation]

### Compiler and Package Configuration

Use ESM (`"type": "module"`), `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `target: "ES2024"`, `strict: true`, `verbatimModuleSyntax: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, and `useUnknownInCatchVariables: true`. [CITED: https://www.typescriptlang.org/tsconfig/strict; https://www.typescriptlang.org/tsconfig/module; https://www.typescriptlang.org/tsconfig/verbatimModuleSyntax.html] Add a separate `tsconfig.core.json` that includes only domain/application sources; NFR-01 passes only if this config compiles and the architecture test finds no forbidden imports. [ASSUMED design recommendation]

## Package Legitimacy Audit

The GSD legitimacy seam and npm registry were queried on 2026-09-28. Package names were also confirmed in their official project documentation. The seam does not accept version-qualified package specs, so verdicts below are package-level; intended exact pins are shown separately. [VERIFIED: tool outputs from this research session]

| Package | Intended Pin | Registry Signal | Weekly Downloads | Source Repo | Verdict | Disposition |
|---------|--------------|-----------------|------------------|-------------|---------|-------------|
| `typescript` | 7.0.2 | Published 2026-07-08; no returned postinstall field | 330,811,370 | `github.com/microsoft/TypeScript` | OK | Approved |
| `zod` | 4.6.5 | Current release considered too new; no returned postinstall field | 335,954,372 | `github.com/colinhacks/zod` | SUS | Keep; human verify before install |
| `fastify` | 5.12.5 | Current release considered too new; no returned postinstall field | 15,716,294 | `github.com/fastify/fastify` | SUS | Keep; human verify before install |
| `vitest` | 5.0.2 | Current release considered too new; no returned postinstall field | 122,333,681 | `github.com/vitest-dev/vitest` | SUS | Keep; human verify before install |
| `vite` | 8.3.1 | Current release considered too new; no returned postinstall field | 208,347,325 | `github.com/vitejs/vite` | SUS | Keep; human verify before install |
| `@types/node` | 24.19.0 | Node 24 pin exists; current package publication considered too new | 500,256,197 | `github.com/DefinitelyTyped/DefinitelyTyped` | SUS | Keep; human verify before install |
| `zod@4.5.4` | — | Version-qualified input unsupported by the seam | — | — | SLOP | REMOVED |
| `fastify@5.11.1` | — | Version-qualified input unsupported by the seam | — | — | SLOP | REMOVED |
| `vitest@4.0.17` | — | Version-qualified input unsupported by the seam | — | — | SLOP | REMOVED |
| `@types/node@24.13.6` | — | Version-qualified input unsupported by the seam | — | — | SLOP | REMOVED |

**Packages/specifications removed due to SLOP verdict:** `zod@4.5.4`, `fastify@5.11.1`, `vitest@4.0.17`, and `@types/node@24.13.6`. The seam does not support version-qualified inputs, but the protocol still requires these exact specifications to remain absent from recommendations. [VERIFIED: tool outputs]

**Packages flagged as suspicious:** `zod`, `fastify`, `vitest`, `vite`, and `@types/node`. Their only seam reason was `too-new`, but the protocol still requires a planner checkpoint before installation. [VERIFIED: package-legitimacy output]

## Architecture Patterns

### System Architecture Diagram

```text
CLI argv + SIGINT                         HTTP JSON + request.signal
        |                                          |
        +-------------- inbound adapters ----------+
                           |
                  RunAgentUseCase(unknown, signal)
                           |
       assign runId -> validate input -> journal run.started
                           |
                  [state = awaiting_tool]
                           |
                    ModelPort.request
                           |
                 unknown -> Zod action parse
                           |
                  call_tool(search_docs)
                           |
                    SearchDocsPort.search
                           |
              deterministic Markdown matches
                           |
                  [state = awaiting_final]
                           |
                    ModelPort.request
                           |
                 unknown -> Zod action parse
                           |
         final_answer + source-ID subset validation
                           |
              journal terminal event (awaited)
                           |
                    RunAgentResult
                           |
              CLI formatting / HTTP mapping

Cross-cutting outbound ports: JournalPort, ClockPort, IdGeneratorPort
Composition-only dependencies: deterministic teaching model, Markdown search,
JSONL journal, system clock/IDs; tests replace all with deterministic adapters.
```

The flow is derived directly from the locked phase boundary and decisions. [VERIFIED: `.planning/phases/UAOS-01-typed-agent-loop/01-CONTEXT.md:9-11,20-57`]

### Recommended Project Structure

```text
package.json
package-lock.json
tsconfig.json
tsconfig.core.json
vitest.config.ts
src/
├── domain/
│   ├── agent-contracts.ts
│   ├── agent-events.ts
│   └── agent-errors.ts
├── application/
│   ├── ports/
│   │   ├── model-port.ts
│   │   ├── search-docs-port.ts
│   │   ├── journal-port.ts
│   │   ├── clock-port.ts
│   │   └── id-generator-port.ts
│   └── run-agent.ts
├── adapters/
│   ├── inbound/cli.ts
│   ├── inbound/http.ts
│   ├── outbound/deterministic-model.ts
│   ├── outbound/markdown-search-docs.ts
│   ├── outbound/jsonl-journal.ts
│   ├── outbound/system-clock.ts
│   └── outbound/system-id-generator.ts
└── composition/
    ├── create-runtime.ts
    └── server.ts
fixtures/docs/
tests/
├── contracts/
├── unit/
├── integration/
└── smoke/
docs/iterations/01-typed-agent-loop.md
docs/reviews/ITERATION-01-evidence.md
```

This is a planning recommendation, not an existing repository layout. [ASSUMED design recommendation] Keep fixture documents outside `src` and load them at composition startup into an immutable document array. The search call then stays deterministic and has no per-run filesystem dependency; this is a document collection, not a semantic/chunk index. [ASSUMED design recommendation consistent with D-03/D-04]

### Pattern 1: Functional Core with Explicit Ports

Construct `RunAgentUseCase` from plain port objects and a policy value. Do not let it import adapter modules or global singleton services. Return `RunAgentResult`; never throw a public failure. Adapter exceptions are caught at the boundary, converted to the stable error taxonomy, journaled, and returned. [VERIFIED: `01-CONTEXT.md:28-44,52-57`]

The default runtime should wire a clearly named deterministic teaching model that returns the two scripted actions from provider-neutral input. [ASSUMED design recommendation] This keeps CLI/API runnable offline without pretending that a vendor model is integrated; a future provider adapter can replace it without changing the loop.

### Pattern 2: Zod at Trust Boundaries, Types Inside

Use one schema as the runtime source and infer the TypeScript type from it. Parse unknown public input once in `RunAgentUseCase`; parse each unknown model response immediately after `ModelPort` returns. Use strict objects so unexpected fields do not silently cross the boundary. [CITED: https://zod.dev/basics; https://zod.dev/api; https://zod.dev/v4/changelog]

Fastify must not own semantic validation of `RunAgentInput`, because D-11/D-12 assign that behavior to the shared use case. Let Fastify enforce transport constraints (valid JSON/content type/body size) and use response schemas for serialization; pass `request.body` as unknown to the use case. [VERIFIED: `01-CONTEXT.md:38-44`; CITED: https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/]

### Pattern 3: Explicit Transition Table

| Current State | Parsed Action | Outcome |
|---------------|---------------|---------|
| `awaiting_tool` | `call_tool` with `search_docs` | journal request, execute once, retain returned source IDs, move to `awaiting_final` |
| `awaiting_tool` | `final_answer` | `INVALID_TRANSITION` |
| `awaiting_final` | `call_tool` | `INVALID_TRANSITION` (and never execute a second tool call) |
| `awaiting_final` | `final_answer` | require every `sourceId` to be in tool results; otherwise typed failure; then terminal success |
| either | schema parse failure / unknown action | `INVALID_MODEL_ACTION` |
| either | call budget already exhausted | `LIMIT_EXCEEDED` |

All discrete values in this table appear verbatim in the locked source excerpt above. [VERIFIED: `.planning/phases/UAOS-01-typed-agent-loop/01-CONTEXT.md:28-34`]

### Pattern 4: Event-First Side-Effect Ordering

For every external action, persist the request event before invoking the dependency. Persist a success/failure observation before any next action. Persist the single terminal event before returning the public result. If an append fails, stop immediately with `JOURNAL_FAILURE`; never invoke a later model/tool action. [VERIFIED: `01-CONTEXT.md:48-52`]

Recommended happy-path sequence: `run.started` → `model.requested` → `model.responded` → `tool.requested` → `tool.succeeded` → `model.requested` → `model.responded` → `run.succeeded`. [ASSUMED derived ordering; all event values are quoted verbatim above from `01-CONTEXT.md:48-50`] Tests should assert the complete envelope sequence, not isolated calls.

### Pattern 5: One Deadline, One Cancellation Cause

Create one timeout controller with `setTimeout`, compose it with the caller signal using `AbortSignal.any`, and clear the timer in `finally`. Vitest fake timers can control the explicit `setTimeout`; Node exposes `AbortSignal.any`, `reason`, and `throwIfAborted`. [CITED: https://nodejs.org/api/globals.html; https://vitest.dev/api/vi]

Classify timeout versus cancellation from the originating signal before normalizing adapter errors. Pass the composed signal to model, search, and ordinary journal calls. For `run.cancelled`, use a separate bounded evidence-finalization signal so the already-aborted caller signal does not suppress the required terminal event. [ASSUMED design recommendation] Record this exception explicitly in ADR-0003.

### Pattern 6: Narrow Deterministic Lexical Search

At adapter startup, read only checked-in `.md` fixtures, derive `documentId` from the filename and title from the first `# ` heading, then fail startup if a fixture lacks either. [ASSUMED design recommendation consistent with D-03] Normalize query/document text with Unicode normalization plus case folding, tokenize letters/numbers, de-duplicate query terms in first-seen order, score by the count of unique matched terms, sort descending score then ascending `documentId`, and slice to `limit`. [ASSUMED algorithm detail within delegated discretion] Use the first matching non-heading line as the deterministic excerpt; an empty result remains success.

### Anti-Patterns to Avoid

- **Framework-owned loop:** Fastify hooks or CLI branches must not own state transitions, validation, retries, timeout, or journaling. [VERIFIED: `01-CONTEXT.md:38-44`]
- **Provider-shaped core:** no OpenAI/Anthropic SDK types, tool-call types, usage/billing types, or exception classes in domain/application. [VERIFIED: `01-CONTEXT.md:28-34,39-42,56-57`]
- **Generic agent/tool framework:** Phase 1 has one explicit tool and two explicit states; a registry/workflow engine hides the teaching goal and pre-implements Phase 2+. [VERIFIED: `01-CONTEXT.md:9-11,20-24,109-112`]
- **Journal after side effect:** a model/tool call must not start if its request event failed to persist. [VERIFIED: `01-CONTEXT.md:52`]
- **Raw journal payloads:** do not log prompts, provider payloads, document bodies, or reasoning. [VERIFIED: `01-CONTEXT.md:50`]
- **Runtime-only typing:** TypeScript types do not validate `unknown`; every model action and public input needs actual Zod parsing. [CITED: https://zod.dev/basics]
- **Automatic retry:** no retry loop, retry library, or hidden second tool call in Phase 1. [VERIFIED: `01-CONTEXT.md:33`]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Runtime parsing and error details | Custom `typeof`/property ladders | Zod 4 schemas and `safeParse` | The project already mandates Zod, and official APIs provide discriminated parsing/errors. [CITED: https://zod.dev/basics; https://zod.dev/api] |
| HTTP server/router/injection harness | Raw `node:http` router | Fastify 5 and `fastify.inject` | Fastify is locked, owns transport lifecycle, and supports typed request/response integration. [VERIFIED: `AGENTS.md:22-25`; CITED: https://fastify.dev/docs/latest/Reference/TypeScript/] |
| IDs | Custom random strings | `crypto.randomUUID()` behind `IdGeneratorPort` | Node provides UUID generation; tests replace the port. [ASSUMED standard-library recommendation] |
| Time | Direct `Date.now()` throughout core | `ClockPort` | The locked contract requires deterministic timestamps/durations. [VERIFIED: `01-CONTEXT.md:51`] |
| Test mocking framework | Ad-hoc global monkeypatching | First-class fake ports plus Vitest spies/timers only where needed | Official Vitest guidance recommends replacing nondeterministic/slow dependencies and avoiding mocks of the unit itself. [CITED: https://vitest.dev/guide/learn/testing-in-practice] |
| CLI parser | A CLI framework | Minimal `process.argv` parsing for exactly `uaos ask` | One command/one argument does not justify another dependency. [ASSUMED design recommendation] |
| Markdown engine | General Markdown parser | First-H1 and line-scanning logic scoped to controlled fixtures | The tool contract needs only a title and deterministic lexical text, not rendering. [VERIFIED: `01-CONTEXT.md:20-24`] |
| JSONL framework | Logging/telemetry suite | `node:fs/promises` append behind `JournalPort` | Full telemetry is deferred; Node append supports async writes and flush. [VERIFIED: `01-CONTEXT.md:48-52,124`; CITED: https://nodejs.org/api/fs.html] |

## Code Examples

These examples illustrate locked values already quoted verbatim in User Constraints. They are planning skeletons, not implementation-ready files.

### Zod Model Action Boundary

```typescript
import { z } from "zod";

const SearchDocsInputSchema = z.strictObject({
  query: z.string().trim().min(1),
  limit: z.number().int().min(1).max(5).default(3),
});

const ModelActionSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("call_tool"),
    toolName: z.literal("search_docs"),
    arguments: SearchDocsInputSchema,
  }),
  z.strictObject({
    type: z.literal("final_answer"),
    answer: z.string(),
    sourceIds: z.array(z.string()),
  }),
]);

const parsed = ModelActionSchema.safeParse(modelReturnedUnknown);
```

Zod officially documents `safeParse` and discriminated unions; every project-specific literal and numeric bound above is quoted from D-01/D-07. [CITED: https://zod.dev/basics; https://zod.dev/api; VERIFIED: `.planning/phases/UAOS-01-typed-agent-loop/01-CONTEXT.md:20,28-32`]

### Composed Deadline and Caller Cancellation

```typescript
const timeoutController = new AbortController();
const timeoutHandle = setTimeout(
  () => timeoutController.abort(new Error("TIMEOUT")),
  policy.timeoutMs,
);
const signal = AbortSignal.any([callerSignal, timeoutController.signal]);

try {
  return await executeLoop({ signal });
} finally {
  clearTimeout(timeoutHandle);
}
```

`AbortSignal.any` and signal reasons are provided by Node. [CITED: https://nodejs.org/api/globals.html] The `TIMEOUT` literal is quoted from D-10; `policy.timeoutMs` is a planner-selected configuration value and must be fixed in ADR-0003. [VERIFIED: `.planning/phases/UAOS-01-typed-agent-loop/01-CONTEXT.md:33-34`]

### Awaited JSONL Append

```typescript
await appendFile(
  journalPath,
  `${JSON.stringify(AgentEventEnvelopeSchema.parse(event))}\n`,
  { encoding: "utf8", flush: true, signal },
);
```

Node documents asynchronous `appendFile`, file creation, UTF-8 encoding, `flush`, and `AbortSignal` support. [CITED: https://nodejs.org/api/fs.html] The adapter should use one file per `runId` to avoid cross-process interleaving in Phase 1. [ASSUMED design recommendation] Each append remains awaited, matching D-19. [VERIFIED: `.planning/phases/UAOS-01-typed-agent-loop/01-CONTEXT.md:52`]

## Common Pitfalls

### Pitfall 1: Fastify Rejects Before the Use Case Assigns `runId`

**What goes wrong:** A semantic Fastify body schema returns its own 400 response, bypassing `RunAgentUseCase`, result shape, and journal.  
**Why it happens:** Fastify encourages route-schema validation, while the locked contract assigns unknown-input validation and `runId` allocation to the use case. [CITED: https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/; VERIFIED: `01-CONTEXT.md:38-43`]  
**How to avoid:** Restrict adapter validation to transport parsing/limits; pass the parsed body as unknown to the use case and serialize its result.  
**Warning sign:** invalid `{ "question": ... }` tests return Fastify's default `{ statusCode, error, message }` instead of `RunAgentResult`.

### Pitfall 2: An Aborted Signal Prevents `run.cancelled`

**What goes wrong:** The same cancelled signal is forwarded to the terminal journal append, so the append aborts and no cancellation evidence exists.  
**Why it happens:** Cancellation propagation and terminal evidence have competing cleanup semantics.  
**How to avoid:** Specify a short independent signal for the terminal cancellation append; keep ordinary appends on the composed run signal. [ASSUMED design recommendation]  
**Warning sign:** cancellation tests return `CANCELLED` but the in-memory journal has no terminal event.

### Pitfall 3: Timeout Is Reported as Cancellation

**What goes wrong:** Code catches a generic `AbortError` and always emits `CANCELLED`.  
**Why it happens:** `AbortSignal.any` exposes the winning reason, but careless normalization discards signal origin. [CITED: https://nodejs.org/api/globals.html]  
**How to avoid:** Retain the caller and timeout signals, classify origin before adapter-error normalization, and test both event/result codes.  
**Warning sign:** timeout and explicit abort snapshots are identical.

### Pitfall 4: Journal Failure Occurs After the Next Side Effect

**What goes wrong:** append calls are fire-and-forget or buffered after model/tool execution.  
**Why it happens:** logging is treated as optional telemetry rather than required execution evidence.  
**How to avoid:** await every append before the represented action and stop immediately on rejection. [VERIFIED: `01-CONTEXT.md:52`]  
**Warning sign:** a journal-failure test observes a later model/tool call.

### Pitfall 5: Source IDs Are Trusted from the Model

**What goes wrong:** a final answer cites IDs not returned by `search_docs`.  
**Why it happens:** schema validation proves `string[]`, not semantic membership.  
**How to avoid:** retain the tool-result ID set and reject any non-member after the final action parses. [VERIFIED: `01-CONTEXT.md:32`]  
**Warning sign:** a fake model can invent a source and still receive `ok: true`.

### Pitfall 6: Counts Drift on Failure Paths

**What goes wrong:** model/tool usage increments after success rather than when an attempt begins.  
**Why it happens:** counts are scattered across adapters.  
**How to avoid:** let the use case own counters and increment immediately before the corresponding requested event/call. [ASSUMED design recommendation]  
**Warning sign:** failure events and result usage disagree about attempted calls.

### Pitfall 7: Default Node 22 Runs the Project

**What goes wrong:** local commands pass under Node 22 or resolve a different feature/type surface than the mandated Node 24.  
**Why it happens:** `node --version` is 22.20.0 even though a bundled 24.19.0 binary exists. [VERIFIED: command probes]  
**How to avoid:** make the Node 24 preflight the first scaffold task and record the exact invocation in the iteration guide/evidence.  
**Warning sign:** evidence does not print the runtime version before build/test commands.

### Pitfall 8: “Deterministic” Search Depends on Filesystem Enumeration or Locale

**What goes wrong:** equal-score results change order across hosts or duplicate terms inflate scores.  
**Why it happens:** directory order, locale collation, and repeated query words are left implicit.  
**How to avoid:** sort input filenames, use explicit normalization, de-duplicate terms, and apply a final `documentId` comparison. [ASSUMED design recommendation grounded in D-03]  
**Warning sign:** the same fixture test produces different arrays on Windows and CI.

## State of the Art

| Older / Riskier Approach | Current Recommendation | Impact |
|--------------------------|------------------------|--------|
| Static TypeScript casts for model JSON | Zod 4 `safeParse` plus `discriminatedUnion` at the unknown boundary | Invalid model actions become typed failures rather than runtime property errors. [CITED: https://zod.dev/basics; https://zod.dev/api] |
| Manual Fastify raw-socket disconnect listener | Fastify `request.signal` | Current Fastify exposes a cooperative signal for disconnect and handler timeout. [CITED: https://fastify.dev/docs/latest/Reference/Request/] |
| CommonJS or bundler-style module settings | Node-native ESM with `NodeNext` and `verbatimModuleSyntax` | Compiler behavior follows Node semantics and type-only imports stay explicit. [CITED: https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options; https://www.typescriptlang.org/tsconfig/verbatimModuleSyntax.html] |
| Implicit Vitest peer resolution | Pin Vitest 5.0.2 and Vite 8.3.1 explicitly | Vitest 5 requires Vite; an explicit exact peer pin makes lockfile resolution reviewable while Vite remains test infrastructure only. [VERIFIED: npm peer metadata; CITED: https://vitest.dev/guide/migration/] |
| Generic logging/telemetry framework | Versioned safe JSONL event journal | Full telemetry is deliberately deferred; Phase 1 needs correlated, reproducible evidence only. [VERIFIED: `01-CONTEXT.md:46-52,124`] |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback / Planning Action |
|------------|-------------|-----------|---------|----------------------------|
| Bundled Node.js | All build/test/runtime work | Yes | 24.19.0 | Use `C:\Users\Shaba\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`. [VERIFIED: command probe] |
| Default Node.js | Shell defaults | Yes, wrong major | 22.20.0 | Do not use as Phase 1 evidence runtime. [VERIFIED: command probe; `.planning/STATE.md:58-59`] |
| npm CLI | Dependency install/lockfile | Yes | 10.9.3 | Invoke its CLI script with bundled Node 24 when runtime identity matters: bundled `node.exe` + `C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js`. [VERIFIED: command probes] |
| PostgreSQL/pgvector | Not required | Not probed | — | Explicitly deferred to Phase 4. [VERIFIED: `01-CONTEXT.md:121`] |
| Docker / external model service | Not required | Not probed | — | Keep Phase 1 offline; deterministic adapter is the runtime demonstration. [VERIFIED: `01-CONTEXT.md:9-11,57`] |

**Missing dependencies with no fallback:** none for planning. npm packages are not installed because the repository is intentionally greenfield; installation belongs to execution after the package-legitimacy checkpoint. [VERIFIED: `.planning/phases/UAOS-01-typed-agent-loop/01-CONTEXT.md:90-91`]

**Knowledge graph:** graphify is disabled, so no semantic graph context was available. [VERIFIED: `gsd-tools graphify status` on 2026-09-28]

## Validation Architecture

`workflow.nyquist_validation` is `true`, so every implementation task needs an automated verification command and Wave 0 must establish the test infrastructure. [VERIFIED: `.planning/config.json:19-20`]

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 with Vite 8.3.1 peer [VERIFIED: npm registry] |
| Config file | None — create `vitest.config.ts` in Wave 0 [VERIFIED: repository file inventory] |
| Quick run command | `vitest run <target-file>` (under active Node 24) |
| Full suite command | `npm run validate` after scripts are defined |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FOUND-01 | reset evidence retains recovery point, retired inventory, and pending approval | docs/integrity | `vitest run tests/integration/reset-evidence.test.ts` | No — Wave 0 |
| ARCH-01 | contracts compile and forbidden imports do not cross inward | type/architecture | `tsc -p tsconfig.core.json --noEmit && vitest run tests/contracts/dependency-boundaries.test.ts` | No — Wave 0 |
| EDU-02 | one visible end-to-end scenario reaches a source-backed answer | acceptance | `vitest run tests/integration/teaching-scenario.test.ts` | No — Wave 0 |
| EDU-03 | iteration guide/evidence contains commands, outputs, traceability, and distinct states | docs/integrity | `vitest run tests/integration/iteration-evidence.test.ts` | No — Wave 0 |
| CORE-01 | state machine success plus every typed failure branch | unit/contract | `vitest run tests/unit/run-agent.test.ts` | No — Wave 0 |
| CORE-02 | CLI and Fastify call the same use case/result mapper | smoke/integration | `vitest run tests/smoke/cli.test.ts tests/integration/http.test.ts` | No — Wave 0 |
| CORE-03 | exact correlated event envelopes and valid JSONL lines | contract/integration | `vitest run tests/contracts/agent-events.test.ts tests/integration/jsonl-journal.test.ts` | No — Wave 0 |
| CORE-04 | offline success, model/tool/journal failure, timeout, cancellation, invalid action/transition, and limit | unit | `vitest run tests/unit/run-agent-failures.test.ts` | No — Wave 0 |
| NFR-01 | core compiles without forbidden framework/provider imports | type/architecture | `tsc -p tsconfig.core.json --noEmit && vitest run tests/contracts/dependency-boundaries.test.ts` | No — Wave 0 |
| NFR-02 | fake/real adapters satisfy stable port contracts | contract | `vitest run tests/contracts/ports.test.ts` | No — Wave 0 |
| NFR-03 | full validation, links, traceability, evidence states | gate | `npm run validate` | No — Wave 0 |

### Required Scenario Matrix

| Scenario | Result | Required evidence |
|----------|--------|-------------------|
| Valid question with matches | success | 2 model calls, 1 tool call, source subset, exact 8-event happy path |
| Valid question with no matches | success | empty matches/source IDs are accepted |
| Invalid request | `INVALID_REQUEST` | no model/tool call; terminal failure if journal writable |
| Model throws | `MODEL_FAILURE` | no tool call; adapter exception absent from public result |
| Model returns malformed action | `INVALID_MODEL_ACTION` | model response not logged raw |
| Final answer before tool / second tool call | `INVALID_TRANSITION` | offending action never executes a tool |
| Model/tool budget exhausted | `LIMIT_EXCEEDED` | counts never exceed 2/1 |
| Tool throws | `TOOL_FAILURE` | `tool.failed`, then terminal failure |
| Deadline wins | `TIMEOUT` | distinct from cancellation in result/event |
| Caller abort wins | `CANCELLED` | exactly one `run.cancelled` if journal writable |
| Journal rejects before action | `JOURNAL_FAILURE` | no later model/tool call |
| Model invents source ID | typed failure | no success result/event |

All error/event literals in this matrix are quoted verbatim in User Constraints. [VERIFIED: `.planning/phases/UAOS-01-typed-agent-loop/01-CONTEXT.md:34,48-52`]

### Sampling Rate

- **Per logical task:** run the nearest contract/unit file plus `tsc -p tsconfig.core.json --noEmit` when core changes.
- **Per plan completion:** run `npm run validate` under Node 24 and capture the command/version/output in evidence.
- **Phase gate:** full suite, build, core-only compile, CLI smoke, Fastify injection test, docs/link/traceability check, and explicit human review state before `$gsd-verify-work`.

### Wave 0 Gaps

- [ ] `package.json`, lockfile, `tsconfig.json`, `tsconfig.core.json`, and `vitest.config.ts`.
- [ ] `tests/contracts/` schemas, dependency boundary, and port suites.
- [ ] `tests/unit/` orchestration success/failure suites and deterministic builders.
- [ ] `tests/integration/` Markdown search, JSONL, HTTP injection, evidence/link/traceability suites.
- [ ] `tests/smoke/cli.test.ts` child-process CLI coverage under Node 24.
- [ ] A single `validate` script that runs typecheck, tests, build, and repository integrity checks without network.

## Security Domain

Security enforcement is enabled at ASVS Level 1 with blocking on high severity. [VERIFIED: `.planning/config.json:48-50`] OWASP ASVS 5.0.0 is the current stable release. [CITED: https://owasp.org/projects/asvs?tab=main; https://github.com/OWASP/ASVS/releases]

### Applicable ASVS 5.0 Categories

| ASVS Category | Applies | Phase 1 Control |
|---------------|---------|-----------------|
| V1 Encoding and Sanitization | Limited | JSON serialization and no dynamic code/template execution; fixtures are data, not instructions. [CITED: https://github.com/OWASP/ASVS/blob/master/5.0/en/0x10-V1-Encoding-and-Sanitization.md] |
| V2 Validation and Business Logic | Yes | Zod strict schemas, transition checks, source membership, call limits, one deadline. [VERIFIED: `01-CONTEXT.md:20,28-44`] |
| V4 API and Web Service | Yes | only explicit POST route, JSON content type, body limit, result/error mapping. [CITED: https://github.com/OWASP/ASVS/blob/master/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.json] |
| V5 File Handling | Yes | fixture directory is configured/trusted; journal path derives from generated `runId`, never user filename. [CITED: https://github.com/OWASP/ASVS/blob/master/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.flat.json] |
| V6 Authentication / V7 Session / V8 Authorization | No | No identity, session, protected multi-user resource, or permission model exists in Phase 1. [VERIFIED: `01-CONTEXT.md:9-11,126`] |
| V11 Cryptography / V12 Secure Communication | No Phase 1 implementation | No secrets/tokens or production deployment are in scope; do not invent cryptographic controls. [VERIFIED: `01-CONTEXT.md:9-11`] |
| V13 Configuration | Yes | fail startup for invalid fixture/journal configuration; keep policies in composition, not core. [ASSUMED design recommendation] |
| V14 Data Protection | Yes | event schemas omit raw prompts, document bodies, provider payloads, and reasoning. [VERIFIED: `01-CONTEXT.md:50`] |
| V15 Secure Coding and Architecture | Yes | strict boundary parsing, no unsafe merges, explicit ports, fail-closed errors. [CITED: https://github.com/OWASP/ASVS/blob/master/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.flat.json] |
| V16 Security Logging and Error Handling | Yes | correlated structured events, generic public errors, exact terminal semantics, no sensitive payloads. [CITED: https://github.com/OWASP/ASVS/blob/master/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.flat.json] |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed or adversarial model action | Tampering | Treat model output as unknown, strict Zod parse, explicit transition and source-ID validation. |
| Oversized request or non-terminating dependency | Denial of Service | Fastify body limit, two/one call budgets, one deadline, propagated cancellation. |
| User-controlled filesystem path | Tampering / Information Disclosure | Never derive fixture/journal paths from question/tool arguments; use configured fixture root and generated run IDs. |
| Sensitive content in journal | Information Disclosure | Allow-listed event payload schemas; record lengths/IDs, not full prompts, documents, provider payloads, or reasoning. |
| Adapter exception leakage | Information Disclosure | Normalize to stable public code/message/stage/retryable; keep stack/cause internal. |
| Evidence gap after cancellation/write failure | Repudiation | Await request events, bounded cancellation-finalization append, fail closed on journal failure. |
| Duplicate terminal events | Repudiation / Tampering | Centralize terminalization in one use-case helper and assert exactly one terminal event. |

## Suggested Plan Decomposition

The roadmap already fixes three plans and their intent. [VERIFIED: `.planning/ROADMAP.md:22-38`] Research supports this execution order:

1. **01-01 — contracts and Wave 0:** revalidate RESET-0001 without changing its approval state; create ADR-0003; define every public schema/type/port/event payload/transition/error stage; scaffold Node 24 package/config/test harness; write failing acceptance/architecture tests. This plan should contain the dependency-install human checkpoint because four package verdicts are SUS.
2. **01-02 — core tracer and outbound adapters:** implement the two-state use case, deterministic fakes, deterministic teaching model, real Markdown search, system clock/ID, and JSONL journal. Lead with one happy-path tracer, then add the complete failure matrix one logical task at a time.
3. **01-03 — inbound adapters and evidence:** add `uaos ask`, Fastify POST route, SIGINT/disconnect cancellation, status mapping, CLI/HTTP smoke tests, iteration teaching guide, changelog/traceability/link validation, and `ITERATION-01-evidence.md`. Leave Architectural Review and Approved pending until explicit human action.

Contract review must precede Plan 01-02 implementation, but human approval of the completed phase remains a separate terminal gate. [VERIFIED: `AGENTS.md:8,11-15`]

## Assumptions Log

| # | Claim / Recommendation | Section | Risk if Wrong |
|---|------------------------|---------|---------------|
| A1 | One npm package with folder-enforced boundaries is sufficient for NFR-01/NFR-02. | Summary / Structure | A workspace split might be needed later; Phase 1 would incur migration overhead. |
| A2 | Use a deterministic teaching model as the default runnable adapter because no provider integration is specified. | Architecture Pattern 1 | A real provider may be expected for the demo, requiring credentials/network and a new adapter checkpoint. |
| A3 | Terminal cancellation evidence uses a separate bounded cleanup signal. | Patterns / Pitfalls | If D-09 is interpreted as requiring the aborted caller signal for every append, D-14/D-16 cannot be satisfied simultaneously. |
| A4 | Normalize/deduplicate lexical terms and use first matching line as excerpt. | Pattern 6 | Different desired token/excerpt semantics would change fixture snapshots and public tool results. |
| A5 | Use one JSONL file per `runId`. | Code Examples | A single global journal would need process-wide and cross-process serialization guarantees. |
| A6 | Exact `stage` values, overall timeout, body limit, and HTTP status map will be fixed by ADR-0003 within delegated discretion. | Open Questions | Leaving these implicit creates incompatible adapters/tests. |

## Open Questions

1. **What are the exact public `error.stage` values?**
   - What we know: `stage` is public, and error codes are locked. [VERIFIED: `01-CONTEXT.md:34,39-42`]
   - What is unclear: the allowed stage union is not enumerated.
   - Recommendation: ADR-0003 must define and quote a small stable union before tests or adapters.

2. **What numeric overall timeout and HTTP body limit should the teaching runtime use?**
   - What we know: one overall deadline and bounded execution are locked; Fastify exposes body/handler limits. [VERIFIED: `01-CONTEXT.md:33`; CITED: https://fastify.dev/docs/latest/Reference/Request/]
   - What is unclear: exact configuration values.
   - Recommendation: treat them as composition policy, document defaults in ADR-0003, and test overrides with smaller deterministic values.

3. **How is terminal evidence persisted after cancellation?**
   - What we know: signals propagate to journal calls and `run.cancelled` is required whenever the journal remains writable. [VERIFIED: `01-CONTEXT.md:33,44,48-52`]
   - What is unclear: whether terminal cleanup may use a fresh signal.
   - Recommendation: explicitly authorize a bounded cleanup signal in ADR-0003; otherwise record the contract conflict before implementation.

4. **Does a runtime demo require a real model provider?**
   - What we know: no provider or SDK is selected, the core must be vendor-neutral, and offline deterministic adapters are required. [VERIFIED: `AGENTS.md:9,22-25`; `01-CONTEXT.md:28,56-57`]
   - What is unclear: whether the learner-facing CLI/API demo is expected to call an external model.
   - Recommendation: ship a clearly labeled deterministic teaching model in Phase 1; defer provider credentials/SDK adapter until explicitly scoped.

5. **Dependency freshness checkpoint**
   - What we know: official docs and registry confirm all package names/pins; the legitimacy seam flags five packages solely as `too-new`.
   - What is unclear: whether the human will accept the pins unchanged.
   - Recommendation: add one human verification checkpoint before the install task, then record the accepted versions in the lockfile/evidence.

## Sources

### Primary Repository Sources (HIGH confidence)

- `.planning/phases/UAOS-01-typed-agent-loop/01-CONTEXT.md` — locked Phase 1 decisions and exclusions.
- `.planning/REQUIREMENTS.md` — authoritative requirement wording and traceability.
- `.planning/ROADMAP.md` — Phase 1 goal, success criteria, and three-plan decomposition.
- `AGENTS.md` — repository working and architecture rules.
- `docs/architecture/decisions/ADR-0002-greenfield-restart.md` — greenfield authorization and recovery point.
- `docs/reviews/RESET-0001-evidence.md` — reset inventory and pending review/approval state.
- Command probes and npm/GSD package-legitimacy output from 2026-09-28 — environment and registry metadata.

### Official Documentation (MEDIUM confidence per research seam)

- https://nodejs.org/en/about/previous-releases — Node 24 LTS line.
- https://nodejs.org/api/globals.html — `AbortSignal` APIs and reasons.
- https://nodejs.org/api/fs.html — asynchronous append, flush, and write-order guidance.
- https://www.typescriptlang.org/tsconfig/strict — strict checking.
- https://www.typescriptlang.org/tsconfig/module — Node module modes.
- https://www.typescriptlang.org/tsconfig/verbatimModuleSyntax.html — explicit import emit semantics.
- https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options — Node application compiler configuration.
- https://zod.dev/basics — `safeParse` behavior.
- https://zod.dev/api — discriminated union schemas.
- https://zod.dev/v4/changelog — Zod 4 strict-object and migration behavior.
- https://fastify.dev/docs/latest/Reference/Request/ — `request.signal`, route limits, and untrusted request data.
- https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/ — JSON Schema validation/serialization and safe error handling.
- https://fastify.dev/docs/latest/Reference/TypeScript/ — official TypeScript integration.
- https://vitest.dev/api/vi — fake timers/system time.
- https://vitest.dev/guide/learn/testing-in-practice — deterministic dependency replacement guidance.
- https://vitest.dev/guide/migration/ — Vitest 5 runtime/Vite peer prerequisites.
- https://owasp.org/projects/asvs?tab=main — current ASVS stable version and citation format.
- https://github.com/OWASP/ASVS/releases — ASVS 5.0.0 stable release.
- https://github.com/OWASP/ASVS/blob/master/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.flat.json — current control categories and requirements.

### Tertiary (LOW confidence)

- None used as authority. All `[ASSUMED]` entries are explicit design recommendations or unresolved contract details.

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM — package identity, versions, declared engines, downloads, and official docs were checked, but five current packages require the legitimacy checkpoint.
- Architecture: HIGH for locked boundaries/state/events; MEDIUM for proposed file layout, deterministic teaching adapter, lexical details, and cancellation cleanup policy.
- Pitfalls: MEDIUM-HIGH — derived from locked contracts and official runtime/framework semantics; cancellation-finalization needs ADR resolution.
- Validation: HIGH for required scenario coverage; MEDIUM for proposed filenames/commands because the repository has no scaffold yet.
- Security: MEDIUM — mapped to current official ASVS 5.0, with production auth/transport/crypto correctly left out of Phase 1.

**What might be missed:** cross-process journal writes if a future decision replaces per-run files with one shared file; Windows signal differences in CLI smoke tests; response behavior after an HTTP client has already disconnected; and whether TypeScript 7 introduces project-specific migration friction once the first code exists. These must become explicit tests or evidence notes rather than silent assumptions.

**Research date:** 2026-09-28  
**Valid until:** 2026-10-05 for package pins; architectural findings remain valid until locked Phase 1 contracts change.
