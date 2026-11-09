import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { loadControlledDocuments } from "../adapters/outbound/load-controlled-documents.js";
import { createIngestDocument, prepareDocument } from "../application/ingest-document.js";
import { createRetrievalResources, type RetrievalResourceOptions } from "./create-retrieval-resources.js";

export async function ingestFixtures(options: RetrievalResourceOptions & { fixtureRoot: string }, signal: AbortSignal) {
  const resources = createRetrievalResources(options);
  const documents = await loadControlledDocuments(options.fixtureRoot);
  signal.throwIfAborted();
  // Reject malformed source metadata before any database effect.
  for (const document of documents) prepareDocument(resources.manifest, document, resources.identity);
  await resources.repository.initialize(signal);
  const ingest = createIngestDocument(resources);
  const results = [];
  for (const document of documents) results.push(await ingest(document, signal));
  return results;
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && pathToFileURL(resolve(invokedPath)).href === import.meta.url) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const timer = setTimeout(cancel, 30_000);
  process.on("SIGINT", cancel);
  ingestFixtures({
    databaseUrl: process.env.UAOS_DATABASE_URL, indexId: process.env.UAOS_INDEX_ID,
    fixtureRoot: process.env.UAOS_FIXTURE_ROOT ?? resolve(process.cwd(), "fixtures/docs"),
  }, controller.signal).then((results) => {
    for (const result of results) process.stdout.write(`${result.documentId} ${result.revision} passages=${result.passageCount}\n`);
  }).catch(() => {
    process.stderr.write("Error: Controlled document ingestion failed.\n");
    process.exitCode = 1;
  }).finally(() => {
    clearTimeout(timer);
    process.removeListener("SIGINT", cancel);
  });
}
