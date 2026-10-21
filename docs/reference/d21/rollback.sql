-- Rollback of 20261021170000_d21_dispatch_failure_history.sql (reference; NOT applied).
-- Restores fail_demo_parse_message to md5 b6ae590f1cf5bf745eb96056cebda280. The demo_job_dispatch_failures table and its
-- rows are kept (evidence is never deleted to roll back code).

BEGIN;

DO $d21_rollback$
DECLARE
  _target constant regprocedure := 'public.fail_demo_parse_message(uuid,bigint,integer,text,text,text,boolean)'::regprocedure;
  _old constant text := $frag$  PERFORM pgmq.archive('demo_parse', _message_id);

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
  _new constant text := $frag$  PERFORM pgmq.archive('demo_parse', _message_id);

  UPDATE public.demo_jobs SET
    status = _next_status,$frag$;
  _expected_before constant text := '0eb6687c23b84f72dae0bb4fe3b5d924';
  _expected_after constant text := 'b6ae590f1cf5bf745eb96056cebda280';
  _definition text;
  _src text;
  _before jsonb;
  _after jsonb;
BEGIN
  SELECT pg_catalog.md5(p.prosrc) INTO STRICT _src FROM pg_catalog.pg_proc p WHERE p.oid = _target;
  IF _src = _expected_after THEN
    RAISE NOTICE 'D21_ROLLBACK_ALREADY_AT_TARGET_STATE';
    RETURN;
  END IF;
  IF _src IS DISTINCT FROM _expected_before THEN
    RAISE EXCEPTION 'D21_ROLLBACK_UNEXPECTED_FUNCTION_STATE: md5=%', _src USING ERRCODE = '55000';
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
    RAISE EXCEPTION 'D21_ROLLBACK_FRAGMENT_NOT_UNIQUE' USING ERRCODE = '55000';
  END IF;
  EXECUTE pg_catalog.replace(_definition, _old, _new);
  SELECT pg_catalog.md5(p.prosrc) INTO STRICT _src FROM pg_catalog.pg_proc p WHERE p.oid = _target;
  IF _src IS DISTINCT FROM _expected_after THEN
    RAISE EXCEPTION 'D21_ROLLBACK_POSTCONDITION_INVALID: md5=%', _src USING ERRCODE = '55000';
  END IF;
  SELECT pg_catalog.jsonb_build_object(
    'owner', pg_catalog.pg_get_userbyid(p.proowner), 'security_definer', p.prosecdef,
    'volatility', p.provolatile, 'strict', p.proisstrict, 'config', p.proconfig::text,
    'acl', p.proacl::text, 'language', l.lanname, 'return_type', pg_catalog.pg_get_function_result(p.oid),
    'arg_types', p.proargtypes::text, 'arg_names', p.proargnames::text)
    INTO STRICT _after
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid = p.prolang WHERE p.oid = _target;
  IF _before IS DISTINCT FROM _after THEN
    RAISE EXCEPTION 'D21_ROLLBACK_FUNCTION_PROPERTIES_CHANGED: before=% after=%', _before, _after USING ERRCODE = '55000';
  END IF;
  RAISE NOTICE 'D21_ROLLBACK_PATCHED: md5 % -> %', _expected_before, _src;
END;
$d21_rollback$;

COMMIT;
