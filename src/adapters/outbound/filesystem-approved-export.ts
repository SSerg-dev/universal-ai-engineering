import { randomUUID } from "node:crypto";
import { link, lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";

import type { ApprovedExportPort } from "../../application/ports/guard-ports.js";
import type { ClockPort } from "../../application/ports/clock-port.js";
import { validatePreparedExport } from "../../application/validate-approval.js";
import { ApprovalIdSchema, GuardRunIdSchema, ExportReceiptSchema, GuardBoundaryError } from "../../domain/guard-contracts.js";
import { ContentDigestSchema } from "../../domain/retrieval-contracts.js";
import { Sha256ContentIdentity } from "./sha256-content-identity.js";

type Publish = Parameters<ApprovedExportPort["publish"]>[0];
type Inspect = Parameters<ApprovedExportPort["inspect"]>[0];
const inspectSchema = z.strictObject({ approvalId: ApprovalIdSchema, runId: GuardRunIdSchema, contentDigest: ContentDigestSchema,
  contentBytes: z.number().int().min(1).max(32768) });
const isCode = (error: unknown, code: string) => typeof error === "object" && error !== null && "code" in error && error.code === code;

export class FilesystemApprovedExport implements ApprovedExportPort {
  readonly #root: string;
  readonly #clock: ClockPort;
  readonly #identity = new Sha256ContentIdentity();
  constructor(options: { root: string; clock: ClockPort }) {
    if (!options.root.trim()) throw new GuardBoundaryError("GUARD_EXPORT_FAILURE");
    this.#root = resolve(options.root); this.#clock = options.clock;
  }

  async inspect(raw: Inspect, signal: AbortSignal) {
    signal.throwIfAborted();
    try {
      const input = inspectSchema.parse(raw);
      let root: string;
      try { root = await realpath(this.#root); } catch (error) { if (isCode(error, "ENOENT")) return null; throw error; }
      const filename = `${input.approvalId}.md`, destination = resolve(root, filename);
      let stat;
      try { stat = await lstat(destination); } catch (error) { if (isCode(error, "ENOENT")) return null; throw error; }
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== input.contentBytes) throw new GuardBoundaryError("GUARD_EXPORT_MISMATCH");
      const handle = await open(destination, "r");
      let bytes: Buffer;
      try {
        signal.throwIfAborted();
        const opened = await handle.stat();
        if (!opened.isFile() || opened.size !== input.contentBytes) throw new GuardBoundaryError("GUARD_EXPORT_MISMATCH");
        // Fixed upper bound even if an unexpected writer grows the file.
        const buffer = Buffer.alloc(input.contentBytes + 1);
        let offset = 0;
        while (offset < buffer.length) {
          signal.throwIfAborted();
          const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
          if (bytesRead === 0) break;
          offset += bytesRead;
        }
        bytes = buffer.subarray(0, offset);
      } finally { await handle.close(); }
      signal.throwIfAborted();
      const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
      if (bytes.byteLength !== input.contentBytes || this.#identity.digest(text) !== input.contentDigest) throw new GuardBoundaryError("GUARD_EXPORT_MISMATCH");
      return ExportReceiptSchema.parse({ ...input, destinationId: "local-export", filename,
        observedAt: this.#clock.now(), acknowledgment: "existing_verified" });
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (error instanceof GuardBoundaryError) throw error;
      throw new GuardBoundaryError("GUARD_EXPORT_FAILURE");
    }
  }

  async publish(raw: Publish, signal: AbortSignal) {
    signal.throwIfAborted();
    let temporary: string | undefined, owned = false;
    try {
      const { payload: rawPayload, ...metadata } = raw;
      const input = inspectSchema.parse(metadata), checked = validatePreparedExport(rawPayload, this.#identity);
      if (checked.contentBytes !== input.contentBytes || checked.contentDigest !== input.contentDigest || checked.payload.result.runId !== input.runId) throw new GuardBoundaryError("GUARD_RESULT_INVALID");
      await mkdir(this.#root, { recursive: true }); signal.throwIfAborted();
      const root = await realpath(this.#root), filename = `${input.approvalId}.md`, destination = resolve(root, filename);
      temporary = resolve(root, `.${input.approvalId}-${randomUUID()}.tmp`);
      const handle = await open(temporary, "wx", 0o600); owned = true;
      try {
        signal.throwIfAborted();
        await handle.writeFile(checked.payload.markdown, { encoding: "utf8", signal });
        await handle.sync();
      } finally { await handle.close(); }
      signal.throwIfAborted();
      try { await link(temporary, destination); }
      catch (error) {
        if (!isCode(error, "EEXIST")) throw error;
        const receipt = await this.inspect(input, signal);
        if (!receipt) throw new GuardBoundaryError("GUARD_EXPORT_FAILURE");
        return receipt;
      }
      signal.throwIfAborted();
      return ExportReceiptSchema.parse({ ...input, destinationId: "local-export", filename,
        observedAt: this.#clock.now(), acknowledgment: "published" });
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (error instanceof GuardBoundaryError) throw error;
      throw new GuardBoundaryError("GUARD_EXPORT_FAILURE");
    } finally {
      if (temporary && owned) {
        try { await unlink(temporary); }
        catch (error) { if (!isCode(error, "ENOENT")) throw new GuardBoundaryError("GUARD_EXPORT_FAILURE"); }
      }
    }
  }
}
