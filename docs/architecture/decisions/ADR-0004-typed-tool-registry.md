# ADR-0004 — Typed Tool Registry

- Status — Selected for Phase 2 implementation; final architectural review pending
- Date — 2026-11-09
- Decision owner — Project Founder through authorization to continue the roadmap
- Extends — ADR-0003

## Scope and compatibility

Phase 2 adds a typed registry and a second local read-only documentation tool. Phase 1 remains runnable through its existing createRuntime, model protocol, public result, CLI behavior, and version 1.0 event schema. Phase 2 exposes createToolRuntime and explicit iteration 2 selection in CLI/server composition. Both iterations share the agent loop algorithm and inbound adapters.

The successful loop still permits two model requests and exactly one tool invocation. Registering a third tool changes registry composition and a model decision, with no loop algorithm edits. Phase 2 introduces no provider SDK, dependency, remote service, retry, durable memory, or approval workflow.

## Registration and invocation

Each tool definition owns a stable name, description, input schema, output schema, handler, and optional projection to public document source references. Names match a bounded lower-case identifier. Duplicate names are rejected before the registry becomes usable. The registry snapshots registrations and exposes immutable descriptors.

A model action contains a tool name and unknown arguments. Registry invocation resolves the tool, checks an explicit per-invocation allow-list, validates and normalizes arguments, invokes the handler once, validates its output, and validates projected source references. Permission checking precedes schema processing and handler invocation. Untrusted errors are normalized without raw exception text. Phase 1 retains its strict literal search_docs action schema.

Input/output validation uses safeParseAsync so defaults, transforms, and asynchronous refinements are supported. One per-invocation deadline covers validation and execution. The first observed cancellation origin fixes timeout or cancellation. Every awaited boundary checks the invocation signal before scheduling later work. A bounded promise race returns even if a handler ignores cancellation, and late settlement cannot change the returned outcome or create a later loop effect. Side-effect cancellation inside a noncooperative handler remains that handler's responsibility. Timer and abort listeners are cleaned in finally.

The default Phase 2 tool deadline is 1000 ms within the existing 5000 ms run deadline. Allowed tool names and limits belong to operator composition. Unknown tools and denied tools never run. Retries are disabled. Both supplied tools are read-only and operate on the controlled fixture snapshot loaded at startup.

## Typed outcomes

| Code | Meaning |
|---|---|
| TOOL_NOT_FOUND | The named tool is absent from the registry |
| TOOL_PERMISSION_DENIED | Invocation policy does not allow the tool |
| TOOL_INPUT_INVALID | Arguments fail the registered input schema |
| TOOL_OUTPUT_INVALID | Output or projected source references fail validation |
| TOOL_TIMEOUT | The invocation deadline wins |
| TOOL_CANCELLED | The caller signal wins |
| TOOL_EXECUTION_FAILED | The handler or an unexpected validation callback fails |

Success returns a ToolObservation containing toolName, validated output, and validated source references. Failure returns the discriminated code only. Developer callers receive these typed outcomes. The public CLI/HTTP run result keeps ADR-0003's shape and codes. A tool-specific failure maps to TOOL_FAILURE and is diagnosable through the version 1.1 tool.failed metadata. A run-wide cancellation or deadline continues to map to CANCELLED or TIMEOUT.

## Tools and model

search_docs reuses the Phase 1 search adapter and schemas. read_doc takes a documentId and returns a document with ID, title, and content, or document null for a missing ID. Lookup uses the already loaded document snapshot. Model arguments never select a filesystem path. The read tool projects its single returned document as a source reference.

The deterministic Phase 2 model selects read_doc for a question beginning with doc: followed by a document ID. Other questions select search_docs. Its second action uses the validated observation and emits source IDs from that observation. An explicit iteration selector keeps the original Phase 1 teaching scenario reproducible.

## Journal and core boundaries

The original AgentEventEnvelopeSchema continues to validate only version 1.0. A new registered-tool schema validates version 1.1, preserving the event vocabulary, sequence, safe payload fields, and terminal semantics. Tool names become validated registry identifiers and tool.failed can include toolErrorCode. The JSONL adapter validates the union of supported versions. It retains fail-closed writes and one file per run.

ModelPort and JournalPort gain defaulted type parameters so existing callers keep their current types. A shared generic loop receives the action/event schemas and tool execution boundary through narrow dependencies. The Phase 1 facade binds the existing search port; the Phase 2 facade binds the registry. Domain and application remain free of filesystem, transport, and provider imports.

## Acceptance and review

The [Phase 2 plans](../../../.planning/phases/UAOS-02-typed-tool-system/02-01-PLAN.md) define contract-first execution. Registry tests must reject duplicate registration, unknown/denied tools, invalid arguments/results, timeout/cancellation, late completions, and unsafe error disclosure. Integration tests must prove unchanged Phase 1 behavior, both Phase 2 tools through one loop, and a third tool added without loop edits.

Implementation, architectural review, user approval, and stability remain separate. The existing package approval authorizes the unchanged exact dependency set.

## API references

Zod documents asynchronous parsing for schemas with async refinements or transforms. This supports using safeParseAsync at the registry boundary. [Zod basics](https://zod.dev/basics)

Node.js documents AbortSignal reasons, composition, and listener cleanup. The registry uses tagged cancellation origins and finally-based cleanup with those primitives. [Node.js 24 globals](https://github.com/nodejs/node/blob/v24.x/doc/api/globals.md)
