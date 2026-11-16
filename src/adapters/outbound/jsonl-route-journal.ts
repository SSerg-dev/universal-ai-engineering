import { mkdir, open } from "node:fs/promises";
import { resolve } from "node:path";
import type { RouteJournalPort } from "../../application/ports/routing-port.js";
import { RouteAuditEventSchema, RouteBoundaryError, type RouteAuditEvent } from "../../domain/routing-contracts.js";

export class JsonlRouteJournal implements RouteJournalPort {
  readonly #root: string;
  constructor(options: { root: string }) {
    if (!options.root.trim()) throw new RouteBoundaryError("ROUTE_JOURNAL_FAILURE"); this.#root = resolve(options.root);
  }
  async append(raw: RouteAuditEvent, signal: AbortSignal) {
    signal.throwIfAborted();
    try {
      const event = RouteAuditEventSchema.parse(raw);
      await mkdir(this.#root, { recursive: true }); signal.throwIfAborted();
      const handle = await open(resolve(this.#root, `${event.routeId}.route.jsonl`), "a", 0o600);
      try { await handle.writeFile(`${JSON.stringify(event)}\n`, { encoding: "utf8", signal }); await handle.sync(); }
      finally { await handle.close(); }
      signal.throwIfAborted();
    } catch { if (signal.aborted) throw signal.reason; throw new RouteBoundaryError("ROUTE_JOURNAL_FAILURE"); }
  }
}
