# ITERATION-08 Evidence

Iteration 8 implements bounded typed SSE/replay/cancellation and a Russian Angular/Tailwind inspector over the same observed grounded assistant. Node.js 24.22.1 verifies the engine and isolated compatible UI build. No business loop or content-bearing telemetry was introduced.

## Review state

| State | Status |
|---|---|
| Planned | Complete |
| Implemented | Complete |
| Architecturally Reviewed | Pending |
| Approved | Pending |
| Stable | Pending |

Implementation authorization and passing tests do not constitute human architectural approval or stability. Phase 8 remains a trusted local course slice.

## Implementation

[ADR-0011](../architecture/decisions/ADR-0011-bounded-run-streams.md) defines ordering, content/privacy, terminal, cursor, subscriber, retention, watchdog, and HTTP boundaries. [ADR-0012](../architecture/decisions/ADR-0012-isolated-angular-build.md) preserves the root TypeScript 7 package while using the officially compatible Angular/TypeScript 6 UI toolchain. [Exact UI admission](UI-08-dependencies.json) preceded installation; root dependency pins and package-lock.json are unchanged. The [UI contract](../../.planning/phases/UAOS-08-streaming-angular-ui/08-UI-SPEC.md) received a separate seven-dimension specification check and 30 explicit UI-state resolutions.

The [guide](../iterations/08-streaming-angular-ui.md) reproduces installation, API/UI execution, reconnect/cancel, test commands, and hard exercises. Earlier [08-01 closure](../../.planning/phases/UAOS-08-streaming-angular-ui/08-01-SUMMARY.md), [client checkpoint](../../.planning/phases/UAOS-08-streaming-angular-ui/08-02-CLIENT-EVIDENCE.md), [component checkpoint](../../.planning/phases/UAOS-08-streaming-angular-ui/08-02-COMPONENT-EVIDENCE.md), and [browser checkpoint](../../.planning/phases/UAOS-08-streaming-angular-ui/08-02-BROWSER-EVIDENCE.md) retain their historical counts and remaining-work statements.

## Requirement traceability

| Requirement | Executable evidence | Implementation status |
|---|---|---|
| STREAM-01 | [Contracts](../../tests/contracts/stream-contracts.test.ts), [broker](../../tests/unit/run-stream-broker.test.ts), [strict reducer](../../tests/unit/reduce-stream.test.ts), [real TCP](../../tests/integration/http-streams.test.ts), [live grounded streaming](../../tests/database/streaming.db.test.ts), [browser reconnect](../../scripts/check-ui-browser.mjs) | Implemented — review pending |
| UI-01 | [Browser client](../../ui/src/app/stream-client.spec.ts), [Angular component/accessibility states](../../ui/src/app/inspector.spec.ts), [admission/import checks](../../tests/contracts/ui-boundaries.test.ts), [real browser](../../scripts/check-ui-browser.mjs), [source-bound rendered artifacts](iteration-08-assets/result.json) | Implemented — review pending |

CORE-02/03/04 and NFR-01/02/03 retain independent core compilation, shared CLI/API behavior, required safe evidence, deterministic tests, explicit live database/browser verification, exact package integrity, reproducible commands, and distinct governance states.

## Threat traceability

| Threat | Boundary and control | Evidence |
|---|---|---|
| T-08-01 | Strict identity/order/call correlation, exact-duplicate idempotency, one terminal, no post-terminal reopening | [Stream contracts](../../tests/contracts/stream-contracts.test.ts), [reducer adversarial cases](../../tests/unit/reduce-stream.test.ts), [broker](../../tests/unit/run-stream-broker.test.ts) |
| T-08-02 | Bounded active/retained/subscriber/frame/character resources, TTL/eviction, watchdog and noncooperative slot accounting | [Broker tests](../../tests/unit/run-stream-broker.test.ts) |
| T-08-03 | Actual persisted-event projection, shared grounded execution, content-bearing answers separate from metadata-only journal/telemetry | [Live stream/citation/privacy tests](../../tests/database/streaming.db.test.ts), [observed loop](../../tests/integration/observed-run.test.ts) |
| T-08-04 | Input/Origin/cursor validation before effects, static errors, socket backpressure detach, shutdown cleanup and read-only replay | [Actual TCP tests](../../tests/integration/http-streams.test.ts), [broker tests](../../tests/unit/run-stream-broker.test.ts) |
| T-08-05 | Bounded UTF-8/SSE/JSON parser, no automatic repeated create, three read reconnects, cancellation acknowledgment versus primary terminal, disposal | [Browser transport tests](../../ui/src/app/stream-client.spec.ts) |
| T-08-06 | Native form/keyboard/focus/status, honest partial/abstained/corrupt states, escaped exact quotes, long-text wrapping, no raw citation serialization | [Angular component tests](../../ui/src/app/inspector.spec.ts), [real browser scenarios](../../scripts/check-ui-browser.mjs) |
| T-08-07 | Exact admitted compatible UI tuples/lock integrity, unchanged root pins, strict AOT templates and checked UI/core import boundary | [Dependency/import checks](../../tests/contracts/ui-boundaries.test.ts), [original package evidence](../../tests/integration/iteration-evidence.test.ts) |
| T-08-08 | Owned isolated browser/profile/server/database, no external requests/storage/runtime exceptions, source/asset-bound screenshots | [Browser runner](../../scripts/check-ui-browser.mjs), [database lifecycle](../../scripts/test-database.mjs), [retained result](iteration-08-assets/result.json) |

