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

  it("runs under Node.js 24 with accepted original pins and separately recorded adapter additions", () => {
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
    const retrievalAdmissionPath = "docs/reviews/DEPENDENCIES-04.json";
    if (existsSync(retrievalAdmissionPath)) {
      const admission = z.strictObject({
        phase: z.literal("UAOS-04"), decision: z.literal("Selected for implementation"),
        installState: z.enum(["planned", "active"]), selectedOn: z.literal("2026-11-09"),
        selectedBy: z.literal("Codex under the user's roadmap implementation authorization"),
        dependencies: z.array(tuple), devDependencies: z.array(tuple),
        repository: z.literal("https://github.com/brianc/node-postgres"),
        typesRepository: z.literal("https://github.com/DefinitelyTyped/DefinitelyTyped"),
        nodeEngine: z.literal(">=16"), integrity: z.record(z.string(), z.string().startsWith("sha512-")),
      }).parse(JSON.parse(read(retrievalAdmissionPath)));
      expect(admission.dependencies).toEqual([["pg", "8.23.1"]]);
      expect(admission.devDependencies).toEqual([["@types/pg", "8.23.1"]]);
      if (admission.installState === "active") {
        for (const category of ["dependencies", "devDependencies"] as const) {
          additionalPins[category].push(...admission[category]);
          for (const [name] of admission[category]) expect(lock.packages[`node_modules/${name}`].integrity).toBe(admission.integrity[name]);
        }
      }
    }
    const documentAdmissionPath = "docs/reviews/DEPENDENCIES-DOC-02.json";
    if (existsSync(documentAdmissionPath)) {
      const admission = z.strictObject({
        scope: z.literal("DOC-02"), decision: z.literal("Selected for implementation"),
        installState: z.literal("active"), selectedOn: z.literal("2026-11-26"),
        selectedBy: z.literal("Codex under the user's explicit autonomous implementation authorization"),
        dependencies: z.array(tuple), devDependencies: z.array(tuple),
        securityReplacements: z.array(z.strictObject({
          name: z.string().regex(/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/u),
          from: z.string().regex(/^\d+\.\d+\.\d+$/u), to: z.string().regex(/^\d+\.\d+\.\d+$/u),
          advisory: z.string().regex(/^GHSA-/u),
        })),
        transitiveResolutions: z.array(z.tuple([z.string().min(1), z.string().regex(/^\d+\.\d+\.\d+$/u)])),
        integrity: z.record(z.string(), z.string().startsWith("sha512-")),
        audit: z.strictObject({ runtime: z.literal("Node.js 24.22.1"), npm: z.literal("11.20.0"),
          command: z.literal("npm audit --omit=dev --json"), vulnerabilities: z.literal(0) }),
      }).parse(JSON.parse(read(documentAdmissionPath)));
      expect(admission.dependencies).toEqual([["mammoth", "1.13.0"], ["unpdf", "1.9.1"]]);
      expect(admission.devDependencies).toEqual([]);
      expect(admission.securityReplacements).toEqual([
        { name: "zod", from: "4.6.5", to: "4.6.7", advisory: "GHSA-mrhx-c7xc-m3w5" },
        { name: "fastify", from: "5.12.5", to: "5.12.8", advisory: "GHSA-389g-gv7q-r4x8" },
      ]);
      for (const replacement of admission.securityReplacements) {
        const index = accepted.dependencies.findIndex(([name, version]) => name === replacement.name && version === replacement.from);
        expect(index).toBeGreaterThanOrEqual(0);
        accepted.dependencies[index] = [replacement.name, replacement.to];
        expect(lock.packages[`node_modules/${replacement.name}`].integrity).toBe(admission.integrity[replacement.name]);
      }
      additionalPins.dependencies.push(...admission.dependencies);
      for (const [name] of admission.dependencies) {
        expect(lock.packages[`node_modules/${name}`].integrity).toBe(admission.integrity[name]);
      }
      expect(lock.packages["node_modules/fast-uri"].version).toBe("4.2.4");
      expect(lock.packages["node_modules/ajv/node_modules/fast-uri"].version).toBe("3.1.9");
    }
    const allNames = [...names, ...additionalPins.dependencies.map(([name]) => name), ...additionalPins.devDependencies.map(([name]) => name)];
    expect(new Set(allNames).size).toBe(allNames.length);
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
      "docs/iterations/03-mcp-boundary.md", "docs/reviews/ITERATION-03-evidence.md",
      "docs/iterations/04-grounded-retrieval.md", "docs/reviews/ITERATION-04-evidence.md",
      "docs/iterations/05-durable-state-memory.md", "docs/reviews/ITERATION-05-evidence.md",
      "docs/iterations/06-evaluation-system.md", "docs/reviews/ITERATION-06-evidence.md",
      "docs/iterations/07-observability.md", "docs/reviews/ITERATION-07-evidence.md",
      "docs/iterations/08-streaming-angular-ui.md", "docs/reviews/ITERATION-08-evidence.md",
      ".planning/phases/UAOS-08-streaming-angular-ui/08-02-SUMMARY.md"]);
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

