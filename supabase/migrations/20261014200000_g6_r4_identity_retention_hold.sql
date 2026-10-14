-- G.6-R4 — identity retention hold.
--
-- Policy (owner decision, 2026-10-14): a DEM whose player identity is not confirmed is
-- retained indefinitely. No deletion deadline is defined for it; one needs its own policy
-- decision. Until then public.evaluate_demo_deletion_gate refuses, with
-- IDENTITY_UNCONFIRMED_HOLD, every terminal job except a user cancellation unless
--   attachment_state = 'attached' AND attachment_confirmation_status IN ('user_confirmed','manual_selected').
-- 'cancelled' keeps its G.6 behaviour: the user withdrew the upload.
--
-- The hold sits after RETENTION_ACTIVE and before the RAW/Canonical checks, so it can only
-- turn an ELIGIBLE (or a later reason) into a refusal; it never makes a job eligible.
-- claim_demo_cleanup_job(s) call this gate, so batch and targeted cleanup both honour it.
--
-- Change mechanics: starts only from the reviewed definition (md5 of prosrc e90fa6c7…,
-- migration 20260921055555, identical in production on 2026-10-14) or the target (re-run =
-- no-op); substitutes one count-checked fragment; asserts the target md5; asserts
-- SECURITY DEFINER, STABLE, search_path='', owner and EXECUTE for service_role only,
-- before and after. Reads or writes no row. Cleanup execution stays disabled.
DO $g6r4$
DECLARE
  _fn constant regprocedure := 'public.evaluate_demo_deletion_gate(uuid)'::regprocedure;
  _start constant text := 'e90fa6c7f5987a3c16c02fdb75160bcc';
  _target constant text := '6eeda5bf93f9f7268c884b0f8c931efe';
  _old constant text := E'  ELSIF _job.retain_until > now() THEN _reason := ''RETENTION_ACTIVE'';\n  ELSIF _job.status = ''processed'' THEN';
  _new constant text := E'  ELSIF _job.retain_until > now() THEN _reason := ''RETENTION_ACTIVE'';\n'
    || E'  ELSIF _job.status <> ''cancelled'' AND NOT (_job.attachment_state = ''attached''\n'
    || E'        AND _job.attachment_confirmation_status IN (''user_confirmed'',''manual_selected'')) THEN\n'
    || E'    _reason := ''IDENTITY_UNCONFIRMED_HOLD'';\n'
    || E'  ELSIF _job.status = ''processed'' THEN';
  _md5 text;
  _def text;
  _check text;
BEGIN
  FOREACH _check IN ARRAY ARRAY['before', 'after'] LOOP
    IF _check = 'after' THEN
      SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _fn;
      IF _md5 = _target THEN
        RAISE NOTICE 'G6_R4_ALREADY_IN_TARGET_STATE';
      ELSIF _md5 = _start THEN
        _def := pg_catalog.pg_get_functiondef(_fn);
        IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, _old, ''))) <> pg_catalog.length(_old) THEN
          RAISE EXCEPTION 'G6_R4_FRAGMENT_COUNT_INVALID' USING ERRCODE = '55000';
        END IF;
        EXECUTE pg_catalog.replace(_def, _old, _new);
        SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _fn;
        IF _md5 IS DISTINCT FROM _target THEN
          RAISE EXCEPTION 'G6_R4_POSTCONDITION_INVALID: %', _md5 USING ERRCODE = '55000';
        END IF;
      ELSE
        RAISE EXCEPTION 'G6_R4_UNEXPECTED_DEFINITION: %', _md5 USING ERRCODE = '55000';
      END IF;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid = _fn AND p.prosecdef AND p.provolatile = 's'
                   AND p.proconfig = ARRAY['search_path=""']::text[]
                   AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres') THEN
      RAISE EXCEPTION 'G6_R4_PROPERTIES_INVALID (%)', _check USING ERRCODE = '55000';
    END IF;
    IF NOT pg_catalog.has_function_privilege('service_role', _fn, 'EXECUTE')
       OR pg_catalog.has_function_privilege('anon', _fn, 'EXECUTE')
       OR pg_catalog.has_function_privilege('authenticated', _fn, 'EXECUTE')
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p, pg_catalog.aclexplode(p.proacl) a
                  WHERE p.oid = _fn AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') THEN
      RAISE EXCEPTION 'G6_R4_GRANTS_INVALID (%)', _check USING ERRCODE = '55000';
    END IF;
  END LOOP;
END;
$g6r4$;

COMMENT ON FUNCTION public.evaluate_demo_deletion_gate(uuid) IS
  'G.6 deletion gate + G.6-R4 identity retention hold: a terminal non-cancelled DEM without confirmed identity is retained (IDENTITY_UNCONFIRMED_HOLD). Never makes a job eligible.';
