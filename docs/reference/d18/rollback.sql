-- Rollback of 20261021130000_d18_identity_rerun_new_dispatch.sql (reference; NOT applied).
-- Restores requeue_demo_job_after_attachment to md5 cba3c797c3bd05b98941704bbd48c08d by the inverse fragment replacement.

BEGIN;

DO $d18_rollback$
DECLARE
  _target constant regprocedure := 'public.requeue_demo_job_after_attachment(uuid,uuid,jsonb)'::regprocedure;
  _old constant text[] := ARRAY[
$frag$  IF _upload_id IS NULL THEN RETURN false; END IF;

  -- D18: a re-run after an identity decision opens a NEW dispatch (see below). The
  -- dispatch number is bounded by demo_jobs_retry_count_check (<= 10): refuse explicitly
  -- instead of failing on the constraint.
  IF _attachment->>'state' = 'attached'
     AND (SELECT j.status <> 'pending' AND j.retry_count >= 10
            FROM public.demo_jobs j WHERE j.id = _job_id) THEN
    RAISE EXCEPTION 'IDENTITY_RERUN_LIMIT_REACHED' USING ERRCODE = '54000';
  END IF;
$frag$,
$frag$    -- D18: dispatch_demo_parse_message numbers a dispatch from retry_count, and the worker's
    -- execution id includes that number. Resetting it to 0 replayed the job's FINISHED
    -- execution (same execution id): the worker refused it and the job sat until the lease
    -- expired (~15 min, production job 921b55cf). An identity re-run of a job that is not
    -- pending is a NEW dispatch with the job's full retry budget; a job still pending keeps
    -- its queued message (no second message for the same job).
    retry_count = CASE WHEN _attachment->>'state' = 'attached' AND status <> 'pending'
                       THEN retry_count + 1 ELSE retry_count END,
    max_retries = CASE WHEN _attachment->>'state' = 'attached' AND status <> 'pending'
                       THEN LEAST(10, max_retries + retry_count + 1) ELSE max_retries END,
$frag$];
  _new constant text[] := ARRAY[
$frag$  IF _upload_id IS NULL THEN RETURN false; END IF;
$frag$,
$frag$    retry_count = CASE WHEN _attachment->>'state' = 'attached' THEN 0 ELSE retry_count END,
$frag$];
  _expected_before constant text := '48cb62f6c5a76379537bfc121c3fbe4f';
  _expected_after constant text := 'cba3c797c3bd05b98941704bbd48c08d';
  _definition text;
  _src text;
  _before jsonb;
  _after jsonb;
  _i integer;
BEGIN
  SELECT pg_catalog.md5(p.prosrc) INTO STRICT _src FROM pg_catalog.pg_proc p WHERE p.oid = _target;
  IF _src = _expected_after THEN
    RAISE NOTICE 'D18_ROLLBACK_ALREADY_AT_TARGET_STATE';
    RETURN;
  END IF;
  IF _src IS DISTINCT FROM _expected_before THEN
    RAISE EXCEPTION 'D18_ROLLBACK_UNEXPECTED_FUNCTION_STATE: md5=%', _src USING ERRCODE = '55000';
  END IF;
  SELECT pg_catalog.jsonb_build_object(
    'owner', pg_catalog.pg_get_userbyid(p.proowner), 'security_definer', p.prosecdef,
    'volatility', p.provolatile, 'strict', p.proisstrict, 'config', p.proconfig::text,
    'acl', p.proacl::text, 'language', l.lanname, 'return_type', pg_catalog.pg_get_function_result(p.oid),
    'arg_types', p.proargtypes::text, 'arg_names', p.proargnames::text)
    INTO STRICT _before
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid = p.prolang WHERE p.oid = _target;
  _definition := pg_catalog.pg_get_functiondef(_target);
  FOR _i IN 1 .. pg_catalog.array_length(_old, 1) LOOP
    IF (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _old[_i], '')))
       / pg_catalog.length(_old[_i]) <> 1 THEN
      RAISE EXCEPTION 'D18_ROLLBACK_FRAGMENT_NOT_UNIQUE: %', _i USING ERRCODE = '55000';
    END IF;
    _definition := pg_catalog.replace(_definition, _old[_i], _new[_i]);
  END LOOP;
  EXECUTE _definition;
  SELECT pg_catalog.md5(p.prosrc) INTO STRICT _src FROM pg_catalog.pg_proc p WHERE p.oid = _target;
  IF _src IS DISTINCT FROM _expected_after THEN
    RAISE EXCEPTION 'D18_ROLLBACK_POSTCONDITION_INVALID: md5=%', _src USING ERRCODE = '55000';
  END IF;
  SELECT pg_catalog.jsonb_build_object(
    'owner', pg_catalog.pg_get_userbyid(p.proowner), 'security_definer', p.prosecdef,
    'volatility', p.provolatile, 'strict', p.proisstrict, 'config', p.proconfig::text,
    'acl', p.proacl::text, 'language', l.lanname, 'return_type', pg_catalog.pg_get_function_result(p.oid),
    'arg_types', p.proargtypes::text, 'arg_names', p.proargnames::text)
    INTO STRICT _after
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid = p.prolang WHERE p.oid = _target;
  IF _before IS DISTINCT FROM _after THEN
    RAISE EXCEPTION 'D18_ROLLBACK_FUNCTION_PROPERTIES_CHANGED: before=% after=%', _before, _after USING ERRCODE = '55000';
  END IF;
  RAISE NOTICE 'D18_ROLLBACK_PATCHED: md5 % -> %', _expected_before, _src;
END;
$d18_rollback$;

COMMIT;