describe("Iteration 4 review evidence", () => {
  const evidence = "docs/reviews/ITERATION-04-evidence.md";

  it("traces both RAG requirements and seven independent boundaries", () => {
    const requirements = rows(read(".planning/REQUIREMENTS.md"), "Traceability")
      .filter((row) => row[1] === "Phase 4");
    const coverage = rows(read(evidence), "Requirement traceability");
    expect(coverage.map((row) => row[0])).toEqual(["RAG-01", "RAG-02"]);
    expect(coverage.map((row) => row[0])).toEqual(requirements.map((row) => row[0]));
    for (const row of [...requirements, ...coverage]) expect(row[2]).toBe("Implemented — review pending");
    const threats = rows(read(evidence), "Threat traceability");
    expect(threats.map((row) => row[0])).toEqual(Array.from({ length: 7 }, (_, i) => `T-04-${String(i + 1).padStart(2, "0")}`));
    for (const row of threats) expect(row[2]).toMatch(/\]\(.*\.test\.ts\)/u);
  });

  it("requires explicit real-database verification and keeps approval separate", () => {
    expect(Object.fromEntries(rows(read(evidence), "Review state").map((row) => [row[0], row[1]]))).toEqual({
      Planned: "Complete", Implemented: "Complete", "Architecturally Reviewed": "Pending",
      Approved: "Pending", Stable: "Pending",
    });
    const guide = read("docs/iterations/04-grounded-retrieval.md");
    for (const command of ["npm ci", "npm run build", "npm run ingest", "npm run uaos -- ask", "npm run uaos -- cite",
      "startServer", "/api/v1/citations/resolve", "npm run validate", "npm run test:database"]) expect(guide).toContain(command);
    const manifest = JSON.parse(read("package.json"));
    expect(manifest.scripts["test:database"]).toBe("node scripts/test-database.mjs");
    const infrastructure = JSON.parse(read("docs/reviews/INFRASTRUCTURE-04.json"));
    expect(infrastructure.image).toMatch(/^pgvector\/pgvector@sha256:[a-f0-9]{64}$/u);
    expect(read("compose.retrieval.yaml")).toContain(infrastructure.image);
    expect(read("docs/architecture/decisions/ADR-0006-grounded-retrieval.md")).toContain("architectural review pending");
  });
});

