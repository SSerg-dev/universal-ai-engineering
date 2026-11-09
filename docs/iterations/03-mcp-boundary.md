# Iteration 3 — One MCP Boundary

Iteration 3 moves read_doc across a local process boundary. The host registers only mcp_read_doc, checks operator consent, connects to the bundled documentation server over stdio, validates its capability, and returns the document through the existing typed loop. The deterministic model and exactly-one-tool success rule remain the teaching scenario.

Use Node.js 24 and build the committed workspace. The SDK packages and lockfile are pinned; installation needs package-registry access, while the runnable fixture requires no service account or model provider.

```powershell
npm ci
npm run build
$env:UAOS_ITERATION = '3'
$env:UAOS_MCP_CONSENT = 'read_doc'
npm run uaos -- ask 'doc:execution-journal'
npm run uaos -- ask 'doc:missing'
```

The first command returns the controlled document and its source reference. The missing ID returns a successful explanation that the document is absent. Both successful runs report modelCalls=2 and toolCalls=1. The source identifies a document; passage-grounded citations begin in Iteration 4.

The host owns the executable, bundled server path, and fixture root. The server path resolves relative to the compiled module, so the CLI also works from another directory when explicit fixture/journal roots are configured. A document ID never becomes a command argument or filesystem path.

## Exercise consent

```powershell
Remove-Item Env:UAOS_MCP_CONSENT -ErrorAction SilentlyContinue
npm run uaos -- ask 'doc:execution-journal'
$LASTEXITCODE
```

The denied run exits with 1 and public TOOL_FAILURE. Its tool.failed event carries TOOL_PERMISSION_DENIED. The registry prevents the MCP handler from running, and the adapter independently requires an exact grant before constructing a session. Consent comes from operator composition, not the question, model output, server description, or annotations.

Set UAOS_ITERATION to 1 or 2 to reproduce the preceding iterations. An unset selector chooses 1. Consent is specifically read_doc for the fixed uaos-docs server; this slice has no dynamic server registration.

## Start HTTP

HTTP selects the same runtime using composition options. The request body accepts the established question contract; it cannot authorize MCP access.

```powershell
node --input-type=module -e "import { startServer } from './dist/src/composition/server.js'; await startServer({ iteration: 3, mcpConsent: 'read_doc' });"
```

```powershell
$result = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/api/v1/agent-runs' -ContentType 'application/json' -Body '{"question":"doc:execution-journal"}'
$result.usage
Get-Content -LiteralPath (Join-Path '.uaos/journal' ($result.runId + '.jsonl'))
```

Starting iteration 3 without mcpConsent leaves the capability denied. HTTP status and result fields use the existing public vocabulary. MCP negotiation, metadata, result, and transport errors become safe tool failures; raw peer messages and stacks are excluded from public output and journal records.

## Follow the boundary

[ADR-0005](../architecture/decisions/ADR-0005-mcp-boundary.md) pins protocol 2026-07-28 and the official client/server SDK 2.4.0. The SDK handles modern discovery and per-request protocol metadata. The host separately verifies the expected server name/version, tools capability, and exact local input/output JSON schemas. A legacy-only server fails negotiation without fallback.

The outbound [adapter](../../src/adapters/outbound/mcp-read-doc.ts) receives only a narrow [session port](../../src/application/ports/mcp-session-port.ts). SDK imports live in infrastructure adapters. The application still dispatches a registered tool through the shared state machine.

Each invocation owns a fresh session. Before the remote call, the host validates arguments and filename-safe runId/callId values. It sends those IDs under org.uaos/runId and org.uaos/callId in request metadata. The controlled server echoes them in its response. Missing or mismatched receipts reject the result.

The accepted response has structured ReadDocOutput, exactly one JSON text rendering of the same value, a complete non-error outcome, and the requested document ID or document null. Contradictory, malformed, oversized, or mismatched results stop before the second model request. Other advertised tools remain inaccessible. Server annotations and descriptions never become permission or model instructions.

## Inspect bounds and cleanup

| Boundary | Limit |
|---|---|
| Whole run | 5000 ms |
| MCP tool, including validation | 4000 ms |
| SDK connect/list/call request | 1000 ms each |
| Discovery probe | 1000 ms, zero retries |
| Tool listing | One page, at most 16 tools |
| Serialized metadata/result | 64 KiB each |
| Stdio read buffer | 128 KiB |

Caller cancellation propagates through SDK operations. The adapter closes its session in finally on success, failure, or cancellation; the SDK owns child shutdown. Modern protocol discovery may use a separate probe child before the session child. A fresh invocation pays that startup cost.

The registry bounds asynchronous return even when a handler ignores cancellation. It cannot preempt synchronous JavaScript work or guarantee termination of arbitrary substituted noncooperative adapters. The supplied SDK transport manages its own child lifecycle. Model and journal ports retain their cooperative signal contract.

Successful runs persist eight version 1.1 events. tool.requested and tool.succeeded share the generated callId and mcp_read_doc alias. The correlation receipt links the protocol operation to those host events. The journal stores metadata, source IDs, counts, order, and safe outcomes; questions, document text, arguments, response content, and answers are excluded. Child stderr is discarded and stdout is reserved for MCP.

## Verify and investigate

```powershell
npm test -- tests/contracts/mcp-contracts.test.ts tests/unit/mcp-read-doc.test.ts
npm test -- tests/integration/mcp.test.ts tests/smoke/cli.test.ts
npm run validate
```

The tests include a real modern client/server exchange, legacy refusal, live connection cancellation, CLI from another directory, HTTP parity, and adversarial injected sessions. Change a schema, substitute another document ID, mismatch a receipt, and return contradictory text/structured output. Identify the point of rejection and prove that the later model call cannot consume rejected data.

Read the [evidence record](../reviews/ITERATION-03-evidence.md) before review. Implementation, architectural review, human approval, and stability are separate states. The [dependency admission](../reviews/DEPENDENCIES-03.json) records these SDK additions separately from the original human-accepted workspace pins.
