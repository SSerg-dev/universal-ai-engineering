# Iteration 6 — Deterministic Evaluation Gates

Iteration 6 evaluates the grounded documentation assistant through a sealed mixed-outcome dataset. It reports six independent dimensions: schema, outcome, retrieval, grounding, tools, and evidence. A gate requires every dimension to meet both its pass-rate threshold and minimum applicable coverage.

The teaching model and lexical hash embeddings remain deterministic. These checks measure controlled extractive behavior, provenance, and execution contracts; they do not establish semantic relevance across arbitrary questions or truth of source documents.

## Run the baseline

Use Node.js 24 and the local PostgreSQL setup from [Iteration 4](04-grounded-retrieval.md). Restore the existing database password/URL and index settings. Ingest the fixtures from the checkout being evaluated.

```powershell
npm ci
npm run build
$env:UAOS_INDEX_ID = 'course-docs-v1'
# Set UAOS_DATABASE_URL for your already configured local teaching database.
npm run ingest
$env:UAOS_ITERATION = '6'
npm run uaos -- eval
$LASTEXITCODE
```

The CLI evaluates the bundled [internal-docs@1.0.0](../../fixtures/evaluations/internal-docs.v1.json). The TypeScript build copies the JSON dependency, so the compiled CLI also works from another directory with explicit database/journal/report roots. It does not accept a model-provided dataset path or arbitrary fault command.

The three cases expect a grounded journal answer, a zero-information abstention, and an explicitly denied tool failure. The denied case passes outcome quality when the engine returns the expected TOOL_FAILURE. A harness exception remains a failed evaluation, rather than an expected operational outcome.

The default policy requires rate 1.0 and at least one applicable case per dimension. Grounding normally has one applicable answered case; retrieval has two non-error cases; schema/outcome/tools/evidence evaluate all three. Not-applicable checks are excluded from the denominator. No applicable cases yields rate null and fails minimum coverage, rather than becoming 100 percent.

## Inspect reports and run evidence

```powershell
$env:UAOS_REPORT_ROOT = Join-Path $PWD '.uaos/evaluations'
$env:UAOS_JOURNAL_ROOT = Join-Path $PWD '.uaos/journal'
$json = node ./dist/src/adapters/inbound/cli.js eval
$exit = $LASTEXITCODE
$report = $json | ConvertFrom-Json
$report.gate
$report.metrics
Get-Content -LiteralPath (Join-Path $env:UAOS_REPORT_ROOT ($report.evaluationId + '.json'))
Get-Content -LiteralPath (Join-Path $env:UAOS_JOURNAL_ROOT ($report.cases[0].runId + '.jsonl'))
```

| Exit | Meaning |
|---|---|
| 0 | Report persisted and every dimension passed its threshold |
| 2 | Report persisted and at least one dimension failed |
| 1 | Configuration, execution/publication handling, unsupported command, or cancellation failed |

Every run is allocated a host runId before execution. The executor captures only validated retrieved passage IDs and records an evaluation event only after the same event has been persisted to JSONL. A stored valid passage alone does not prove it was retrieved for that run. Model-produced identifiers cannot replace the host observation.

Reports store dataset/scorer identity, evaluation/case/run IDs, timestamps, safe codes, policy, dimension counts/rates, and gate outcomes. They exclude the question, document text, quote, answer, raw result, exception text, and database URL. Use the safe codes and linked run journal to diagnose a failure. The report is a quality artifact, not an approval record.

## Follow the independent checks

| Dimension | What it checks |
|---|---|
| schema | Strict grounded result shape and the allocated run ID |
| outcome | Answered, abstained, or expected error code |
| retrieval | Required/forbidden document IDs in tool-success evidence; empty retrieval for abstention |
| grounding | Observed passage membership, independent exact resolution, quote/identity/source/title, duplicate rejection, canonical answer |
| tools | Attempt counts, tool name, terminal counters, and successful public usage |
| evidence | Strict metadata, unique IDs, contiguous sequence, request/response correlation, and one matching final terminal event |

