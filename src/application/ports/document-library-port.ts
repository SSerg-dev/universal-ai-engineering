import type { IndexedDocument, IndexedPassage, IndexManifest } from "../../domain/retrieval-contracts.js";
import type { z } from "zod";
import type { UploadFileSchema } from "../../domain/document-library-contracts.js";

export type UploadFile = z.infer<typeof UploadFileSchema>;
export interface DocumentLibraryStorePort {
  publishUpload(manifest: IndexManifest, document: IndexedDocument, passages: readonly IndexedPassage[], original: UploadFile, signal: AbortSignal): Promise<void>;
  listUploads(indexId: string, signal: AbortSignal): Promise<unknown>;
  readUpload(indexId: string, documentId: string, signal: AbortSignal): Promise<unknown>;
  disableUpload(indexId: string, documentId: string, signal: AbortSignal): Promise<void>;
}
export interface DocumentLibraryPort {
  preview(raw: unknown): unknown;
  confirm(raw: unknown, signal: AbortSignal): Promise<unknown>;
  list(signal: AbortSignal): Promise<unknown>;
  read(raw: unknown, signal: AbortSignal): Promise<unknown>;
  disable(raw: unknown, signal: AbortSignal): Promise<void>;
}
