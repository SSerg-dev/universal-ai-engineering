# ADR-0009 — Safe Best-Effort Observability

- Status — Selected for Phase 7 implementation; architectural review pending
- Date — 2026-11-15
- Extends — ADR-0008

## Scope and failure policy

Iteration 7 adds correlated metadata logs, operation spans, latency/usage/failure metrics, state-operation links, and evaluation quality summaries. Required execution JSONL and transactional state audit retain their existing failure semantics. Optional telemetry is a separate best-effort side effect; exporter failure must not replace an agent/state/evaluation result with success or failure of another kind.

Telemetry is buffered synchronously per trace without exporter I/O on the model/tool deadline path. After the primary operation settles, one export attempt drains the bounded buffer with a 250 ms default wait budget. A timeout bounds return, not arbitrary noncooperative underlying I/O. Late completion may append a record; it cannot change the returned primary result or trigger later exports. There are no automatic retries. Delivery counts describe acknowledgments observed before the flush returns, not an exactly-once guarantee.

The primary result schemas remain unchanged. A missing/partial telemetry artifact is diagnosed explicitly; telemetry completeness is not inferred from primary success. An exporter cannot mask a required JOURNAL_FAILURE. Errors from optional clocks/IDs/observers are contained and counted as buffer drops, without recording their raw text.

## Data and correlation

Strict telemetry-1.0 records are execution.log, span.completed, run.metrics, state.completed, evaluation.metrics, and evaluation.failed. The last form represents an evaluation that produced no acknowledged valid report, without inventing rates or case outcomes. Invalid state commands use the fixed invalid_command operation label, never raw untrusted input. Only validated IDs, closed operation/status/error labels, counts, durations, timestamps, and quality rates are admitted. Questions, answers, prompts, arguments, document text, quotes, memory keys/values, exception text/stacks, paths, URLs, and credentials have no telemetry fields. IDs are correlation metadata, not metric label dimensions.

runId is the run trace identity. Request call IDs link model/tool spans to persisted execution events; a root span parents operation spans. State operations receive a separate opaque operation trace and include validated conversation/request/run ID links when present. Evaluation summaries link their evaluation ID, case run IDs, and six quality dimensions. Private lease tokens are never telemetry.

The initial span identifiers are host-owned opaque IDs. This is a local course protocol, not a claim of W3C Trace Context or OpenTelemetry wire compatibility. A future exporter can translate the stable port to another backend without importing its SDK into the core. No new package/service is required.

## Timing and metric semantics

Wall-clock ISO timestamps order human-readable records; an injected monotonic clock measures intervals. The Node adapter uses performance.now(), documented as a high-resolution process-relative millisecond timestamp. Durations are nonnegative integer milliseconds; sub-millisecond work may measure zero. They are measurements, not fixed synthetic nonzero values.

Model/tool control intervals run from completion of required request-event persistence to arrival of the response/completion event, excluding that completion event's persistence. They include adapter work and boundary validation; they are not a pure vendor inference measurement. Separate retrieval timing wraps actual embedding/repository retrieval. Journal timing measures awaited appends. Run timing covers primary execution, excluding the post-result telemetry flush. Concurrent traces never share mutable span state.

Only iteration 7 replaces the previous duration placeholders in its own persisted response/tool events with these measured intervals. Earlier iterations retain their event/result contracts. Usage counts remain attempts, retry count is explicitly zero because no retry policy is implemented, and error labels remain host-owned codes. A late failed/cancelled operation closes pending spans against the terminal outcome without fabricating a response event.

## Bounds and diagnostics

Each trace has at most 64 queued records, at most 8 KiB per validated record. Invalid/full/closed-buffer submissions are rejected and counted. bufferDrops records losses known before export; it does not assert an exporter delivery count. No recursive telemetry is emitted while exporting.

The default sink appends safe JSONL by a validated filename-safe trace ID inside an operator root, with awaited file writes/flush. A bounded reader validates records. Diagnostics require one trace identity, contiguous sequence, a root span, matching parent/call links, a terminal metrics record, and expected operation coverage. Queue loss, missing records, malformed content, absent terminal metrics, and unavailable artifacts produce explicit incomplete results. A damaged trace must never be reported complete from partial success data.

State/evaluation operations preserve their typed domain outcomes while adding separately flushed metadata. Quality metrics come only from validated EvaluationReportSchema, without copying cases/questions/results. Existing CLI/HTTP/conversation/evaluation capabilities remain available in iteration 7; an operator inspect command provides a reproducible failure runbook. Production exporters, aggregation infrastructure, distributed headers, sampling, and SLOs are deferred.

## Required evidence

Prove strict redaction, parent/ID correlation, deterministic injected timing, bounded/failed/noncooperative exporter behavior, late-settlement isolation, no primary-result drift, required-journal failure preservation, concurrent-run isolation, state/evaluation links, real CLI/HTTP/database traces, and diagnosis of an injected failure using safe artifacts only. Review, approval, and stability remain pending independently.

## Reference

[Node.js 24 performance.now()](https://nodejs.org/docs/latest-v24.x/api/perf_hooks.html#performancenow) documents the process-relative high-resolution clock used by the adapter. The course's timing/queue/failure policy is defined above rather than inferred from that API.
