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
import {
  MAX_PARSER_PAYLOAD_BYTES,
  PARSER_CONTRACT_VERSION,
  PARSER_MAX_DURATION_MS,
} from "@/config/pipeline";
import { PipelineError } from "@/lib/pipeline/errors";
import type { RawParserOutput } from "@/lib/pipeline/types";

import {
  assertRawParserOutput,
  mapParserErrorCode,
  type DemoParserAdapter,
  type ParseRequest,
} from "./adapter";

function config() {
  return {
    url: process.env["DEMO_PARSER_URL"] ?? "",
    token: process.env["DEMO_PARSER_TOKEN"] ?? "",
  };
}

/**
 * FASE 2.7 — BOUNDED RESPONSE READING.
 *
 * `response.json()` buffers whatever the worker sends; a hostile or broken
 * worker could exhaust the runtime's memory before any limit is checked. So:
 *   1. `Content-Length`, when present, is refused up front;
 *   2. the body is read incrementally and aborted the moment the accumulated
 *      byte count exceeds MAX_PARSER_PAYLOAD_BYTES;
 *   3. only then is the text decoded and parsed as JSON.
 */
async function readBoundedText(response: Response, limit: number): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > limit) {
    throw new PipelineError("PARSER_PAYLOAD_TOO_LARGE", `content-length ${declared} > ${limit}`);
  }

  const body = response.body;
  if (!body) return "";

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > limit) {
        throw new PipelineError("PARSER_PAYLOAD_TOO_LARGE", `body exceeded ${limit} bytes`);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new PipelineError("PARSER_ERROR", "response is not valid JSON");
  }
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

    // The transport budget is the smaller of the parser ceiling and whatever is
    // left of the job's absolute deadline.
    const remaining =
      request.deadlineAt != null ? request.deadlineAt - Date.now() : PARSER_MAX_DURATION_MS;
    const budget = Math.min(PARSER_MAX_DURATION_MS, remaining);
    if (budget <= 0) throw new PipelineError("JOB_DEADLINE_EXCEEDED", "no time left for the parse");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), budget);

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
          // Error bodies are small by contract; the same ceiling still applies.
          const body = parseJson(await readBoundedText(response, MAX_PARSER_PAYLOAD_BYTES)) as {
            error_code?: unknown;
          } | null;
          if (body?.error_code) code = body.error_code;
        } catch (error) {
          if (error instanceof PipelineError && error.code === "PARSER_PAYLOAD_TOO_LARGE")
            throw error;
          /* non-JSON error body: keep the HTTP status code */
        }
        throw mapParserErrorCode(code);
      }

      return assertRawParserOutput(
        parseJson(await readBoundedText(response, MAX_PARSER_PAYLOAD_BYTES)),
      );
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
