import { readdir, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

const src = fileURLToPath(new URL("../src/", import.meta.url));
const domain = resolve(src, "domain");
const application = resolve(src, "application");

function inside(directory: string, target: string): boolean {
  const path = relative(directory, target);
  return !isAbsolute(path) && path.split(/[\\/]/)[0] !== "..";
}

it("keeps the domain and application independent of adapters and infrastructure", async () => {
  const violations: string[] = [];

  for (const directory of [domain, application]) {
    const entries = await readdir(directory, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
      const file = resolve(entry.parentPath, entry.name);
      const source = await readFile(file, "utf8");
      for (const { fileName: specifier } of ts.preProcessFile(source, true, true).importedFiles) {
        if (directory === domain && specifier === "zod") continue;
        const destination = resolve(entry.parentPath, specifier);
        if (specifier.startsWith(".") && (
          inside(domain, destination) || (directory === application && inside(application, destination))
        )) continue;
        violations.push(`${relative(src, file)} imports ${specifier}`);
      }
    }
  }

  expect(violations).toEqual([]);
});
