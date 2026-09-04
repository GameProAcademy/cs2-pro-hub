/**
 * FASE 2.2.1 — Data API client factory (SERVER ONLY).
 *
 * The API key is read here and nowhere else. Logs are structured and contain no
 * key, token, state, verifier, cookie or upstream body.
 */
import { createFaceitClient, type FaceitClient } from "./faceit.http";
import { requireFaceitDataApiConfig, type FaceitDataApiConfig } from "./faceit.config.server";
import { FACEIT_MIN_CALL_SPACING_MS } from "./faceit.constants";

export interface FaceitRuntime {
  client: FaceitClient;
  config: FaceitDataApiConfig;
}

export interface FaceitRuntimeOptions {
  /** HARD ceiling of HTTP requests (retries included) for this runtime. */
  callBudget?: number;
  /** Epoch ms after which no new request may start. */
  deadlineAt?: number;
}

export function faceitRuntime(options: FaceitRuntimeOptions = {}): FaceitRuntime {
  const config = requireFaceitDataApiConfig();
  const client = createFaceitClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
    minSpacingMs: FACEIT_MIN_CALL_SPACING_MS,
    ...(options.callBudget === undefined ? {} : { callBudget: options.callBudget }),
    ...(options.deadlineAt === undefined ? {} : { deadlineAt: options.deadlineAt }),
    onLog: (entry) => {
      console.info(
        `[faceit] endpoint=${entry.endpoint} status=${entry.status ?? "none"} code=${
          entry.errorCode ?? "ok"
        } attempt=${entry.attempt} ms=${entry.durationMs}`,
      );
    },
  });
  return { client, config };
}
