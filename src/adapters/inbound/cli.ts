#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { RunAgentUseCase } from "../../application/run-agent.js";
import type { Runtime } from "../../composition/create-runtime.js";
import { createIterationRuntime } from "../../composition/create-iteration-runtime.js";
import { StateBoundaryError } from "../../domain/state-contracts.js";

interface TextWriter {
  write(value: string): unknown;
}

export interface RunCliOptions {
  readonly argv?: readonly string[];
  readonly stdout?: TextWriter;
  readonly stderr?: TextWriter;
  readonly runtimeFactory?: () => Promise<Runtime>;
}

function defaultRuntimeFactory(): Promise<Runtime> {
  return createIterationRuntime({
    iteration: process.env.UAOS_ITERATION,
    mcpConsent: process.env.UAOS_MCP_CONSENT,
    databaseUrl: process.env.UAOS_DATABASE_URL,
    indexId: process.env.UAOS_INDEX_ID,
    fixtureRoot:
      process.env.UAOS_FIXTURE_ROOT ?? resolve(process.cwd(), "fixtures", "docs"),
    journalRoot:
      process.env.UAOS_JOURNAL_ROOT ?? resolve(process.cwd(), ".uaos", "journal"),
  });
}

function cliInput(argv: readonly string[]): unknown {
  if (argv.length !== 2 || argv[0] !== "ask") {
    return { question: undefined };
  }

  return { question: argv[1] };
}

function writeSuccess(
  stdout: TextWriter,
  result: Extract<Awaited<ReturnType<RunAgentUseCase>>, { readonly ok: true }>,
): void {
  const sourceLines =
    result.sources.length === 0
      ? ["- None"]
      : result.sources.map(
          ({ documentId, title }) => `- ${title} (${documentId})`,
        );

  stdout.write(
    [
      `Answer: ${result.answer}`,
      "Source references:",
      ...sourceLines,
      `Usage: modelCalls=${result.usage.modelCalls}, toolCalls=${result.usage.toolCalls}`,
      `Run ID: ${result.runId}`,
      "",
    ].join("\n"),
  );
}

export async function runCli(options: RunCliOptions = {}): Promise<number> {
  const argv = options.argv ?? process.argv.slice(2);
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const runtimeFactory = options.runtimeFactory ?? defaultRuntimeFactory;
  const controller = new AbortController();
  const abortFromSigint = () => controller.abort();

  process.on("SIGINT", abortFromSigint);
  try {
    const runtime = await runtimeFactory();
    if (argv.length === 2 && argv[0] === "state") {
      try {
        if (!runtime.conversationCommand) throw new StateBoundaryError("STATE_INPUT_INVALID");
        let command: unknown;
        try { command = JSON.parse(argv[1]!); } catch { throw new StateBoundaryError("STATE_INPUT_INVALID"); }
        const result = await runtime.conversationCommand(command, controller.signal);
        stdout.write(`${JSON.stringify(result)}\n`);
        return 0;
      } catch (error) {
        const code = error instanceof StateBoundaryError ? error.code : "STATE_REPOSITORY_FAILURE";
        stderr.write(`Error [${code}]: The conversation state operation could not be completed.\n`);
        return 1;
      }
    }
    if (argv.length === 2 && argv[0] === "cite") {
      try {
        if (!runtime.resolveCitation) throw new Error("resolver unavailable");
        const passage = await runtime.resolveCitation(JSON.parse(argv[1]!), controller.signal);
        if (passage === null) { stderr.write("Error: The indexed citation was not found.\n"); return 1; }
        stdout.write(`${JSON.stringify(passage)}\n`);
        return 0;
      } catch {
        stderr.write("Error: The indexed citation could not be resolved.\n");
        return 1;
      }
    }
    const result = await runtime.runAgent(cliInput(argv), controller.signal);

    if (result.ok) {
      writeSuccess(stdout, result);
      return 0;
    }

    stderr.write(
      `Error [${result.error.code}] (${result.error.stage}): ${result.error.message}\n` +
        `Run ID: ${result.runId}\n`,
    );
    return 1;
  } finally {
    process.removeListener("SIGINT", abortFromSigint);
  }
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  pathToFileURL(resolve(invokedPath)).href === import.meta.url
) {
  runCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch(() => {
      process.stderr.write("Error: The CLI runtime could not be started.\n");
      process.exitCode = 1;
    });
}
