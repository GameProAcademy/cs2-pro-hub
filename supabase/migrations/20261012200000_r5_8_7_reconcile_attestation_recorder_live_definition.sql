-- R5.8.7 — Version the managed database's attestation recorder.
--
-- The managed database's public.record_parser_runtime_attestation expects the
-- critical blob of services/cs2-demo-parser/worker.py to be
-- 50a53b607d26f00b4de05c5e8998611959e27bd1 (the blob deployed by 91aeee8 and
-- required by the application since a9a2e9ea). Every database built from the
-- repository migrations expected dfc2e67fcb3644be91108079f9096947c16119b3. The
-- managed definition was changed outside the migration history. This migration
-- records that definition, which the owner chose as authoritative (decision D1,
-- docs/H3E_RELEASE_IDENTITY_TRACEABILITY.md).
--
-- Exactly two starting states are accepted, identified by md5(prosrc):
--   fe3250af2b461f03f459adf36b43ec21  the managed definition: nothing changes;
--   5ea1ffff4fc874ca50f0081b9c9a5e71  a repository build: the one blob is
--                                     substituted and the result must hash to
--                                     fe3250af2b461f03f459adf36b43ec21.
-- Anything else fails closed and changes nothing.
--
-- Signature, result, language, owner, SECURITY DEFINER, search_path, volatility,
-- EXECUTE grants and the comment are asserted before and after.
-- parser_runtime_provenance_deployment_identity_idx is not touched (decision D3).
-- No table data, provenance row, nonce, grant, Attempt 9, Canonical state,
-- secret or Railway resource is read or written.
DO $migration$
DECLARE
  _fn constant regprocedure :=
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure;
  _managed_md5 constant text := 'fe3250af2b461f03f459adf36b43ec21';
  _repository_md5 constant text := '5ea1ffff4fc874ca50f0081b9c9a5e71';
  _repository_worker_blob constant text := 'dfc2e67fcb3644be91108079f9096947c16119b3';
  _managed_worker_blob constant text := '50a53b607d26f00b4de05c5e8998611959e27bd1';
  _comment constant text :=
    'R5.8.5 reconciled recorder: current Railway deployment 1b5778de-3eaf-46f1-9ea5-cba381d95313, '
    'source commit 91aeee853200d0f461d0d36af1781d7fdfa40941, approved workflow blob '
    '3070d8bae6c3f02093bbb2595138c913646c2e31.';
  _md5 text;
  _definition text;
  _step text;
BEGIN
  FOREACH _step IN ARRAY ARRAY['before', 'after'] LOOP
    IF _step = 'after' THEN
      SELECT md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _fn;
      IF _md5 = _managed_md5 THEN
        RAISE NOTICE 'R5_8_7_RECORDER_ALREADY_MANAGED_DEFINITION';
      ELSIF _md5 = _repository_md5 THEN
        _definition := pg_catalog.pg_get_functiondef(_fn);
        IF (pg_catalog.length(_definition)
            - pg_catalog.length(pg_catalog.replace(_definition, _repository_worker_blob, '')))
           <> pg_catalog.length(_repository_worker_blob)
           OR pg_catalog.strpos(_definition, _managed_worker_blob) <> 0
        THEN
          RAISE EXCEPTION 'R5_8_7_RECORDER_SUBSTITUTION_PRECONDITION_INVALID' USING ERRCODE = '55000';
        END IF;
        EXECUTE pg_catalog.replace(_definition, _repository_worker_blob, _managed_worker_blob);
        SELECT md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _fn;
        IF _md5 IS DISTINCT FROM _managed_md5 THEN
          RAISE EXCEPTION 'R5_8_7_RECORDER_POSTCONDITION_INVALID: %', _md5 USING ERRCODE = '55000';
        END IF;
      ELSE
        RAISE EXCEPTION 'R5_8_7_RECORDER_UNEXPECTED_DEFINITION: %', _md5 USING ERRCODE = '55000';
      END IF;
    END IF;

    -- Properties that must hold in both the starting and the final state.
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_language l ON l.oid = p.prolang
      WHERE p.oid = _fn
        AND pg_catalog.pg_get_function_identity_arguments(p.oid) =
            '_canonical_payload text, _payload jsonb, _attestation_digest text, _signature text, '
            '_release_gate_evidence jsonb, _attested_at timestamp with time zone, _nonce text'
        AND pg_catalog.pg_get_function_result(p.oid) = 'uuid'
        AND l.lanname = 'plpgsql'
        AND p.prokind = 'f'
        AND p.prosecdef
        AND p.provolatile = 'v'
        AND NOT p.proisstrict
        AND p.proconfig = ARRAY['search_path=""']::text[]
        AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
    ) THEN
      RAISE EXCEPTION 'R5_8_7_RECORDER_PROPERTIES_INVALID (%)', _step USING ERRCODE = '55000';
    END IF;

    IF NOT pg_catalog.has_function_privilege('service_role', _fn, 'EXECUTE')
       OR pg_catalog.has_function_privilege('anon', _fn, 'EXECUTE')
       OR pg_catalog.has_function_privilege('authenticated', _fn, 'EXECUTE')
       OR pg_catalog.has_function_privilege('sandbox_exec', _fn, 'EXECUTE')
       OR EXISTS (
         SELECT 1
         FROM pg_catalog.pg_proc p, pg_catalog.aclexplode(p.proacl) a
         WHERE p.oid = _fn AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
       )
    THEN
      RAISE EXCEPTION 'R5_8_7_RECORDER_GRANTS_INVALID (%)', _step USING ERRCODE = '55000';
    END IF;

    IF pg_catalog.obj_description(_fn, 'pg_proc') IS DISTINCT FROM _comment THEN
      RAISE EXCEPTION 'R5_8_7_RECORDER_COMMENT_INVALID (%)', _step USING ERRCODE = '55000';
    END IF;
  END LOOP;
END;
$migration$;
