-- Fase 4 — notifications (in-app), preferences and consent, personal goals, achievements.
--
-- Separation (no existing pipeline is duplicated; the demo pipeline tables are only READ):
--   notification_events      domain events, versioned (contract notification-v1), deduplicated
--                            per user by idempotency_key, with ACCEPTED / SUPPRESSED / REJECTED
--                            and the reason (analytics: preference, pause, volume, invalid).
--   notifications            the in-app delivery and its read state (one per accepted event).
--   notification_preferences per-category switches, pause, frequency cap and external-channel
--                            consent (email/marketing OFF by default; no external channel is
--                            wired in this phase).
--   player_goals             goals the PLAYER defines (never created automatically).
--   player_achievements      a goal reached, with the evidence it was computed from.
--
-- Writes of events/notifications/achievements go only through notification_ingest
-- (service_role only); the server derives the user from the session. Players may read their
-- own rows, mark their own notifications read/unread and delete them; they manage their own
-- preferences and goals under RLS.
--
-- Rollback (nothing existing is altered):
--   DROP FUNCTION IF EXISTS public.notification_ingest(uuid, jsonb);
--   DROP FUNCTION IF EXISTS public.notification_purge_expired(integer);
--   DROP VIEW IF EXISTS public.notification_analytics_daily;
--   DROP TABLE IF EXISTS public.notifications, public.notification_events,
--     public.notification_preferences, public.player_achievements, public.player_goals;

