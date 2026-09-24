import { ClientParserError } from "./clientParser.errors";
import {
  CLIENT_WASM_BINARY_SHA256,
  CLIENT_WASM_BINARY_URL,
  CLIENT_WASM_BINDING_SHA256,
  CLIENT_WASM_BINDING_URL,
  trustedRuntimeUrl,
} from "./clientParser.runtime";
import type { ClientParserWorkerEvent, ClientParserStage } from "./clientParser.protocol";
import { isClientParserWorkerEvent } from "./clientParser.protocol";
import { CLIENT_DEMO_PARSER_CAPABILITY } from "./clientParser.input";
import {
  CLIENT_DEMO_MAX_BYTES,
  CLIENT_PARSE_TIMEOUT_MS,
  type ClientParserEnvelope,
} from "./clientParser.types";
import { hashLargeDemInWorker } from "./largeDemHash";

export interface ClientParserProgress {
  stage: ClientParserStage;
  progress: number;
  elapsedMs: number;
}

export class ClientParserService {
  private worker: Worker | null = null;
  private requestId: string | null = null;
  private rejectCurrent: ((reason: ClientParserError) => void) | null = null;
  private hashAbortController: AbortController | null = null;

  async parse(
    file: File,
    onProgress?: (value: ClientParserProgress) => void,
  ): Promise<ClientParserEnvelope> {
    if (!file.name.toLowerCase().endsWith(".dem") || file.size < 1)
      throw new ClientParserError("CLIENT_DEMO_INVALID");
    if (file.size > CLIENT_DEMO_MAX_BYTES) throw new ClientParserError("CLIENT_DEMO_TOO_LARGE");
    this.cancel();
    // Vite bundles this as a classic worker because the audited upstream
    // wasm-bindgen output is `--target no-modules` and requires importScripts.
    const worker = new Worker(new URL("./clientParser.worker.ts", import.meta.url), {
      name: "gamepro-client-parser-poc",
    });
    this.worker = worker;
    const requestId = crypto.randomUUID();
    this.requestId = requestId;
    const baseUrl = window.location.href;
    const scriptUrl = trustedRuntimeUrl(
      (import.meta.env["VITE_CLIENT_DEM_PARSER_WASM_SCRIPT_URL"] as string | undefined) ??
        CLIENT_WASM_BINDING_URL,
      baseUrl,
    );
    const wasmUrl = trustedRuntimeUrl(
      (import.meta.env["VITE_CLIENT_DEM_PARSER_WASM_BINARY_URL"] as string | undefined) ??
        CLIENT_WASM_BINARY_URL,
      baseUrl,
    );
    const expectedBindingSha256 =
      (import.meta.env["VITE_CLIENT_DEM_PARSER_WASM_BINDING_SHA256"] as string | undefined) ??
      CLIENT_WASM_BINDING_SHA256;
    const expectedWasmSha256 =
      (import.meta.env["VITE_CLIENT_DEM_PARSER_WASM_BINARY_SHA256"] as string | undefined) ??
      CLIENT_WASM_BINARY_SHA256;

    return new Promise<ClientParserEnvelope>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        finish();
        reject(new ClientParserError("CLIENT_PARSE_TIMEOUT"));
      }, CLIENT_PARSE_TIMEOUT_MS);
      const finish = () => {
        window.clearTimeout(timeout);
        this.hashAbortController?.abort();
        this.hashAbortController = null;
        worker.terminate();
        if (this.worker === worker) this.worker = null;
        if (this.requestId === requestId) this.requestId = null;
        this.rejectCurrent = null;
      };
      this.rejectCurrent = reject;
      worker.onerror = () => {
        finish();
        reject(new ClientParserError("CLIENT_WORKER_FAILED"));
      };
      worker.onmessage = async (message: MessageEvent<unknown>) => {
        if (!isClientParserWorkerEvent(message.data)) {
          finish();
          reject(new ClientParserError("CLIENT_WORKER_FAILED"));
          return;
        }
        const event: ClientParserWorkerEvent = message.data;
        if (event.requestId !== requestId) return;
        if (event.type === "PROGRESS")
          onProgress?.({
            stage: event.stage,
            progress: event.progress,
            elapsedMs: event.elapsedMs,
          });
        else if (event.type === "READY") {
          try {
            const hashAbortController = new AbortController();
            this.hashAbortController = hashAbortController;
            const hashStarted = performance.now();
            const { sha256 } = await hashLargeDemInWorker(file, {
              signal: hashAbortController.signal,
              onProgress: ({ bytesRead, bytesTotal }) =>
                onProgress?.({
                  stage: "HASHING",
                  progress: bytesTotal > 0 ? bytesRead / bytesTotal : 1,
                  elapsedMs: 0,
                }),
            });
            const hashDurationMs = performance.now() - hashStarted;
            this.hashAbortController = null;
            worker.postMessage({
              type: "PARSE",
              requestId,
              file,
              capability: CLIENT_DEMO_PARSER_CAPABILITY,
              hashDurationMs,
              authorization: {
                authorizedDemo: true,
                provenance: "LOCAL_USER_SELECTION",
                filename: file.name,
                sha256,
                sizeBytes: file.size,
                source: "LOCAL_FILE",
                authorizationRef: `local-selection:${requestId}`,
                receivedAt: new Date().toISOString(),
              },
            });
          } catch {
            const cancelled = this.hashAbortController?.signal.aborted === true;
            finish();
            reject(
              new ClientParserError(
                cancelled ? "CLIENT_CANCELLED" : "CLIENT_DEMO_INVALID",
              ),
            );
          }
        } else if (event.type === "COMPLETE") {
          finish();
          resolve(event.envelope);
        } else if (event.type === "ERROR") {
          finish();
          reject(new ClientParserError(event.code));
        } else if (event.type === "CANCELLED") {
          finish();
          reject(new ClientParserError("CLIENT_CANCELLED"));
        }
      };
      worker.postMessage({
        type: "INIT",
        requestId,
        scriptUrl: scriptUrl ?? undefined,
        wasmUrl: wasmUrl ?? undefined,
        expectedBindingSha256,
        expectedWasmSha256,
      });
    });
  }

  cancel() {
    const worker = this.worker;
    const requestId = this.requestId;
    this.worker = null;
    this.requestId = null;
    const rejectCurrent = this.rejectCurrent;
    this.rejectCurrent = null;
    this.hashAbortController?.abort();
    this.hashAbortController = null;
    if (worker) {
      if (requestId) worker.postMessage({ type: "CANCEL", requestId });
      worker.terminate();
      rejectCurrent?.(new ClientParserError("CLIENT_CANCELLED"));
    }
  }
}
