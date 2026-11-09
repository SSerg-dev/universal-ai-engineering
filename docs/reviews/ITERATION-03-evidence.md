# ITERATION-03 Evidence

Iteration 3 introduces one controlled read-only MCP capability through the existing registry. It uses a local stdio child, a deterministic teaching model, explicit host consent, pinned modern negotiation, and validated correlated results. Node.js 24.22.1 is the verification runtime.

## Review state

| State | Status |
|---|---|
| Planned | Complete |
| Implemented | Complete |
| Architecturally Reviewed | Pending |
| Approved | Pending |
| Stable | Pending |

The user authorized continued roadmap implementation. Phase 1 approval is recorded independently. Passing checks does not imply Phase 2 or Phase 3 human approval.

## Implementation

[ADR-0005](../architecture/decisions/ADR-0005-mcp-boundary.md) defines the trust boundary and pinned protocol. [03-01](../../.planning/phases/UAOS-03-mcp-boundary/03-01-SUMMARY.md) records contracts before SDK installation. The [learner guide](../iterations/03-mcp-boundary.md) reproduces consent, CLI, HTTP, journal inspection, protocol bounds, and failure exercises.

The dependency [admission record](DEPENDENCIES-03.json) activates exactly @modelcontextprotocol/client@2.4.0 and @modelcontextprotocol/server@2.4.0. Their root pins, installed versions, and lockfile integrity are checked alongside all six original Phase 1 pins. Package selection was made under roadmap implementation authorization; it is not labeled an additional exact-package human approval.

## Requirement traceability

| Requirement | Executable evidence | Implementation status |
|---|---|---|
| MCP-01 | [Consent and adversarial boundaries](../../tests/unit/mcp-read-doc.test.ts), [real protocol/HTTP exchange](../../tests/integration/mcp.test.ts), [CLI](../../tests/smoke/cli.test.ts) | Implemented — review pending |

Project/core compilation and the original compatibility suites also verify CORE-02, CORE-03, CORE-04, and NFR-01 through NFR-03. The MCP SDK remains in adapters; the session port contains no transport types.

## Threat traceability

| Threat | Boundary and control | Evidence |
|---|---|---|
| T-03-01 | Exact host consent precedes session construction; annotations cannot authorize access | [Consent tests](../../tests/unit/mcp-read-doc.test.ts), [denied CLI](../../tests/smoke/cli.test.ts) |
| T-03-02 | Pinned era/revision/server/capability rejects legacy fallback and identity substitution | [Discovery tests](../../tests/unit/mcp-read-doc.test.ts), [legacy peer](../../tests/integration/mcp.test.ts) |
| T-03-03 | Bounded capability metadata and exact local schemas prevent substituted capability dispatch | [Metadata tests](../../tests/unit/mcp-read-doc.test.ts) |
| T-03-04 | Arguments, context, structured result, text consistency, requested ID, and receipt are validated | [Result tests](../../tests/unit/mcp-read-doc.test.ts), [contract tests](../../tests/contracts/mcp-contracts.test.ts) |
| T-03-05 | Cancellation propagates; finally closes sessions; outer registry bounds late returns | [Live cancellation](../../tests/integration/mcp.test.ts), [adapter cleanup](../../tests/unit/mcp-read-doc.test.ts), [registry deadlines](../../tests/unit/tool-registry.test.ts) |
| T-03-06 | Host IDs connect requests and receipts; versioned JSONL excludes protected text and raw exceptions | [Persisted MCP run](../../tests/integration/mcp.test.ts), [CLI journal](../../tests/smoke/cli.test.ts) |

## Verification

```sh
npm ci
npm run validate
```

Before documentation closure, full validate passed 193 tests in 19 files, project/core compilation, and build. The suite completed in 17.06 seconds. Six real MCP integration cases and eight CLI cases passed, including consent denial, modern exchange, legacy refusal, live cancellation, persisted correlation, and HTTP.

The [factory RED record](../../.planning/phases/UAOS-03-mcp-boundary/03-02-FACTORY-RED.json) captures the unsafe factory-error behavior before normalization was added. Original iteration tests remain green with the separate SDK admission active. Final closure passed 195 tests in 19 files in 16.95 seconds, project/core compilation, build, package integrity, internal links, and requirement/threat traceability checks.

During implementation review, the plan's phrase about forged annotations was corrected to match ADR-0005: annotations are untrusted data and cannot grant access or change host policy. Their presence alone is not a reason to reject an otherwise host-approved capability. This clarifies the existing decision rather than adding a new architecture.

## Findings and limits

The supplied server is a controlled teaching process. Discovery identity and correlation receipts validate this protocol exchange; they do not provide cryptographic remote attestation. Executable/root selection remains a trusted operator responsibility. No arbitrary external MCP server is admitted by this composition.

No raw peer failure is exposed. Adapter boundary codes are safe internal diagnostics; the registry maps thrown failures to TOOL_EXECUTION_FAILED and the public run reports TOOL_FAILURE. Overall cancellation/deadline retains its established vocabulary. Journals carry the safe registry outcome, not the peer's content or exception.

The registry deadline bounds asynchronous return, not synchronous CPU preemption or termination of arbitrary noncooperative substituted adapters. Session cleanup is exercised against the actual SDK. Every invocation starts a session and may also start a discovery probe process, which adds latency. There is no session pool, retry, or hidden fallback.

Document references are not passage-grounded citations. PostgreSQL/pgvector, semantic retrieval, state, UI, evaluation gates, and consequential-action approval remain later roadmap capabilities.
