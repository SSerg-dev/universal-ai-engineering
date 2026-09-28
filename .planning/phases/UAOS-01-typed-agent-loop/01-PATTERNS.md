# Phase 1: Typed Agent Loop - Pattern Map

**Mapped:** 2026-09-28  
**Files analyzed:** 44 planned new/modified files or file groups  
**Analogs found:** 0 / 44

## Mapping Result

This repository is an intentional greenfield baseline. `git ls-files` reports 23 tracked files, all of them planning, governance, architecture-decision, review-evidence, or project-description documents. There is no tracked application source, `package.json`, TypeScript configuration, runtime adapter, test harness, fixture corpus, or executable validation script.

Consequently, there are **no existing code analogs to copy** for Phase 1. The planner must use the locked contracts in `01-CONTEXT.md` and the planning skeletons in `01-RESEARCH.md`, while treating those skeletons as recommendations rather than established repository conventions. Ignored `.codex/` runtime content is excluded by the tracked-source gate and is not an application analog.

## File Classification

| New/Modified File | Role | Data Flow | Closest Tracked Analog | Match Quality |
|---|---|---|---|---|
| `package.json` | config | batch/build | None | no analog |
| `package-lock.json` | config | batch/build | None | no analog |
| `tsconfig.json` | config | batch/build | None | no analog |
| `tsconfig.core.json` | config / architecture boundary | batch/build | None | no analog |
| `vitest.config.ts` | config / test | batch | None | no analog |
| `src/domain/agent-contracts.ts` | model / runtime schema | transform | None | no analog |
| `src/domain/agent-events.ts` | model / runtime schema | event-driven | None | no analog |
| `src/domain/agent-errors.ts` | model / runtime schema | transform | None | no analog |
| `src/application/ports/model-port.ts` | port | request-response | None | no analog |
| `src/application/ports/search-docs-port.ts` | port | request-response | None | no analog |
| `src/application/ports/journal-port.ts` | port | event-driven / file-I/O | None | no analog |
| `src/application/ports/clock-port.ts` | port | request-response | None | no analog |
| `src/application/ports/id-generator-port.ts` | port | request-response | None | no analog |
| `src/application/run-agent.ts` | service / use case | request-response / event-driven | None | no analog |
| `src/adapters/inbound/cli.ts` | inbound adapter | request-response | None | no analog |
| `src/adapters/inbound/http.ts` | inbound adapter / route | request-response | None | no analog |
| `src/adapters/outbound/deterministic-model.ts` | outbound adapter / provider | request-response | None | no analog |
| `src/adapters/outbound/markdown-search-docs.ts` | outbound adapter / service | file-I/O / transform | None | no analog |
| `src/adapters/outbound/jsonl-journal.ts` | outbound adapter / store | event-driven / file-I/O | None | no analog |
| `src/adapters/outbound/system-clock.ts` | outbound adapter / provider | request-response | None | no analog |
| `src/adapters/outbound/system-id-generator.ts` | outbound adapter / provider | request-response | None | no analog |
| `src/composition/create-runtime.ts` | composition / config | dependency wiring | None | no analog |
| `src/composition/server.ts` | composition / bootstrap | request-response | None | no analog |
| `fixtures/docs/*.md` | fixture data | file-I/O / transform | None | no analog |
| `docs/architecture/decisions/ADR-0003-*.md` | architecture contract | documentation | ADR-0001/ADR-0002 only for record format | documentation-only partial match |
| `docs/iterations/01-typed-agent-loop.md` | teaching guide | documentation | None | no analog |
| `docs/reviews/ITERATION-01-evidence.md` | evidence record | documentation / batch | `docs/reviews/RESET-0001-evidence.md` | documentation-only role match |
| `CHANGELOG.md` | changelog | documentation | existing file | same-file update |
| `.planning/REQUIREMENTS.md` | traceability | documentation | existing file | same-file update |
| `.planning/ROADMAP.md` | traceability | documentation | existing file | same-file update |
| `docs/reviews/RESET-0001-evidence.md` | reset evidence | documentation / validation | existing file | same-file revalidation; preserve state |
| `tests/contracts/schemas.test.ts` | contract test | transform | None | no analog |
| `tests/contracts/agent-events.test.ts` | contract test | event-driven | None | no analog |
| `tests/contracts/dependency-boundaries.test.ts` | architecture test | batch | None | no analog |
| `tests/contracts/ports.test.ts` | contract test | request-response | None | no analog |
| `tests/unit/run-agent.test.ts` | unit test | request-response / event-driven | None | no analog |
| `tests/unit/run-agent-failures.test.ts` | unit test | request-response / event-driven | None | no analog |
| `tests/integration/markdown-search.test.ts` | integration test | file-I/O / transform | None | no analog |
| `tests/integration/jsonl-journal.test.ts` | integration test | event-driven / file-I/O | None | no analog |
| `tests/integration/http.test.ts` | integration test | request-response | None | no analog |
| `tests/integration/teaching-scenario.test.ts` | acceptance test | request-response / event-driven | None | no analog |
| `tests/integration/reset-evidence.test.ts` | documentation integrity test | batch | None | no analog |
| `tests/integration/iteration-evidence.test.ts` | documentation integrity test | batch | None | no analog |
| `tests/smoke/cli.test.ts` | smoke test | request-response / child-process | None | no analog |

