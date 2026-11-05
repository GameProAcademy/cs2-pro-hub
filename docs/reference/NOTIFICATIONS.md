# Notifications, goals and retention (Fase 4)

Contract: `notification-v1`. Migration: `supabase/migrations/20261105120000_notifications_goals.sql`.
Code: `src/lib/notifications/` (events, server functions), `src/components/notifications/` (bell,
center, preferences, goals), routes `/notifications` and `/goals`.

## Model

| Table / function               | Purpose                                                                                                                                                          | Who writes                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `notification_events`          | domain event: type, version, category, occurred_at, source, source_ref, minimal payload, `idempotency_key`, status (ACCEPTED / SUPPRESSED / REJECTED) and reason | `notification_ingest` (service role)          |
| `notifications`                | in-app delivery of an ACCEPTED event + read state                                                                                                                | ingestion; player: `read_at` only, delete own |
| `notification_preferences`     | per-category switches, pause, daily cap, external-channel consent                                                                                                | player (own row, RLS)                         |
| `player_goals`                 | goals the player defines (never automatic)                                                                                                                       | player (own player, RLS)                      |
| `player_achievements`          | a goal reached, with evidence (match ids, window, sample, period)                                                                                                | ingestion (service role)                      |
| `notification_ingest`          | atomic: dedup `(user_id, idempotency_key)`, version check, preference, pause, daily cap, achievement, notification                                               | service role only                             |
| `notification_purge_expired`   | retention, bounded per call                                                                                                                                      | service role only                             |
| `notification_analytics_daily` | counts per day / category / status / reason, delivered, read, median latency; no content                                                                         | service role only                             |

The user is never taken from the client: every server function derives it from the session;
`notification_ingest` receives it from the server.

## Triggers (real, persisted sources only)

| Event            | Category        | Source and condition                                                                                                                                                       | Link           |
| ---------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `analysis_ready` | analysis_ready  | `demo_jobs.status = processed`, not superseded, `match_id` set, `identity_status = resolved`, `attachment_state = attached`, and the match present in the player's metrics | `/analysis`    |
| `demo_failed`    | demo_processing | `demo_jobs.status = failed` and not superseded (final after the replacement policy). `blocked_raw_audit` is a hold, not a final decision: no notice                        | `/upload`      |
| `evolution`      | evolution       | last 5 vs previous 5 matches (rating, ADR, KAST), both windows fully measured, difference > 2× Welch standard error                                                        | `/performance` |
| `goal_reached`   | training        | mean of the goal's last N measured matches meets the target with a complete sample; recorded once as achievement                                                           | `/goals`       |
| `goal_reminder`  | training        | goal with weekly reminder, on the chosen weekday (UTC), once per ISO week, while not reached                                                                               | `/goals`       |

- Only source rows from the last 14 days are considered, so the first use does not flood the
  center with history.
- The server builds events on each sync (the bell syncs on open and every 2 minutes while the
  tab is visible). Duplicates are ignored by the database, also under concurrent syncs.
- **Not implemented (no reliable event yet):** AI Coach notices (the reply is shown live in the
  chat, and the Coach never notifies a simulated or unsaved reply); account and security
  notices (the category exists and is essential, but no producer is wired yet).

## Preferences and consent (LGPD)

- In-app categories are ON by default. "Account and security" is essential and cannot be
  switched off; pause and daily cap do not apply to it.
- External channels are OFF. `email_enabled` defaults to false, cannot be true without a
  recorded consent (CHECK), and the server always writes false in this phase. No e-mail, push
  or SMS is sent. Creating an account is not consent, and no marketing consent is collected.
- Pause: 24 h or 7 days. Daily cap: 1–30 (default 10), enforced atomically per user.

## Analytics and health

`SELECT * FROM notification_analytics_daily ORDER BY day DESC LIMIT 100;` (service role) gives:

- **events:** created events;
- **status / reason:** `PREFERENCE_DISABLED`, `PAUSED`, `DAILY_LIMIT`, `INVALID_EVENT`, `INVALID_VERSION`;
- **delivered_in_app:** in-app delivered (a notification row exists);
- **read:** read;
- **median_seconds_event_to_delivery:** median latency from event to delivery.

Notes on what these columns do and don't capture:

- "No channel available" does not occur in-app.
- External delivery and its failures are not measured, because no external channel exists.
- Duplicates are not stored at all: the ingestion returns their count, and the server sees it as `duplicates`.

## Retention and deletion

| Data                   | Purpose                                                   | Retention                                                                        | On account deletion |
| ---------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------- |
| notifications (read)   | in-app history                                            | 90 days after read                                                               | cascade             |
| notifications (unread) | in-app history                                            | 180 days                                                                         | cascade             |
| notification_events    | dedup + audit of what was created / suppressed / rejected | 180 days, and never while its notification exists                                | cascade             |
| preferences            | the player's choices                                      | while the account exists                                                         | cascade             |
| goals                  | the player's goals                                        | until the player deletes them                                                    | cascade             |
| achievements           | history of goals reached                                  | while the account exists (goal deletion keeps the achievement, `goal_id` → null) | cascade             |

- Deleting a notification keeps its event, so the same event is never re-notified.
- The purge runs bounded (500 rows per call) in about 5% of syncs; no new scheduler exists.
- Manual run: `SELECT * FROM notification_purge_expired(5000);`

Rollback: see the header of the migration (drop the two functions, the view and the five
tables; nothing existing is altered). The web build degrades by itself if the tables are
missing: the bell and pages show "not available yet".

## Public profile

Not implemented in this phase. It is optional, would expose data outside RLS, and needs
anti-enumeration, cache revocation and an anonymous test plan. Recorded as the next optional
step. It stays private by default when built.

## Proof

- `scripts/notifications-harness.py` (CI: `notifications.integration.test.ts`): disposable
  PostgreSQL, independent sessions, 30 checks:
  - dedup under concurrency;
  - A cannot read, mark or delete B's notifications; only `read_at` is writable;
  - players cannot ingest or forge events, notifications or achievements;
  - spoofed achievement ignored;
  - preference, pause, daily cap and fan-out limits;
  - email and marketing need consent;
  - goals are own-only;
  - retention purge and analytics without content.
- `notifications4.test.tsx`: triggers, evolution, goals, validation, wiring, 5 locales.
