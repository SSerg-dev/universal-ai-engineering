# ARCH-0001 Iteration 01 Architecture Review Gate

## Gate State

| State | Status | Evidence required to change it |
|---|---|---|
| Package Legitimacy | **Pending** | Explicit human acceptance, replacement, or rejection of every exact package name/version before installation. |
| Implemented | **Pending** | All Phase 1 contracts, use case, adapters, deterministic tests, and evidence are complete. |
| Architecturally Reviewed | **Pending** | Human review of ADR-0003, dependency direction, schemas, ports, tests, package record, and findings. |
| Approved | **Pending** | Explicit human approval after blocking findings are resolved. |
| Stable | **Pending** | Explicit stability decision after implementation, validation, review, and approval. |

These states are independent. Package acceptance authorizes only the accepted dependency set. Implementation is not architectural review; architectural review is not approval; approval is not stability.

## Review Scope

- `docs/reviews/RESET-0001-evidence.md` recovery point, retired inventory, and Pending governance states.
- `docs/architecture/decisions/ADR-0003-typed-agent-loop-contracts.md`, including D-01 through D-21 and the five resolved research questions.
- Strict public/model schemas, five narrow ports, inward dependency enforcement, and fail-first specifications.
- Safe event envelopes, one-terminal-event behavior, per-run JSONL paths, and cancellation evidence cleanup.
- Exact package names and versions proposed by research, checked against authoritative package and framework sources.

## Package Legitimacy Gate

No package manifest, lockfile, install, or canonical accepted-package record exists at this stage. Research candidates are not approvals. Plan 01-02 must stop at a blocking-human checkpoint and present the exact proposed dependency tuple arrays without collapsing duplicates into maps. Only an explicit human decision may create the canonical accepted record consumed by Plan 01-03.

Current research candidates, shown for review only, are:

| Package | Candidate version | State |
|---|---:|---|
| `typescript` | `7.0.2` | Pending legitimacy review |
| `zod` | `4.6.5` | Pending legitimacy review |
| `fastify` | `5.12.5` | Pending legitimacy review |
| `vitest` | `5.0.2` | Pending legitimacy review |
| `vite` | `8.3.1` | Pending legitimacy review |
| `@types/node` | `24.19.0` | Pending legitimacy review |

### Prepared Official Publication Evidence

The executor queried the official npm registry on 2026-09-29 without downloading or installing any package. Every requested exact specification returned the same package name and version, an npm-registry tarball, Subresource Integrity metadata, and the expected upstream repository. This establishes package-name legitimacy and confirms that the exact publication exists; it does **not** accept the version or authorize installation.

| Candidate exact pin | Official publication evidence | Published (UTC) | Human exact-version decision |
|---|---|---:|---|
| [`typescript@7.0.2`](https://www.npmjs.com/package/typescript?activeTab=versions) | Registry name/version match; repository `microsoft/TypeScript`; Node engine `>=16.20.0` | 2026-07-08 | **Pending** |
| [`zod@4.6.5`](https://www.npmjs.com/package/zod?activeTab=versions) | Registry name/version match; repository `colinhacks/zod` | 2026-09-13 | **Pending** |
| [`fastify@5.12.5`](https://www.npmjs.com/package/fastify?activeTab=versions) | Registry name/version match; repository `fastify/fastify` | 2026-09-16 | **Pending** |
| [`vitest@5.0.2`](https://www.npmjs.com/package/vitest?activeTab=versions) | Registry name/version match; repository `vitest-dev/vitest`; Node 24 is declared supported | 2026-09-25 | **Pending** |
| [`vite@8.3.1`](https://www.npmjs.com/package/vite?activeTab=versions) | Registry name/version match; repository `vitejs/vite`; satisfies Vitest 5's declared Vite 8 peer range | 2026-09-24 | **Pending** |
| [`@types/node@24.19.0`](https://www.npmjs.com/package/%40types/node?activeTab=versions) | Registry name/version match; repository `DefinitelyTyped/DefinitelyTyped`; satisfies Vitest 5's declared Node-types peer range | 2026-09-25 | **Pending** |

Registry metadata also reports that `vitest@5.0.2` accepts Node `^24.0.0`, Vite `^8.0.0`, and `@types/node >=24.0.0`; `vite@8.3.1` accepts Node `>=22.12.0`. These are compatibility facts only. The five freshness-flagged publications remain SUS until the human explicitly accepts, replaces, or rejects each exact pin.

## Architecture Review Checklist

- [ ] Reset evidence independently proves `e4a25e9`, declared retirements, migrations, and Pending approval.
- [ ] ADR-0003 preserves all D-01 through D-21 decisions without adding deferred capabilities.
- [ ] Domain and application contracts remain provider-, Fastify-, Angular-, PostgreSQL-, MCP-, filesystem-, and process-independent.
- [ ] Boundary schemas are strict, receive `unknown`, and reject malformed values.
- [ ] Error codes/stages, transition rules, call budgets, timeouts, cancellation, and HTTP mappings match ADR-0003.
- [ ] Events are versioned, monotonic, allow-listed, content-safe, and terminal exactly once when the journal is writable.
- [ ] Tests are deterministic, offline, concrete, and neither skipped nor focused.
- [ ] Package names and exact versions have been explicitly accepted or replaced by a human before installation.
- [ ] Blocking review findings are recorded and resolved before approval.

### Prepared Reviewer Evidence

| Review area | Prepared evidence | Automated preparation result |
|---|---|---|
| Reset and governance | `RESET-0001`, ADR-0003, and this gate keep implementation, architectural review, approval, and stability separate. | Ready for human inspection; all gate decisions remain Pending. |
| D-01 through D-21 | ADR-0003 fixes the one-tool/two-state loop, stable failures, public result, event envelope, journaling, and dependency direction without adding deferred capabilities. | No automated mismatch found. |
| Strict runtime contracts | `agent-contracts.ts`, `agent-errors.ts`, and `agent-events.ts` use strict Zod objects, exact discriminants/vocabularies, inferred types, positive sequences, and metadata-only event payloads. | `schemas-events-ok`; forbidden payload specifications remain fail-first. |
| Core dependency direction | The domain imports only Zod and core-owned error schemas. The five application ports import only core-owned types and use `AbortSignal` where required. | `ports-ok`; no provider/framework/filesystem/process/database/transport import found. |
| Deterministic specifications | Schema, event, loop, and teaching specifications are concrete and contain no skipped, focused, or TODO tests. | Fail-first intent confirmed statically; execution intentionally awaits package acceptance and workspace activation. |
| Five research resolutions | Error stages, 5000 ms/16 KiB limits, 250 ms cancellation evidence, deterministic teaching model, and the package-gate procedure are present in ADR/research. | All five RESOLVED records found. |
| Supply-chain boundary | No `package.json`, `package-lock.json`, or `node_modules` exists, and no canonical accepted-package-pins record has been emitted. | Gate remains closed as required. |

## Findings

Automated preparation found no blocking contract or dependency-direction mismatch. This is evidence for review, not an architecture decision. No human architecture review has occurred. Human findings: **Pending**.

## Decision Record

- **Reviewer:** Pending
- **Review date:** Pending
- **Package decision:** Pending
- **Architecture decision:** Pending
- **Approval decision:** Pending
- **Stability decision:** Pending

This record must not be rewritten to imply that a generated artifact, passing test, or completed implementation constitutes human review, approval, or stability.
