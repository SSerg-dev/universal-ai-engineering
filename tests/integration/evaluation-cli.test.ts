import { describe, expect, it, vi } from "vitest";

import { runCli } from "../../src/adapters/inbound/cli.js";
import { EvaluationReportSchema } from "../../src/domain/evaluation-contracts.js";
import { evaluationReportFixture } from "../fixtures/evaluation-report.js";

const unusedRun = vi.fn(async () => { throw new Error("Unexpected standalone execution"); });
describe("Operator evaluation CLI", () => {
  it.each([true, false])("prints a validated safe report with passing gate=%s", async (passed) => {
    const report = evaluationReportFixture();
    if (!passed) {
      report.cases[0]!.checks.grounding = { status: "failed", code: "UNSUPPORTED_ANSWER" };
      report.cases[0]!.passed = false;
      report.metrics.grounding = { passed: 2, applicable: 3, rate: 2 / 3, meetsThreshold: false };
      report.gate = { passed: false, failedDimensions: ["grounding"] };
    }
    const stdout: string[] = [], stderr: string[] = [], evaluate = vi.fn(async () => report);
    const code = await runCli({ argv: ["eval"], stdout: { write: (text) => stdout.push(text) }, stderr: { write: (text) => stderr.push(text) },
      runtimeFactory: async () => ({ runAgent: unusedRun, evaluate }) });
    expect(code).toBe(passed ? 0 : 2); expect(stderr).toEqual([]);
    expect(EvaluationReportSchema.parse(JSON.parse(stdout.join("")))).toEqual(report);
    expect(evaluate).toHaveBeenCalledWith(expect.any(AbortSignal)); expect(unusedRun).not.toHaveBeenCalled();
  });

  it("rejects extra CLI arguments without executing a case or leaking input", async () => {
    const stdout: string[] = [], stderr: string[] = [], evaluate = vi.fn(async () => evaluationReportFixture());
    expect(await runCli({ argv: ["eval", "private input"], stdout: { write: (text) => stdout.push(text) }, stderr: { write: (text) => stderr.push(text) },
      runtimeFactory: async () => ({ runAgent: unusedRun, evaluate }) })).toBe(1);
    expect(evaluate).not.toHaveBeenCalled(); expect(stdout).toEqual([]);
    expect(stderr.join("")).toBe("Error [EVALUATION_INVALID]: The evaluation operation could not be completed.\n");
  });

  it("forwards cancellation and cleans SIGINT listeners without exposing raw failure text", async () => {
    const before = process.listenerCount("SIGINT"), stderr: string[] = [];
    const code = await runCli({ argv: ["eval"], stdout: { write: () => {} }, stderr: { write: (text) => stderr.push(text) },
      runtimeFactory: async () => ({ runAgent: unusedRun, evaluate: async (signal) => {
        process.emit("SIGINT"); expect(signal?.aborted).toBe(true); throw new Error("private database URL");
      } }) });
    expect(code).toBe(1); expect(process.listenerCount("SIGINT")).toBe(before);
    expect(stderr.join("")).not.toContain("private database URL");
  });
});
