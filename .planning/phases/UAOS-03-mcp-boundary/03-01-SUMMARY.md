---
phase: UAOS-03-mcp-boundary
plan: "01"
status: complete
completed: 2026-11-09
requirements-covered: [MCP-01, NFR-01, NFR-02, NFR-03]
---

# 03-01 MCP Contract Evidence

[ADR-0005](../../../docs/architecture/decisions/ADR-0005-mcp-boundary.md) selects one controlled stdio read_doc capability, explicit host consent, pinned modern negotiation, independent schema validation, correlation receipts, bounded protocol data, and finally-based session close. The [dependency record](../../../docs/reviews/DEPENDENCIES-03.json) selects the official client/server SDK 2.4.0 for protocol 2026-07-28 after matching npm names, versions, repository, Node compatibility, and integrity metadata. Installation remains planned.

Strict core schemas define positive consent for the exact server/tool, modern discovery, opaque run/call IDs, fixed read requests, and seven safe MCP boundary error codes. McpSessionPort returns unknown protocol values and contains no SDK imports. Optional call context propagates from the loop only when registered-run composition opts in, preserving existing handler arity and in-memory identifier support.

## Verification

Node.js 24.22.1 passed the following commands before SDK installation.

```sh
npm test -- tests/contracts/mcp-contracts.test.ts tests/integration/iteration-evidence.test.ts
npm run validate
```

Focused verification passed 15 tests in two files. Full validation passed 153 tests in 17 files, strict project/core compilation, and build. Additional compatibility coverage confirms that default Phase 2 handlers still receive two arguments and previously supported in-memory ID formats remain valid. The manifest and lockfile are unchanged.

## Next

03-02 activates the selected dependencies and implements the MCP adapter, SDK session, controlled fixture server, explicit iteration 3 and consent selection, adversarial tests, real CLI/HTTP exchanges, teaching documentation, and evidence. The user's ongoing roadmap authorization covers this implementation. Phase 2 human review and approval remain pending independently.

Architectural review: Pending

Approved: Pending

Stable: Pending
