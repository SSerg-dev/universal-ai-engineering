# Phase 10 Routing Contract Checkpoint

2026-11-16 — [ADR-0014](../../../docs/architecture/decisions/ADR-0014-typed-local-routing.md) selects explicit grounded and lexical profiles over the existing concrete model/tool/retrieval tuples, with one common immutable guard policy and capability intersections. Only evidenced first-model lexical failure with zero tool attempts can fall back to grounded evidence. Grounded never falls back to source references; policy/audit/journal/budget/cancellation/after-tool failures never retry.

Strict contracts distinguish public evidence modes, request/profile selection, linked attempts, a maximum aggregate three model/one tool calls and two attempts under 11000ms, and metadata-only required routing journal. New sealed guard-policy revision: `3b9d8f8976733095ac9102aee30ebb1138ecb72b76d2dfc7616e084128a78ba7`. Route manifest revision: `7ed623246b5fe63d760744e616ad1738cd4c3fa0456b7ff9312764902feb221d`. Phase 9's manifest remains unchanged.

Five initial contract tests and root/core compilation passed. Router enforcement, actual composition, CLI/API, fallback/concurrency/deadline evidence and final ten-version packaging remain pending in 10-01/10-02. No ROUTER-01/EDU-01 completion, architectural review, human approval or stability claim is made here.
