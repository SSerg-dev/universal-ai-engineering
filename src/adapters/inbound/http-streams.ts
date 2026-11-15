import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import type { RunStreamPort, StreamSubscription } from "../../application/ports/stream-port.js";
import { StreamBoundaryError, StreamCursorSchema, StreamRunIdSchema, isStreamTerminal, type StreamEvent } from "../../domain/stream-contracts.js";

function sameOrigin(request: FastifyRequest) {
  const origin = request.headers.origin;
  if (origin !== undefined && origin !== `${request.protocol}://${request.headers.host}`) throw new StreamBoundaryError("STREAM_ORIGIN_DENIED");
}
function runId(request: FastifyRequest) {
  const selected = z.strictObject({ runId: StreamRunIdSchema }).safeParse(request.params);
  if (!selected.success) throw new StreamBoundaryError("STREAM_INPUT_INVALID");
  return selected.data.runId;
}
function cursor(request: FastifyRequest, id: string) {
  const query = z.strictObject({ after: z.string().regex(/^(?:0|[1-9][0-9]*)$/u).optional() }).safeParse(request.query);
  if (!query.success) throw new StreamBoundaryError("STREAM_CURSOR_INVALID");
  const header = request.headers["last-event-id"];
  let selected: number | undefined;
  if (header !== undefined) {
    const match = typeof header === "string" ? /^(run-[A-Za-z0-9_-]+):(0|[1-9][0-9]*)$/u.exec(header) : null;
    if (!match || match[1] !== id) throw new StreamBoundaryError("STREAM_CURSOR_INVALID");
    selected = Number(match[2]);
  }
  const after = query.data.after === undefined ? selected ?? 0 : Number(query.data.after);
  if ((selected !== undefined && selected !== after) || !StreamCursorSchema.safeParse(after).success) throw new StreamBoundaryError("STREAM_CURSOR_INVALID");
  return after;
}
function boundary(reply: FastifyReply, error: unknown) {
  const code = error instanceof StreamBoundaryError ? error.code : "STREAM_EVENT_INVALID";
  const status = code === "STREAM_RUN_NOT_FOUND" ? 404 : code === "STREAM_ORIGIN_DENIED" ? 403
    : ["STREAM_CAPACITY_EXCEEDED", "STREAM_SUBSCRIBER_LIMIT"].includes(code) ? 429 : code === "STREAM_CLOSED" ? 503
      : ["STREAM_INPUT_INVALID", "STREAM_CURSOR_INVALID"].includes(code) ? 400 : 500;
  return reply.code(status).send({ ok: false, error: { code, message: "The streaming operation could not be completed." } });
}
export function serializeStreamEvent(event: StreamEvent): string {
  return `id: ${event.runId}:${event.sequence}\nevent: uaos\ndata: ${JSON.stringify(event)}\n\n`;
}

export function registerStreamRoutes(app: FastifyInstance, streams: RunStreamPort) {
  app.addHook("preClose", async () => { streams.close(); });
  app.post("/api/v1/stream-runs", async (request, reply) => {
    try { sameOrigin(request); return reply.code(202).send(streams.create(request.body)); }
    catch (error) { return boundary(reply, error); }
  });
  app.post("/api/v1/stream-runs/:runId/cancel", async (request, reply) => {
    try {
      sameOrigin(request);
      if (request.body !== undefined && !z.strictObject({}).safeParse(request.body).success) throw new StreamBoundaryError("STREAM_INPUT_INVALID");
      return reply.send(streams.cancel(runId(request)));
    } catch (error) { return boundary(reply, error); }
  });
  app.get("/api/v1/stream-runs/:runId/events", async (request, reply) => {
    let subscription: StreamSubscription | undefined, heartbeat: ReturnType<typeof setInterval> | undefined;
    let closed = false, preparing = true;
    const pending: StreamEvent[] = [];
    const cleanup = () => {
      if (closed) return;
      closed = true; subscription?.unsubscribe();
      if (heartbeat !== undefined) clearInterval(heartbeat);
      reply.raw.removeListener("close", cleanup);
    };
    const write = (event: StreamEvent) => {
      if (closed) return false;
      try {
        const writable = reply.raw.write(serializeStreamEvent(event));
        if (!writable || isStreamTerminal(event)) { cleanup(); reply.raw.end(); return false; }
        return true;
      } catch { cleanup(); reply.raw.destroy(); return false; }
    };
    try {
      sameOrigin(request);
      const id = runId(request), after = cursor(request, id);
      subscription = streams.subscribe(id, after, (event) => { if (preparing) { pending.push(event); return; } return write(event); });
      reply.hijack();
      reply.raw.on("close", cleanup);
      reply.raw.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform",
        connection: "keep-alive", "x-accel-buffering": "no" });
      reply.raw.flushHeaders(); preparing = false;
      for (const event of pending) if (!write(event)) break;
      pending.length = 0;
      if (subscription.terminal && !closed) { cleanup(); reply.raw.end(); }
      if (!closed) {
        heartbeat = setInterval(() => {
          try { if (!reply.raw.write(": heartbeat\n\n")) { cleanup(); reply.raw.end(); } }
          catch { cleanup(); reply.raw.destroy(); }
        }, 15_000);
        heartbeat.unref();
      }
      return reply;
    } catch (error) {
      cleanup();
      if (reply.sent) { reply.raw.destroy(); return reply; }
      return boundary(reply, error);
    }
  });
}
