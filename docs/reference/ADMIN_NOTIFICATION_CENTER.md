# Admin Notification Center & Campaign Manager (Fase 4.1)

`/admin/notifications` (admin area). Channel: **in-app only**. E-mail, push and SMS are not
wired (see "Channels").

## What it reuses (nothing duplicated)

- Every campaign notification goes through the Fase 4 `notification_ingest`, with the same
  dedup, preferences, pause and daily cap. Key: `campaign:<campaign_id>:<user_id>:in_app`.
- Notifications are rows in the existing `notifications` table (`type = campaign`,
  `params = {campaign_id, fallback}`), shown in the existing bell and center.
- Audit uses the existing `admin_audit_logs`. Scheduling uses the existing pg_cron.

## Model (`20261106120000_admin_notification_center.sql`)

| Table                                | Content                                                                                              | Access                                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `notification_campaigns`             | name, kind, status, source locale, internal link, segment, schedule, lease/cursor, counters, version | staff read (RLS `is_staff`); writes only via RPCs                         |
| `notification_campaign_translations` | title (≤80) / body (≤280) per locale, approval (who / when)                                          | staff read; a player reads only APPROVED texts of campaigns they received |
| `notification_segments`              | saved audiences (rule spec, last estimate)                                                           | staff read; writes via RPC                                                |

Kinds map to notification categories:

- operational → `operational`;
- product / educational → `announcements` (new, switchable);
- commercial → `marketing` (consent required).

## Permissions (server-side, in every RPC)

| Level              | Can                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `admin` (1)        | view dashboard and campaigns; create and edit drafts and texts; segments and estimates; test send (to staff only); duplicate; archive |
| `admin_master` (2) | everything above, plus approve texts, schedule / send now, unschedule, pause, resume, cancel, retry                                   |

Players and anonymous users get `NOTIFICATION_ADMIN_FORBIDDEN`. Only active profiles count.
The UI offers only what the level allows; the database refuses the rest anyway.

## State machine

```
DRAFT ──schedule*──▶ SCHEDULED ──(cron claim)──▶ SENDING ──▶ SENT ──archive──▶ ARCHIVED
  ▲  ◀──unschedule──┘     │ pause                   │ pause / cancel
  │                       ▼                         ▼
  └ duplicate (any)    PAUSED ──resume──▶ SCHEDULED  CANCELLED
                       SENDING ──3 failures──▶ FAILED ──retry──▶ SCHEDULED
```

\* Schedule requires:

- the source-language text to be approved;
- a non-empty live audience;
- an **explicit confirmation**: the caller restates the exact live audience size
  (`confirm_audience`), which the server recomputes;
- a time from now up to 90 days.

Edits are allowed only in DRAFT. Every text edit withdraws its approval, and duplicates copy
texts unapproved. Optimistic locking: every write carries the `version` it was based on
(`NOTIFICATION_CAMPAIGN_VERSION_CONFLICT`).

## Translations: no automatic publication

Each of the 5 locales is written and **approved by a person** (admin_master). Nothing is
machine-translated or auto-approved. A player gets their locale's approved text, otherwise the
campaign's source locale (always approved before sending), otherwise a generic localized
notice.

## Segments (no SQL)

The spec is `{op: AND|OR, rules: [rule | group]}` with one nesting level and at most 20 rules.
Whitelisted fields:

| Field               | Operators | Value          |
| ------------------- | --------- | -------------- |
| `locale`            | in        | the 5 locales  |
| `country`           | in        | 2-letter codes |
| `account_age_days`  | gte / lte | 0–3650         |
| `last_login_days`   | gte / lte | 0–3650         |
| `processed_demos`   | gte / lte | 0–10000        |
| `steam_linked`      | eq        | boolean        |
| `has_goal`          | eq        | boolean        |
| `marketing_consent` | eq        | boolean        |

Validation is both a CHECK (`notification_segment_valid`) and in TypeScript (`segmentValid`).
Evaluation is a fixed per-field expression (`notification_segment_match`), never dynamic SQL.
Only active accounts are ever in an audience. Saved audiences store their last estimate,
recalculated on demand; a campaign always re-evaluates its rules when it sends.

## Sending, fencing and recovery

pg_cron `notification-campaigns` (every minute) runs `CALL notification_campaign_run(200, 10)`:

