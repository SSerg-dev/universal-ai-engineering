import { performance } from "node:perf_hooks";

import type { MonotonicClockPort } from "../../application/ports/telemetry-port.js";

export class PerformanceClock implements MonotonicClockPort {
  nowMs(): number { return performance.now(); }
}