describe("Iteration 5 review evidence", () => {
  const evidence = "docs/reviews/ITERATION-05-evidence.md";

  it("traces durable memory and seven state/audit boundaries", () => {
    const requirements = rows(read(".planning/REQUIREMENTS.md"), "Traceability").filter((row) => row[1] === "Phase 5");
    const coverage = rows(read(evidence), "Requirement traceability");
    expect(coverage.map((row) => row[0])).toEqual(["MEM-01"]);
    expect(coverage.map((row) => row[0])).toEqual(requirements.map((row) => row[0]));
    for (const row of [...requirements, ...coverage]) expect(row[2]).toBe("Implemented — review pending");
    const threats = rows(read(evidence), "Threat traceability");
    expect(threats.map((row) => row[0])).toEqual(Array.from({ length: 7 }, (_, i) => `T-05-${String(i + 1).padStart(2, "0")}`));
    for (const row of threats) expect(row[2]).toMatch(/\]\(.*\.test\.ts\)/u);
  });

  it("requires explicit content retention and keeps review/approval pending", () => {
    expect(Object.fromEntries(rows(read(evidence), "Review state").map((row) => [row[0], row[1]]))).toEqual({
      Planned: "Complete", Implemented: "Complete", "Architecturally Reviewed": "Pending", Approved: "Pending", Stable: "Pending",
    });
    const guide = read("docs/iterations/05-durable-state-memory.md");
    for (const command of ["npm ci", "npm run build", "npm run ingest", "state $json", "retentionSeconds",
      "run_turn", "write_memory", "recover", "purge", "/api/v1/conversation-commands", "npm run validate", "npm run test:database"]) expect(guide).toContain(command);
    expect(read("docs/architecture/decisions/ADR-0007-durable-conversation-state.md")).toContain("architectural review pending");
  });
});

describe("Iteration 6 review evidence", () => {
  const evidence = "docs/reviews/ITERATION-06-evidence.md";
  it("traces evaluation scope and seven independent quality/evidence boundaries", () => {
    const requirements = rows(read(".planning/REQUIREMENTS.md"), "Traceability").filter((row) => row[1] === "Phase 6");
    const coverage = rows(read(evidence), "Requirement traceability");
    expect(coverage.map((row) => row[0])).toEqual(["EVAL-01"]);
    expect(coverage.map((row) => row[0])).toEqual(requirements.map((row) => row[0]));
    for (const row of [...requirements, ...coverage]) expect(row[2]).toBe("Implemented — review pending");
    const threats = rows(read(evidence), "Threat traceability");
    expect(threats.map((row) => row[0])).toEqual(Array.from({ length: 7 }, (_, i) => `T-06-${String(i + 1).padStart(2, "0")}`));
    for (const row of threats) expect(row[2]).toMatch(/\]\(.*\.test\.ts\)/u);
  });
  it("keeps approval pending and provides executable baseline/regression reproduction", () => {
    expect(Object.fromEntries(rows(read(evidence), "Review state").map((row) => [row[0], row[1]]))).toEqual({
      Planned: "Complete", Implemented: "Complete", "Architecturally Reviewed": "Pending", Approved: "Pending", Stable: "Pending",
    });
    const guide = read("docs/iterations/06-evaluation-system.md");
    for (const command of ["npm ci", "npm run build", "npm run ingest", "UAOS_ITERATION", "uaos -- eval", "UAOS_REPORT_ROOT",
      "known unsupported-answer regression", "npm run validate", "npm run test:database"]) expect(guide).toContain(command);
    expect(read("docs/architecture/decisions/ADR-0008-deterministic-evaluation.md")).toContain("architectural review pending");
  });
});

