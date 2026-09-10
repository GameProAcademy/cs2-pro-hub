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
 * Required secrets (absent/invalid => the adapter reports itself unavailable and
 * jobs fail with PARSER_CONFIG_ERROR / PARSER_UNAVAILABLE instead of pretending
 * to have processed data):
 *   DEMO_PARSER_URL    - FULL https parse endpoint, e.g. .../v1/parse
 *   DEMO_PARSER_TOKEN  - bearer token the worker verifies (server-side only)
 *
 * GATE 1E: the endpoint, the error envelope and the error matrix live in
 * `./parserEndpoint.ts`; this file only performs the transport.
 */
import {
  MAX_PARSER_PAYLOAD_BYTES,
  PARSER_CONTRACT_VERSION,
  PARSER_MAX_DURATION_MS,
} from "@/config/pipeline";
import { PipelineError } from "@/lib/pipeline/errors";
import type { RawParserOutput } from "@/lib/pipeline/types";

import { assertRawParserOutput, type DemoParserAdapter, type ParseRequest } from "./adapter";
import {
  classifyWorkerFailure,
  isParserEndpointConfigured,
  parseWorkerIdentity,
  resolveParserEndpoints,
  type ParserWorkerIdentity,
} from "./parserEndpoint";

/** Health/version probe budget: a diagnostic must never block a job for long. */
const PROBE_TIMEOUT_MS = 10_000;

function rawUrl(): string {
  return process.env["DEMO_PARSER_URL"] ?? "";
}

function token(): string {
  return process.env["DEMO_PARSER_TOKEN"] ?? "";
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
    throw new PipelineError("PARSER_INVALID_RESPONSE", "response is not valid JSON");
  }
}

/** Reads an error body without ever letting a broken body mask the failure. */
async function readErrorBody(response: Response): Promise<unknown> {
  try {
    return parseJson(await readBoundedText(response, MAX_PARSER_PAYLOAD_BYTES));
  } catch (error) {
    if (error instanceof PipelineError && error.code === "PARSER_PAYLOAD_TOO_LARGE") throw error;
    return null;
  }
}

export const remoteDemoparser2Adapter: DemoParserAdapter = {
  id: "demoparser2-remote",

  isAvailable() {
    return isParserEndpointConfigured(rawUrl()) && token().length > 0;
  },

  async parseDemo(request: ParseRequest): Promise<RawParserOutput> {
    // Configuration is validated FIRST and fails as a configuration error.
    const endpoints = resolveParserEndpoints(rawUrl());
    const bearer = token();
    if (!bearer) throw new PipelineError("PARSER_CONFIG_ERROR", "DEMO_PARSER_TOKEN is not set");

    // The transport budget is the smaller of the parser ceiling and whatever is
    // left of the job's absolute deadline.
    const remaining =
      request.deadlineAt != null ? request.deadlineAt - Date.now() : PARSER_MAX_DURATION_MS;
    const budget = Math.min(PARSER_MAX_DURATION_MS, remaining);
    if (budget <= 0) throw new PipelineError("JOB_DEADLINE_EXCEEDED", "no time left for the parse");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), budget);
    const startedAt = Date.now();

    try {
      const response = await fetch(endpoints.parse, {
        method: "POST",
        signal: controller.signal,
        redirect: "error",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${bearer}`,
          // Correlation without secrets: upload_id is the minimal job key.
          "x-correlation-id": request.uploadId,
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
        const failure = classifyWorkerFailure(response.status, await readErrorBody(response));
        // Observability without leaking the token or the signed URL.
        console.error(
          `[parser] upload=${request.uploadId} endpoint=${endpoints.origin} status=${response.status} code=${failure.code} elapsed=${Date.now() - startedAt}ms`,
        );
        throw failure;
      }

      const output = assertRawParserOutput(
        parseJson(await readBoundedText(response, MAX_PARSER_PAYLOAD_BYTES)),
      );
      console.info(
        `[parser] upload=${request.uploadId} ok parser=${output.parser.name}@${output.parser.version} revision=${output.parser.revision ?? "unknown"} contract=${output.contract_version} elapsed=${Date.now() - startedAt}ms`,
      );
      return output;
    } catch (error) {
      if (error instanceof PipelineError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new PipelineError("PARSER_TIMEOUT", `aborted after ${Date.now() - startedAt}ms`);
      }
      // Network reset / DNS / TLS: transport failure, never an invalid demo.
      throw new PipelineError(
        "PARSER_UNAVAILABLE",
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      clearTimeout(timer);
    }
  },
};

export interface ParserWorkerProbe {
  endpoint: string;
  healthy: boolean;
  healthStatus: number | null;
  identity: ParserWorkerIdentity | null;
  error: string | null;
}

/**
 * GATE 1E — DIAGNOSTIC PROBE. Answers "is Railway alive, is the expected parser
 * deployed, is the contract aligned?" WITHOUT parsing a demo. Never called on
 * the parse hot path, so it adds no latency to a job.
 */
export async function probeParserWorker(): Promise<ParserWorkerProbe> {
  let endpoints;
  try {
    endpoints = resolveParserEndpoints(rawUrl());
  } catch (error) {
    return {
      endpoint: "",
      healthy: false,
      healthStatus: null,
      identity: null,
      error: error instanceof PipelineError ? error.code : "PARSER_CONFIG_ERROR",
    };
  }

  const probe = async (url: string): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      return await fetch(url, { method: "GET", signal: controller.signal, redirect: "error" });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    const health = await probe(endpoints.health);
    if (!health.ok) {
      return {
        endpoint: endpoints.origin,
        healthy: false,
        healthStatus: health.status,
        identity: null,
        error: "PARSER_UNAVAILABLE",
      };
    }
    const versionResponse = await probe(endpoints.version);
    if (!versionResponse.ok) {
      return {
        endpoint: endpoints.origin,
        healthy: true,
        healthStatus: health.status,
        identity: null,
        error: "PARSER_INVALID_RESPONSE",
      };
    }
    const identity = parseWorkerIdentity(
      parseJson(await readBoundedText(versionResponse, 64 * 1024)),
    );
    return {
      endpoint: endpoints.origin,
      healthy: true,
      healthStatus: health.status,
      identity,
      error:
        identity.contractVersion === PARSER_CONTRACT_VERSION ? null : "PARSER_CONTRACT_MISMATCH",
    };
  } catch (error) {
    return {
      endpoint: endpoints.origin,
      healthy: false,
      healthStatus: null,
      identity: null,
      error: error instanceof PipelineError ? error.code : "PARSER_UNAVAILABLE",
    };
  }
}

/** Adapter resolution point. Swapping parsers happens only here. */
export function resolveParserAdapter(): DemoParserAdapter {
  return remoteDemoparser2Adapter;
}
