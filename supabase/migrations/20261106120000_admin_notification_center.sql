-- Fase 4.1 — Admin Notification Center & Campaign Manager (in-app channel).
--
-- Reuses the Fase 4 pipeline: every campaign notification goes through notification_ingest
-- (same dedup, preferences, pause and daily cap), keyed `campaign:<campaign>:<user>:in_app`.
-- Nothing is duplicated: no second notifications table, no second queue.
--
--   notification_campaigns               campaign, state machine, lease/fencing, cursor, counters
--   notification_campaign_translations   title/body per locale; human approval, never automatic
--   notification_segments                saved audiences (whitelisted rules, never SQL)
--
-- Categories: operational → `operational`; product / educational → `announcements` (new,
-- switchable, ON by default); commercial → `marketing` (new; requires marketing consent, which
-- is OFF by default: no consent, no notification — enforced in the audience AND in ingest).
-- Frequency: at most 2 announcement/marketing campaign notifications per user per 7 days.
--
-- Sending: pg_cron calls notification_campaign_run every minute. A run claims ONE due campaign
-- (FOR UPDATE SKIP LOCKED) with a fresh lease token, commits, then sends bounded batches; each
-- batch is atomic and fenced on (status = SENDING, lease_token): a pause / cancel / reclaim
-- clears or replaces the token and the in-flight batch is rolled back. The cursor is
-- persisted per batch, so a crashed run resumes after its lease expires; a retried batch can
-- never notify twice (idempotency key). Failures are retried 3 times with backoff, then FAILED.
--
-- Permissions (checked inside every RPC, server-side):
--   admin (role admin or admin_master): view, create, edit drafts, translations, segments,
--     estimates, test send (to staff only), duplicate, archive;
--   admin_master only: approve translations, schedule / send, pause, resume, cancel, retry.
-- Every action writes admin_audit_logs in the same transaction (no content, no user list).
--
-- Rollback:
--   SELECT cron.unschedule('notification-campaigns');
--   DROP PROCEDURE IF EXISTS public.notification_campaign_run(integer, integer);
--   DROP FUNCTION IF EXISTS public.notification_campaign_batch(uuid, uuid, integer),
--     public.notification_campaign_action(uuid, text, integer, jsonb),
--     public.notification_campaign_save(uuid, integer, jsonb),
--     public.notification_campaign_translation_save(uuid, text, text, text),
--     public.notification_campaign_translation_approve(uuid, text),
--     public.notification_campaign_test_send(uuid, uuid),
--     public.notification_campaign_estimate(jsonb, text),
--     public.notification_segment_save(uuid, text, jsonb),
--     public.notification_campaign_stats(uuid),
--     public.notification_admin_dashboard(timestamptz, timestamptz),
--     public.notification_campaign_eligible(uuid, jsonb, text),
--     public.notification_segment_match(uuid, jsonb, integer),
--     public.notification_segment_valid(jsonb, integer),
--     public.notification_admin_level();
--   DROP TABLE IF EXISTS public.notification_campaign_translations, public.notification_campaigns,
--     public.notification_segments;
--   then re-apply notification_ingest and the two CHECKs from 20261105120000 and
--   ALTER TABLE public.notification_preferences DROP COLUMN IF EXISTS announcements;

-- ---------------------------------------------------------------- categories, reasons, prefs
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS announcements boolean NOT NULL DEFAULT true;

ALTER TABLE public.notification_events DROP CONSTRAINT IF EXISTS notification_events_category_check;
ALTER TABLE public.notification_events ADD CONSTRAINT notification_events_category_check CHECK (category IN
  ('demo_processing', 'analysis_ready', 'evolution', 'training', 'coach', 'account_security', 'operational',
   'announcements', 'marketing'));
ALTER TABLE public.notification_events DROP CONSTRAINT IF EXISTS notification_events_reason_check;
ALTER TABLE public.notification_events ADD CONSTRAINT notification_events_reason_check CHECK (reason IS NULL OR reason IN
  ('PREFERENCE_DISABLED', 'PAUSED', 'DAILY_LIMIT', 'INVALID_EVENT', 'INVALID_VERSION',
   'NO_MARKETING_CONSENT', 'FREQUENCY_LIMIT'));
CREATE INDEX IF NOT EXISTS notification_events_source_ref_idx
  ON public.notification_events (source, source_ref) WHERE source IN ('campaign', 'campaign_test');

-- Same contract and behaviour as Fase 4, plus: the two new categories, marketing consent,
-- and the weekly campaign frequency cap. Everything else is unchanged.
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
  v_week integer;
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
          ('demo_processing', 'analysis_ready', 'evolution', 'training', 'coach', 'account_security', 'operational',
           'announcements', 'marketing')
       OR coalesce(e->>'link', '') !~ '^/[a-z0-9/_-]{1,60}$'
       OR coalesce(e->>'type', '') !~ '^[a-z_]{3,48}$'
       OR (e->>'occurred_at') IS NULL OR (e->>'occurred_at')::timestamptz > now() + interval '5 minutes' THEN
      v_status := 'REJECTED'; v_reason := 'INVALID_EVENT';
    ELSIF v_category = 'marketing' AND (pref.user_id IS NULL OR NOT pref.marketing_consent) THEN
      -- Commercial content needs an explicit opt-in; an account is not consent.
      v_status := 'SUPPRESSED'; v_reason := 'NO_MARKETING_CONSENT';
    ELSIF v_category <> 'account_security' AND pref.user_id IS NOT NULL AND (
          (v_category = 'demo_processing' AND NOT pref.demo_processing) OR
          (v_category = 'analysis_ready' AND NOT pref.analysis_ready) OR
          (v_category = 'evolution' AND NOT pref.evolution) OR
          (v_category = 'training' AND NOT pref.training) OR
          (v_category = 'coach' AND NOT pref.coach) OR
          (v_category = 'operational' AND NOT pref.operational) OR
          (v_category = 'announcements' AND NOT pref.announcements)) THEN
      v_status := 'SUPPRESSED'; v_reason := 'PREFERENCE_DISABLED';
    ELSIF v_category <> 'account_security' AND pref.paused_until IS NOT NULL AND pref.paused_until > now() THEN
      v_status := 'SUPPRESSED'; v_reason := 'PAUSED';
    ELSE
      SELECT count(*) INTO v_today FROM public.notifications nn
       WHERE nn.user_id = p_user_id AND nn.created_at > now() - interval '24 hours';
      IF v_category <> 'account_security' AND v_today >= coalesce(pref.max_per_day, 10) THEN
        v_status := 'SUPPRESSED'; v_reason := 'DAILY_LIMIT';
      ELSIF v_category IN ('announcements', 'marketing') AND coalesce(e->>'source', '') = 'campaign' THEN
        SELECT count(*) INTO v_week FROM public.notifications nn
          JOIN public.notification_events ev ON ev.id = nn.event_id
         WHERE nn.user_id = p_user_id AND ev.source = 'campaign'
           AND nn.category IN ('announcements', 'marketing')
           AND nn.created_at > now() - interval '7 days';
        IF v_week >= 2 THEN
          v_status := 'SUPPRESSED'; v_reason := 'FREQUENCY_LIMIT';
        END IF;
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

