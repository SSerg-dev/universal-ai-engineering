import { afterEach, describe, expect, it, vi } from "vitest";

import { RunStreamClient } from "./stream-client";

const clients: RunStreamClient[] = [], encoder = new TextEncoder();
function events() {
  const rows = [
    { type: "run.started", payload: {} },
    { type: "run.progress", payload: { eventType: "model.requested", callId: "model-one", step: 1 } },
    { type: "run.progress", payload: { eventType: "model.responded", callId: "model-one", step: 1 } },
    { type: "tool.started", payload: { callId: "tool-one", toolName: "retrieve_passages" } },
    { type: "tool.completed", payload: { callId: "tool-one", toolName: "retrieve_passages", durationMs: 0 } },
    { type: "run.progress", payload: { eventType: "model.requested", callId: "model-two", step: 2 } },
    { type: "run.progress", payload: { eventType: "model.responded", callId: "model-two", step: 2 } },
    { type: "answer", payload: { ok: true, runId: "run-one", answer: "Подтверждённых фрагментов нет.", sources: [], usage: { modelCalls: 2, toolCalls: 1 },
      grounding: { version: "1.0", status: "abstained", reason: "no_evidence", claims: [] } } },
    { type: "run.completed", payload: { modelCalls: 2, toolCalls: 1 } },
  ];
  return rows.map((event, index) => ({ schemaVersion: "stream-1.0", runId: "run-one", sequence: index + 1, timestamp: "2026-11-16T00:00:00.000Z", ...event }));
}
const frame = (event: { runId: string; sequence: number; type: string; payload: unknown; schemaVersion?: string; timestamp?: string }) =>
  `id: ${event.runId}:${event.sequence}\nevent: uaos\ndata: ${JSON.stringify(event)}\n\n`;
function stream(text: string, split = false) {
  const data = encoder.encode(text);
  return new Response(new ReadableStream<Uint8Array>({ start(controller) {
    if (split) for (let index = 0; index < data.length; index += 7) controller.enqueue(data.slice(index, index + 7));
    else controller.enqueue(data);
    controller.close();
  } }), { headers: { "content-type": "text/event-stream; charset=utf-8" } });
}
function client(fetcher: typeof fetch) { const pause = vi.fn(async (_ms: number, _signal: AbortSignal) => {}), value = new RunStreamClient(fetcher, pause); clients.push(value); return { value, pause }; }
afterEach(() => { for (const value of clients.splice(0)) value.dispose(); vi.restoreAllMocks(); });

