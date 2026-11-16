import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import { describe, expect, it } from "vitest";

const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const files = (root: string): string[] => readdirSync(root, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? files(join(root, entry.name)) : entry.name.endsWith(".ts") ? [join(root, entry.name)] : []);
describe("Isolated Angular adapter boundary", () => {
  it("activates exactly the admitted UI pins without downgrading the original core toolchain", () => {
    const admission = json("docs/reviews/UI-08-dependencies.json"), manifest = json("ui/package.json"), lock = json("ui/package-lock.json");
    const names = new Set<string>();
    for (const category of ["dependencies", "devDependencies"]) {
      const entries = admission[category] as [string, string][];
      expect(manifest[category]).toEqual(Object.fromEntries(entries)); expect(lock.packages[""][category]).toEqual(manifest[category]);
      for (const [name, version] of entries) {
        expect(names.has(name)).toBe(false); names.add(name); expect(version).toMatch(/^\d+\.\d+\.\d+$/u);
        expect(lock.packages[`node_modules/${name}`]).toMatchObject({ version, integrity: expect.stringMatching(/^sha512-/u) });
      }
    }
    expect(manifest.engines.node).toBe("24.x");
    expect(manifest.devDependencies.typescript).toBe("6.0.3"); expect(json("package.json").devDependencies.typescript).toBe("7.0.2");
    expect(json("ui/tsconfig.json").angularCompilerOptions.strictTemplates).toBe(true);
    expect(json("ui/angular.json").projects.inspector.architect.build.builder).toBe("@angular/build:application");
    expect(json("ui/angular.json").projects.inspector.architect.test.builder).toBe("@angular/build:unit-test");
    expect(json("ui/proxy.conf.json")["/api/**"]).toMatchObject({ target: "http://127.0.0.1:3000", changeOrigin: false });
    expect(json("package.json").scripts["validate:all"]).toBe("npm run validate && npm --prefix ui run validate");
    for (const field of ["overrides", "workspaces", "optionalDependencies", "peerDependencies"]) expect(manifest[field]).toBeUndefined();
  });
  it("allows UI to share only pure stream protocol/reducer code and never Node infrastructure", () => {
    const uiRoot = resolve("ui"), allowed = new Set([resolve("src/application/reduce-stream.ts"), resolve("src/domain/stream-contracts.ts")]);
    const browserPackages = Object.keys(json("ui/package.json").dependencies);
    for (const file of files("ui/src")) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/(?:from\s+|import\s*\()\s*["']([^"']+)["']/gu)) {
        const name = match[1]!;
        if (name.startsWith(".")) {
          const path = resolve(dirname(file), name.replace(/\.js$/u, ".ts")), part = relative(uiRoot, path);
          expect(!part.startsWith(`..${sep}`) && part !== ".." || allowed.has(path), `${file} imports ${name}`).toBe(true);
        } else expect(browserPackages.some((packageName) => name === packageName || name.startsWith(`${packageName}/`)) ||
          file.endsWith(".spec.ts") && name === "vitest", `${file} imports ${name}`).toBe(true);
      }
      expect(source, `${file} uses Node or executable output`).not.toMatch(/\bprocess\s*\.|\b(?:require|eval)\s*\(|\binnerHTML\b/u);
    }
  });
});
