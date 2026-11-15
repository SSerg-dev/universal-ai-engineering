import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FilesystemTelemetry } from "../../src/adapters/outbound/filesystem-telemetry.js";
import { createDiagnoseTelemetry } from "../../src/application/diagnose-telemetry.js";
import { telemetryTraceFixture } from "../fixtures/telemetry-trace.js";

const roots: string[] = [], signal = () => new AbortController().signal;
async function root() { const path = await mkdtemp(join(tmpdir(), "uaos-telemetry-")); roots.push(path); return path; }
afterEach(async () => {
  for (const path of roots.splice(0)) {
    expect(dirname(resolve(path))).toBe(resolve(tmpdir())); expect(basename(path)).toMatch(/^uaos-telemetry-/u);
    await rm(path, { recursive: true, force: true });
  }
});

describe("Owned bounded metadata-only telemetry files", () => {
  it("persists a complete trace and reads a validated diagnostic without touching other files", async () => {
    const directory = await root(), store = new FilesystemTelemetry({ root: directory }), records = telemetryTraceFixture();
    for (const record of records) await store.append(record, signal());
    expect(await store.read("run-fixture", signal())).toEqual(records);
    expect((await createDiagnoseTelemetry(store)("run-fixture")).complete).toBe(true);
    expect(await readdir(directory)).toEqual(["run-fixture.telemetry.jsonl"]);
  });

  it("refuses existing artifacts and unknown continuation ownership", async () => {
    const directory = await root(), filename = join(directory, "run-fixture.telemetry.jsonl"), store = new FilesystemTelemetry({ root: directory });
    await writeFile(filename, "unexpected content");
    const records = telemetryTraceFixture();
    await expect(store.append(records[0]!, signal())).rejects.toThrow("optional telemetry export failed");
    await expect(store.append(records[1]!, signal())).rejects.toThrow("optional telemetry export failed");
    expect(await readFile(filename, "utf8")).toBe("unexpected content");
  });

  it("refuses changed owned content and does not resume after loss of sequence", async () => {
    const directory = await root(), filename = join(directory, "run-fixture.telemetry.jsonl"), store = new FilesystemTelemetry({ root: directory });
    const records = telemetryTraceFixture(); await store.append(records[0]!, signal());
    await writeFile(filename, "external replacement with another size");
    await expect(store.append(records[1]!, signal())).rejects.toThrow("optional telemetry export failed");
    await expect(store.append(records[2]!, signal())).rejects.toThrow("optional telemetry export failed");
    expect(await readFile(filename, "utf8")).toBe("external replacement with another size");
  });

  it("bounds malformed, partial, oversized reads and validates trace IDs", async () => {
    const directory = await root(), store = new FilesystemTelemetry({ root: directory }), path = join(directory, "run-fixture.telemetry.jsonl");
    expect(await store.read("run-fixture", signal())).toBeNull();
    await expect(store.read("../outside", signal())).rejects.toMatchObject({ code: "INVALID_TRACE_ID" });
    for (const content of ['{"question":"secret"}\n', JSON.stringify(telemetryTraceFixture()[0]), "x".repeat(1024 * 1024 + 1)]) {
      await writeFile(path, content);
      await expect(store.read("run-fixture", signal())).rejects.toMatchObject({ code: "TELEMETRY_READ_FAILURE", message: "The telemetry operation could not be completed." });
    }
  });

  it("preserves pre-abort reason without creating an artifact", async () => {
    const directory = await root(), store = new FilesystemTelemetry({ root: directory }), caller = new AbortController(), reason = new Error("caller cancelled");
    caller.abort(reason);
    await expect(store.append(telemetryTraceFixture()[0]!, caller.signal)).rejects.toBe(reason);
    await expect(store.read("run-fixture", caller.signal)).rejects.toBe(reason);
    expect(await readdir(directory)).toEqual([]);
  });
});
