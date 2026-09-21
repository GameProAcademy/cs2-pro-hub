-- FASE 2.7.2G.6-R — fail-closed cleanup authority and legacy shutdown.

CREATE OR REPLACE FUNCTION public.get_demo_cleanup_authority()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'authority', 'G6_VERIFIED_DELETE_ONLY',
    'execution_enabled', false,
    'legacy_cleanup_disabled', true,
    'retention_policy_version', 'demo-retention-v1'
  );
$$;
REVOKE ALL ON FUNCTION public.get_demo_cleanup_authority() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_demo_cleanup_authority() TO service_role;

CREATE OR REPLACE FUNCTION public.guard_demo_retention_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _active boolean := NEW.status IN ('pending','processing','cancel_requested');
BEGIN
  IF TG_OP = 'UPDATE' AND _active AND OLD.status IN ('processed','failed','blocked_raw_audit','cancelled') THEN
    IF OLD.storage_delete_verified_at IS NOT NULL THEN
      RAISE EXCEPTION 'DEMO_EXPIRED' USING ERRCODE = '55000';
    END IF;
    IF OLD.cleanup_claim_token IS NOT NULL AND OLD.cleanup_claim_expires_at > now() THEN
      RAISE EXCEPTION 'DEMO_CLEANUP_IN_PROGRESS' USING ERRCODE = '55000';
    END IF;
  END IF;

  IF _active THEN
    NEW.retain_until := NULL;
    NEW.retention_policy_version := NULL;
    NEW.cleanup_claim_token := NULL;
    NEW.cleanup_claimed_at := NULL;
    NEW.cleanup_claim_expires_at := NULL;
    NEW.deletion_reason := NULL;
    IF NEW.storage_delete_verified_at IS NULL AND NEW.storage_deleted_at IS NULL THEN
      NEW.cleanup_error := NULL;
    END IF;
  ELSIF NEW.status = 'processed' THEN
    NEW.finished_at := COALESCE(NEW.finished_at, now());
    NEW.retain_until := NEW.finished_at + interval '24 hours';
    NEW.retention_policy_version := 'demo-retention-v1';
  ELSIF NEW.status IN ('failed','blocked_raw_audit') THEN
    NEW.finished_at := COALESCE(NEW.finished_at, now());
    NEW.retain_until := NEW.finished_at + interval '72 hours';
    NEW.retention_policy_version := 'demo-retention-v1';
  ELSIF NEW.status = 'cancelled' THEN
    NEW.finished_at := COALESCE(NEW.finished_at, now());
    NEW.retain_until := NEW.finished_at;
    NEW.retention_policy_version := 'demo-retention-v1';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_demo_retention_lifecycle() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fail_demo_cleanup(
  _job_id uuid,
  _claim_token uuid,
  _error_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF _error_code NOT IN ('DELETE_FAILED','DELETE_NOT_VERIFIED','DELETE_VERIFICATION_FAILED','PATH_OWNERSHIP_MISMATCH') THEN
    RAISE EXCEPTION 'INVALID_CLEANUP_ERROR' USING ERRCODE = '22023';
  END IF;
  UPDATE public.demo_jobs SET
    storage_delete_verified_at = NULL,
    cleanup_error = CASE
      WHEN storage_deleted_at IS NOT NULL THEN 'DELETION_METADATA_MISMATCH'
      ELSE _error_code
    END,
    deletion_reason = CASE
      WHEN storage_deleted_at IS NOT NULL THEN 'metadata_mismatch'
      ELSE deletion_reason
    END,
    cleanup_claim_token = NULL,
    cleanup_claimed_at = NULL,
    cleanup_claim_expires_at = NULL,
    updated_at = now()
  WHERE id = _job_id AND cleanup_claim_token = _claim_token;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.fail_demo_cleanup(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_demo_cleanup(uuid, uuid, text) TO service_role;

COMMENT ON FUNCTION public.get_demo_cleanup_authority() IS 'G.6-R single-authority marker. Physical cleanup is fail-closed until a separately approved operational gate enables it.';
COMMENT ON FUNCTION public.fail_demo_cleanup(uuid, uuid, text) IS 'Releases a failed G.6 claim while preserving legacy deletion metadata mismatches for forensic audit.';