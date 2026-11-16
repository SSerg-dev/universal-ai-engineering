import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FilesystemApprovedExport } from "../../src/adapters/outbound/filesystem-approved-export.js";
import { FixedClock } from "../../src/adapters/outbound/deterministic-test-adapters.js";
import { validateApprovalSnapshot, validatePreparedExport } from "../../src/application/validate-approval.js";
import { renderGroundedAnswer } from "../../src/application/grounded-answer.js";
import { guardFixture } from "../fixtures/guard.js";

const roots: string[] = [];
const signal = () => new AbortController().signal;
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "uaos-approved-export-")); roots.push(root);
  const fixture = guardFixture();
  const exporter = new FilesystemApprovedExport({ root, clock: new FixedClock("2026-11-16T00:00:04.000Z") });
  const { approvalId, runId, contentDigest, contentBytes } = fixture.intent;
  return { root, fixture, exporter, metadata: { approvalId, runId, contentDigest, contentBytes },
    publication: { approvalId, runId, contentDigest, contentBytes, payload: fixture.payload } };
}
afterEach(async () => {
  for (const root of roots.splice(0)) {
    const absolute = resolve(root);
    if (dirname(absolute) !== resolve(tmpdir()) || !basename(absolute).startsWith("uaos-approved-export-")) throw new Error("Unexpected owned test root");
    await rm(absolute, { recursive: true, force: true });
  }
});

describe("bound fixed-root approved publication", () => {
  it("writes exact UTF-8 bytes, removes its temporary file and acknowledges an existing matching artifact", async () => {
    const { root, exporter, publication, metadata } = await setup();
    expect(await exporter.inspect(metadata, signal())).toBeNull();
    expect(await exporter.publish(publication, signal())).toMatchObject({ ...metadata, acknowledgment: "published" });
    const name = `${metadata.approvalId}.md`;
    expect(await readFile(join(root, name), "utf8")).toBe(publication.payload.markdown);
    expect(await exporter.publish(publication, signal())).toMatchObject({ ...metadata, acknowledgment: "existing_verified" });
    expect(await readdir(root)).toEqual([name]);
  });

  it("publishes concurrent identical actions once without replacement and reconciles the receipt", async () => {
    const { root, exporter, publication, metadata } = await setup();
    const receipts = await Promise.all([exporter.publish(publication, signal()), exporter.publish(publication, signal())]);
    expect(receipts.map(({ acknowledgment }) => acknowledgment).sort()).toEqual(["existing_verified", "published"]);
    expect(await exporter.inspect(metadata, signal())).toMatchObject({ acknowledgment: "existing_verified" });
    expect(await readdir(root)).toEqual([`${metadata.approvalId}.md`]);
  });

  it("preserves unexpected existing content and refuses a mismatched receipt", async () => {
    const { root, exporter, publication, metadata } = await setup(), path = join(root, `${metadata.approvalId}.md`);
    await writeFile(path, "unexpected preexisting document");
    await expect(exporter.publish(publication, signal())).rejects.toMatchObject({ code: "GUARD_EXPORT_MISMATCH" });
    await expect(exporter.inspect(metadata, signal())).rejects.toMatchObject({ code: "GUARD_EXPORT_MISMATCH" });
    expect(await readFile(path, "utf8")).toBe("unexpected preexisting document");
    expect(await readdir(root)).toEqual([`${metadata.approvalId}.md`]);
  });

  it("binds actual UTF-8 bytes for non-ASCII evidence", async () => {
    const { root, exporter, publication, fixture } = await setup();
    const grounding = structuredClone(fixture.payload.result.grounding), claim = grounding.claims[0]!;
    claim.quote = "Проверенные данные 😀"; claim.citation.end = claim.quote.length;
    const answer = renderGroundedAnswer(grounding);
    const checked = validatePreparedExport({ result: { ...fixture.payload.result, answer, grounding }, markdown: `${answer}\n` }, fixture.identity);
    expect(checked.contentBytes).toBeGreaterThan(checked.payload.markdown.length);
    const receipt = await exporter.publish({ ...publication, ...checked }, signal());
    expect((await readFile(join(root, receipt.filename))).byteLength).toBe(receipt.contentBytes);
    expect(await exporter.inspect(receiptInput(receipt), signal())).toMatchObject({ acknowledgment: "existing_verified" });
  });

  it("retains a published artifact after acknowledgment failure and permits inspection without another write", async () => {
    const { root, exporter, publication, metadata } = await setup();
    const failedAck = new FilesystemApprovedExport({ root, clock: { now: () => { throw new Error("private acknowledgment failure"); } } });
    await expect(failedAck.publish(publication, signal())).rejects.toMatchObject({ code: "GUARD_EXPORT_FAILURE" });
    expect(await readdir(root)).toEqual([`${metadata.approvalId}.md`]);
    expect(await exporter.inspect(metadata, signal())).toMatchObject({ acknowledgment: "existing_verified" });
    expect(await readFile(join(root, `${metadata.approvalId}.md`), "utf8")).toBe(publication.payload.markdown);
  });

  it("rejects path injection, substituted payloads and incorrect UTF-8 counts before effects", async () => {
    const { root, exporter, publication } = await setup();
    for (const invalid of [ { ...publication, approvalId: "../outside" }, { ...publication, path: "outside" },
      { ...publication, contentDigest: "c".repeat(64) }, { ...publication, contentBytes: publication.contentBytes + 1 },
      { ...publication, payload: { ...publication.payload, markdown: "substituted" } },
      { ...publication, payload: { ...publication.payload, result: { ...publication.payload.result, answer: "invented" }, markdown: "invented\n" } },
    ]) await expect(exporter.publish(invalid, signal())).rejects.toMatchObject({ message: "The guarded operation could not be completed." });
    expect(await readdir(root)).toEqual([]);
  });

  it("preserves pre-abort reason and leaves the destination absent", async () => {
    const { root, exporter, publication } = await setup(), controller = new AbortController(), reason = new Error("cancelled");
    controller.abort(reason);
    await expect(exporter.publish(publication, controller.signal)).rejects.toBe(reason);
    expect(await readdir(root)).toEqual([]);
  });

  it("verifies canonical answer, source membership, byte count and proposal digest on rehydration", () => {
    const { identity, pending, payload } = guardFixture();
    expect(validateApprovalSnapshot(pending, identity)).toEqual(pending);
    expect(validatePreparedExport(payload, identity).contentBytes).toBe(Buffer.byteLength(payload.markdown, "utf8"));
    for (const invalid of [{ ...pending, proposalDigest: "c".repeat(64) },
      { ...pending, payload: { ...payload, result: { ...payload.result, sources: [] } } },
      { ...pending, intent: { ...pending.intent, contentBytes: pending.intent.contentBytes + 1 } },
    ]) expect(() => validateApprovalSnapshot(invalid, identity)).toThrowError(expect.objectContaining({ code: "GUARD_RESULT_INVALID" }));
  });
});

function receiptInput(value: { approvalId: string; runId: string; contentDigest: string; contentBytes: number }) {
  const { approvalId, runId, contentDigest, contentBytes } = value;
  return { approvalId, runId, contentDigest, contentBytes };
}
