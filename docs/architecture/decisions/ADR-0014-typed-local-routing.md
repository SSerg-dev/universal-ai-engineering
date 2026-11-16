# ADR-0014 — Typed Local Routing and Safe Fallback

- Status — Selected for Phase 10 implementation; architectural review pending
- Date — 2026-11-16
- Extends — ADR-0013; existing loop, registry, retrieval, evidence and composition contracts

## Concrete routes

Iteration 10 adds explicit typed routing over two existing runnable model/tool/retrieval combinations. The default grounded profile selects GroundedTeachingModel, retrieve_passages, controlled hash-embedding PostgreSQL/pgvector retrieval and extractive citation evidence. The lexical profile selects RegisteredTeachingModel, search_docs/read_doc, the controlled Markdown snapshot and source-reference evidence. A strict host manifest binds these tuples and a sealed shared guard policy revision. Request data may select a known profile, never replace a model, tool list, policy, provider, URL or path. No new provider/dependency is introduced.

The common Phase 10 guard policy retains Phase 9 input/output/size/call/deadline/approval limits and permits the union of these existing read-only tools. Each concrete factory intersects this with its route capability set; an allowed name never installs an absent tool. The guarded default runtime still supplies conversations, quality evaluation, inspection, streaming and explicit grounded export approval. Legacy lexical results cannot become grounded proposals or bypass the consequential-action service. Ordinary ask/stream/state/eval/guard compatibility remains; explicit route commands expose profile/result evidence mode.

## Bounded fallback without weaker evidence

Only lexical → grounded fallback is selected, after MODEL_FAILURE in the first model request, with exactly the acknowledged three-event journal run.started → model.requested → run.failed, one model attempt and zero tool attempts. This upgrades source-reference evidence to grounded citations. Grounded requests never fall back to lexical evidence. Policy/permission/input/output/budget/cancellation/deadline/journal/audit/invalid-transition failures never trigger fallback. A model failure after retrieval never retries the question. A grounded abstention is a successful explicit result and never a fallback trigger.

There are at most two attempts, with fresh linked run IDs and an aggregate maximum of three model attempts and one tool attempt, inside one 11000ms route deadline. Each loop retains its own at-most-two/one/5000ms limits under the same policy. Actual acknowledged required journal records establish usage and eligibility; neither error text nor caller flags suffice. Incomplete/malformed/mismatched evidence fails closed and never authorizes a retry. A fresh per-request router owns mutable counters/cancellation state; no global circuit breaker, adaptive semantic classifier or persistent retry queue is added.

The selected deterministic production models normally succeed. A provider/first-model fault is exercised only through deterministic host-owned test ports; no public fault switch is admitted. Teaching fallback remains an executable contract, not a claim of observed production provider reliability.

## Required routing evidence and interfaces

A separate metadata-only route journal correlates immutable manifest/policy revisions, route ID, requested/selected profiles, attempt run IDs, actual counts and static outcomes. It acknowledges route start and each attempt authorization before execution, completion before any fallback, and a terminal before returning. It contains no question, answer, document, quote, raw error or configuration path. Required per-attempt execution JSONL and guard audit remain authoritative. Route-journal failure stops later attempts; bounded independent cleanup records a route failure where possible. Journal failure/timeout does not imply arbitrary underlying work stopped or evidence is complete.

The provider/framework-free router uses execution, routing-journal, IDs and clock ports. Node composition installs the existing registered/grounded models and controlled adapters. CLI `route <JSON>` and same-origin POST /api/v1/routed-runs call the same use case; strict results declare grounded versus source-reference evidence. Only explicit iteration 10 installs routing. Earlier iterations/default iteration 1 and ten public agent error codes remain unchanged; routing boundary failures have their own fixed vocabulary. Read-only replay/reconnect and approval/export never invoke routing retries.

## Course completion and governance

The final course index compares all ten versions of one question, model/tool/retrieval/persistence/evidence differences, runnable commands, unchanged contracts and known limits. It links each iteration's guide/tests/review evidence and honestly distinguishes implemented, reviewed, approved and stable. Only Phase 1 currently has human approval. Phase 10 completion cannot approve other phases or certify the course stable. Real-provider admission, remote authentication/deployment, distributed teams and the unselected conversation-retention preference remain outside this milestone.
