# ITERATION-04 Evidence

Iteration 4 delivers controlled document ingestion, PostgreSQL/pgvector retrieval, immutable exact citations, extractive answer validation, and shared CLI/HTTP execution. Verification uses Node.js 24.22.1. Its deterministic embedding fixture demonstrates mechanics and provenance, without a semantic-quality claim.

## Review state

| State | Status |
|---|---|
| Planned | Complete |
| Implemented | Complete |
| Architecturally Reviewed | Pending |
| Approved | Pending |
| Stable | Pending |

The user's continuing implementation authorization covers this work. Phase 1 approval remains independently recorded. Later phases are not human-approved by these tests.

## Implementation

[ADR-0006](../architecture/decisions/ADR-0006-grounded-retrieval.md) defines index/profile isolation, canonical Unicode content, stable revisions/spans, transactional replacement, retained citations, exact retrieval, and request-scoped grounding. [04-01](../../.planning/phases/UAOS-04-grounded-retrieval/04-01-SUMMARY.md) records contracts before implementation. The [repository checkpoint](../../.planning/phases/UAOS-04-grounded-retrieval/04-02-REPOSITORY-EVIDENCE.md) records the earlier 216-test plus eight-database-case verification.

The [guide](../iterations/04-grounded-retrieval.md) reproduces database setup, ingestion, ask/cite, HTTP, citation resolution, safe journal inspection, and adversarial exercises. The [package admission](DEPENDENCIES-04.json) activates pg@8.23.1 and @types/pg@8.23.1 separately from all previous admissions. The [infrastructure record](INFRASTRUCTURE-04.json) pins the exact container digest. Original package pins remain intact.

## Requirement traceability

| Requirement | Executable evidence | Implementation status |
|---|---|---|
| RAG-01 | [Ingestion/retrieval boundaries](../../tests/unit/retrieval.test.ts), [controlled loader](../../tests/unit/controlled-documents.test.ts), [real PostgreSQL/pgvector](../../tests/database/postgres-retrieval.db.test.ts) | Implemented — review pending |
| RAG-02 | [Unsupported claim rejection](../../tests/integration/grounded-agent.test.ts), [exact retained resolution and real CLI/HTTP](../../tests/database/postgres-retrieval.db.test.ts), [safe resolver adapters](../../tests/integration/citation-adapters.test.ts) | Implemented — review pending |

CORE-02/03/04 and NFR-01/02/03 retain the existing project/core compilation, deterministic compatibility tests, shared loop, metadata journal, and separate evidence/approval states.

## Threat traceability

| Threat | Boundary and control | Evidence |
|---|---|---|
| T-04-01 | Bounded regular controlled files, safe IDs, UTF-8 validation, canonical Unicode spans | [Loader tests](../../tests/unit/controlled-documents.test.ts), [Unicode coverage](../../tests/unit/retrieval.test.ts) |
| T-04-02 | Immutable index/profile, normalized finite vector dimension, bounded observations | [Contract tests](../../tests/contracts/retrieval-contracts.test.ts), [retrieval boundaries](../../tests/unit/retrieval.test.ts) |
| T-04-03 | One-client atomic replacement, serialization, idempotence, rollback, parameterized values | [Live transaction tests](../../tests/database/postgres-retrieval.db.test.ts) |
| T-04-04 | Active-only search and retained full-identity resolution validate content/span/hash | [Version/corruption tests](../../tests/database/postgres-retrieval.db.test.ts) |
| T-04-05 | Exact observed quotes/citations reject unsupported, duplicated, shifted, and forged claims | [Grounding tests](../../tests/integration/grounded-agent.test.ts) |
| T-04-06 | Query denial/failure stays distinct from abstention; safe exceptions/journal and per-run grounding isolation | [Grounded run tests](../../tests/integration/grounded-agent.test.ts), [resolver boundaries](../../tests/integration/citation-adapters.test.ts) |
| T-04-07 | Owned clients, operation deadline through cleanup, cancel blocked SQL, owner-verified disposable infrastructure | [Live cancellation/deadline tests](../../tests/database/postgres-retrieval.db.test.ts) |

## Verification

```sh
npm ci
npm run validate
npm run test:database
```

Before documentation closure, full validation passed 240 tests in 24 files, project/core typecheck, and build, in 18.45 seconds. The explicit real-database suite subsequently passed 11 cases, including full ingestion/CLI/HTTP/resolution and the tightened operation cleanup deadline, in 4.66 seconds. The pinned container ran PostgreSQL 18 and pgvector 0.8.7; tests check those versions. Each run removed only its exact owner-labeled disposable container.

The contract [RED record](../../.planning/phases/UAOS-04-grounded-retrieval/04-01-CONTRACTS-RED.json) accurately reports a missing-module collection failure, not a behavioral assertion failure. No artificial RED history is inferred for subsequent passing tests. Final closure passed 242 tests in 24 files in 18.37 seconds, project/core typecheck, build, package integrity, links, and requirement/threat traceability. The separate database suite passed 11 tests in 5.14 seconds and removed its owned container.

## Findings and limits

The fixture embedding is lexical hashing with collisions and limited recall. Threshold 0.15 is a teaching configuration, not a calibrated semantic-confidence bound. Exact provenance does not verify truth of the source or relevance to every question. A real embedding provider, broader evaluation, and threshold calibration remain open choices.

Document replacement is atomic individually. The index manifest lock serializes even different documents; whole-corpus atomic publication, deletion, retention/garbage collection, and fine-grained ingestion concurrency are deferred. Old revisions are retained for citation continuity. Cancel/COMMIT acknowledgment races are recovered by idempotent reingestion rather than an exactly-once claim.

The source root and database URL are trusted operator inputs. The teaching service binds localhost and adds no production authentication/authorization policy. Resolvers are restricted to the configured index. A direct database administrator remains able to change indexed data; read boundaries detect inconsistent text/hash/span identities but do not supply cryptographic external attestation.

Synchronous work is non-preemptible; model/journal cancellation remains cooperative. The normal suite is offline with fakes; real database verification is explicit and requires Docker. Earlier iteration result/event contracts remain strict. Human architectural review, approval, and stability remain pending.
