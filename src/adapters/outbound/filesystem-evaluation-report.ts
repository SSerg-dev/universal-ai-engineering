import { randomUUID } from "node:crypto";
import { link, mkdir, open, realpath, unlink } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import type { EvaluationReportPort } from "../../application/ports/evaluation-report-port.js";
import { EvaluationBoundaryError, EvaluationReportSchema, type EvaluationReport } from "../../domain/evaluation-contracts.js";

const safeId = /^(?:evaluation|operation)-[A-Za-z0-9_-]{1,110}$/u;

function inside(root: string, name: string) {
  const path = resolve(root, name), part = relative(root, path);
  if (!part || part === ".." || part.startsWith(`..${sep}`) || isAbsolute(part)) throw new Error("invalid report path");
  return path;
}

export class FilesystemEvaluationReport implements EvaluationReportPort {
  readonly #root: string;
  constructor(options: { root: string }) {
    if (options.root.trim().length === 0) throw new EvaluationBoundaryError("REPORT_FAILURE");
    this.#root = resolve(options.root);
  }

  async save(raw: EvaluationReport, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    let temporary: string | undefined;
    let temporaryOwned = false;
    try {
      const report = EvaluationReportSchema.parse(raw);
      if (!safeId.test(report.evaluationId)) throw new Error("invalid report id");
      await mkdir(this.#root, { recursive: true });
      signal.throwIfAborted();
      const root = await realpath(this.#root);
      const destination = inside(root, `${report.evaluationId}.json`);
      temporary = inside(root, `.${report.evaluationId}-${randomUUID()}.tmp`);
      const handle = await open(temporary, "wx", 0o600);
      temporaryOwned = true;
      try {
        signal.throwIfAborted();
        await handle.writeFile(`${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", signal });
        await handle.sync();
      } finally { await handle.close(); }
      signal.throwIfAborted();
      await link(temporary, destination);
    } catch {
      if (signal.aborted) throw signal.reason;
      throw new EvaluationBoundaryError("REPORT_FAILURE");
    } finally {
      if (temporary && temporaryOwned) {
        try { await unlink(temporary); }
        catch (error) {
          if (!(typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")) {
            if (signal.aborted) throw signal.reason;
            throw new EvaluationBoundaryError("REPORT_FAILURE");
          }
        }
      }
    }
  }
}
