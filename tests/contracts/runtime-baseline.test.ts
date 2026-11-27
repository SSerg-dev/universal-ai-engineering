import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));

describe("Node.js runtime baseline", () => {
  it("binds the active manifests and lockfiles to Node.js 26", () => {
    const root = json("package.json"), rootLock = json("package-lock.json");
    const ui = json("ui/package.json"), uiLock = json("ui/package-lock.json");

    expect(process.versions.node).toBe("26.11.1");
    expect(root.engines.node).toBe("26.x");
    expect(rootLock.packages[""].engines.node).toBe("26.x");
    expect(ui.engines.node).toBe("26.x");
    expect(uiLock.packages[""].engines.node).toBe("26.x");
  });

  it("aligns the exact Node type surface through the admitted replacement", () => {
    const root = json("package.json"), lock = json("package-lock.json");
    const admission = json("docs/reviews/DEPENDENCIES-RUNTIME-26.json");

    expect(admission).toMatchObject({
      scope: "RUNTIME-26", nodeEngine: "26.x", verifiedRuntime: "26.11.1",
      devDependencyReplacement: { name: "@types/node", from: "24.19.0", to: "26.6.11" },
    });
    expect(root.devDependencies["@types/node"]).toBe(admission.devDependencyReplacement.to);
    expect(lock.packages[""].devDependencies["@types/node"]).toBe(admission.devDependencyReplacement.to);
    expect(lock.packages["node_modules/@types/node"]).toMatchObject({
      version: admission.devDependencyReplacement.to,
      integrity: admission.integrity,
    });
  });

  it("keeps the approved Node.js 24 package record as historical evidence", () => {
    const summary = readFileSync(".planning/phases/UAOS-01-typed-agent-loop/01-02-SUMMARY.md", "utf8");
    expect(summary).toContain('["@types/node","24.19.0"]');
    expect(readFileSync("docs/architecture/decisions/ADR-0017-node-26-runtime-baseline.md", "utf8"))
      .toContain("Node.js 24 records remain historical evidence");
  });
});