The precise ADR suffix, fixture filenames, and any additional test-builder filenames remain planner discretion. They must not be inferred as existing conventions.

## Pattern Assignments

### Domain contracts and schemas

**Applies to:** `src/domain/agent-contracts.ts`, `src/domain/agent-events.ts`, `src/domain/agent-errors.ts`

**Tracked code analog:** None.

**Authoritative input instead:** `01-CONTEXT.md` decisions D-01, D-02, D-07, D-10, D-12, and D-15 through D-18; `01-RESEARCH.md` Pattern 2 and the Zod skeleton.

Planner instructions:

- Define ADR-0003 before implementation depends on these contracts.
- Use Zod strict schemas at unknown runtime boundaries and infer TypeScript types from those schemas.
- Preserve the literal action, event, error-code, schema-version, and tool-name values fixed by context.
- Keep provider SDK, Fastify, filesystem, PostgreSQL, Angular, and MCP types out of domain/application imports.
- Resolve the open public `error.stage` union in ADR-0003 rather than silently inventing it inside an adapter.

### Application ports and typed loop

**Applies to:** `src/application/ports/*.ts`, `src/application/run-agent.ts`

**Tracked code analog:** None.

**Authoritative input instead:** `01-CONTEXT.md` D-05 through D-14 and D-18 through D-21; the responsibility map, transition table, event-first ordering, and cancellation discussion in `01-RESEARCH.md`.

Planner instructions:

- Construct one `RunAgentUseCase` from plain, narrow ports plus policy; inbound adapters only translate transport concerns.
- Keep `ModelPort` provider-neutral and make it return `unknown`; validate immediately after the boundary.
- Implement the explicit `awaiting_tool` → `awaiting_final` state machine, maximum two model calls, maximum one tool call, and no retries.
- Await journal request events before model/tool side effects, observations before later actions, and one terminal event before returning.
- Normalize adapter exceptions to the stable result taxonomy; public failures are returned, not leaked as adapter exceptions.
- Propagate one composed cancellation signal and document the unresolved terminal-evidence cleanup rule in ADR-0003 before coding it.

### Outbound adapters

**Applies to:** deterministic model, Markdown search, JSONL journal, system clock, and system ID generator

**Tracked code analog:** None.

**Authoritative input instead:** `01-CONTEXT.md` D-01 through D-05 and D-15 through D-21; `01-RESEARCH.md` Patterns 4 through 6.

Planner instructions:

- Keep the default teaching model explicitly deterministic and offline; do not imply a vendor integration.
- Load checked-in Markdown fixtures from a configured trusted root, derive IDs from filenames and titles from first H1 headings, and search deterministically.
- Treat empty search results as success; sort by matched-term count and then `documentId`.
- Derive journal paths only from generated IDs/composition configuration, never user input; serialize one valid envelope per line.
- Keep raw prompts, provider payloads, document bodies, and hidden reasoning out of events.

### Inbound adapters and composition

**Applies to:** CLI, Fastify route, runtime composition, and server bootstrap

**Tracked code analog:** None.

