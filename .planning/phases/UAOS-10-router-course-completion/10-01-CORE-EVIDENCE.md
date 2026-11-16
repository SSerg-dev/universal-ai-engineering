# Routing Core Checkpoint

2026-11-16 — Implemented immutable typed manifest/policy validation, invocation-local router and required metadata JSONL adapter. The router validates actual acknowledged execution events independently of public result shape, including correlation, order, terminal counts, success grammar/action kinds and declared evidence mode. Only an exact lexical first-model failure with zero tool requests authorizes one grounded fallback. Aggregate counts and fresh run IDs are retained under one bounded route deadline.

Node.js 24.22.1 passed 476 root tests in 54 files (36.66s), project/core compilation and build. Five manifest/result contracts, sixteen routing cases and four actual JSONL checks cover both profile/evidence selections, safe fallback, no after-tool/policy/budget/grounded retry, private metadata, failed required evidence at each authorization/completion boundary, uncooperative execution cancellation/deadline/late results, corrupted evidence, concurrent invocation isolation, safe generated files, pre-abort and unusable roots.

The core tests drive the real shared registered loop through deterministic host-owned ports; production-profile composition, real PostgreSQL/guard/CLI/API and complete course packaging are not implemented yet. ROUTER-01/EDU-01 remain pending. Review, human approval and stability remain pending.
