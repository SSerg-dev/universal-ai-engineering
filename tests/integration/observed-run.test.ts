import { describe, expect, it } from "vitest";

import { GroundedTeachingModel } from "../../src/adapters/outbound/grounded-teaching-model.js";
import { Sha256ContentIdentity } from "../../src/adapters/outbound/sha256-content-identity.js";
import { createDiagnoseTelemetry } from "../../src/application/diagnose-telemetry.js";
import { prepareDocument } from "../../src/application/ingest-document.js";
import { ObservedRun } from "../../src/application/observed-run.js";
import { createGroundedRunAgentUseCase } from "../../src/application/run-grounded-agent.js";
import { defineTool, ToolRegistry } from "../../src/application/tool-registry.js";
import type { ModelPort } from "../../src/application/ports/model-port.js";
import type { TelemetrySinkPort } from "../../src/application/ports/telemetry-port.js";
import { RetrievalInputSchema, RetrievalOutputSchema } from "../../src/domain/retrieval-contracts.js";
import { TelemetryRecordSchema, type TelemetryRecord } from "../../src/domain/telemetry-contracts.js";
import { RegisteredAgentEventEnvelopeSchema, type RegisteredAgentEventEnvelope } from "../../src/domain/tool-events.js";
import type { ToolObservation } from "../../src/domain/tool-contracts.js";

const clock = { now: () => "2026-11-15T00:00:00.000Z" };
const passage = prepareDocument({ indexId: "course", embedding: { id: "fixture", dimensions: 2 }, chunker: "utf16-v1" },
  { documentId: "journal", title: "Journal", content: "# Journal\nPrivate fixture quotation.\n" }, new Sha256ContentIdentity()).passages[0]!;
const output = { indexId: "course", profileId: "fixture", passages: [{ ...passage, score: 1 }] };

function harness(options: {
  observed?: boolean; runId?: string; failAppend?: number; sink?: TelemetrySinkPort;
  retrieve?: () => Promise<unknown>; model?: ModelPort<ToolObservation>; badClock?: boolean;
} = {}) {
  let sequence = 0, spanSequence = 0, ticks = 0, appended = 0;
  const runId = options.runId ?? "run-observed", events: RegisteredAgentEventEnvelope[] = [], records: TelemetryRecord[] = [];
  const journal = { append: async (event: RegisteredAgentEventEnvelope, signal: AbortSignal) => {
    signal.throwIfAborted(); if (++appended === options.failAppend) throw new Error("private journal failure");
    events.push(RegisteredAgentEventEnvelopeSchema.parse(event));
  } };
  const observation = new ObservedRun({ runId, journal, clock,
    monotonic: { nowMs: () => options.badClock ? Number.NaN : ++ticks },
    ids: { nextSpanId: () => `${runId}-span-${++spanSequence}` },
    sink: options.sink ?? { append: async (record) => { records.push(TelemetryRecordSchema.parse(record)); } }, flushTimeoutMs: 10,
  });
  const observed = options.observed !== false;
  const run = createGroundedRunAgentUseCase({
    model: options.model ?? new GroundedTeachingModel(), clock, ids: { next: (kind) => kind === "run" ? runId : `${kind}-${++sequence}` },
    journal: observed ? observation : journal,
    tools: new ToolRegistry([defineTool({ name: "retrieve_passages", description: "Controlled observed fixture",
      inputSchema: RetrievalInputSchema, outputSchema: RetrievalOutputSchema,
      execute: async (_input, signal) => observed ? observation.measure(options.retrieve ?? (async () => output), signal) : output,
      sources: (value) => value.passages.map(({ documentId, title }) => ({ documentId, title })),
    })]),
    policy: { timeoutMs: 1000, terminalEvidenceTimeoutMs: 250, maxModelCalls: 2, maxToolCalls: 1 },
    toolPolicy: { allowedTools: new Set(["retrieve_passages"]), timeoutMs: 20 },
  });
  return { run: async (signal?: AbortSignal) => {
    const result = await run({ question: "private question" }, signal);
    const delivery = observed ? await observation.finish(result) : undefined;
    return { result, delivery };
  }, events, records };
}

