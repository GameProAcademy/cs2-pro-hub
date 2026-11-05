# AI Coach context contract — `coach-context-v1` (Fase 3.1)

What the model receives as `PLAYER_FACTS` (one system message, together with the rules of
`coachSystemPrompt`). Built by `buildCoachFacts` (`src/lib/coach/coachContext.ts`), pure, from
the caller's own RLS-scoped rows. Guarded by `src/lib/__tests__/coachContext31.test.ts`,
`aiCoach.test.ts` and `coachPresentation.test.ts`.

## Sources (never recomputed here)

| Block                     | Source                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `observations[]`, `sides` | `xray-v1` (`buildXRay`): the same contract `/analysis` renders, with CT/T rounds from `round_players` (`loadSideRounds`) |
| `matches[]`, `totals`     | `match_metrics` per match (`loadPlayerOverview`), counts summed in code                                                  |
| `playerDna`               | `match_features` (`loadPlayerDna`), **only when READY**                                                                  |
| `inferences`              | `xray-v1` inferences (weakest-dimension rule of the training plan), **only when READY**                                  |
| `declared`                | the player's profile: `player_profiles.current_level / experience`, `player_profile_goals`, `player_profile_roles`       |
| `catalogSuggestions`      | catalog items selected for this message (`coachNeeds`; DNA dimensions only when READY)                                   |

## Status of every value

| Status                | Meaning                                                                                                            | Value sent         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------ |
| `OBSERVED`            | counted from persisted match events (sums: deaths, opening kills, trades, clutches, grenade damage, flash assists) | yes                |
| `DERIVED`             | catalogued formula over observed values (K/D, ADR, KAST, HS%, rating, side ratings)                                | yes                |
| `INFERRED`            | documented rule over observations (X-ray weakest dimensions)                                                       | the rule's reading |
| `NOT_OBSERVED`        | nothing observed (no match / DNA dimension without signal)                                                         | null               |
| `NOT_MEASURED`        | not measured from these matches                                                                                    | null               |
| `INSUFFICIENT_SAMPLE` | below the canonical minimum (DNA: `DNA_MIN_MATCHES = 3`)                                                           | nothing            |
| `UNAVAILABLE`         | excluded on purpose (admission limitation such as L04 for results)                                                 | null               |

Each observation carries `metric`, `status`, `value`, `unit`, `aggregation`, `matches`,
`numerator`, `denominator`, `source` and an optional `note`. Values are rounded once, with the
deterministic rule of Fase 2.1 (`roundHalfUp`, catalog `digits.contract`).

## Rules enforced in code (not only in the prompt)

- **Player DNA:** `playerDna.dimensions`, `strongest`, `weakest` and `inferences` are empty
  unless the DNA is READY _and_ has at least `minimumMatches`. A label that contradicts its
  own sample (READY with 2 of 3) is treated as not ready. No "N / 100" string, no index and no
  ranking reaches the model below the minimum.
- **Flash assists:** sent as `DERIVED` with `provenance: GAME_FLAG_OR_TIMED_ATTRIBUTION` and a
  `note`. `metrics.ts` credits a flash assist from the game's per-kill `assistedflash` flag when
  every kill of the match carries it, otherwise from a timed attribution over blind events
  (`flashAssisterFor`). Which method produced each match's count is not stored (no column in
  `match_metrics`, no `assisted_flash` in `round_events.data`), so the value is a CS2 PRO count
  that cannot be re-verified. The Coach says "CS2 PRO counted N" (never "the game recorded")
  and never concludes that the player does not flash for teammates. A counted 0 stays 0.
  Enemies flashed is `NOT MEASURED`.
- **K/D source:** the catalog keeps one `table.column` per metric (it drives admission
  classes); the Coach view of `kd` cites both inputs, `match_metrics.kills / match_metrics.deaths`.
- **Result / score / win rate:** `UNAVAILABLE` while the admission excludes them; the prompt
  forbids inferring a result.
- **Dates:** `period.dateBasis` / `matches[].dateBasis` = `processed` means the processing
  date, never the match date.
- **Minimal context:**
  - `matches[]` holds the matches of the maps the message names, else the 10 most recent;
    `totals` and `observations` always cover all matches.
  - DNA signals are sent only when the message is about the profile.
- **Declared preferences:** `declared.status = DECLARED_BY_PLAYER`; a preference, never a
  measurement.
