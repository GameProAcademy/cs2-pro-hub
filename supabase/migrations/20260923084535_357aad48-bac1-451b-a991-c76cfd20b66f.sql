DO $migration$
DECLARE
  _definition text;
BEGIN
  SELECT pg_get_functiondef('public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamp with time zone,text)'::regprocedure)
    INTO _definition;
  IF _definition IS NULL OR position('refs/heads/infra/cs2-parser-worker-v8' in _definition) = 0 THEN
    RAISE EXCEPTION 'R57_RECORDER_BASELINE_MISMATCH';
  END IF;
  _definition := replace(
    _definition,
    'GameProAcademy/cs2-pro-hub/.github/workflows/parser-runtime-attestation.yml@refs/heads/infra/cs2-parser-worker-v8',
    'GameProAcademy/cs2-pro-hub/.github/workflows/parser-runtime-attestation.yml@refs/heads/main'
  );
  EXECUTE _definition;

  SELECT pg_get_functiondef('public.assert_verified_parser_provenance(uuid)'::regprocedure)
    INTO _definition;
  IF _definition IS NULL OR position('refs/heads/infra/cs2-parser-worker-v8' in _definition) = 0 THEN
    RAISE EXCEPTION 'R57_PROVENANCE_ASSERT_BASELINE_MISMATCH';
  END IF;
  _definition := replace(
    _definition,
    'GameProAcademy/cs2-pro-hub/.github/workflows/parser-runtime-attestation.yml@refs/heads/infra/cs2-parser-worker-v8',
    'GameProAcademy/cs2-pro-hub/.github/workflows/parser-runtime-attestation.yml@refs/heads/main'
  );
  EXECUTE _definition;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.enforce_approved_attestation_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.workflow_identity IS NULL
     OR jsonb_typeof(NEW.workflow_identity) <> 'object'
     OR NEW.workflow_identity->>'repository' <> 'GameProAcademy/cs2-pro-hub'
     OR NEW.workflow_identity->>'ref_name' <> 'main'
     OR NEW.workflow_identity->>'workflow_ref' <> 'GameProAcademy/cs2-pro-hub/.github/workflows/parser-runtime-attestation.yml@refs/heads/main'
     OR NEW.workflow_identity->>'workflow_path' <> '.github/workflows/parser-runtime-attestation.yml'
     OR NEW.workflow_identity->>'workflow_source_sha' <> '13ce10e95a508e62d832bb9dc432e1496499676c'
     OR NEW.attestation_payload IS NULL
     OR jsonb_typeof(NEW.attestation_payload) <> 'object'
     OR NEW.release_gate_evidence IS DISTINCT FROM NEW.attestation_payload->'release_gate_evidence'
     OR NEW.attestation_payload->'attestor_source_identity'->>'repository' <> 'GameProAcademy/cs2-pro-hub'
     OR NEW.attestation_payload->'attestor_source_identity'->>'branch' <> 'main'
     OR NEW.attestation_payload->'attestor_source_identity'->>'workflow_sha' IS DISTINCT FROM NEW.workflow_identity->>'workflow_sha'
     OR NEW.attestation_payload->'attestor_source_identity'->>'workflow_path' <> '.github/workflows/parser-runtime-attestation.yml'
     OR NEW.attestation_payload->'attestor_source_identity'->>'workflow_source_sha' <> '13ce10e95a508e62d832bb9dc432e1496499676c'
  THEN
    RAISE EXCEPTION 'ATTESTATION_WORKFLOW_VERSION_NOT_APPROVED' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_approved_attestation_workflow() FROM PUBLIC, anon, authenticated, service_role, sandbox_exec;
REVOKE ALL ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text) TO service_role;
REVOKE ALL ON FUNCTION public.assert_verified_parser_provenance(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_verified_parser_provenance(uuid) TO service_role;

COMMENT ON FUNCTION public.enforce_approved_attestation_workflow() IS
  'R5.7 fail-closed persistence boundary: approved main workflow identity and signed release-gate evidence binding; frozen Railway runtime remains independent.';