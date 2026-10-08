import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClientParserService } from "../clientParser.service";
import { CLIENT_DEMO_MAX_BYTES, CLIENT_PARSE_TIMEOUT_MS } from "../clientParser.types";
import { fatalWasmErrorCode } from "../clientParser.errors";
import { isClientParserWorkerEvent } from "../clientParser.protocol";

const hash = vi.hoisted(() => vi.fn());
vi.mock("../largeDemHash", () => ({ hashLargeDemInWorker: hash }));
class SyntheticWorker {
  static instances: SyntheticWorker[] = [];
  onmessage: ((event: MessageEvent<unknown>) => unknown) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() {
    SyntheticWorker.instances.push(this);
  }
  get id(): string {
    return this.postMessage.mock.calls[0]?.[0].requestId;
  }
  emit(type: string, extra = {}) {
    return this.onmessage?.({ data: { type, requestId: this.id, ...extra } } as MessageEvent);
  }
}
const file = () => new File(["synthetic"], "fixture.dem");
const worker = () => {
  const value = SyntheticWorker.instances.at(-1);
  if (!value) throw new Error("test worker missing");
  return value;
};
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
beforeEach(() => {
  vi.useFakeTimers();
  SyntheticWorker.instances = [];
  vi.stubGlobal("Worker", SyntheticWorker);
  vi.stubGlobal("window", { location: { href: "https://app.test/upload" } });
  hash
    .mockReset()
    .mockImplementation(async (f: File) => ({ sha256: "a".repeat(64), bytesRead: f.size }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("synthetic lifecycle mechanics, never DEM/parity proof", () => {
  it("blocks production before constructing a worker", async () => {
    vi.stubEnv("PROD", true);
    await expect(new ClientParserService().parse(file())).rejects.toMatchObject({
      code: "CLIENT_PARSER_UNAVAILABLE",
    });
    expect(SyntheticWorker.instances).toHaveLength(0);
  });
  it("rejects empty and oversized Files before constructing a worker", async () => {
    const service = new ClientParserService();
    await expect(service.parse(new File([], "empty.dem"))).rejects.toMatchObject({
      code: "CLIENT_DEMO_INVALID",
    });
    const large = file();
    Object.defineProperty(large, "size", { value: CLIENT_DEMO_MAX_BYTES + 1 });
    await expect(service.parse(large)).rejects.toMatchObject({ code: "CLIENT_DEMO_TOO_LARGE" });
  });
  it("settles constructor failure and permits a fresh retry", async () => {
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          throw new Error("private startup diagnostic");
        }
      },
    );
    const service = new ClientParserService();
    await expect(service.parse(file())).rejects.toMatchObject({ code: "CLIENT_WORKER_FAILED" });
    vi.stubGlobal("Worker", SyntheticWorker);
    const retry = service.parse(file());
    const assertion = expect(retry).rejects.toMatchObject({ code: "CLIENT_CANCELLED" });
    service.cancel();
    await assertion;
    expect(worker().terminate).toHaveBeenCalledOnce();
  });
  it("rejects unsafe URLs without creating a worker", async () => {
    vi.stubEnv("VITE_CLIENT_DEM_PARSER_WASM_SCRIPT_URL", "https://other.test/private");
    await expect(new ClientParserService().parse(file())).rejects.toMatchObject({
      code: "CLIENT_WASM_ARTIFACT_INVALID",
    });
    expect(SyntheticWorker.instances).toHaveLength(0);
  });
  it.each(["onerror", "onmessageerror"] as const)("terminates on %s", async (handler) => {
    const pending = new ClientParserService().parse(file());
    const assertion = expect(pending).rejects.toMatchObject({ code: "CLIENT_WORKER_FAILED" });
    worker()[handler]?.();
    await assertion;
    expect(worker().terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("terminates on timeout even while hashing", async () => {
    hash.mockReturnValue(new Promise(() => {}));
    const pending = new ClientParserService().parse(file());
    const assertion = expect(pending).rejects.toMatchObject({ code: "CLIENT_PARSE_TIMEOUT" });
    void worker().emit("READY", { wasmLoadMs: 1 });
    await vi.advanceTimersByTimeAsync(CLIENT_PARSE_TIMEOUT_MS);
    await assertion;
    expect(hash.mock.calls[0]?.[1].signal.aborted).toBe(true);
    expect(worker().terminate).toHaveBeenCalledOnce();
  });
  it("deduplicates READY and fences cancelled hash completion from a retry", async () => {
    let complete: ((result: { sha256: string; bytesRead: number }) => void) | undefined;
    hash.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const service = new ClientParserService();
    const selected = file();
    const first = service.parse(selected);
    const rejected = expect(first).rejects.toMatchObject({ code: "CLIENT_CANCELLED" });
    const old = worker();
    const callback = old.onmessage;
    void old.emit("READY", { wasmLoadMs: 1 });
    void old.emit("READY", { wasmLoadMs: 1 });
    expect(hash).toHaveBeenCalledOnce();
    const second = service.parse(selected);
    await rejected;
    const secondRejected = expect(second).rejects.toMatchObject({ code: "CLIENT_CANCELLED" });
    const current = worker();
    complete?.({ sha256: "a".repeat(64), bytesRead: selected.size });
    await flush();
    await callback?.({
      data: { type: "ERROR", requestId: old.id, code: "CLIENT_WORKER_FAILED" },
    } as MessageEvent);
    expect(old.postMessage).toHaveBeenCalledOnce();
    expect(current.terminate).not.toHaveBeenCalled();
    service.cancel();
    await secondRejected;
  });
  it("fences old hash rejection after cancel and ignores foreign request IDs", async () => {
    let fail: ((error: Error) => void) | undefined;
    hash.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
    const service = new ClientParserService();
    const first = service.parse(file());
    const rejected = expect(first).rejects.toMatchObject({ code: "CLIENT_CANCELLED" });
    void worker().emit("READY", { wasmLoadMs: 1 });
    const second = service.parse(file());
    await rejected;
    const rejectedSecond = expect(second).rejects.toMatchObject({ code: "CLIENT_CANCELLED" });
    fail?.(new Error("old failure"));
    await flush();
    await worker().onmessage?.({
      data: { type: "ERROR", requestId: "foreign", code: "CLIENT_WORKER_FAILED" },
    } as MessageEvent);
    expect(worker().terminate).not.toHaveBeenCalled();
    service.cancel();
    await rejectedSecond;
  });
  it("cleans up PARSE postMessage failure", async () => {
    const pending = new ClientParserService().parse(file());
    const assertion = expect(pending).rejects.toMatchObject({ code: "CLIENT_WORKER_FAILED" });
    worker().postMessage.mockImplementation(() => {
      throw new Error("private clone failure");
    });
    await worker().emit("READY", { wasmLoadMs: 1 });
    await assertion;
    expect(worker().terminate).toHaveBeenCalledOnce();
  });
  it("cleans up INIT postMessage failure", async () => {
    vi.stubGlobal("Worker", class extends SyntheticWorker {
      constructor() {
        super();
        this.postMessage.mockImplementation(() => { throw new Error("private INIT failure"); });
      }
    });
    await expect(new ClientParserService().parse(file())).rejects.toMatchObject({ code: "CLIENT_WORKER_FAILED" });
    expect(worker().terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("rejects truncated hash and clears resources", async () => {
    hash.mockResolvedValue({ sha256: "a".repeat(64), bytesRead: 0 });
    const pending = new ClientParserService().parse(file());
    const assertion = expect(pending).rejects.toMatchObject({ code: "CLIENT_HASH_FAILED" });
    await worker().emit("READY", { wasmLoadMs: 1 }); await assertion;
    expect(worker().postMessage).toHaveBeenCalledOnce();
    expect(worker().terminate).toHaveBeenCalledOnce();
  });
  it("contains throwing progress callbacks", async () => {
    const pending = new ClientParserService().parse(file(), () => { throw new Error("consumer error"); });
    const assertion = expect(pending).rejects.toMatchObject({ code: "CLIENT_WORKER_FAILED" });
    await worker().emit("PROGRESS", { stage: "INIT", progress: 0, elapsedMs: 0 }); await assertion;
    expect(worker().terminate).toHaveBeenCalledOnce();
  });
  it.each([
    "CLIENT_WASM_INIT_FAILED",
    "CLIENT_WASM_RUNTIME_TRAP",
    "CLIENT_WASM_MEMORY_FAILURE",
    "CLIENT_WASM_INTEGRITY_MISMATCH",
    "CLIENT_PARSER_IDENTITY_MISMATCH",
    "CLIENT_CONTRACT_MISMATCH",
  ])("preserves %s and terminates", async (code) => {
    const pending = new ClientParserService().parse(file());
    const assertion = expect(pending).rejects.toMatchObject({ code });
    await worker().emit("ERROR", { code });
    await assertion;
    expect(worker().terminate).toHaveBeenCalledOnce();
  });
  it("rejects premature completion and private error strings", async () => {
    const pending = new ClientParserService().parse(file());
    const assertion = expect(pending).rejects.toMatchObject({ code: "CLIENT_RESULT_INVALID" });
    await worker().emit("COMPLETE", { envelope: { result: {}, manifest: {} } });
    await assertion;
    expect(
      isClientParserWorkerEvent({ type: "ERROR", requestId: "x", code: "https://private.test" }),
    ).toBe(false);
    expect(isClientParserWorkerEvent({ type: "COMPLETE", requestId: "x", envelope: {} })).toBe(
      false,
    );
  });
  it("classifies fatal memory/traps without exposing diagnostics", () => {
    expect(fatalWasmErrorCode(new WebAssembly.RuntimeError("unreachable private"))).toBe(
      "CLIENT_WASM_RUNTIME_TRAP",
    );
    expect(fatalWasmErrorCode(new RangeError("memory allocation failed private"))).toBe(
      "CLIENT_WASM_MEMORY_FAILURE",
    );
    expect(fatalWasmErrorCode(new Error("invalid input"))).toBeNull();
  });
});
