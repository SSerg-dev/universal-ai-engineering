---
phase: UAOS-02-typed-tool-system
plan: "02"
status: complete
completed: 2026-11-09
requirements-covered: [TOOL-01, TOOL-02, CORE-02, CORE-03, CORE-04, NFR-01, NFR-02, NFR-03]
---

# 02-02 Typed Tool Implementation Evidence

The [Iteration 2 walkthrough](../../../docs/iterations/02-typed-tool-system.md) runs search_docs and read_doc through the shared typed agent loop, CLI, HTTP, and safe version 1.1 JSONL. Phase 1 remains independently runnable through its original facade and version 1.0 event contract.

## Delivered

- ToolRegistry and defineTool enforce duplicate rejection, immutable descriptors, caller allow-lists, async input/output schemas, safe projected sources, seven typed outcomes, and bounded asynchronous execution.
- Registry deadlines cover schema refinements and handlers, preserve the first cancellation origin, clean listeners/timers, and isolate late settlements and concurrent callers.
- createAgentLoop owns one orchestration algorithm. createRunAgentUseCase binds the Phase 1 search contract. createRegisteredRunAgentUseCase binds generic registered actions and version 1.1 diagnostics.
- createToolRuntime wires the two read-only tools against the controlled startup snapshot. createIterationRuntime and the CLI/server selector preserve the default iteration 1 behavior and explicitly enable iteration 2.
- JsonlJournal accepts the supported version union without broadening the original version 1.0 schema. Public result fields, status mapping, and CLI exit semantics are preserved.

## Verification

With Node.js 24.22.1 first on PATH, the following commands pass.

```sh
npm test -- tests/unit/tool-registry.test.ts tests/integration/typed-tools.test.ts tests/smoke/cli.test.ts
npm run validate
```

Full closure passed 144 tests in 16 files, project typecheck, explicit core-only compilation, and build. The suite completed in 9.68 seconds. Coverage includes the original Phase 1 baseline, a third tool registered without loop edits, async schema transforms, forbidden access before callbacks, invalid outputs, invocation deadlines, late settlements, per-run cancellation isolation, journal fail-closed behavior, actual CLI children, and real TCP server composition.

The [evidence record](../../../docs/reviews/ITERATION-02-evidence.md) maps both typed-tool requirements and six trust boundaries to executable checks. No dependency or lockfile changed. The [initial RED record](02-02-REGISTRY-RED.json) preserves the failing registry assertion before implementation.

## Decisions and Limits

ADR-0004 selected read_doc as the second controlled read-only tool, explicit iteration selection, a 1000 ms invocation deadline inside the 5000 ms run deadline, and version 1.1 diagnostics. Invalid timeout policy fails closed as TOOL_EXECUTION_FAILED. The public run error vocabulary remains unchanged while detailed tool codes appear in typed outcomes and journal metadata.

Synchronous CPU work cannot be preempted by the timer. A noncooperative handler can continue underlying work after the registry returns. Model/journal cancellation remains cooperative, and the supplied tools operate on a small trusted startup snapshot. These limits are explicit in the guide and evidence.

Architectural review: Pending

Approved: Pending

Stable: Pending

Phase 3 planning may now define the MCP adapter, pinned protocol/SDK, consent, negotiation, and audit boundary using the established registry. Human review and approval of Phase 2 remain separate.
