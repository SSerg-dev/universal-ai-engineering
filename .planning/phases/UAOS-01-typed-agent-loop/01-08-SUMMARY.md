---
phase: UAOS-01-typed-agent-loop
plan: "08"
subsystem: http-adapter
status: complete
completed: 2026-11-09
requirements-completed: [EDU-02, CORE-02, CORE-03, CORE-04, NFR-02]
key-files:
  created:
    - src/composition/server.ts
    - tests/integration/http.test.ts
    - .planning/phases/UAOS-01-typed-agent-loop/01-08-HTTP-LIFECYCLE-RED.json
  modified:
    - src/adapters/inbound/http.ts
    - tests/smoke/cli.test.ts
---

# Plan 01-08 HTTP Completion Evidence

One bounded Fastify POST endpoint now shares RunAgentUseCase with the CLI. The implementation is complete. Phase approval and stability remain Pending.

## Contract

POST /api/v1/agent-runs accepts application/json with a 16384-byte body limit. Semantic validation, run IDs, state transitions, errors, timeouts, and JSONL evidence remain owned by the shared use case. ADR-0003 fixes the HTTP result mappings to 200, 400, 408, 422, 499, 500, and 502. Transport failures use sanitized 400, 413, 415, or 500 responses. Exports are buildHttpApp and startServer, with socket startup isolated from injection tests.

## Resumed Work and Commits

- Task 1 RED at 9adca45 and GREEN at 6bfd64c established the route and status mappings.
- Task 2 RED at 76a7cc0 exposed the missed injected disconnect event.
- Resumed implementation at 95ccace completes cancellation, CLI parity, concurrent persistence, and real socket lifecycle verification.

## Verification

On Node.js 24.22.1, from the repository root with that runtime first on PATH, use the following commands.

```sh
npm test -- tests/integration/http.test.ts tests/integration/teaching-scenario.test.ts tests/integration/jsonl-journal.test.ts
npm run validate
```

The focused command passed 29 tests in three files. Full validation passed project typecheck, 85 tests in 12 files, the core-only compilation test, and build. Real-socket tests bind an ephemeral port on 127.0.0.1 and require local loopback permission. Every successful default run contains two model attempts, one tool attempt, and eight ordered persisted events. Concurrent cancelled and healthy runs have independent IDs, signals, counters, events, terminals, and JSONL files.

## Findings and Resolution

F-HTTP-01 was a blocking lifecycle defect. Injection alone passed while a normal real JSON POST returned 499. The pinned Fastify request.signal observes IncomingMessage close, which also occurs after normal body completion. The adapter now supplies a request-scoped caller signal, aborting for an incomplete request close or an unfinished response close and cleaning listeners on response finish. A real client disconnect during an active model produces one run.cancelled event. This adapter-level correction preserves ADR-0003 D-14 but deviates from the plan's literal use of Fastify request.signal. The regression and observed RED result are recorded in [the lifecycle evidence](01-08-HTTP-LIFECYCLE-RED.json).

F-CLI-01 was a validation timing defect. Three child-process smoke tests each compiled the whole project inside a five-second test budget. Compilation now runs once in a bounded beforeAll hook. All original CLI behavior assertions remain exercised.

## Traceability and Next Step

T-01-11 is mitigated by the HTTP integration suite, including real body completion and active-client disconnect. CORE-02 parity, CORE-03 persisted isolation, CORE-04 cancellation/timeout distinction, EDU-02 teaching behavior, and NFR-02 shared use-case substitution are demonstrated. Plan 01-09 closes documentation, validation, and evidence. Pre-existing untracked .gsd, milestone.lock, and state.json were preserved.

Approved: Pending

Stable: Pending
