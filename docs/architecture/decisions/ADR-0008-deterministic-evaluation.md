# ADR-0008 — Reproducible Extractive Evaluation Gates

- Status — Selected for Phase 6 implementation; architectural review pending
- Date — 2026-11-09
- Extends — ADR-0006 and ADR-0007

## Scope

Phase 6 evaluates the grounded documentation scenario using versioned controlled cases and deterministic independent quality checks. It reports schema, outcome, retrieval, grounding, tool usage, and execution evidence separately. It introduces no model judge, provider dependency, automatic approval, or semantic-quality claim for fixture embeddings.

## Dataset and provenance

A strict eval-dataset-1.0 contains an ID, semantic version, SHA-256 revision, and 3–100 unique cases. The course profile includes answered, abstained, and expected-failure cases. Questions are bounded inputs; expected document IDs, outcome/error code, and model/tool attempt counts are explicit. A controlled deny_tool scenario exercises permission failure in host composition, not through prompt instructions.

The revision is SHA-256 over JSON.stringify of the parsed EvaluationDatasetBodySchema value. Verify it before any case effect. Updating cases or expectations requires a new dataset version/revision. The scorer version extractive-1.0 is recorded separately. Each case receives a unique host-allocated runId before execution, and that same ID names its journal evidence. One case invokes one application use case without automatic retries.

## Independent checks

Schema validates the dedicated grounded result and allocated run identity. Outcome compares answered/abstained/error expectation. Retrieval compares expected required/forbidden document IDs with the actual tool-success evidence; abstention expects no retrieved document IDs. Grounding independently resolves every actual answered citation and checks full identity, exact quote, duplicates, canonical answer rendering, and final source membership/title. Tool usage checks event attempts, tool name, terminal counts, and successful result usage. Evidence checks strict metadata envelopes, run ID, contiguous sequence, and exactly one matching terminal event at the end.

The evaluator does not trust the engine's grounding validator as its only oracle. A known regression that adds unsupported prose to an otherwise schema-valid result must fail the grounding gate. A resolver error or malformed evidence fails closed. Expected operational failures are distinguishable from execution harness failure.

## Gate and reporting

Each dimension has a minimum pass rate and minimum applicable count. The teaching default requires rate 1.0 and at least one applicable case per dimension. Not-applicable checks are excluded from the denominator and produce rate null if none apply; lack of coverage cannot silently become 100 percent. A failed dimension fails the gate, without an aggregate score hiding it.

Reports use strict eval-report-1.0 and record dataset/scorer identity, host evaluation/run/case IDs, timestamps, safe check codes, denominators/rates, policy, and failed dimensions. They exclude questions, documents, quotations, answers, raw results, exceptions, credentials, and arbitrary text diagnostics. Detailed run provenance remains in its metadata-only journal. Report persistence is awaited before success is returned; a save failure cannot claim a published gate.

## Execution and limits

The core uses narrow executor, citation resolver, report, clock, identity, and ID ports. Cases run sequentially under caller cancellation. Deterministic fake tests run offline. Live PostgreSQL checks run separately through the existing owned disposable runner and compare a baseline with an explicitly injected regression. No external service or new package is required.

This gate evaluates a small controlled extractive corpus. It does not establish semantic relevance across arbitrary questions, truth of source documents, production reliability, or human approval. Broader datasets, semantic providers, judges, performance thresholds, and automated release policy remain explicit future choices.
