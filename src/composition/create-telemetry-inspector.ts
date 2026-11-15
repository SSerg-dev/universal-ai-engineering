import { FilesystemTelemetry } from "../adapters/outbound/filesystem-telemetry.js";
import { createDiagnoseTelemetry } from "../application/diagnose-telemetry.js";

// Diagnostics remain usable while the primary database or application is unavailable.
export function createTelemetryInspector(root: string) {
  return createDiagnoseTelemetry(new FilesystemTelemetry({ root }));
}
