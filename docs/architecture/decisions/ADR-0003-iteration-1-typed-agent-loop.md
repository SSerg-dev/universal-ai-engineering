# ADR-0003: Iteration 1 Typed Agent Loop

**Status:** Selected for Phase 1 implementation. Formal architectural review and phase approval are tracked separately.

## Scope

One run answers a question using one fixed section of a local documentation fixture. Node CLI, Fastify HTTP, and the offline acceptance suite use the same application use case and deterministic model. The reference question is “How do I check the installed Node.js version?” and the expected answer is `Run node --version.` The model derives that answer from the tool observation. A real model provider for a manual demo is a separate decision.

Phase 1 excludes a tool registry, retries, MCP, RAG, durable memory, UI, and multi-agent coordination.

## Dependencies

One TypeScript package on Node.js 24. The domain owns schemas, types, and pure state transitions. The application owns the use case, effect orchestration, and ports. Adapters implement model, tool, journal, CLI, and HTTP boundaries. Composition wires dependencies. Domain imports only domain modules and Zod. Application imports only application and domain modules and uses platform-neutral globals. An automated test enforces these rules.

## Contracts

| Contract | Semantics |
|---|---|
| Run input | Object with a nonblank, trimmed `question`. Validate unknown input before starting a run. |
| Model action | Discriminated union: `call_tool` with empty arguments or `answer` with nonblank text. Validate unknown output with Zod. |
| Tool observation | A nonblank `text` field containing the fixed section. Validate tool input before invocation and validate its output before reuse. |
| Run state | Awaiting the tool or holding its validated observation. Per-run state lives in memory. |
| Run outcome | `answered` with text or `failed` with a stable code. A started run carries a generated `runId` and a `journalStatus` of `complete` or `incomplete`. Invalid input returns `INVALID_INPUT` before a run is started. |
| Ports | `Model.nextAction` and `Tool.execute` receive an `AbortSignal`. `Journal.append` receives a typed event. The host supplies run ID and time sources. |

## Transitions and termination

| State | Model action | Result |
|---|---|---|
| Awaiting tool | `call_tool` | Invoke the single tool. A valid observation moves the run to the next state. |
| Awaiting tool | `answer` | `TOOL_REQUIRED` |
| Holding observation | `answer` | `answered` |
| Holding observation | `call_tool` | `TOOL_ALREADY_CALLED`, with no second invocation |

A step is one model request. Check the step budget before each request. The default is two; a budget of one exercises `LIMIT_EXCEEDED`. Model and tool exceptions map to `MODEL_FAILED` and `TOOL_FAILED`. Invalid outputs or arguments map to `INVALID_MODEL_ACTION`, `INVALID_TOOL_INPUT`, or `INVALID_TOOL_OUTPUT` as applicable. Tool arguments are validated separately from the model action envelope.

The loop has one configurable deadline for model and tool execution, with a default of 5 seconds for the local demo. Caller cancellation and deadline expiry share a signal. The first signal observed fixes `CANCELLED` or `TIMEOUT`. Stop scheduling effects after the terminal outcome and ignore late port settlements. Journal writes run outside the loop deadline.

## Journal

The JSONL adapter writes one object per line. Events carry an opaque `runId`, increasing per-run `seq`, ISO timestamp, and event type. Terminal failures carry a stable error code. Events cover run start, model request and validated response, tool start and validated observation, and one terminal result. The event schema admits no question, document, answer, arguments, or raw exception text.

A write failure preserves the domain outcome and exposes `journalStatus: incomplete` to the caller. Stop writing for that run after the first failed append. A failed journal can contain a partial trace. A healthy journal contains one terminal event and the full ordered trace. CLI and HTTP expose the same outcome and journal status.

## Acceptance

See [Phase 1 acceptance](../../../.planning/phases/01-typed-agent-loop/01-01-ACCEPTANCE.md).
