import type { ClockPort } from "../../application/ports/clock-port.js";
import type {
  IdGeneratorPort,
  IdKind,
} from "../../application/ports/id-generator-port.js";
import type { JournalPort } from "../../application/ports/journal-port.js";
import type { ModelPort, ModelRequest } from "../../application/ports/model-port.js";
import type { SearchDocsPort } from "../../application/ports/search-docs-port.js";
import {
  SearchDocsInputSchema,
  SearchDocsOutputSchema,
  type SearchDocsInput,
  type SearchDocsOutput,
} from "../../domain/agent-contracts.js";
import {
  AgentEventEnvelopeSchema,
  type AgentEventEnvelope,
} from "../../domain/agent-events.js";

export interface CallFailureOptions {
  readonly failAtCall?: number;
  readonly error?: Error;
  readonly delayMs?: number;
}

async function waitForDelay(delayMs: number | undefined, signal: AbortSignal) {
  if (delayMs === undefined || delayMs === 0) return;
  await new Promise<void>((resolve, reject) => {
    const complete = () => {
      signal.removeEventListener("abort", abort);
      resolve();
    };
    const timeout = setTimeout(complete, delayMs);
    const abort = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}

export class ScriptedModel<TObservation = SearchDocsOutput> implements ModelPort<TObservation> {
  readonly #actions: readonly unknown[];
  readonly #options: CallFailureOptions;
  readonly #requests: ModelRequest<TObservation>[] = [];

  constructor(actions: readonly unknown[], options: CallFailureOptions = {}) {
    this.#actions = [...actions];
    this.#options = options;
  }

  async request(input: ModelRequest<TObservation>, signal: AbortSignal): Promise<unknown> {
    signal.throwIfAborted();
    this.#requests.push(structuredClone(input));
    const callNumber = this.#requests.length;
    await waitForDelay(this.#options.delayMs, signal);

    if (this.#options.failAtCall === callNumber) {
      throw this.#options.error ?? new Error(`Scripted model failed at call ${callNumber}.`);
    }
    if (callNumber > this.#actions.length) {
      throw new Error(`Scripted model has no action for call ${callNumber}.`);
    }

    return this.#actions[callNumber - 1];
  }

  requests(): readonly ModelRequest<TObservation>[] {
    return structuredClone(this.#requests);
  }
}

export class FakeSearchDocs implements SearchDocsPort {
  readonly #outputs: readonly SearchDocsOutput[];
  readonly #options: CallFailureOptions;
  readonly #calls: SearchDocsInput[] = [];

  constructor(
    outputs: SearchDocsOutput | readonly SearchDocsOutput[],
    options: CallFailureOptions = {},
  ) {
    const scriptedOutputs = Array.isArray(outputs) ? outputs : [outputs];
    this.#outputs = scriptedOutputs.map((output) => SearchDocsOutputSchema.parse(output));
    this.#options = options;
  }

  async search(input: SearchDocsInput, signal: AbortSignal): Promise<SearchDocsOutput> {
    signal.throwIfAborted();
    this.#calls.push(SearchDocsInputSchema.parse(input));
    const callNumber = this.#calls.length;
    await waitForDelay(this.#options.delayMs, signal);

    if (this.#options.failAtCall === callNumber) {
      throw this.#options.error ?? new Error(`Fake search failed at call ${callNumber}.`);
    }

    const output = this.#outputs[callNumber - 1] ?? this.#outputs.at(-1);
    if (output === undefined) {
      throw new Error(`Fake search has no output for call ${callNumber}.`);
    }

    return structuredClone(output);
  }

  calls(): readonly SearchDocsInput[] {
    return structuredClone(this.#calls);
  }
}

export class FixedClock implements ClockPort {
  readonly #incrementMs: number;
  #nextTimestampMs: number;

  constructor(initialTimestamp: string, incrementMs = 0) {
    const initialTimestampMs = Date.parse(initialTimestamp);
    if (!Number.isFinite(initialTimestampMs)) {
      throw new Error("FixedClock requires a valid timestamp.");
    }
    if (!Number.isInteger(incrementMs) || incrementMs < 0) {
      throw new Error("FixedClock increment must be a non-negative integer.");
    }

    this.#nextTimestampMs = initialTimestampMs;
    this.#incrementMs = incrementMs;
  }

  now(): string {
    const timestamp = new Date(this.#nextTimestampMs).toISOString();
    this.#nextTimestampMs += this.#incrementMs;
    return timestamp;
  }
}

export class SequenceIdGenerator implements IdGeneratorPort {
  readonly #prefix: string;
  #sequence = 0;

  constructor(prefix: string) {
    if (prefix.trim().length === 0) {
      throw new Error("SequenceIdGenerator prefix must not be empty.");
    }
    this.#prefix = prefix;
  }

  next(kind: IdKind): string {
    this.#sequence += 1;
    return `${this.#prefix}-${kind}-${this.#sequence}`;
  }
}

export interface InMemoryJournalOptions {
  readonly failAtAppend?: number;
  readonly error?: Error;
  readonly delayMs?: number;
}

export class InMemoryJournal implements JournalPort {
  readonly #options: InMemoryJournalOptions;
  readonly #events: AgentEventEnvelope[] = [];
  readonly #attemptedEvents: AgentEventEnvelope[] = [];

  constructor(options: InMemoryJournalOptions = {}) {
    this.#options = options;
  }

  async append(event: AgentEventEnvelope, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    const parsedEvent = AgentEventEnvelopeSchema.parse(event);
    this.#attemptedEvents.push(parsedEvent);
    const appendNumber = this.#attemptedEvents.length;
    await waitForDelay(this.#options.delayMs, signal);

    if (this.#options.failAtAppend === appendNumber) {
      throw this.#options.error ?? new Error(`In-memory journal failed at append ${appendNumber}.`);
    }

    this.#events.push(parsedEvent);
  }

  events(): readonly AgentEventEnvelope[] {
    return structuredClone(this.#events);
  }

  attempts(): readonly AgentEventEnvelope[] {
    return structuredClone(this.#attemptedEvents);
  }
}
