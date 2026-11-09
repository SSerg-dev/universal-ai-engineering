---
phase: UAOS-04-grounded-retrieval
plan: "01"
status: complete
completed: 2026-11-09
requirements-covered: [RAG-01, RAG-02, NFR-01, NFR-02, NFR-03]
---

# 04-01 Contract Evidence

[ADR-0006](../../../docs/architecture/decisions/ADR-0006-grounded-retrieval.md) selects immutable manifests, canonical LF/Unicode content, UTF-16 passage spans, stable hashes, profile-tagged vectors, transactional active revision replacement, retained citation resolution, and exact extractive grounding. A dedicated grounded result extends only iteration 4; the legacy schema remains strict.

Strict schemas reject malformed vectors/dimensions, invalid identities/spans, duplicate or cross-index observations, missing claims/citations, and unsupported result shapes. Embedding, repository, and content-identity ports contain no infrastructure types. Behavioral provenance and database guarantees remain assigned to 04-02 and are not claimed by schema validation alone.

## Verification

Node.js 24.22.1 passed 11 new contract cases. Full npm run validate passed 206 tests in 20 files, project/core typecheck, and build, in 17.37 seconds. Existing dependency pins and lockfile are unchanged. The RED record reports a missing-module collection failure before implementation, not a behavioral assertion failure.

[Dependency admission](../../../docs/reviews/DEPENDENCIES-04.json) selects pg@8.23.1 and @types/pg@8.23.1 after matching registry name, version, repository, Node engine, and integrity metadata. Installation is planned. Docker availability was confirmed without modifying existing resources. The live database image digest must be captured before use.

The default is a local deterministic embedding fixture for reproducibility. A real semantic embedding provider remains a separate choice. This mode tests vector/index/provenance mechanics and makes no semantic-quality claim.

## Next

Execute 04-02 sequentially: ingestion/retrieval with fakes, PostgreSQL adapter and explicit live tests, grounded model boundary and entry points, then teaching and evidence. Phase 2/3 approval and Phase 4 architectural review, approval, and stability remain pending.
