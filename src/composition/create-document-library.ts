import { createDocumentLibrary } from "../application/document-library.js";
import { decodeUpload } from "../adapters/outbound/decode-upload.js";
import { createRetrievalResources, type RetrievalResourceOptions } from "./create-retrieval-resources.js";

export async function createLocalDocumentLibrary(options: RetrievalResourceOptions) {
  const resources = createRetrievalResources(options);
  await resources.repository.initialize(AbortSignal.timeout(5000));
  return createDocumentLibrary({ ...resources, store: resources.repository, decode: decodeUpload });
}