1. **Claim:** one due campaign (`SCHEDULED` and due, or `SENDING` with an expired lease) with
   `FOR UPDATE SKIP LOCKED`, a fresh `lease_token`, and a 5-minute lease. Then COMMIT.
2. **Batches:** each batch takes the next ≤200 eligible users after `cursor_user` and ingests
   one event per user. It then records progress with a **fenced** update
   (`WHERE status = SENDING AND lease_token = <mine>`) and commits.
   - Pause, cancel or a reclaim clears or replaces the token, so the in-flight batch rolls back.
   - A crashed run is reclaimed when its lease expires and resumes from the cursor.
   - Idempotency keys make a replayed batch notify nobody twice.
3. **Failures:** a failing batch rolls back entirely, increments `failures`, records the
   SQLSTATE (never content) and backs off 2 / 4 minutes. At 3 failures the campaign is
   `FAILED`, and `retry` (admin_master) re-arms it.

## Frequency and consent

- Daily cap (player setting, default 10) applies to every campaign.
- Announcements and marketing: at most 2 campaign notifications per player per 7 days
  (`FREQUENCY_LIMIT`). Operational notices are not weekly-capped but respect the switch.
- Commercial: only players with `marketing_consent`, enforced twice (audience and ingest).

## Test send

The test goes to the caller or another staff member, never a player
(`NOTIFICATION_TEST_RECIPIENT_FORBIDDEN`). At most 10 per campaign per hour. Source
`campaign_test`, so it is never counted in campaign results or the dashboard. Unapproved
texts are visible to staff for the test.

## Analytics

`notification_campaign_stats(id)` reports:

- created (events);
- accepted;
- suppressed, by reason;
- rejected;
- delivered in app (notification row created);
- read (`read_at`);
- deleted by the player.

For in-app, "sent" = "delivered" = the row exists. Whether the player _saw_ it is not
measured. The read rate is null when nothing was delivered (never 0/0).
`notification_admin_dashboard(from, to)` covers events per category / status / reason,
delivered, read, active accounts, marketing consents, campaigns per status and the last
retention run.

## Channels

- **In-app:** active.
- **E-mail:** not wired for campaigns.
  - Audit: `src/lib/email/*` is transactional only (Hostinger Mail API over HTTPS,
    mailbox-scoped `POST /api/v1/mailboxes/{id}/send`, kinds `steam_linked`,
    `steam_unlinked`, `security_notice` and `support_report`, with a claim/lease per message).
    It is not a bulk ESP: no unsubscribe handling, no list management, no bounce feedback,
    and per-mailbox sending limits.
  - Enabling campaign e-mail requires recorded e-mail consent (`email_enabled` with
    consent, already a CHECK), marketing consent for commercial content, a one-click
    unsubscribe, a provider suited to bulk sending, and explicit authorization (cost and
    legal).
- **Push / SMS:** not implemented. They would need a provider, device tokens or phone numbers
  with consent, and authorization.

## Audit

Every admin action writes `admin_audit_logs` in the same transaction:
`notification_campaign_{created,updated,translation_saved,translation_approved,schedule,…,test_send}`
and `notification_segment_saved`. Metadata holds ids, states, locales and counts. It never
holds texts, e-mails or recipient lists.

## Operations

- Health:

  ```sql
  SELECT id, status, targeted, accepted, failures, last_error, lease_until
    FROM notification_campaigns ORDER BY updated_at DESC;
  ```

  and `SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'notification-campaigns';`

- Stop all sending immediately: `SELECT cron.unschedule('notification-campaigns');`
  (campaigns keep their state and resume after re-scheduling the job).
- Stuck `SENDING`: wait for the lease to expire (5 min); the next run reclaims it.
- Rollback: see the migration header.

## Proof

- `scripts/campaigns-harness.py` (CI: `campaigns.integration.test.ts`) runs 52 checks on a
  disposable PostgreSQL with independent sessions, and catches 9 SQL mutants (fencing,
  consent ×2, weekly cap, permission, confirmation, test recipient, approval reset, RLS).
- `notifications-harness.py` with `NOTIFICATIONS_LATER_MIGRATIONS=1` shows every Fase 4
  guarantee still holds after the new `notification_ingest`.
- `campaigns41.test.tsx` has 29 tests: validators mirror the SQL, the action rules equal the
  SQL CASE, every label exists in 5 locales, rendering, and no service role in the server
  functions.
