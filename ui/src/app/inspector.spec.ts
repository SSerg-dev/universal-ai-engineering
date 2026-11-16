import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initialStreamState, reduceStream, type StreamState } from "../../../src/application/reduce-stream.js";
import { StreamEventSchema } from "../../../src/domain/stream-contracts.js";
import { InspectorComponent, STREAM_CLIENT } from "./inspector";
import type { ClientSnapshot } from "./stream-client";

function completedState(options: { abstained?: boolean; quote?: string; answer?: string; runId?: string } = {}) {
  const runId = options.runId ?? "run-one", quote = options.quote ?? "The execution journal preserves evidence.";
  const result = { ok: true, runId, answer: options.answer ?? quote,
    sources: options.abstained ? [] : [{ documentId: "execution-journal", title: "Execution Journal" }], usage: { modelCalls: 2, toolCalls: 1 },
    grounding: options.abstained ? { version: "1.0", status: "abstained", reason: "no_evidence", claims: [] }
      : { version: "1.0", status: "answered", claims: [{ quote, citation: { indexId: "course", documentId: "execution-journal",
        revision: "a".repeat(64), passageId: "b".repeat(64), start: 0, end: quote.length } }] } };
  const rows = [
    { type: "run.started", payload: {} },
    { type: "run.progress", payload: { eventType: "model.requested", callId: "model-one", step: 1 } },
    { type: "run.progress", payload: { eventType: "model.responded", callId: "model-one", step: 1 } },
    { type: "tool.started", payload: { callId: "tool-one", toolName: "retrieve_passages" } },
    { type: "tool.completed", payload: { callId: "tool-one", toolName: "retrieve_passages", durationMs: 0 } },
    { type: "run.progress", payload: { eventType: "model.requested", callId: "model-two", step: 2 } },
    { type: "run.progress", payload: { eventType: "model.responded", callId: "model-two", step: 2 } },
    { type: "answer", payload: result }, { type: "run.completed", payload: { modelCalls: 2, toolCalls: 1 } },
  ];
  return rows.map((row, index) => StreamEventSchema.parse({ schemaVersion: "stream-1.0", runId, sequence: index + 1, timestamp: "2026-11-16T00:00:00.000Z", ...row }))
    .reduce(reduceStream, initialStreamState(runId));
}

