/**
 * demoparser2 adapter — remote worker transport.
 *
 * HONEST RUNTIME NOTE
 * -------------------
 * `demoparser2` is a native (Rust/Python) library. The application server runs
 * on an edge Worker runtime with no native addons and no long-running CPU
 * budget, so the parse itself CANNOT execute in-process here. There is no
 * "fake" in-process parser in this codebase.
 *
 * The pipeline therefore calls a dedicated server-side parser worker over HTTP.
 * The worker downloads the demo from a short-lived signed URL, runs
 * demoparser2, and answers with the `RawParserOutput` contract
 * (`contract_version = PARSER_CONTRACT_VERSION`).
 *
 * Required secrets (absent => the adapter reports itself unavailable and jobs
 * fail with PARSER_UNAVAILABLE instead of pretending to have processed data):
 *   DEMO_PARSER_URL    - https endpoint of the parser worker
 *   DEMO_PARSER_TOKEN  - bearer token the worker verifies
 *
 * See docs/PHASE-2-DEMO-PIPELINE.md for the worker contract.
 */
import { PARSER_CONTRACT_VERSION } from "@/config/pipeline";
import { PipelineError } from "@/lib/pipeline/errors";
import type { RawParserOutput } from "@/lib/pipeline/types";

import {
  assertRawParserOutput,
  mapParserErrorCode,
  type DemoParserAdapter,
  type ParseRequest,
} from "./adapter";

const REQUEST_TIMEOUT_MS = 240_000;

function config() {
  return {
    url: process.env["DEMO_PARSER_URL"] ?? "",
    token: process.env["DEMO_PARSER_TOKEN"] ?? "",
  };
}

export const remoteDemoparser2Adapter: DemoParserAdapter = {
  id: "demoparser2-remote",

  isAvailable() {
    const { url, token } = config();
    return url.startsWith("https://") && token.length > 0;
  },

  async parseDemo(request: ParseRequest): Promise<RawParserOutput> {
    const { url, token } = config();
    if (!this.isAvailable()) throw new PipelineError("PARSER_UNAVAILABLE", "worker not configured");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          contract_version: PARSER_CONTRACT_VERSION,
          upload_id: request.uploadId,
          demo_url: request.signedUrl,
          demo_sha256: request.demoSha256,
          file_size: request.fileSize,
        }),
      });

      if (!response.ok) {
        let code: unknown = `HTTP_${response.status}`;
        try {
          const body = (await response.json()) as { error_code?: unknown };
          if (body?.error_code) code = body.error_code;
        } catch {
          /* non-JSON error body: keep the HTTP status code */
        }
        throw mapParserErrorCode(code);
      }

      return assertRawParserOutput(await response.json());
    } catch (error) {
      if (error instanceof PipelineError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new PipelineError("PARSER_TIMEOUT");
      }
      throw new PipelineError("PARSER_ERROR", error instanceof Error ? error.message : undefined);
    } finally {
      clearTimeout(timer);
    }
  },
};

/** Adapter resolution point. Swapping parsers happens only here. */
export function resolveParserAdapter(): DemoParserAdapter {
  return remoteDemoparser2Adapter;
}
