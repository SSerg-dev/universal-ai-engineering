import { DocumentLibraryError, LibraryDocumentSchema, LibraryListSchema, LibrarySelectionSchema, UploadConfirmSchema, UploadPreviewSchema, type UploadPreview } from "../domain/document-library-contracts.js";
import { createIngestDocument, prepareDocument } from "./ingest-document.js";
import type { DocumentLibraryPort, DocumentLibraryStorePort, UploadFile } from "./ports/document-library-port.js";
import type { ContentIdentityPort } from "./ports/content-identity-port.js";
import type { EmbeddingPort } from "./ports/embedding-port.js";
import type { PassageRepositoryPort } from "./ports/passage-repository-port.js";
import type { IndexManifest } from "../domain/retrieval-contracts.js";

export function prepareUpload(file: UploadFile, text: string, originalBytes: number, manifest: IndexManifest, identity: ContentIdentityPort): UploadPreview {
  try {
    const normalized = text.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
    if (!normalized.trim() || !normalized.isWellFormed() || normalized.includes("\0")) throw new Error();
    const first = normalized.split("\n").find((line) => line.trim())!.trim();
    const heading = /\.md$/iu.test(file.fileName) ? first.match(/^#\s+(.+?)\s*$/u)?.[1]?.trim() : undefined;
    const title = heading ?? first.slice(0, 120).replace(/^#+\s*/u, "").trim();
    const content = heading ? normalized : `# ${title}\n\n${normalized}`;
    const documentId = `upload-${identity.digest(content)}`;
    const { document } = prepareDocument(manifest, { documentId, title, content }, identity);
    return UploadPreviewSchema.parse({ document, fileName: file.fileName, originalBytes });
  } catch { throw new DocumentLibraryError("UPLOAD_INVALID"); }
}

export function createDocumentLibrary(deps: { manifest: IndexManifest; identity: ContentIdentityPort; embeddings: EmbeddingPort;
  repository: PassageRepositoryPort; store: DocumentLibraryStorePort; decode(raw: unknown): { file: UploadFile; text: string; bytes: number } }): DocumentLibraryPort {
  const preview = (raw: unknown) => {
    const decoded = deps.decode(raw);
    return prepareUpload(decoded.file, decoded.text, decoded.bytes, deps.manifest, deps.identity);
  };
  return {
    preview,
    async confirm(raw, signal) {
      const parsed = UploadConfirmSchema.safeParse(raw);
      if (!parsed.success) throw new DocumentLibraryError("UPLOAD_INVALID");
      const { revision, ...file } = parsed.data, prepared = preview(file);
      if (prepared.document.revision !== revision) throw new DocumentLibraryError("UPLOAD_CONFIRMATION_MISMATCH");
      const ingest = createIngestDocument({ ...deps, repository: { ...deps.repository,
        replaceDocument: (manifest, document, passages, active) => deps.store.publishUpload(manifest, document, passages, file, active),
        search: deps.repository.search.bind(deps.repository), resolve: deps.repository.resolve.bind(deps.repository),
      } });
      const { revision: _revision, ...source } = prepared.document;
      await ingest(source, signal);
      return prepared;
    },
    async list(signal) { return LibraryListSchema.parse(await deps.store.listUploads(deps.manifest.indexId, signal)); },
    async read(raw, signal) {
      const selected = LibrarySelectionSchema.safeParse(raw); if (!selected.success) throw new DocumentLibraryError("UPLOAD_INVALID");
      const found = await deps.store.readUpload(deps.manifest.indexId, selected.data.documentId, signal);
      if (found === null) throw new DocumentLibraryError("LIBRARY_NOT_FOUND");
      const result = LibraryDocumentSchema.parse(found);
      const checked = preview(result.original);
      if (result.entry.documentId !== selected.data.documentId || checked.document.documentId !== result.entry.documentId ||
        checked.document.revision !== result.entry.revision || checked.document.content !== result.content ||
        checked.document.title !== result.entry.title || result.original.fileName !== result.entry.fileName) throw new DocumentLibraryError("LIBRARY_FAILURE");
      return result;
    },
    async disable(raw, signal) {
      const selected = LibrarySelectionSchema.safeParse(raw); if (!selected.success) throw new DocumentLibraryError("UPLOAD_INVALID");
      await deps.store.disableUpload(deps.manifest.indexId, selected.data.documentId, signal);
    },
  };
}
