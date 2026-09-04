-- FASE 2.3 — Gamers Club architecture + Player Identity Graph.
-- Incremental and idempotent. No existing migration is edited.

-- 1. Enums -------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.identity_link_status AS ENUM
    ('unlinked', 'correlated', 'strongly_correlated', 'verified', 'conflict');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.gc_job_type AS ENUM
    ('gamers_club_profile_sync', 'gamers_club_match_history_sync',
     'gamers_club_match_details_sync', 'gamers_club_stats_sync',
     'identity_correlation_job');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.gc_job_status AS ENUM
    ('queued', 'processing', 'completed', 'failed', 'retrying', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.gc_job_outcome AS ENUM
    ('success', 'partial', 'failed', 'blocked_external_access',
     'rate_limited', 'timeout', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Existing tables: locator + identity state -------------------------------
ALTER TABLE public.player_identities
  ADD COLUMN IF NOT EXISTS identity_status public.identity_link_status NOT NULL DEFAULT 'unlinked',
  ADD COLUMN IF NOT EXISTS confidence_score numeric(4, 3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verification_method text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS profile_locator_type text,
  ADD COLUMN IF NOT EXISTS profile_slug text;

DO $$ BEGIN
  ALTER TABLE public.player_identities
    ADD CONSTRAINT player_identities_confidence_range
    CHECK (confidence_score >= 0 AND confidence_score <= 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.player_identities
    ADD CONSTRAINT player_identities_locator_type_chk
    CHECK (profile_locator_type IS NULL OR profile_locator_type IN ('numeric_id', 'slug'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.player_connections
  ADD COLUMN IF NOT EXISTS profile_locator_type text,
  ADD COLUMN IF NOT EXISTS profile_slug text;

DO $$ BEGIN
  ALTER TABLE public.player_connections
    ADD CONSTRAINT player_connections_locator_type_chk
    CHECK (profile_locator_type IS NULL OR profile_locator_type IN ('numeric_id', 'slug'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Identity correlation evidence -------------------------------------------
CREATE TABLE IF NOT EXISTS public.identity_correlation_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  identity_a_source text NOT NULL,
  identity_a_id text,
  identity_b_source text NOT NULL,
  identity_b_id text,
  attribute text NOT NULL,
  match_type text NOT NULL,
  confidence_score numeric(4, 3) NOT NULL DEFAULT 0,
  -- Irreversible digest: the compared value itself is never stored.
  evidence_value_hash text,
  provenance text NOT NULL DEFAULT 'unknown',
  observed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT identity_evidence_confidence_range
    CHECK (confidence_score >= 0 AND confidence_score <= 1)
);

GRANT SELECT ON public.identity_correlation_evidence TO authenticated;
GRANT ALL ON public.identity_correlation_evidence TO service_role;
ALTER TABLE public.identity_correlation_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "identity_evidence_owner_select" ON public.identity_correlation_evidence;
CREATE POLICY "identity_evidence_owner_select"
  ON public.identity_correlation_evidence
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS identity_evidence_user_idx
  ON public.identity_correlation_evidence (user_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS identity_evidence_pair_idx
  ON public.identity_correlation_evidence
  (user_id, identity_a_source, identity_b_source, attribute);

-- 4. Gamers Club profile snapshots (append-only) ------------------------------
CREATE TABLE IF NOT EXISTS public.gamers_club_profile_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.player_connections(id) ON DELETE SET NULL,
  external_id text,
  profile_slug text,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  completeness numeric(4, 3),
  source_version text NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gc_snapshot_no_sensitive_metadata
    CHECK (NOT public.jsonb_has_sensitive_key(profile))
);

GRANT SELECT ON public.gamers_club_profile_snapshots TO authenticated;
GRANT ALL ON public.gamers_club_profile_snapshots TO service_role;
ALTER TABLE public.gamers_club_profile_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gc_snapshots_owner_select" ON public.gamers_club_profile_snapshots;
CREATE POLICY "gc_snapshots_owner_select"
  ON public.gamers_club_profile_snapshots
  FOR SELECT TO authenticated
  USING (public.owns_player(player_id) OR public.is_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS gc_snapshots_player_idx
  ON public.gamers_club_profile_snapshots (player_id, observed_at DESC);

-- 5. Gamers Club job queue ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gamers_club_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.player_connections(id) ON DELETE CASCADE,
  type public.gc_job_type NOT NULL,
  status public.gc_job_status NOT NULL DEFAULT 'queued',
  outcome public.gc_job_outcome,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  started_at timestamptz,
  finished_at timestamptz,
  next_attempt_at timestamptz,
  heartbeat_at timestamptz,
  stale_recoveries integer NOT NULL DEFAULT 0,
  last_error_code text,
  last_error text,
  items_expected integer,
  items_collected integer NOT NULL DEFAULT 0,
  items_skipped integer NOT NULL DEFAULT 0,
  items_deferred integer NOT NULL DEFAULT 0,
  api_calls_used integer NOT NULL DEFAULT 0,
  external_access_status text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gc_jobs_no_sensitive_metadata
    CHECK (NOT public.jsonb_has_sensitive_key(metadata))
);

GRANT SELECT ON public.gamers_club_sync_jobs TO authenticated;
GRANT ALL ON public.gamers_club_sync_jobs TO service_role;
ALTER TABLE public.gamers_club_sync_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gc_jobs_owner_select" ON public.gamers_club_sync_jobs;
CREATE POLICY "gc_jobs_owner_select"
  ON public.gamers_club_sync_jobs
  FOR SELECT TO authenticated
  USING (public.owns_player(player_id) OR public.is_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS gc_jobs_claim_idx
  ON public.gamers_club_sync_jobs (status, next_attempt_at, created_at);
CREATE INDEX IF NOT EXISTS gc_jobs_stale_idx
  ON public.gamers_club_sync_jobs (heartbeat_at) WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS gc_jobs_player_idx
  ON public.gamers_club_sync_jobs (player_id, created_at DESC);
-- One live job per player+type: protects against duplicate enqueues.
CREATE UNIQUE INDEX IF NOT EXISTS gc_jobs_live_uniq
  ON public.gamers_club_sync_jobs (player_id, type)
  WHERE status IN ('queued', 'processing', 'retrying');

DROP TRIGGER IF EXISTS gc_jobs_touch_updated_at ON public.gamers_club_sync_jobs;
CREATE TRIGGER gc_jobs_touch_updated_at
  BEFORE UPDATE ON public.gamers_club_sync_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6. Atomic claim + stale recovery -------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_next_gamers_club_sync_job(_max_concurrent integer DEFAULT 1)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  _id uuid;
  _busy integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('public.claim_next_gamers_club_sync_job'));

  SELECT count(*) INTO _busy
    FROM public.gamers_club_sync_jobs
   WHERE status = 'processing';

  IF _busy >= GREATEST(COALESCE(_max_concurrent, 1), 1) THEN
    RETURN NULL;
  END IF;

  SELECT id INTO _id
    FROM public.gamers_club_sync_jobs
   WHERE status IN ('queued', 'retrying')
     AND attempts < max_attempts
     AND (next_attempt_at IS NULL OR next_attempt_at <= now())
   ORDER BY created_at ASC
   FOR UPDATE SKIP LOCKED
   LIMIT 1;

  IF _id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.gamers_club_sync_jobs
     SET status = 'processing',
         started_at = now(),
         heartbeat_at = now(),
         finished_at = NULL,
         updated_at = now()
   WHERE id = _id;

  RETURN _id;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_next_gamers_club_sync_job(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_next_gamers_club_sync_job(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_gamers_club_sync_job(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.recover_stale_gamers_club_sync_jobs(
  _stale_seconds integer DEFAULT 300,
  _max_attempts integer DEFAULT 3
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  _threshold timestamptz := now() - make_interval(secs => GREATEST(COALESCE(_stale_seconds, 300), 30));
  _recovered integer;
BEGIN
  WITH stale AS (
    SELECT id, attempts
      FROM public.gamers_club_sync_jobs
     WHERE status = 'processing'
       AND COALESCE(heartbeat_at, started_at, updated_at) < _threshold
     FOR UPDATE SKIP LOCKED
  ), moved AS (
    UPDATE public.gamers_club_sync_jobs j
       SET status = CASE
                      WHEN s.attempts + 1 < GREATEST(COALESCE(_max_attempts, j.max_attempts, 3), 1)
                        THEN 'retrying'::public.gc_job_status
                      ELSE 'failed'::public.gc_job_status
                    END,
           attempts = s.attempts + 1,
           stale_recoveries = j.stale_recoveries + 1,
           last_error_code = 'GC_JOB_STALE',
           last_error = 'GC_JOB_STALE',
           heartbeat_at = NULL,
           next_attempt_at = CASE
                               WHEN s.attempts + 1 < GREATEST(COALESCE(_max_attempts, j.max_attempts, 3), 1)
                                 THEN now()
                               ELSE NULL
                             END,
           finished_at = CASE
                           WHEN s.attempts + 1 < GREATEST(COALESCE(_max_attempts, j.max_attempts, 3), 1)
                             THEN NULL
                           ELSE now()
                         END,
           outcome = CASE
                       WHEN s.attempts + 1 < GREATEST(COALESCE(_max_attempts, j.max_attempts, 3), 1)
                         THEN j.outcome
                       ELSE 'timeout'::public.gc_job_outcome
                     END,
           updated_at = now()
      FROM stale s
     WHERE j.id = s.id
    RETURNING j.id
  )
  SELECT count(*) INTO _recovered FROM moved;

  RETURN COALESCE(_recovered, 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.recover_stale_gamers_club_sync_jobs(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recover_stale_gamers_club_sync_jobs(integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_stale_gamers_club_sync_jobs(integer, integer) TO service_role;