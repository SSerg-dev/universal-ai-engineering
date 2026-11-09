import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

async function loadRegistry() {
  const module = await import("../../src/application/tool-registry.js").catch(() => undefined);
  expect(module?.ToolRegistry, "ToolRegistry must enforce typed invocation policy").toBeTypeOf("function");
  return module!;
}

const controller = () => new AbortController();
function options(allowedTools = ["echo"], signal = controller().signal, timeoutMs = 50) {
  return { allowedTools: new Set(allowedTools), signal, timeoutMs };
}
const invocation = { toolName: "echo", arguments: { value: "hello" } };

afterEach(() => vi.useRealTimers());

describe("typed tool registry", () => {
  it("rejects duplicate registrations before any handler executes", async () => {
    const { ToolRegistry, defineTool } = await loadRegistry();
    const execute = vi.fn(async (input: { value: string }) => input);
    const tool = defineTool({
      name: "echo", description: "Echo a value",
      inputSchema: z.strictObject({ value: z.string() }),
      outputSchema: z.strictObject({ value: z.string() }), execute,
    });
    expect(() => new ToolRegistry([tool, tool])).toThrow(/duplicate/iu);
    expect(execute).not.toHaveBeenCalled();
    expect(new ToolRegistry([tool]).descriptors()).toEqual([{ name: "echo", description: "Echo a value" }]);
    expect(Object.isFrozen(new ToolRegistry([tool]).descriptors())).toBe(true);
  });

  it("applies asynchronous schemas, defaults, and transforms before invoking a typed handler", async () => {
    const { ToolRegistry, defineTool } = await loadRegistry();
    const execute = vi.fn(async (input: { value: number; multiplier: number }) => ({
      result: input.value * input.multiplier,
    }));
    const registry = new ToolRegistry([defineTool({
      name: "echo", description: "Normalize numeric input",
      inputSchema: z.strictObject({
        value: z.string().transform(async (value) => Number(value)),
        multiplier: z.number().default(3),
      }),
      outputSchema: z.strictObject({ result: z.number() }).transform(async (output) => ({
        ...output, validated: true,
      })), execute,
    })]);

    expect(await registry.invoke({ toolName: "echo", arguments: { value: "7" } }, options())).toEqual({
      ok: true, observation: { toolName: "echo", output: { result: 21, validated: true }, sources: [] },
    });
    expect(execute).toHaveBeenCalledExactlyOnceWith({ value: 7, multiplier: 3 }, expect.any(AbortSignal));
  });

  it("rejects unknown, denied, malformed, and invalid-input calls without handler work", async () => {
    const { ToolRegistry, defineTool } = await loadRegistry();
    const execute = vi.fn(async (input: { value: string }) => input);
    const registry = new ToolRegistry([defineTool({
      name: "echo", description: "Echo",
      inputSchema: z.strictObject({ value: z.string() }),
      outputSchema: z.strictObject({ value: z.string() }), execute,
    })]);
    await expect(registry.invoke({ ...invocation, toolName: "missing" }, options())).resolves.toEqual({ ok: false, code: "TOOL_NOT_FOUND" });
    await expect(registry.invoke(invocation, options([]))).resolves.toEqual({ ok: false, code: "TOOL_PERMISSION_DENIED" });
    await expect(registry.invoke({ ...invocation, arguments: { value: 42 } }, options())).resolves.toEqual({ ok: false, code: "TOOL_INPUT_INVALID" });
    await expect(registry.invoke({ unexpected: true }, options())).resolves.toEqual({ ok: false, code: "TOOL_INPUT_INVALID" });
    expect(execute).not.toHaveBeenCalled();
  });

  it.each(["output", "sources"] as const)("normalizes invalid %s without leaking the value", async (invalid) => {
    const { ToolRegistry, defineTool } = await loadRegistry();
    const registry = new ToolRegistry([defineTool({
      name: "echo", description: "Untrusted result",
      inputSchema: z.unknown(), outputSchema: z.strictObject({ value: z.string() }),
      execute: async () => invalid === "output"
        ? { value: 42 } as unknown as { value: string }
        : { value: "secret" },
      sources: () => invalid === "sources" ? [{ documentId: "a", title: "" }] : [],
    })]);
    expect(await registry.invoke(invocation, options())).toEqual({ ok: false, code: "TOOL_OUTPUT_INVALID" });
  });

  it("normalizes thrown errors and cleans the caller listener", async () => {
    const { ToolRegistry, defineTool } = await loadRegistry();
    const caller = controller();
    const add = vi.spyOn(caller.signal, "addEventListener");
    const remove = vi.spyOn(caller.signal, "removeEventListener");
    const registry = new ToolRegistry([defineTool({
      name: "echo", description: "Fail safely", inputSchema: z.unknown(), outputSchema: z.unknown(),
      execute: async () => { throw new Error("secret stack provider token"); },
    })]);
    expect(await registry.invoke(invocation, options(["echo"], caller.signal))).toEqual({ ok: false, code: "TOOL_EXECUTION_FAILED" });
    expect(add).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("returns on a deadline even when the handler ignores abort and later resolves", async () => {
    const { ToolRegistry, defineTool } = await loadRegistry();
    vi.useFakeTimers();
    const started = Promise.withResolvers<void>();
    const late = Promise.withResolvers<string>();
    const sources = vi.fn(() => []);
    const registry = new ToolRegistry([defineTool({
      name: "echo", description: "Late handler", inputSchema: z.unknown(), outputSchema: z.string(), sources,
      execute: async () => { started.resolve(); return late.promise; },
    })]);
    const pending = registry.invoke(invocation, options());
    await started.promise;
    await vi.advanceTimersByTimeAsync(50);
    const result = await pending;
    expect(result).toEqual({ ok: false, code: "TOOL_TIMEOUT" });
    late.resolve("late secret");
    await late.promise;
    await Promise.resolve();
    expect(sources).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects an already-cancelled call before running a handler", async () => {
    const { ToolRegistry, defineTool } = await loadRegistry();
    const execute = vi.fn(async () => "value");
    const registry = new ToolRegistry([defineTool({
      name: "echo", description: "Cancellation", inputSchema: z.unknown(), outputSchema: z.string(), execute,
    })]);
    expect(await registry.invoke(invocation, options(["echo"], AbortSignal.abort()))).toEqual({ ok: false, code: "TOOL_CANCELLED" });
    expect(execute).not.toHaveBeenCalled();
  });

  it.each(["TOOL_CANCELLED", "TOOL_TIMEOUT"] as const)("keeps the first cancellation origin %s", async (code) => {
    const { ToolRegistry, defineTool } = await loadRegistry();
    vi.useFakeTimers();
    const caller = controller();
    const started = Promise.withResolvers<void>();
    const registry = new ToolRegistry([defineTool({
      name: "echo", description: "Race", inputSchema: z.unknown(), outputSchema: z.string(),
      execute: async () => { started.resolve(); return new Promise<string>(() => {}); },
    })]);
    const pending = registry.invoke(invocation, options(["echo"], caller.signal));
    await started.promise;
    if (code === "TOOL_CANCELLED") caller.abort(new Error("TimeoutError is an untrusted reason"));
    await vi.advanceTimersByTimeAsync(50);
    caller.abort();
    expect(await pending).toEqual({ ok: false, code });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds asynchronous input validation before the handler", async () => {
    const { ToolRegistry, defineTool } = await loadRegistry();
    vi.useFakeTimers();
    const execute = vi.fn(async () => "value");
    const registry = new ToolRegistry([defineTool({
      name: "echo", description: "Slow validation",
      inputSchema: z.string().refine(() => new Promise<boolean>(() => {})),
      outputSchema: z.string(), execute,
    })]);
    const pending = registry.invoke({ toolName: "echo", arguments: "input" }, options());
    await vi.advanceTimersByTimeAsync(50);
    expect(await pending).toEqual({ ok: false, code: "TOOL_TIMEOUT" });
    expect(execute).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([0, -1, NaN, Infinity, 2 ** 31])("fails closed on invalid timeout %s", async (timeoutMs) => {
    const { ToolRegistry, defineTool } = await loadRegistry();
    const execute = vi.fn(async () => "value");
    const registry = new ToolRegistry([defineTool({
      name: "echo", description: "Bounds", inputSchema: z.unknown(), outputSchema: z.string(), execute,
    })]);
    expect(await registry.invoke(invocation, options(["echo"], controller().signal, timeoutMs))).toEqual({ ok: false, code: "TOOL_EXECUTION_FAILED" });
    expect(execute).not.toHaveBeenCalled();
  });
});