- **Isolation:**
  - The player is the caller's own `player_profiles` row (`ownPlayerIds`).
  - The conversation is proved to be theirs before its history is read.
  - No nickname, file name, Steam id or other player's data enters the facts.

## Conversations and declared preferences (Fase 3.2)

- Conversations: `listCoachConversations`, `getCoachConversation`, `deleteCoachConversation`
  (`src/lib/coachSession.functions.ts`). Every call is authenticated, resolves the player from
  the session (never from the request) and filters by `player_id`; RLS (`owns_player`,
  `owns_conversation`) backs it. A conversation's messages are read only after proving it
  belongs to the caller. Deleting a conversation deletes its messages (cascade).
- Titles: one line from the first question, cut at a word, at most 60 characters.
- Optional preferences (`coach_preferences`, migration `20261104150000`): main difficulty and
  maps of interest, from closed lists. They reach the model under `declared` as
  `DECLARED_BY_PLAYER`, never as measurements. Goal, level and role stay in the profile.
  If the table is absent (migration not yet applied) the read returns `available: false` and
  the UI hides the personalisation entry points; the Coach keeps working.
- Suggested questions only fill the input; the player still decides to send.

## Provider resilience, idempotency and cost (Fase 3.3)

Provider and model are fixed: OpenRouter `openai/gpt-oss-20b`. No Gemini; the OpenAI fallback
stays off unless `AI_FALLBACK_PROVIDER=openai` is set explicitly. A failure never swaps the model.

| Failure                                                             | Code                                          | Retried?           |
| ------------------------------------------------------------------- | --------------------------------------------- | ------------------ |
| Our timeout (`AI_TIMEOUT_MS`, 45 s)                                 | `COACH_PROVIDER_TIMEOUT`                      | No (may be billed) |
| Connection never established (DNS, refused, reset, connect timeout) | `COACH_PROVIDER_UNAVAILABLE`                  | Once               |
| 429 (Retry-After ≤ 4 s honoured)                                    | `COACH_PROVIDER_RATE_LIMITED`                 | Once               |
| 502 / 503                                                           | `COACH_PROVIDER_UNAVAILABLE`                  | Once               |
| 500 / 504 / 408                                                     | `COACH_PROVIDER_UNAVAILABLE`                  | No                 |
| 401                                                                 | `COACH_PROVIDER_AUTH_FAILED`                  | No                 |
| 403                                                                 | `COACH_PROVIDER_FORBIDDEN`                    | No                 |
| 402                                                                 | `COACH_PROVIDER_NO_CREDITS`                   | No                 |
| 404, or 400 "no endpoints / invalid model"                          | `COACH_PROVIDER_MODEL_UNAVAILABLE`            | No                 |
| Other 400 / 422                                                     | `COACH_PROVIDER_BAD_REQUEST`                  | No                 |
| Invalid JSON, 200 with error, empty, truncated                      | `…INVALID_RESPONSE` / `…EMPTY` / `…TRUNCATED` | No                 |

- At most one retry per provider (`MAX_RETRIES = 1`), backoff 400 ms · 2^(n−1) + up to 250 ms
  of jitter. Only failures that cannot have produced a billed completion are retried.
- Idempotency: the chat sends a `requestId` (UUID) and reuses it when the same question is
  retried in the same conversation. The question is stored with `id = requestId` and the reply
  with `context_id = requestId`. An answered id returns the stored pair (`replayed: true`) with
  no provider call and no rate-limit charge; a concurrent duplicate gets the stored pair or
  `COACH_REQUEST_IN_PROGRESS`; an orphan question older than 90 s is answered once more.
  Lookups run through the caller's client, so RLS hides anyone else's rows.
- A failure after the provider answered is `COACH_PERSIST_FAILED` (not a generic error).
- Context size guard: at most 48 000 characters per request; the oldest history turns are
  dropped first, never the facts, the rules or the new question.
- Logs: one line per attempt with a correlation id (the request id), provider, model, retry
  index, status, latency, tokens and cost. Never content, prompt, user id or key.
- Streaming is not used: replies are validated (links, truncation) before they are shown or
  stored, which a stream would bypass. Typical latency is shown with a progress state.

## Reply guard (Fase 3 closeout)

`src/lib/coach/coachReplyGuard.ts` runs on the server after the link sanitizer and before the
reply is stored or shown. Deterministic, no second model call:

- **Statistics:** in the Data section every number, and in the Interpretation section every
  decimal, percentage or number above 10, must equal a value in PLAYER_FACTS at the precision
  written (or ×100 for a ratio). A line or sentence that fails is removed. Recommendation keeps
  its drill numbers (minutes, repetitions).
