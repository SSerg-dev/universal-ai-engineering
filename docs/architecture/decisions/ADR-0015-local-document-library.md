# ADR-0015 — Explicit local Markdown/TXT document library

Date: 2026-11-19. Selected for implementation; architectural review, human approval and stability pending.

The user authorized two releases: complete Markdown/TXT upload first, PDF/DOCX through the same flow later. This ad-hoc extension pauses Phase 10 integration without changing the ten-iteration milestone or declaring it complete.

The library is an explicit host option on the streaming runtime. Earlier iteration defaults retain their behavior. A local operator selects one UTF-8 .md/.txt file, sees the exact normalized indexed text, then confirms. JSON/base64 transport avoids a new multipart dependency. Limit 262144 original bytes, 64000 canonical UTF-16 characters, 64 passages, 100 retained uploaded documents per index. Invalid UTF-8, NUL, empty text, unsafe names and mismatched confirmation digests fail before indexing. PDF/DOCX/OCR remain deferred. The initial 10 MB suggestion is reduced to fit existing bounded sequential indexing.

Preview is stateless and writes nothing. Confirmation resubmits original bytes and the canonical digest; the server recomputes normalization and identity. UTF-8 original bytes are retained privately in PostgreSQL; LF canonical text supplies immutable citations. TXT or Markdown without H1 gets a visible generated H1 from its first nonempty line. Upload IDs are content-derived with an upload- prefix; filenames never become filesystem paths or overwrite controlled fixture IDs. Repeated identical canonical text has one identity; the first original/name is retained. Different content creates another immutable document, not a filename-based replacement.

Original retention, passage insertion and active pointer publication share one PostgreSQL transaction. Publication capacity uses the existing index row lock. Failed publication rolls back entirely. An uncertain HTTP acknowledgment can be recovered by listing/reconfirming the same digest. Disabling removes only the active pointer; retained originals and historical citations remain resolvable. Explicit re-confirmation may reactivate a disabled upload. Removing data permanently and automatic retention are separate future decisions.

Routes are same-origin local operations, bounded by byte/body/time limits, no-store and static errors. There is no remote authentication claim. Content and filenames are not logged in journals. Uploaded text is untrusted source data; it cannot change tools, policies or approval. Existing deterministic lexical embeddings remain limited for paraphrases and semantic relevance.

The UI displays escaped text, list/status/disable controls, original text downloads and exact indexed text. Original download is attachment-only text/plain with nosniff and a generated safe filename; Markdown is never rendered as executable HTML. This extension is a document library, not permission to execute content or approve an export.
