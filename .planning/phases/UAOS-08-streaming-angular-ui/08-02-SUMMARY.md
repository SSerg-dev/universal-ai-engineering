---
phase: UAOS-08-streaming-angular-ui
plan: "02"
status: complete
completed: 2026-11-16
requirements-covered: [UI-01, STREAM-01, CORE-02, CORE-03, CORE-04, NFR-01, NFR-02, NFR-03]
---

# 08-02 Angular Inspector Closure

Implemented the Russian Angular/Tailwind question/timeline/answer/citation inspector over the same observed grounded execution. A browser-independent bounded client validates UTF-8/SSE/JSON/order/identity, retries only stream reads, distinguishes cancellation acknowledgment from the primary terminal, and disposes cleanly. The UI uses native form/keyboard/status/focus semantics, exact quote cards, safe text interpolation, honest provisional/abstained/corrupt states, responsive layout and optional technical metadata.

## Build boundary and verification

[ADR-0012](../../../docs/architecture/decisions/ADR-0012-isolated-angular-build.md) isolates officially compatible Angular 22/TypeScript 6 in ui while preserving root TypeScript 7, dependency tuples, and package-lock.json. Exact [UI admission](../../../docs/reviews/UI-08-dependencies.json), strict AOT templates, checked shared-source imports, and explicit combined validation precede closure. A clean offline/no-script UI npm ci reproduced all 292 locked packages without changing versions. The [UI specification](08-UI-SPEC.md) received seven specification checks and 30 explicit state resolutions before implementation.

Final Node.js 24.22.1 combined validation passed 390 root tests in 45 files in 31.94 seconds, 21 UI tests in two files in 2.24 seconds, project/core typechecks, root build and Angular AOT build in 4.887 seconds. Internal links, two requirements/eight threats, package/import integrity, pending review states, source ancestry and retained PNG dimensions passed. Final UI size: 633.50 kB raw / 125.41 kB estimated transfer; no measured performance/SLO claim is made.

The separate PostgreSQL/pgvector suite passed 28 tests in five files in 14.86 seconds and removed its exact owned container. The real Chrome 157 run passed seven actual production-asset/API/database scenarios: validation focus; grounded citations/safe evidence; 360px/48px targets; long-question abstention/wrapping; one-create read-only reconnect; actual engine cancellation/focus/reduced motion; and no external requests/storage/runtime exceptions. Each browser run owned/cleaned its isolated profile and database. [Six selected PNGs and source/asset-bound metadata](../../../docs/reviews/ITERATION-08-evidence.md) are retained; desktop/mobile/long/cancel states were visually inspected.

## Findings retained

The first real-browser cancellation check exposed a focus microtask racing Angular's disabled-state render. A stronger component test reproduced it; afterNextRender corrected the timing without changing execution. [The RED record](08-02-BROWSER-RED.md) retains that finding. Visual inspection also removed raw CLI citation serialization from default prose, preserving exact quotes and optional IDs. A mobile helper became layout-neutral. Earlier [client](08-02-CLIENT-EVIDENCE.md), [component](08-02-COMPONENT-EVIDENCE.md), [browser](08-02-BROWSER-EVIDENCE.md) and [08-01](08-01-SUMMARY.md) checkpoints remain historical.

## Limits and next

Replay is bounded process-local memory and is lost on restart. Timeout bounds waiting, not arbitrary underlying work; noncooperative active slots remain accounted. Content is intentionally user-facing, with no content in required journal/telemetry and no browser storage. Root-only checks do not validate the isolated UI. No remote authentication/hosting/CSP, distributed durability, complete WCAG certification, semantic/paid provider quality, or production SLO is claimed.

[Guide](../../../docs/iterations/08-streaming-angular-ui.md) documents execution, both-package/database/browser commands, failure behavior and hard exercises. Phase 9 next defines permission/budget/validation/approval/denial contracts and adversarial audit evidence before implementation.

Implemented: Complete

Architecturally Reviewed: Pending

Approved: Pending

Stable: Pending
