# ITERATION-01 Evidence

The first executable slice accepts a question, performs one lexical documentation search through a deterministic model script, and returns a typed result through CLI or HTTP with ordered per-run JSONL evidence. Verification was performed on 2026-11-09 against the current Phase 1 branch.

## Review state

| State | Status |
|---|---|
| Planned | Complete |
| Implemented | Complete |
| Architecturally Reviewed | Contracts reviewed on 2026-09-30; implementation review pending |
| Approved | Pending |
| Stable | Pending |

The user explicitly selected the current ADR-0003 on 2026-11-09, including search_docs and fail-closed JOURNAL_FAILURE behavior. This selection authorizes continuation of implementation. The earlier package and contract review is preserved in [ARCH-0001](ARCH-0001-iteration-01-gate.md). Phase approval and stability require separate explicit human decisions.

## Reproduction

Use Node.js 24 first on PATH from the repository root. The verified runtime is 24.22.1. The installed package publications and categories match the unique human-accepted tuple record in [Plan 01-02](../../.planning/phases/UAOS-01-typed-agent-loop/01-02-SUMMARY.md).

| Package | Version | Category |
|---|---|---|
| zod | 4.6.5 | dependencies |
| fastify | 5.12.5 | dependencies |
| typescript | 7.0.2 | devDependencies |
| vitest | 5.0.2 | devDependencies |
| vite | 8.3.1 | devDependencies |
| @types/node | 24.19.0 | devDependencies |

```powershell
node --version
npm ci
npm run validate
npm run uaos -- ask "execution journal"
```

The complete [learner walkthrough](../iterations/01-typed-agent-loop.md) includes the HTTP startup, request, journal inspection, and failure exercises. Installation needs registry access. Validation uses installed packages and local fixtures with loopback HTTP connections only. The restricted host requires loopback permission for real HTTP tests.

## Verification results

| Command | Observed result |
|---|---|
| npm run typecheck | Passed strict project compilation without emit |
| npm run typecheck:core | Passed strict domain/application compilation without emit |
| npm test | Passed 90 tests in 13 files, including contract, unit, integration, CLI child-process, real HTTP, link, pin, and evidence checks |
| npm run build | Passed and emitted executable JavaScript under dist |
| npm run validate | Passed all four gates in order with failure propagation |

The final validate result and count are recorded after the closure checks in [01-VALIDATION](../../.planning/phases/UAOS-01-typed-agent-loop/01-VALIDATION.md). Plan 01-08 passed 85 tests in 12 files before the evidence integrity suite was added. CLI/HTTP success reports two model calls and one tool call. A healthy successful journal has eight strictly validated records, ordered sequence numbers, and one terminal event.

## Requirement traceability

| Requirement | Executable evidence | Implementation status |
|---|---|---|
| FOUND-01 | [Recovery inventory](../../tests/integration/reset-evidence.test.ts) | Implemented — review pending |
| ARCH-01 | [Dependency boundaries](../../tests/contracts/dependency-boundaries.test.ts), [ports](../../tests/contracts/ports.test.ts), [package and review integrity](../../tests/integration/iteration-evidence.test.ts) | Implemented — review pending |
| EDU-02 | [Teaching scenario](../../tests/integration/teaching-scenario.test.ts), [search boundaries](../../tests/integration/search-docs.test.ts) | Implemented — review pending |
| EDU-03 | [Guide and evidence integrity](../../tests/integration/iteration-evidence.test.ts) | Implemented — review pending |
| CORE-01 | [Loop success](../../tests/unit/run-agent.test.ts), [typed failures](../../tests/unit/run-agent-failures.test.ts) | Implemented — review pending |
| CORE-02 | [HTTP and CLI parity](../../tests/integration/http.test.ts), [CLI child processes](../../tests/smoke/cli.test.ts) | Implemented — review pending |
| CORE-03 | [Safe JSONL](../../tests/integration/jsonl-journal.test.ts), [event contracts](../../tests/contracts/agent-events.test.ts) | Implemented — review pending |
| CORE-04 | [Failure and cancellation matrix](../../tests/unit/run-agent-failures.test.ts), [real HTTP lifecycle](../../tests/integration/http.test.ts) | Implemented — review pending |
| NFR-01 | [Core compilation and forbidden imports](../../tests/contracts/dependency-boundaries.test.ts) | Implemented — review pending |
| NFR-02 | [Port substitution](../../tests/contracts/ports.test.ts), [default composition](../../tests/integration/teaching-scenario.test.ts) | Implemented — review pending |
| NFR-03 | [Traceability and governance integrity](../../tests/integration/iteration-evidence.test.ts) | Implemented — review pending |

