# 04-02 Repository Checkpoint

This checkpoint covers the ingestion/retrieval core and PostgreSQL/pgvector adapter, not completed Phase 4 answering or approval.

Node.js 24.22.1 passed npm run validate with 216 tests in 21 files, project/core typecheck, and build. The suite completed in 18.18 seconds. A separate npm run test:database passed eight cases against the digest-pinned pgvector image: idempotence/exact resolution, new active revision with old citation retention, manifest isolation, concurrent replacement, rollback after a trigger-injected failure, SQL-shaped query data and index isolation, deterministic ties/corruption detection, and blocked-query cancellation with backend cleanup.

The test runner created a uniquely named and owner-labeled tmpfs container with a random loopback port, then verified ownership and removed that exact container. No existing container, volume, or database was modified. The [image record](../../../docs/reviews/INFRASTRUCTURE-04.json) pins the resolved digest. The separately selected pg/types dependencies are active and integrity-checked; original pins and previous MCP admission are preserved.

The cancellation test initially checked server backend disappearance immediately after socket close. PostgreSQL cleanup is asynchronous; the assertion was corrected to observe pg_stat_activity within a bounded 1000 ms interval. No production timeout was relaxed. The final test proves exact caller cancellation, connection close, and eventual backend removal.

The small teaching index serializes ingestion through the immutable manifest row. This also serializes distinct documents in the same index; fine-grained ingestion concurrency is deferred. Every operation owns one bounded client, so disconnect rolls back unfinished transactions. A cancellation concurrent with COMMIT can leave a committed operation whose acknowledgment was lost; idempotent reingestion is the recovery mechanism, not an exactly-once claim.

Next: request-scoped grounded model validation, versioned successful results, CLI/HTTP selection and citation resolution, then full iteration teaching and evidence closure.
