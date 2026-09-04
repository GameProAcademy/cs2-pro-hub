/**
 * FASE 2.2.1 — Data API client factory (SERVER ONLY).
 *
 * The API key is read here and nowhere else. Logs are structured and contain no
 * key, token, state, verifier, cookie or upstream body.
 */
import { createFaceitClient, type FaceitClient } from "./faceit.http";
import { requireFaceitDataApiConfig, type FaceitDataApiConfig } from "./faceit.config.server";

export interface FaceitRuntime {
  client: FaceitClient;
  config: FaceitDataApiConfig;
}

export function faceitRuntime(): FaceitRuntime {
  const config = requireFaceitDataApiConfig();
  const client = createFaceitClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
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
