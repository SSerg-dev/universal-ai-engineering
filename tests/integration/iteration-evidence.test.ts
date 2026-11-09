import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

const phase = ".planning/phases/UAOS-01-typed-agent-loop";
const evidencePath = "docs/reviews/ITERATION-01-evidence.md";
const guidePath = "docs/iterations/01-typed-agent-loop.md";
const read = (path: string) => readFileSync(path, "utf8").replaceAll("\r\n", "\n");

function rows(source: string, heading: string): string[][] {
  const section = source.split(`## ${heading}\n`)[1]?.split(/\n## /u)[0] ?? "";
  return section.split("\n")
    .filter((line) => line.startsWith("|"))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
    .filter((row) => !row.every((cell) => /^:?-+:?$/u.test(cell)))
    .slice(1);
}

function expectedTasks(): string[] {
  return Array.from({ length: 9 }, (_, index) => {
    const plan = String(index + 1).padStart(2, "0");
    const tasks = [...read(`${phase}/01-${plan}-PLAN.md`).matchAll(/<task\b/gu)];
    return tasks.map((_, task) => `01-${plan}-${String(task + 1).padStart(2, "0")}`);
  }).flat();
}

describe("Iteration 1 review evidence", () => {
  it("covers each Phase 1 requirement exactly once with executable evidence", () => {
    const requirements = rows(read(".planning/REQUIREMENTS.md"), "Traceability")
      .filter((row) => row[1] === "Phase 1");
    const coverage = rows(read(evidencePath), "Requirement traceability");

    expect(requirements).toHaveLength(11);
    expect(coverage.map((row) => row[0]).sort()).toEqual(
      requirements.map((row) => row[0]).sort(),
    );
    for (const row of requirements) expect(row[2]).toBe("Validated — human approved");
    for (const row of coverage) {
      expect(row[1]).toMatch(/\]\(.*\.test\.ts\)/u);
      expect(row[2]).toBe("Validated — human approved");
    }
  });

  it("accounts for all twenty plan tasks and thirteen unique threat identities", () => {
    const validation = read(`${phase}/01-VALIDATION.md`);
    const tasks = rows(validation, "Per-Task Verification Map");
    expect(expectedTasks()).toHaveLength(20);
    expect(tasks.map((row) => row[0]).sort()).toEqual(expectedTasks().sort());
    for (const row of tasks) {
      expect(row[7]).toMatch(/npm (?:test|run validate)/u);
      expect(row[8]).toBe("Yes");
      expect(row[9]).toBe("green");
    }

    const threats = rows(read(evidencePath), "Threat traceability");
    const expected = Array.from({ length: 12 }, (_, index) =>
      `T-01-${String(index + 1).padStart(2, "0")}`,
    ).concat("T-01-SC");
    expect(threats.map((row) => row[0]).sort()).toEqual(expected.sort());
    for (const row of threats) {
      expect(row[2]).toBe("Mitigated");
      expect(row[3]).toMatch(/\]\(.*\.test\.ts\)/u);
    }
  });

  it("requires explicit human approval and keeps stability separate", () => {
    const approval = z.strictObject({
      phase: z.literal("UAOS-01"),
      commit: z.string().regex(/^[a-f0-9]{40}$/u),
      approvedOn: z.literal("2026-11-09"),
      approvedBy: z.literal("Project Founder"),
      decision: z.literal("Approved"),
      scope: z.literal("Phase 1 implementation and continuation to Phase 2"),
      source: z.literal("Explicit user approval in the Codex conversation"),
      statement: z.string().min(1),
    }).parse(JSON.parse(read("docs/reviews/ITERATION-01-approval.json")));
    expect(() => execFileSync("git", ["merge-base", "--is-ancestor", approval.commit, "HEAD"])).not.toThrow();
    const stateRows = rows(read(evidencePath), "Review state");
    expect(stateRows).toHaveLength(5);
    const states = new Map(stateRows.map((row) => [row[0], row[1]]));
    expect(states.size).toBe(5);
    expect(states.get("Planned")).toBe("Complete");
    expect(states.get("Implemented")).toBe("Complete");
    expect(states.get("Architecturally Reviewed")).toContain("implementation accepted on 2026-11-09");
    expect(states.get("Approved")).toBe("Complete");
    expect(states.get("Stable")).toBe("Pending");

    const gate = read("docs/reviews/ARCH-0001-iteration-01-gate.md");
    expect(gate).toContain("**Review date:** 2026-09-30");
    const gateStates = new Map(rows(gate, "Gate State").map((row) => [row[0], row[1]]));
    expect(gateStates.get("Approved")).toBe("**Complete**");
    expect(gateStates.get("Stable")).toBe("**Pending**");
    expect(gateStates.get("Implemented")).toBe("**Complete**");
    expect(read("docs/reviews/RESET-0001-evidence.md")).toContain("Git commit: `e4a25e9`");
  });

  it("runs under Node.js 24 with accepted original pins and separately recorded MCP additions", () => {
    expect(process.versions.node.split(".")[0]).toBe("24");
    const records = [...read(`${phase}/01-02-SUMMARY.md`).matchAll(/<!-- accepted-package-pins: (.+?) -->/gu)];
    expect(records).toHaveLength(1);
    const tuple = z.tuple([
      z.string().regex(/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/u),
      z.string().regex(/^\d+\.\d+\.\d+$/u),
    ]);
    const accepted = z.strictObject({
      dependencies: z.array(tuple).min(1),
      devDependencies: z.array(tuple).min(1),
    }).parse(JSON.parse(records[0]![1]!));
    const names = [...accepted.dependencies, ...accepted.devDependencies].map(([name]) => name);
    expect(new Set(names).size).toBe(names.length);
    const documentedPins = rows(read(evidencePath), "Reproduction");
    expect(documentedPins.map((row) => row.join(" ")).sort()).toEqual(
      Object.entries(accepted).flatMap(([category, pins]) =>
        pins.map(([name, version]) => `${name} ${version} ${category}`),
      ).sort(),
    );

    const manifest = JSON.parse(read("package.json"));
    const lock = JSON.parse(read("package-lock.json"));
    const additionalPins: Record<"dependencies" | "devDependencies", [string, string][]> = {
      dependencies: [], devDependencies: [],
    };
    const admissionPath = "docs/reviews/DEPENDENCIES-03.json";
    if (existsSync(admissionPath)) {
      const admission = z.strictObject({
        phase: z.literal("UAOS-03"), decision: z.literal("Selected for implementation"),
        installState: z.enum(["planned", "active"]), selectedOn: z.literal("2026-11-09"),
        selectedBy: z.literal("Codex under the user's roadmap implementation authorization"),
        protocolVersion: z.literal("2026-07-28"),
        dependencies: z.array(tuple), devDependencies: z.array(tuple),
        repository: z.literal("https://github.com/modelcontextprotocol/typescript-sdk"),
        nodeEngine: z.literal(">=20"), integrity: z.record(z.string(), z.string().startsWith("sha512-")),
      }).parse(JSON.parse(read(admissionPath)));
      const additions = [...admission.dependencies, ...admission.devDependencies];
      const combinedNames = [...names, ...additions.map(([name]) => name)];
      expect(new Set(combinedNames).size).toBe(combinedNames.length);
      expect(admission.dependencies).toEqual([
        ["@modelcontextprotocol/client", "2.4.0"], ["@modelcontextprotocol/server", "2.4.0"],
      ]);
      expect(admission.devDependencies).toEqual([]);
      if (admission.installState === "active") {
        additionalPins.dependencies = admission.dependencies;
        for (const [name] of additions) {
          expect(lock.packages[`node_modules/${name}`].integrity).toBe(admission.integrity[name]);
        }
      }
    }
    for (const holder of [manifest, lock.packages[""]]) {
      for (const category of ["optionalDependencies", "peerDependencies", "peerDependenciesMeta", "bundleDependencies", "bundledDependencies"]) {
        expect(Object.hasOwn(holder, category)).toBe(false);
      }
    }
    for (const category of ["dependencies", "devDependencies"] as const) {
      const pins = Object.fromEntries([...accepted[category], ...additionalPins[category]]);
      expect(manifest[category]).toEqual(pins);
      expect(lock.packages[""][category]).toEqual(pins);
      for (const [name, version] of [...accepted[category], ...additionalPins[category]]) {
        expect(lock.packages[`node_modules/${name}`].version).toBe(version);
      }
    }
    expect(manifest.engines.node).toBe("24.x");
    expect(manifest.scripts.validate.split(/\s*&&\s*/u)).toEqual([
      "npm run typecheck", "npm run typecheck:core", "npm test", "npm run build",
    ]);
    expect(manifest.scripts["typecheck:core"]).toBe("tsc -p tsconfig.core.json --noEmit");
  });

  it("resolves repository Markdown links and keeps the teaching commands runnable", () => {
    const tracked = execFileSync("git", ["ls-files", "--", "*.md"], { encoding: "utf8" })
      .trim().split(/\r?\n/u);
    const files = new Set([...tracked, evidencePath, guidePath,
      "docs/iterations/03-mcp-boundary.md", "docs/reviews/ITERATION-03-evidence.md"]);
    const broken: string[] = [];
    for (const file of files) {
      const markdown = read(file)
        .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gmu, "")
        .replace(/<automated>[\s\S]*?<\/automated>/gu, "")
        .replace(/`+[^`\n]*`+/gu, "");
      for (const match of markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)) {
        const target = match[1]!.replace(/^<|>$/gu, "");
        if (/^[a-z][a-z0-9+.-]*:|^#/iu.test(target)) continue;
        const local = decodeURIComponent(target.split("#")[0]!);
        if (!existsSync(resolve(dirname(file), local))) broken.push(`${file} -> ${target}`);
      }
    }
    expect(broken).toEqual([]);
    const guide = read(guidePath);
    for (const command of ["npm ci", "npm run build", "npm run validate", "npm run uaos -- ask", "startServer", "/api/v1/agent-runs"]) {
      expect(guide).toContain(command);
    }
  });
});

describe("Iteration 2 review evidence", () => {
  const evidence = "docs/reviews/ITERATION-02-evidence.md";

  it("covers both typed-tool requirements and six distinct control boundaries", () => {
    const requirements = rows(read(".planning/REQUIREMENTS.md"), "Traceability")
      .filter((row) => row[1] === "Phase 2");
    const coverage = rows(read(evidence), "Requirement traceability");
    expect(coverage.map((row) => row[0]).sort()).toEqual(["TOOL-01", "TOOL-02"]);
    expect(coverage.map((row) => row[0]).sort()).toEqual(requirements.map((row) => row[0]).sort());
    for (const row of [...requirements, ...coverage]) {
      expect(row[2]).toBe("Implemented — review pending");
    }
    const threats = rows(read(evidence), "Threat traceability");
    expect(threats.map((row) => row[0])).toEqual([
      "T-02-01", "T-02-02", "T-02-03", "T-02-04", "T-02-05", "T-02-06",
    ]);
    for (const row of threats) expect(row[2]).toMatch(/\]\(.*\.test\.ts\)/u);
  });

  it("records implementation independently of architectural review and human approval", () => {
    const stateRows = rows(read(evidence), "Review state");
    expect(stateRows).toHaveLength(5);
    expect(Object.fromEntries(stateRows.map((row) => [row[0], row[1]]))).toEqual({
      Planned: "Complete", Implemented: "Complete", "Architecturally Reviewed": "Pending",
      Approved: "Pending", Stable: "Pending",
    });
    expect(read("docs/architecture/decisions/ADR-0004-typed-tool-registry.md")).toContain("final architectural review pending");
  });
});

describe("Iteration 3 review evidence", () => {
  const evidence = "docs/reviews/ITERATION-03-evidence.md";

  it("traces MCP scope and six trust boundaries to executable checks", () => {
    const requirements = rows(read(".planning/REQUIREMENTS.md"), "Traceability")
      .filter((row) => row[1] === "Phase 3");
    const coverage = rows(read(evidence), "Requirement traceability");
    expect(coverage.map((row) => row[0])).toEqual(["MCP-01"]);
    expect(coverage.map((row) => row[0])).toEqual(requirements.map((row) => row[0]));
    for (const row of [...requirements, ...coverage]) expect(row[2]).toBe("Implemented — review pending");
    const threats = rows(read(evidence), "Threat traceability");
    expect(threats.map((row) => row[0])).toEqual([
      "T-03-01", "T-03-02", "T-03-03", "T-03-04", "T-03-05", "T-03-06",
    ]);
    for (const row of threats) expect(row[2]).toMatch(/\]\(.*\.test\.ts\)/u);
  });

  it("keeps review and approval pending and exposes reproducible teaching commands", () => {
    expect(Object.fromEntries(rows(read(evidence), "Review state").map((row) => [row[0], row[1]]))).toEqual({
      Planned: "Complete", Implemented: "Complete", "Architecturally Reviewed": "Pending",
      Approved: "Pending", Stable: "Pending",
    });
    const guide = read("docs/iterations/03-mcp-boundary.md");
    for (const command of ["npm ci", "npm run build", "UAOS_ITERATION", "UAOS_MCP_CONSENT", "npm run uaos -- ask",
      "startServer", "/api/v1/agent-runs", "npm run validate"]) expect(guide).toContain(command);
    expect(read("docs/architecture/decisions/ADR-0005-mcp-boundary.md")).toContain("architectural review pending");
  });
});