describe("Iteration 7 review evidence", () => {
  const evidence = "docs/reviews/ITERATION-07-evidence.md";
  it("traces observability scope and seven independent privacy/delivery/diagnosis boundaries", () => {
    const requirements = rows(read(".planning/REQUIREMENTS.md"), "Traceability").filter((row) => row[1] === "Phase 7");
    const coverage = rows(read(evidence), "Requirement traceability");
    expect(coverage.map((row) => row[0])).toEqual(["OBS-01"]);
    expect(coverage.map((row) => row[0])).toEqual(requirements.map((row) => row[0]));
    for (const row of [...requirements, ...coverage]) expect(row[2]).toBe("Implemented — review pending");
    const threats = rows(read(evidence), "Threat traceability");
    expect(threats.map((row) => row[0])).toEqual(Array.from({ length: 7 }, (_, i) => `T-07-${String(i + 1).padStart(2, "0")}`));
    for (const row of threats) expect(row[2]).toMatch(/\]\(.*\.test\.ts\)/u);
  });
  it("keeps approval pending and documents safe actual failure diagnosis without the database", () => {
    expect(Object.fromEntries(rows(read(evidence), "Review state").map((row) => [row[0], row[1]]))).toEqual({
      Planned: "Complete", Implemented: "Complete", "Architecturally Reviewed": "Pending", Approved: "Pending", Stable: "Pending",
    });
    const guide = read("docs/iterations/07-observability.md");
    for (const command of ["npm ci", "npm run build", "npm run ingest", "UAOS_ITERATION", "uaos -- inspect", "UAOS_TELEMETRY_ROOT",
      "TOOL_PERMISSION_DENIED", "250 ms", "startServer", "npm run validate", "npm run test:database"]) expect(guide).toContain(command);
    expect(read("docs/architecture/decisions/ADR-0009-safe-observability.md")).toContain("architectural review pending");
    expect(read("docs/architecture/decisions/ADR-0010-bounded-telemetry-batches.md")).toContain("architectural review pending");
  });
});

