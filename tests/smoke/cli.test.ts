import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import { AgentEventEnvelopeSchema } from "../../src/domain/agent-events.js";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const fixtureRoot = join(repositoryRoot, "fixtures", "docs");
const tscPath = join(repositoryRoot, "node_modules", "typescript", "bin", "tsc");

interface ChildResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

async function loadCli() {
  const module = await import("../../src/adapters/inbound/cli.js").catch(
    () => undefined,
  );
  expect(
    module?.runCli,
    "runCli should expose the thin uaos ask translation adapter",
  ).toBeTypeOf("function");
  return module!;
}

function buildForChildProcess(): void {
  const result = spawnSync(process.execPath, [tscPath], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  expect(result.status, result.stderr || result.stdout).toBe(0);
}

beforeAll(buildForChildProcess, 30_000);

async function runChild(
  command: readonly string[],
  options: { readonly cwd?: string; readonly env?: NodeJS.ProcessEnv } = {},
): Promise<ChildResult> {
  return await new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [...command], {
      cwd: options.cwd ?? repositoryRoot,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (exitCode) => {
      resolveResult({ exitCode, stdout, stderr });
    });
  });
}

async function readOnlyJournal(root: string) {
  const files = await readdir(root);
  expect(files).toHaveLength(1);
  const content = await readFile(join(root, files[0]!), "utf8");
  return content
    .trimEnd()
    .split("\n")
    .map((line) => AgentEventEnvelopeSchema.parse(JSON.parse(line) as unknown));
}

describe("uaos ask CLI", () => {
  it("declares one uaos binary and script that target the compiled CLI", async () => {
    await loadCli();
    const packageJson = JSON.parse(
      await readFile(join(repositoryRoot, "package.json"), "utf8"),
    ) as {
      bin?: Record<string, string>;
      scripts?: Record<string, string>;
    };

    expect(packageJson.bin).toEqual({
      uaos: "./dist/src/adapters/inbound/cli.js",
    });
    expect(packageJson.scripts?.uaos).toBe(
      "node ./dist/src/adapters/inbound/cli.js",
    );
  });

  it("prints the shared result and creates one eight-line journal in a child process", async () => {
    await loadCli();
    const temporaryRoot = await mkdtemp(join(tmpdir(), "uaos-cli-success-"));
    const journalRoot = join(temporaryRoot, "journal");
    try {
      const cliPath = join(
        repositoryRoot,
        "dist",
        "src",
        "adapters",
        "inbound",
        "cli.js",
      );
      const result = await runChild([cliPath, "ask", "How are runs recorded?"], {
        env: {
          UAOS_FIXTURE_ROOT: fixtureRoot,
          UAOS_JOURNAL_ROOT: journalRoot,
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain(
        "Answer: The typed agent loop records ordered execution evidence around model and search actions.",
      );
      expect(result.stdout).toContain("Source references:");
      expect(result.stdout).toMatch(/Usage: modelCalls=2, toolCalls=1/u);
      expect(result.stdout).toMatch(/Run ID: run-[A-Za-z0-9-]+/u);
      const events = await readOnlyJournal(journalRoot);
      expect(events).toHaveLength(8);
      expect(events.at(-1)?.eventType).toBe("run.succeeded");
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("prints only the normalized failure and run ID for invalid input", async () => {
    await loadCli();
    const temporaryRoot = await mkdtemp(join(tmpdir(), "uaos-cli-invalid-"));
    const journalRoot = join(temporaryRoot, "journal");
    try {
      const cliPath = join(
        repositoryRoot,
        "dist",
        "src",
        "adapters",
        "inbound",
        "cli.js",
      );
      const result = await runChild([cliPath, "ask", "   "], {
        env: {
          UAOS_FIXTURE_ROOT: fixtureRoot,
          UAOS_JOURNAL_ROOT: journalRoot,
        },
      });

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toMatch(
        /^Error \[INVALID_REQUEST\] \(request\): The agent request is invalid\.\nRun ID: run-[A-Za-z0-9-]+\n$/u,
      );
      expect(result.stderr).not.toMatch(/stack|cause|Zod|at file:/iu);
      const events = await readOnlyJournal(journalRoot);
      expect(events).toHaveLength(1);
      expect(events[0]?.eventType).toBe("run.failed");
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("maps SIGINT to one caller signal, one cancellation event, and listener cleanup", async () => {
    await loadCli();
    const temporaryRoot = await mkdtemp(join(tmpdir(), "uaos-cli-sigint-"));
    const journalRoot = join(temporaryRoot, "journal");
    const cliUrl = pathToFileURL(
      join(repositoryRoot, "dist", "src", "adapters", "inbound", "cli.js"),
    ).href;
    const runAgentUrl = pathToFileURL(
      join(repositoryRoot, "dist", "src", "application", "run-agent.js"),
    ).href;
    const journalUrl = pathToFileURL(
      join(repositoryRoot, "dist", "src", "adapters", "outbound", "jsonl-journal.js"),
    ).href;
    const testAdaptersUrl = pathToFileURL(
      join(
        repositoryRoot,
        "dist",
        "src",
        "adapters",
        "outbound",
        "deterministic-test-adapters.js",
      ),
    ).href;
    const childScript = `
      import { runCli } from ${JSON.stringify(cliUrl)};
      import { createRunAgentUseCase } from ${JSON.stringify(runAgentUrl)};
      import { JsonlJournal } from ${JSON.stringify(journalUrl)};
      import { FakeSearchDocs, FixedClock, SequenceIdGenerator } from ${JSON.stringify(testAdaptersUrl)};
      const before = process.listenerCount("SIGINT");
      const model = {
        async request(_input, signal) {
          process.stdout.write("READY\\n");
          setImmediate(() => process.emit("SIGINT"));
          await new Promise((_resolve, reject) => {
            const abort = () => reject(signal.reason);
            if (signal.aborted) abort();
            else signal.addEventListener("abort", abort, { once: true });
          });
        }
      };
      const runAgent = createRunAgentUseCase({
        model,
        searchDocs: new FakeSearchDocs({ matches: [] }),
        journal: new JsonlJournal({ root: process.env.UAOS_JOURNAL_ROOT }),
        clock: new FixedClock("2026-01-01T00:00:00.000Z", 10),
        ids: new SequenceIdGenerator("sigint"),
        policy: { timeoutMs: 5000, terminalEvidenceTimeoutMs: 250, maxModelCalls: 2, maxToolCalls: 1 }
      });
      const exitCode = await runCli({
        argv: ["ask", "wait for cancellation"],
        runtimeFactory: async () => ({ runAgent })
      });
      if (process.listenerCount("SIGINT") !== before) process.exit(99);
      process.exitCode = exitCode;
    `;

    try {
      const result = await runChild(["--input-type=module", "--eval", childScript], {
        env: { UAOS_JOURNAL_ROOT: journalRoot },
      });

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("READY\n");
      expect(result.stderr).toBe(
        "Error [CANCELLED] (orchestration): The agent run was cancelled.\nRun ID: sigint-run-1\n",
      );
      const events = await readOnlyJournal(journalRoot);
      expect(events.map(({ eventType }) => eventType)).toEqual([
        "run.started",
        "model.requested",
        "run.cancelled",
      ]);
      expect(events.filter(({ eventType }) => eventType === "run.cancelled")).toHaveLength(1);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
