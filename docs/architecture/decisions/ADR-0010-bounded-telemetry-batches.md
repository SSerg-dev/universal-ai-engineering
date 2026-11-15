# ADR-0010 — Bounded Telemetry Batch Export

- Status — Selected for Phase 7 implementation; architectural review pending
- Date — 2026-11-15
- Extends — ADR-0009; does not replace its privacy or failure policy

## Finding

The first live PostgreSQL/CLI/HTTP check passed all 22 earlier database tests but failed four new observability tests. Per-record filesystem open/write/sync/close repeatedly exceeded the 250 ms optional flush budget on the Windows host. Primary operations remained correct and inspection reported incomplete traces. Increasing a timing threshold would conceal the avoidable repeated filesystem synchronization.

## Decision and contract

TelemetrySinkPort retains append for compatibility and may additionally implement appendBatch. After the primary result settles, the bounded buffer prefers one appendBatch call with a validated copy of its at-most-64 records; it performs no per-record fallback or retry after a failed or timed-out batch. Existing append-only exporters retain their sequential behavior. Empty buffers perform no sink I/O.

A successful batch acknowledgment means the sink accepted the whole batch. Before acknowledgment, zero records are counted exported; failure or timeout may still leave partial or complete underlying effects. This is acknowledgment accounting, not an atomic filesystem transaction or exactly-once claim. The default 250 ms wait budget and late-settlement isolation remain unchanged.

The filesystem batch validates every record, one trace ID, contiguous sequence starting at one, record/count/total byte bounds, and configured-root containment before publication. It exclusively creates one private trace file, writes the bounded JSONL bytes, syncs once, then closes. It never overwrites or resumes an existing artifact. A partial write remains inspectable as incomplete/invalid evidence; no retry or deletion hides it. Successful content flush does not promise portable directory-entry power-loss durability. Concurrent readers may see an in-progress artifact and must not infer completeness from a prefix.

The existing append method and reader ownership/size/identity controls remain supported. Required execution journal persistence is unchanged and still awaits each required event. No new package, service, or primary result field is introduced. Human review, approval, and stability remain separate.

## Acceptance

Prove one batch call and no append fallback, sanitized failure, timeout plus immutable acknowledgment counts after late completion, exclusive no-overwrite publication, validation before filesystem effects, partial-read diagnosis, and real CLI/HTTP/state/evaluation correlation under the unchanged default budget. Retain the first failed database run as a reproducible discovery record, followed by the corrected live run.
