import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadControlledDocuments } from "../../src/adapters/outbound/load-controlled-documents.js";

const roots: string[] = [];
async function root() {
  const result = await mkdtemp(join(tmpdir(), "uaos-documents-")); roots.push(result); return result;
}
afterEach(async () => {
  for (const path of roots.splice(0)) {
    expect(dirname(resolve(path))).toBe(resolve(tmpdir()));
    expect(basename(path)).toMatch(/^uaos-documents-/u);
    await rm(path, { recursive: true, force: true });
  }
});

describe("Controlled ingestion source", () => {
  it("loads sorted bounded Markdown with safe IDs and canonical titles", async () => {
    const path = await root();
    await writeFile(join(path, "zeta.md"), "# Zeta\r\nUnicode 😀\r\n");
    await writeFile(join(path, "alpha.md"), "\n# Alpha\nText\n");
    await writeFile(join(path, "ignored.txt"), "ignored");
    expect(await loadControlledDocuments(path)).toEqual([
      { documentId: "alpha", title: "Alpha", content: "\n# Alpha\nText\n" },
      { documentId: "zeta", title: "Zeta", content: "# Zeta\r\nUnicode 😀\r\n" },
    ]);
  });

  it.each([
    { name: "oversized.md", content: Buffer.alloc(1_000_001, "a") },
    { name: "invalid.md", content: Buffer.from([0xff, 0xfe, 0xfd]) },
    { name: "heading.md", content: Buffer.from("No H1\n# Late title") },
    { name: "unsafe name.md", content: Buffer.from("# Title\nBody") },
  ])("rejects $name without returning file paths or contents", async ({ name, content }) => {
    const path = await root(); await writeFile(join(path, name), content);
    await expect(loadControlledDocuments(path)).rejects.toMatchObject({ code: "DOCUMENT_INVALID", message: "The retrieval boundary rejected the operation." });
  });

  it("rejects empty corpora", async () => {
    await expect(loadControlledDocuments(await root())).rejects.toMatchObject({ code: "DOCUMENT_INVALID" });
  });
});