## Verification

```sh
npm ci
npm --prefix ui ci --ignore-scripts
npm run validate:all
npm run test:database
npm run test:browser
```

Clean ui npm ci --offline --ignore-scripts --no-audit --no-fund reproduced 292 locked packages with no version fetch or peer bypass. After that installation, combined validation passed 387 root tests in 45 files in 36.57 seconds, strict project/core compilation/build, 21 UI tests in two files in 2.39 seconds, and production Angular AOT build in 5.417 seconds. Bundle: 633.50 kB raw / 125.41 kB estimated transfer, within the declared budget. These are build estimates, not measured network performance or an SLO.

The separate digest-pinned PostgreSQL/pgvector regression passed 28 tests in five files in 14.86 seconds and removed its exact owner-verified container. The final real Chrome 157.0.8103.51 run passed seven scenarios against production assets and the actual API/database, removed its temporary profile/container, and retained the [result](iteration-08-assets/result.json) bound to source 1ab15617ed0e5113bd996f26f443b716273df224 and compiled JS/CSS SHA-256 digests.

Final closure validation passed 390 root tests in 45 files in 31.94 seconds, 21 UI tests in two files in 2.24 seconds, strict project/core compilation, root build, and Angular AOT build in 4.887 seconds. It includes internal Markdown links, both Phase 8 requirements, eight threat boundaries, exact dependency/import/combined-command guards, pending review states, and source ancestry/PNG dimensions for all six retained screenshots. The final build retained the same source-bound main-FZMHIYSR.js/styles-MI2B4LPG.css asset identities and 633.50 kB / 125.41 kB raw/estimated-transfer sizing.

## Rendered evidence

Selected controlled-fixture screenshots were copied without overwriting existing artifacts. Desktop/360px layouts, long text and cancellation were visually inspected; diagnostics report no horizontal overflow, all tested buttons at least 48px tall, no external requests/browser storage, and zero runtime exceptions. Keyboard/status/focus checks and calculated color contrast complement these snapshots; they do not establish complete WCAG conformance.

- [Desktop initial state](iteration-08-assets/desktop-empty.png)
- [Desktop grounded answer](iteration-08-assets/desktop-answer.png)
- [Mobile grounded answer](iteration-08-assets/mobile-answer.png)
- [Mobile 2048-character question and abstention](iteration-08-assets/mobile-long-text.png)
- [Read-only reconnect](iteration-08-assets/desktop-reconnecting.png)
- [Actual cancellation with returned focus](iteration-08-assets/desktop-cancelled.png)

The first browser checks exposed a focus race concealed by the original jsdom scheduling. [The retained RED record](../../.planning/phases/UAOS-08-streaming-angular-ui/08-02-BROWSER-RED.md) records reproduction, a stronger failing component test, and the afterNextRender correction. Visual inspection also removed raw CLI citation JSON from answer prose while preserving exact grounded quotes and optional metadata. [The earlier cancellation RED record](../../.planning/phases/UAOS-08-streaming-angular-ui/08-01-CANCEL-RED.md) retains the zero-attempt journal diagnosis correction.

## Findings and limits

Replay is bounded in-memory and lost on restart; TTL is enforced on access and inactive completed runs may be evicted earlier. A disconnect is not a cancellation. Watchdog timeout bounds waiting, retains noncooperative underlying slots, and does not claim arbitrary work stopped. Backpressure ends a reader rather than queueing unbounded output. A lost create acknowledgment may leave an unknown bounded run; read reconnect never repeats execution.

Content-bearing answers/quotes are intentionally user-facing and are not anonymous/protected merely because journal/telemetry omit content. Browser screenshots use only controlled repository fixtures; browser state has no durable storage. The root package and isolated UI need separate installations; root-only validation does not validate the UI. The development proxy is explicit local configuration; browser evidence serves production assets on the API's loopback origin, not a remote deployment.

No public authentication/tenant policy, production hosting/CSP, persistent distributed stream recovery, token-generation performance, broad semantic model quality, complete accessibility certification, or paid provider admission is claimed. Human architectural review, approval, and stability remain pending.
