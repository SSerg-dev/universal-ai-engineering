import { afterEach, describe, expect, it, vi } from "vitest";
import { buildHttpApp } from "../../src/adapters/inbound/http.js";
import { DocumentLibraryError } from "../../src/domain/document-library-contracts.js";

const apps: ReturnType<typeof buildHttpApp>[] = [];
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); });
function setup(enabled = true) {
  const documents = { preview: vi.fn(() => ({ preview: true })), confirm: vi.fn(async () => ({ confirmed: true })),
    list: vi.fn(async () => []), read: vi.fn(async () => null), disable: vi.fn(async () => {}) };
  const app = buildHttpApp({ runAgent: vi.fn(), ...(enabled ? { documents } : {}) }); apps.push(app); return { app, documents };
}
describe("Opt-in local document HTTP boundary", () => {
  it("does not activate document operations on earlier runtimes", async () => {
    expect((await setup(false).app.inject({ method: "POST", url: "/api/v1/documents/list" })).statusCode).toBe(404);
  });
  it("previews separately and rejects foreign browser origins before effects", async () => {
    const { app, documents } = setup();
    const denied = await app.inject({ method: "POST", url: "/api/v1/documents/confirm", headers: { origin: "https://other.example" }, payload: {} });
    expect(denied.statusCode).toBe(403); expect(documents.confirm).not.toHaveBeenCalled();
    const preview = await app.inject({ method: "POST", url: "/api/v1/documents/preview", payload: { fileName: "x.md" } });
    expect(preview.statusCode).toBe(200); expect(preview.headers["cache-control"]).toBe("no-store");
    expect(documents.preview).toHaveBeenCalledTimes(1); expect(documents.confirm).not.toHaveBeenCalled();
  });
  it("bounds request bodies and sanitizes storage exceptions", async () => {
    const { app, documents } = setup();
    const large = await app.inject({ method: "POST", url: "/api/v1/documents/preview", payload: { text: "x".repeat(360001) } });
    expect(large.statusCode).toBe(413); expect(documents.preview).not.toHaveBeenCalled();
    documents.confirm.mockRejectedValue(new Error("private original and database credentials"));
    const failed = await app.inject({ method: "POST", url: "/api/v1/documents/confirm", payload: {} });
    expect(failed.statusCode).toBe(500); expect(failed.body).not.toContain("credentials");
  });
  it("returns typed invalid confirmations without writing", async () => {
    const { app, documents } = setup(); documents.confirm.mockRejectedValue(new DocumentLibraryError("UPLOAD_CONFIRMATION_MISMATCH"));
    const result = await app.inject({ method: "POST", url: "/api/v1/documents/confirm", payload: {} });
    expect(result.statusCode).toBe(400); expect(result.json().error.code).toBe("UPLOAD_CONFIRMATION_MISMATCH");
  });
});