describe("Measured optional observation around the unchanged loop", () => {
  it("preserves primary results while recording correlated measured spans and journal durations", async () => {
    const baseline = harness({ observed: false }), observed = harness();
    const plain = await baseline.run(), measured = await observed.run();
    expect(measured.result).toEqual(plain.result);
    const diagnosis = await createDiagnoseTelemetry({ read: async () => observed.records })("run-observed");
    expect(diagnosis.complete).toBe(true); expect(diagnosis.issues).toEqual([]);
    expect(diagnosis.runMetrics).toMatchObject({ modelCalls: 2, toolCalls: 1, retries: 0, status: "ok" });
    expect(diagnosis.runMetrics!.retrievalDurationMs).toBeGreaterThan(0);
    expect(observed.events.find(({ eventType }) => eventType === "model.responded")?.payload).toMatchObject({ durationMs: expect.any(Number) });
    expect(baseline.events.find(({ eventType }) => eventType === "model.responded")?.payload).toMatchObject({ durationMs: 0 });
    expect(JSON.stringify(observed.records)).not.toContain("private question");
    expect(JSON.stringify(observed.records)).not.toContain("Private fixture quotation");
  });

  it.each([1, 3, 8])("preserves required JOURNAL_FAILURE at append %s and traces the failed persistence", async (failAppend) => {
    const baseline = harness({ observed: false, failAppend }), observed = harness({ failAppend });
    expect((await observed.run()).result).toEqual((await baseline.run()).result);
    const diagnosis = await createDiagnoseTelemetry({ read: async () => observed.records })("run-observed");
    expect(diagnosis.complete).toBe(true); expect(diagnosis.runMetrics?.errorCode).toBe("JOURNAL_FAILURE");
    expect(diagnosis.spans.some(({ operation, errorCode }) => operation === "journal" && errorCode === "JOURNAL_FAILURE")).toBe(true);
  });

  it("isolates failed and noncooperative exporters from a successful primary result", async () => {
    const baseline = (await harness({ observed: false }).run()).result;
    for (const sink of [{ append: async () => { throw new Error("private exporter failure"); } }, { append: async () => new Promise<void>(() => {}) }]) {
      const observed = await harness({ sink }).run();
      expect(observed.result).toEqual(baseline); expect(observed.delivery?.dropped).toBeGreaterThan(0);
    }
  });

  it("contains an invalid optional clock without changing the result", async () => {
    const baseline = (await harness({ observed: false }).run()).result;
    const observed = harness({ badClock: true }); expect((await observed.run()).result).toEqual(baseline);
    expect((await createDiagnoseTelemetry({ read: async () => observed.records })("run-observed")).issues).toContain("BUFFER_DROPS");
  });

  it("closes a timed-out noncooperative retrieval once and ignores its late settlement", async () => {
    const late = Promise.withResolvers<unknown>();
    const observed = harness({ retrieve: async () => late.promise });
    const { result } = await observed.run(); expect(result).toMatchObject({ ok: false, error: { code: "TOOL_FAILURE" } });
    const before = JSON.stringify(observed.records);
    expect(observed.records.filter((record) => record.kind === "span.completed" && record.payload.operation === "retrieval"))
      .toMatchObject([{ payload: { errorCode: "TOOL_TIMEOUT" } }]);
    late.resolve(output); await new Promise((resolve) => setImmediate(resolve));
    expect(JSON.stringify(observed.records)).toBe(before);
    expect((await createDiagnoseTelemetry({ read: async () => observed.records })("run-observed")).complete).toBe(true);
  });

  it("closes pending model work with the real caller cancellation outcome", async () => {
    const started = Promise.withResolvers<void>(), caller = new AbortController();
    const observed = harness({ model: { request: async (_input, signal) => {
      started.resolve(); await new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    } } });
    const pending = observed.run(caller.signal); await started.promise; caller.abort();
    expect((await pending).result).toMatchObject({ ok: false, error: { code: "CANCELLED" } });
    const diagnosis = await createDiagnoseTelemetry({ read: async () => observed.records })("run-observed");
    expect(diagnosis.complete).toBe(true); expect(diagnosis.runMetrics?.status).toBe("cancelled");
    expect(diagnosis.spans).toContainEqual(expect.objectContaining({ operation: "model", errorCode: "CANCELLED" }));
  });

  it("keeps mutable timing/span state isolated for overlapping runs", async () => {
    const first = harness({ runId: "run-first" }), second = harness({ runId: "run-second" });
    await Promise.all([first.run(), second.run()]);
    for (const [id, context] of [["run-first", first], ["run-second", second]] as const) {
      expect(context.records.every(({ traceId }) => traceId === id)).toBe(true);
      expect((await createDiagnoseTelemetry({ read: async () => context.records })(id)).complete).toBe(true);
    }
  });
});