describe("Bounded browser stream transport", () => {
  it("accepts chunked UTF-8/CRLF and exact duplicates without duplicating the question or visible steps", async () => {
    const all = events(), fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ runId: "run-one" }))
      .mockResolvedValueOnce(stream(": heartbeat\n\n" + [all[0]!, ...all].map(frame).join("").replaceAll("\n", "\r\n"), true));
    const { value, pause } = client(fetcher);
    await value.start(" вопрос ", () => {});
    expect(value.snapshot).toMatchObject({ connection: "closed", problem: null, state: { phase: "terminal", events: expect.any(Array) } });
    expect(value.snapshot.state!.events).toHaveLength(9); expect(pause).not.toHaveBeenCalled();
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toEqual({ question: "вопрос" }); expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("reconnects from the last fully accepted frame after a truncated read without repeating create", async () => {
    const all = events(), fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ runId: "run-one" }))
      .mockResolvedValueOnce(stream(all.slice(0, 3).map(frame).join("") + "id: run-one:4\ndata: {"))
      .mockResolvedValueOnce(stream(all.slice(3).map(frame).join("")));
    const { value, pause } = client(fetcher); await value.start("q", () => {});
    expect(value.snapshot.connection).toBe("closed"); expect(value.snapshot.state!.events).toHaveLength(9);
    expect(fetcher.mock.calls[2]![0]).toBe("/api/v1/stream-runs/run-one/events?after=3");
    expect(pause).toHaveBeenCalledWith(500, expect.any(AbortSignal));
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("bounds automatic reconnect to three delays and permits an explicit read-only resume", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ runId: "run-one" })).mockRejectedValue(new Error("private server error"));
    const { value, pause } = client(fetcher); await value.start("q", () => {});
    expect(value.snapshot).toMatchObject({ connection: "disconnected", problem: "NETWORK_FAILED" });
    expect(fetcher).toHaveBeenCalledTimes(5); expect(pause.mock.calls.map((call) => call[0])).toEqual([500, 1000, 1500]);
    fetcher.mockResolvedValueOnce(stream(events().map(frame).join(""))); await value.resume(() => {});
    expect(value.snapshot.connection).toBe("closed");
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect(JSON.stringify(value.snapshot)).not.toContain("private server error");
  });

  it.each(["gap", "another run", "cursor mismatch"])("rejects %s as a protocol failure without automatic retry", async (kind) => {
    const all = events(), invalid = { ...all[1]!, ...(kind === "gap" ? { sequence: 3 } : kind === "another run" ? { runId: "run-other" } : {}) };
    let text = frame(all[0]!) + frame(invalid);
    if (kind === "cursor mismatch") text = text.replace("id: run-one:2", "id: run-one:3");
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ runId: "run-one" })).mockResolvedValueOnce(stream(text));
    const { value, pause } = client(fetcher); await value.start("q", () => {});
    expect(value.snapshot.problem).toBe("PROTOCOL_INVALID"); expect(pause).not.toHaveBeenCalled(); expect(fetcher).toHaveBeenCalledTimes(2);
    expect(value.snapshot.state!.events).toHaveLength(1);
  });

  it("rejects a new post-terminal event instead of presenting a trusted completed connection", async () => {
    const all = events(), fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ runId: "run-one" }))
      .mockResolvedValueOnce(stream(all.map(frame).join("") + frame({ ...all[0]!, sequence: 10 })));
    const { value } = client(fetcher); await value.start("q", () => {});
    expect(value.snapshot).toMatchObject({ connection: "disconnected", problem: "PROTOCOL_INVALID" });
  });

  it("does not fabricate cancellation from acknowledgment and lets the typed primary terminal decide", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const response = new Response(new ReadableStream<Uint8Array>({ start(value) { controller = value; value.enqueue(encoder.encode(frame(events()[0]!))); } }),
      { headers: { "content-type": "text/event-stream" } });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ runId: "run-one" })).mockResolvedValueOnce(response)
      .mockResolvedValueOnce(Response.json({ runId: "run-one", requested: true, terminal: false }));
    const { value } = client(fetcher), running = value.start("q", () => {});
    await vi.waitFor(() => expect(value.snapshot.state!.events).toHaveLength(1));
    await value.cancel(); expect(value.snapshot.stopRequested).toBe(true); expect(value.snapshot.state!.phase).not.toBe("terminal");
    controller.enqueue(encoder.encode(frame({ ...events()[0]!, sequence: 2, type: "run.cancelled", payload: { code: "CANCELLED", stage: "model", retryable: false } })));
    controller.close(); await running;
    expect(value.snapshot).toMatchObject({ connection: "closed", stopRequested: false, state: { phase: "terminal" } });
  });

  it("keeps reading after a failed cancel and clears that stale problem when primary success arrives", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const response = new Response(new ReadableStream<Uint8Array>({ start(value) { controller = value; value.enqueue(encoder.encode(frame(events()[0]!))); } }),
      { headers: { "content-type": "text/event-stream" } });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ runId: "run-one" })).mockResolvedValueOnce(response)
      .mockResolvedValueOnce(new Response("private cancel failure", { status: 500 }));
    const { value } = client(fetcher), running = value.start("q", () => {});
    await vi.waitFor(() => expect(value.snapshot.state!.events).toHaveLength(1));
    await value.cancel(); expect(value.snapshot).toMatchObject({ problem: "CANCEL_FAILED", stopRequested: false });
    controller.enqueue(encoder.encode(events().slice(1).map(frame).join(""))); controller.close(); await running;
    expect(value.snapshot).toMatchObject({ connection: "closed", problem: null });
  });

  it("does not retry an expired run or expose its raw server response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ runId: "run-one" })).mockResolvedValueOnce(new Response("private expired run", { status: 404 }));
    const { value, pause } = client(fetcher); await value.start("q", () => {});
    expect(value.snapshot.problem).toBe("RUN_UNAVAILABLE"); expect(pause).not.toHaveBeenCalled(); expect(JSON.stringify(value.snapshot)).not.toContain("private");
  });

  it("rejects oversized JSON and pending frames before accepting unbounded data", async () => {
    const oversized = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("x".repeat(8193)));
    const first = client(oversized).value; await first.start("q", () => {}); expect(first.snapshot.problem).toBe("PROTOCOL_INVALID");
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ runId: "run-one" })).mockResolvedValueOnce(stream("x".repeat(65_537)));
    const second = client(fetcher).value; await second.start("q", () => {}); expect(second.snapshot.problem).toBe("PROTOCOL_INVALID");
  });

  it("rejects malformed UTF-8 rather than rendering replacement characters as trusted content", async () => {
    const bad = new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([0xc3, 0x28])); controller.close(); } }),
      { headers: { "content-type": "text/event-stream" } });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ runId: "run-one" })).mockResolvedValueOnce(bad);
    const { value, pause } = client(fetcher); await value.start("q", () => {});
    expect(value.snapshot.problem).toBe("PROTOCOL_INVALID"); expect(pause).not.toHaveBeenCalled();
  });

  it("aborts network work on disposal and prevents late renderer callbacks", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ runId: "run-one" }))
      .mockImplementationOnce(async (_input, init) => new Promise<Response>((_resolve, reject) => {
        init!.signal!.addEventListener("abort", () => reject(new Error("private disposed request")), { once: true });
      }));
    const { value } = client(fetcher), update = vi.fn(), running = value.start("q", update);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    const calls = update.mock.calls.length; value.dispose(); await running;
    expect(update).toHaveBeenCalledTimes(calls);
    await value.start("another question", update); expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
