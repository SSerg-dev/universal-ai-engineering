# ADR-0016 — Bounded local PDF/DOCX extraction

Date: 2026-11-26. Selected for implementation; architectural review, human approval and stability pending.

DOC-02 extends ADR-0015's opt-in local document library, not the agent core or earlier iteration defaults. PDF and DOCX use the same stateless preview, explicit digest confirmation, immutable identity, atomic publication, source inspection and disable behavior as Markdown/TXT. OCR remains a separate deferred capability.

Binary parsing is an outbound adapter behind an application port. The domain and application layers know only a validated extraction result: original file metadata, normalized text and bounded source locations. Exact local dependencies are `unpdf@1.9.1` for PDF text and `mammoth@1.13.0` for DOCX raw text. The adapter never calls a remote service, renders DOCX HTML or requires a paid model.

Markdown/TXT keep their 262,144-byte limit. PDF/DOCX originals are limited to 2,097,152 bytes; canonical indexed text remains limited to 64,000 UTF-16 code units and 64 passages. A PDF has at most 80 pages and a 16,777,216-pixel declared-image bound. Locations are limited to 1,000 page or paragraph spans. Binary extraction runs in a worker with a five-second deadline and bounded memory/stack. Cancellation, timeout, worker failure, malformed input, limit excess and invalid output fail before indexing.

PDF canonical text retains explicit page boundaries and page-number spans. DOCX uses raw paragraph text and paragraph-number spans; layout pagination is not claimed. Files without usable extracted text fail. A PDF with no text layer returns `UPLOAD_OCR_REQUIRED`, making the missing capability visible instead of silently publishing an empty document. Password-protected or malformed files are unsupported in this release.

Preview performs extraction but no database write. Confirmation resubmits and re-extracts the exact original, recomputes canonical content/locations and validates the reviewed revision. PostgreSQL retains original bytes, canonical indexed text and locations in the existing publication transaction. Source locations are evidence for navigation, not a claim that extraction preserves visual layout or table semantics.

Downloads remain attachment-only with `nosniff` and a generated content-derived filename; the response media type matches the admitted extension. UI rendering uses text interpolation. File content, parser messages and extracted text never enter metadata-only journal/telemetry, select tools, grant permissions or approve effects.

The dependency lock, production audit, deterministic fixtures, real database checks and browser evidence are required before DOC-02 is marked implemented. Implementation does not imply architectural review, human approval or stability.
