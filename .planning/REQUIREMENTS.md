# Requirements: Universal Agentic OS Course

**Defined:** 2026-09-28
**Core Value:** A learner can understand, build, test, and review a reusable Agentic OS one working iteration at a time.

## v1 Requirements

### Foundation and Architecture

- [x] **FOUND-01**: Maintainer can verify the greenfield reset, retired paths, recovery point, and new minimal project structure from one evidence record.
- [x] **ARCH-01**: Developer can review stable domain, application, port, adapter, event, and error contracts before implementation depends on them.

### Learning Experience

- [ ] **EDU-01**: Learner can run and compare ten versions that preserve one scenario while adding one major capability per version.
- [x] **EDU-02**: Learner can follow the internal-documentation assistant scenario consistently from question to grounded answer.
- [ ] **EDU-03**: Learner can inspect explanation, tests, validation output, and review state for every iteration.

### Agent Loop Foundation

- [x] **CORE-01**: Learner can run a typed agent loop that accepts a question, asks a model for the next action, executes one tool, and returns a terminal answer or typed failure.
- [ ] **CORE-02**: Learner can invoke the same application use case through a Node CLI and Fastify HTTP API.
- [ ] **CORE-03**: Learner can inspect a correlated JSONL journal of loop, model, tool, error, and result events.
- [x] **CORE-04**: Learner can run deterministic success, failure, timeout, cancellation, and limit tests without network access.

### Tool System

- [ ] **TOOL-01**: Developer can register and execute multiple Zod-validated tools without changing the loop algorithm.
- [ ] **TOOL-02**: Developer receives typed validation, timeout, cancellation, permission, and execution-failure results.

### MCP Integration

- [ ] **MCP-01**: Developer can expose one allow-listed MCP capability through the tool contract with validation, consent, cancellation, and audit events.

### Grounded Retrieval

- [ ] **RAG-01**: Learner can ingest, chunk, index, and retrieve controlled documents through PostgreSQL/pgvector adapters.
- [ ] **RAG-02**: User receives an answer grounded in retrieved passages with resolvable source citations.

### State and Memory

- [ ] **MEM-01**: User can resume a conversation from durable state while memory writes remain explicit, scoped, retained, and inspectable.

### Evaluation

- [ ] **EVAL-01**: Maintainer can run a versioned evaluation dataset and detect regressions in grounding, retrieval, tool behavior, schemas, and outcomes.

### Observability

- [ ] **OBS-01**: Maintainer can correlate logs, traces, metrics, model calls, tool calls, retrieval, state, and evaluations for one run without exposing protected content by default.

### Streaming and UI

- [ ] **STREAM-01**: User can receive ordered typed start, progress, tool, answer, completion, cancellation, and error events during a run.
- [ ] **UI-01**: User can ask a question and inspect live progress, citations, and results in an Angular/Tailwind interface outside the core.

### Guardrails

- [ ] **GUARD-01**: Maintainer can enforce input/output rules, tool permissions, budgets, and human approval with typed auditable denials.

### Routing

- [ ] **ROUTER-01**: Developer can select model, tools, retrieval, and execution policy through a typed router while preserving one understandable engine.

### Quality Attributes

- [x] **NFR-01**: Core domain and application modules compile without provider SDK, Fastify, Angular, PostgreSQL client, or MCP transport imports.
- [ ] **NFR-02**: Infrastructure adapters can be replaced through stable ports without changing agent-loop behavior.
- [x] **NFR-03**: Every phase produces reproducible tests, traceability updates, reviewable evidence, and an explicit human approval state.

## v2 Requirements

### Productization

- **PROD-01**: Administrator can manage multiple organizations, users, and isolated knowledge bases.
- **PROD-02**: Maintainer can operate the system against defined production availability and recovery objectives.
- **PROD-03**: Developer can coordinate independent autonomous agent teams.

## Out of Scope

| Feature | Reason |
|---------|--------|
| React or Next.js | Angular with Tailwind is the selected UI path. |
| RAG, memory, MCP, UI, or multi-agent work in Iteration 1 | The first slice must remain understandable end to end. |
| Vendor SDK types in core | Providers remain replaceable adapters. |
| Automatic approval | Implementation, review, and human approval are distinct states. |
| Recreating the retired documentation hierarchy | Git preserves it at `e4a25e9`; the new project uses only justified artifacts. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Complete |
| ARCH-01 | Phase 1 | Complete |
| EDU-01 | Phase 10 | Pending |
| EDU-02 | Phase 1 | Complete |
| EDU-03 | Phase 1 | Pending |
| CORE-01 | Phase 1 | Complete |
| CORE-02 | Phase 1 | Pending |
| CORE-03 | Phase 1 | Pending |
| CORE-04 | Phase 1 | Complete |
| TOOL-01 | Phase 2 | Pending |
| TOOL-02 | Phase 2 | Pending |
| MCP-01 | Phase 3 | Pending |
| RAG-01 | Phase 4 | Pending |
| RAG-02 | Phase 4 | Pending |
| MEM-01 | Phase 5 | Pending |
| EVAL-01 | Phase 6 | Pending |
| OBS-01 | Phase 7 | Pending |
| STREAM-01 | Phase 8 | Pending |
| UI-01 | Phase 8 | Pending |
| GUARD-01 | Phase 9 | Pending |
| ROUTER-01 | Phase 10 | Pending |
| NFR-01 | Phase 1 | Complete |
| NFR-02 | Phase 1 | Pending |
| NFR-03 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0 ✓

---
*Requirements defined: 2026-09-28*
*Last updated: 2026-09-28 after greenfield roadmap creation*
