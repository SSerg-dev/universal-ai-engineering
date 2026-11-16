import { initialStreamState, reduceStream, type StreamState } from "../../../src/application/reduce-stream.js";
import { StreamCancelResultSchema, StreamCreatedSchema, StreamInputSchema } from "../../../src/domain/stream-contracts.js";

export type ClientProblem = "CREATE_FAILED" | "NETWORK_FAILED" | "PROTOCOL_INVALID" | "RUN_UNAVAILABLE" | "CANCEL_FAILED";
export interface ClientSnapshot {
  readonly state: StreamState | null;
  readonly connection: "idle" | "creating" | "connected" | "reconnecting" | "disconnected" | "closed";
  readonly problem: ClientProblem | null;
  readonly stopRequested: boolean;
}
class ClientFailure extends Error { constructor(readonly code: ClientProblem) { super(code); } }
type Update = (snapshot: ClientSnapshot) => void;
type Delay = (ms: number, signal: AbortSignal) => Promise<void>;
const delay: Delay = (ms, signal) => new Promise((resolve, reject) => {
  if (signal.aborted) { reject(signal.reason); return; }
  const finish = () => { signal.removeEventListener("abort", abort); resolve(); };
  const timer = setTimeout(finish, ms);
  const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(signal.reason); };
  signal.addEventListener("abort", abort, { once: true });
});

async function boundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new ClientFailure("PROTOCOL_INVALID");
  const parts: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 8192) throw new ClientFailure("PROTOCOL_INVALID");
      parts.push(chunk.value);
    }
    const combined = new Uint8Array(bytes); let offset = 0;
    for (const part of parts) { combined.set(part, offset); offset += part.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(combined)) as unknown;
  } catch (error) {
    if (error instanceof ClientFailure) throw error;
    throw new ClientFailure("PROTOCOL_INVALID");
  } finally { try { await reader.cancel(); } catch { /* Closed/aborted reader. */ } reader.releaseLock(); }
}

export class RunStreamClient {
  readonly #fetch: typeof fetch;
  readonly #delay: Delay;
  #snapshot: ClientSnapshot = { state: null, connection: "idle", problem: null, stopRequested: false };
  #update: Update = () => {};
  #controller = new AbortController();
  #busy = false;
  #disposed = false;

