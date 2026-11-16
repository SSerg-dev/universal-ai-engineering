import { describe, expect, it, vi } from "vitest";
import { runCli } from "../../src/adapters/inbound/cli.js";
import { buildHttpApp } from "../../src/adapters/inbound/http.js";
import { createGuardedRuntime } from "../../src/composition/create-guarded-runtime.js";
import { GuardBoundaryError, GuardCommandSchema, GuardCommandSuccessSchema, type GuardBoundaryCode } from "../../src/domain/guard-contracts.js";
import { guardFixture } from "../fixtures/guard.js";

function runtime() {
  const runAgent = vi.fn(async () => { throw new Error("Agent execution is not a guard command"); });
  const { inputDigest: _inputDigest, ...value } = guardFixture().pending;
  const guardCommand = vi.fn(async (input: unknown) => {
    const command = GuardCommandSchema.safeParse(input);
    if (!command.success) throw new GuardBoundaryError("GUARD_INPUT_INVALID");
    if (command.data.operation !== "read") throw new GuardBoundaryError("GUARD_APPROVAL_REQUIRED");
    return GuardCommandSuccessSchema.parse({ ok: true, operation: "read", value });
  });
  return { runAgent, guardCommand };
}
describe("strict guard CLI and same-origin JSON API", () => {
  it("serializes one validated public command result and cleans its SIGINT listener", async () => {
    const selected = runtime(), output: string[] = [], errors: string[] = [], before = process.listenerCount("SIGINT");
    expect(await runCli({ argv: ["guard", JSON.stringify({ operation: "read", approvalId: "approval-one" })],
      runtimeFactory: async () => selected, stdout: { write: (text) => output.push(text) }, stderr: { write: (text) => errors.push(text) } })).toBe(0);
    expect(GuardCommandSuccessSchema.parse(JSON.parse(output.join("")))).toMatchObject({ operation: "read", value: { state: "pending" } });
    expect(output.join("")).not.toMatch(/inputDigest|lease-/u); expect(errors).toEqual([]);
    expect(selected.runAgent).not.toHaveBeenCalled(); expect(process.listenerCount("SIGINT")).toBe(before);
  });
  it.each([["guard"], ["guard", "{private-invalid-json"], ["guard", "{}", "extra"]])("rejects malformed CLI arguments %j without echoing input", async (...argv) => {
    const selected = runtime(), output: string[] = [], errors: string[] = [];
    expect(await runCli({ argv, runtimeFactory: async () => selected, stdout: { write: (text) => output.push(text) }, stderr: { write: (text) => errors.push(text) } })).toBe(1);
    expect(errors.join("")).toContain("GUARD_INPUT_INVALID"); expect(errors.join("")).not.toContain("private-invalid");
    expect(output).toEqual([]); expect(selected.runAgent).not.toHaveBeenCalled();
  });
  it("enforces Origin, JSON transport, strict commands and no-store proposal responses", async () => {
    const selected = runtime(), app = buildHttpApp(selected);
    try {
      const command = { operation: "read", approvalId: "approval-one" };
      for (const origin of ["https://untrusted.example", "null"]) {
        const rejected = await app.inject({ method: "POST", url: "/api/v1/guard-commands", headers: { origin }, payload: command });
        expect(rejected.statusCode).toBe(403); expect(rejected.json()).toMatchObject({ error: { code: "GUARD_DENIED" } });
      }
      expect(selected.guardCommand).not.toHaveBeenCalled();
      const allowed = await app.inject({ method: "POST", url: "/api/v1/guard-commands", headers: { host: "localhost", origin: "http://localhost" }, payload: command });
      expect(allowed.statusCode).toBe(200); expect(allowed.headers["cache-control"]).toBe("no-store");
      expect(GuardCommandSuccessSchema.parse(allowed.json())).toMatchObject({ operation: "read" });
      const invalid = await app.inject({ method: "POST", url: "/api/v1/guard-commands", payload: { ...command, approved: true } });
      expect(invalid.statusCode).toBe(400);
      const text = await app.inject({ method: "POST", url: "/api/v1/guard-commands", headers: { "content-type": "text/plain" }, payload: "private question" });
      expect(text.statusCode).toBe(415); expect(text.body).not.toContain("private question");
      expect(selected.runAgent).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
  it.each([ ["GUARD_UNCERTAIN", 409], ["GUARD_AUDIT_FAILURE", 500], ["GUARD_EXPIRED", 410], ["GUARD_APPROVAL_REQUIRED", 403] ] as const)("preserves %s and its static status", async (code: GuardBoundaryCode, status) => {
    const selected = runtime(); selected.guardCommand.mockRejectedValue(new GuardBoundaryError(code));
    const app = buildHttpApp(selected);
    try {
      const response = await app.inject({ method: "POST", url: "/api/v1/guard-commands", payload: { operation: "read", approvalId: "approval-one" } });
      expect(response.statusCode).toBe(status); expect(response.json()).toEqual({ ok: false, error: { code, message: "The guarded operation could not be completed." } });
    } finally { await app.close(); }
  });
  it("does not install guard commands on earlier runtimes and rejects an invalid host policy before any database connection", async () => {
    const app = buildHttpApp({ runAgent: runtime().runAgent });
    try { expect((await app.inject({ method: "POST", url: "/api/v1/guard-commands", payload: {} })).statusCode).toBe(404); }
    finally { await app.close(); }
    await expect(createGuardedRuntime({ fixtureRoot: "unused", journalRoot: "unused", reportRoot: "unused", telemetryRoot: "unused",
      exportRoot: "unused", guardPolicy: { approved: true }, databaseUrl: "unreachable private connection" })).rejects.toMatchObject({ code: "GUARD_POLICY_INVALID" });
  });
});
