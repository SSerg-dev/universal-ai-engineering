import { Buffer } from "node:buffer";
import { DocumentLibraryError, UPLOAD_MAX_BYTES, UploadFileSchema } from "../../domain/document-library-contracts.js";

export function decodeUpload(raw: unknown) {
  try {
    const file = UploadFileSchema.parse(raw), bytes = Buffer.from(file.base64, "base64");
    if (bytes.length > UPLOAD_MAX_BYTES || bytes.toString("base64") !== file.base64) throw new Error();
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    return { file, text, bytes: bytes.length };
  } catch { throw new DocumentLibraryError("UPLOAD_INVALID"); }
}
