# ITERATION-02 Evidence

The second iteration adds typed registration, invocation policy, bounded asynchronous validation/execution, and a second controlled documentation tool. Phase 1 runs through its existing facade, while both iterations use the same state machine. Verification uses Node.js 24.22.1 and the previously accepted dependency lock.

## Review state

| State | Status |
|---|---|
| Planned | Complete |
| Implemented | Complete |
| Architecturally Reviewed | Pending |
| Approved | Pending |
| Stable | Pending |

The user's [Phase 1 approval](ITERATION-01-approval.json) authorized continuation. This record reports the Phase 2 implementation independently. No Phase 2 human approval is inferred from passing tests.

## Implementation

[ADR-0004](../architecture/decisions/ADR-0004-typed-tool-registry.md) defines the registry, seven typed outcomes, permission order, bounded tool deadline, versioned journal, and compatibility facades. [02-01](../../.planning/phases/UAOS-02-typed-tool-system/02-01-SUMMARY.md) records verified contracts before registry integration.

The [learner guide](../iterations/02-typed-tool-system.md) reproduces search_docs and read_doc through CLI and HTTP, source-safe JSONL, missing document behavior, explicit iteration selection, and failure exercises. Iteration 1 remains the default. Iteration 2 is selected with UAOS_ITERATION=2 in CLI or iteration 2 in startServer composition.

## Requirement traceability

| Requirement | Executable evidence | Implementation status |
|---|---|---|
| TOOL-01 | [Third tool through unchanged loop](../../tests/integration/typed-tools.test.ts), [registry construction](../../tests/unit/tool-registry.test.ts) | Implemented — review pending |
| TOOL-02 | [Validation, permission, timeout, cancellation, and execution failures](../../tests/unit/tool-registry.test.ts), [public failure mapping](../../tests/integration/typed-tools.test.ts) | Implemented — review pending |

Core independence, replaceable ports, safe journaling, and public CLI/HTTP compatibility are additionally checked by the unchanged Phase 1 baseline and the expanded CLI/HTTP integration coverage.

## Threat traceability

| Threat | Boundary and control | Evidence |
|---|---|---|
| T-02-01 | Duplicate and substituted registrations fail before unsafe dispatch | [Registry tests](../../tests/unit/tool-registry.test.ts) |
| T-02-02 | Allow-list denial precedes schema callbacks and handler work | [Permission tests](../../tests/unit/tool-registry.test.ts) |
| T-02-03 | Unknown arguments/results cross async schemas and safe source projection | [Contract tests](../../tests/contracts/tool-contracts.test.ts), [validation tests](../../tests/unit/tool-registry.test.ts) |
| T-02-04 | First cancellation origin, bounded return, late-result isolation, and cleanup | [Deadline tests](../../tests/unit/tool-registry.test.ts), [concurrent runs](../../tests/integration/typed-tools.test.ts) |
| T-02-05 | Versioned strict metadata excludes question/document/output/exception content | [Version contracts](../../tests/contracts/tool-contracts.test.ts), [JSONL integration](../../tests/integration/typed-tools.test.ts) |
| T-02-06 | Shared loop and explicit iteration selection preserve the first runnable version | [CLI children](../../tests/smoke/cli.test.ts), [port compatibility](../../tests/contracts/ports.test.ts) |

## Verification

```sh
npm run typecheck
npm run typecheck:core
npm test -- tests/contracts/tool-contracts.test.ts tests/unit/tool-registry.test.ts tests/integration/typed-tools.test.ts
npm run validate
```

Before documentation closure, full validate passed 142 tests in 16 files, project typecheck, core-only compilation, and build. This includes real TCP tests for both iteration selections, cancellation, and CLI child processes. Final closure passed 144 tests in 16 files, project typecheck, explicit core compilation, and build. The full suite completed in 9.68 seconds; the documentation integrity suite passed seven checks. No dependency, package version, or lockfile was changed.

The initial registry RED check observed a missing ToolRegistry export before implementation. Its [record](../../.planning/phases/UAOS-02-typed-tool-system/02-02-REGISTRY-RED.json) identifies the failing assertion. Existing Phase 1 loop tests were green before and after extraction into the shared generic loop. New end-to-end scenarios prove registry behavior, caller isolation, and a third registration.

## Findings and limits

Tool deadlines bound asynchronous invocation return, including never-settling handlers or refinements. They do not preempt synchronous CPU work or forcibly stop a noncooperative handler's underlying side effects. The supplied tools are read-only operations on a controlled startup snapshot. Model and journal ports must honor AbortSignal.

A bad invocation timeout policy fails closed as TOOL_EXECUTION_FAILED with no handler call. Raw Zod issues and thrown callback messages remain private. Tool-specific diagnostics are typed in the registry and metadata journal, while the public run contract retains the Phase 1 error vocabulary.

The deterministic model chooses tools through the documented teaching question convention. Source IDs remain controlled document references. MCP negotiation, remote metadata, semantic retrieval, durable memory, and approval workflows are deferred to their roadmap phases.
