# Local document library — first wave evidence

Date: 2026-11-19. Contracts: `7614cf9`; implementation: `89baa76`. Implemented and automatically verified; independent architectural review, human approval and stability remain pending. User requested completion of this wave followed by a pause. No PDF/DOCX work was started.

## Result and traceability

[ADR-0015](../architecture/decisions/ADR-0015-local-document-library.md) and the [operator guide](../how-to/local-document-library.md) define the opted-in Markdown/TXT flow. DOC-01: select one UTF-8 file → stateless preview → explicit digest-bound confirmation → atomic original/passages/active-pointer publication → question → exact quotation/source inspection → disable new retrieval. Originals can be downloaded; historical citations remain resolvable. Existing iteration defaults stay unchanged.

| Acceptance | Evidence |
|---|---|
| Preview cannot publish; changed confirmation fails; invalid UTF-8/NUL/path/extension/size rejected | [Preparation/confirmation tests](../../tests/unit/document-library.test.ts) |
| Same-origin, bounded bodies, static failures and opt-in API | [HTTP tests](../../tests/integration/document-library-http.test.ts) |
| Concurrent identical confirms deduplicate; fresh runtime reads exact original | [Real database tests](../../tests/database/document-library.db.test.ts) |
| Failed publication rolls back all tables; disabled content leaves new search, old citations resolve | [Real database tests](../../tests/database/document-library.db.test.ts) |
| Explicit confirmation/cancellation; hostile HTML rendered as text; safe error/retry/disable UI | [Angular tests](../../ui/src/app/document-library.spec.ts) |
| Actual file input, TXT normalization, confirmation, grounded answer, source viewer, mobile and disable | [Browser runner](../../scripts/check-ui-browser.mjs), [retained result](document-library-assets/result.json), [desktop](document-library-assets/desktop-uploaded-answer.png), [mobile](document-library-assets/mobile-uploaded-answer.png) |
| Framework-independent core, isolated UI contracts, existing traceability | Full core compilation, dependency-boundary and iteration-evidence suites |

## Verification observed

Node.js 24.22.1; Chrome 157.0.8103.79; owned disposable pinned PostgreSQL/pgvector. Root/UI package manifests and locks unchanged.

- Final `npm run validate`: **494 tests / 56 files passed**, project/core strict compilation and root build passed.
- `npm --prefix ui run validate`: **27 tests / 3 files passed**, Angular AOT build passed (649.99 kB raw / 128.70 kB estimated transfer).
- `node scripts/test-database.mjs`: **51 tests / 8 files passed**; exact owned container removed.
- `node scripts/test-database.mjs --browser`: **8 scenarios passed**, no external requests or runtime exceptions; exact owned browser/profile/server/database cleaned. Actual uploaded TXT answer included ORBIT-42; metadata journal excluded its question and quote. Desktop/mobile screenshots visually inspected.

The retained browser result identifies HEAD `7614cf9` because the tested implementation was uncommitted at execution; the same implementation was subsequently committed as `89baa76`. Asset digests bind the tested production UI. The final full-core validation ran against `89baa76`.

Earlier RED: confirmation passed a revision-bearing object to the strict source-input schema; this was corrected by explicitly projecting source fields. Initial full regressions also exposed the existing MCP one-second handshake's timing sensitivity (3, then 2 failures); its isolated six tests passed and the final full 494-test run passed. No MCP timeout, policy or implementation was changed. Preserve this observation if a slower host reproduces it.

## Limits and review state

One .md/.txt file up to 256 KiB and 64000 canonical UTF-16 characters, up to 100 retained uploads/index. Missing H1 gets a visible generated heading; original bytes are separate. Same canonical content deduplicates; different content creates another immutable upload. Current lexical embeddings do not establish semantic retrieval quality. No remote authentication, OCR, permanent deletion or automatic retention is claimed.

Disposable preview uploads disappear when the preview stops; persistent local PostgreSQL is required for cross-session retention. UI and guide disclose this. Source text never grants permissions or approves effects. Phase 10 routing integration/course packaging remain incomplete. This evidence does not change earlier human approval states.
