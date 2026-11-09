# ADR-0006 — Versioned Passages and Extractive Grounding

- Status — Selected for Phase 4 implementation; architectural review pending
- Date — 2026-11-09
- Extends — ADR-0004 and ADR-0005

## Scope

Iteration 4 ingests controlled local Markdown into PostgreSQL/pgvector and answers with exact retrieved quotations and resolvable passage citations. The selected teaching default remains local and deterministic. A provider embedding adapter is replaceable through a narrow port and requires a separately selected profile. A real embedding/provider choice remains open; no semantic-quality claim is made for the deterministic fixture profile.

## Identity and ingestion

An operator selects an indexId and immutable manifest containing an embedding profile ID/dimension and chunker utf16-v1. Reusing that index with different configuration fails. Query and stored vectors must share that profile. Embeddings contain finite, unit-normalized values with exactly the declared dimension, bounded to 1536 dimensions.

The controlled loader accepts bounded regular Markdown files from the operator root. It derives safe document IDs from filenames and a title from the initial H1. Ingestion canonicalizes CRLF/CR to LF, validates well-formed Unicode, and preserves the canonical text without trimming it. A document revision is SHA-256 of canonical content encoded as UTF-8. A passage uses half-open JavaScript UTF-16 offsets into that exact content. Chunks contain at most 1024 code units and never split a surrogate pair. The initial chunker uses contiguous non-overlapping spans, including formatting and whitespace, so coverage is reproducible.

Passage identity is SHA-256 of JSON.stringify([indexId, documentId, revision, 'utf16-v1', ordinal, start, end]). The manifest and full document are validated before embedding; generated passage text must equal content.slice(start,end). A hash port keeps Node crypto outside the application core.

Ingestion writes one complete document revision and its passages atomically, then selects it as active for that index/document. Repeating identical ingestion is idempotent. Updating a document switches active search to the new revision and retains earlier indexed revisions for old citation resolution. Concurrent writes for the same index/document serialize. Corpus-wide removal, garbage collection, and cross-document snapshot publication remain separate future decisions.

## Repository and search

PostgreSQL/pgvector is an adapter behind PassageRepositoryPort. Tables and identifiers are fixed in adapter-owned DDL; user-controlled values use query parameters. Transactions use one dedicated client and release it on every path. Connection, lock, statement, and invocation work are bounded; cancellation closes the owned client and rolls back open work. No production or discovered existing database is used by automated tests.

The initial repository uses exact cosine search over active revisions in the selected index. Results apply an explicit minimum score and deterministic ties by document ID and passage ordinal. At most five passages cross the boundary. The fixture embedding is lexical and deterministic, intended to prove ingestion/vector plumbing and reproducibility. Its score is not a calibrated confidence or semantic relevance guarantee. Empty/zero-information questions produce no evidence rather than a fabricated vector.

Citation resolution uses the complete index/document/revision/passage/span identity and verifies it against retained content. It never resolves a bare document ID to a mutable latest revision. Resolving an old valid citation after reingestion must return the original passage.

## Grounded answer and loop compatibility

GroundedAnswer version 1.0 is either answered with one to three quote/citation claims, or abstained/no_evidence with no claims. An answered claim must exactly equal a retrieved passage and its full citation identity. Duplicate claims, forged/missing citations, altered quotes, unobserved passages, or unsupported free prose fail before a success terminal event. This establishes extractive provenance; it does not establish truth of the source or semantic entailment beyond the quotation itself.

A request-scoped model boundary translates a validated grounded action into the existing final_answer action. It supplies canonical rendering and observed document source IDs, then attaches the validated grounding to the successful result. The common loop retains its states, exactly-one-tool rule, budgets, cancellation, and evidence order. Failed grounding becomes INVALID_MODEL_ACTION before run.succeeded. The request-scoped boundary prevents concurrent runs from sharing grounding.

The dedicated GroundedRunAgentResultSchema adds grounding for explicit iteration 4. Legacy RunAgentResultSchema stays strict and unchanged; iterations 1–3 retain their exact output contracts. HTTP returns the enriched result for iteration 4; CLI prints its canonical quotes/citation identifiers. A dedicated read-only citation resolver makes full identities inspectable without another agent tool call. It does not accept a filesystem path.

The journal remains version 1.1 metadata only. It stores document source IDs and typed outcomes, not questions, chunks, vectors, quotations, citation text, or answers. A resolver explicitly returns controlled indexed content to the caller and is not a journal sink.

## Dependency and infrastructure admission

Select pg@8.23.1 and @types/pg@8.23.1 after registry verification. Record exact integrity/category separately from previous dependency admissions. The pgvector teaching container uses the published 0.8.7-pg18-trixie image and records the resolved digest before use. Automated live tests create only uniquely named, labeled, loopback-bound disposable resources and clean up only those exact resources.

## Evidence required

Prove canonical Unicode spans, stable IDs, embedding profile/dimension validation, idempotence, transaction rollback, concurrent replacement, active-revision search, retained citation resolution, SQL-shaped input as data, empty evidence abstention, unsupported answer rejection, safe journal content, CLI/HTTP parity, and earlier iteration compatibility. Core tests run offline with fakes; a separate explicit database test command performs real PostgreSQL/pgvector validation and cannot silently pass by skipping an unavailable database.

Architectural review, human approval, and stability remain pending. Real embedding provider/model, relevance thresholds for a broader corpus, retention/garbage collection, and production access control require later explicit decisions.

## References

pgvector supports exact vector search and cosine distance. The teaching adapter starts with exact search for a small corpus. [pgvector v0.8.7](https://github.com/pgvector/pgvector/tree/v0.8.7)

node-postgres documents parameterized values, client timeouts, and using one client for a transaction. [Queries](https://node-postgres.com/features/queries), [Transactions](https://node-postgres.com/features/transactions), [Client API](https://node-postgres.com/apis/client)
