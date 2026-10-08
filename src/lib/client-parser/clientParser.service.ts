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
  // The only shared value is ownership. All resources belong to one closure.
  private active: { cancel: () => void } | null = null;

  async parse(
    file: File,
    onProgress?: (value: ClientParserProgress) => void,
  ): Promise<ClientParserEnvelope> {
    if (import.meta.env.PROD) throw new ClientParserError("CLIENT_PARSER_UNAVAILABLE");
    if (!file.name.toLowerCase().endsWith(".dem") || file.size < 1)
      throw new ClientParserError("CLIENT_DEMO_INVALID");
    if (file.size > CLIENT_DEMO_MAX_BYTES) throw new ClientParserError("CLIENT_DEMO_TOO_LARGE");
    this.cancel();

    return new Promise<ClientParserEnvelope>((resolve, reject) => {
      let worker: Worker | null = null;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let settled = false;
      let phase: "INIT" | "HASHING" | "PARSING" = "INIT";
      const hashAbortController = new AbortController();
      const run = { cancel: () => finish(new ClientParserError("CLIENT_CANCELLED")) };
      const isActive = () => !settled && this.active === run;
      const finish = (error?: ClientParserError, envelope?: ClientParserEnvelope) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        hashAbortController.abort();
        if (worker) {
          worker.onmessage = null;
          worker.onerror = null;
          worker.onmessageerror = null;
          worker.terminate();
        }
        if (this.active === run) this.active = null;
        if (error) reject(error);
        else if (envelope) resolve(envelope);
        else reject(new ClientParserError("CLIENT_RESULT_INVALID"));
      };
      this.active = run;
      // Consumer callbacks are never allowed to escape the lifecycle boundary.
      const progress = (value: ClientParserProgress) => {
        if (!isActive()) return;
        try {
          onProgress?.(value);
        } catch {
          finish(new ClientParserError("CLIENT_WORKER_FAILED"));
        }
      };
      try {
        const requestId = crypto.randomUUID();
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
        if (!scriptUrl || !wasmUrl) {
          finish(new ClientParserError("CLIENT_WASM_ARTIFACT_INVALID"));
          return;
        }
        const expectedBindingSha256 =
          (import.meta.env["VITE_CLIENT_DEM_PARSER_WASM_BINDING_SHA256"] as string | undefined) ??
          CLIENT_WASM_BINDING_SHA256;
        const expectedWasmSha256 =
          (import.meta.env["VITE_CLIENT_DEM_PARSER_WASM_BINARY_SHA256"] as string | undefined) ??
          CLIENT_WASM_BINARY_SHA256;
        worker = new Worker(new URL("./clientParser.worker.ts", import.meta.url), {
          name: "gamepro-client-parser-poc",
        });
        const currentWorker = worker;
        timeout = setTimeout(
          () => finish(new ClientParserError("CLIENT_PARSE_TIMEOUT")),
          CLIENT_PARSE_TIMEOUT_MS,
        );
        const post = (command: unknown) => {
          if (!isActive()) return;
          try {
            currentWorker.postMessage(command);
          } catch {
            finish(new ClientParserError("CLIENT_WORKER_FAILED"));
          }
        };
        currentWorker.onerror = () => {
          if (isActive()) finish(new ClientParserError("CLIENT_WORKER_FAILED"));
        };
        currentWorker.onmessageerror = () => {
          if (isActive()) finish(new ClientParserError("CLIENT_WORKER_FAILED"));
        };
        currentWorker.onmessage = async (message: MessageEvent<unknown>) => {
          if (!isActive()) return;
          if (!isClientParserWorkerEvent(message.data)) {
            finish(new ClientParserError("CLIENT_WORKER_FAILED"));
            return;
          }
          const event: ClientParserWorkerEvent = message.data;
          if (event.requestId !== requestId) return;
          if (event.type === "PROGRESS") {
            progress({ stage: event.stage, progress: event.progress, elapsedMs: event.elapsedMs });
          } else if (event.type === "READY") {
            if (phase !== "INIT") return;
            phase = "HASHING"; // Fence duplicate READY before the first await.
            try {
              const hashStarted = performance.now();
              const { sha256, bytesRead } = await hashLargeDemInWorker(file, {
                signal: hashAbortController.signal,
                onProgress: ({ bytesRead, bytesTotal }) =>
                  progress({
                    stage: "HASHING",
                    progress: bytesTotal > 0 ? bytesRead / bytesTotal : 1,
                    elapsedMs: 0,
                  }),
              });
              if (!isActive() || hashAbortController.signal.aborted) return;
              if (bytesRead !== file.size || !/^[0-9a-f]{64}$/.test(sha256)) {
                finish(new ClientParserError("CLIENT_HASH_FAILED"));
                return;
              }
              phase = "PARSING";
              post({
                type: "PARSE",
                requestId,
                file,
                capability: CLIENT_DEMO_PARSER_CAPABILITY,
                hashDurationMs: performance.now() - hashStarted,
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
              if (isActive())
                finish(
                  new ClientParserError(
                    hashAbortController.signal.aborted ? "CLIENT_CANCELLED" : "CLIENT_HASH_FAILED",
                  ),
                );
            }
          } else if (event.type === "COMPLETE") {
            if (phase !== "PARSING") {
              finish(new ClientParserError("CLIENT_RESULT_INVALID"));
              return;
            }
            finish(undefined, event.envelope);
          } else if (event.type === "ERROR") {
            finish(new ClientParserError(event.code));
          } else if (event.type === "CANCELLED") {
            finish(new ClientParserError("CLIENT_CANCELLED"));
          }
        };
        post({
          type: "INIT",
          requestId,
          scriptUrl,
          wasmUrl,
          expectedBindingSha256,
          expectedWasmSha256,
        });
      } catch {
        finish(new ClientParserError("CLIENT_WORKER_FAILED"));
      }
    });
  }

  cancel() {
    this.active?.cancel();
  }
}
