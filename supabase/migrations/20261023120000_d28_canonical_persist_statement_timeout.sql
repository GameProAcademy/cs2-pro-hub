-- D28 (2026-10-23): the Canonical persistence RPC gets its own statement timeout.
--
-- Production evidence (Mirage attempt 7, job d0fc758c, parser 2aa2a497): all three dispatches
-- failed with CANONICAL_PERSISTENCE_ERROR "canceling statement due to statement timeout"
-- (demo_job_dispatch_failures, 09:15:15Z, 09:17:53Z, 09:20:35Z). The RPC runs through PostgREST
-- under the authenticator's statement_timeout of 8s. pg_stat_statements shows the SUCCESSFUL calls
-- of this RPC at mean 4.7s / max 7.0s (188k buffer blocks, 5.5k temp blocks for 4 calls): an
-- ordinary ~2 MB demo bundle already sits close to the limit, and the re-observation of an existing
-- match (delete + rewrite of ~4.3k events) crosses it. The function body itself, measured inside a
-- rolled-back transaction on the same data, takes ~1s (create) / ~0.8s (changed re-observation).
--
-- Change (forward-only, no row touched): a function-level statement_timeout of 60s on the RPC entry
-- point. PostgREST (v12+) hoists a function's statement_timeout into the request transaction, so
-- only this RPC gets the longer budget; every other role and function keeps its timeout. Function
-- body, owner, SECURITY DEFINER, search_path and grants are unchanged (asserted).
-- Rollback: ALTER FUNCTION public.persist_canonical_observation_attached(jsonb,uuid,uuid,uuid) RESET statement_timeout;

BEGIN;

DO $d28$
DECLARE _md5 text; _cfg text[];
BEGIN
  SELECT md5(p.prosrc), p.proconfig INTO STRICT _md5, _cfg FROM pg_proc p
   WHERE p.oid = 'public.persist_canonical_observation_attached(jsonb,uuid,uuid,uuid)'::regprocedure;
  IF _md5 IS DISTINCT FROM 'de9bfc8c606ad8f6cb043da1a9d85d11' THEN
    RAISE EXCEPTION 'D28_UNEXPECTED_FUNCTION_BODY: %', _md5 USING ERRCODE = '55000';
  END IF;
  IF NOT (_cfg = ARRAY['search_path=""'] OR _cfg = ARRAY['search_path=""', 'statement_timeout=60s']) THEN
    RAISE EXCEPTION 'D28_UNEXPECTED_FUNCTION_CONFIG: %', _cfg USING ERRCODE = '55000';
  END IF;
END $d28$;

ALTER FUNCTION public.persist_canonical_observation_attached(jsonb, uuid, uuid, uuid) SET statement_timeout = '60s';

DO $d28_post$
DECLARE _md5 text; _cfg text[]; _secdef boolean;
BEGIN
  SELECT md5(p.prosrc), p.proconfig, p.prosecdef INTO STRICT _md5, _cfg, _secdef FROM pg_proc p
   WHERE p.oid = 'public.persist_canonical_observation_attached(jsonb,uuid,uuid,uuid)'::regprocedure;
  IF _md5 IS DISTINCT FROM 'de9bfc8c606ad8f6cb043da1a9d85d11'
     OR _cfg IS DISTINCT FROM ARRAY['search_path=""', 'statement_timeout=60s']
     OR _secdef IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'D28_POSTCONDITION_INVALID: % %', _md5, _cfg USING ERRCODE = '55000';
  END IF;
END $d28_post$;

COMMIT;
