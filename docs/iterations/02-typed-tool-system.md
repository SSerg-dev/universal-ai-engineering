# Iteration 2 — Typed Tools

Iteration 2 registers search_docs and read_doc behind a shared dispatcher. Each definition provides schemas, a handler, and an optional projection to document source references. One agent loop serves both runnable iterations. Registration changes the available capability while the state machine still enforces exactly one successful tool call before the final answer.

Use the Node.js 24 setup from the [first walkthrough](01-typed-agent-loop.md). Install the committed dependencies once, then build and select the second iteration explicitly.

```powershell
npm ci
npm run build
$env:UAOS_ITERATION = '2'
npm run uaos -- ask 'execution journal'
npm run uaos -- ask 'doc:execution-journal'
npm run uaos -- ask 'doc:missing'
```

The first question selects search_docs and returns matching excerpts. The doc: prefix selects read_doc with the remaining text as documentId. The read tool returns a complete controlled document or document null for a missing ID. A missing document produces a successful answer explaining the absence. All successful runs report modelCalls 2 and toolCalls 1.

Run the original teaching behavior by setting UAOS_ITERATION to 1. An unset selector also chooses iteration 1. An unsupported value produces a sanitized startup failure with exit code 1.

## Start HTTP

From a second terminal at the repository root, select iteration 2 in server composition.

```powershell
node --input-type=module -e "import { startServer } from './dist/src/composition/server.js'; await startServer({ iteration: 2 });"
```

```powershell
$result = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/api/v1/agent-runs' -ContentType 'application/json' -Body '{"question":"doc:execution-journal"}'
$result
$result.usage
Get-Content -LiteralPath (Join-Path '.uaos/journal' ($result.runId + '.jsonl'))
```

The endpoint and result fields match iteration 1. CLI and HTTP share the selected runtime and use case. Generated run IDs identify independent executions. Real-socket tests cover successful body completion, client disconnect, and iteration 2 startup.

## Follow registration and dispatch

The [registry](../../src/application/tool-registry.ts) snapshots tool descriptors and rejects duplicate names before execution. Names are bounded lower-case identifiers. Invocation checks the caller signal, validates the generic envelope, resolves the name, verifies an explicit allow-list, and validates invocation policy. Permission is checked before argument refinements or handler code can run.

Arguments enter the registered schema as unknown values. safeParseAsync applies defaults, transforms, and async refinements. The handler receives the parsed input. Its unknown result crosses the output schema before source projection. Successful observations contain the tool name, validated output, and validated sources. The registry also rejects substituted observations claiming another tool's identity.

The following definition illustrates a third capability. The [integration test](../../tests/integration/typed-tools.test.ts) runs a test-only third tool through the existing loop.

```typescript
const tool = defineTool({
  name: "count_characters",
  description: "Count Unicode code points",
  inputSchema: z.strictObject({ text: z.string() }),
  outputSchema: z.strictObject({ count: z.number().int().nonnegative() }),
  execute: async ({ text }) => ({ count: Array.from(text).length }),
});
const registry = new ToolRegistry([tool]);
```

Register the definition, include its name in the operator allow-list, and have a model emit a call_tool action with that name. The common loop receives the dispatcher through createRegisteredRunAgentUseCase. Its model port carries a typed ToolObservation on the second request. The default deterministic model selects the two built-in tools through the teaching question conventions above.

## Distinguish tool outcomes

| Outcome | Trigger |
|---|---|
| TOOL_NOT_FOUND | No registration matches the name |
| TOOL_PERMISSION_DENIED | The invocation allow-list denies the name |
| TOOL_INPUT_INVALID | Envelope or registered arguments fail validation |
| TOOL_OUTPUT_INVALID | Output, source projection, or returned tool identity is invalid |
| TOOL_TIMEOUT | The tool deadline wins |
| TOOL_CANCELLED | Caller cancellation wins |
| TOOL_EXECUTION_FAILED | Handler, callback, or invocation policy fails unexpectedly |

Unknown, denied, and invalid-input calls execute no handler. Output failures stop before the second model request. Exceptions become codes without raw messages or stacks. There are no automatic retries.

The operator default gives a tool 1000 ms inside the run's 5000 ms deadline. Input validation, handler execution, and output validation share that tool deadline. The first observed tagged cancellation origin determines timeout or cancellation. Timers and listeners are cleaned on every return path.

The registry returns on timeout even if an async handler ignores its signal. A late settlement cannot change the returned outcome or trigger source projection or a later model request. Underlying noncooperative work can continue until it settles. JavaScript synchronous CPU work cannot be preempted by a timer. The supplied tools are small read-only operations on the loaded snapshot. Model and journal adapters retain their cooperative cancellation contract.

## Inspect journal compatibility

Iteration 1 continues to emit schemaVersion 1.0. Iteration 2 emits 1.1 with the same event vocabulary and ordering. Version 1.1 permits validated tool names and a toolErrorCode on tool.failed. The JSONL adapter validates either supported version. AgentEventEnvelopeSchema remains strict for the original version; ExecutionEventEnvelopeSchema reads the union.

Tool-specific failures retain public TOOL_FAILURE and HTTP 502. Their distinct developer-facing code appears in the version 1.1 failure event. Overall cancellation and timeout keep the existing CANCELLED/499 and TIMEOUT/408 behavior. Public result fields and CLI exit behavior remain compatible.

Journal payloads contain safe metadata, counts, source IDs, and outcome codes. Arguments, documents, outputs, questions, full answers, and exception details are excluded. Required append failures stop later model/tool work as JOURNAL_FAILURE.

The read adapter reuses the Markdown snapshot loaded at startup. A documentId is an in-memory lookup key. A path-shaped value such as ../../package.json returns document null. It never selects a filesystem path or triggers another file read.

## Verify the iteration

```powershell
npm test -- tests/contracts/tool-contracts.test.ts
npm test -- tests/unit/tool-registry.test.ts tests/integration/typed-tools.test.ts
npm test -- tests/smoke/cli.test.ts
npm run validate
```

Reproduce a permission denial before schema callbacks, timeout during asynchronous output validation, a late handler completion, and cancellation of one concurrent run. Explain why each rejected operation produces its particular outcome and which event proves that no later effect ran.

The [evidence record](../reviews/ITERATION-02-evidence.md) links the requirements, tests, limits, and review state. Source references identify controlled documents. Grounded passage citations, remote MCP capabilities, and durable state arrive in later phases.
