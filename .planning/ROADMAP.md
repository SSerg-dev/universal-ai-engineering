# Roadmap: Universal Agentic OS Course

## Overview

One internal-documentation assistant evolves through ten runnable vertical slices. Each phase introduces one capability, preserves earlier behavior, produces tests and evidence, and remains unapproved until explicit human review.

## Phases

- [ ] **Phase 1: Typed Agent Loop** - Establish contracts and deliver one agent, one tool, shared CLI/API, journal, and deterministic tests.
- [ ] **Phase 2: Typed Tool System** - Generalize the tool boundary with validation and resilience.
- [ ] **Phase 3: MCP Boundary** - Connect one approved MCP capability safely.
- [ ] **Phase 4: Grounded Retrieval** - Add PostgreSQL/pgvector ingestion, retrieval, and citations.
- [ ] **Phase 5: Durable State and Memory** - Resume conversations and control memory writes.
- [ ] **Phase 6: Evaluation System** - Measure quality and detect regressions.
- [ ] **Phase 7: End-to-End Observability** - Correlate logs, traces, metrics, and quality evidence.
- [ ] **Phase 8: Streaming Angular UI** - Stream typed events into an Angular/Tailwind inspector.
- [ ] **Phase 9: Guardrails and Approval** - Enforce permissions, budgets, validation, and human approval.
- [ ] **Phase 10: Router and Course Completion** - Unify policies and package the ten-version course.

## Phase Details

### Phase 1: Typed Agent Loop
**Goal:** Deliver the smallest complete, reviewable Agentic OS slice.
**Mode:** standard
**Depends on:** Nothing
**Requirements:** [FOUND-01, ARCH-01, EDU-02, EDU-03, CORE-01, CORE-02, CORE-03, CORE-04, NFR-01, NFR-02, NFR-03]
**Success Criteria:**
1. Maintainer can verify the reset inventory and recovery point from RESET-0001 evidence.
2. Reviewer can inspect stable contracts and dependency boundaries before code review.
3. Learner can submit the same question through CLI or HTTP and receive an answer from one loop and one tool.
4. Learner can inspect correlated JSONL events and run deterministic success and failure tests offline.
5. Evidence distinguishes implemented, reviewed, and approved states.
**Plans:** 3 plans

Plans:
- [ ] 01-01: Finalize reset evidence, Iteration 1 ADR, package boundaries, schemas, ports, and acceptance tests.
- [ ] 01-02: Scaffold the minimal TypeScript workspace and implement the domain/application loop with deterministic adapters.
- [ ] 01-03: Add CLI, Fastify API, JSONL journal, automated tests, documentation, and review evidence.

### Phase 2: Typed Tool System
**Goal:** Make tools extensible and failure-aware without complicating the loop.
**Mode:** mvp
**Depends on:** Phase 1
**Requirements:** [TOOL-01, TOOL-02]
**Success Criteria:**
1. Developer can add a second Zod-validated tool without editing the loop algorithm.
2. Validation, timeout, cancellation, permission, and execution failures are distinct typed outcomes.
3. Existing CLI/API behavior remains compatible.
**Plans:** 2 plans

Plans:
- [ ] 02-01: Define tool registry, invocation protocol, schemas, permissions, and error taxonomy.
- [ ] 02-02: Add a second tool, resilience policies, tests, teaching notes, and evidence.

### Phase 3: MCP Boundary
**Goal:** Demonstrate MCP interoperability without weakening trust boundaries.
**Mode:** mvp
**Depends on:** Phase 2
**Requirements:** [MCP-01]
**Success Criteria:**
1. Developer can invoke one allow-listed MCP capability through the existing registry.
2. Invalid MCP metadata, arguments, results, and failures are rejected or normalized at the adapter.
3. User consent, cancellation, and audit continuity are testable.
**Plans:** 2 plans

Plans:
- [ ] 03-01: Pin the MCP specification/SDK and define adapter, negotiation, consent, and audit contracts.
- [ ] 03-02: Implement one capability with conformance, adversarial, and failure tests.

### Phase 4: Grounded Retrieval
**Goal:** Answer questions from controlled internal documents with resolvable evidence.
**Mode:** mvp
**Depends on:** Phase 3
**Requirements:** [RAG-01, RAG-02]
**Success Criteria:**
1. Maintainer can ingest a controlled document set through replaceable PostgreSQL/pgvector adapters.
2. User receives answers with citations resolving to exact indexed passages.
3. Tests detect unsupported answers, missing citations, and retrieval failures.
**Plans:** 2 plans

Plans:
- [ ] 04-01: Define ingestion, chunk, embedding, retrieval, citation, and repository contracts.
- [ ] 04-02: Implement grounded answering with fixtures, quality checks, and evidence.

