import { execFileSync, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const infrastructure = JSON.parse(readFileSync(new URL("../docs/reviews/INFRASTRUCTURE-04.json", import.meta.url), "utf8"));
const owner = randomUUID();
const name = `uaos-retrieval-test-${owner}`;
const password = randomBytes(24).toString("hex");
const docker = (args) => execFileSync("docker", args, { encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] }).trim();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let created = false;
let testExit = 1;

try {
  if (process.versions.node.split(".")[0] !== "24") throw new Error("Node.js 24 required");
  execFileSync(process.execPath, ["node_modules/typescript/bin/tsc"], { cwd: root, timeout: 30_000, stdio: ["ignore", "pipe", "pipe"] });
  if (!/^pgvector\/pgvector@sha256:[a-f0-9]{64}$/u.test(infrastructure.image)) throw new Error("Invalid image pin");
  created = true; // Also inspect/clean up if Docker starts the container but the command times out.
  docker(["run", "-d", "--name", name, "--label", `org.uaos.test-owner=${owner}`,
    "--memory", "512m", "--cpus", "1", "--tmpfs", "/var/lib/postgresql:rw,noexec,nosuid,size=256m",
    "-e", `POSTGRES_PASSWORD=${password}`, "-e", "POSTGRES_DB=uaos_fixture",
    "-p", "127.0.0.1::5432", infrastructure.image]);
  const deadline = Date.now() + 20_000;
  while (true) {
    try { docker(["exec", name, "pg_isready", "-U", "postgres", "-d", "uaos_fixture"]); break; }
    catch { if (Date.now() >= deadline) throw new Error("Database not ready"); await pause(250); }
  }
  const info = JSON.parse(docker(["inspect", name]))[0];
  const binding = info.NetworkSettings.Ports["5432/tcp"]?.[0];
  if (binding?.HostIp !== "127.0.0.1" || !/^\d+$/u.test(binding.HostPort)) throw new Error("Invalid loopback binding");
  const url = `postgresql://postgres:${password}@127.0.0.1:${binding.HostPort}/uaos_fixture`;
  console.log("Testing disposable PostgreSQL/pgvector with the pinned image.");
  testExit = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.database.config.ts"], {
      cwd: root, stdio: "inherit", env: { ...process.env, UAOS_TEST_DATABASE_URL: url, UAOS_TEST_DATABASE_OWNER: owner },
    });
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
} catch {
  console.error("The disposable database check failed. Check Node.js 24, Docker, and the pinned image.");
  testExit = 1;
} finally {
  if (created) {
    try {
      const info = JSON.parse(docker(["inspect", name]))[0];
      if (!/^uaos-retrieval-test-[a-f0-9-]{36}$/u.test(name) ||
          info.Name !== `/${name}` || info.Config.Labels?.["org.uaos.test-owner"] !== owner) {
        throw new Error("Ownership verification failed");
      }
      docker(["rm", "-f", "-v", name]);
      console.log("Removed the owned disposable database container.");
    } catch {
      console.error("Database cleanup failed ownership verification or removal.");
      testExit = 1;
    }
  }
}
process.exitCode = testExit;
