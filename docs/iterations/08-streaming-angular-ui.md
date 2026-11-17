# Iteration 8 — Watch an Answer Take Shape

Iteration 8 adds ordered typed streaming and a Russian Angular/Tailwind inspector to the same grounded documentation assistant. Ask one question, follow actual model/tool steps, read exact supporting quotes, stop an active run, and reconnect without executing the question again. There is no second orchestration loop or simulated token stream.

## Install and run

Use Node.js 24. The root engine still pins TypeScript 7; the isolated ui package uses officially compatible Angular 22/TypeScript 6. [ADR-0012](../architecture/decisions/ADR-0012-isolated-angular-build.md) explains the separate lockfile/build boundary. No peer dependency bypass or core downgrade is used. The UI shares only pure stream contracts/reducer code with the engine.

```powershell
npm ci
npm --prefix ui ci --ignore-scripts
npm run build
npm run build:ui
```

Set up the controlled PostgreSQL/pgvector database as in [Iteration 4](04-grounded-retrieval.md), and configure UAOS_DATABASE_URL in the API terminal. Keep its credentials out of logs/evidence. Ingest the repository fixtures, then start the explicit iteration 8 API:

```powershell
$env:UAOS_ITERATION = '8'
$env:UAOS_INDEX_ID = 'course-docs-v1'
npm run ingest
node --input-type=module -e 'import {startServer} from "./dist/src/composition/server.js"; await startServer({iteration:8,databaseUrl:process.env.UAOS_DATABASE_URL,indexId:process.env.UAOS_INDEX_ID});'
```

In a second terminal, from the same checkout:

```powershell
npm --prefix ui start
```

Open http://127.0.0.1:4200 in your browser. The loopback UI development server proxies relative /api requests to the loopback API at port 3000, preserving browser Host/Origin. No CORS wildcard is configured. The browser never receives database configuration. A production AOT build is under ui/dist/inspector/browser; serving/publishing it remotely is a separate authorization/hosting decision.

Try «Журнал выполнения» (execution journal), «Политика выполнения» (run policy), and «Без совпадений» (!!!). The controlled documents are English; the interface identifies that fact. Empty input is rejected without a request. Questions are bounded to 2048 characters. Ctrl/Cmd+Enter submits, ordinary Enter edits. The active form/examples prevent duplicate submission. Exact source quotes render as text, with revision/span metadata under disclosure. The CLI's serialized Markdown/JSON answer is not dumped into the default visual result.

## Streaming and reconnect

For a disposable local preview without configuring an existing database, build the UI first and run `node scripts/test-database.mjs --preview` with Node.js 24 and Docker. Open the loopback URL printed by the runner. It serves production assets and the real iteration 8 API using only controlled fixtures in a new owner-labelled database. The preview stops after 30 minutes or Ctrl+C; the runner removes its exact owned container. Preview journals remain under ignored .uaos/ui-preview. This is a local teaching preview, not a deployment or an iteration 10 interface.

[ADR-0011](../architecture/decisions/ADR-0011-bounded-run-streams.md) and the [transport guide](../architecture/stream-transport.md) define create, SSE events, replay cursors, and explicit cancellation. [The browser contract](../architecture/browser-stream-client.md) defines parsing, time bounds, and read-only reconnect.

Create returns one run ID. The SSE response flushes start before execution completes. Progress/tool events follow actually persisted required evidence; a grounded answer precedes exactly one completion terminal. Failures/cancellation use distinct typed terminals. The deterministic model does not generate token deltas, and no fake delays are added for animation.

Disconnect removes only the reader. The server continues under its existing budget, retaining a bounded in-memory replay. The client retries the read at most three times with 500/1000/1500 ms delays using the last accepted cursor. It never retries POST create automatically. On further connection loss, «Восстановить соединение» resumes only the read. Malformed frames/IDs/order/conflicting duplicates are a separate protocol error; expired runs require a new question. Exact duplicates never add timeline rows.

«Остановить запуск» requests cancellation. Acknowledgment alone does not fabricate a terminal; the actual primary result decides cancellation versus success. A received answer remains provisional until valid completion. The complete badge is hidden for partial/corrupt streams. Received steps survive connection loss. A failed stop request leaves the stream active and offers an explicit retry. After actual cancellation the question regains keyboard focus only after Angular has rendered its enabled state; completion focuses the answer heading once. Reconnect does not steal focus.