-- ---------------------------------------------------------------- segments (no SQL, ever)
-- Spec: {"op": "AND"|"OR", "rules": [rule | group]}, a group being {"op", "rules"} (one level).
-- Rule: {"field", "op", "value"} with a whitelisted field and operator:
--   locale            in      ["pt-BR","pt-PT","en","es","fr"]
--   country           in      ["BR", …]  (2-letter codes)
--   account_age_days  gte|lte integer 0..3650
--   last_login_days   gte|lte integer 0..3650   (never signed in → never matches)
--   processed_demos   gte|lte integer 0..10000
--   steam_linked      eq      boolean
--   has_goal          eq      boolean
--   marketing_consent eq      boolean
-- Only ACTIVE accounts are ever in an audience.
CREATE OR REPLACE FUNCTION public.notification_segment_valid(p_spec jsonb, p_depth integer DEFAULT 0)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  r jsonb;
  f text; o text; v jsonb;
BEGIN
  IF p_spec IS NULL OR jsonb_typeof(p_spec) <> 'object' OR p_depth > 1 THEN RETURN false; END IF;
  IF coalesce(p_spec->>'op', '') NOT IN ('AND', 'OR') OR jsonb_typeof(p_spec->'rules') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_spec->'rules') > 20 THEN
    RETURN false;
  END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(p_spec->'rules') LOOP
    IF jsonb_typeof(r) <> 'object' THEN RETURN false; END IF;
    IF r ? 'rules' THEN
      IF NOT public.notification_segment_valid(r, p_depth + 1) THEN RETURN false; END IF;
      CONTINUE;
    END IF;
    f := r->>'field'; o := r->>'op'; v := r->'value';
    IF f IN ('locale', 'country') THEN
      IF o <> 'in' OR jsonb_typeof(v) <> 'array' OR jsonb_array_length(v) NOT BETWEEN 1 AND 30 THEN RETURN false; END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(v) x
                  WHERE jsonb_typeof(x) <> 'string'
                     OR (f = 'locale' AND x #>> '{}' NOT IN ('pt-BR', 'pt-PT', 'en', 'es', 'fr'))
                     OR (f = 'country' AND x #>> '{}' !~ '^[A-Z]{2}$')) THEN
        RETURN false;
      END IF;
    ELSIF f IN ('account_age_days', 'last_login_days', 'processed_demos') THEN
      IF o NOT IN ('gte', 'lte') OR jsonb_typeof(v) <> 'number' OR (v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric)
         OR (v #>> '{}')::numeric < 0 OR (v #>> '{}')::numeric > (CASE WHEN f = 'processed_demos' THEN 10000 ELSE 3650 END) THEN
        RETURN false;
      END IF;
    ELSIF f IN ('steam_linked', 'has_goal', 'marketing_consent') THEN
      IF o <> 'eq' OR jsonb_typeof(v) <> 'boolean' THEN RETURN false; END IF;
    ELSE
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.notification_segment_match(p_user uuid, p_spec jsonb, p_depth integer DEFAULT 0)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  p public.profiles%ROWTYPE;
  r jsonb;
  ok boolean;
  any_true boolean := false;
  all_true boolean := true;
  num numeric;
BEGIN
  SELECT * INTO p FROM public.profiles x WHERE x.id = p_user;
  IF NOT FOUND OR p.status::text <> 'active' THEN RETURN false; END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(p_spec->'rules') LOOP
    IF r ? 'rules' THEN
      ok := public.notification_segment_match(p_user, r, p_depth + 1);
    ELSE
      num := CASE WHEN jsonb_typeof(r->'value') = 'number' THEN (r->>'value')::numeric END;
      ok := CASE r->>'field'
        WHEN 'locale' THEN p.locale IN (SELECT jsonb_array_elements_text(r->'value'))
        WHEN 'country' THEN coalesce(upper(p.country), '') IN (SELECT jsonb_array_elements_text(r->'value'))
        WHEN 'account_age_days' THEN
          CASE r->>'op' WHEN 'gte' THEN now() - p.created_at >= make_interval(days => num::integer)
                        ELSE now() - p.created_at <= make_interval(days => num::integer) END
        WHEN 'last_login_days' THEN
          p.last_login_at IS NOT NULL AND
          CASE r->>'op' WHEN 'gte' THEN now() - p.last_login_at >= make_interval(days => num::integer)
                        ELSE now() - p.last_login_at <= make_interval(days => num::integer) END
        WHEN 'processed_demos' THEN
          (SELECT CASE r->>'op' WHEN 'gte' THEN count(*) >= num ELSE count(*) <= num END
             FROM public.demo_jobs j WHERE j.user_id = p_user AND j.status::text = 'processed')
        WHEN 'steam_linked' THEN
          (EXISTS (SELECT 1 FROM public.player_connections c JOIN public.player_profiles pp ON pp.id = c.player_id
                    WHERE pp.user_id = p_user AND c.source::text = 'steam' AND c.status::text = 'connected'))
          = (r->>'value')::boolean
        WHEN 'has_goal' THEN
          (EXISTS (SELECT 1 FROM public.player_goals g JOIN public.player_profiles pp ON pp.id = g.player_id
                    WHERE pp.user_id = p_user)) = (r->>'value')::boolean
        WHEN 'marketing_consent' THEN
          coalesce((SELECT np.marketing_consent FROM public.notification_preferences np WHERE np.user_id = p_user), false)
          = (r->>'value')::boolean
        ELSE false
      END;
    END IF;
    ok := coalesce(ok, false);
    any_true := any_true OR ok;
    all_true := all_true AND ok;
  END LOOP;
  -- An empty rule list means "every active account" (AND) / "nobody" (OR).
  RETURN CASE WHEN p_spec->>'op' = 'OR' THEN any_true ELSE all_true END;
END;
$$;

-- The audience of a campaign: segment AND, for commercial, an explicit marketing opt-in.
CREATE OR REPLACE FUNCTION public.notification_campaign_eligible(p_user uuid, p_spec jsonb, p_kind text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT public.notification_segment_match(p_user, p_spec)
     AND (p_kind <> 'commercial' OR coalesce(
           (SELECT np.marketing_consent FROM public.notification_preferences np WHERE np.user_id = p_user), false));
$$;

CREATE TABLE IF NOT EXISTS public.notification_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 3 AND 80),
  spec jsonb NOT NULL CHECK (pg_column_size(spec) <= 4096 AND public.notification_segment_valid(spec)),
  estimated_count integer,
  estimated_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- campaigns
CREATE TABLE IF NOT EXISTS public.notification_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 3 AND 120),
  kind text NOT NULL CHECK (kind IN ('operational', 'product', 'educational', 'commercial')),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN
    ('DRAFT', 'SCHEDULED', 'SENDING', 'PAUSED', 'SENT', 'CANCELLED', 'FAILED', 'ARCHIVED')),
  source_locale text NOT NULL DEFAULT 'pt-BR' CHECK (source_locale IN ('pt-BR', 'pt-PT', 'en', 'es', 'fr')),
  -- Internal destinations only (same rule as every notification).
  link text NOT NULL DEFAULT '/notifications' CHECK (link ~ '^/[a-z0-9/_-]{1,60}$'),
  segment jsonb NOT NULL DEFAULT '{"op": "AND", "rules": []}'::jsonb
    CHECK (pg_column_size(segment) <= 4096 AND public.notification_segment_valid(segment)),
  segment_id uuid REFERENCES public.notification_segments(id) ON DELETE SET NULL,
  scheduled_at timestamptz,
  confirmed_audience integer CHECK (confirmed_audience IS NULL OR confirmed_audience >= 0),
  lease_token uuid,
  lease_until timestamptz,
  cursor_user uuid,
  attempts integer NOT NULL DEFAULT 0,
  failures integer NOT NULL DEFAULT 0 CHECK (failures BETWEEN 0 AND 10),
  last_error text CHECK (last_error IS NULL OR last_error ~ '^[A-Z0-9_]{1,40}$'),
  targeted integer NOT NULL DEFAULT 0,
  accepted integer NOT NULL DEFAULT 0,
  suppressed integer NOT NULL DEFAULT 0,
  rejected integer NOT NULL DEFAULT 0,
  duplicates integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  finished_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_campaign_schedule_consistent CHECK (
    status NOT IN ('SCHEDULED', 'SENDING') OR (scheduled_at IS NOT NULL AND confirmed_audience IS NOT NULL)),
  CONSTRAINT notification_campaign_lease_consistent CHECK (
    (lease_token IS NULL) = (lease_until IS NULL) AND (lease_token IS NULL OR status = 'SENDING'))
);
CREATE INDEX IF NOT EXISTS notification_campaigns_due_idx
  ON public.notification_campaigns (scheduled_at) WHERE status IN ('SCHEDULED', 'SENDING');

