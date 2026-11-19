import type { FastifyInstance, FastifyRequest } from "fastify";
import type { DocumentLibraryPort } from "../../application/ports/document-library-port.js";
import { DocumentLibraryError, LibraryDocumentSchema } from "../../domain/document-library-contracts.js";

export function registerDocumentRoutes(app: FastifyInstance, library: DocumentLibraryPort) {
  const route = (path: string, action: (request: FastifyRequest, signal: AbortSignal) => Promise<unknown> | unknown) => {
    app.post(path, { bodyLimit: 360000 }, async (request, reply) => {
      reply.header("cache-control", "no-store");
      if (request.headers.origin !== undefined && request.headers.origin !== `${request.protocol}://${request.headers.host}`) {
        return reply.code(403).send({ error: { code: "LIBRARY_ORIGIN_DENIED" } });
      }
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000);
      const close = () => { if (!reply.raw.writableFinished) controller.abort(); };
      reply.raw.once("close", close);
      try { return await action(request, controller.signal); }
      catch (error) {
        const code = error instanceof DocumentLibraryError ? error.code : "LIBRARY_FAILURE";
        return reply.code(code === "LIBRARY_NOT_FOUND" ? 404 : code === "LIBRARY_CAPACITY" ? 409 : code === "LIBRARY_FAILURE" ? 500 : 400)
          .send({ error: { code, message: "The document operation could not be completed." } });
      } finally { clearTimeout(timer); reply.raw.removeListener("close", close); }
    });
  };
  route("/api/v1/documents/preview", (request) => library.preview(request.body));
  route("/api/v1/documents/confirm", (request, signal) => library.confirm(request.body, signal));
  route("/api/v1/documents/list", (_request, signal) => library.list(signal));
  route("/api/v1/documents/read", (request, signal) => library.read(request.body, signal));
  route("/api/v1/documents/disable", async (request, signal) => { await library.disable(request.body, signal); return { ok: true }; });
  app.post("/api/v1/documents/download", { bodyLimit: 1024 }, async (request, reply) => {
    reply.header("cache-control", "no-store");
    if (request.headers.origin !== undefined && request.headers.origin !== `${request.protocol}://${request.headers.host}`) return reply.code(403).send();
    try {
      const result = LibraryDocumentSchema.parse(await library.read(request.body, AbortSignal.timeout(5000)));
      return reply.header("content-disposition", `attachment; filename="${result.entry.documentId}.txt"`)
        .header("x-content-type-options", "nosniff").type("text/plain; charset=utf-8").send(Buffer.from(result.original.base64, "base64"));
    } catch { return reply.code(404).send({ error: { code: "LIBRARY_NOT_FOUND" } }); }
  });
}
