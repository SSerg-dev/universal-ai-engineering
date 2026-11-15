import { lstat, mkdir, open, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import type { TelemetryReadPort, TelemetrySinkPort } from "../../application/ports/telemetry-port.js";
import { TelemetryBoundaryError, TelemetryRecordSchema, type TelemetryRecord } from "../../domain/telemetry-contracts.js";

const MAX_BYTES = 1024 * 1024;
const safeTrace = /^(?:run|operation|evaluation)-[A-Za-z0-9_-]{1,110}$/u;
interface OwnedTrace { device: bigint; inode: bigint; size: bigint; sequence: number }
function missing(error: unknown) { return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"; }

export class FilesystemTelemetry implements TelemetrySinkPort, TelemetryReadPort {
  readonly #root: string;
  readonly #owned = new Map<string, OwnedTrace>();
  constructor(options: { root: string }) { this.#root = options.root; }

  async #path(traceId: string, create: boolean) {
    if (!safeTrace.test(traceId)) throw new TelemetryBoundaryError("INVALID_TRACE_ID");
    if (!this.#root.trim()) throw new Error("Invalid telemetry root");
    const selected = resolve(this.#root);
    if (create) await mkdir(selected, { recursive: true });
    const root = await realpath(selected), path = resolve(root, `${traceId}.telemetry.jsonl`), part = relative(root, path);
    if (!part || part === ".." || part.startsWith(`..${sep}`) || isAbsolute(part)) throw new TelemetryBoundaryError("INVALID_TRACE_ID");
    return { root, path };
  }

  async append(raw: TelemetryRecord, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    let traceId: string | undefined;
    try {
      const record = TelemetryRecordSchema.parse(raw); traceId = record.traceId;
      const owned = this.#owned.get(traceId);
      if ((record.sequence === 1 && owned) || (record.sequence !== 1 && (!owned || record.sequence !== owned.sequence + 1)) ||
        (!owned && this.#owned.size >= 64)) throw new Error("Invalid telemetry ownership or sequence");
      const { path } = await this.#path(traceId, true);
      signal.throwIfAborted();
      const handle = await open(path, record.sequence === 1 ? "wx" : "r+", 0o600);
      let next: OwnedTrace;
      try {
        const stat = await handle.stat({ bigint: true });
        if (!stat.isFile() || (owned && (stat.dev !== owned.device || stat.ino !== owned.inode || stat.size !== owned.size))) throw new Error("Telemetry target changed");
        const data = Buffer.from(`${JSON.stringify(record)}\n`, "utf8");
        if (stat.size + BigInt(data.length) > BigInt(MAX_BYTES)) throw new Error("Telemetry size bound");
        let offset = 0;
        while (offset < data.length) {
          signal.throwIfAborted();
          const { bytesWritten } = await handle.write(data, offset, data.length - offset, Number(stat.size) + offset);
          if (bytesWritten === 0) throw new Error("Incomplete telemetry write");
          offset += bytesWritten;
        }
        await handle.sync();
        next = { device: stat.dev, inode: stat.ino, size: stat.size + BigInt(data.length), sequence: record.sequence };
      } finally { await handle.close(); }
      if (["run.metrics", "state.completed", "evaluation.metrics", "evaluation.failed"].includes(record.kind)) this.#owned.delete(traceId);
      else this.#owned.set(traceId, next!);
    } catch {
      if (traceId) this.#owned.delete(traceId);
      if (signal.aborted) throw signal.reason;
      throw new Error("The optional telemetry export failed.");
    }
  }

  async read(traceId: string, signal: AbortSignal): Promise<unknown> {
    signal.throwIfAborted();
    try {
      const { root, path } = await this.#path(traceId, false);
      const expected = await lstat(path, { bigint: true });
      if (!expected.isFile() || expected.isSymbolicLink() || dirname(await realpath(path)) !== root) throw new Error("Invalid telemetry file");
      const handle = await open(path, "r");
      let data: Buffer;
      try {
        const stat = await handle.stat({ bigint: true });
        if (stat.dev !== expected.dev || stat.ino !== expected.ino || !stat.isFile() || stat.size > BigInt(MAX_BYTES)) throw new Error("Telemetry read bound");
        const buffer = Buffer.alloc(MAX_BYTES + 1); let size = 0;
        while (size < buffer.length) {
          signal.throwIfAborted();
          const { bytesRead } = await handle.read(buffer, size, buffer.length - size, null);
          if (bytesRead === 0) break; size += bytesRead;
        }
        if (size > MAX_BYTES) throw new Error("Telemetry read bound"); data = buffer.subarray(0, size);
      } finally { await handle.close(); }
      signal.throwIfAborted();
      const text = new TextDecoder("utf-8", { fatal: true }).decode(data);
      if (!text) return [];
      if (!text.endsWith("\n")) throw new Error("Partial telemetry line");
      const lines = text.trimEnd().split("\n");
      if (lines.length > 64) throw new Error("Telemetry record bound");
      return lines.map((line) => TelemetryRecordSchema.parse(JSON.parse(line)));
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (missing(error)) return null;
      if (error instanceof TelemetryBoundaryError && error.code === "INVALID_TRACE_ID") throw error;
      throw new TelemetryBoundaryError("TELEMETRY_READ_FAILURE");
    }
  }
}
