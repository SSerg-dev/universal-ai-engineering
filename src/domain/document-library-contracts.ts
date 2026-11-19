import { z } from "zod";
import { ContentDigestSchema, IndexedDocumentSchema, RetrievalIdSchema } from "./retrieval-contracts.js";

export const UPLOAD_MAX_BYTES = 262144;
export const UploadFileSchema = z.strictObject({
  fileName: z.string().min(1).max(180).regex(/^[^/\\\x00-\x1f\x7f]+\.(?:md|txt)$/iu),
  base64: z.string().min(4).max(349528).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u),
});
export const UploadPreviewSchema = z.strictObject({
  document: IndexedDocumentSchema.extend({ content: z.string().min(1).max(64000) }),
  fileName: UploadFileSchema.shape.fileName, originalBytes: z.number().int().min(1).max(UPLOAD_MAX_BYTES),
});
export type UploadPreview = z.infer<typeof UploadPreviewSchema>;
export const UploadConfirmSchema = UploadFileSchema.extend({ revision: ContentDigestSchema });
export const LibraryEntrySchema = z.strictObject({
  documentId: RetrievalIdSchema.regex(/^upload-[a-f0-9]{64}$/u), revision: ContentDigestSchema,
  title: z.string().min(1).max(256), fileName: UploadFileSchema.shape.fileName, active: z.boolean(),
});
export type LibraryEntry = z.infer<typeof LibraryEntrySchema>;
export const LibraryListSchema = z.array(LibraryEntrySchema).max(100);
export const LibraryDocumentSchema = z.strictObject({ entry: LibraryEntrySchema, content: z.string().min(1).max(64000), original: UploadFileSchema });
export const LibrarySelectionSchema = z.strictObject({ documentId: LibraryEntrySchema.shape.documentId });
export class DocumentLibraryError extends Error {
  constructor(readonly code: "UPLOAD_INVALID" | "UPLOAD_CONFIRMATION_MISMATCH" | "LIBRARY_FAILURE" | "LIBRARY_NOT_FOUND" | "LIBRARY_CAPACITY") {
    super("The document operation could not be completed.");
  }
}
