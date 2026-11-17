import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildHttpApp } from "../dist/src/adapters/inbound/http.js";
import { createStreamingExecution } from "../dist/src/composition/create-streaming-execution.js";
import { createStreamingRuntime } from "../dist/src/composition/create-streaming-runtime.js";
import { ingestFixtures } from "../dist/src/composition/ingest-fixtures.js";

const root = fileURLToPath(new URL("../", import.meta.url)), owner = randomUUID();
const databaseUrl = process.env.UAOS_TEST_DATABASE_URL;
if (!databaseUrl || !process.env.UAOS_TEST_DATABASE_OWNER || process.versions.node.split(".")[0] !== "24") throw new Error("Use the owned database runner with Node.js 24");
const evidenceRoot = join(root, ".uaos/ui-browser", owner), assets = join(root, "ui/dist/inspector/browser");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, timeout = 15_000) {
  const end = Date.now() + timeout;
  while (!await check()) { if (Date.now() >= end) throw new Error("CHECK_TIMEOUT"); await pause(100); }
}
class Cdp {
  #socket; #sequence = 0; #requests = new Map(); #events = new Map(); eventFailure = false;
  constructor(url) {
    this.#socket = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("CDP_TIMEOUT")), 10_000);
      this.#socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
      this.#socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("CDP_CONNECTION_FAILED")); }, { once: true });
    });
    this.#socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) {
        const pending = this.#requests.get(message.id); if (!pending) return;
        this.#requests.delete(message.id); clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error("CDP_COMMAND_FAILED")); else pending.resolve(message.result);
      } else for (const handler of this.#events.get(message.method) ?? []) {
        Promise.resolve().then(() => handler(message.params)).catch(() => { this.eventFailure = true; });
      }
    });
    this.#socket.addEventListener("close", () => {
      for (const pending of this.#requests.values()) { clearTimeout(pending.timer); pending.reject(new Error("CDP_CLOSED")); }
      this.#requests.clear();
    });
  }
  send(method, params = {}, sessionId) {
    if (this.#socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error("CDP_CLOSED"));
    const id = ++this.#sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.#requests.delete(id); reject(new Error("CDP_TIMEOUT")); }, 10_000);
      this.#requests.set(id, { resolve, reject, timer });
      this.#socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  on(method, handler) { const handlers = this.#events.get(method) ?? new Set(); handlers.add(handler); this.#events.set(method, handlers); return () => handlers.delete(handler); }
  close() { this.#socket.close(); }
}

let app, browser, cdp, profile, failureSnapshot, failureScreenshot, step = "preconditions", passed = false, holdNextExecution = false;
const checks = [], screenshots = [], network = [], exceptions = [];
try {
  await access(join(assets, "index.html"));
  const candidates = [process.env.UAOS_BROWSER_BIN, join(process.env.ProgramFiles ?? "", "Google/Chrome/Application/chrome.exe"),
    join(process.env["ProgramFiles(x86)"] ?? "", "Microsoft/Edge/Application/msedge.exe")].filter(Boolean);
  let binary;
  for (const candidate of candidates) { try { await access(candidate); binary = candidate; break; } catch { /* Try next known browser. */ } }
  if (!binary) throw new Error("BROWSER_REQUIRED");
  await mkdir(dirname(evidenceRoot), { recursive: true }); await mkdir(evidenceRoot);
  profile = await mkdtemp(join(tmpdir(), "uaos-browser-"));
  await writeFile(join(profile, "uaos-owner.json"), JSON.stringify({ owner }), { flag: "wx" });
  const options = { databaseUrl, fixtureRoot: join(root, "fixtures/docs"), indexId: `browser-${owner}`,
    journalRoot: join(evidenceRoot, "journal"), telemetryRoot: join(evidenceRoot, "telemetry"), reportRoot: join(evidenceRoot, "reports") };
  step = "fixture-ingestion"; await ingestFixtures(options, new AbortController().signal);
  const execution = createStreamingExecution(options);
  const runtime = await createStreamingRuntime({ ...options, streamExecutor: { execute: async (...args) => {
    if (holdNextExecution) {
      holdNextExecution = false;
      await new Promise((resolve) => { if (args[2].aborted) resolve(); else args[2].addEventListener("abort", resolve, { once: true }); });
    }
    return execution.execute(...args); // Actual engine still writes its cancellation evidence.
  } } });
  app = buildHttpApp(runtime);
  const filenames = new Set((await readdir(assets, { withFileTypes: true })).filter((item) => item.isFile() && /\.(?:js|css)$/u.test(item.name)).map(({ name }) => name));
  app.get("/", async (_request, reply) => reply.type("text/html; charset=utf-8").send(await readFile(join(assets, "index.html"))));
  app.get("/:asset", async (request, reply) => {
    const name = request.params?.asset;
    if (typeof name !== "string" || !filenames.has(name)) return reply.code(404).send();
    return reply.type(name.endsWith(".js") ? "text/javascript; charset=utf-8" : "text/css; charset=utf-8").send(await readFile(join(assets, name)));
  });
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address(); assert(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;

  step = "isolated-browser-launch";
  browser = spawn(binary, ["--headless", "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-background-networking", "about:blank"], { windowsHide: true, stdio: "ignore" });
  let debug, launchFailure = false; browser.once("error", () => { launchFailure = true; });
  await until(async () => {
    if (launchFailure) throw new Error("BROWSER_LAUNCH_FAILED");
    try { debug = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).trim().split(/\r?\n/u); return /^\d+$/u.test(debug[0]) && debug[1]?.startsWith("/devtools/browser/"); } catch { return false; }
  });
  cdp = new Cdp(`ws://127.0.0.1:${debug[0]}${debug[1]}`); await cdp.ready;
  const version = await cdp.send("Browser.getVersion"), { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const command = (method, params = {}) => cdp.send(method, params, sessionId);
  const evaluate = async (expression) => {
    const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (result.exceptionDetails) throw new Error("PAGE_EVALUATION_FAILED"); return result.result.value;
  };
  const wait = (expression) => until(() => evaluate(expression));
  failureSnapshot = () => evaluate("({status:document.querySelector('[role=status]')?.textContent?.trim().slice(0,240),focusId:document.activeElement?.id,focusTag:document.activeElement?.tagName,questionDisabled:document.querySelector('#question')?.disabled,stopPresent:!!document.querySelector('.stop'),dotAnimation:getComputedStyle(document.querySelector('.status-dot')).animationName,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches})");
  cdp.on("Network.requestWillBeSent", ({ request }) => network.push({ method: request.method, url: request.url }));
  cdp.on("Runtime.exceptionThrown", () => exceptions.push("PAGE_EXCEPTION"));
  await command("Page.enable"); await command("Runtime.enable"); await command("Network.enable");
  async function viewport(width, height, mobile) {
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
    await command("Emulation.setTouchEmulationEnabled", { enabled: mobile });
  }
  async function screenshot(name) {
    await evaluate("window.scrollTo(0,0); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    const height = await evaluate("Math.ceil(document.documentElement.scrollHeight)"); assert(height > 0 && height <= 10_000);
    const width = await evaluate("window.innerWidth");
    const image = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, fromSurface: true,
      clip: { x: 0, y: 0, width, height, scale: 1 } });
    const filename = `${name}.png`; await writeFile(join(evidenceRoot, filename), Buffer.from(image.data, "base64"), { flag: "wx" });
    screenshots.push({ filename, width, height });
  }
  failureScreenshot = () => screenshot("failed-state");
  const noOverflow = async () => assert(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1 && document.body.scrollWidth <= innerWidth + 1"));
  const submit = async (question) => evaluate(`(() => {const input=document.querySelector('#question');input.value=${JSON.stringify(question)};input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('form').requestSubmit();})()`);
  const ready = () => wait("document.querySelector('[role=status]')?.textContent.includes('Ответ готов') && !!document.querySelector('.answer-badge')");

  step = "desktop-empty-and-validation";
  await viewport(1440, 1000, false); await command("Page.navigate", { url: origin });
  await wait("!!document.querySelector('#question') && document.querySelector('h1')?.textContent.includes('Как рождается ответ')");
  await noOverflow(); assert(await evaluate("document.querySelectorAll('.source-card').length===0"));
  await screenshot("desktop-empty");
  await submit(""); await wait("document.querySelector('#question')?.getAttribute('aria-invalid')==='true'");
  assert(await evaluate("document.activeElement===document.querySelector('#question')")); checks.push("empty-and-validation-focus");

  step = "real-grounded-answer"; await submit("execution journal"); await ready();
  assert(await evaluate("document.querySelectorAll('.timeline li').length===9 && document.querySelectorAll('.source-card').length>0"));
  assert(await evaluate("document.activeElement===document.querySelector('#answer-title')"));
  const runId = await evaluate("document.querySelector('.run-details dd').textContent.trim()");
  const frames = []; runtime.streams.subscribe(runId, 0, (event) => { frames.push(event); }).unsubscribe();
  const answer = frames.find(({ type }) => type === "answer"); assert.equal(answer?.payload.grounding.status, "answered");
  for (const claim of answer.payload.grounding.claims) assert(await runtime.resolveCitation(claim.citation, new AbortController().signal));
  assert.equal((await runtime.inspect(runId)).complete, true);
  for (const filename of [join(options.journalRoot, `${runId}.jsonl`), join(options.telemetryRoot, `${runId}.telemetry.jsonl`)]) {
    const text = await readFile(filename, "utf8"); assert(!text.includes("execution journal") && !text.includes(databaseUrl));
    for (const claim of answer.payload.grounding.claims) assert(!text.includes(claim.quote));
  }
  await screenshot("desktop-answer"); checks.push("grounded-citations-and-safe-evidence");

  step = "mobile-layout"; await viewport(360, 900, true); await noOverflow();
  assert(await evaluate("[...document.querySelectorAll('button')].every(button => button.getBoundingClientRect().height >= 48)"));
  await screenshot("mobile-answer"); checks.push("mobile-360px-and-touch-targets");
  step = "mobile-long-text-abstention"; await submit("ж".repeat(2048)); await ready();
  await noOverflow(); assert(await evaluate("!!document.querySelector('.abstention') && document.querySelectorAll('.source-card').length===0"));
  await screenshot("mobile-long-text"); checks.push("long-question-wrap-and-honest-abstention");

  step = "read-only-reconnect"; await viewport(1440, 1000, false);
  const creates = () => network.filter(({ method, url }) => method === "POST" && new URL(url).pathname === "/api/v1/stream-runs").length;
  const before = creates(); let intercepts = 0, held;
  const stopIntercept = cdp.on("Fetch.requestPaused", async ({ requestId }) => {
    intercepts += 1;
    if (intercepts === 1) await command("Fetch.failRequest", { requestId, errorReason: "Failed" });
    else if (intercepts === 2) held = requestId;
    else await command("Fetch.continueRequest", { requestId });
  });
  await command("Fetch.enable", { patterns: [{ urlPattern: `${origin}/api/v1/stream-runs/*/events*`, requestStage: "Response" }] });
  await submit("execution journal"); await until(() => !!held);
  await wait("document.querySelector('[role=status]')?.textContent.includes('Восстанавливаем соединение')");
  await screenshot("desktop-reconnecting");
  await command("Fetch.continueRequest", { requestId: held }); await command("Fetch.disable"); stopIntercept(); await ready();
  assert.equal(creates(), before + 1); assert.equal(await evaluate("document.querySelectorAll('.timeline li').length"), 9);
  checks.push("one-create-read-only-reconnect-no-duplicate-steps");

  step = "explicit-primary-cancellation"; holdNextExecution = true;
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await submit("execution journal"); await wait("!!document.querySelector('.stop') && !document.querySelector('.stop').disabled");
  step = "cancel-reduced-motion";
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.status-dot')).animationName"), "none");
  step = "cancel-request-and-terminal";
  await evaluate("document.querySelector('.stop').click()");
  await wait("document.querySelector('[role=status]')?.textContent.includes('Запуск остановлен.')");
  step = "cancel-focus-return";
  assert(await evaluate("document.activeElement===document.querySelector('#question')"));
  step = "cancel-evidence-correlation";
  const cancelledId = await evaluate("document.querySelector('.run-details dd').textContent.trim()");
  const diagnosis = await runtime.inspect(cancelledId);
  assert.equal(diagnosis.complete, true); assert.equal(diagnosis.runMetrics.status, "cancelled");
  assert.equal(diagnosis.runMetrics.modelCalls, 0); await screenshot("desktop-cancelled");
  checks.push("actual-engine-cancellation-focus-and-reduced-motion");

  step = "privacy-and-runtime-errors";
  assert(await evaluate("localStorage.length===0 && sessionStorage.length===0"));
  assert(network.every(({ url }) => new URL(url).origin === origin)); assert.equal(exceptions.length, 0); assert.equal(cdp.eventFailure, false);
  checks.push("no-browser-storage-external-requests-or-runtime-exceptions");
  const assetDigests = {};
  for (const name of filenames) assetDigests[name] = createHash("sha256").update(await readFile(join(assets, name))).digest("hex");
  await writeFile(join(evidenceRoot, "result.json"), JSON.stringify({ checkedOn: new Date().toISOString().slice(0, 10), passed: true,
    sourceHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    browser: version.product, checks, screenshots, assetDigests, externalRequests: 0, runtimeExceptions: 0,
    cancellationFixture: "Host-only delayed port delegates to the actual observed engine after abort; no public fault switch" }, null, 2) + "\n", { flag: "wx" });
  passed = true; console.log(`UI browser check passed ${checks.length} scenarios. Evidence: ${evidenceRoot}`);
} catch (error) {
  try {
    const state = failureSnapshot ? await failureSnapshot() : null;
    if (failureScreenshot) await failureScreenshot();
    const known = ["CHECK_TIMEOUT", "CDP_TIMEOUT", "CDP_COMMAND_FAILED", "CDP_CONNECTION_FAILED", "PAGE_EVALUATION_FAILED", "BROWSER_REQUIRED", "BROWSER_LAUNCH_FAILED"];
    await writeFile(join(evidenceRoot, "failed-result.json"), JSON.stringify({ checkedOn: new Date().toISOString().slice(0, 10), passed: false, step,
      code: error?.code === "ERR_ASSERTION" ? "ASSERTION_FAILED" : known.includes(error?.message) ? error.message : "CHECK_FAILED", checks, state }, null, 2) + "\n", { flag: "wx" });
  } catch { /* No raw exception is exposed while retaining safe failure evidence. */ }
  console.error(`UI browser check failed at ${step}. No raw browser/database exception is exported.`);
} finally {
  if (cdp) { try { await cdp.send("Browser.close"); } catch { /* Closing Chrome can close the protocol before acknowledging. */ } cdp.close(); }
  if (browser && browser.exitCode === null) {
    await Promise.race([new Promise((resolve) => browser.once("exit", resolve)), pause(3000)]);
    if (browser.exitCode === null) browser.kill();
  }
  if (app) { try { await app.close(); } catch { passed = false; console.error("UI test server cleanup failed."); } }
  if (profile) {
    try {
      assert.equal(dirname(resolve(profile)), resolve(tmpdir())); assert.match(basename(profile), /^uaos-browser-/u);
      assert.equal(JSON.parse(await readFile(join(profile, "uaos-owner.json"), "utf8")).owner, owner);
      await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch { passed = false; console.error("UI browser profile cleanup failed ownership verification or removal."); }
  }
}
process.exitCode = passed ? 0 : 1;
