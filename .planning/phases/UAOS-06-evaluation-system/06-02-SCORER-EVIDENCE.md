# 06-02 Scorer and Runner Checkpoint

This checkpoint implements the core scorer/runner, not completed Phase 6 CLI, report storage, dataset publication, or live evaluation evidence.

Node.js 24.22.1 passed npm run validate with 289 tests in 29 files, strict project/core typecheck, and build in 20.99 seconds. Ten evaluation behavior tests prove the mixed baseline, explicit applicable denominators, content-free reports, known unsupported-answer regression, revision verification before effects, observed-passage identity, resolver failure, reordered evidence, harness-vs-operational failure, awaited report failure, cancellation before later cases, protected expectations, and failed-trace start validation. Several controls share one test case.

The scorer independently resolves citations, compares exact quote/identity/source/title, checks the canonical answer, and rejects cited passages absent from host-observed IDs. It validates attempt counts, document-level retrieval expectations, contiguous metadata, event identity, terminal outcome, and the eight-event successful grammar. A stored valid citation alone does not prove it was retrieved for that run.

The runner validates the parsed dataset revision before effects, preallocates unique host run IDs, executes sequentially, protects expectations from executor mutation, aggregates per-dimension applicable coverage/rates, and awaits a validated safe report copy before returning. Harness exceptions never count as expected operational failures and raw text is omitted from diagnostics.

## RED finding and correction

The [recorded RED test](06-02-EVIDENCE-RED.json) demonstrated that a failed trace missing run.started could pass evidence when IDs/counts still matched. The scorer now requires a start event except the established single INVALID_REQUEST failure path. The new test passed in the final full validation. The known unsupported-answer regression fails grounding while its result schema and journal metadata remain valid.

## Remaining 06-02 work

1. Publish a controlled versioned dataset with its verified revision.
2. Add a filesystem report adapter with safe paths, durable awaited persistence, and explicit failure behavior.
3. Add iteration 6 composition and CLI evaluation commands, with observed passage IDs supplied by host instrumentation rather than model output.
4. Reproduce baseline and explicit known regression against the real PostgreSQL fixture using the owner-verified runner.
5. Close guide, EVAL-01 traceability, threat coverage, summary, and full compatibility evidence.

EVAL-01 remains Pending in requirements; Phase 6 is not marked implemented. The last separate real-database validation remains 19 cases from Phase 5, not a claim that the evaluator has already been exercised against PostgreSQL. Architectural review, human approval, and stability remain pending.
