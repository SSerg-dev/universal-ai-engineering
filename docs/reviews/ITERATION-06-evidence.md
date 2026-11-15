# ITERATION-06 Evidence

Iteration 6 implements a sealed mixed-outcome dataset, independent deterministic evaluation, safe immutable report publication, and the operator CLI. It reuses the grounded use case, actual PostgreSQL retrieval, and persisted JSONL evidence. Node.js 24.22.1 is the verification runtime.

## Review state

| State | Status |
|---|---|
| Planned | Complete |
| Implemented | Complete |
| Architecturally Reviewed | Pending |
| Approved | Pending |
| Stable | Pending |

The user's continuing roadmap implementation authorization covers this work. Passing the gate or tests is not human architectural approval or stability acceptance.

## Implementation

[ADR-0008](../architecture/decisions/ADR-0008-deterministic-evaluation.md) defines dataset/scorer revisions, six dimensions, applicability/coverage, safe reports, and awaited persistence. The [I/O contract](../architecture/evaluation-io.md) defines actual host observation, immutable publication, CLI semantics, and platform limits. Earlier [contracts](../../.planning/phases/UAOS-06-evaluation-system/06-01-SUMMARY.md) and [scorer checkpoint](../../.planning/phases/UAOS-06-evaluation-system/06-02-SCORER-EVIDENCE.md) retain their historical verification and remaining-work state.

The [dataset](../../fixtures/evaluations/internal-docs.v1.json) is internal-docs@1.0.0 with canonical revision 1d04a965af0ff9b85355dbaaa5df72089a8c4971dc4b1155fc3178aaf9e931d2. It covers answered, abstained, and expected-denial cases. The compiled runtime bundles its JSON dependency. [The guide](../iterations/06-evaluation-system.md) reproduces CLI execution, safe report/journal inspection, known regression, and failure exercises. No package or lockfile was changed.

## Requirement traceability

| Requirement | Executable evidence | Implementation status |
|---|---|---|
| EVAL-01 | [Versioned dataset](../../tests/contracts/evaluation-dataset.test.ts), [strict gate contracts](../../tests/contracts/evaluation-contracts.test.ts), [independent scorer/regression](../../tests/unit/evaluation.test.ts), [live PostgreSQL baseline and regression](../../tests/database/evaluation.db.test.ts), [CLI exit policy](../../tests/integration/evaluation-cli.test.ts) | Implemented — review pending |

CORE-03/04 and NFR-01/02/03 additionally retain actual metadata-only JSONL, infrastructure-free ports/core compilation, deterministic offline tests, explicit database verification, package pins, and separate review/approval records.

## Threat traceability

| Threat | Boundary and control | Evidence |
|---|---|---|
| T-06-01 | Dataset shape/revision/unique case identity checked before effects; expectations protected from executor mutation | [Dataset pin](../../tests/contracts/evaluation-dataset.test.ts), [runner tests](../../tests/unit/evaluation.test.ts) |
| T-06-02 | Independent applicability, minimum coverage, exact metrics, and per-dimension thresholds prevent a misleading aggregate pass | [Gate contracts](../../tests/contracts/evaluation-contracts.test.ts), [baseline denominator tests](../../tests/unit/evaluation.test.ts) |
| T-06-03 | Host-observed passage IDs plus independent resolution/quote/source/canonical checks detect unobserved or unsupported answers | [Scorer regression](../../tests/unit/evaluation.test.ts), [live observed IDs](../../tests/database/evaluation.db.test.ts) |
| T-06-04 | Actual awaited persisted events, matching IDs/counts/terminal grammar, and strict safe report shape protect evidence continuity | [Live journal equivalence](../../tests/database/evaluation.db.test.ts), [evidence grammar](../../tests/unit/evaluation.test.ts) |
| T-06-05 | Exclusive temporary file, content flush, no-replace publication, owned cleanup, and normalized errors preserve existing artifacts | [Filesystem tests](../../tests/unit/filesystem-evaluation-report.test.ts) |
| T-06-06 | Cancellation stops later cases, report save is awaited, and harness exceptions cannot mimic expected failures | [Runner failure tests](../../tests/unit/evaluation.test.ts), [CLI signal/errors](../../tests/integration/evaluation-cli.test.ts) |
| T-06-07 | Model-independent closed fault scenario, preserved earlier entry points, and report/CLI privacy | [Live CLI and report privacy](../../tests/database/evaluation.db.test.ts), [CLI boundaries](../../tests/integration/evaluation-cli.test.ts) |

## Verification

```sh
npm ci
npm run validate
npm run test:database
```

Before documentation closure, full validation passed 298 tests in 32 files, strict project/core typecheck, and build. Test duration was 26.52 seconds. The explicit PostgreSQL/pgvector suite passed 22 tests in three files in 10.60 seconds and removed its exact owner-verified disposable container. The compiled CLI was exercised from another working directory against the bundled dataset.

The offline known regression fails grounding while schema and fixture journal metadata remain valid. The live post-execution corruption fixture fails grounding and evidence against its unchanged persisted journal. Expected TOOL_FAILURE is a passing outcome only for the explicitly denied case; a harness exception fails safe checks without exposing exception text.

The retained [RED record](../../.planning/phases/UAOS-06-evaluation-system/06-02-EVIDENCE-RED.json) captures the missing-run.started finding and correction. Final closure passed 300 tests in 32 files in 23.67 seconds, strict project/core typecheck, build, package integrity, internal links, EVAL-01 traceability, and seven threat boundaries. The last separate real-database verification passed 22 tests in three files in 10.60 seconds and removed its owned container. Earlier contract/core checkpoint numbers remain historical.

## Findings and limits

These are deterministic checks over a small controlled extractive corpus. They do not establish source truth, arbitrary-question semantic relevance, production reliability, or approval. Dataset/scorer revisions do not freeze the whole database corpus; reproduce with the documented Git checkout, fixture ingestion, index, and embedding profile. Concurrent reingestion can affect results.

Cases execute sequentially without automatic retries. Caller cancellation depends on cooperative executor/resolver/report ports; supplied engine/database work is bounded by its existing policies. Report save failure may occur after case effects; publication/cancellation acknowledgment can be ambiguous. The adapter never overwrites a report and does not promise portable directory-entry power-loss durability.

The publication root and database URL are trusted operator inputs. There is no public arbitrary fault switch, dynamic model-controlled dataset path, new paid provider, or production authorization policy. The filesystem requires hard-link support. Reports and journals exclude content, while explicit conversation state retains its separately declared content policy. Architectural review, approval, and stability remain pending.
