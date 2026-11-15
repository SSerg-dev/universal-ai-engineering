# ITERATION-07 Evidence

Iteration 7 implements bounded optional metadata telemetry, actual control/retrieval/journal timing, state/evaluation correlation, safe filesystem batches, and database-independent CLI failure diagnosis. It reuses the grounded execution, state, and independent evaluation use cases. Verification uses Node.js 24.22.1.

## Review state

| State | Status |
|---|---|
| Planned | Complete |
| Implemented | Complete |
| Architecturally Reviewed | Pending |
| Approved | Pending |
| Stable | Pending |

Continuing implementation authorization is not architectural approval or stability acceptance. No package or lockfile changed.

## Implementation

[ADR-0009](../architecture/decisions/ADR-0009-safe-observability.md) defines privacy, correlation, timing, optional failure, and diagnosis semantics. [ADR-0010](../architecture/decisions/ADR-0010-bounded-telemetry-batches.md) records the measured live per-line synchronization failure and batch correction under the original 250 ms budget. The [guide](../iterations/07-observability.md) reproduces CLI/HTTP execution, database-free inspection, state/evaluation links, failure diagnosis, and hard exercises. The historical [buffer checkpoint](../../.planning/phases/UAOS-07-observability/07-02-BUFFER-EVIDENCE.md) and [live RED record](../../.planning/phases/UAOS-07-observability/07-02-LIVE-RED.md) retain incremental findings.

## Requirement traceability

| Requirement | Executable evidence | Implementation status |
|---|---|---|
| OBS-01 | [Strict contracts](../../tests/contracts/telemetry-contracts.test.ts), [observed loop](../../tests/integration/observed-run.test.ts), [state/quality links](../../tests/unit/observe-operations.test.ts), [real CLI/HTTP/database correlation](../../tests/database/observability.db.test.ts), [inspection CLI](../../tests/integration/telemetry-cli.test.ts) | Implemented — review pending |

CORE-02/03/04 and NFR-01/02/03 additionally retain vendor-free core compilation, required evidence semantics, shared CLI/API execution, deterministic fakes, explicit database verification, exact dependency pins, and independent review states.

## Threat traceability

| Threat | Boundary and control | Evidence |
|---|---|---|
| T-07-01 | Strict closed metadata schema excludes content, raw errors, secrets, paths, memory, and arbitrary labels | [Contracts](../../tests/contracts/telemetry-contracts.test.ts), [live artifact privacy](../../tests/database/observability.db.test.ts) |
| T-07-02 | Per-run span/call/event identity, isolated concurrency, and state/evaluation related-run IDs | [Observed execution](../../tests/integration/observed-run.test.ts), [composition concurrency](../../tests/integration/observed-runtime.test.ts), [live links](../../tests/database/observability.db.test.ts) |
| T-07-03 | Bounded validated queues, single bounded flush, no retry/fallback, stable timeout acknowledgment, late-settlement isolation | [Buffer/batch tests](../../tests/unit/buffered-telemetry.test.ts), [late retrieval](../../tests/integration/observed-run.test.ts) |
| T-07-04 | Optional sink/clock failures preserve primary results/exceptions; required journal failure remains fail-closed | [Observed core](../../tests/integration/observed-run.test.ts), [state/evaluation isolation](../../tests/unit/observe-operations.test.ts), [live filesystem failure](../../tests/database/observability.db.test.ts) |
| T-07-05 | Validated root/IDs, exclusive private file creation, no overwrite/resume, identity/size/read bounds, partial-file rejection | [Filesystem tests](../../tests/unit/filesystem-telemetry.test.ts) |
| T-07-06 | Missing/partial/corrupt traces cannot mimic complete evidence; diagnostics remain usable without the primary database | [Diagnosis adversarial cases](../../tests/unit/diagnose-telemetry.test.ts), [CLI boundaries](../../tests/integration/telemetry-cli.test.ts), [live database-free inspection](../../tests/database/observability.db.test.ts) |
| T-07-07 | Injected monotonic timing, distinct attempt/latency semantics, known-code failure diagnosis, validated quality rates only | [Timing](../../tests/integration/observed-run.test.ts), [quality/cancellation](../../tests/unit/observe-operations.test.ts), [live journal equivalence](../../tests/database/observability.db.test.ts) |

## Verification

Before closure, full validation passed 357 tests in 40 files, strict project/core compilation, and build in 29.48 seconds. The initial live suite exposed the per-line synchronization issue: 22 earlier tests passed and four new telemetry tests failed, with incomplete diagnostics rather than primary result drift. After bounded batch export, all 26 live database tests in four files passed in 13.32 seconds and the exact owner-verified disposable container was removed. Fourteen focused buffer/filesystem tests subsequently passed.

```sh
npm ci
npm run validate
npm run test:database
```

Final closure passed 363 tests in 40 files in 29.74 seconds, strict project/core compilation, build, dependency integrity, internal Markdown links, OBS-01 traceability, seven threat boundaries, and pending approval states. Earlier checkpoint numbers remain historical. The last independent real-database run passed 26 tests in four files in 13.32 seconds and removed its owned container.

One closure attempt passed 360 tests but failed three pre-existing live MCP connection/HTTP tests (64.68 seconds total). Without source or timeout changes, the isolated MCP suite then passed all six tests in 6.47 seconds, and a direct pinned modern negotiation measured 286 ms. The exact environmental cause was not established; a transient scheduling/child-startup issue is suspected. This failed attempt is retained rather than counted as a passing validation.

## Findings and limits

Required JSONL/state audit and optional telemetry have different guarantees. A failed exporter cannot replace a domain result; complete telemetry does not mean domain or quality success. Export timeout bounds waiting and can leave ambiguous partial/late effects. No automatic retry, exactly-once or portable directory-entry power-loss durability is claimed. Safe IDs correlate sensitive operations and are not anonymous metrics labels.

Monotonic integer durations may be zero and include declared adapter/control work. Run latency excludes its own final flush; enclosing state/evaluation timing includes nested runs and their awaited flushes. Noncooperative retrieval may continue after the observed timeout interval closes. Instrumentation is not zero-overhead. Database-backed evidence covers a controlled deterministic course corpus, not production SLOs or semantic model quality.

No new dependency, external telemetry service, content export, production authorization, distributed trace protocol, sampling, retention scheduler, or automatic approval was introduced. Earlier iteration selection remains explicit and compatible. Architectural review, human approval, and stability are pending.
