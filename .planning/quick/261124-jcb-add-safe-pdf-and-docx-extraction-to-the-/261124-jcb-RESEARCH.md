---
status: complete
date: 2026-11-26
scope: DOC-02
---

# PDF/DOCX extraction research

## Decision

Use exact local dependencies `unpdf@1.9.1` and `mammoth@1.13.0` behind a new outbound extraction adapter. Neither dependency enters the domain or application core. Extraction of binary documents runs in a bounded Node worker; Markdown/TXT decoding stays local and deterministic.

OCR is not included. A PDF with no usable text layer returns a typed `UPLOAD_OCR_REQUIRED` failure instead of silently indexing an empty or image-only document.

## Admission evidence

| Package | Evidence | Decision |
|---|---|---|
| `unpdf@1.9.1` | MIT, Node `>=22`, no declared runtime dependencies, npm integrity `sha512-nO1npM2kNyd4hj1fKzUVU6bvnWjDSxI97eycM/DgzI83dYyW+pNRI9NeMQVEfef8fI3Q06i9lkMeE1HxrQqKoA==`, unpacked size 2,173,664 bytes | Admit exactly. It provides per-page text and a serverless PDF.js build without a native canvas dependency. |
| `mammoth@1.13.0` | BSD-2-Clause, Node `>=12`, npm integrity `sha512-2cawcYFcP7ISfXbBcL9lmVgTNWo88v/52ND1gnywHtVT/pX0//puPnf0iMPV9ZgmuvNOE+zkIhDgZ9M2c2dDDg==`, unpacked size 1,671,388 bytes | Admit exactly for `extractRawText({buffer})`; do not render its HTML output. |

Primary sources:

- [unpdf repository and untrusted-PDF guidance](https://github.com/unjs/unpdf)
- [unpdf npm package](https://www.npmjs.com/package/unpdf)
- [Mammoth raw-text API](https://www.npmjs.com/package/mammoth)
- [Mammoth security release note recommending a separate thread and timeout](https://github.com/mwilliamson/mammoth.js/blob/master/NEWS)

The installed graph initially exposed pre-existing advisories in `zod@4.6.5`, `fastify@5.12.5` and their `fast-uri` graph. The admission therefore includes minimal security replacements `zod@4.6.7`, `fastify@5.12.8`, `fast-uri@4.2.4` and nested `fast-uri@3.1.9`. Under Node.js 24.22.1 with npm 11.20.0, `npm audit --omit=dev --json` then reported zero vulnerabilities. [DEPENDENCIES-DOC-02.json](../../../docs/reviews/DEPENDENCIES-DOC-02.json) preserves the exact evidence without rewriting the historical Phase 1 acceptance record. Package metadata and an audit snapshot are admission evidence, not a security proof.

## Rejected alternatives

- Direct `pdfjs-dist@6.5.438`: authoritative and Apache-2.0, but its unpacked package is about 37.6 MB and its Node usage requires the legacy build. `unpdf` packages the text-extraction use case more narrowly and documents Node.js 24 behavior and resource controls.
- `pdf-parse`: an additional wrapper is unnecessary when per-page text and page-count checks are available directly.
- Hand-written DOCX ZIP/XML parsing: fewer transitive dependencies would not compensate for the larger correctness and security surface in a teaching project.
- HTML conversion from DOCX: unnecessary and risks introducing executable/rendered markup. Only raw text is accepted and later displayed as escaped text.

## Locked resource contract

- Markdown/TXT retain the existing 262,144-byte limit.
- PDF/DOCX accept at most 2,097,152 original bytes; the JSON/base64 HTTP body is bounded accordingly.
- Canonical indexed text remains at most 64,000 UTF-16 code units and 64 passages.
- PDF is limited to 80 pages and `maxImageSize` is set to 16,777,216 pixels.
- Source locations are bounded to 1,000 entries. PDF locations identify pages; DOCX locations identify extracted paragraphs.
- Binary extraction has a 5-second wall-clock deadline in a worker with bounded heap/stack. Abort, timeout, worker crash, malformed input and oversized output fail closed before publication.
- Preview remains stateless. Confirmation re-extracts the original bytes and verifies the digest before the existing atomic PostgreSQL publication.
- Original bytes remain downloadable with a safe attachment name and format-specific media type. Extracted text and locations are stored separately; neither is executed as HTML/Markdown.

## Test implications

Deterministic fixtures must cover valid PDF and DOCX, malformed signatures/containers, page and size limits, image-only PDF/OCR failure, extraction timeout/worker failure, changed confirmation, exact original retention, source-location persistence and earlier Markdown/TXT behavior. No test requires a network or paid provider.
