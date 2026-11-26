---
quick_id: 261124-jcb
status: planned
mode: quick-full
requirement: DOC-02
must_haves:
  truths:
    - PDF and DOCX use the existing stateless preview and digest-bound confirmation flow.
    - Binary extraction is local, bounded, cancellable and isolated from the application core.
    - PDF page and DOCX paragraph locations survive confirmation and source inspection.
    - Scanned PDFs fail explicitly without claiming OCR support.
    - Markdown/TXT behavior and earlier iteration defaults remain compatible.
  artifacts:
    - docs/architecture/decisions/ADR-0016-bounded-pdf-docx-extraction.md
    - src/application/ports/document-extraction-port.ts
    - src/adapters/outbound/bounded-document-extractor.ts
    - src/adapters/outbound/document-extraction-worker.ts
    - tests/unit/document-extraction.test.ts
  key_links:
    - The composition root injects the extractor into the shared document-library use case.
    - Confirmation re-extracts bytes and binds locations to the same canonical revision.
    - PostgreSQL stores original bytes, canonical text and bounded locations in one transaction.
---

# Add safe PDF and DOCX extraction to the document library

## Task 1 — Contracts and dependency admission

**Files:** `docs/architecture/decisions/ADR-0016-bounded-pdf-docx-extraction.md`, `.planning/quick/261124-jcb-add-safe-pdf-and-docx-extraction-to-the-/261124-jcb-RESEARCH.md`, `.planning/quick/261124-jcb-add-safe-pdf-and-docx-extraction-to-the-/261124-jcb-PLAN.md`, `package.json`, `package-lock.json`

**Action:** Record format, location, failure and resource contracts before implementation. Install only the two admitted exact production dependencies and audit the resulting lock graph.

**Verify:** `npm ls unpdf mammoth --depth=0` and `npm audit --omit=dev` succeed under Node.js 24.

**Done:** Exact versions, integrity, licenses, limits and rejected alternatives are reviewable; the lock contains no ranges for the direct dependencies.

## Task 2 — Bounded extraction and persistent source locations

**Files:** `src/domain/document-library-contracts.ts`, `src/application/document-library.ts`, `src/application/ports/document-library-port.ts`, `src/application/ports/document-extraction-port.ts`, `src/adapters/outbound/bounded-document-extractor.ts`, `src/adapters/outbound/document-extraction-worker.ts`, `src/adapters/outbound/postgres-passage-repository.ts`, `src/composition/create-document-library.ts`, `tests/unit/document-library.test.ts`, `tests/unit/document-extraction.test.ts`, `tests/database/document-library.db.test.ts`

**Action:** Generalize preparation around an injected async extractor, keep the core dependency-free, isolate PDF/DOCX parsing in a limited worker, add typed failures and locations, and persist locations atomically with originals and passages.

**Verify:** Run focused unit tests, strict core typecheck, root typecheck/build and the owned database document-library suite with Node.js 24.

**Done:** Valid formats preview and confirm deterministically; malformed, over-budget, timed-out and OCR-required documents publish nothing; fresh runtime reads exact original, canonical content and locations.

## Task 3 — HTTP/UI/operator evidence

**Files:** `src/adapters/inbound/http-documents.ts`, `ui/src/app/document-library.ts`, `ui/src/app/document-library.spec.ts`, `tests/integration/document-library-http.test.ts`, `docs/how-to/local-document-library.md`, `docs/reviews/DOCUMENT-LIBRARY-evidence.md`, `.planning/REQUIREMENTS.md`

**Action:** Extend bounded request/download behavior and the Angular picker/preview/source view for PDF/DOCX, document OCR/resource behavior, and close DOC-02 implementation evidence without claiming review, approval or stability.

**Verify:** Run focused HTTP/UI tests, full root/UI validation, link/traceability checks and the database/browser evidence appropriate to the changed flow.

**Done:** The operator can select, review, explicitly confirm, search, inspect locations, download and disable PDF/DOCX through the same local flow; documentation states every limitation.