-- ---------------------------------------------------------------- preferences and consent
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  demo_processing boolean NOT NULL DEFAULT true,
  analysis_ready boolean NOT NULL DEFAULT true,
  evolution boolean NOT NULL DEFAULT true,
  training boolean NOT NULL DEFAULT true,
  coach boolean NOT NULL DEFAULT true,
  operational boolean NOT NULL DEFAULT true,
  -- Account & security notices are essential and cannot be switched off (no column).
  paused_until timestamptz,
  max_per_day integer NOT NULL DEFAULT 10 CHECK (max_per_day BETWEEN 1 AND 30),
  -- External channels: OFF by default; creating an account is NOT consent.
  email_enabled boolean NOT NULL DEFAULT false,
  email_consent_at timestamptz,
  email_consent_revoked_at timestamptz,
  marketing_consent boolean NOT NULL DEFAULT false,
  marketing_consent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_email_needs_consent CHECK (
    NOT email_enabled OR (email_consent_at IS NOT NULL AND (email_consent_revoked_at IS NULL OR email_consent_revoked_at < email_consent_at))
  ),
  CONSTRAINT notification_marketing_needs_consent CHECK (NOT marketing_consent OR marketing_consent_at IS NOT NULL)
);
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_preferences FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
DROP POLICY IF EXISTS notification_preferences_own ON public.notification_preferences;
CREATE POLICY notification_preferences_own ON public.notification_preferences
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------- events (domain)
CREATE TABLE IF NOT EXISTS public.notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type ~ '^[a-z_]{3,48}$'),
  version integer NOT NULL,
  category text NOT NULL CHECK (category IN
    ('demo_processing', 'analysis_ready', 'evolution', 'training', 'coach', 'account_security', 'operational')),
  occurred_at timestamptz NOT NULL,
  source text NOT NULL CHECK (source ~ '^[a-z_]{3,48}$'),
  source_ref text CHECK (source_ref IS NULL OR char_length(source_ref) <= 80),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(payload) <= 2048),
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 160),
  status text NOT NULL CHECK (status IN ('ACCEPTED', 'SUPPRESSED', 'REJECTED')),
  reason text CHECK (reason IS NULL OR reason IN
    ('PREFERENCE_DISABLED', 'PAUSED', 'DAILY_LIMIT', 'INVALID_EVENT', 'INVALID_VERSION')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS notification_events_user_created_idx ON public.notification_events (user_id, created_at DESC);
ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.notification_events TO service_role;

-- ---------------------------------------------------------------- in-app delivery
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_id uuid NOT NULL UNIQUE REFERENCES public.notification_events(id) ON DELETE CASCADE,
  category text NOT NULL,
  type text NOT NULL,
  contract_version text NOT NULL DEFAULT 'notification-v1',
  params jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(params) <= 1024),
  -- Internal, relative destinations only; the destination authorizes again (RLS).
  link text NOT NULL CHECK (link ~ '^/[a-z0-9/_-]{1,60}$'),
  channel text NOT NULL DEFAULT 'in_app' CHECK (channel = 'in_app'),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON public.notifications (user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON public.notifications (user_id) WHERE read_at IS NULL;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.notifications TO authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;  -- read state only
GRANT ALL ON public.notifications TO service_role;
DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
DROP POLICY IF EXISTS notifications_delete_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY notifications_delete_own ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ---------------------------------------------------------------- goals and achievements
CREATE TABLE IF NOT EXISTS public.player_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  metric text NOT NULL CHECK (metric IN ('rating', 'adr', 'kast', 'hsPercent', 'kd', 'openingSuccess')),
  direction text NOT NULL CHECK (direction IN ('AT_LEAST', 'AT_MOST')),
  target numeric NOT NULL CHECK (target >= 0 AND target <= 1000),
  window_matches integer NOT NULL DEFAULT 5 CHECK (window_matches BETWEEN 3 AND 20),
  deadline date,
  reminder text NOT NULL DEFAULT 'OFF' CHECK (reminder IN ('OFF', 'WEEKLY')),
  reminder_weekday smallint CHECK (reminder_weekday IS NULL OR reminder_weekday BETWEEN 0 AND 6),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT player_goals_weekly_has_day CHECK (reminder = 'OFF' OR reminder_weekday IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS player_goals_player_idx ON public.player_goals (player_id);
ALTER TABLE public.player_goals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.player_goals FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_goals TO authenticated;
GRANT ALL ON public.player_goals TO service_role;
DROP POLICY IF EXISTS player_goals_own ON public.player_goals;
CREATE POLICY player_goals_own ON public.player_goals FOR ALL TO authenticated
  USING (public.owns_player(player_id)) WITH CHECK (public.owns_player(player_id));

CREATE TABLE IF NOT EXISTS public.player_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind = 'GOAL_REACHED'),
  -- The goal may later be edited or removed; the achievement keeps what was reached.
  goal_id uuid REFERENCES public.player_goals(id) ON DELETE SET NULL,
  -- Dedup: one achievement per goal definition (metric, direction, target, window).
  dedupe_key text NOT NULL CHECK (char_length(dedupe_key) <= 160),
  metric text NOT NULL,
  direction text NOT NULL,
  target numeric NOT NULL,
  achieved_value numeric NOT NULL,
  window_matches integer NOT NULL,
  sample_matches integer NOT NULL CHECK (sample_matches >= window_matches),
  period_from timestamptz NOT NULL,
  period_to timestamptz NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(evidence) <= 2048),
  achieved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, dedupe_key)
);
ALTER TABLE public.player_achievements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.player_achievements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.player_achievements TO authenticated;
GRANT ALL ON public.player_achievements TO service_role;
DROP POLICY IF EXISTS player_achievements_select_own ON public.player_achievements;
CREATE POLICY player_achievements_select_own ON public.player_achievements FOR SELECT TO authenticated
  USING (public.owns_player(player_id));

