---
phase: UAOS-04-grounded-retrieval
plan: "02"
status: complete
completed: 2026-11-09
requirements-covered: [RAG-01, RAG-02, CORE-02, CORE-03, CORE-04, NFR-01, NFR-02, NFR-03]
---

# 04-02 Grounded Retrieval Evidence

Implemented controlled Markdown loading, canonical document revisions, stable Unicode-safe passages, deterministic fixture embeddings, and replaceable ingestion/retrieval ports. The PostgreSQL/pgvector adapter uses an immutable manifest, atomic idempotent document replacement, active-only exact cosine search, retained old revisions, exact citation resolution, bounded owned clients, parameterized values, and safe errors.

A request-scoped model boundary checks every quote and citation against observed passages before the shared loop can emit run.succeeded. Explicit iteration 4 adds a dedicated grounded result while legacy schemas remain strict. CLI/HTTP share the runtime; ingestion is a separate command, and cite/resolver performs a separate read without another agent run.

## Verification

Node.js 24.22.1 passed npm run validate with 242 tests in 24 files, project/core typecheck, and build in 18.37 seconds. Dependency pins/integrity, internal links, requirement coverage, seven threat identities, and separate approval states passed.

npm run test:database passed 11 real PostgreSQL 18 / pgvector 0.8.7 cases in 5.14 seconds. Coverage includes idempotence, transaction rollback, concurrent replacement, profile/index isolation, old citation retention, deterministic ties, corrupted content, blocked-query cancellation, operation deadlines, complete ingestion/CLI/HTTP/resolver execution, and safe persisted journals. The runner verified ownership and removed only its exact disposable tmpfs container.

[Teaching guide](../../../docs/iterations/04-grounded-retrieval.md), [review evidence](../../../docs/reviews/ITERATION-04-evidence.md), [package admission](../../../docs/reviews/DEPENDENCIES-04.json), and [image pin](../../../docs/reviews/INFRASTRUCTURE-04.json) make the result reproducible. Earlier checkpoint evidence and the honest contract RED record are preserved.

## Limits and next

The lexical hash fixture demonstrates vector mechanics and extractive provenance; semantic provider selection, relevance calibration, and source truth remain distinct. Replacement is atomic per document; old revisions are retained and index ingestion is serialized. Cancel/COMMIT ambiguity is handled by idempotent retry, not an exactly-once claim. Production access controls, whole-corpus publication, and retention/garbage collection remain later decisions.

Phase 5 defines durable conversation state, checkpoints, memory scope/retention, and concurrency before implementation. Its contracts must explicitly distinguish content-bearing durable state from metadata-only JSONL.

Implemented: Complete

Architecturally Reviewed: Pending

Approved: Pending

Stable: Pending
