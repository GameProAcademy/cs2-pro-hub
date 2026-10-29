# AI Coach — providers, configuration and operations

The AI Coach (`/coach` and the floating drawer) answers from the signed-in player's own
official data. This document covers who generates the text and how to operate it.

## Architecture

| Layer | File | Role |
| --- | --- | --- |
| Server functions | `src/lib/coach.functions.ts` | auth, player from RLS, conversation ownership, rate limit, persistence |
| Context and prompt | `src/lib/coach/coachContext.ts` | factual context (same loaders as Dashboard and Player DNA), locale, rules |
| Providers | `src/lib/coach/coachProvider.server.ts` | OpenRouter primary, official OpenAI fallback, validation, metadata |
| Rendering | `src/lib/coach/coachText.ts`, `src/components/coach/RealCoachChat.tsx` | Markdown subset and LaTeX → plain text, React text nodes only |
| Labels | `src/lib/dnaSignalLabels.ts`, `src/lib/dnaFormat.ts` | display names and value formats for Player DNA signals (5 locales) |

The provider module is server-only (`*.server.ts`); keys and endpoints never reach the
client bundle.

## Providers and models

| Role | Provider | Default model | Endpoint |
| --- | --- | --- | --- |
| Primary | OpenRouter | `openai/gpt-oss-20b` | `https://openrouter.ai/api/v1/chat/completions` |
| Fallback | OpenAI (official API) | `gpt-5.6-luna` | `https://api.openai.com/v1/chat/completions` |

Gemini is not used. The configuration refuses any provider other than `openrouter` or
`openai` and any model id containing `gemini`; there is no silent route to it.

Why `gpt-5.6-luna` for the fallback (checked 2026-10-29 on the official model page):
current OpenAI model for cost-sensitive, high-volume workloads, supports
`v1/chat/completions` and `reasoning_effort`, priced at $0.20 / $1.20 per 1M input /
output tokens at that date. Prices change; none is hard-coded. Change the model with
`AI_FALLBACK_MODEL` without touching code.

Request parameters:
- OpenRouter: `max_tokens`, `reasoning: { effort: "low", exclude: true }`, headers
  `HTTP-Referer: https://gamepro.network`, `X-Title: CS2 PRO AI Coach`.
- OpenAI: `max_completion_tokens`, `reasoning_effort: "low"`.
- Output budget: `COACH_MAX_REPLY_TOKENS` (4096). Reasoning tokens share this budget.

## Configuration (backend secrets)

Set these in the app's backend secrets (Lovable Cloud → project → Secrets). Never paste a
key in chat, code, issues or logs.

| Name | Required | Default |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | yes (primary) | — |
| `OPENAI_API_KEY` | yes (fallback) | — |
| `AI_PRIMARY_PROVIDER` | no | `openrouter` |
| `AI_PRIMARY_MODEL` | no | `openai/gpt-oss-20b` |
| `AI_FALLBACK_PROVIDER` | no | `openai` (`none` disables the fallback) |
| `AI_FALLBACK_MODEL` | no | `gpt-5.6-luna` |
| `AI_TIMEOUT_MS` | no | `45000` per attempt |

`LOVABLE_API_KEY` is no longer read by the coach.

## Fallback policy

1. One attempt on the primary.
2. Any failure is classified and logged, then the fallback is tried once with the same
   request and the same validation: missing key, 401/403 auth, 402 credits, 429, 408/5xx,
   timeout or transport error, invalid JSON, HTTP 200 carrying an `error` object, empty
   content, `finish_reason` `length` (truncated), `error` or `content_filter`.
3. Both failing returns one stable code to the UI. Nothing is persisted and the draft
   stays in the box.
4. No retry loops: at most two paid calls per player message.

The fallback never hides a failure: the reply stores which provider answered and why the
fallback was used.

## Provenance stored with every reply

`coach_messages.context_type`, for example:

```
ai-coach-v2|provider=openrouter|model=openai/gpt-oss-20b|fallback=none|data=READY|matches=3|in=2150|out=410|reasoning=120|cost_usd=0.00012
```

`cost_usd` is OpenRouter's reported `usage.cost`; `?` when the provider does not report
it (OpenAI returns tokens only).

## Logs

Server logs carry `[ai-coach] provider attempt` with provider, model, ok, code, HTTP
status, latency and token/cost numbers. They never carry message text, replies, prompts,
user ids or keys.

## Diagnosing failures

| UI message | Likely code | Check |
| --- | --- | --- |
| "temporariamente indisponível" | `COACH_PROVIDER_NOT_CONFIGURED` | secret names above; model id not Gemini; provider name |
| same | `COACH_PROVIDER_AUTH_FAILED` | key revoked or wrong; OpenRouter key limit reached |
| same | `COACH_PROVIDER_NO_CREDITS` | OpenRouter credits or OpenAI billing |
| "ocupado" | `COACH_PROVIDER_RATE_LIMITED` | provider rate limit; wait |
| "limite de mensagens" | `COACH_RATE_LIMITED` | the player's own 20 messages per hour |

## Reviewing cost and usage

- Per reply: `context_type` above.
- In aggregate: OpenRouter dashboard (the key `CS2-PRO-AI-Coach` has its own spend limit)
  and the OpenAI usage dashboard.

## Rollback

- Model only: change `AI_PRIMARY_MODEL` / `AI_FALLBACK_MODEL`.
- Disable the fallback: `AI_FALLBACK_PROVIDER=none`.
- Code: revert the merge that introduced `ai-coach-v2` and publish; earlier replies keep
  their stored provenance.
