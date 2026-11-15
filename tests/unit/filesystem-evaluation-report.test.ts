import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FilesystemEvaluationReport } from "../../src/adapters/outbound/filesystem-evaluation-report.js";
import { EvaluationReportSchema, type EvaluationReport } from "../../src/domain/evaluation-contracts.js";
import { evaluationReportFixture } from "../fixtures/evaluation-report.js";

const roots: string[] = [];
async function root() { const value = await mkdtemp(join(tmpdir(), "uaos-eval-report-")); roots.push(value); return value; }
const signal = () => new AbortController().signal;
afterEach(async () => {
  for (const value of roots.splice(0)) {
    expect(dirname(resolve(value))).toBe(resolve(tmpdir()));
    expect(basename(value)).toMatch(/^uaos-eval-report-/u);
    await rm(value, { recursive: true, force: true });
  }
});

describe("Awaited immutable evaluation reports", () => {
  it("publishes complete validated JSON without temporary files and refuses overwrite", async () => {
    const directory = await root(), report = evaluationReportFixture();
    const store = new FilesystemEvaluationReport({ root: directory });
    await store.save(report, signal());
    const filename = `${report.evaluationId}.json`;
    const original = await readFile(join(directory, filename), "utf8");
    expect(EvaluationReportSchema.parse(JSON.parse(original))).toEqual(report);
    await expect(store.save(report, signal())).rejects.toMatchObject({ code: "REPORT_FAILURE" });
    expect(await readFile(join(directory, filename), "utf8")).toBe(original);
    expect(await readdir(directory)).toEqual([filename]);
  });

  it("preserves unexpected pre-existing content when publication fails", async () => {
    const directory = await root(), report = evaluationReportFixture();
    const filename = `${report.evaluationId}.json`;
    await writeFile(join(directory, filename), "pre-existing content");
    await expect(new FilesystemEvaluationReport({ root: directory }).save(report, signal())).rejects.toMatchObject({ code: "REPORT_FAILURE" });
    expect(await readFile(join(directory, filename), "utf8")).toBe("pre-existing content");
    expect(await readdir(directory)).toEqual([filename]);
  });

  it("rejects unsafe/reserved identities and raw report fields before filesystem effects", async () => {
    const directory = await root();
    const store = new FilesystemEvaluationReport({ root: directory });
    for (const evaluationId of ["../escape", "CON", "evaluation-a/b"]) {
      await expect(store.save({ ...evaluationReportFixture(), evaluationId }, signal())).rejects.toMatchObject({
        code: "REPORT_FAILURE", message: "The evaluation operation could not be completed.",
      });
    }
    const invalid = { ...evaluationReportFixture(), question: "secret question" } as EvaluationReport;
    await expect(store.save(invalid, signal())).rejects.toMatchObject({ code: "REPORT_FAILURE" });
    expect(await readdir(directory)).toEqual([]);
  });

  it("preserves pre-abort reason and normalizes unusable-root exceptions", async () => {
    const directory = await root(), path = join(directory, "file"); await writeFile(path, "original");
    const caller = new AbortController(), reason = new Error("caller cancelled"); caller.abort(reason);
    const store = new FilesystemEvaluationReport({ root: directory });
    await expect(store.save(evaluationReportFixture(), caller.signal)).rejects.toBe(reason);
    await expect(new FilesystemEvaluationReport({ root: path }).save(evaluationReportFixture(), signal())).rejects.toMatchObject({
      code: "REPORT_FAILURE", message: "The evaluation operation could not be completed.",
    });
    expect(await readFile(path, "utf8")).toBe("original");
    expect(await readdir(directory)).toEqual(["file"]);
  });
});
