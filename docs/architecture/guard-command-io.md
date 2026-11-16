# Guard Command Boundary

Iteration 9 exposes the same application service through `uaos guard '<JSON>'` and `POST /api/v1/guard-commands`. See [ADR-0013](decisions/ADR-0013-guarded-execution-and-approved-export.md) and [the walkthrough](../iterations/09-guardrails-approval.md). Earlier iterations do not install this capability. Requests are strict JSON objects; unknown approval flags, paths, tokens and policy overrides are rejected.

| operation | Required additional fields | Result value |
|---|---|---|
| prepare_export | requestId, question | Public proposal view; duplicate same input resumes its state without rerunning |
| read | approvalId | Current public view; applies expiry, payload pruning and stale-policy invalidation |
| approve / deny | approvalId, expectedVersion, proposalDigest | Explicit decision over that exact proposal |
| execute | approvalId, expectedVersion, proposalDigest | Claims an already approved action; publishes once or leaves uncertainty |
| reconcile | approvalId, expectedVersion, proposalDigest | Inspects an uncertain artifact; positive existing verification can settle success |
| audit | scopeId | Ordered metadata events for run-, approval-, or operation-prefixed scope |
| purge_expired | none | Number of expired/lease/payload records maintained, at most 1000 per command |

Success is `{ok:true,operation,value}` validated with GuardCommandSuccessSchema. Views intentionally include exact answer/quote/Markdown payloads for operator review; they never include inputDigest or private lease tokens. Audit events include safe IDs, policy revision, order, boundary/transition/outcome codes and actor labels, without questions, answers, quotes, paths, credentials or raw exceptions. The trusted local operator assumption is unchanged; an actor label/digest is not remote identity authentication.

HTTP proposal responses use `Cache-Control: no-store`. When Origin is present, it must exactly match the request protocol/Host; cross-origin/null origins are rejected before the application service. No-Origin local clients remain supported. The existing 16384-byte JSON body bound and static transport error contract apply. Transport failures/Origin rejection occur before application audit; application denials attempt required metadata audit with bounded independent cleanup. A failed audit is not claimed complete.

CLI returns 0 on a valid command response and 1 on a fixed-code failure. HTTP uses 400 invalid input; 403 denied/approval-required/export-disabled; 404 missing action; 409 stale/reused/busy/fenced/changed/mismatched/uncertain action; 410 expired; 422 failed preparation/export size; 429 capacity; 499 pre-effect cancellation; 500 audit/store/policy/result/export failure. After an execution claim, cancellation/publication/settlement ambiguity remains GUARD_UNCERTAIN (409), rather than being rewritten as an ordinary cancellation implying no effect. Read current state before another decision; versions may advance through maintenance or another operator.

Publication is absent from the model tool registry. The host factory validates the sealed policy before database initialization, applies the same guarded grounded factory to standalone/conversation/evaluation/streaming/preparation, and intersects existing tool allow-lists. CLI inspection for iteration 9 remains database-independent. No public fault switch or arbitrary path/policy selector is added.
