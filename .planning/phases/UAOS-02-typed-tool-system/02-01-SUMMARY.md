---
phase: UAOS-02-typed-tool-system
plan: "01"
status: complete
completed: 2026-11-09
requirements-covered: [TOOL-01, TOOL-02, NFR-01, NFR-02]
---

# 02-01 Registry Contract Evidence

The [registry ADR](../../../docs/architecture/decisions/ADR-0004-typed-tool-registry.md) precedes registry and loop integration. Strict schemas define invocation, descriptors, observations, seven typed failures, generic model actions, and read_doc input/output. ModelPort and JournalPort now have defaulted type parameters so Phase 1 callers retain their existing contracts.

Version 1.1 events admit validated registered tool names and tool error codes while excluding raw arguments, results, questions, documents, answers, stacks, and exception causes. The original version 1.0 schema still rejects version 1.1 and retains its literal search_docs boundary. The JSONL union schema is prepared for the next plan.

## Verification

Node.js 24.22.1 passed the following commands with the existing accepted lockfile.

```sh
npm test -- tests/contracts/tool-contracts.test.ts tests/contracts/schemas.test.ts tests/contracts/agent-events.test.ts
npm run typecheck
npm run typecheck:core
npm run validate
```

Focused verification passed 29 tests in three files. Full validation passed 105 tests in 14 files, strict project typecheck, explicit core compilation, and build. The full suite includes the original 90-test Phase 1 baseline. No dependency was added or updated.

## Next

02-02 implements registry policies, bounded cancellation-aware invocation, shared loop integration, the second tool, iteration selection, compatibility tests, the teaching guide, and review evidence. TOOL-01 and TOOL-02 implementation coverage remains pending until those behaviors run end to end.

Architectural review: Pending

Approved: Pending

Stable: Pending
