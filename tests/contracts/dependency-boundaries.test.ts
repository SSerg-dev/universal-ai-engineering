import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const coreRoots = ["src/domain", "src/application"] as const;
const forbiddenImports = [
  "fastify",
  "@angular/",
  "pg",
  "postgres",
  "@modelcontextprotocol/",
  "openai",
  "@anthropic-ai/",
  "node:fs",
  "node:process",
] as const;

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : path.endsWith(".ts")
        ? [path]
        : [];
  });
}

describe("core dependency boundaries", () => {
  it("keeps domain and application imports independent of adapters and vendors", () => {
    for (const file of coreRoots.flatMap(sourceFiles)) {
      const source = readFileSync(file, "utf8");

      expect(source, `${file} imports an adapter`).not.toMatch(
        /from\s+["'][^"']*\/adapters\//u,
      );

      for (const forbiddenImport of forbiddenImports) {
        expect(source, `${file} imports ${forbiddenImport}`).not.toContain(
          `from "${forbiddenImport}`,
        );
        expect(source, `${file} imports ${forbiddenImport}`).not.toContain(
          `from '${forbiddenImport}`,
        );
      }
    }
  });

  it("defines a strict, no-emit, core-only TypeScript project", () => {
    const config = JSON.parse(readFileSync("tsconfig.core.json", "utf8")) as {
      compilerOptions?: { noEmit?: boolean; strict?: boolean };
      include?: string[];
    };

    expect(config.compilerOptions).toMatchObject({ noEmit: true, strict: true });
    expect(config.include).toEqual(
      expect.arrayContaining(["src/domain/**/*.ts", "src/application/**/*.ts"]),
    );
    expect(config.include).not.toEqual(
      expect.arrayContaining([expect.stringContaining("adapters")]),
    );
  });

  it("compiles the core through the dedicated project without emitting files", () => {
    expect(() =>
      execFileSync(
        process.execPath,
        ["node_modules/typescript/bin/tsc", "-p", "tsconfig.core.json", "--noEmit"],
        { encoding: "utf8", stdio: "pipe" },
      ),
    ).not.toThrow();
  });
});
