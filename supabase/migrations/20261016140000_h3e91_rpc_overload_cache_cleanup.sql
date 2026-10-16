-- H3E91 RPC overload removal and PostgREST schema-cache refresh.
-- The legacy 17-argument overload is intentionally inaccessible to service_role.
-- Removing it avoids ambiguous RPC discovery and ensures only the attested 18-arg
-- contract remains callable by the application bridge.
BEGIN;

DO $preflight$
DECLARE
  _current regprocedure;
BEGIN
  _current := to_regprocedure(
    'public.h3e91_record_execution_event(uuid,uuid,text,uuid,uuid,uuid,integer,text,bigint,text,text,text,text,text,text,text,integer,text)'
  );
  IF _current IS NULL THEN
    RAISE EXCEPTION 'H3E91 overload cleanup blocked: canonical 18-argument writer missing';
  END IF;

  IF NOT has_function_privilege('service_role', _current, 'EXECUTE') THEN
    RAISE EXCEPTION 'H3E91 overload cleanup blocked: service_role cannot execute canonical writer';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.h3e91_execution_evidence_ledger'::regclass
      AND conname = 'h3e91_worker_build_commit_format'
  ) THEN
    RAISE EXCEPTION 'H3E91 overload cleanup blocked: worker build identity constraint missing';
  END IF;
END;
$preflight$;

-- This overload has already had EXECUTE revoked from service_role, anon,
-- authenticated and PUBLIC. Remove the obsolete signature rather than retain
-- two PostgREST-discoverable RPCs with the same name.
DROP FUNCTION IF EXISTS public.h3e91_record_execution_event(
  uuid, uuid, text, uuid, uuid, uuid, integer, text, bigint,
  text, text, text, text, text, text, text, integer
);

-- Force PostgREST to rebuild the function signature cache after the DDL.
NOTIFY pgrst, 'reload schema';

COMMIT;
