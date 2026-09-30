import { mkdir, open } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import type { JournalPort } from "../../application/ports/journal-port.js";
import {
  AgentEventEnvelopeSchema,
  type AgentEventEnvelope,
} from "../../domain/agent-events.js";

const SAFE_RUN_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

export interface JsonlJournalOptions {
  readonly root: string;
}

function journalPath(root: string, runId: string): string {
  if (!SAFE_RUN_ID.test(runId)) {
    throw new Error("Journal runId contains characters that are not filename-safe.");
  }

  const candidate = resolve(root, `${runId}.jsonl`);
  const pathFromRoot = relative(root, candidate);
  if (
    pathFromRoot.length === 0 ||
    pathFromRoot === ".." ||
    pathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRoot)
  ) {
    throw new Error("Journal path must remain within the configured root.");
  }

  return candidate;
}

export class JsonlJournal implements JournalPort {
  readonly #root: string;

  constructor(options: JsonlJournalOptions) {
    if (options.root.trim().length === 0) {
      throw new Error("JsonlJournal requires a configured root.");
    }
    this.#root = resolve(options.root);
  }

  async append(event: AgentEventEnvelope, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    const parsedEvent = AgentEventEnvelopeSchema.parse(event);
    const path = journalPath(this.#root, parsedEvent.runId);
    const line = `${JSON.stringify(parsedEvent)}\n`;

    await mkdir(this.#root, { recursive: true });
    signal.throwIfAborted();
    const handle = await open(path, "a");
    try {
      signal.throwIfAborted();
      await handle.appendFile(line, { encoding: "utf8", signal });
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
}
