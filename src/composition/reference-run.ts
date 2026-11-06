import { randomUUID } from "node:crypto";
import { fixtureTool } from "../adapters/fixture-tool.js";
import { referenceModel } from "../adapters/reference-model.js";
import type { Journal } from "../application/ports.js";
import { runAgent } from "../application/run-agent.js";
import type { RunOptions } from "../application/run-agent.js";

export function createReferenceRun(journal: Journal) {
  return (input: unknown, options?: RunOptions) => runAgent(input, {
    model: referenceModel,
    tool: fixtureTool,
    journal,
    createRunId: randomUUID,
    now: () => new Date(),
  }, options);
}
