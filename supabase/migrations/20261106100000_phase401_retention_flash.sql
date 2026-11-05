-- Fase 4.0.1 — scheduled notification retention + per-match flash-assist provenance.
--
-- 1. Retention no longer depends on someone opening the app: pg_cron (already installed and
--    used by `cs2-demo-pipeline`) runs notification_retention_run() daily. The wrapper takes a
--    non-blocking advisory lock (a second concurrent run is recorded as SKIPPED and does
--    nothing), purges in bounded batches through the existing notification_purge_expired
--    (same retention rules: read 90 d, unread 180 d, events 180 d and never while referenced),
--    and records start, end, counts, duration and the SQLSTATE of a failure in
--    notification_maintenance_runs. No notification content is ever logged.
-- 2. match_flash_assist_provenance stores HOW each match's flash-assist count was obtained
--    (GAME_FLAG / TIMED_ATTRIBUTION / MIXED / NOT_MEASURED, contract
--    flash-assist-provenance-v1), written by the ingestion after the canonical projection.
--    Matches processed before this version have no row: they read as "method not recorded".
--    No historical metric is changed and no demo is reprocessed.
--
-- Rollback:
--   SELECT cron.unschedule('notification-retention');   -- when pg_cron is present
--   DROP FUNCTION IF EXISTS public.notification_retention_run(integer, integer);
--   DROP TABLE IF EXISTS public.notification_maintenance_runs, public.match_flash_assist_provenance;
-- (the web build reads both tables defensively: absent → feature hidden / "not recorded").

CREATE TABLE IF NOT EXISTS public.notification_maintenance_runs (
  id bigserial PRIMARY KEY,
  job text NOT NULL CHECK (job ~ '^[a-z_]{3,48}$'),
  status text NOT NULL CHECK (status IN ('RUNNING', 'OK', 'FAILED', 'SKIPPED')),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at timestamptz,
  duration_ms integer,
  batches integer NOT NULL DEFAULT 0,
  notifications_deleted integer NOT NULL DEFAULT 0,
  events_deleted integer NOT NULL DEFAULT 0,
  error_code text CHECK (error_code IS NULL OR error_code ~ '^[A-Z0-9_]{1,16}$')
);
CREATE INDEX IF NOT EXISTS notification_maintenance_runs_started_idx
  ON public.notification_maintenance_runs (job, started_at DESC);
ALTER TABLE public.notification_maintenance_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_maintenance_runs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.notification_maintenance_runs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.notification_maintenance_runs_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.notification_retention_run(
  p_batch integer DEFAULT 5000,
  p_max_batches integer DEFAULT 20
)
RETURNS TABLE (status text, batches integer, notifications_deleted integer, events_deleted integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_run bigint;
  v_started timestamptz := clock_timestamp();
  v_batch integer := greatest(1, least(coalesce(p_batch, 5000), 50000));
  v_max integer := greatest(1, least(coalesce(p_max_batches, 20), 200));
  v_n integer := 0; v_e integer := 0; v_b integer := 0;
  r record;
BEGIN
  -- One run at a time; a concurrent invocation does nothing and says so.
  IF NOT pg_try_advisory_xact_lock(hashtextextended('notification_retention_run', 0)) THEN
    INSERT INTO public.notification_maintenance_runs (job, status, finished_at, duration_ms)
    VALUES ('notification_retention', 'SKIPPED', clock_timestamp(), 0);
    RETURN QUERY SELECT 'SKIPPED'::text, 0, 0, 0;
    RETURN;
  END IF;
  INSERT INTO public.notification_maintenance_runs (job, status)
  VALUES ('notification_retention', 'RUNNING') RETURNING id INTO v_run;
  BEGIN
    LOOP
      SELECT * INTO r FROM public.notification_purge_expired(v_batch);
      v_b := v_b + 1;
      v_n := v_n + r.notifications_deleted;
      v_e := v_e + r.events_deleted;
      EXIT WHEN (r.notifications_deleted < v_batch AND r.events_deleted < v_batch) OR v_b >= v_max;
    END LOOP;
    UPDATE public.notification_maintenance_runs x
       SET status = 'OK', finished_at = clock_timestamp(), batches = v_b,
           notifications_deleted = v_n, events_deleted = v_e,
           duration_ms = (extract(epoch FROM clock_timestamp() - v_started) * 1000)::integer
     WHERE x.id = v_run;
    RETURN QUERY SELECT 'OK'::text, v_b, v_n, v_e;
  EXCEPTION WHEN OTHERS THEN
    -- The purge work of this run is rolled back (sub-transaction); the next run retries it.
    UPDATE public.notification_maintenance_runs x
       SET status = 'FAILED', finished_at = clock_timestamp(), batches = v_b,
           duration_ms = (extract(epoch FROM clock_timestamp() - v_started) * 1000)::integer,
           error_code = left(SQLSTATE, 16)
     WHERE x.id = v_run;
    RETURN QUERY SELECT 'FAILED'::text, v_b, 0, 0;
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.notification_retention_run(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notification_retention_run(integer, integer) TO service_role;

-- Daily at 03:17 UTC, through the pg_cron already in use (no new service).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'notification-retention',
      '17 3 * * *',
      'SELECT public.notification_retention_run(5000, 20)'
    );
  END IF;
END;
$$;

-- ---------------------------------------------------------------- flash-assist provenance
CREATE TABLE IF NOT EXISTS public.match_flash_assist_provenance (
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method IN ('GAME_FLAG', 'TIMED_ATTRIBUTION', 'MIXED', 'NOT_MEASURED')),
  method_version text NOT NULL CHECK (method_version ~ '^[a-z0-9-]{3,48}$'),
  credited integer CHECK (credited IS NULL OR credited >= 0),
  credited_by_flag integer CHECK (credited_by_flag IS NULL OR credited_by_flag >= 0),
  credited_by_timing integer CHECK (credited_by_timing IS NULL OR credited_by_timing >= 0),
  unattributed_candidates integer CHECK (unattributed_candidates IS NULL OR unattributed_candidates >= 0),
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, player_id),
  -- Measured ⇔ counts present, and the parts add up (no double counting).
  CONSTRAINT flash_provenance_measured_consistent CHECK (
    (method = 'NOT_MEASURED' AND credited IS NULL AND credited_by_flag IS NULL AND credited_by_timing IS NULL)
    OR (method <> 'NOT_MEASURED' AND credited IS NOT NULL AND credited = credited_by_flag + credited_by_timing)
  )
);
ALTER TABLE public.match_flash_assist_provenance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.match_flash_assist_provenance FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.match_flash_assist_provenance TO authenticated;
GRANT ALL ON public.match_flash_assist_provenance TO service_role;
DROP POLICY IF EXISTS match_flash_assist_provenance_select_own ON public.match_flash_assist_provenance;
CREATE POLICY match_flash_assist_provenance_select_own ON public.match_flash_assist_provenance
  FOR SELECT TO authenticated USING (public.owns_player(player_id));
