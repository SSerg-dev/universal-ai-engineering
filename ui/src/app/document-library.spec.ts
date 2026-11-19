import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentLibraryComponent } from "./document-library";

const content = "# Nebula\n\n<img src=x onerror=alert(1)> Nebula recovery ORBIT-42.";
const documentId = `upload-${"a".repeat(64)}`, revision = "a".repeat(64);
const preview = { document: { documentId, revision, title: "Nebula", content }, fileName: "nebula.md", originalBytes: 60 };
const entry = { documentId, revision, title: "Nebula", fileName: "nebula.md", active: true };
function setup() {
  TestBed.configureTestingModule({ imports: [DocumentLibraryComponent] });
  const fixture = TestBed.createComponent(DocumentLibraryComponent); fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, root: fixture.nativeElement as HTMLElement };
}
function selection(name = "nebula.md", size = 60) {
  return { target: { files: [{ name, size, arrayBuffer: async () => new TextEncoder().encode(content).buffer }], value: "" } } as unknown as Event;
}
afterEach(() => { vi.unstubAllGlobals(); TestBed.resetTestingModule(); });
describe("Document upload confirmation UI", () => {
  it("does not upload or list automatically before the library is opened", () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); setup(); expect(fetcher).not.toHaveBeenCalled();
  });
  it("previews escaped text without indexing and confirms only explicitly", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(preview)))
      .mockResolvedValueOnce(new Response(JSON.stringify(preview))).mockResolvedValueOnce(new Response(JSON.stringify([entry])));
    vi.stubGlobal("fetch", fetcher);
    const { component, fixture, root } = setup(); await component.select(selection()); fixture.detectChanges();
    expect(fetcher).toHaveBeenCalledTimes(1); expect(fetcher.mock.calls[0]![0]).toContain("/preview");
    expect(root.querySelector("pre")?.textContent).toContain("<img"); expect(root.querySelector("img")).toBeNull();
    await component.confirm(); fixture.detectChanges();
    expect(fetcher.mock.calls[1]![0]).toContain("/confirm");
    expect(JSON.parse(fetcher.mock.calls[1]![1].body).revision).toBe(revision);
    expect(component.preview()).toBeNull(); expect(component.entries()).toHaveLength(1);
  });
  it("rejects unsupported and oversized files before a request", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); const { component } = setup();
    await component.select(selection("notes.pdf")); expect(component.message()).toContain(".md");
    await component.select(selection("notes.txt", 262145)); expect(fetcher).not.toHaveBeenCalled();
  });
  it("cancels a preview without publishing it", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(preview))); vi.stubGlobal("fetch", fetcher);
    const { component } = setup(); await component.select(selection()); component.discard(); await component.confirm();
    expect(fetcher).toHaveBeenCalledTimes(1); expect(component.preview()).toBeNull();
  });
  it("retains a failed confirmation for retry and shows a safe message", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(preview))).mockResolvedValueOnce(new Response("private exception", { status: 500 }));
    vi.stubGlobal("fetch", fetcher); const { component } = setup(); await component.select(selection()); await component.confirm();
    expect(component.preview()).not.toBeNull(); expect(component.message()).not.toContain("private"); expect(component.busy()).toBe(false);
  });
  it("disables a document and refreshes its actual server state", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('{"ok":true}')).mockResolvedValueOnce(new Response(JSON.stringify([{ ...entry, active: false }])));
    vi.stubGlobal("fetch", fetcher); const { component } = setup(); await component.disable(entry);
    expect(fetcher.mock.calls[0]![0]).toContain("/disable"); expect(component.entries()[0]?.active).toBe(false);
  });
});
