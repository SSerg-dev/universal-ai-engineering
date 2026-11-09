# ADR-0007 — Durable Turns and Explicit Scoped Memory

- Status — Selected for Phase 5 implementation; architectural review pending
- Date — 2026-11-09
- Extends — ADR-0006

## Scope and retention choice

Phase 5 adds PostgreSQL-backed conversations, turn-boundary checkpoints, and explicit conversation-scoped memory. Content-bearing state is separate from the metadata-only execution journal. A caller explicitly creates a conversation with a retentionSeconds value from 60 to 604800; there is no automatic storage/default retention in the contract. The proposed seven-day teaching preference was presented to the user and remains open to feedback. Generic persistence mechanics and tests do not depend on that preference.

Conversations intentionally retain normalized questions and validated grounded results, including answer quotations, until their absolute expiry. Memory values are written only by an explicit user command/API, with a key and TTL, and never by a model-emitted tool or automatic extraction. Memory expiry cannot exceed conversation expiry. This is local educational persistence; production access control and content encryption are separate later decisions.

## Turn semantics and concurrency

A conversation has an optimistic version, at most 100 turns, and at most 20 memory entries. A turn request includes conversationId, caller-owned requestId, expectedVersion, and a question bounded to 2048 characters. Reservation is atomic and allocates a host runId, private lease token, and lease expiry of at most 30 seconds before model/tool work. The preallocated runId links durable state and its safe audit to the existing JSONL execution journal.

An existing settled requestId with the same normalized question hash returns its saved result without invoking model/tools again, even if the client's expectedVersion is older. Reusing the key for another question fails. A running request or another active turn returns a typed busy outcome. New work requires the current version. Memory mutation also uses the conversation version and is denied while a turn is active, so the turn context remains a stable snapshot.

Settlement requires the exact private lease token, matching allocated runId, an unexpired lease, and a validated bounded grounded result. A late or recovered worker is fenced from changing the conversation. Lease tokens are never exposed in a conversation snapshot or public API.

## Checkpoint and interruption

Resume occurs between settled turns. The system does not replay a model/tool step from the middle of an interrupted turn or assert exactly-once side effects. An expired running turn is explicitly recovered to interrupted using the current version. Its original requestId remains terminal and cannot re-execute; a fresh requestId is required for a new attempt. Recovery and fencing are transactional. Model/tool effects are not automatically retried.

The executor receives a typed context with the last six settled turns and unexpired explicit memories. They are contextual data, not permission or instructions. Grounded output still must quote currently observed indexed passages. The teaching model may demonstrate bounded follow-up behavior without semantic-model claims. Conversation content is not added to the metadata journal.

Caller cancellation must still settle a returned cancellation result using an independent bounded persistence signal, after the underlying agent has persisted its own terminal evidence. If execution throws or settlement cannot be committed, the service does not report a durable completion or blindly re-execute. The reservation remains available for explicit interrupted recovery. A settled cached result can be replayed without another effect.

## Persistence and audit

Conversation creation, reservation, settlement, recovery, explicit memory writes/deletes, and retention purge have safe schema-validated audit records. Audit metadata contains IDs, sequence, timestamps, keys, expiry, and outcome codes; questions, answers, memory values, documents, and exception text are forbidden. State mutation and its audit record commit in the same PostgreSQL transaction. This avoids a database/JSONL dual-write claim.

The existing JSONL run journal remains unchanged and metadata-only. A state audit links conversation/request IDs to the preallocated runId. State audit is a separate metadata table, not hidden content-bearing telemetry. Its records have a 30-day metadata retention, while conversation/memory content follows its explicit shorter lifetime.

Expired conversation content and expired memory are excluded from reads and model context immediately. An explicit purge command physically deletes expired content and records safe tombstone metadata; it also removes expired audit metadata. Logical expiry is not a claim that physical deletion already occurred. No background automation is created by this phase.

The adapter uses fixed schema/table names, parameterized values, one bounded owned client per operation, row locks, version checks, and atomic audit insertion. A bounded typed snapshot occupies one JSONB conversation row; the active request ID and private lease token occupy separate columns. Safe audit records occupy a separate metadata table. Existing PostgreSQL dependencies are reused. Each live test uses the established owner-verified disposable database runner. A fresh store instance must resume persisted history and cached results.

To keep maintenance bounded, a purge invocation handles at most 100 expired conversations, 100 non-running conversations with expired memory, and 1000 expired audit records. Repeat until the relevant counters reach zero. Audit inspection returns the most recent 1000 records for one conversation, ordered by sequence. A broader paged audit API is deferred. Expired memory in a running conversation remains excluded from new reads but physical removal waits for settlement or a later purge.

## Compatibility and evidence

Run state, conversation history, and explicit memory remain different types. Existing iterations and their strict result/event schemas are preserved. Phase 5 adds a strict typed operation envelope through uaos state and POST /api/v1/conversation-commands; both call one application command handler. Operations are create, read, run_turn, write_memory, delete_memory, recover, purge, and audit. Ordinary ask/cite remains a standalone grounded execution; durable content storage occurs only through explicit conversation commands. The shared grounded agent remains the executor behind stable ports.

The deterministic context demonstration recognizes again as the last settled question and memory:key as the selected explicit memory value. Context changes only a read-only retrieval query. It cannot grant permissions, execute another tool, or bypass grounding. These conventions demonstrate data flow and bounded history, not general semantic conversation understanding.

Tests must prove cached replay executes zero additional effects, same-key input mismatch, concurrent turn exclusion, version conflicts, stable context, late-worker fencing, interrupted recovery, scoped/expired memory, cancellation settlement, transaction/audit rollback, physical purge, safe metadata, restart persistence, and CLI/HTTP parity.

Architectural review, human approval, and stability remain pending. The seven-day teaching preference, production content policy, stronger encryption/access controls, and mid-turn resumability are separate decisions. No approval is inferred from this selected implementation design.
