import { describe, expect, it } from "vitest";

import { createDiagnoseTelemetry } from "../../src/application/diagnose-telemetry.js";
import { createObservedGroundedRuntime } from "../../src/composition/create-observed-grounded-runtime.js";
import type { TelemetryRecord } from "../../src/domain/telemetry-contracts.js";
import type { RegisteredAgentEventEnvelope } from "../../src/domain/tool-events.js";

describe("Observed grounded composition without retrieval access", () => {
  it("recognizes a valid cancellation-only journal when the caller aborted before execution", async () => {
    const records: TelemetryRecord[] = [], events: RegisteredAgentEventEnvelope[] = [], caller = new AbortController();
    caller.abort();
    const runtime = await createObservedGroundedRuntime({ databaseUrl: "postgres://unused", fixtureRoot: "unused",
      journalRoot: "unused", telemetryRoot: "unused", journal: { append: async (event) => { events.push(event); } },
      telemetrySink: { append: async (record) => { records.push(record); } } });
    const result = await runtime.runAgent({ question: "private" }, caller.signal);
    expect(result).toMatchObject({ ok: false, error: { code: "CANCELLED" } });
    expect(events.map(({ eventType }) => eventType)).toEqual(["run.cancelled"]);
    expect(await createDiagnoseTelemetry({ read: async () => records })(result.runId)).toMatchObject({ complete: true,
      runMetrics: { status: "cancelled", modelCalls: 0, toolCalls: 0 } });
  });
  it("isolates concurrent run IDs, records denied permission and never exports private input", async () => {
    let sequence = 0;
    const records: TelemetryRecord[] = [], events: RegisteredAgentEventEnvelope[] = [];
    const runtime = await createObservedGroundedRuntime({
      databaseUrl: "postgres://unused", fixtureRoot: "unused", journalRoot: "unused", telemetryRoot: "unused",
      allowedTools: new Set(), ids: { next: (kind) => `${kind}-${++sequence}` },
      journal: { append: async (event) => { events.push(event); } },
      telemetrySink: { append: async (record) => { records.push(record); } },
    });
    const results = await Promise.all([runtime.runAgent({ question: "private question A" }), runtime.runAgent({ question: "private question B" })]);
    expect(new Set(results.map(({ runId }) => runId)).size).toBe(2);
    for (const result of results) {
      expect(result).toMatchObject({ ok: false, error: { code: "TOOL_FAILURE" } });
      const trace = records.filter(({ traceId }) => traceId === result.runId);
      expect(await createDiagnoseTelemetry({ read: async () => trace })(result.runId)).toMatchObject({ complete: true,
        runMetrics: { modelCalls: 1, toolCalls: 1, status: "error", errorCode: "TOOL_FAILURE" } });
      expect(trace).toContainEqual(expect.objectContaining({ kind: "span.completed", payload: expect.objectContaining({
        operation: "tool", errorCode: "TOOL_PERMISSION_DENIED",
      }) }));
      expect(events.filter(({ runId }) => runId === result.runId)).toHaveLength(6);
    }
    expect(JSON.stringify(records)).not.toMatch(/private question|postgres:|unused/u);
  });

  it("preserves required journal failure even when optional export fails", async () => {
    const runtime = await createObservedGroundedRuntime({
      databaseUrl: "postgres://unused", fixtureRoot: "unused", journalRoot: "unused", telemetryRoot: "unused",
      journal: { append: async () => { throw new Error("required failure"); } },
      telemetrySink: { append: async () => { throw new Error("optional failure"); } },
    });
    expect(await runtime.runAgent({ question: "private" })).toMatchObject({ ok: false, error: { code: "JOURNAL_FAILURE" } });
  });
});