CREATE TABLE IF NOT EXISTS public.notification_campaign_translations (
  campaign_id uuid NOT NULL REFERENCES public.notification_campaigns(id) ON DELETE CASCADE,
  locale text NOT NULL CHECK (locale IN ('pt-BR', 'pt-PT', 'en', 'es', 'fr')),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 280),
  approved_at timestamptz,
  approved_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, locale),
  CONSTRAINT notification_translation_approval_consistent CHECK ((approved_at IS NULL) = (approved_by IS NULL))
);

-- RLS: staff read campaigns and segments; nobody writes directly (RPCs only). A recipient may
-- read the APPROVED texts of a campaign they actually received (staff also see test texts).
ALTER TABLE public.notification_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_campaign_translations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_segments, public.notification_campaigns,
  public.notification_campaign_translations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.notification_segments, public.notification_campaigns,
  public.notification_campaign_translations TO authenticated;
GRANT ALL ON public.notification_segments, public.notification_campaigns,
  public.notification_campaign_translations TO service_role;
DROP POLICY IF EXISTS notification_segments_staff ON public.notification_segments;
CREATE POLICY notification_segments_staff ON public.notification_segments
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS notification_campaigns_staff ON public.notification_campaigns;
CREATE POLICY notification_campaigns_staff ON public.notification_campaigns
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS notification_campaign_translations_read ON public.notification_campaign_translations;
CREATE POLICY notification_campaign_translations_read ON public.notification_campaign_translations
  FOR SELECT TO authenticated USING (
    public.is_staff(auth.uid())
    OR (approved_at IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.notifications n
           WHERE n.user_id = auth.uid() AND n.type = 'campaign'
             AND n.params->>'campaign_id' = campaign_id::text)));

