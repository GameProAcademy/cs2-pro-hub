-- D21 (2026-10-21): a retried dispatch failure leaves a durable record.
--
-- Production evidence (job 921b55cf): dispatch 4 parsed successfully at 16:49:51Z (worker
-- ledger PARSE_SUCCEEDED), its completion then failed and the job was re-dispatched at
-- 16:51:30Z (pgmq message 55 archived, message 56 sent). fail_demo_parse_message stores the
-- error only on the job row; the successful dispatch 5 cleared it. The cause of the
-- dispatch-4 failure is therefore unrecoverable from the database - a forensic gap.
--
-- Change (forward-only):
--   * public.demo_job_dispatch_failures: one row per failed dispatch (job, upload, dispatch,
--     message, error code and bounded message, permanent, retried, time); RLS on; the job's
--     owner (and staff) may SELECT their own rows; no client role may write; anon nothing;
--   * fail_demo_parse_message records the row before updating the job (exact fragment
--     replacement, md5-guarded both ways, properties asserted unchanged).
-- Function md5: b6ae590f1cf5bf745eb96056cebda280 -> 0eb6687c23b84f72dae0bb4fe3b5d924. Rollback: docs/reference/d21/rollback.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS public.demo_job_dispatch_failures (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.demo_jobs(id) ON DELETE CASCADE,
  upload_id uuid NOT NULL,
  dispatch_attempt integer NOT NULL,
  queue_message_id bigint,
  error_code text NOT NULL,
  error_message text,
  permanent boolean NOT NULL,
  retried boolean NOT NULL,
  failed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT demo_job_dispatch_failures_job_dispatch_key UNIQUE (job_id, dispatch_attempt),
  CONSTRAINT demo_job_dispatch_failures_error_code_len CHECK (char_length(error_code) <= 80),
  CONSTRAINT demo_job_dispatch_failures_error_message_len CHECK (error_message IS NULL OR char_length(error_message) <= 500)
);
COMMENT ON TABLE public.demo_job_dispatch_failures IS
  'D21: one row per failed demo-parse dispatch; written only by fail_demo_parse_message.';

ALTER TABLE public.demo_job_dispatch_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.demo_job_dispatch_failures FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.demo_job_dispatch_failures TO authenticated, service_role;

DROP POLICY IF EXISTS demo_job_dispatch_failures_select_own ON public.demo_job_dispatch_failures;
CREATE POLICY demo_job_dispatch_failures_select_own
  ON public.demo_job_dispatch_failures FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.demo_jobs j WHERE j.id = job_id AND j.user_id = auth.uid())
    OR public.is_staff(auth.uid())
  );

DO $d21$
DECLARE
  _target constant regprocedure := 'public.fail_demo_parse_message(uuid,bigint,integer,text,text,text,boolean)'::regprocedure;
  _old constant text := $frag$  PERFORM pgmq.archive('demo_parse', _message_id);

  UPDATE public.demo_jobs SET
    status = _next_status,$frag$;
  _new constant text := $frag$  PERFORM pgmq.archive('demo_parse', _message_id);

  -- D21: every failed dispatch leaves a durable record. The job row keeps only the LAST
  -- error and a later success clears it, so a retried failure was otherwise lost
  -- (production job 921b55cf, dispatch 4, 2026-10-21 16:49-16:51Z).
  INSERT INTO public.demo_job_dispatch_failures (
    job_id, upload_id, dispatch_attempt, queue_message_id, error_code, error_message,
    permanent, retried
  ) VALUES (
    _job.id, _job.upload_id, _job.dispatch_attempt, _message_id,
    left(COALESCE(NULLIF(_error_code, ''), 'PARSER_ERROR'), 80),
    left(NULLIF(_error_message, ''), 500),
    COALESCE(_permanent, false), _retry
  )
  ON CONFLICT (job_id, dispatch_attempt) DO NOTHING;

  UPDATE public.demo_jobs SET
    status = _next_status,$frag$;
  _expected_before constant text := 'b6ae590f1cf5bf745eb96056cebda280';
  _expected_after constant text := '0eb6687c23b84f72dae0bb4fe3b5d924';
  _definition text;
  _src text;
  _before jsonb;
  _after jsonb;
BEGIN
  SELECT pg_catalog.md5(p.prosrc) INTO STRICT _src FROM pg_catalog.pg_proc p WHERE p.oid = _target;
  IF _src = _expected_after THEN
    RAISE NOTICE 'D21_ALREADY_AT_TARGET_STATE';
    RETURN;
  END IF;
  IF _src IS DISTINCT FROM _expected_before THEN
    RAISE EXCEPTION 'D21_UNEXPECTED_FUNCTION_STATE: md5=%', _src USING ERRCODE = '55000';
  END IF;
  SELECT pg_catalog.jsonb_build_object(
    'owner', pg_catalog.pg_get_userbyid(p.proowner), 'security_definer', p.prosecdef,
    'volatility', p.provolatile, 'strict', p.proisstrict, 'config', p.proconfig::text,
    'acl', p.proacl::text, 'language', l.lanname, 'return_type', pg_catalog.pg_get_function_result(p.oid),
    'arg_types', p.proargtypes::text, 'arg_names', p.proargnames::text)
    INTO STRICT _before
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid = p.prolang WHERE p.oid = _target;
  _definition := pg_catalog.pg_get_functiondef(_target);
  IF (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _old, '')))
     / pg_catalog.length(_old) <> 1 THEN
    RAISE EXCEPTION 'D21_FRAGMENT_NOT_UNIQUE' USING ERRCODE = '55000';
  END IF;
  EXECUTE pg_catalog.replace(_definition, _old, _new);
  SELECT pg_catalog.md5(p.prosrc) INTO STRICT _src FROM pg_catalog.pg_proc p WHERE p.oid = _target;
  IF _src IS DISTINCT FROM _expected_after THEN
    RAISE EXCEPTION 'D21_POSTCONDITION_INVALID: md5=%', _src USING ERRCODE = '55000';
  END IF;
  SELECT pg_catalog.jsonb_build_object(
    'owner', pg_catalog.pg_get_userbyid(p.proowner), 'security_definer', p.prosecdef,
    'volatility', p.provolatile, 'strict', p.proisstrict, 'config', p.proconfig::text,
    'acl', p.proacl::text, 'language', l.lanname, 'return_type', pg_catalog.pg_get_function_result(p.oid),
    'arg_types', p.proargtypes::text, 'arg_names', p.proargnames::text)
    INTO STRICT _after
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid = p.prolang WHERE p.oid = _target;
  IF _before IS DISTINCT FROM _after THEN
    RAISE EXCEPTION 'D21_FUNCTION_PROPERTIES_CHANGED: before=% after=%', _before, _after USING ERRCODE = '55000';
  END IF;
  RAISE NOTICE 'D21_PATCHED: md5 % -> %', _expected_before, _src;
END;
$d21$;

COMMIT;