### Phase 5: Durable State and Memory
**Goal:** Preserve useful state without hidden behavioral mutation.
**Mode:** mvp
**Depends on:** Phase 4
**Requirements:** [MEM-01]
**Success Criteria:**
1. User can stop and resume a conversation with its run history intact.
2. Learner can distinguish run state, conversation state, and learned memory.
3. Memory writes are explicit, scoped, retained, journaled, and tested.
**Plans:** 2 plans

Plans:
- [ ] 05-01: Define state, checkpoint, memory, retention, and concurrency contracts.
- [ ] 05-02: Implement durable resume and controlled memory writes with evidence.

### Phase 6: Evaluation System
**Goal:** Make quality measurable across versions.
**Mode:** mvp
**Depends on:** Phase 5
**Requirements:** [EVAL-01]
**Success Criteria:**
1. Maintainer can run a versioned evaluation dataset locally.
2. Reports distinguish grounding, retrieval, tool, schema, and outcome quality.
3. A known regression deterministically fails a gate and links to run evidence.
**Plans:** 2 plans

Plans:
- [ ] 06-01: Define cases, scorers, thresholds, results, and traceability.
- [ ] 06-02: Implement regression commands, reports, fixtures, and evidence.

### Phase 7: End-to-End Observability
**Goal:** Make every run diagnosable without exposing protected content by default.
**Mode:** mvp
**Depends on:** Phase 6
**Requirements:** [OBS-01]
**Success Criteria:**
1. Maintainer can follow one correlation ID through model, tools, retrieval, state, and result.
2. Metrics expose latency, usage, failures, retries, and quality while redacting content.
3. Learner can diagnose an injected failure using captured telemetry and a runbook.
**Plans:** 2 plans

Plans:
- [ ] 07-01: Define telemetry semantics, correlation, redaction, metrics, and ports.
- [ ] 07-02: Instrument the engine and verify failure diagnosis with evidence.

### Phase 8: Streaming Angular UI
**Goal:** Visualize live execution through the established event protocol.
**Mode:** mvp
**UI hint:** yes
**Depends on:** Phase 7
**Requirements:** [STREAM-01, UI-01]
**Success Criteria:**
1. User receives ordered typed progress and terminal events over the API.
2. User can ask a question and inspect live steps, citations, and answer in Angular/Tailwind.
3. Reconnect, cancellation, malformed, duplicate, and terminal events are verified.
**Plans:** 2 plans

Plans:
- [ ] 08-01: Implement the transport-neutral event protocol and streaming API adapter.
- [ ] 08-02: Build the Angular/Tailwind inspector with accessibility and contract tests.

### Phase 9: Guardrails and Approval
**Goal:** Make consequential execution constrained, explainable, and interruptible.
**Mode:** mvp
**Depends on:** Phase 8
**Requirements:** [GUARD-01]
**Success Criteria:**
1. Maintainer can configure tool permissions, budgets, validation, and approval policies outside core.
2. A consequential action pauses for explicit approval and resumes or terminates without losing audit history.
3. Denials, exhausted budgets, policy failures, and bypass attempts are typed and tested.
**Plans:** 2 plans

Plans:
- [ ] 09-01: Define permission, budget, policy, approval, denial, and threat contracts.
- [ ] 09-02: Implement enforcement and approval flows with adversarial evidence.

### Phase 10: Router and Course Completion
**Goal:** Complete one coherent engine and a navigable ten-version course.
**Mode:** mvp
**Depends on:** Phase 9
**Requirements:** [ROUTER-01, EDU-01]
**Success Criteria:**
1. Developer can select model, tools, retrieval, and execution policy through typed routing.
2. Learner can run and compare all ten versions of the same scenario.
3. Course navigation explains what changed, why, and which contracts remained stable.
4. Final evidence reports tests, links, requirement coverage, approval states, and known debt.
**Plans:** 2 plans

Plans:
- [ ] 10-01: Implement typed routing, fallbacks, compatibility tests, and composition.
- [ ] 10-02: Package the ten versions, comparison guide, final validation, and review evidence.

## Progress

Phases execute sequentially: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Typed Agent Loop | 0/3 | Not started | - |
| 2. Typed Tool System | 0/2 | Not started | - |
| 3. MCP Boundary | 0/2 | Not started | - |
| 4. Grounded Retrieval | 0/2 | Not started | - |
| 5. Durable State and Memory | 0/2 | Not started | - |
| 6. Evaluation System | 0/2 | Not started | - |
| 7. End-to-End Observability | 0/2 | Not started | - |
| 8. Streaming Angular UI | 0/2 | Not started | - |
| 9. Guardrails and Approval | 0/2 | Not started | - |
| 10. Router and Course Completion | 0/2 | Not started | - |
