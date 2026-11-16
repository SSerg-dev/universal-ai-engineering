import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JsonlRouteJournal } from "../../src/adapters/outbound/jsonl-route-journal.js";
import { RouteAuditEventSchema, type RouteAuditEvent } from "../../src/domain/routing-contracts.js";
import manifest from "../../fixtures/routing/local-course.v1.json" with { type: "json" };

const roots: string[] = [], signal = () => new AbortController().signal;
async function root() { const value = await mkdtemp(join(tmpdir(), "uaos-route-journal-")); roots.push(value); return value; }
const event = () => RouteAuditEventSchema.parse({ schemaVersion: "route-audit-1.0", routeId: "route-one", eventId: "event-one", sequence: 1,
  timestamp: "2026-11-16T00:00:00.000Z", manifestRevision: manifest.revision, policyRevision: manifest.policyRevision,
  kind: "route.started", payload: { requestedProfile: "grounded" } });
afterEach(async () => {
  for (const path of roots.splice(0)) {
    const absolute = resolve(path);
    if (dirname(absolute) !== resolve(tmpdir()) || !basename(absolute).startsWith("uaos-route-journal-")) throw new Error("Unexpected owned test path");
    await rm(absolute, { recursive: true, force: true });
  }
});
describe("required metadata routing JSONL", () => {
  it("awaits flushed complete schema-valid lines in a generated route file", async () => {
    const directory = await root(), journal = new JsonlRouteJournal({ root: directory }), first = event();
    await journal.append(first, signal());
    const second = RouteAuditEventSchema.parse({ ...first, eventId: "event-two", sequence: 2, kind: "attempt.started",
      payload: { profile: "grounded", runId: "run-one", attempt: 1 } });
    await journal.append(second, signal());
    const raw = await readFile(join(directory, "route-one.route.jsonl"), "utf8");
    expect(raw.endsWith("\n")).toBe(true);
    expect(raw.trimEnd().split("\n").map((line) => RouteAuditEventSchema.parse(JSON.parse(line)))).toEqual([first, second]);
    expect(await readdir(directory)).toEqual(["route-one.route.jsonl"]);
  });
  it("refuses traversal and content-bearing fields before filesystem work", async () => {
    const directory = await root(), journal = new JsonlRouteJournal({ root: directory });
    for (const invalid of [{ ...event(), routeId: "../outside" }, { ...event(), question: "private question" },
      { ...event(), payload: { requestedProfile: "grounded", answer: "private answer" } }]) {
      await expect(journal.append(invalid as RouteAuditEvent, signal())).rejects.toMatchObject({ code: "ROUTE_JOURNAL_FAILURE" });
    }
    expect(await readdir(directory)).toEqual([]);
  });
  it("preserves pre-abort reason and creates no record", async () => {
    const directory = await root(), journal = new JsonlRouteJournal({ root: directory }), controller = new AbortController(), reason = new Error("cancelled");
    controller.abort(reason); await expect(journal.append(event(), controller.signal)).rejects.toBe(reason);
    expect(await readdir(directory)).toEqual([]);
  });
  it("normalizes unusable root errors and preserves existing content", async () => {
    const directory = await root(), path = join(directory, "unexpected-file"); await writeFile(path, "preserved");
    await expect(new JsonlRouteJournal({ root: path }).append(event(), signal())).rejects.toMatchObject({ code: "ROUTE_JOURNAL_FAILURE", message: "The routed operation could not be completed." });
    expect(await readFile(path, "utf8")).toBe("preserved");
  });
});
