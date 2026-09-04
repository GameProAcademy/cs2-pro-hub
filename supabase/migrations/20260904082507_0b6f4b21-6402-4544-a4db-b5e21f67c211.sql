-- FASE 2.2.1C — FACEIT job reliability, convergence and index cleanup.

-- 1. Job liveness / recovery bookkeeping -------------------------------------
ALTER TABLE public.faceit_sync_jobs
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS stale_recoveries integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS matches_skipped integer;

CREATE INDEX IF NOT EXISTS faceit_sync_jobs_stale_idx
  ON public.faceit_sync_jobs (heartbeat_at)
  WHERE status = 'processing';

-- 2. Match completeness convergence -----------------------------------------
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS source_complete boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_fetch_attempts smallint NOT NULL DEFAULT 0;

-- 3. Atomic claim with global concurrency budget -----------------------------
CREATE OR REPLACE FUNCTION public.claim_next_faceit_sync_job(
  _max_concurrent integer DEFAULT 1
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  _id uuid;
  _busy integer;
BEGIN
  -- Serialises the whole decision: counting busy workers and locking the row
  -- must be a single observation, otherwise two workers both see a free slot.
  PERFORM pg_advisory_xact_lock(hashtext('public.claim_next_faceit_sync_job'));

  SELECT count(*) INTO _busy
    FROM public.faceit_sync_jobs
   WHERE status = 'processing';

  IF _busy >= GREATEST(COALESCE(_max_concurrent, 1), 1) THEN
    RETURN NULL;
  END IF;

  SELECT id INTO _id
    FROM public.faceit_sync_jobs
   WHERE status IN ('queued', 'retrying')
     AND (next_attempt_at IS NULL OR next_attempt_at <= now())
   ORDER BY created_at ASC
   FOR UPDATE SKIP LOCKED
   LIMIT 1;

  IF _id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.faceit_sync_jobs
     SET status = 'processing',
         started_at = now(),
         heartbeat_at = now(),
         finished_at = NULL,
         updated_at = now()
   WHERE id = _id;

  RETURN _id;
END;
$function$;

-- 4. Stale recovery: a dead worker must never park a job in `processing` -----
CREATE OR REPLACE FUNCTION public.recover_stale_faceit_sync_jobs(
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
      FROM public.faceit_sync_jobs
     WHERE status = 'processing'
       AND COALESCE(heartbeat_at, started_at, updated_at) < _threshold
     FOR UPDATE SKIP LOCKED
  ), moved AS (
    UPDATE public.faceit_sync_jobs j
       SET status = CASE
                      WHEN s.attempts + 1 < GREATEST(COALESCE(_max_attempts, 3), 1)
                        THEN 'retrying'::public.faceit_sync_job_status
                      ELSE 'failed'::public.faceit_sync_job_status
                    END,
           attempts = s.attempts + 1,
           stale_recoveries = j.stale_recoveries + 1,
           last_error = 'FACEIT_JOB_STALE',
           heartbeat_at = NULL,
           next_attempt_at = CASE
                               WHEN s.attempts + 1 < GREATEST(COALESCE(_max_attempts, 3), 1)
                                 THEN now()
                               ELSE NULL
                             END,
           finished_at = CASE
                           WHEN s.attempts + 1 < GREATEST(COALESCE(_max_attempts, 3), 1)
                             THEN NULL
                           ELSE now()
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

REVOKE ALL ON FUNCTION public.claim_next_faceit_sync_job(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recover_stale_faceit_sync_jobs(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_next_faceit_sync_job(integer) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.recover_stale_faceit_sync_jobs(integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_faceit_sync_job(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.recover_stale_faceit_sync_jobs(integer, integer) TO service_role;

-- 5. Duplicate UNIQUE index on match_metrics --------------------------------
-- `match_metrics_match_id_player_id_key` is the real UNIQUE CONSTRAINT and is
-- kept (ON CONFLICT (match_id, player_id) keeps working). The standalone index
-- below is an exact duplicate and only costs writes.
DROP INDEX IF EXISTS public.match_metrics_match_player_key;