import { describe, expect, it, vi } from "vitest";

import { runCli } from "../../src/adapters/inbound/cli.js";
import { buildHttpApp } from "../../src/adapters/inbound/http.js";
import { RetrievalBoundaryError } from "../../src/domain/retrieval-contracts.js";

const citation = { indexId: "course", documentId: "doc", revision: "a".repeat(64), passageId: "b".repeat(64), start: 0, end: 5 };
const passage = { ...citation, title: "Document", ordinal: 0, text: "quote" };
const unusedRun = vi.fn(async () => ({ ok: false as const, runId: "unused", error: {
  code: "INTERNAL_ERROR" as const, stage: "orchestration" as const, message: "unused", retryable: false,
} }));

describe("Read-only citation adapters", () => {
  it("resolves CLI citations without invoking an agent run", async () => {
    const stdout: string[] = []; const stderr: string[] = [];
    const resolveCitation = vi.fn(async () => passage);
    const status = await runCli({ argv: ["cite", JSON.stringify(citation)],
      stdout: { write: (text) => stdout.push(text) }, stderr: { write: (text) => stderr.push(text) },
      runtimeFactory: async () => ({ runAgent: unusedRun, resolveCitation }),
    });
    expect(status).toBe(0);
    expect(JSON.parse(stdout.join(""))).toEqual(passage);
    expect(stderr).toEqual([]);
    expect(resolveCitation).toHaveBeenCalledWith(citation, expect.any(AbortSignal));
    expect(unusedRun).not.toHaveBeenCalled();
  });

  it("normalizes malformed CLI JSON and hides resolver exceptions", async () => {
    for (const input of ["not json", JSON.stringify(citation)]) {
      const stdout: string[] = []; const stderr: string[] = [];
      const status = await runCli({ argv: ["cite", input],
        stdout: { write: (text) => stdout.push(text) }, stderr: { write: (text) => stderr.push(text) },
        runtimeFactory: async () => ({ runAgent: unusedRun, resolveCitation: async () => { throw new Error("secret database URL"); } }),
      });
      expect(status).toBe(1); expect(stdout).toEqual([]);
      expect(stderr.join("")).toBe("Error: The indexed citation could not be resolved.\n");
    }
  });

  it.each([
    { status: 404, result: null, error: undefined, code: "CITATION_NOT_FOUND" },
    { status: 400, result: null, error: new RetrievalBoundaryError("CITATION_INVALID"), code: "INVALID_CITATION" },
    { status: 500, result: null, error: new Error("secret SQL credentials"), code: "CITATION_FAILURE" },
  ])("returns safe resolver HTTP $status without agent effects", async ({ status, result, error, code }) => {
    const app = buildHttpApp({ runAgent: unusedRun, resolveCitation: async () => { if (error) throw error; return result; } });
    try {
      const response = await app.inject({ method: "POST", url: "/api/v1/citations/resolve", payload: citation });
      expect(response.statusCode).toBe(status);
      expect(response.json()).toMatchObject({ ok: false, error: { code } });
      expect(response.body).not.toMatch(/secret|credentials|stack|SQL/u);
      expect(unusedRun).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
});
