# Iteration 7 — Inspect Execution Without Exporting Content

Iteration 7 keeps the grounded assistant, explicit conversations, and evaluation gates, and adds safe correlated execution metadata. Its lesson is to diagnose a failed run from IDs, operation spans, measured intervals, and closed failure codes while keeping questions, documents, answers, quotes, and memory content out of telemetry.

## Prerequisites and execution

Use Node.js 24 and the controlled PostgreSQL/pgvector fixture setup from [Iteration 4](04-grounded-retrieval.md). Set UAOS_DATABASE_URL to that teaching database before ingestion. This is trusted operator configuration; do not paste its credentials into evidence. Iterations 1–6 retain their earlier behavior; iteration 1 remains the default.

```powershell
npm ci
npm run build
$env:UAOS_ITERATION = '7'
$env:UAOS_INDEX_ID = 'course-docs-v1'
$env:UAOS_FIXTURE_ROOT = Join-Path $PWD 'fixtures/docs'
$env:UAOS_JOURNAL_ROOT = Join-Path $PWD '.uaos/journal'
$env:UAOS_REPORT_ROOT = Join-Path $PWD '.uaos/evaluations'
$env:UAOS_TELEMETRY_ROOT = Join-Path $PWD '.uaos/telemetry'
npm run ingest
$askOutput = npm run uaos -- ask 'execution journal'
$askOutput
$runId = [regex]::Match(($askOutput -join "`n"), 'Run ID: (run-[A-Za-z0-9_-]+)').Groups[1].Value
npm run uaos -- inspect $runId
```

The primary answer still contains its run ID. The optional file is named after that ID with a .telemetry.jsonl suffix. inspect prints a validated JSON diagnosis with operation durations, status/codes, usage, related IDs, and explicit completeness issues. Exit 0 means complete evidence, 2 means missing/incomplete/invalid evidence, and 1 means an invalid command or boundary failure. Complete telemetry can describe a failed domain operation; it is not a quality or success verdict. Inspection does not initialize the primary runtime or connect to PostgreSQL, so it remains useful during a database outage. It never replays execution.

HTTP uses the same observed runtime:

```powershell
node --input-type=module -e 'import {startServer} from "./dist/src/composition/server.js"; await startServer({iteration:7, databaseUrl:process.env.UAOS_DATABASE_URL, indexId:process.env.UAOS_INDEX_ID, journalRoot:process.env.UAOS_JOURNAL_ROOT, telemetryRoot:process.env.UAOS_TELEMETRY_ROOT});'
```

POST /api/v1/agent-runs with the earlier JSON question contract. Inspect the returned runId through the CLI. There is no new public diagnostics HTTP endpoint or new primary response field.

## Correlation and measurement

Each run owns an isolated root span and buffered records. Model/tool spans carry call IDs; journal spans link event IDs; execution.log records only metadata from actually persisted required events. Retrieval measures actual embedding/repository work. Usage counts attempts and retries is zero, matching the existing policy. Only iteration 7 replaces its journal response/tool duration placeholders with these measured control intervals.

An injected monotonic clock measures durations; the Node adapter uses performance.now(). Integer milliseconds may be zero for sub-millisecond work. Model/tool intervals start after request-event persistence and end before completion-event persistence. They include adapter/boundary work, not only vendor computation. Run duration excludes its final telemetry flush. State/evaluation operation duration includes nested run execution and its awaited flushes, but excludes the enclosing operation's own final telemetry flush. Concurrent work does not share span state. Noncooperative retrieval may continue after its observed timeout span closes; a late settlement cannot add another span or change exported totals.

State operations from [Iteration 5](05-durable-state-memory.md) produce separate operation traces. Their state.completed metadata links validated conversationId/requestId and, for a settled run_turn, runId/version. A completed state transaction can contain a failed agent result: the state span is successful and the linked run explains the agent failure. No private lease token, memory key/value, question, or stored answer is copied. Discover operation IDs from filenames in the operator telemetry directory; this preserves the original state command responses.

```powershell
Get-ChildItem -LiteralPath $env:UAOS_TELEMETRY_ROOT -Filter 'operation-*.telemetry.jsonl'
npm run uaos -- eval
```

The evaluation report's evaluationId identifies an evaluation.metrics trace with six validated quality rates and actual caseRunIds. Inspect those run IDs to follow their model/tool/retrieval/journal spans. A failed quality gate is still a completed evaluation operation. An exception before a valid acknowledged report produces evaluation.failed with a safe code and no fabricated quality rates or case outcomes.

## Failure runbook

1. Preserve the primary result/run ID and required journal. JOURNAL_FAILURE remains fail-closed even if optional telemetry succeeds. Export failure never changes the primary domain result or original exception.
2. Run inspect for the ID. If incomplete, read issues first. TELEMETRY_MISSING means no readable artifact; malformed content produces TELEMETRY_INVALID; missing root/terminal/operation spans, sequence gaps, correlation mismatch, and known buffer drops remain explicit. Do not infer success from a prefix or missing data.
3. For complete failed runs, compare runMetrics.errorCode with span status/errorCode. TOOL_FAILURE with a tool span TOOL_PERMISSION_DENIED identifies the permission boundary without exposing input. Inspect state/evaluation relatedRunIds for the run that needs investigation.
4. Reproduce the injected permission failure and optional-export/required-journal failure cases through the deterministic/live tests below. Fault injection belongs to the test host; there is no model-controlled runtime fault switch.

```powershell
npm test -- tests/integration/observed-run.test.ts tests/integration/observed-runtime.test.ts tests/unit/observe-operations.test.ts
npm run validate
npm run test:database
```

The explicit database runner owns one disposable digest-pinned container, checks the real CLI from another directory with database-free inspection, verifies HTTP/state/evaluation correlation and privacy, and removes only its owner-verified container. It also preserves all previous persistence/retrieval/evaluation checks.

## Why the exporter batches

[ADR-0009](../architecture/decisions/ADR-0009-safe-observability.md) separates required evidence from optional telemetry. [ADR-0010](../architecture/decisions/ADR-0010-bounded-telemetry-batches.md) records the live discovery: per-record filesystem synchronization exhausted the 250 ms flush budget on Windows. Batching fixed that measured problem without raising the budget or weakening required journal persistence. The [RED record](../../.planning/phases/UAOS-07-observability/07-02-LIVE-RED.md) retains both the failure and successful correction.

Each trace buffers at most 64 records, each at most 8 KiB. The filesystem exporter exclusively creates one private bounded JSONL file, writes the validated batch, syncs once, and closes. Existing files are preserved. Append-only exporters still work through the same port. There are no retries or per-record fallback after failed batch export. A timeout bounds waiting; underlying noncooperative work may finish later. Acknowledgment counts describe what was known when flush returned, not exactly-once delivery. Missing/partial artifacts remain a valid possible outcome under resource pressure.

## Hard exercises and limits

- Inject a sink that never resolves, let its work settle after timeout, and prove the cached delivery/result never changes and no later append begins.
- Corrupt a parent ID, event sequence, terminal metrics, or operation duration in a copied test trace; identify why diagnosis must become incomplete without reading content.
- Compare a failed required journal append with a failed optional exporter. Explain why only one changes the primary run outcome.
- Follow one state turn and each evaluation case to their run traces. Distinguish state transaction success, agent failure, and quality-gate failure.
- Replace the sink behind its port with a bounded external exporter without importing that SDK into domain/application. Define acknowledgment ambiguity before implementing retries.

Telemetry is metadata, not anonymous data: correlation IDs and timing can still be operationally sensitive. Operator roots are trusted local configuration. There is no authentication/tenant isolation, retention scheduler, production aggregation service, W3C/OTel wire guarantee, sampling, distributed propagation, or production SLO claim. Filesystem flush does not promise portable directory-entry power-loss durability. CPU instrumentation can affect near-deadline scheduling. Earlier explicit conversation retention/content policies are unchanged. [Evidence](../reviews/ITERATION-07-evidence.md) separates implementation from pending architectural review, approval, and stability.
