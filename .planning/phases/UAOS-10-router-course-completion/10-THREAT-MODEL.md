# Phase 10 Threat Model

The following obligations remain pending until executable 10-01/10-02 evidence is recorded.

| Threat | Required boundary | Evidence obligation |
|---|---|---|
| T-10-01 | Sealed canonical typed host model/tool/retrieval/policy tuples; strict profile-only request selection | Manifest substitution, unknown fields, capability/policy binding |
| T-10-02 | Only pre-tool lexical first-model failure can upgrade to grounded fallback | Complete acknowledged three-event evidence; no policy/deadline/after-tool/grounding downgrade retry |
| T-10-03 | Invocation-local cancellation, fresh IDs, at most two attempts and aggregate 3/1 calls under 11000ms | Concurrent runs, aborted/hung ports, deadline races and late settlement |
| T-10-04 | Required metadata routing journal acknowledges start/attempt/completion before later work | Failed/hung journal, no fallback after missing acknowledgment, content privacy |
| T-10-05 | Real route factories intersect a common guard policy with existing capability sets; legacy results cannot authorize export | Both concrete profiles, guard denial, unchanged grounded stream/state/eval/approval behavior |
| T-10-06 | Strict CLI/same-origin HTTP result declares evidence mode, static errors and no caller path/model/fault switch | Separate-process/TCP/bypass checks and earlier selectors/default compatibility |
| T-10-07 | Ten-version commands/configuration/evidence links and governance remain honest | Navigable guides, requirement coverage, repeatable checks, pending approval/stability/debt |

The selected deterministic models make no new provider reliability or model-quality claim. Routing retries are not stream reconnects, approval retries or crash recovery. One trusted local host/operator remains the scope; remote authentication/deployment and distributed production guarantees are excluded.