## Threat traceability

Each row references the existing unique threat identity from the execution plans. Mitigated means the scoped control has passing automated evidence. It does not grant approval or claim a production security certification.

| Threat | Boundary and control | Disposition | Evidence |
|---|---|---|---|
| T-01-01 | Preserve reset recovery and contract-first evidence | Mitigated | [Reset checks](../../tests/integration/reset-evidence.test.ts) |
| T-01-02 | Strict unknown-value schemas and metadata-only events | Mitigated | [Schemas](../../tests/contracts/schemas.test.ts), [events](../../tests/contracts/agent-events.test.ts) |
| T-01-03 | Narrow core ports with inward dependencies | Mitigated | [Ports](../../tests/contracts/ports.test.ts), [imports](../../tests/contracts/dependency-boundaries.test.ts) |
| T-01-04 | Explicit two-state loop and awaited happy-path evidence | Mitigated | [Loop tracer](../../tests/unit/run-agent.test.ts) |
| T-01-05 | Controlled fixture loading and deterministic model | Mitigated | [Teaching scenario](../../tests/integration/teaching-scenario.test.ts) |
| T-01-06 | Query bounds, Unicode matching, stable order, and schema rejection | Mitigated | [Search boundaries](../../tests/integration/search-docs.test.ts), [schemas](../../tests/contracts/schemas.test.ts) |
| T-01-07 | Typed failures, call limits, cancellation, and deadlines | Mitigated | [Failure matrix](../../tests/unit/run-agent-failures.test.ts) |
| T-01-08 | Per-run state, safe terminal evidence, and core independence | Mitigated | [Failure isolation](../../tests/unit/run-agent-failures.test.ts), [dependency checks](../../tests/contracts/dependency-boundaries.test.ts) |
| T-01-09 | Filename-safe contained per-run JSONL and fail-closed writes | Mitigated | [Filesystem journal](../../tests/integration/jsonl-journal.test.ts) |
| T-01-10 | CLI translation and SIGINT listener ownership | Mitigated | [CLI smoke](../../tests/smoke/cli.test.ts) |
| T-01-11 | Bounded HTTP, real disconnect, parity, and concurrent persistence | Mitigated | [HTTP integration](../../tests/integration/http.test.ts) |
| T-01-12 | Complete traceability with pending approval/stability | Mitigated | [Evidence integrity](../../tests/integration/iteration-evidence.test.ts) |
| T-01-SC | Human-accepted exact dependency names, categories, and lock continuity | Mitigated | [Accepted pins verification](../../tests/integration/iteration-evidence.test.ts) |

## Findings and limitations

F-HTTP-01 is resolved. Real HTTP body completion previously returned 499 because the pinned framework signal subscribed to IncomingMessage close. The adapter now cancels only on incomplete request close or unfinished response close. Both normal completion and active-client disconnect have real socket regression tests. The plan's literal request.signal integration was replaced by an adapter-owned caller signal while preserving the application port and D-14 semantics. See [01-08 evidence](../../.planning/phases/UAOS-01-typed-agent-loop/01-08-SUMMARY.md).

F-CLI-01 is resolved. Repeated full compilation inside individual five-second CLI tests caused timing failures on a busy host. The smoke suite builds once in its setup hook and retains all child-process behavior checks.

F-DOC-01 is resolved by this closure. The old README and project context described a greenfield repository without application code. Current documentation now points to the executable slice and keeps review and approval distinct.

The default model returns a fixed teaching answer, including for empty search matches. Its source IDs are selected from the observed search result and validated for membership. Quality evaluation and grounded passage citations are later roadmap capabilities. Duration metadata currently records zero. Cancellation depends on cooperative adapters. Filesystem roots are operator-controlled trusted locations. Per-run files isolate concurrent requests but provide no durable conversation resume or production crash-recovery guarantee.

## Reset and history continuity

[RESET-0001](RESET-0001-evidence.md) remains recoverable from e4a25e9 with all 23 baseline files. Tests verify retired paths, ADR-0001 migration, and pending reset governance states. The external pre-reset ZIP is recorded historically and its availability has not been independently verified in this session. Existing ADR identifiers, prior findings, the package gate, and changelog history are preserved. The pre-existing untracked .gsd directory, milestone.lock, and state.json were retained outside these commits.