- **Comparisons:** sentences comparing the player with other players, an outside average, a
  percentile or a professional level are removed (5 languages). Comparisons with the player's
  own values ("your average", CT vs T) stay.
- **Sources:** a dotted identifier that is neither an observation source nor a PLAYER_FACTS
  path is replaced by "—".
- **Flash wording:** "the game recorded" becomes "CS2 PRO counted" (5 languages).
- When anything is removed, the reply ends with a one-line notice, the server logs the
  counts, and the provenance row carries `guard=stats.comparisons.sources.flashWording`.

## Durable idempotency (Fase 3.5)

Replaces the Fase 3.3 / closeout mechanism (request id as the question's id, checked with a
SELECT, plus a head-only count for foreign ids), which still let two concurrent sends both
reach the provider before the unique constraint decided.

- **Table** `coach_request_reservations` (migration `20261105100000`): one row per request
  id, global. RLS on, no policy for `anon`/`authenticated`, grants only to `service_role`.
- **RPCs** (SECURITY INVOKER, `search_path = ''`, EXECUTE only for `service_role`; the server
  passes the user and player it derived from the session):
  - `coach_claim_request` — `INSERT … ON CONFLICT DO NOTHING` elects the single owner of a
    new id; an existing id is locked `FOR UPDATE` before any decision. Outcomes:
    `ACQUIRED` (only this one may call the provider), `REPLAY`, `IN_PROGRESS`, `CONFLICT`
    (another account, another conversation or another question — no other column returned),
    `OUTCOME_UNKNOWN`, `PERSIST_TAKEOVER`, `FAILED_FINAL`, `NOT_OWNER`.
  - `coach_complete_request` — question (`id = request_id`) + reply (`context_id =
request_id`) + `COMPLETED` in ONE transaction, fenced by the lease token.
  - `coach_fail_request` — `FAILED` (no usable billed reply: a retry with the same id may take
    over, at most 5 attempts) or `OUTCOME_UNKNOWN`.
  - `coach_persist_pending` — the provider answered, the guarded reply is kept; the next
    retry persists it without generating again.
- **Leases and fencing:** lease 120 s (provider timeout 45 s + one bounded retry). Each
  takeover issues a new token; complete/fail/persist require the current token, so an
  executor that lost its lease cannot write. An expired `PROCESSING` lease is NOT taken over:
  it becomes `OUTCOME_UNKNOWN` (the provider may have been called). The original holder
  arriving late may still complete it (nobody else generated).
- **Uncertain outcomes** (`outcomeUncertain`): our timeout, or a connection lost after the
  request was sent. Never retried automatically; the chat shows `coach2.error.outcomeUnknown`
  and the next send uses a NEW request id (a deliberate retry by the player).
- **Order:** auth → player → conversation ownership → claim → rate limit → context →
  provider → links → reply guard → complete. Old clients without a request id get one from
  the server.
- **Proof:** `scripts/coach-reservation-harness.py` applies the migration to a disposable
  PostgreSQL and runs the scenarios with independent sessions (28 checks, including two
  mutations that must break: non-atomic claim, no fencing);
  `coachReservations.integration.test.ts` runs it in CI; `coachIdempotency35.test.ts` counts
  provider calls through the orchestration.

### Runbook — reconciliation

- `OUTCOME_UNKNOWN`: nothing to do automatically. The player was told the outcome is unknown
  and may ask again (new id). To inspect: `SELECT request_id, last_error_code, attempt_count,
updated_at FROM coach_request_reservations WHERE status = 'OUTCOME_UNKNOWN' ORDER BY
updated_at DESC LIMIT 50;` and correlate `request_id` with the `[ai-coach]` logs
  (`correlationId`). Provider-side billing can be matched in the OpenRouter activity log.
- `PERSIST_PENDING`: the next retry by the player persists the kept reply. Rows older than
  24 h whose player never returned can be closed with
  `UPDATE coach_request_reservations SET status = 'OUTCOME_UNKNOWN', pending_reply = NULL,
last_error_code = 'PENDING_EXPIRED' WHERE status = 'PERSIST_PENDING' AND updated_at <
now() - interval '24 hours';` (the reply text is not kept indefinitely).
- `PROCESSING` with an expired lease turns into `OUTCOME_UNKNOWN` on the next claim of that id.
