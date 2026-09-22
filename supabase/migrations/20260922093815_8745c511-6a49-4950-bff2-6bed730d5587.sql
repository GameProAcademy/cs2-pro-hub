CREATE OR REPLACE FUNCTION public.enforce_approved_attestation_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.workflow_identity IS NULL
     OR jsonb_typeof(NEW.workflow_identity) <> 'object'
     OR NEW.workflow_identity->>'workflow_path' <> '.github/workflows/parser-runtime-attestation.yml'
     OR NEW.workflow_identity->>'workflow_source_sha' <> '5039bff74550f02291fd066c7f10d781f6b86ebe'
  THEN
    RAISE EXCEPTION 'ATTESTATION_WORKFLOW_VERSION_NOT_APPROVED' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_approved_attestation_workflow() FROM PUBLIC, anon, authenticated, service_role, sandbox_exec;

CREATE TRIGGER parser_runtime_provenance_approved_workflow
BEFORE INSERT ON public.parser_runtime_provenance
FOR EACH ROW EXECUTE FUNCTION public.enforce_approved_attestation_workflow();

COMMENT ON FUNCTION public.enforce_approved_attestation_workflow() IS
  'Fail-closed persistence boundary for the repository-approved attestation workflow path and Git blob SHA; avoids commit self-reference.';