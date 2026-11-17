# Cross-phase implementation review — 2026-11-17

Requested scope: all work delivered so far, followed by a real browser preview. Baseline: `ce62169e9f9b0f189c15d279649b0126a97017af`; corrective commits: `5ffce8a` (evidence date), `cf635c8` (disposable preview). This is an automated regression run and a targeted source review across the delivered capabilities, not a claim that every source line was independently audited or that Phase 10 is complete.

## Findings

| Severity | Finding | Resolution |
|---|---|---|
| Low | Browser runner hardcoded 2026-11-16 in both success and failure evidence, misdating subsequent checks. | Use actual UTC execution date. Real browser rerun passed and reports 2026-11-17. Historical committed evidence remains unchanged. |
| Low | STATE mixed 476-test routing progress with an older 451-test current-position entry and a todo asking to define already implemented routing contracts. PROJECT omitted delivered Phase 9. | Reconcile current summaries while preserving history, pending implementation and approval states. |

No blocking defect was identified in the examined paths. Passing tests do not establish production security, independent architectural approval or correctness for arbitrary future ports/providers.

## Source review and coverage

Examined the shared HTTP error/caller-cancellation boundary, strict allow-listed tool registry and bounded invocation, MCP consent/schema/correlation validation, controlled document loading, exact citation grounding, JSONL persistence, durable conversation reservations/settlement, evaluation sequencing, guard policy/audit checks, transactional approval CAS, prepared-content validation, streaming broker/replay/backpressure and browser parser. Examined the new routing core's manifest/policy binding, event/result consistency, aggregate budgets, required journal and safe fallback predicate. Existing dependency-boundary tests cover core and UI separation.

| Delivered scope | Reproducible evidence |
|---|---|
| CORE-01/02/03/04, TOOL-01/02, MCP-01 | Root contracts/unit/integration suite, actual MCP child-process tests; default iteration 1 and selectors through 9 retained. |
| RAG-01/02, MEM-01, EVAL-01, OBS-01 | Root suite and real disposable PostgreSQL suites for retrieval, durable state, evaluation and observability. |
| STREAM-01, UI-01 | Broker/reducer/HTTP tests, 21 UI tests, production AOT build and seven real Chrome/database scenarios. |
| GUARD-01 | Policy/checkpoint/publication/service contracts and real PostgreSQL approval/runtime tests, including all grounded execution paths. |
| NFR-01/02/03 | Strict full/core compilation, forbidden import checks, isolated UI dependency checks, existing evidence/link/requirement/threat checks. |
| ROUTER-01, EDU-01 | Core contracts/fallback/JSONL tests pass; runtime composition, CLI/HTTP exposure, ten-version compatibility and final course packaging remain incomplete. |

## Verification observed

Node.js 24.22.1; Windows; Chrome 157.0.8103.79; pinned owner-labelled disposable PostgreSQL/pgvector. No paid provider required.

- `npm run validate:all`: 476 root tests in 54 files; 21 UI tests in two files; strict project/core compilation, root build and Angular AOT build passed.
- `node scripts/test-database.mjs`: 48 real database tests in seven files passed; runner removed its owned container.
- `node scripts/test-database.mjs --browser`: seven scenarios passed; runner removed its owned container. Covered empty validation/focus, grounded citations/safe evidence, 360px layout/touch controls, long-input abstention, read-only reconnect without duplicate execution, actual cancellation/focus/reduced motion, and absence of browser storage/external requests/runtime exceptions.
- Corrected browser report: [retained result](../../../docs/reviews/audit-2026-11-17-assets/result.json). `sourceHead` records the baseline checkout; this run included the uncommitted date correction and preview helper before their commits. Compiled production UI assets were unchanged. Screenshots were visually inspected: [desktop](../../../docs/reviews/audit-2026-11-17-assets/desktop-answer.png), [mobile](../../../docs/reviews/audit-2026-11-17-assets/mobile-answer.png).
- `node --check` passed for both preview and database runners. New local preview served production assets and actual iteration 8 API on one loopback origin. Independent HTTP probe observed page 200, create 202, SSE 200, an answer and actual run.completed. Browser panel opening was queued by the app; that response alone is not evidence of interaction in the panel.

## Preview and remaining work

See [Iteration 8 instructions](../../../docs/iterations/08-streaming-angular-ui.md) for `node scripts/test-database.mjs --preview`. It starts a new controlled database, retains only ignored local run evidence, and expires after 30 minutes. Temporary preview URLs are intentionally not permanent documentation links. No remote publishing or user-data database is involved.

The browser displays iteration 8, not the unfinished iteration 10. Iterations 1–9 are implemented; only Phase 1 has explicit recorded human approval. Phase 2–9 architectural review/approval/stability remain pending. This review does not change those states or approve any runtime export proposal. Phase 10 integration and final educational comparison remain the next implementation work after this inspection.