describe("Accessible Angular execution inspector", () => {
  let update: (snapshot: ClientSnapshot) => void;
  const client = { start: vi.fn(async (_question: string, receive: typeof update) => { update = receive; }),
    resume: vi.fn(async (receive: typeof update) => { update = receive; }), cancel: vi.fn(async () => {}), dispose: vi.fn() };
  beforeEach(() => {
    vi.clearAllMocks(); TestBed.configureTestingModule({ imports: [InspectorComponent], providers: [{ provide: STREAM_CLIENT, useValue: client }] });
  });
  afterEach(() => { TestBed.resetTestingModule(); });
  function setup() {
    const fixture = TestBed.createComponent(InspectorComponent); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    return { fixture, root, component: fixture.componentInstance, textarea: root.querySelector("textarea")! };
  }
  async function begin(component: InspectorComponent) { component.question.set("execution journal"); await component.submit(); }
  const snapshot = (state: StreamState, patch: Partial<ClientSnapshot> = {}): ClientSnapshot => ({ state, connection: "closed", problem: null, stopRequested: false, ...patch });

  it("provides labelled form/empty states and actionable validation without creating an empty run", async () => {
    const { root, component, fixture, textarea } = setup();
    expect(root.querySelector('label[for="question"]')!.textContent).toContain("Вопрос к документации");
    expect(root.textContent).toContain("Каждый шаг будет виден здесь."); expect(root.textContent).toContain("Ответ появится после проверки источников.");
    await component.submit(); fixture.detectChanges();
    expect(client.start).not.toHaveBeenCalled(); expect(textarea.getAttribute("aria-invalid")).toBe("true");
    expect(root.querySelector('[role="alert"]')!.textContent).toContain("Введите вопрос"); expect(document.activeElement).toBe(textarea);
  });

  it("supports examples/keyboard submission and disables all create controls while a new question is pending", async () => {
    const { root, component, fixture, textarea } = setup();
    (root.querySelector(".example") as HTMLButtonElement).click(); fixture.detectChanges(); expect(textarea.value).toBe("execution journal");
    textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }));
    await fixture.whenStable(); expect(client.start).toHaveBeenCalledTimes(1);
    update(snapshot(completedState())); fixture.detectChanges();
    update(snapshot(completedState(), { connection: "creating" })); fixture.detectChanges();
    expect(textarea.disabled).toBe(true); expect((root.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
    for (const example of root.querySelectorAll<HTMLButtonElement>(".example")) expect(example.disabled).toBe(true);
    await component.submit(); expect(client.start).toHaveBeenCalledTimes(1);
    expect(root.textContent).toContain("Предыдущий результат. Новый запуск начинается…");
  });

  it("renders real ordered steps, grounded answer/citation details and focuses the completed answer once", async () => {
    const { root, component, fixture } = setup(); await begin(component);
    update(snapshot(completedState())); fixture.detectChanges(); await fixture.whenStable();
    expect(root.querySelectorAll(".timeline li")).toHaveLength(9); expect(root.querySelectorAll(".source-card")).toHaveLength(1);
    expect(root.querySelector("blockquote")!.textContent).toContain("The execution journal preserves evidence.");
    expect(root.textContent).toContain("Execution Journal"); expect(root.querySelector('[role="status"]')!.textContent).toContain("Ответ готов");
    expect(document.activeElement).toBe(root.querySelector("#answer-title"));
    const textarea = root.querySelector("textarea")!; textarea.focus(); update(snapshot(completedState())); await fixture.whenStable();
    expect(document.activeElement).toBe(textarea);
  });

  it("renders abstention with no fabricated source card", async () => {
    const { root, component, fixture } = setup(); await begin(component); update(snapshot(completedState({ abstained: true }))); fixture.detectChanges();
    expect(root.textContent).toContain("Подтверждение не найдено"); expect(root.querySelectorAll(".source-card")).toHaveLength(0);
  });

  it("retains partial progress, offers read-only reconnect, and never resubmits the question", async () => {
    const { root, component, fixture } = setup(); await begin(component);
    const full = completedState(), partial = full.events.slice(0, 4).reduce(reduceStream, initialStreamState(full.runId));
    update(snapshot(partial, { connection: "disconnected", problem: "NETWORK_FAILED" })); fixture.detectChanges();
    expect(root.querySelectorAll(".timeline li")).toHaveLength(4); expect(root.querySelector('[role="alert"]')!.textContent).toContain("Восстановите соединение");
    const button = [...root.querySelectorAll<HTMLButtonElement>("button")].find((value) => value.textContent?.includes("Восстановить соединение"))!;
    button.click(); await fixture.whenStable(); expect(client.resume).toHaveBeenCalledTimes(1); expect(client.start).toHaveBeenCalledTimes(1);
  });

  it("waits for the actual cancellation terminal and returns focus to the question", async () => {
    const { root, component, fixture, textarea } = setup(); await begin(component);
    let state = reduceStream(initialStreamState("run-one"), completedState().events[0]);
    update(snapshot(state, { connection: "connected" })); fixture.detectChanges();
    const stop = root.querySelector(".stop") as HTMLButtonElement; stop.focus(); stop.click(); await fixture.whenStable(); expect(client.cancel).toHaveBeenCalledTimes(1);
    expect(root.textContent).not.toContain("Новый запуск можно начать с другого вопроса.");
    state = reduceStream(state, { ...state.events[0], sequence: 2, type: "run.cancelled", payload: { code: "CANCELLED", stage: "model", retryable: false } });
    update(snapshot(state));
    // A renderer notification can precede the frame that re-enables the textarea.
    await Promise.resolve();
    fixture.detectChanges(); await fixture.whenStable();
    expect(root.textContent).toContain("Запуск остановлен."); expect(root.querySelector(".stop")).toBeNull(); expect(document.activeElement).toBe(textarea);
  });

  it("does not mark provisional or corrupted answers as a trusted completed result", async () => {
    const { root, component, fixture } = setup(); await begin(component);
    const full = completedState(), provisional = full.events.slice(0, 8).reduce(reduceStream, initialStreamState(full.runId));
    update(snapshot(provisional, { connection: "reconnecting" })); fixture.detectChanges();
    expect(root.textContent).toContain("Результат ещё не подтверждён"); expect(root.querySelector(".answer-badge")).toBeNull();
    update(snapshot(full, { connection: "disconnected", problem: "PROTOCOL_INVALID" })); fixture.detectChanges();
    expect(root.querySelector(".answer-text")).toBeNull(); expect(root.querySelector('[role="alert"]')!.textContent).toContain("Поток событий повреждён");
    expect(root.querySelector(".answer-badge")).toBeNull();
  });

  it("renders exact quotes as text, hides transport serialization, and disposes the transport", async () => {
    const { root, component, fixture } = setup(); await begin(component);
    const hostile = '<img src=x onerror="alert(1)">', quote = hostile + "длинноеслово".repeat(60);
    update(snapshot(completedState({ answer: 'Citation: {"indexId":"private-serialization"}' + hostile, quote }))); fixture.detectChanges();
    expect(root.querySelector("blockquote")!.textContent).toBe(quote);
    expect(root.textContent).not.toContain("private-serialization"); expect(root.textContent).not.toContain("Citation:");
    expect(root.querySelector("img")).toBeNull(); expect(root.querySelector("script")).toBeNull();
    fixture.destroy(); expect(client.dispose).toHaveBeenCalledTimes(1);
  });
});
