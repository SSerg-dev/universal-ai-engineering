import { open, readdir, realpath } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { RetrievalBoundaryError, RetrievalIdSchema } from "../../domain/retrieval-contracts.js";

export async function loadControlledDocuments(root: string) {
  try {
    const actualRoot = await realpath(root);
    const entries = (await readdir(actualRoot, { withFileTypes: true }))
      .filter(({ name }) => name.endsWith(".md"))
      .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
    if (entries.length === 0 || entries.length > 100) throw new Error("fixture count");
    const documents: { documentId: string; title: string; content: string }[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || entry.isSymbolicLink()) throw new Error("regular files required");
      const documentId = RetrievalIdSchema.parse(basename(entry.name, ".md"));
      const path = await realpath(join(actualRoot, entry.name));
      if (dirname(path) !== actualRoot) throw new Error("root containment");
      const file = await open(path, "r");
      let content: string;
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size > 1_000_000) throw new Error("fixture size");
        const buffer = Buffer.alloc(1_000_001);
        let total = 0;
        while (total < buffer.length) {
          const { bytesRead } = await file.read(buffer, total, buffer.length - total, null);
          if (bytesRead === 0) break;
          total += bytesRead;
        }
        if (total > 1_000_000) throw new Error("fixture size");
        content = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, total));
      } finally { await file.close(); }
      const title = content.split(/\r\n?|\n/u).find((line) => line.trim().length > 0)?.trim().match(/^#\s+(.+?)\s*$/u)?.[1]?.trim();
      if (!title) throw new Error("fixture heading");
      documents.push({ documentId, title, content });
    }
    return documents;
  } catch {
    throw new RetrievalBoundaryError("DOCUMENT_INVALID");
  }
}