**Authoritative input instead:** `01-CONTEXT.md` D-11 through D-14; `01-RESEARCH.md` Pattern 2 and inbound-adapter pitfalls.

Planner instructions:

- Both `uaos ask` and `POST /api/v1/agent-runs` call the same use case and return the same logical result.
- Keep semantic input validation in the use case; Fastify may enforce JSON/content-type/body-size transport constraints.
- Map CLI SIGINT and HTTP disconnection to the shared `AbortSignal` path.
- Fix HTTP status mapping, body limit, timeout default, and runtime paths in ADR/composition policy, not the core.

### Tests and evidence

**Applies to:** `tests/**`, iteration guide, traceability, and evidence records

**Tracked code analog:** No executable test analog. `docs/reviews/RESET-0001-evidence.md` is a documentation-format reference only.

**Authoritative input instead:** `01-RESEARCH.md` validation architecture and required scenario matrix; `AGENTS.md` review-state rules.

Planner instructions:

- Build Wave 0 before dependent implementation: contract, architecture, unit, integration, and smoke test locations plus a single offline `validate` command.
- Exercise real Zod boundaries and deterministic ports; cover success, empty matches, invalid request/action/transition, budget, model/tool/journal failure, timeout, cancellation, and invented source IDs.
- Assert the exact eight-event happy path and exactly one terminal event whenever the journal remains writable.
- Run core-only compilation and a forbidden-import test for NFR-01.
- Keep Implemented, Architectural Review, and Approved distinct; do not mark Approved or Stable without explicit human approval.
- Revalidate reset evidence without rewriting its recovery history or pending approval state.

## Shared Patterns

These are **phase contracts**, not patterns extracted from existing code:

1. **Contract first:** ADR-0003 and executable schemas/ports precede dependent implementation.
2. **Dependency direction:** domain and application depend only inward; frameworks, providers, filesystem access, and process concerns live in adapters/composition.
3. **Boundary validation:** public input and model output enter as `unknown` and cross strict Zod schemas once.
4. **Deterministic execution:** clock, IDs, model, search, and journal are replaceable ports/adapters; tests require no network.
5. **Evidence before side effects:** awaited journal writes establish ordered evidence and fail closed.
6. **One shared use case:** CLI and HTTP must not duplicate orchestration, state transitions, timeout, cancellation, or error mapping.
7. **Narrow Phase 1 scope:** one literal `search_docs` tool and two loop states; no registry, MCP, RAG, durable memory, streaming, UI, or multi-agent abstraction.

## Documentation-Only References

The following tracked files may guide record structure or governance, but are not code analogs:

| Reference | Safe use | Must not be used as |
|---|---|---|
| `docs/architecture/decisions/ADR-0001-foundation-baseline.md` | ADR formatting and identifier continuity | Runtime/module pattern |
| `docs/architecture/decisions/ADR-0002-greenfield-restart.md` | Restart rationale, next ADR number, preserved history | Implementation architecture by itself |
| `docs/reviews/RESET-0001-evidence.md` | Evidence headings and explicit review/approval state | Test or journal schema analog |
| `AGENTS.md` | Repository constraints and review rules | Source-code convention |
| `.planning/PROJECT.md` | Project scope and provider-neutral direction | Executable contract |
| `docs/PROJECT-BRIEF.md` | Iteration boundary and learner scenario | File-layout convention |

## No Analog Found

All 37 planned executable/configuration/test/data entries in the classification table lack a tracked implementation analog. Four traceability/evidence entries are existing-file maintenance, and the three new architecture/teaching/evidence documents have at most documentation-format references. No imports, auth guards, handler structures, error wrappers, validation helpers, persistence implementations, or test idioms can honestly be excerpted from the current codebase.

The planner should therefore cite `01-CONTEXT.md` decisions and relevant `01-RESEARCH.md` skeletons in plan actions, not manufacture `src/...` analog paths or copy ignored `.codex/` runtime implementation.

## Metadata

**Analog search scope:** complete repository tracked-file inventory from `git ls-files`  
**Tracked files scanned:** 23  
**Application source files found:** 0  
**Executable test files found:** 0  
**Ignored runtime excluded:** `.codex/`  
**Pattern extraction date:** 2026-09-28