describe("Iteration 8 review evidence", () => {
  const evidence = "docs/reviews/ITERATION-08-evidence.md";
  it("traces streaming/UI requirements and eight protocol/privacy/build/rendered-evidence boundaries", () => {
    const requirements = rows(read(".planning/REQUIREMENTS.md"), "Traceability").filter((row) => row[1] === "Phase 8");
    const coverage = rows(read(evidence), "Requirement traceability");
    expect(coverage.map((row) => row[0])).toEqual(["STREAM-01", "UI-01"]);
    expect(coverage.map((row) => row[0])).toEqual(requirements.map((row) => row[0]));
    for (const row of [...requirements, ...coverage]) expect(row[2]).toBe("Implemented — review pending");
    const threats = rows(read(evidence), "Threat traceability");
    expect(threats.map((row) => row[0])).toEqual(Array.from({ length: 8 }, (_, i) => `T-08-${String(i + 1).padStart(2, "0")}`));
    for (const row of threats) expect(row[2]).toMatch(/\]\(.*(?:\.test\.ts|\.spec\.ts|\.mjs)\)/u);
  });
  it("keeps human acceptance separate and makes all-package/database/browser reproduction explicit", () => {
    expect(Object.fromEntries(rows(read(evidence), "Review state").map((row) => [row[0], row[1]]))).toEqual({
      Planned: "Complete", Implemented: "Complete", "Architecturally Reviewed": "Pending", Approved: "Pending", Stable: "Pending",
    });
    const guide = read("docs/iterations/08-streaming-angular-ui.md");
    for (const command of ["npm ci", "npm --prefix ui ci", "npm run build:ui", "npm --prefix ui start", "UAOS_ITERATION", "startServer",
      "npm run validate:all", "npm run test:database", "npm run test:browser", "UAOS_BROWSER_BIN"]) expect(guide).toContain(command);
    const coverage = JSON.parse(read(".planning/phases/UAOS-08-streaming-angular-ui/08-UI-PROBE.json"));
    expect(coverage.coverage).toMatchObject({ applicable: 30, resolved: 30, unresolved: 0, unclassified: 0 });
    expect(read("docs/architecture/decisions/ADR-0012-isolated-angular-build.md")).toContain("architectural review pending");
  });
  it("retains source-bound real-browser results and six valid desktop/mobile PNG artifacts", () => {
    const directory = "docs/reviews/iteration-08-assets", report = JSON.parse(read(`${directory}/result.json`));
    expect(report).toMatchObject({ checkedOn: "2026-11-16", passed: true, externalRequests: 0, runtimeExceptions: 0 });
    expect(report.sourceHead).toMatch(/^[a-f0-9]{40}$/u);
    expect(() => execFileSync("git", ["merge-base", "--is-ancestor", report.sourceHead, "HEAD"])).not.toThrow();
    expect(report.checks).toHaveLength(7); expect(new Set(report.checks).size).toBe(7);
    expect(report.screenshots).toHaveLength(6);
    expect(report.browser).toMatch(/^(?:Chrome|Edg)\//u);
    for (const screenshot of report.screenshots as { filename: string; width: number; height: number }[]) {
      expect(screenshot.filename).toMatch(/^(?:desktop|mobile)-[a-z-]+\.png$/u);
      const data = readFileSync(`${directory}/${screenshot.filename}`);
      expect(data.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(data.readUInt32BE(16)).toBe(screenshot.width); expect(data.readUInt32BE(20)).toBe(screenshot.height);
      expect([360, 1440]).toContain(screenshot.width); expect(screenshot.height).toBeLessThanOrEqual(10_000);
    }
    expect(Object.keys(report.assetDigests)).toHaveLength(2);
    for (const digest of Object.values(report.assetDigests)) expect(digest).toMatch(/^[a-f0-9]{64}$/u);
  });
});

describe("Iteration 9 review evidence", () => {
  const evidence = "docs/reviews/ITERATION-09-evidence.md";
  it("traces guard scope and eight policy/approval/audit/recovery boundaries to executable evidence", () => {
    const requirements = rows(read(".planning/REQUIREMENTS.md"), "Traceability").filter((row) => row[1] === "Phase 9");
    const coverage = rows(read(evidence), "Requirement traceability");
    expect(coverage.map((row) => row[0])).toEqual(["GUARD-01"]);
    expect(coverage.map((row) => row[0])).toEqual(requirements.map((row) => row[0]));
    for (const row of [...requirements, ...coverage]) expect(row[2]).toBe("Implemented — review pending");
    const threats = rows(read(evidence), "Threat traceability");
    expect(threats.map((row) => row[0])).toEqual(Array.from({ length: 8 }, (_, i) => `T-09-${String(i + 1).padStart(2, "0")}`));
    for (const row of threats) expect(row[2]).toMatch(/\]\(.*\.test\.ts\)/u);
  });
  it("keeps explicit operator approval distinct and provides runnable review/export/reconcile commands with valid links", () => {
    expect(Object.fromEntries(rows(read(evidence), "Review state").map((row) => [row[0], row[1]]))).toEqual({
      Planned: "Complete", Implemented: "Complete", "Architecturally Reviewed": "Pending", Approved: "Pending", Stable: "Pending",
    });
    const guide = "docs/iterations/09-guardrails-approval.md", io = "docs/architecture/guard-command-io.md";
    for (const command of ["npm ci", "npm run build", "npm run ingest", "UAOS_ITERATION", "prepare_export", "proposalDigest", "expectedVersion",
      "'approve'", "'deny'", "'execute'", "'reconcile'", "purge_expired", "npm run validate:all", "npm run test:database"]) expect(read(guide)).toContain(command);
    const adr = "docs/architecture/decisions/ADR-0013-guarded-execution-and-approved-export.md";
    expect(read(adr)).toContain("architectural review pending");
    for (const file of [guide, io, evidence, adr, ".planning/phases/UAOS-09-guardrails-approval/09-THREAT-MODEL.md"]) {
      for (const match of read(file).matchAll(/\]\(([^)]+)\)/gu)) {
        const target = match[1]!;
        if (/^(?:https?:|#)/u.test(target)) continue;
        expect(existsSync(resolve(dirname(file), target.split("#")[0]!)), `${file} => ${target}`).toBe(true);
      }
    }
  });
});
