import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import { buildHttpApp } from "../../src/adapters/inbound/http.js";
import { RunStreamBroker } from "../../src/application/run-stream-broker.js";
import { initialStreamState, reduceStream } from "../../src/application/reduce-stream.js";
import type { StreamExecutionPort } from "../../src/application/ports/stream-port.js";
import { StreamEventSchema } from "../../src/domain/stream-contracts.js";
import { streamJournalFixture, streamResultFixture } from "../fixtures/run-stream.js";

const apps: FastifyInstance[] = [];
async function host(execute: StreamExecutionPort["execute"], backpressure = false) {
  let sequence = 0;
  const broker = new RunStreamBroker({ executor: { execute }, ids: { nextRunId: () => `run-${++sequence}` },
    clock: { now: () => "2026-11-15T00:00:00.000Z" }, monotonic: { nowMs: () => performance.now() } });
  const app = buildHttpApp({ runAgent: async () => { throw new Error("Unexpected standalone run"); }, streams: broker });
  if (backpressure) app.addHook("onRequest", async (request, reply) => {
    if (request.headers["x-test-backpressure"] === "yes") {
      const original = reply.raw.write.bind(reply.raw);
      reply.raw.write = ((chunk: string) => { original(chunk); return false; }) as typeof reply.raw.write;
    }
  });
  apps.push(app); await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address(); if (!address || typeof address === "string") throw new Error("Expected TCP listener");
  const base = `http://127.0.0.1:${address.port}`;
  const request = (path: string, options: RequestInit = {}) => fetch(`${base}${path}`, { signal: AbortSignal.timeout(5000), ...options });
  const create = async () => {
    const response = await request("/api/v1/stream-runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: "private question" }) });
    expect(response.status).toBe(202); return (await response.json() as { runId: string }).runId;
  };
  return { app, broker, request, create };
}
function parseSse(text: string) {
  return text.split("\n\n").filter((block) => block.includes("data: ")).map((block) => {
    const data = block.split("\n").find((line) => line.startsWith("data: "))!.slice(6), event = StreamEventSchema.parse(JSON.parse(data));
    expect(block).toContain(`id: ${event.runId}:${event.sequence}`); return event;
  });
}
const complete: StreamExecutionPort["execute"] = async (_input, runId, _signal, publish) => {
  for (const event of streamJournalFixture(runId)) publish(event); return streamResultFixture(runId);
};
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); });

describe("Actual TCP streaming adapter", () => {
  it("flushes start before completion, then delivers an ordered grounded answer and terminal", async () => {
    const release = Promise.withResolvers<void>(), h = await host(async (...args) => { await release.promise; return complete(...args); });
    const runId = await h.create(), response = await h.request(`/api/v1/stream-runs/${runId}/events`);
    expect(response.status).toBe(200); expect(response.headers.get("content-type")).toContain("text/event-stream");
    const reader = response.body!.getReader(), first = await reader.read(), decoder = new TextDecoder();
    const prefix = decoder.decode(first.value, { stream: true });
    expect(parseSse(prefix).map(({ type }) => type)).toEqual(["run.started"]); expect(prefix).not.toContain("run.completed");
    release.resolve(); let text = prefix;
    while (true) { const chunk = await reader.read(); if (chunk.done) break; text += decoder.decode(chunk.value, { stream: true }); }
    const frames = parseSse(text);
    expect(frames.reduce(reduceStream, initialStreamState(runId)).phase).toBe("terminal"); expect(frames.at(-1)!.type).toBe("run.completed");
    expect(text).not.toContain("private question");
  });

  it("reconnects from Last-Event-ID without canceling or re-executing on disconnect", async () => {
    const release = Promise.withResolvers<void>(); let executions = 0, active: AbortSignal | undefined;
    const h = await host(async (...args) => { executions += 1; active = args[2]; await release.promise; return complete(...args); });
    const runId = await h.create(), first = await h.request(`/api/v1/stream-runs/${runId}/events`), reader = first.body!.getReader();
    await reader.read(); await reader.cancel(); expect(active?.aborted).toBe(false);
    const reconnect = await h.request(`/api/v1/stream-runs/${runId}/events`, { headers: { "last-event-id": `${runId}:1` } });
    release.resolve();
    const replay = parseSse(await reconnect.text()); expect(replay.map(({ sequence }) => sequence)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]); expect(executions).toBe(1);
    const consumed = await h.request(`/api/v1/stream-runs/${runId}/events?after=9`, { headers: { "last-event-id": `${runId}:9` } });
    expect(consumed.status).toBe(200); expect(await consumed.text()).toBe("");
  });

  it("rejects malformed/future/conflicting cursors and cross-origin effects with closed errors", async () => {
    const h = await host(complete);
    const denied = await h.request("/api/v1/stream-runs", { method: "POST", headers: { origin: "https://private.example", "content-type": "application/json" }, body: '{"question":"private"}' });
    expect(denied.status).toBe(403); expect(await denied.json()).toMatchObject({ error: { code: "STREAM_ORIGIN_DENIED" } });
    const runId = await h.create(); expect(runId).toBe("run-1");
    for (const [query, header] of [["?after=-1", ""], ["?after=24", ""], ["?after=1", `${runId}:2`], ["", "run-other:1"], ["?after=01", ""], ["?unknown=private", ""]]) {
      const response = await h.request(`/api/v1/stream-runs/${runId}/events${query}`, { headers: header ? { "last-event-id": header } : {} });
      expect(response.status).toBe(400); expect(JSON.stringify(await response.json())).not.toContain("private");
    }
    const missing = await h.request("/api/v1/stream-runs/run-missing/events"); expect(missing.status).toBe(404);
    const cancel = await h.request(`/api/v1/stream-runs/${runId}/cancel`, { method: "POST", headers: { origin: "null" } }); expect(cancel.status).toBe(403);
  });

  it("cancels explicitly and emits one primary cancellation terminal", async () => {
    const h = await host(async (_input, runId, signal) => {
      await new Promise<void>((resolve) => { if (signal.aborted) resolve(); else signal.addEventListener("abort", () => resolve(), { once: true }); });
      return { ok: false, runId, error: { code: "CANCELLED", stage: "model", message: "private exception", retryable: false } };
    });
    const runId = await h.create(), response = await h.request(`/api/v1/stream-runs/${runId}/events`);
    const cancel = await h.request(`/api/v1/stream-runs/${runId}/cancel`, { method: "POST" }); expect(cancel.status).toBe(200);
    expect(parseSse(await response.text()).map(({ type }) => type)).toEqual(["run.started", "run.cancelled"]);
    expect(await (await h.request(`/api/v1/stream-runs/${runId}/cancel`, { method: "POST" })).json()).toMatchObject({ requested: false, terminal: true });
  });

  it("detaches a backpressured socket and permits bounded replay recovery", async () => {
    const release = Promise.withResolvers<void>(), h = await host(async (...args) => { await release.promise; return complete(...args); }, true);
    const runId = await h.create(), pressured = await h.request(`/api/v1/stream-runs/${runId}/events`, { headers: { "x-test-backpressure": "yes" } });
    expect(parseSse(await pressured.text()).map(({ type }) => type)).toEqual(["run.started"]);
    release.resolve();
    const recovered = await h.request(`/api/v1/stream-runs/${runId}/events?after=1`);
    expect(parseSse(await recovered.text()).at(-1)!.type).toBe("run.completed");
  });
});
