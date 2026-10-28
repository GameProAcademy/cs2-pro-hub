/**
 * AI Coach provider: the Lovable AI Gateway (OpenAI-compatible chat completions).
 *
 * The key is LOVABLE_API_KEY, provisioned and managed by Lovable Cloud for this
 * project; it is read only here, on the server, and never logged or returned.
 * The model can be pinned with COACH_AI_MODEL; otherwise the first available
 * model of COACH_DEFAULT_MODELS answers (a 400/404 "unknown model" moves to the
 * next one; any other error stops).
 */
export const COACH_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
export const COACH_DEFAULT_MODELS = [
  "google/gemini-3.7-flash",
  "google/gemini-2.5-flash",
  "openai/gpt-5.5",
];
const TIMEOUT_MS = 45_000;

export type CoachProviderError =
  | "COACH_PROVIDER_NOT_CONFIGURED"
  | "COACH_PROVIDER_RATE_LIMITED"
  | "COACH_PROVIDER_NO_CREDITS"
  | "COACH_PROVIDER_FAILED"
  | "COACH_PROVIDER_EMPTY";

export class CoachProviderFailure extends Error {
  constructor(
    readonly code: CoachProviderError,
    readonly status: number | null = null,
  ) {
    super(code);
  }
}

export interface CoachCompletion {
  content: string;
  model: string;
}

export async function completeCoach(
  messages: Array<{ role: string; content: string }>,
  options: {
    maxTokens: number;
    env?: Record<string, string | undefined>;
    fetchImpl?: typeof fetch;
  },
): Promise<CoachCompletion> {
  const env = options.env ?? process.env;
  const key = env["LOVABLE_API_KEY"];
  if (!key) throw new CoachProviderFailure("COACH_PROVIDER_NOT_CONFIGURED");
  const pinned = env["COACH_AI_MODEL"]?.trim();
  const models = pinned ? [pinned] : COACH_DEFAULT_MODELS;
  const doFetch = options.fetchImpl ?? fetch;

  for (const model of models) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await doFetch(COACH_GATEWAY_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, max_tokens: options.maxTokens, temperature: 0.3 }),
        signal: controller.signal,
      });
    } catch {
      throw new CoachProviderFailure("COACH_PROVIDER_FAILED");
    } finally {
      clearTimeout(timer);
    }
    if (response.status === 429) throw new CoachProviderFailure("COACH_PROVIDER_RATE_LIMITED", 429);
    if (response.status === 402) throw new CoachProviderFailure("COACH_PROVIDER_NO_CREDITS", 402);
    if (response.status === 401 || response.status === 403)
      throw new CoachProviderFailure("COACH_PROVIDER_NOT_CONFIGURED", response.status);
    if (
      (response.status === 400 || response.status === 404) &&
      !pinned &&
      model !== models.at(-1)
    ) {
      continue; // model not available to this workspace: try the next default
    }
    if (!response.ok) throw new CoachProviderFailure("COACH_PROVIDER_FAILED", response.status);
    const body = (await response.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: unknown } }>;
      model?: unknown;
    } | null;
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim())
      throw new CoachProviderFailure("COACH_PROVIDER_EMPTY");
    return { content: content.trim(), model: typeof body?.model === "string" ? body.model : model };
  }
  throw new CoachProviderFailure("COACH_PROVIDER_FAILED");
}