Successful evidence follows the established eight-event grammar. Failed execution may terminate with an outstanding operation. A failed trace requires run.started except the established single-event INVALID_REQUEST path. A RED test exposed and corrected that missing-start validation gap; its [record](../../.planning/phases/UAOS-06-evaluation-system/06-02-EVIDENCE-RED.json) is retained.

Grounding resolves each cited passage through the selected index and checks full immutable identity and exact text. The independent evaluator can therefore detect a regression even if the engine's own grounding validation is weakened. An aggregate average cannot hide a failed dimension.

## Reproduce a known regression

```powershell
npm test -- tests/unit/evaluation.test.ts -t 'known unsupported-answer regression'
npm run test:database
```

The offline fixture adds an unsupported assertion to an otherwise schema-valid answer and adjusts its fixture terminal length. Schema/evidence remain valid while grounding fails as UNSUPPORTED_ANSWER.

The live database fixture decorates a normal executor's returned answer after execution and deliberately leaves its real persisted journal unchanged. Both grounding and evidence fail, because the altered answer is uncited and its length disagrees with the original terminal event. This is an explicit test-only corruption; production model output, stored documents, and journal files are not modified by a public fault switch.

The database suite uses the existing digest-pinned, owner-verified disposable PostgreSQL runner. It proves baseline success, a known regression, observed passage identity, actual persisted event equivalence, report privacy, and the real compiled CLI. An unavailable database fails that command instead of silently skipping.

## Dataset and report publication

[ADR-0008](../architecture/decisions/ADR-0008-deterministic-evaluation.md) fixes revision and scoring rules. The dataset revision is SHA-256 over JSON.stringify of the parsed EvaluationDatasetBodySchema. For the published v1 fixture it is 1d04a965af0ff9b85355dbaaa5df72089a8c4971dc4b1155fc3178aaf9e931d2. Revision verification precedes case effects. A changed case or expectation requires a new versioned fixture; scorerVersion is recorded independently as extractive-1.0.

The [report adapter](../../src/adapters/outbound/filesystem-evaluation-report.ts) writes a validated report to an exclusive private temporary file inside the operator root, flushes file contents, closes it, and publishes a no-replace hard link. Existing files/symlinks are not overwritten. Unsupported hard links fail closed. Temporary files are cleaned, including when publication encounters pre-existing content.

The [I/O contract](../architecture/evaluation-io.md) distinguishes awaited file persistence from universal power-loss durability. Directory-entry durability is filesystem/platform dependent. Cancellation or cleanup failure racing a successful publication may leave a complete artifact even when acknowledgment fails; inspect the unique report ID and never overwrite it as a retry.

Reports bind dataset/scorer revisions, not a database-wide immutable corpus snapshot. Reproduction also needs the correct Git checkout, fixture ingestion, index configuration, and embedding profile. Concurrent reingestion can change what cases see. Stronger corpus snapshot binding remains an explicit limitation.

## Exercises

1. Remove applicable answered cases and show why minimum coverage prevents an empty grounding denominator from passing.
2. Alter a question without updating its sealed revision. Prove no case or report effect occurs.
3. Cite a valid retained passage that was not observed in that invocation. Explain why provenance alone is insufficient.
4. Reorder events while renumbering their sequences; then remove run.started from a failed trace. Identify the distinct evidence failures.
5. Fail report publication after running the cases. Explain why report success cannot be claimed and how existing run evidence remains inspectable.
6. Compare an expected permission failure with an executor exception. Explain their different outcome scores and safe diagnostics.

```powershell
npm run validate
npm run test:database
```

The [review evidence](../reviews/ITERATION-06-evidence.md) links these controls to tests. Iteration 6 preserves standalone ask/cite, explicit state commands, and earlier iteration contracts. End-to-end telemetry is the next phase. Human architectural review, approval, and stability remain pending.
