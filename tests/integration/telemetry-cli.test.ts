import { describe, expect, it, vi } from "vitest";

import { runCli } from "../../src/adapters/inbound/cli.js";
import { createDiagnoseTelemetry } from "../../src/application/diagnose-telemetry.js";
import { TelemetryBoundaryError } from "../../src/domain/telemetry-contracts.js";
import { telemetryTraceFixture } from "../fixtures/telemetry-trace.js";

describe("Operator telemetry inspection CLI", () => {
  it.each([true, false])("returns complete=%s with distinct complete/incomplete exit codes", async (complete) => {
    const records = telemetryTraceFixture();
    const stdout: string[] = [], stderr: string[] = [], unusedRun = vi.fn(async () => { throw new Error("Unexpected run"); });
    const inspect = createDiagnoseTelemetry({ read: async () => complete ? records : null });
    const code = await runCli({ argv: ["inspect", "run-fixture"], stdout: { write: (value) => stdout.push(value) }, stderr: { write: (value) => stderr.push(value) },
      runtimeFactory: async () => ({ runAgent: unusedRun, inspect }) });
    expect(code).toBe(complete ? 0 : 2); expect(stderr).toEqual([]); expect(unusedRun).not.toHaveBeenCalled();
    expect(JSON.parse(stdout.join(""))).toMatchObject({ complete });
  });

  it("rejects extra arguments without starting the runtime and sanitizes boundary failures", async () => {
    const stderr: string[] = [], factory = vi.fn(async () => { throw new Error("private startup"); });
    expect(await runCli({ argv: ["inspect", "run-one", "private input"], stderr: { write: (value) => stderr.push(value) }, runtimeFactory: factory })).toBe(1);
    expect(factory).not.toHaveBeenCalled(); expect(stderr.join("")).not.toMatch(/private/u);
    stderr.length = 0;
    expect(await runCli({ argv: ["inspect", "../private"], stderr: { write: (value) => stderr.push(value) },
      runtimeFactory: async () => ({ runAgent: async () => { throw new Error("unused"); }, inspect: async () => { throw new TelemetryBoundaryError("INVALID_TRACE_ID"); } }) })).toBe(1);
    expect(stderr.join("")).toContain("INVALID_TRACE_ID"); expect(stderr.join("")).not.toContain("../private");
  });
});