-- ---------------------------------------------------------------- atomic ingestion
-- p_events: jsonb array of {type, version, category, occurred_at, source, source_ref,
-- payload, idempotency_key, link, params, achievement?}. Per event, in order:
--   duplicate key → ignored (ON CONFLICT DO NOTHING; concurrent syncs are safe);
--   wrong version / malformed → REJECTED (recorded, no notification);
--   category off → SUPPRESSED PREFERENCE_DISABLED; paused → SUPPRESSED PAUSED;
--   more than max_per_day notifications in 24 h → SUPPRESSED DAILY_LIMIT;
--   otherwise ACCEPTED + one notification. account_security ignores switches and pause.
-- At most 50 events per call (a malformed caller cannot fan out).
CREATE OR REPLACE FUNCTION public.notification_ingest(p_user_id uuid, p_events jsonb)
RETURNS TABLE (accepted integer, suppressed integer, rejected integer, duplicates integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  e jsonb;
  pref public.notification_preferences%ROWTYPE;
  v_event uuid;
  v_status text;
  v_reason text;
  v_category text;
  v_today integer;
  n_acc integer := 0; n_sup integer := 0; n_rej integer := 0; n_dup integer := 0;
BEGIN
  IF p_user_id IS NULL OR jsonb_typeof(p_events) <> 'array' OR jsonb_array_length(p_events) > 50 THEN
    RAISE EXCEPTION 'NOTIFICATION_INGEST_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_user_id) THEN
    RAISE EXCEPTION 'NOTIFICATION_INGEST_UNKNOWN_USER' USING ERRCODE = '22023';
  END IF;
  -- Serialize one user's ingestion (daily cap is exact under concurrent syncs).
  PERFORM pg_advisory_xact_lock(hashtextextended('notification_ingest:' || p_user_id::text, 0));
  SELECT * INTO pref FROM public.notification_preferences x WHERE x.user_id = p_user_id;

  FOR e IN SELECT * FROM jsonb_array_elements(p_events) LOOP
    v_event := NULL;
    -- Without a usable idempotency key an event cannot be deduplicated: never stored.
    IF char_length(coalesce(e->>'idempotency_key', '')) NOT BETWEEN 8 AND 160 THEN
      n_rej := n_rej + 1;
      CONTINUE;
    END IF;
    v_category := e->>'category';
    v_status := 'ACCEPTED';
    v_reason := NULL;
    IF coalesce((e->>'version')::integer, 0) <> 1 THEN
      v_status := 'REJECTED'; v_reason := 'INVALID_VERSION';
    ELSIF v_category IS NULL OR v_category NOT IN
          ('demo_processing', 'analysis_ready', 'evolution', 'training', 'coach', 'account_security', 'operational')
       OR coalesce(e->>'link', '') !~ '^/[a-z0-9/_-]{1,60}$'
       OR coalesce(e->>'type', '') !~ '^[a-z_]{3,48}$'
       OR (e->>'occurred_at') IS NULL OR (e->>'occurred_at')::timestamptz > now() + interval '5 minutes' THEN
      v_status := 'REJECTED'; v_reason := 'INVALID_EVENT';
    ELSIF v_category <> 'account_security' AND pref.user_id IS NOT NULL AND (
          (v_category = 'demo_processing' AND NOT pref.demo_processing) OR
          (v_category = 'analysis_ready' AND NOT pref.analysis_ready) OR
          (v_category = 'evolution' AND NOT pref.evolution) OR
          (v_category = 'training' AND NOT pref.training) OR
          (v_category = 'coach' AND NOT pref.coach) OR
          (v_category = 'operational' AND NOT pref.operational)) THEN
      v_status := 'SUPPRESSED'; v_reason := 'PREFERENCE_DISABLED';
    ELSIF v_category <> 'account_security' AND pref.paused_until IS NOT NULL AND pref.paused_until > now() THEN
      v_status := 'SUPPRESSED'; v_reason := 'PAUSED';
    ELSE
      SELECT count(*) INTO v_today FROM public.notifications nn
       WHERE nn.user_id = p_user_id AND nn.created_at > now() - interval '24 hours';
      IF v_category <> 'account_security' AND v_today >= coalesce(pref.max_per_day, 10) THEN
        v_status := 'SUPPRESSED'; v_reason := 'DAILY_LIMIT';
      END IF;
    END IF;

    INSERT INTO public.notification_events AS t
      (user_id, type, version, category, occurred_at, source, source_ref, payload, idempotency_key, status, reason)
    VALUES (
      p_user_id,
      CASE WHEN coalesce(e->>'type', '') ~ '^[a-z_]{3,48}$' THEN e->>'type' ELSE 'invalid_event' END,
      coalesce((e->>'version')::integer, 0),
      CASE WHEN v_status = 'REJECTED' AND v_reason = 'INVALID_EVENT' THEN 'operational' ELSE v_category END,
      coalesce(least((e->>'occurred_at')::timestamptz, now()), now()),
      CASE WHEN coalesce(e->>'source', '') ~ '^[a-z_]{3,48}$' THEN e->>'source' ELSE 'unknown' END,
      left(e->>'source_ref', 80),
      coalesce(e->'payload', '{}'::jsonb),
      e->>'idempotency_key',
      v_status, v_reason)
    ON CONFLICT (user_id, idempotency_key) DO NOTHING
    RETURNING id INTO v_event;

    IF v_event IS NULL THEN
      n_dup := n_dup + 1;
      CONTINUE;
    END IF;

    -- A reached goal is recorded once, whatever happens to its notification.
    IF e ? 'achievement' THEN
      INSERT INTO public.player_achievements
        (player_id, kind, goal_id, dedupe_key, metric, direction, target, achieved_value,
         window_matches, sample_matches, period_from, period_to, evidence)
      SELECT (a->>'player_id')::uuid, 'GOAL_REACHED', (a->>'goal_id')::uuid, a->>'dedupe_key',
             a->>'metric', a->>'direction', (a->>'target')::numeric, (a->>'achieved_value')::numeric,
             (a->>'window_matches')::integer, (a->>'sample_matches')::integer,
             (a->>'period_from')::timestamptz, (a->>'period_to')::timestamptz, coalesce(a->'evidence', '{}'::jsonb)
        FROM (SELECT e->'achievement' AS a) s
       WHERE EXISTS (SELECT 1 FROM public.player_profiles pp WHERE pp.id = (a->>'player_id')::uuid AND pp.user_id = p_user_id)
      ON CONFLICT (player_id, dedupe_key) DO NOTHING;
    END IF;

    IF v_status = 'ACCEPTED' THEN
      INSERT INTO public.notifications (user_id, event_id, category, type, params, link)
      VALUES (p_user_id, v_event, v_category, e->>'type', coalesce(e->'params', '{}'::jsonb), e->>'link');
      n_acc := n_acc + 1;
    ELSIF v_status = 'SUPPRESSED' THEN
      n_sup := n_sup + 1;
    ELSE
      n_rej := n_rej + 1;
    END IF;
    v_event := NULL;
  END LOOP;
  RETURN QUERY SELECT n_acc, n_sup, n_rej, n_dup;
END;
$$;
REVOKE ALL ON FUNCTION public.notification_ingest(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notification_ingest(uuid, jsonb) TO service_role;

-- ---------------------------------------------------------------- retention
-- Read notifications: 90 days. Unread: 180 days. Events (the audit of what was created,
-- suppressed or rejected): 180 days. Achievements and goals live with the account
-- (ON DELETE CASCADE from profiles / player_profiles). Bounded per call.
CREATE OR REPLACE FUNCTION public.notification_purge_expired(p_limit integer DEFAULT 5000)
RETURNS TABLE (notifications_deleted integer, events_deleted integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_limit integer := greatest(1, least(coalesce(p_limit, 5000), 50000));
  n_notif integer; n_events integer;
BEGIN
  WITH doomed AS (
    SELECT id FROM public.notifications
     WHERE (read_at IS NOT NULL AND read_at < now() - interval '90 days')
        OR (read_at IS NULL AND created_at < now() - interval '180 days')
     LIMIT v_limit)
  DELETE FROM public.notifications n USING doomed d WHERE n.id = d.id;
  GET DIAGNOSTICS n_notif = ROW_COUNT;
  WITH doomed AS (
    SELECT e.id FROM public.notification_events e
     WHERE e.created_at < now() - interval '180 days'
       AND NOT EXISTS (SELECT 1 FROM public.notifications n WHERE n.event_id = e.id)
     LIMIT v_limit)
  DELETE FROM public.notification_events x USING doomed d WHERE x.id = d.id;
  GET DIAGNOSTICS n_events = ROW_COUNT;
  RETURN QUERY SELECT n_notif, n_events;
END;
$$;
REVOKE ALL ON FUNCTION public.notification_purge_expired(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notification_purge_expired(integer) TO service_role;

-- ---------------------------------------------------------------- analytics (no content)
CREATE OR REPLACE VIEW public.notification_analytics_daily
WITH (security_invoker = true) AS
SELECT date_trunc('day', e.created_at) AS day,
       e.category,
       e.status,
       e.reason,
       count(*) AS events,
       count(n.id) AS delivered_in_app,
       count(n.read_at) AS read,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (n.created_at - e.occurred_at)))
         AS median_seconds_event_to_delivery
  FROM public.notification_events e
  LEFT JOIN public.notifications n ON n.event_id = e.id
 GROUP BY 1, 2, 3, 4;
REVOKE ALL ON public.notification_analytics_daily FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.notification_analytics_daily TO service_role;
