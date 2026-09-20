import { ClientParserError } from "./clientParser.errors";
import { trustedRuntimeUrl } from "./clientParser.runtime";
import type { ClientParserWorkerEvent, ClientParserStage } from "./clientParser.protocol";
import { CLIENT_DEMO_MAX_BYTES, type ClientParserEnvelope } from "./clientParser.types";

export interface ClientParserProgress {
  stage: ClientParserStage;
  progress: number;
  elapsedMs: number;
}

export class ClientParserService {
  private worker: Worker | null = null;
  private requestId: string | null = null;

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
      import.meta.env["VITE_CLIENT_DEM_PARSER_WASM_SCRIPT_URL"] as string | undefined,
      baseUrl,
    );
    const wasmUrl = trustedRuntimeUrl(
      import.meta.env["VITE_CLIENT_DEM_PARSER_WASM_BINARY_URL"] as string | undefined,
      baseUrl,
    );
    const expectedBindingSha256 = import.meta.env[
      "VITE_CLIENT_DEM_PARSER_WASM_BINDING_SHA256"
    ] as string | undefined;
    const expectedWasmSha256 = import.meta.env["VITE_CLIENT_DEM_PARSER_WASM_BINARY_SHA256"] as
      | string
      | undefined;

    return new Promise<ClientParserEnvelope>((resolve, reject) => {
      const finish = () => {
        worker.terminate();
        if (this.worker === worker) this.worker = null;
      };
      worker.onerror = () => {
        finish();
        reject(new ClientParserError("CLIENT_WORKER_FAILED"));
      };
      worker.onmessage = async (message: MessageEvent<unknown>) => {
        const event = message.data as ClientParserWorkerEvent;
        if (!event || event.requestId !== requestId) return;
        if (event.type === "PROGRESS")
          onProgress?.({
            stage: event.stage,
            progress: event.progress,
            elapsedMs: event.elapsedMs,
          });
        else if (event.type === "READY") {
          try {
            const bytes = await file.arrayBuffer();
            worker.postMessage(
              {
                type: "PARSE",
                requestId,
                file: { bytes, name: file.name, size: file.size, lastModified: file.lastModified },
              },
              [bytes],
            );
          } catch {
            finish();
            reject(new ClientParserError("CLIENT_DEMO_INVALID"));
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
    if (worker) {
      if (requestId) worker.postMessage({ type: "CANCEL", requestId });
      worker.terminate();
    }
  }
}
