import type { ClockPort } from "../../application/ports/clock-port.js";

export class SystemClock implements ClockPort {
  now(): string {
    return new Date().toISOString();
  }
}
