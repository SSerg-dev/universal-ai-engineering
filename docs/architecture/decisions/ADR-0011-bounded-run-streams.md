# ADR-0011 — Bounded Reconnectable Run Streams

- Status — Selected for Phase 8 implementation; architectural review pending
- Date — 2026-11-15
- Extends — ADR-0009/0010; content streaming is separate from safe telemetry and required evidence

## Scope and transport

Iteration 8 adds one explicit content-bearing protocol and a local same-origin streaming inspector. It delegates execution to the same observed grounded use case; it does not fork the agent loop. Earlier CLI/API/state/evaluation/inspection entry points remain available and iteration 1 remains the default.

POST /api/v1/stream-runs accepts the bounded question and returns 202 with a generated run ID. GET /api/v1/stream-runs/:runId/events returns server-sent events with typed JSON data and IDs of runId:sequence. POST /api/v1/stream-runs/:runId/cancel requests cancellation; the primary outcome resolves the race with success. Request/route/cursor validation precedes effects. A supplied browser Origin must match the request origin; cross-origin requests fail STREAM_ORIGIN_DENIED before create/cancel/subscribe effects. JSON errors expose only fixed stream boundary codes/messages. Diagnostics stay on the local CLI.

The SSE transport adapter owns response headers, socket writes, cleanup, and heartbeats. The core owns ordering, replay bounds, cancellation state, retention, and terminal exclusivity behind ports. Fastify hijack/raw response handling is confined to its adapter. There is no SDK/framework/Node filesystem import in domain/application.

## Event and privacy contract

Strict stream-1.0 envelopes carry runId, sequence, timestamp, type, and a discriminated payload. Types are run.started, run.progress, tool.started, tool.completed, tool.failed, answer, run.completed, run.cancelled, and run.failed. A stream starts at sequence 1, has one start, and ends with exactly one terminal event. Progress/tool metadata projects only actually persisted required events. The broker creates its start before execution; it does not invent persisted journal evidence. Successful answers are emitted only after the grounded primary result validates, immediately before run.completed. No token-by-token generation or artificial delay is claimed for the deterministic model.

The answer event carries the validated grounded success result, including exact citations/quotes, sources, and usage. This protocol intentionally carries answer/document-derived content to the user. It is never written to metadata-only telemetry/required JSONL. Questions are not replay events, and tool arguments/results, raw exception text, credentials, and memory content have no frame fields. UI rendering uses text interpolation; no HTML/Markdown execution from model output.

## Replay, retention, and resources

Per process: at most 32 retained runs, at most eight underlying active executions, and four subscribers per run. Each run retains at most 24 validated frames and 262144 serialized UTF-16 code units; individual frames are capped at 32768 code units. These are explicit character bounds (UTF-8 may require more bytes), not token limits. Oversized/unrepresentable events terminate the stream with a fixed failure rather than copying raw data. Terminal capacity is reserved. Retained content expires five minutes after settlement on monotonic-clock access; under capacity pressure the oldest settled inactive run may be evicted earlier. Process restart loses replay. This is bounded in-memory reconnect, not durable event recovery or crash resume.

SSE reconnect supplies Last-Event-ID as runId:sequence; an optional after cursor supports the fetch client. Cursor disagreement, another run ID, malformed/negative/future values, and missing/expired runs fail explicitly. A known cursor replays only later frames, in order; an already consumed terminal ends the response. Disconnect removes the subscriber but does not cancel execution, allowing reconnect. Explicit cancellation aborts the per-run controller; repeated cancellation is idempotent, and already settled runs remain unchanged.

Publishing never awaits a subscriber or network. A throwing subscriber is detached. The HTTP adapter closes and detaches a client when its bounded write buffer applies backpressure, instead of accumulating an unbounded application queue; replay permits recovery. Heartbeats carry no content. Listener/timer cleanup occurs on terminal, disconnect, and application shutdown. The client validates every envelope, identity, and sequence, ignores exact duplicates only, rejects conflicts/gaps/events after terminal, and makes bounded reconnect attempts using its last accepted cursor.

The host executor inherits the existing five-second primary budget. A six-second stream watchdog aborts and publishes one TIMEOUT failure if an unexpected executor never settles. Its underlying active slot is retained until actual settlement, so repeated timed-out noncooperative work cannot bypass the eight-execution limit. Late events/results cannot reopen or change a terminal stream. Closing the broker denies new runs and aborts outstanding work. Watchdog expiry does not claim arbitrary underlying work has stopped.

Composition accepts a host-owned StreamExecutionPort override for deterministic integration/fault testing, defaulting to the extracted observed grounded execution adapter. It is not an environment/request/model-controlled fault switch; tests can delay execution and still delegate cancellation to the actual engine without duplicating the loop.

## Boundaries and pending choices

This is a trusted local course server, with loopback as the default and no CORS wildcard, public authentication, multi-tenant access, distributed replay, retrying actions, persistent content event store, or production SLO claim. Run IDs are correlation identifiers, not an authentication mechanism. A reconnect does not re-execute a question. Hosting remotely would require an explicit authorization/retention design outside this slice.

Angular/Tailwind UI design and compatible pinned toolchain admission are a separate step before adding those dependencies. Human architecture review/approval/stability remain pending.

## Primary references

[Fastify reply](https://fastify.dev/docs/latest/Reference/Reply/) documents hijack and the raw response boundary. [SSE framing](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) documents id/data framing and reconnect identifiers. All execution/replay/privacy/resource policies above are course decisions, not guarantees inferred from those APIs.