-- ---------------------------------------------------------------- admin RPCs
-- 0 = none, 1 = admin, 2 = admin_master. Only ACTIVE profiles count.
CREATE OR REPLACE FUNCTION public.notification_admin_level()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status::text = 'active') THEN 0
    WHEN EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role::text = 'admin_master') THEN 2
    WHEN EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role::text = 'admin') THEN 1
    ELSE 0 END;
$$;

CREATE OR REPLACE FUNCTION public.notification_campaign_estimate(p_spec jsonb, p_kind text DEFAULT 'operational')
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.notification_admin_level() < 1 THEN RAISE EXCEPTION 'NOTIFICATION_ADMIN_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF NOT public.notification_segment_valid(p_spec) OR coalesce(p_kind, '') NOT IN ('operational', 'product', 'educational', 'commercial') THEN
    RAISE EXCEPTION 'NOTIFICATION_SEGMENT_INVALID' USING ERRCODE = '22023';
  END IF;
  RETURN (SELECT count(*) FROM public.profiles p
           WHERE p.status::text = 'active' AND public.notification_campaign_eligible(p.id, p_spec, p_kind));
END;
$$;

CREATE OR REPLACE FUNCTION public.notification_segment_save(p_id uuid, p_name text, p_spec jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_count integer;
BEGIN
  IF public.notification_admin_level() < 1 THEN RAISE EXCEPTION 'NOTIFICATION_ADMIN_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF NOT public.notification_segment_valid(p_spec) THEN RAISE EXCEPTION 'NOTIFICATION_SEGMENT_INVALID' USING ERRCODE = '22023'; END IF;
  v_count := public.notification_campaign_estimate(p_spec, 'operational');
  IF p_id IS NULL THEN
    INSERT INTO public.notification_segments (name, spec, estimated_count, estimated_at, created_by, updated_by)
    VALUES (btrim(p_name), p_spec, v_count, now(), auth.uid(), auth.uid()) RETURNING id INTO v_id;
  ELSE
    UPDATE public.notification_segments s
       SET name = btrim(p_name), spec = p_spec, estimated_count = v_count, estimated_at = now(),
           updated_by = auth.uid(), updated_at = now()
     WHERE s.id = p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'NOTIFICATION_SEGMENT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  END IF;
  INSERT INTO public.admin_audit_logs (admin_user_id, action, metadata)
  VALUES (auth.uid(), 'notification_segment_saved', jsonb_build_object('segment_id', v_id, 'estimated', v_count));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.notification_campaign_save(p_id uuid, p_expected_version integer, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c public.notification_campaigns%ROWTYPE;
  v_segment jsonb;
BEGIN
  IF public.notification_admin_level() < 1 THEN RAISE EXCEPTION 'NOTIFICATION_ADMIN_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object'
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k NOT IN ('name', 'kind', 'source_locale', 'link', 'segment', 'segment_id')) THEN
    RAISE EXCEPTION 'NOTIFICATION_CAMPAIGN_INVALID' USING ERRCODE = '22023';
  END IF;
  -- A saved audience is copied into the campaign (re-evaluated at send time, never stale ids).
  IF p_patch ? 'segment_id' AND p_patch->>'segment_id' IS NOT NULL THEN
    SELECT s.spec INTO v_segment FROM public.notification_segments s WHERE s.id = (p_patch->>'segment_id')::uuid;
    IF v_segment IS NULL THEN RAISE EXCEPTION 'NOTIFICATION_SEGMENT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.notification_campaigns (name, kind, source_locale, link, segment, segment_id, created_by, updated_by)
    VALUES (btrim(p_patch->>'name'), p_patch->>'kind', coalesce(p_patch->>'source_locale', 'pt-BR'),
            coalesce(p_patch->>'link', '/notifications'),
            coalesce(v_segment, p_patch->'segment', '{"op": "AND", "rules": []}'::jsonb),
            (p_patch->>'segment_id')::uuid, auth.uid(), auth.uid())
    RETURNING * INTO c;
    INSERT INTO public.admin_audit_logs (admin_user_id, action, metadata)
    VALUES (auth.uid(), 'notification_campaign_created', jsonb_build_object('campaign_id', c.id, 'kind', c.kind));
  ELSE
    SELECT * INTO c FROM public.notification_campaigns x WHERE x.id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOTIFICATION_CAMPAIGN_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
    IF c.version <> p_expected_version THEN RAISE EXCEPTION 'NOTIFICATION_CAMPAIGN_VERSION_CONFLICT' USING ERRCODE = '40001'; END IF;
    IF c.status <> 'DRAFT' THEN RAISE EXCEPTION 'NOTIFICATION_CAMPAIGN_NOT_EDITABLE' USING ERRCODE = '55000'; END IF;
    UPDATE public.notification_campaigns x SET
      name = coalesce(btrim(p_patch->>'name'), x.name),
      kind = coalesce(p_patch->>'kind', x.kind),
      source_locale = coalesce(p_patch->>'source_locale', x.source_locale),
      link = coalesce(p_patch->>'link', x.link),
      segment = coalesce(v_segment, p_patch->'segment', x.segment),
      segment_id = CASE WHEN p_patch ? 'segment_id' THEN (p_patch->>'segment_id')::uuid
                        WHEN p_patch ? 'segment' THEN NULL ELSE x.segment_id END,
      version = x.version + 1, updated_by = auth.uid(), updated_at = now()
     WHERE x.id = p_id RETURNING * INTO c;
    INSERT INTO public.admin_audit_logs (admin_user_id, action, metadata)
    VALUES (auth.uid(), 'notification_campaign_updated',
            jsonb_build_object('campaign_id', c.id, 'fields', (SELECT jsonb_agg(k) FROM jsonb_object_keys(p_patch) k)));
  END IF;
  RETURN jsonb_build_object('id', c.id, 'version', c.version, 'status', c.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.notification_campaign_translation_save(
  p_campaign uuid, p_locale text, p_title text, p_body text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
BEGIN
  IF public.notification_admin_level() < 1 THEN RAISE EXCEPTION 'NOTIFICATION_ADMIN_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  SELECT status INTO v_status FROM public.notification_campaigns WHERE id = p_campaign FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'NOTIFICATION_CAMPAIGN_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_status <> 'DRAFT' THEN RAISE EXCEPTION 'NOTIFICATION_CAMPAIGN_NOT_EDITABLE' USING ERRCODE = '55000'; END IF;
  -- Any edit withdraws the approval: an unreviewed text is never sent.
  INSERT INTO public.notification_campaign_translations AS t (campaign_id, locale, title, body, updated_by, updated_at)
  VALUES (p_campaign, p_locale, btrim(p_title), btrim(p_body), auth.uid(), now())
  ON CONFLICT (campaign_id, locale) DO UPDATE
    SET title = EXCLUDED.title, body = EXCLUDED.body, approved_at = NULL, approved_by = NULL,
        updated_by = EXCLUDED.updated_by, updated_at = now();
  UPDATE public.notification_campaigns SET version = version + 1, updated_by = auth.uid(), updated_at = now()
   WHERE id = p_campaign;
  INSERT INTO public.admin_audit_logs (admin_user_id, action, metadata)
  VALUES (auth.uid(), 'notification_campaign_translation_saved', jsonb_build_object('campaign_id', p_campaign, 'locale', p_locale));
END;
$$;

CREATE OR REPLACE FUNCTION public.notification_campaign_translation_approve(p_campaign uuid, p_locale text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
BEGIN
  IF public.notification_admin_level() < 2 THEN RAISE EXCEPTION 'NOTIFICATION_ADMIN_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  SELECT status INTO v_status FROM public.notification_campaigns WHERE id = p_campaign FOR UPDATE;
  IF v_status IS DISTINCT FROM 'DRAFT' THEN RAISE EXCEPTION 'NOTIFICATION_CAMPAIGN_NOT_EDITABLE' USING ERRCODE = '55000'; END IF;
  UPDATE public.notification_campaign_translations SET approved_at = now(), approved_by = auth.uid()
   WHERE campaign_id = p_campaign AND locale = p_locale;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOTIFICATION_TRANSLATION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  UPDATE public.notification_campaigns SET version = version + 1, updated_at = now() WHERE id = p_campaign;
  INSERT INTO public.admin_audit_logs (admin_user_id, action, metadata)
  VALUES (auth.uid(), 'notification_campaign_translation_approved', jsonb_build_object('campaign_id', p_campaign, 'locale', p_locale));
END;
$$;

-- State machine. Each action names the minimum level and the states it may start from.
CREATE OR REPLACE FUNCTION public.notification_campaign_action(
  p_id uuid, p_action text, p_expected_version integer, p_args jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c public.notification_campaigns%ROWTYPE;
  v_level integer := public.notification_admin_level();
  v_need integer;
  v_from text[];
  v_to text;
  v_audience integer;
  v_at timestamptz;
  v_new uuid;
  v_prev text;
BEGIN
  CASE p_action
    WHEN 'schedule'   THEN v_need := 2; v_from := ARRAY['DRAFT'];                                  v_to := 'SCHEDULED';
    WHEN 'unschedule' THEN v_need := 2; v_from := ARRAY['SCHEDULED'];                              v_to := 'DRAFT';
    WHEN 'pause'      THEN v_need := 2; v_from := ARRAY['SCHEDULED', 'SENDING'];                   v_to := 'PAUSED';
    WHEN 'resume'     THEN v_need := 2; v_from := ARRAY['PAUSED'];                                 v_to := 'SCHEDULED';
    WHEN 'cancel'     THEN v_need := 2; v_from := ARRAY['DRAFT', 'SCHEDULED', 'SENDING', 'PAUSED', 'FAILED']; v_to := 'CANCELLED';
    WHEN 'retry'      THEN v_need := 2; v_from := ARRAY['FAILED'];                                 v_to := 'SCHEDULED';
    WHEN 'archive'    THEN v_need := 1; v_from := ARRAY['DRAFT', 'SENT', 'CANCELLED', 'FAILED'];  v_to := 'ARCHIVED';
    WHEN 'duplicate'  THEN v_need := 1; v_from := ARRAY['DRAFT', 'SCHEDULED', 'SENDING', 'PAUSED', 'SENT', 'CANCELLED', 'FAILED', 'ARCHIVED']; v_to := 'DRAFT';
    ELSE RAISE EXCEPTION 'NOTIFICATION_CAMPAIGN_ACTION_INVALID' USING ERRCODE = '22023';
  END CASE;
  IF v_level < v_need THEN RAISE EXCEPTION 'NOTIFICATION_ADMIN_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  SELECT * INTO c FROM public.notification_campaigns x WHERE x.id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOTIFICATION_CAMPAIGN_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF c.version <> p_expected_version THEN RAISE EXCEPTION 'NOTIFICATION_CAMPAIGN_VERSION_CONFLICT' USING ERRCODE = '40001'; END IF;
  IF NOT (c.status = ANY (v_from)) THEN RAISE EXCEPTION 'NOTIFICATION_CAMPAIGN_STATE' USING ERRCODE = '55000'; END IF;
  v_prev := c.status;

  IF p_action = 'duplicate' THEN
    INSERT INTO public.notification_campaigns (name, kind, source_locale, link, segment, segment_id, created_by, updated_by)
    VALUES (left(c.name, 110) || ' (2)', c.kind, c.source_locale, c.link, c.segment, c.segment_id, auth.uid(), auth.uid())
    RETURNING id INTO v_new;
    INSERT INTO public.notification_campaign_translations (campaign_id, locale, title, body, updated_by)
    SELECT v_new, t.locale, t.title, t.body, auth.uid() FROM public.notification_campaign_translations t
     WHERE t.campaign_id = c.id;   -- copied UNAPPROVED
    INSERT INTO public.admin_audit_logs (admin_user_id, action, metadata)
    VALUES (auth.uid(), 'notification_campaign_duplicate', jsonb_build_object('campaign_id', c.id, 'new_campaign_id', v_new));
    RETURN jsonb_build_object('id', v_new, 'version', 1, 'status', 'DRAFT');
  END IF;

  IF p_action = 'schedule' THEN
    IF NOT EXISTS (SELECT 1 FROM public.notification_campaign_translations t
                    WHERE t.campaign_id = c.id AND t.locale = c.source_locale AND t.approved_at IS NOT NULL) THEN
      RAISE EXCEPTION 'NOTIFICATION_CAMPAIGN_NOT_APPROVED' USING ERRCODE = '55000';
    END IF;
    v_at := coalesce((p_args->>'scheduled_at')::timestamptz, now());
    IF v_at < now() - interval '1 minute' OR v_at > now() + interval '90 days' THEN
      RAISE EXCEPTION 'NOTIFICATION_CAMPAIGN_SCHEDULE_INVALID' USING ERRCODE = '22023';
    END IF;
    -- Explicit confirmation: the caller must restate the live audience size.
    v_audience := (SELECT count(*) FROM public.profiles p
                    WHERE p.status::text = 'active' AND public.notification_campaign_eligible(p.id, c.segment, c.kind));
    IF v_audience = 0 THEN RAISE EXCEPTION 'NOTIFICATION_CAMPAIGN_EMPTY_AUDIENCE' USING ERRCODE = '55000'; END IF;
    IF (p_args->>'confirm_audience') IS NULL OR (p_args->>'confirm_audience')::integer <> v_audience THEN
      RAISE EXCEPTION 'NOTIFICATION_CAMPAIGN_CONFIRMATION_MISMATCH' USING ERRCODE = '55000';
    END IF;
    UPDATE public.notification_campaigns x SET status = 'SCHEDULED', scheduled_at = v_at, confirmed_audience = v_audience,
           cursor_user = NULL, targeted = 0, accepted = 0, suppressed = 0, rejected = 0, duplicates = 0,
           failures = 0, last_error = NULL
     WHERE x.id = c.id;
  ELSIF p_action IN ('pause', 'cancel') THEN
    -- Clearing the lease fences off any batch in flight (it rolls back).
    UPDATE public.notification_campaigns x SET status = v_to, lease_token = NULL, lease_until = NULL,
           finished_at = CASE WHEN v_to = 'CANCELLED' THEN now() ELSE x.finished_at END
     WHERE x.id = c.id;
  ELSIF p_action = 'unschedule' THEN
    UPDATE public.notification_campaigns x SET status = 'DRAFT', scheduled_at = NULL, confirmed_audience = NULL WHERE x.id = c.id;
  ELSIF p_action IN ('resume', 'retry') THEN
    UPDATE public.notification_campaigns x SET status = 'SCHEDULED', scheduled_at = least(coalesce(x.scheduled_at, now()), now()),
           failures = 0, last_error = NULL
     WHERE x.id = c.id;
  ELSE
    UPDATE public.notification_campaigns x SET status = v_to WHERE x.id = c.id;
  END IF;
  UPDATE public.notification_campaigns x SET version = x.version + 1, updated_by = auth.uid(), updated_at = now()
   WHERE x.id = c.id RETURNING * INTO c;
  INSERT INTO public.admin_audit_logs (admin_user_id, action, metadata)
  VALUES (auth.uid(), 'notification_campaign_' || p_action,
          jsonb_build_object('campaign_id', c.id, 'from', v_prev, 'to', c.status, 'audience', v_audience,
                             'scheduled_at', c.scheduled_at));
  RETURN jsonb_build_object('id', c.id, 'version', c.version, 'status', c.status, 'audience', v_audience);
END;
$$;

-- Test send: one notification to the caller or another STAFF member, never to a player.
-- Not counted in the campaign's numbers (source campaign_test). At most 10 per campaign/hour.
CREATE OR REPLACE FUNCTION public.notification_campaign_test_send(p_id uuid, p_recipient uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c public.notification_campaigns%ROWTYPE;
  v_to uuid := coalesce(p_recipient, auth.uid());
  r record;
BEGIN
  IF public.notification_admin_level() < 1 THEN RAISE EXCEPTION 'NOTIFICATION_ADMIN_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF v_to <> auth.uid() AND NOT public.is_staff(v_to) THEN
    RAISE EXCEPTION 'NOTIFICATION_TEST_RECIPIENT_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM public.notification_campaigns x WHERE x.id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOTIFICATION_CAMPAIGN_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notification_campaign_translations t WHERE t.campaign_id = c.id) THEN
    RAISE EXCEPTION 'NOTIFICATION_CAMPAIGN_NO_TEXT' USING ERRCODE = '55000';
  END IF;
  IF (SELECT count(*) FROM public.admin_audit_logs a
       WHERE a.action = 'notification_campaign_test_send' AND a.metadata->>'campaign_id' = c.id::text
         AND a.created_at > now() - interval '1 hour') >= 10 THEN
    RAISE EXCEPTION 'NOTIFICATION_TEST_RATE_LIMITED' USING ERRCODE = '54000';
  END IF;
  SELECT * INTO r FROM public.notification_ingest(v_to, jsonb_build_array(jsonb_build_object(
    'type', 'campaign', 'version', 1,
    'category', CASE c.kind WHEN 'operational' THEN 'operational' WHEN 'commercial' THEN 'marketing' ELSE 'announcements' END,
    'occurred_at', now(), 'source', 'campaign_test', 'source_ref', c.id::text, 'payload', '{}'::jsonb,
    'idempotency_key', 'campaign_test:' || c.id || ':' || v_to || ':' || (extract(epoch FROM clock_timestamp()) * 1000)::bigint,
    'link', c.link, 'params', jsonb_build_object('campaign_id', c.id, 'fallback', c.source_locale, 'test', true))));
  INSERT INTO public.admin_audit_logs (admin_user_id, action, target_user_id, metadata)
  VALUES (auth.uid(), 'notification_campaign_test_send', v_to,
          jsonb_build_object('campaign_id', c.id, 'accepted', r.accepted, 'suppressed', r.suppressed));
  RETURN jsonb_build_object('accepted', r.accepted, 'suppressed', r.suppressed, 'rejected', r.rejected);
END;
$$;

-- Created / accepted / sent / delivered / read for one campaign. In-app: sent = delivered =
-- a notification row was created (whether the player SAW it is not measured); read = read_at.
CREATE OR REPLACE FUNCTION public.notification_campaign_stats(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.notification_admin_level() < 1 THEN RAISE EXCEPTION 'NOTIFICATION_ADMIN_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  RETURN (
    SELECT jsonb_build_object(
      'created', count(e.id),
      'accepted', count(e.id) FILTER (WHERE e.status = 'ACCEPTED'),
      'suppressed', count(e.id) FILTER (WHERE e.status = 'SUPPRESSED'),
      'rejected', count(e.id) FILTER (WHERE e.status = 'REJECTED'),
      'delivered_in_app', count(n.id),
      'read', count(n.read_at),
      'deleted_by_player', count(e.id) FILTER (WHERE e.status = 'ACCEPTED' AND n.id IS NULL),
      'by_reason', coalesce((SELECT jsonb_object_agg(reason, k) FROM (
          SELECT e2.reason, count(*) AS k FROM public.notification_events e2
           WHERE e2.source = 'campaign' AND e2.source_ref = p_id::text AND e2.reason IS NOT NULL
           GROUP BY e2.reason) s), '{}'::jsonb))
      FROM public.notification_events e
      LEFT JOIN public.notifications n ON n.event_id = e.id
     WHERE e.source = 'campaign' AND e.source_ref = p_id::text);
END;
$$;

CREATE OR REPLACE FUNCTION public.notification_admin_dashboard(p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.notification_admin_level() < 1 THEN RAISE EXCEPTION 'NOTIFICATION_ADMIN_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to <= p_from OR p_to - p_from > interval '366 days' THEN
    RAISE EXCEPTION 'NOTIFICATION_RANGE_INVALID' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object(
    'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('category', category, 'status', status, 'reason', reason, 'events', k)), '[]'::jsonb)
                 FROM (SELECT e.category, e.status, e.reason, count(*) AS k FROM public.notification_events e
                        WHERE e.created_at >= p_from AND e.created_at < p_to AND e.source <> 'campaign_test'
                        GROUP BY 1, 2, 3) s),
    'delivered_in_app', (SELECT count(*) FROM public.notifications n WHERE n.created_at >= p_from AND n.created_at < p_to),
    'read', (SELECT count(*) FROM public.notifications n WHERE n.created_at >= p_from AND n.created_at < p_to AND n.read_at IS NOT NULL),
    'active_accounts', (SELECT count(*) FROM public.profiles p WHERE p.status::text = 'active'),
    'marketing_consents', (SELECT count(*) FROM public.notification_preferences np WHERE np.marketing_consent),
    'campaigns', (SELECT coalesce(jsonb_object_agg(status, k), '{}'::jsonb)
                    FROM (SELECT status, count(*) AS k FROM public.notification_campaigns GROUP BY status) s),
    'last_retention_run', (SELECT jsonb_build_object('status', r.status, 'started_at', r.started_at)
                             FROM public.notification_maintenance_runs r ORDER BY r.id DESC LIMIT 1));
END;
$$;

REVOKE ALL ON FUNCTION public.notification_segment_valid(jsonb, integer),
  public.notification_segment_match(uuid, jsonb, integer),
  public.notification_campaign_eligible(uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notification_segment_valid(jsonb, integer),
  public.notification_segment_match(uuid, jsonb, integer),
  public.notification_campaign_eligible(uuid, jsonb, text) TO service_role;
REVOKE ALL ON FUNCTION public.notification_admin_level(),
  public.notification_campaign_estimate(jsonb, text),
  public.notification_segment_save(uuid, text, jsonb),
  public.notification_campaign_save(uuid, integer, jsonb),
  public.notification_campaign_translation_save(uuid, text, text, text),
  public.notification_campaign_translation_approve(uuid, text),
  public.notification_campaign_action(uuid, text, integer, jsonb),
  public.notification_campaign_test_send(uuid, uuid),
  public.notification_campaign_stats(uuid),
  public.notification_admin_dashboard(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notification_admin_level(),
  public.notification_campaign_estimate(jsonb, text),
  public.notification_segment_save(uuid, text, jsonb),
  public.notification_campaign_save(uuid, integer, jsonb),
  public.notification_campaign_translation_save(uuid, text, text, text),
  public.notification_campaign_translation_approve(uuid, text),
  public.notification_campaign_action(uuid, text, integer, jsonb),
  public.notification_campaign_test_send(uuid, uuid),
  public.notification_campaign_stats(uuid),
  public.notification_admin_dashboard(timestamptz, timestamptz) TO authenticated, service_role;

-- ---------------------------------------------------------------- sender (pg_cron)
-- One fenced batch. Returns MORE / DONE / LEASE_LOST / FAILED. Its work is atomic: on any
-- error (or a lost lease) everything it did is rolled back.
CREATE OR REPLACE FUNCTION public.notification_campaign_batch(p_id uuid, p_token uuid, p_batch integer)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  c public.notification_campaigns%ROWTYPE;
  v_users uuid[];
  u uuid;
  r record;
  n_acc integer := 0; n_sup integer := 0; n_rej integer := 0; n_dup integer := 0;
  v_done boolean;
  v_category text;
  v_rows integer;
BEGIN
  BEGIN
    SELECT * INTO c FROM public.notification_campaigns x
     WHERE x.id = p_id AND x.status = 'SENDING' AND x.lease_token = p_token;
    IF NOT FOUND THEN RETURN 'LEASE_LOST'; END IF;
    v_category := CASE c.kind WHEN 'operational' THEN 'operational' WHEN 'commercial' THEN 'marketing' ELSE 'announcements' END;
    SELECT array_agg(id ORDER BY id) INTO v_users FROM (
      SELECT p.id FROM public.profiles p
       WHERE p.status::text = 'active' AND p.id > coalesce(c.cursor_user, '00000000-0000-0000-0000-000000000000'::uuid)
         AND public.notification_campaign_eligible(p.id, c.segment, c.kind)
       ORDER BY p.id LIMIT greatest(1, least(p_batch, 1000))) s;
    v_done := coalesce(array_length(v_users, 1), 0) < greatest(1, least(p_batch, 1000));
    FOREACH u IN ARRAY coalesce(v_users, '{}'::uuid[]) LOOP
      SELECT * INTO r FROM public.notification_ingest(u, jsonb_build_array(jsonb_build_object(
        'type', 'campaign', 'version', 1, 'category', v_category,
        'occurred_at', now(), 'source', 'campaign', 'source_ref', c.id::text, 'payload', '{}'::jsonb,
        'idempotency_key', 'campaign:' || c.id || ':' || u || ':in_app',
        'link', c.link, 'params', jsonb_build_object('campaign_id', c.id, 'fallback', c.source_locale))));
      n_acc := n_acc + r.accepted; n_sup := n_sup + r.suppressed; n_rej := n_rej + r.rejected; n_dup := n_dup + r.duplicates;
    END LOOP;
    -- Fence: only the holder of the current lease may record progress.
    UPDATE public.notification_campaigns x SET
      cursor_user = coalesce(v_users[array_length(v_users, 1)], x.cursor_user),
      targeted = x.targeted + coalesce(array_length(v_users, 1), 0),
      accepted = x.accepted + n_acc, suppressed = x.suppressed + n_sup,
      rejected = x.rejected + n_rej, duplicates = x.duplicates + n_dup,
      status = CASE WHEN v_done THEN 'SENT' ELSE x.status END,
      finished_at = CASE WHEN v_done THEN now() ELSE x.finished_at END,
      lease_token = CASE WHEN v_done THEN NULL ELSE x.lease_token END,
      lease_until = CASE WHEN v_done THEN NULL ELSE now() + interval '5 minutes' END,
      updated_at = now()
     WHERE x.id = p_id AND x.status = 'SENDING' AND x.lease_token = p_token;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN RAISE EXCEPTION 'NOTIFICATION_LEASE_LOST' USING ERRCODE = 'P0001', HINT = 'lease'; END IF;
    RETURN CASE WHEN v_done THEN 'DONE' ELSE 'MORE' END;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'NOTIFICATION_LEASE_LOST' THEN RETURN 'LEASE_LOST'; END IF;
    -- Batch rolled back. Record the failure (fenced); retry later with backoff, FAILED at 3.
    UPDATE public.notification_campaigns x SET
      failures = least(x.failures + 1, 10),
      last_error = left(regexp_replace(upper(SQLSTATE), '[^A-Z0-9_]', '_', 'g'), 40),
      status = CASE WHEN x.failures + 1 >= 3 THEN 'FAILED' ELSE x.status END,
      lease_token = CASE WHEN x.failures + 1 >= 3 THEN NULL ELSE x.lease_token END,
      lease_until = CASE WHEN x.failures + 1 >= 3 THEN NULL ELSE now() + make_interval(mins => 2 * (x.failures + 1)) END,
      updated_at = now()
     WHERE x.id = p_id AND x.status = 'SENDING' AND x.lease_token = p_token;
    RETURN 'FAILED';
  END;
END;
$$;

-- Claims at most one due campaign and sends up to p_max_batches batches, committing each.
-- No SET clause: a procedure with one cannot COMMIT. Every name inside is schema-qualified.
CREATE OR REPLACE PROCEDURE public.notification_campaign_run(p_batch integer DEFAULT 200, p_max_batches integer DEFAULT 10)
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
  v_token uuid := pg_catalog.gen_random_uuid();
  v_result text;
  i integer := 0;
BEGIN
  UPDATE public.notification_campaigns x SET
    status = 'SENDING', lease_token = v_token, lease_until = now() + interval '5 minutes',
    attempts = x.attempts + 1, started_at = coalesce(x.started_at, now()), updated_at = now()
   WHERE x.id = (
     SELECT y.id FROM public.notification_campaigns y
      WHERE (y.status = 'SCHEDULED' AND y.scheduled_at <= now())
         OR (y.status = 'SENDING' AND y.lease_until < now())
      ORDER BY y.scheduled_at, y.id
      FOR UPDATE SKIP LOCKED LIMIT 1)
  RETURNING x.id INTO v_id;
  COMMIT;
  IF v_id IS NULL THEN RETURN; END IF;
  LOOP
    v_result := public.notification_campaign_batch(v_id, v_token, p_batch);
    COMMIT;
    i := i + 1;
    EXIT WHEN v_result <> 'MORE' OR i >= greatest(1, least(p_max_batches, 100));
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.notification_campaign_batch(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notification_campaign_batch(uuid, uuid, integer) TO service_role;
REVOKE ALL ON PROCEDURE public.notification_campaign_run(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON PROCEDURE public.notification_campaign_run(integer, integer) TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('notification-campaigns', '* * * * *', 'CALL public.notification_campaign_run(200, 10)');
  END IF;
END;
$$;
