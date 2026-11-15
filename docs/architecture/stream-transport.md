# Iteration 8 Stream Transport

[ADR-0011](decisions/ADR-0011-bounded-run-streams.md) defines the ordered content-bearing protocol and resource/cancellation/replay limits. These endpoints are present only when iteration 8 is selected. Existing grounded/state/evaluation/inspection capabilities remain available.

## Local execution

Use Node.js 24 and the controlled database/fixture setup from [Iteration 4](../iterations/04-grounded-retrieval.md). Configure UAOS_DATABASE_URL before ingestion; never include its credentials in evidence.

```powershell
npm ci
npm run build
$env:UAOS_ITERATION = '8'
$env:UAOS_INDEX_ID = 'course-docs-v1'
npm run ingest
node --input-type=module -e 'import {startServer} from "./dist/src/composition/server.js"; await startServer({iteration:8,databaseUrl:process.env.UAOS_DATABASE_URL,indexId:process.env.UAOS_INDEX_ID});'
```

From another PowerShell session:

```powershell
$run = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/api/v1/stream-runs' -ContentType 'application/json' -Body '{"question":"execution journal"}'
curl.exe --no-buffer "http://127.0.0.1:3000/api/v1/stream-runs/$($run.runId)/events"
```

POST create returns 202 and the run ID after bounded input validation. The SSE GET sends id: runId:sequence, event: uaos, and a JSON data envelope, flushing start before execution completes. Progress/tool frames project only actually persisted required events. A validated grounded answer, including citations/quotes, precedes one completion terminal. Cancellation/failure produce their distinct terminal frames with fixed codes/stages and no raw exception message.

## Replay and cancellation

```powershell
curl.exe --no-buffer -H "Last-Event-ID: $($run.runId):3" "http://127.0.0.1:3000/api/v1/stream-runs/$($run.runId)/events"
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:3000/api/v1/stream-runs/$($run.runId)/cancel"
```

Use the last actually accepted event sequence, rather than guessing. The after query cursor is also supported; if both cursor forms are supplied they must agree and belong to that same run. Future/negative/noncanonical/malformed cursors fail 400; missing/expired runs fail 404; execution/subscriber capacity fails 429; a closed broker fails 503. Supplied browser Origin must match the request origin or fails 403 before effects. Messages are fixed and never echo untrusted input.

Disconnect detaches the subscriber and leaves execution running under its existing budget. Reconnect replays retained later frames without re-executing the question. A cursor already at the terminal returns an empty ended SSE response. Explicit cancellation aborts the per-run signal; the primary outcome resolves a race with success. A pre-start cancellation still persists required cancellation evidence. A six-second watchdog bounds unexpected noncooperative hosts, retaining the underlying active slot until actual settlement. Late events/results cannot reopen terminal streams.

The server publishes without waiting on the socket. Backpressure ends/detaches that connection rather than growing an application queue; the client may reconnect from its last accepted cursor. Heartbeats are content-free comments. Shutdown cancels the broker in preClose so open SSE connections do not block server closure. Timers/subscribers are removed on terminal, disconnect, and shutdown.

## Reproduction and limits

```powershell
npm test -- tests/unit/run-stream-broker.test.ts tests/unit/reduce-stream.test.ts tests/integration/http-streams.test.ts
npm run validate
npm run test:database
```

Real TCP tests prove incremental delivery, reconnect, cursor/Origin boundaries, explicit cancellation, and backpressure recovery. Real database tests resolve actual grounded citations, follow safe telemetry/journal correlation, replay answer/completion, and cancel before execution starts. The [retained cancellation finding](../../.planning/phases/UAOS-08-streaming-angular-ui/08-01-CANCEL-RED.md) explains the corrected zero-attempt diagnostic branch.

This is bounded process-local replay: 32 retained runs, eight underlying active executions, four subscribers per run, 24 frames, 32768 serialized UTF-16 code units per frame, and 262144 per run. Retained content expires on access five minutes after settlement, or an inactive completed run can be evicted earlier under pressure. UTF-8 bytes can exceed these character counts. Restart loses replay. The browser-independent reducer validates every envelope/sequence/identity/call transition, accepts only exact duplicates, and rejects conflicts, gaps, premature answers/completion, and new events after terminal.

Content is intentionally delivered only through the user-facing stream; it does not enter metadata-only JSONL/telemetry. No token-by-token generation, artificial progress delay, durable stream recovery, public authentication, tenant isolation, remote deployment, CORS wildcard, or production SLO is claimed. The Angular/Tailwind interface is the separate 08-02 step. Architectural review/approval/stability remain pending.
