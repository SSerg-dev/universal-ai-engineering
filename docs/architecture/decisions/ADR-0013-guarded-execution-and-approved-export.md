# ADR-0013 — Guarded Execution and Explicit Approved Export

- Status — Selected for Phase 9 implementation; architectural review pending
- Date — 2026-11-16
- Extends — ADR-0011/0012 and the existing durable-state/audit patterns

## Teaching slice and boundaries

Iteration 9 enforces host-owned input/output rules, registered-tool permissions, call/time/size budgets, and explicit human approval for one concrete local effect: publishing a grounded answer as a Markdown artifact. Publishing is a separate post-answer action over the same guarded grounded engine, not a second agent loop or an approval tool the model can call. Existing iterations 1–8 retain their contracts, default selection, and behavior. No real model provider, external message, payment, or remote deployment is introduced.

The maintainable demonstration is question → guarded retrieval/answer → prepare export → review exact proposal → approve/deny → execute or stop. A CLI/API command service persists the pause so approval/execution can occur in later processes without rerunning the question. The existing Angular inspector can still consume ordinary guarded run streams; a new approval UI is not required by Phase 9 scope.

## Host policy and core checkpoints

A strict versioned JSON policy is loaded/validated and its canonical SHA-256 revision checked before startup effects. It owns maximum question/answer/tool-input/tool-output character counts, bounded literal block markers, allowed registered tools, maximum model/tool attempts, run/tool deadlines, whether export is enabled, export byte limit, approval lifetime, and pending-action capacity. It is configuration outside the core. Request/model/tool data cannot choose or override a policy, grant permission, supply an output path, or approve an action.

Literal marker rules normalize NFKC/case and use bounded plain substring checks, not caller-supplied regular expressions. These are explicit teaching rules, not semantic prompt-injection detection, PII classification, or proof of source truth. Character limits are UTF-16 counts; export size is actual UTF-8 bytes. No fake provider-token, monetary-cost, or production-SLO budget is claimed.

The shared loop gains an optional provider/framework-free checkpoint port at parsed request, validated model action, tool invocation, and validated tool observation boundaries. The whole port is absent in earlier iterations. Enabled checkpoints return a strict boolean only after their typed metadata audit is acknowledged. A denied request maps to existing INVALID_REQUEST; a denied model action maps to INVALID_MODEL_ACTION; denied invocation/observation produces existing TOOL_PERMISSION_DENIED/TOOL_OUTPUT_INVALID and TOOL_FAILURE. Existing core call/deadline budgets retain LIMIT_EXCEEDED/TIMEOUT. The ten public agent error codes, journal schemas, and prior phase contracts remain unchanged.

Checkpoint audit failure or malformed policy-port output fails closed before the corresponding later effect and becomes a normalized existing internal failure, without raw error text. Caller cancellation retains its existing precedence. A failed audit cannot be assumed complete; required execution JSONL still records the primary failure when available. Policy records and primary journal share the host-assigned run/call IDs, so budget/outcome evidence need not duplicate content or alter the original event schema.

The guarded factory applies to standalone, conversation, evaluation, and streaming executions through existing composition factories. Permissions are also intersected with existing invocation allow-lists. A model asking for the export action through the tool registry is denied: publication exists only behind the separate command service. Stateful guard objects are invocation-local; policy snapshots are immutable.

## Consequential proposal and explicit decision

prepare_export accepts a safe request ID and bounded question, reserves one preparation, executes the same guarded assistant once, validates a successful grounded/canonical answer, then durably stores a pending proposal. A reused request ID with different input is rejected; a duplicate active preparation is not another model run. Failures do not publish an artifact. The exact proposed content is intentionally available to the local operator for review, separate from metadata-only audit/journal.

The proposal binds action ID, run ID, policy ID/revision, fixed export kind/format/destination ID, exact content SHA-256/UTF-8 byte count, and expiry into a canonical proposal digest. Filenames are generated from the safe action ID; no request/model path or filename is accepted. Approval/denial requires action ID, expected version, and that exact proposal digest. The decision is an explicit local-operator command, never inferred from development authorization, model text, a question flag, an HTTP disconnect, or an earlier approval for another action.

PostgreSQL stores private proposal content/state and transactional metadata audit. States distinguish preparing, pending, approved, denied, executing, succeeded, preparation_failed, expired, and uncertain. Version CAS, immutable intent fields, private preparation/execution lease tokens, and validated transition rules fence concurrent/late workers. Pending capacity is checked transactionally. Audit insertion and state mutation commit together; failure rolls back before publication authorization is acknowledged. Private tokens, question, answer, quotes, content, raw errors, filesystem paths and credentials never become audit fields.

Policy revision, digest, version, enabled capability, expiry, and execution state are rechecked before claiming publication. Approval resumes from durable state; it does not repeat the question. Restart with a different policy invalidates stale unexecuted proposals. Approval expires independently of the active agent deadline; the engine does not wait for a person inside its five-second loop.

## Publication and ambiguity

The outbound filesystem port writes the exact prepared UTF-8 Markdown bytes to a private owned temporary file, flushes, and atomically publishes without replacing an existing action-named artifact. A matching existing artifact can acknowledge the same action; a mismatched artifact is preserved and rejected. The application passes bounded cancellation/deadline context, never a model path. A receipt contains only safe IDs/digests/counts, not content or absolute paths.

PostgreSQL and the filesystem do not form one transaction. A lost acknowledgment/crash/timeout after publication can leave executing/uncertain state even if the artifact exists. There is no exactly-once, arbitrary rollback, or automatic retry claim. An explicit reconcile operation verifies an existing artifact by the bound digest/byte count and can record succeeded; absent evidence remains uncertain rather than pretending no effect occurred. Late workers cannot overwrite state through stale leases/versions, and publication never overwrites another artifact. A valid approval cannot be silently repurposed after a restart or policy change.

Expiry prevents a new execution claim. Cancellation/deadline checks bound authorization and waiting, but cannot promise arbitrary underlying I/O stopped at an exact instant. Uncertain executing work remains accounted under capacity until reconciled. Expired private payloads are removed on access/explicit maintenance while metadata audit is retained; already approved published files are user artifacts and are not silently deleted.

## Interfaces and limits

Explicit iteration 9 adds typed guard commands for prepare/read/approve/deny/execute/reconcile/audit/expired-payload maintenance. The CLI and same-origin JSON HTTP adapter call the same application service. Request shapes are strict and denial codes/messages fixed. The ordinary ask/stream paths remain compatible; protected proposal views are deliberately content-bearing like existing conversation reads. No new package is required.

This is one trusted local operator, not remote authentication or a multi-tenant authorization system. Browser Origin checks mitigate cross-origin requests; IDs/digests are binding/correlation values, not identity proof. Hashes detect binding/corruption, not a malicious administrator replacing the whole trusted database/policy. The optional seven-day conversation retention preference remains unrelated/unselected. Policy and short proposal expiry are explicit teaching-manifest values.

Architectural review, human acceptance, and stability remain pending. Required evidence covers denied/bypassed input/output/tools, exhausted budgets, audit failure, concurrency, stale digests/versions/policies, restart/resume, explicit denial/expiry, filesystem no-overwrite and ambiguous receipt reconciliation, and content-free audit.
