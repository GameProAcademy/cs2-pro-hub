-- PR4 — "Reportar problema": persisted problem reports for a demo job.
--
-- One row per (user, job, attempt, retry, occurrence). The row is the source of truth: it is
-- created BEFORE any email is attempted, so a report is never lost when email fails, and the
-- email outcome is recorded honestly on the row (pending / accepted / skipped / failed).
--
-- Never stored here: tokens, keys, cookies, headers, .dem content, RAW evidence, AI Coach
-- PLAYER_FACTS. Only the job reference, the classified category/code/stage, the parser
-- revision, locale/page and an optional, size-limited, sanitized player note.

CREATE TABLE IF NOT EXISTS public.demo_problem_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  protocol text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.demo_jobs(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  retry_count integer NOT NULL DEFAULT 0,
  occurrence_key text NOT NULL,
  category text NOT NULL,
  error_code text NULL,
  stage text NULL,
  job_status text NOT NULL,
  parser_revision text NULL,
  details text NULL,
  locale text NOT NULL DEFAULT 'pt-BR',
  page text NULL,
  app_version text NULL,
  email_status text NOT NULL DEFAULT 'pending',
  email_reason text NULL,
  email_attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT demo_problem_reports_protocol_chk CHECK (protocol ~ '^GP-[0-9A-Z]{6}$'),
  CONSTRAINT demo_problem_reports_protocol_uniq UNIQUE (protocol),
  CONSTRAINT demo_problem_reports_details_len_chk
    CHECK (details IS NULL OR char_length(details) <= 1000),
  CONSTRAINT demo_problem_reports_occurrence_len_chk CHECK (char_length(occurrence_key) <= 200),
  CONSTRAINT demo_problem_reports_page_len_chk CHECK (page IS NULL OR char_length(page) <= 200),
  CONSTRAINT demo_problem_reports_email_status_chk
    CHECK (email_status IN ('pending', 'accepted', 'skipped', 'failed')),
  CONSTRAINT demo_problem_reports_occurrence_uniq
    UNIQUE (user_id, job_id, attempt_number, retry_count, occurrence_key)
);

CREATE INDEX IF NOT EXISTS demo_problem_reports_user_idx
  ON public.demo_problem_reports (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS demo_problem_reports_job_idx
  ON public.demo_problem_reports (job_id);

-- Players read their own reports; writes go only through the server (service role).
REVOKE ALL ON public.demo_problem_reports FROM anon, authenticated;
GRANT SELECT ON public.demo_problem_reports TO authenticated;
GRANT ALL ON public.demo_problem_reports TO service_role;
ALTER TABLE public.demo_problem_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS demo_problem_reports_owner_select ON public.demo_problem_reports;
CREATE POLICY demo_problem_reports_owner_select ON public.demo_problem_reports
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.touch_demo_problem_reports()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS demo_problem_reports_touch ON public.demo_problem_reports;
CREATE TRIGGER demo_problem_reports_touch
  BEFORE UPDATE ON public.demo_problem_reports
  FOR EACH ROW EXECUTE FUNCTION public.touch_demo_problem_reports();

REVOKE ALL ON FUNCTION public.touch_demo_problem_reports() FROM PUBLIC, anon, authenticated;

-- Atomic claim: ownership check, idempotency per occurrence, rate limit, unique protocol.
-- Returns {state, protocol, report_id, email_status}:
--   created       -> new row, email not yet attempted
--   existing      -> same occurrence already reported (idempotent; same protocol)
--   rate_limited  -> too many new reports by this player in the last hour
--   not_found     -> the job does not exist or does not belong to this player
CREATE OR REPLACE FUNCTION public.claim_demo_problem_report(
  _user_id uuid,
  _job_id uuid,
  _occurrence_key text,
  _category text,
  _error_code text,
  _stage text,
  _details text,
  _locale text,
  _page text,
  _app_version text,
  _max_per_hour integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job record;
  v_existing record;
  v_recent integer;
  v_protocol text;
  v_id uuid;
  v_alphabet constant text := '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_try integer := 0;
BEGIN
  IF _user_id IS NULL OR _job_id IS NULL OR coalesce(_occurrence_key, '') = '' THEN
    RETURN jsonb_build_object('state', 'not_found');
  END IF;

  SELECT j.id, j.user_id, j.attempt_number, j.retry_count, j.status, j.parser_revision
    INTO v_job
    FROM public.demo_jobs j
   WHERE j.id = _job_id;
  IF NOT FOUND OR v_job.user_id IS DISTINCT FROM _user_id THEN
    RETURN jsonb_build_object('state', 'not_found');
  END IF;

  -- Serialise claims of one player so the rate limit and idempotency cannot race.
  PERFORM pg_advisory_xact_lock(hashtextextended('demo_problem_report:' || _user_id::text, 0));

  SELECT r.id, r.protocol, r.email_status
    INTO v_existing
    FROM public.demo_problem_reports r
   WHERE r.user_id = _user_id
     AND r.job_id = _job_id
     AND r.attempt_number = v_job.attempt_number
     AND r.retry_count = v_job.retry_count
     AND r.occurrence_key = _occurrence_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'state', 'existing',
      'protocol', v_existing.protocol,
      'report_id', v_existing.id,
      'email_status', v_existing.email_status
    );
  END IF;

  SELECT count(*) INTO v_recent
    FROM public.demo_problem_reports r
   WHERE r.user_id = _user_id
     AND r.created_at > now() - interval '1 hour';
  IF v_recent >= greatest(1, coalesce(_max_per_hour, 5)) THEN
    RETURN jsonb_build_object('state', 'rate_limited');
  END IF;

  LOOP
    v_try := v_try + 1;
    v_protocol := 'GP-' || (
      SELECT string_agg(substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1), '')
        FROM generate_series(1, 6)
    );
    BEGIN
      INSERT INTO public.demo_problem_reports (
        protocol, user_id, job_id, attempt_number, retry_count, occurrence_key, category,
        error_code, stage, job_status, parser_revision, details, locale, page, app_version
      ) VALUES (
        v_protocol, _user_id, _job_id, v_job.attempt_number, v_job.retry_count,
        left(_occurrence_key, 200), left(coalesce(_category, 'unknown'), 64),
        left(_error_code, 64), left(_stage, 64), v_job.status, left(v_job.parser_revision, 80),
        nullif(left(_details, 1000), ''), left(coalesce(_locale, 'pt-BR'), 10),
        left(_page, 200), left(_app_version, 64)
      )
      RETURNING id INTO v_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_try >= 8 THEN
        RAISE;
      END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'state', 'created',
    'protocol', v_protocol,
    'report_id', v_id,
    'email_status', 'pending'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_demo_problem_report(
  uuid, uuid, text, text, text, text, text, text, text, text, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_demo_problem_report(
  uuid, uuid, text, text, text, text, text, text, text, text, integer
) TO service_role;