  constructor(fetcher: typeof fetch = globalThis.fetch.bind(globalThis), pause: Delay = delay) { this.#fetch = fetcher; this.#delay = pause; }
  get snapshot(): ClientSnapshot { return this.#snapshot; }
  #set(patch: Partial<ClientSnapshot>) {
    if (this.#disposed) return;
    this.#snapshot = { ...this.#snapshot, ...patch }; this.#update(this.#snapshot);
  }

  async start(question: string, update: Update): Promise<void> {
    if (this.#busy || this.#disposed) return;
    this.#busy = true; this.#update = update; this.#controller.abort(); this.#controller = new AbortController();
    this.#set({ connection: "creating", problem: null, stopRequested: false });
    let created = false;
    try {
      const input = StreamInputSchema.safeParse({ question });
      if (!input.success) throw new ClientFailure("CREATE_FAILED");
      const response = await this.#fetch("/api/v1/stream-runs", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(input.data), signal: AbortSignal.any([this.#controller.signal, AbortSignal.timeout(5000)]) });
      if (!response.ok) throw new ClientFailure("CREATE_FAILED");
      const selected = StreamCreatedSchema.safeParse(await boundedJson(response));
      if (!selected.success) throw new ClientFailure("PROTOCOL_INVALID");
      created = true;
      this.#set({ state: initialStreamState(selected.data.runId), connection: "connected" });
      await this.#readWithReconnect();
    } catch (error) {
      if (!this.#controller.signal.aborted) this.#set({ connection: "disconnected",
        problem: error instanceof ClientFailure ? error.code : created ? "NETWORK_FAILED" : "CREATE_FAILED" });
    } finally { this.#busy = false; }
  }

  async resume(update: Update): Promise<void> {
    if (this.#busy || this.#disposed || !this.#snapshot.state || this.#snapshot.state.phase === "terminal" || this.#snapshot.problem === "PROTOCOL_INVALID") return;
    this.#busy = true; this.#update = update; this.#set({ connection: "reconnecting", problem: null });
    try { await this.#readWithReconnect(); }
    catch (error) {
      if (!this.#controller.signal.aborted) this.#set({ connection: "disconnected", problem: error instanceof ClientFailure ? error.code : "NETWORK_FAILED" });
    } finally { this.#busy = false; }
  }

  async cancel(): Promise<void> {
    const state = this.#snapshot.state;
    if (this.#disposed || !state || state.phase === "terminal" || this.#snapshot.stopRequested) return;
    this.#set({ stopRequested: true, problem: null });
    try {
      const response = await this.#fetch(`/api/v1/stream-runs/${state.runId}/cancel`, { method: "POST",
        signal: AbortSignal.any([this.#controller.signal, AbortSignal.timeout(5000)]) });
      if (!response.ok) throw new ClientFailure("CANCEL_FAILED");
      const result = StreamCancelResultSchema.safeParse(await boundedJson(response));
      if (!result.success || result.data.runId !== state.runId) throw new ClientFailure("CANCEL_FAILED");
      // Only the read stream's actual terminal determines success/cancellation.
    } catch {
      if (!this.#controller.signal.aborted) this.#set({ stopRequested: false, problem: "CANCEL_FAILED" });
    }
  }

  async #readWithReconnect() {
    for (let attempt = 0; attempt <= 3; attempt += 1) {
      try { await this.#read(); return; }
      catch (error) {
        if (this.#controller.signal.aborted) throw error;
        if (error instanceof ClientFailure && error.code !== "NETWORK_FAILED") throw error;
        if (attempt === 3) throw new ClientFailure("NETWORK_FAILED");
        this.#set({ connection: "reconnecting", problem: null });
        await this.#delay(500 * (attempt + 1), this.#controller.signal);
      }
    }
  }
  async #read() {
    const initial = this.#snapshot.state!;
    const response = await this.#fetch(`/api/v1/stream-runs/${initial.runId}/events?after=${initial.events.length}`, {
      signal: AbortSignal.any([this.#controller.signal, AbortSignal.timeout(10_000)]),
    });
    if (response.status === 404 || response.status === 403) throw new ClientFailure("RUN_UNAVAILABLE");
    if (response.status === 400) throw new ClientFailure("PROTOCOL_INVALID");
    if (!response.ok) throw new ClientFailure("NETWORK_FAILED");
    if (!response.headers.get("content-type")?.toLowerCase().startsWith("text/event-stream") || !response.body) throw new ClientFailure("PROTOCOL_INVALID");
    this.#set({ connection: "connected", problem: null });
    const reader = response.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true });
    let pending = "";
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        if (chunk.value.byteLength > 1_048_576) throw new ClientFailure("PROTOCOL_INVALID");
        try { pending += decoder.decode(chunk.value, { stream: true }); } catch { throw new ClientFailure("PROTOCOL_INVALID"); }
        let separator: RegExpExecArray | null;
        while ((separator = /\r?\n\r?\n/u.exec(pending)) !== null) {
          const block = pending.slice(0, separator.index); pending = pending.slice(separator.index + separator[0].length);
          if (block.length > 65_536) throw new ClientFailure("PROTOCOL_INVALID");
          this.#acceptBlock(block);
        }
        if (pending.length > 65_536) throw new ClientFailure("PROTOCOL_INVALID");
        if (this.#snapshot.state?.phase === "terminal") {
          try { pending += decoder.decode(); } catch { throw new ClientFailure("PROTOCOL_INVALID"); }
          if (pending.trim()) throw new ClientFailure("PROTOCOL_INVALID");
          this.#set({ connection: "closed", stopRequested: false, problem: null }); return;
        }
      }
      if (this.#snapshot.state?.phase !== "terminal") throw new ClientFailure("NETWORK_FAILED");
      this.#set({ connection: "closed", stopRequested: false, problem: null });
    } finally { try { await reader.cancel(); } catch { /* Preserve the original read outcome. */ } reader.releaseLock(); }
  }
  #acceptBlock(block: string) {
    const lines = block.split(/\r?\n/u).filter((line) => line && !line.startsWith(":"));
    if (lines.length === 0) return;
    const fields = new Map<string, string>();
    for (const line of lines) {
      const separator = line.indexOf(":"), name = line.slice(0, separator);
      if (separator < 0 || !["id", "event", "data"].includes(name) || fields.has(name)) throw new ClientFailure("PROTOCOL_INVALID");
      fields.set(name, line.slice(separator + 1).replace(/^ /u, ""));
    }
    try {
      if (fields.size !== 3 || fields.get("event") !== "uaos") throw new Error("Invalid frame fields");
      const raw: unknown = JSON.parse(fields.get("data")!);
      const next = reduceStream(this.#snapshot.state!, raw);
      const accepted = raw as { runId: string; sequence: number };
      if (fields.get("id") !== `${accepted.runId}:${accepted.sequence}`) throw new Error("Invalid frame cursor");
      if (next !== this.#snapshot.state) this.#set({ state: next });
    } catch { throw new ClientFailure("PROTOCOL_INVALID"); }
  }
  dispose(): void { this.#disposed = true; this.#controller.abort(); }
}
