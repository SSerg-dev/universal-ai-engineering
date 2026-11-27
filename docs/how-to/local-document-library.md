# Upload local Markdown and TXT documents

This opt-in extension adds a local operator's document library to the streaming inspector. [ADR-0015](../architecture/decisions/ADR-0015-local-document-library.md) records contracts and limits. PDF/DOCX and scanned-document OCR are not included in this release.

## Try the complete flow

With Node.js 26, installed root/UI dependencies and Docker:

```powershell
npm run build
npm run build:ui
node scripts/test-database.mjs --preview
```

Open the printed loopback URL. This preview uses an owned disposable database and stops after 30 minutes. **Its database, including uploaded originals, is removed when the preview ends.** Use controlled sample documents, or download originals before closing. Local run journals remain under ignored .uaos/ui-preview and contain metadata rather than document text.

1. Expand **Мои документы · загрузить Markdown / TXT**.
2. Choose one UTF-8 .md or .txt file. Its normalized indexed text appears before any searchable database write.
3. Inspect the text. A missing Markdown H1 or TXT gets a generated heading, visible in this preview. Click **Подтвердить и добавить в поиск**, or cancel.
4. Ask a question containing distinctive words from the document. The current embedding is deterministic lexical hashing; exact citations do not imply strong paraphrase understanding.
5. From an uploaded source in the answer, click **Открыть исходный документ**. Inspect the indexed text and download the exact original bytes. The normalized indexed version may differ from the original in BOM/newline formatting and generated heading.
6. **Отключить от поиска** excludes the upload from future retrieval. It retains the original and historical citations. Re-upload and confirm the same content to reactivate it. This is not permanent deletion.

Example file `nebula.txt`:

```text
Nebula recovery

Nebula recovery code is ORBIT-42.
```

Ask `Nebula recovery code`. Confirm that the answer quotes ORBIT-42 and that the opened source matches. Before confirmation it must not be found.

## Keep documents between launches

Use the persistent local database setup from [Iteration 4](../iterations/04-grounded-retrieval.md). Retain its volume and credentials outside Git. Build root/UI assets, ingest fixtures once if desired, and explicitly enable this extension on the iteration 8 API:

```powershell
node --input-type=module -e 'import {startServer} from "./dist/src/composition/server.js"; await startServer({iteration:8,documentLibrary:true,databaseUrl:process.env.UAOS_DATABASE_URL,indexId:process.env.UAOS_INDEX_ID});'
```

In another terminal run `npm --prefix ui start` and open http://127.0.0.1:4200. Existing runtime defaults do not activate upload endpoints. The library UI reports unavailability if the host has not enabled it. The extension is intended for a local operator; remote authentication/tenant isolation is not implemented.

## Limits and failure behavior

One original file up to 262144 bytes; canonical indexed text at most 64000 UTF-16 characters; at most 100 retained uploads per index. There is no new dependency, multipart parser, paid model or external document upload service. Empty/non-UTF-8/NUL/oversized/unsupported files fail. A file that cannot produce an embedding also fails without searchable partial publication.

Preview is stateless. Confirmation resubmits original bytes and digest; changing the reviewed text invalidates confirmation. Identical canonical content shares one content-derived upload ID regardless of filename; the first original/name remains retained. Different text creates a separate immutable document. Filename-based replacements and corpus-wide atomic batches are not supported.

Original retention and searchable publication commit together in PostgreSQL. A network failure during acknowledgment can still leave a successful commit: refresh the list or reconfirm the same content rather than assuming nothing happened. No automatic re-publication occurs. Loaded text never grants tool permissions or approves exports. HTML is displayed as escaped text.

The local API exposes POST `/api/v1/documents/preview`, `/confirm`, `/list`, `/read`, `/disable`, `/download`. Preview/confirmation accept `{fileName,base64}` plus `revision` on confirmation. Read/disable/download accept `{documentId}`. The host sets index/database configuration; requests cannot select another index. Body limits, same-origin checks, static errors, no-store responses and bounded repository operations apply.