## Verification

```powershell
npm run validate:all
npm run test:database
npm run test:browser
```

Root-only npm run validate keeps its earlier semantics. validate:all adds the isolated Angular/Vitest and production AOT checks; test:database independently runs the real retrieval/state/evaluation/stream suites. No paid model provider is required.

test:browser requires local Chrome or Edge, Docker, a current root build, and npm run build:ui. On Windows the runner discovers the standard Chrome/Edge installation; UAOS_BROWSER_BIN can select a trusted local browser binary. It serves actual production assets and the actual iteration 8 API on one ephemeral loopback origin with an owner-verified disposable database. Chrome uses a new temporary profile, never your signed-in browser profile. No visible window, remote publication, new browser package, or logged-in account is needed.

The browser check verifies empty/invalid focus, actual grounded quotes and safe journal/telemetry, 360px layout/48px controls, long-question abstention, read-only reconnect with one create/no duplicate steps, actual engine cancellation/focus/reduced motion, no browser storage/external requests, and no runtime exceptions. Its cancellation latency fixture is a host-owned delayed execution port that still delegates to the actual engine after abort; there is no public/model-controlled fault switch. The runner closes its own browser/server/profile and removes only its exact owner-verified database container.

Each browser run writes a fresh owner directory under ignored .uaos/ui-browser, including PNGs, result metadata, compiled asset SHA-256 digests, and safe execution artifacts. Existing evidence is not overwritten. Selected screenshots and source-bound results are retained in the [review evidence](../reviews/ITERATION-08-evidence.md). Component/jsdom checks cover validation, keyboard/focus/ARIA/status, no duplicate creates, provisional/corrupt/abstained states, escaped hostile quotes, long content, cancellation/reconnect, and disposal. They complement real-browser checks rather than claiming full accessibility conformance.

## Hard exercises

- Split a UTF-8 character and an SSE delimiter across network chunks; then truncate the connection. Prove reconnect starts at the last complete accepted event, without another create.
- Inject conflicting duplicates, a future cursor, another run ID, a changed tool call ID, or a new event after terminal. Explain why the reducer must reject each while exact duplicate replay stays idempotent.
- Hold a noncooperative executor past the watchdog. Prove it cannot reopen a terminal or evade the eight-underlying-execution cap through repeated timeouts.
- Make a socket apply backpressure. Prove the publisher does not await it or accumulate an unbounded application queue, then recover through replay.
- Reproduce the [real focus race](../../.planning/phases/UAOS-08-streaming-angular-ui/08-02-BROWSER-RED.md): why did an early jsdom test pass while Chrome ignored focus on a still-disabled textarea?
- Replace the transport adapter while preserving strict ordering, terminal semantics, content privacy, and the pure UI reducer. Do not move execution into a component.

## Boundaries and limits

Content-bearing stream answers/quotes are intentionally delivered to the user. Questions do not become replay events; required JSONL/optional telemetry remain metadata-only. The browser stores no question/run in localStorage/sessionStorage and loads no external fonts, images, analytics, or component registries. IDs/timing still describe sensitive operations; they are not anonymous data or authentication secrets.

Replay is process-local: at most 32 retained runs, eight underlying active executions, four subscribers per run, 24 frames, 32768 serialized UTF-16 units per frame and 262144 per run. Completed content expires on access after five minutes or can be evicted earlier under pressure. Restart loses replay. A six-second watchdog bounds waiting for unexpected hosts but retains noncooperative active slots until actual settlement; it does not claim arbitrary work stopped. Client create/cancel waits are five seconds, read attempts ten seconds; a lost create acknowledgment can leave an unknown bounded server run, never an automatic repeated action.

The one-screen UI has no durable browser history, remote authentication/tenant authorization, production deployment/CSP, distributed replay, sampling/SLO guarantee, UI framework in the core, or generative/paid provider selection. Screenshots use only controlled course fixtures. Architectural review, human approval, and stability remain separate from implementation and passing tests.
