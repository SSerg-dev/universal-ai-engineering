import type { Model } from "../application/ports.js";

export const referenceModel: Model = {
  async nextAction({ observation }, signal) {
    signal.throwIfAborted();
    return observation
      ? { kind: "answer", text: `Run ${observation.text}.` }
      : { kind: "call_tool", arguments: {} };
  },
};
