import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const recoveryCommit = "e4a25e9";

const retiredFiles = [
  "ROADMAP.md",
  "agentic-os/README.md",
  "architecture/UAEA.md",
  "architecture/decisions/README.md",
  "architecture/diagrams/README.md",
  "charter/Project-Charter.md",
  "constitution/Constitution.md",
  "methodology/README.md",
  "reference/README.md",
  "registry/Artifact-Registry.md",
  "registry/artifacts.yaml",
  "registry/artifacts/README.md",
  "reviews/UAE-0002-architecture-review-gate.md",
  "reviews/UAE-0003-single-branch-workflow.md",
  "reviews/UAE-0004-foundation-consistency-review.md",
  "senior-handbook/README.md",
  "standards/UGSD-Specification.md",
] as const;

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

describe("RESET-0001 recovery evidence", () => {
  it("keeps the declared recovery commit and all retired files recoverable", () => {
    expect(git("rev-parse", "--verify", `${recoveryCommit}^{commit}`)).toMatch(
      new RegExp(`^${recoveryCommit}`),
    );

    const recoveryTree = new Set(
      git("ls-tree", "-r", "--name-only", recoveryCommit).split(/\r?\n/u),
    );

    for (const retiredFile of retiredFiles) {
      expect(recoveryTree, `${retiredFile} missing at ${recoveryCommit}`).toContain(
        retiredFile,
      );
      expect(existsSync(retiredFile), `${retiredFile} unexpectedly active`).toBe(
        false,
      );
    }
  });

  it("preserves migrations and the explicit Pending governance states", () => {
    const evidence = readFileSync("docs/reviews/RESET-0001-evidence.md", "utf8");

    expect(evidence).toContain(`Git commit: \`${recoveryCommit}\``);
    expect(evidence).toContain("Declared Retirements");
    expect(evidence).toContain(
      "docs/architecture/decisions/ADR-0001-foundation-baseline.md",
    );
    expect(evidence).toContain("**Architecturally Reviewed:** Pending");
    expect(evidence).toContain("**Approved:** Pending");
    expect(evidence).toContain("**Stable:** Pending");
  });
});
