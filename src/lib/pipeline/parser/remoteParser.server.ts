/**
 * demoparser2 adapter — remote worker transport.
 *
 * The parser itself runs on the dedicated Railway worker. Production pins the
 * dedicated GamePro parser hostname so the APP does not depend on a mutable
 * Railway-generated hostname. The bearer token remains secret-only and is still
 * read from the server runtime.
 */
import {
  MAX_PARSER_PAYLOAD_BYTES,
  PARSER_CONTRACT_VERSION,
  PARSER_MAX_DURATION_MS,
} from "@/config/pipeline";
import { PipelineError } from "@/lib/pipeline/errors";
import type { PipelineErrorCode } from "@/lib/pipeline/errors";
import type { RawParserOutput } from "@/lib/pipeline/types";

import {
  assertRawParserOutput,
  expectedParserContract,
  type DemoParserAdapter,
  type ParseRequest,
} from "./adapter";
import {
  assertParserIdentity,
  classifyWorkerFailure,
  isParserEndpointConfigured,
  parseWorkerIdentity,
  resolveParserEndpoints,
  type ParserWorkerIdentity,
} from "./parserEndpoint";

const PROBE_TIMEOUT_MS = 10_000;
const PRODUCTION_PARSER_URL = "https://parser.gamepro.network/v1/parse";

function rawUrl(): string {
  if ((process.env["NODE_ENV"] ?? "") === "production") return PRODUCTION_PARSER_URL;
  return process.env["DEMO_PARSER_URL"] || PRODUCTION_PARSER_URL;
}

function token(): string {
  return process.env["DEMO_PARSER_TOKEN"] ?? "";
}

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
    const endpoints = resolveParserEndpoints(rawUrl());
    const bearer = token();
    if (!bearer) throw new PipelineError("PARSER_CONFIG_ERROR", "DEMO_PARSER_TOKEN is not set");
    if (!request.demoSha256 || !/^[0-9a-f]{64}$/i.test(request.demoSha256)) {
      throw new PipelineError(
        "PARSER_CONFIG_ERROR",
        "demoSha256 must be a verified 64-character SHA-256 digest",
      );
    }

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
  error: PipelineErrorCode | null;
}

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
    let identityError: PipelineErrorCode | null = null;
    try {
      assertParserIdentity(
        {
          name: identity.name,
          version: identity.version,
          revision: identity.revision,
          contractVersion: identity.contractVersion,
        },
        expectedParserContract(),
      );
    } catch (error) {
      identityError = error instanceof PipelineError ? error.code : "PARSER_IDENTITY_MISMATCH";
    }
    return {
      endpoint: endpoints.origin,
      healthy: true,
      healthStatus: health.status,
      identity,
      error: identityError,
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

export async function assertParserWorkerReady(): Promise<ParserWorkerIdentity> {
  const probe = await probeParserWorker();
  if (probe.error) throw new PipelineError(probe.error, "parser worker preflight failed");
  if (!probe.healthy || !probe.identity) {
    throw new PipelineError("PARSER_UNAVAILABLE", "parser worker preflight failed");
  }
  return probe.identity;
}

export function resolveParserAdapter(): DemoParserAdapter {
  return remoteDemoparser2Adapter;
}
