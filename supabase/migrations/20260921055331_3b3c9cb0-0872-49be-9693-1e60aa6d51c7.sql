-- FASE 2.7.2G.6 — DEM retention, verified physical deletion and lifecycle safety gate.

ALTER TABLE public.demo_jobs
  ADD COLUMN IF NOT EXISTS storage_delete_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS storage_delete_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS cleanup_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_cleanup_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS retention_policy_version text,
  ADD COLUMN IF NOT EXISTS deletion_reason text,
  ADD COLUMN IF NOT EXISTS cleanup_claim_token uuid,
  ADD COLUMN IF NOT EXISTS cleanup_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cleanup_claim_expires_at timestamptz;

ALTER TABLE public.demo_jobs DROP CONSTRAINT IF EXISTS demo_jobs_cleanup_attempt_count_check;
ALTER TABLE public.demo_jobs ADD CONSTRAINT demo_jobs_cleanup_attempt_count_check
  CHECK (cleanup_attempt_count >= 0);
ALTER TABLE public.demo_jobs DROP CONSTRAINT IF EXISTS demo_jobs_retention_policy_version_check;
ALTER TABLE public.demo_jobs ADD CONSTRAINT demo_jobs_retention_policy_version_check
  CHECK (retention_policy_version IS NULL OR retention_policy_version = 'demo-retention-v1');
ALTER TABLE public.demo_jobs DROP CONSTRAINT IF EXISTS demo_jobs_deletion_reason_check;
ALTER TABLE public.demo_jobs ADD CONSTRAINT demo_jobs_deletion_reason_check
  CHECK (deletion_reason IS NULL OR deletion_reason IN ('retention_expired','cancelled','already_absent','metadata_mismatch'));

DROP INDEX IF EXISTS public.demo_jobs_cleanup_idx;
CREATE INDEX demo_jobs_cleanup_idx ON public.demo_jobs (retain_until, cleanup_claim_expires_at)
  WHERE storage_delete_verified_at IS NULL AND status IN ('processed','failed','blocked_raw_audit','cancelled');

CREATE OR REPLACE FUNCTION public.guard_demo_retention_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _terminal boolean := NEW.status IN ('processed','failed','blocked_raw_audit','cancelled');
  _active boolean := NEW.status IN ('pending','processing','cancel_requested');
BEGIN
  IF TG_OP = 'UPDATE' AND _active AND OLD.status IN ('processed','failed','blocked_raw_audit','cancelled') THEN
    IF OLD.storage_delete_verified_at IS NOT NULL OR OLD.storage_deleted_at IS NOT NULL THEN
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

DROP TRIGGER IF EXISTS demo_jobs_retention_lifecycle ON public.demo_jobs;
CREATE TRIGGER demo_jobs_retention_lifecycle
BEFORE INSERT OR UPDATE OF status, finished_at, retain_until, storage_deleted_at, storage_delete_verified_at,
  cleanup_claim_token, cleanup_claim_expires_at
ON public.demo_jobs
FOR EACH ROW EXECUTE FUNCTION public.guard_demo_retention_lifecycle();

CREATE OR REPLACE FUNCTION public.evaluate_demo_deletion_gate(_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _job public.demo_jobs%ROWTYPE;
  _upload public.uploads%ROWTYPE;
  _expected_path text;
  _raw_ready boolean := false;
  _canonical_ready boolean := false;
  _reason text := 'ELIGIBLE';
BEGIN
  SELECT * INTO _job FROM public.demo_jobs WHERE id = _job_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('eligible', false, 'reason', 'JOB_NOT_FOUND'); END IF;
  SELECT * INTO _upload FROM public.uploads WHERE id = _job.upload_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('eligible', false, 'reason', 'UPLOAD_NOT_FOUND'); END IF;
  _expected_path := _job.user_id::text || '/' || _job.upload_id::text || '.dem';

  IF _job.storage_path IS NULL OR _upload.storage_path IS NULL THEN _reason := 'STORAGE_PATH_MISSING';
  ELSIF _job.storage_path <> _expected_path OR _upload.storage_path <> _expected_path OR _upload.user_id <> _job.user_id THEN _reason := 'PATH_OWNERSHIP_MISMATCH';
  ELSIF _job.storage_delete_verified_at IS NOT NULL THEN _reason := 'ALREADY_VERIFIED';
  ELSIF _job.status NOT IN ('processed','failed','blocked_raw_audit','cancelled') THEN _reason := 'JOB_NOT_TERMINAL';
  ELSIF _job.worker_id IS NOT NULL OR (_job.lease_expires_at IS NOT NULL AND _job.lease_expires_at > now()) THEN _reason := 'ACTIVE_WORKER_OR_LEASE';
  ELSIF _job.cleanup_claim_token IS NOT NULL AND _job.cleanup_claim_expires_at > now() THEN _reason := 'CLEANUP_ALREADY_CLAIMED';
  ELSIF _job.retain_until IS NULL THEN _reason := 'RETENTION_MISSING';
  ELSIF _job.retain_until > now() THEN _reason := 'RETENTION_ACTIVE';
  ELSIF _job.status = 'processed' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.raw_demo_evidence_reports r
      WHERE r.job_id = _job.id AND r.approved_for_canonical = true AND r.raw_audit_status = 'APPROVED'
    ) OR EXISTS (
      SELECT 1 FROM public.raw_evidence_artifacts a
      WHERE a.job_id = _job.id AND a.upload_id = _job.upload_id
        AND a.status = 'ready' AND a.raw_status = 'ready' AND a.audit_status = 'approved' AND a.root_digest IS NOT NULL
    ) INTO _raw_ready;
    SELECT EXISTS (
      SELECT 1 FROM public.match_sources ms
      WHERE ms.upload_id = _job.upload_id AND ms.source = 'demo' AND ms.match_id = _job.match_id
    ) INTO _canonical_ready;
    IF NOT _raw_ready THEN _reason := 'RAW_ADMISSION_INCOMPLETE';
    ELSIF _job.match_id IS NULL OR NOT _canonical_ready THEN _reason := 'CANONICAL_PERSISTENCE_INCOMPLETE';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'eligible', _reason = 'ELIGIBLE',
    'reason', _reason,
    'job_id', _job.id,
    'upload_id', _job.upload_id,
    'storage_path', _job.storage_path,
    'metadata_mismatch', _job.storage_deleted_at IS NOT NULL AND _job.storage_delete_verified_at IS NULL
  );
END;
$$;
REVOKE ALL ON FUNCTION public.evaluate_demo_deletion_gate(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_demo_deletion_gate(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_demo_cleanup_jobs(
  _limit integer DEFAULT 25,
  _claim_seconds integer DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _candidate record;
  _gate jsonb;
  _token uuid;
  _items jsonb := '[]'::jsonb;
  _claimed integer := 0;
BEGIN
  FOR _candidate IN
    SELECT j.id
    FROM public.demo_jobs j
    WHERE j.status IN ('processed','failed','blocked_raw_audit','cancelled')
      AND j.storage_delete_verified_at IS NULL
      AND j.retain_until IS NOT NULL
      AND j.retain_until <= now()
      AND (j.cleanup_claim_token IS NULL OR j.cleanup_claim_expires_at <= now())
    ORDER BY j.retain_until, j.id
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(_limit, 25), 1), 100)
  LOOP
    _gate := public.evaluate_demo_deletion_gate(_candidate.id);
    IF COALESCE((_gate->>'eligible')::boolean, false) THEN
      _token := gen_random_uuid();
      UPDATE public.demo_jobs SET
        cleanup_claim_token = _token,
        cleanup_claimed_at = now(),
        cleanup_claim_expires_at = now() + make_interval(secs => LEAST(GREATEST(COALESCE(_claim_seconds, 300), 60), 900)),
        storage_delete_attempted_at = now(),
        last_cleanup_attempt_at = now(),
        cleanup_attempt_count = cleanup_attempt_count + 1,
        deletion_reason = CASE WHEN storage_deleted_at IS NOT NULL THEN 'metadata_mismatch' WHEN status = 'cancelled' THEN 'cancelled' ELSE 'retention_expired' END,
        cleanup_error = CASE WHEN storage_deleted_at IS NOT NULL THEN 'DELETION_METADATA_MISMATCH' ELSE NULL END,
        updated_at = now()
      WHERE id = _candidate.id
        AND storage_delete_verified_at IS NULL
        AND (cleanup_claim_token IS NULL OR cleanup_claim_expires_at <= now());
      IF FOUND THEN
        _items := _items || jsonb_build_array(jsonb_build_object(
          'job_id', _gate->>'job_id', 'upload_id', _gate->>'upload_id',
          'storage_path', _gate->>'storage_path', 'claim_token', _token,
          'metadata_mismatch', COALESCE((_gate->>'metadata_mismatch')::boolean, false)
        ));
        _claimed := _claimed + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('claimed', _claimed, 'items', _items);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_demo_cleanup_jobs(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_demo_cleanup_jobs(integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_demo_cleanup_verified(
  _job_id uuid,
  _claim_token uuid,
  _outcome text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE _job public.demo_jobs%ROWTYPE;
BEGIN
  IF _outcome NOT IN ('DELETE_VERIFIED','ALREADY_ABSENT') THEN
    RAISE EXCEPTION 'INVALID_CLEANUP_OUTCOME' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _job FROM public.demo_jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND OR _job.cleanup_claim_token IS DISTINCT FROM _claim_token OR _job.cleanup_claim_expires_at <= now() THEN
    RETURN false;
  END IF;
  IF _job.status NOT IN ('processed','failed','blocked_raw_audit','cancelled') OR _job.worker_id IS NOT NULL OR (_job.lease_expires_at IS NOT NULL AND _job.lease_expires_at > now()) THEN
    RETURN false;
  END IF;
  UPDATE public.demo_jobs SET
    storage_deleted_at = now(), storage_delete_verified_at = now(),
    deletion_reason = CASE WHEN _outcome = 'ALREADY_ABSENT' THEN 'already_absent' ELSE deletion_reason END,
    cleanup_error = NULL, cleanup_claim_token = NULL, cleanup_claimed_at = NULL,
    cleanup_claim_expires_at = NULL, updated_at = now()
  WHERE id = _job_id AND cleanup_claim_token = _claim_token;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_demo_cleanup_verified(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_demo_cleanup_verified(uuid, uuid, text) TO service_role;

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
    storage_deleted_at = NULL, storage_delete_verified_at = NULL,
    cleanup_error = _error_code, cleanup_claim_token = NULL,
    cleanup_claimed_at = NULL, cleanup_claim_expires_at = NULL, updated_at = now()
  WHERE id = _job_id AND cleanup_claim_token = _claim_token;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.fail_demo_cleanup(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_demo_cleanup(uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_demo_retention_metrics()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'total_demo_jobs', count(*),
    'active_demos', count(*) FILTER (WHERE status IN ('pending','processing','cancel_requested')),
    'terminal_demos', count(*) FILTER (WHERE status IN ('processed','failed','blocked_raw_audit','cancelled')),
    'retained_demos', count(*) FILTER (WHERE retain_until > now() AND storage_delete_verified_at IS NULL),
    'expired_demos', count(*) FILTER (WHERE retain_until <= now() AND storage_delete_verified_at IS NULL),
    'deletion_eligible', count(*) FILTER (WHERE status IN ('processed','failed','blocked_raw_audit','cancelled') AND retain_until <= now() AND storage_delete_verified_at IS NULL AND worker_id IS NULL),
    'deletion_attempts', COALESCE(sum(cleanup_attempt_count),0),
    'deletion_verified', count(*) FILTER (WHERE storage_delete_verified_at IS NOT NULL),
    'deletion_failed', count(*) FILTER (WHERE cleanup_error IN ('DELETE_FAILED','DELETE_NOT_VERIFIED','DELETE_VERIFICATION_FAILED')),
    'deletion_metadata_mismatch', count(*) FILTER (WHERE cleanup_error = 'DELETION_METADATA_MISMATCH'),
    'total_bytes_retained', COALESCE(sum(file_size) FILTER (WHERE storage_delete_verified_at IS NULL),0),
    'total_bytes_eligible', COALESCE(sum(file_size) FILTER (WHERE status IN ('processed','failed','blocked_raw_audit','cancelled') AND retain_until <= now() AND storage_delete_verified_at IS NULL),0),
    'total_bytes_deleted', COALESCE(sum(file_size) FILTER (WHERE storage_delete_verified_at IS NOT NULL),0),
    'average_retention_seconds', COALESCE(avg(extract(epoch FROM (retain_until - finished_at))) FILTER (WHERE finished_at IS NOT NULL AND retain_until IS NOT NULL),0)
  ) FROM public.demo_jobs;
$$;
REVOKE ALL ON FUNCTION public.get_demo_retention_metrics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_demo_retention_metrics() TO service_role;

CREATE OR REPLACE FUNCTION public.get_demo_orphan_report(_older_than_hours integer DEFAULT 72)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH orphan AS (
    SELECT o.name, COALESCE((o.metadata->>'size')::bigint,0) AS bytes,
      o.created_at < now() - make_interval(hours => GREATEST(COALESCE(_older_than_hours,72),72)) AS eligible
    FROM storage.objects o
    WHERE o.bucket_id = 'demos'
      AND NOT EXISTS (SELECT 1 FROM public.demo_jobs j WHERE j.storage_path = o.name)
      AND NOT EXISTS (SELECT 1 FROM public.uploads u WHERE u.storage_path = o.name)
  )
  SELECT jsonb_build_object(
    'orphan_count', count(*), 'orphan_bytes', COALESCE(sum(bytes),0),
    'eligible_orphan_count', count(*) FILTER (WHERE eligible),
    'eligible_orphan_bytes', COALESCE(sum(bytes) FILTER (WHERE eligible),0),
    'skipped_orphan_count', count(*) FILTER (WHERE NOT eligible),
    'skipped_reasons', CASE WHEN count(*) FILTER (WHERE NOT eligible) > 0 THEN jsonb_build_array('CONSERVATIVE_RETENTION_ACTIVE') ELSE '[]'::jsonb END
  ) FROM orphan;
$$;
REVOKE ALL ON FUNCTION public.get_demo_orphan_report(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_demo_orphan_report(integer) TO service_role;

-- Preserve rows and derive missing terminal retention from their historical terminal timestamp.
UPDATE public.demo_jobs
SET retain_until = COALESCE(finished_at, updated_at, created_at) + interval '72 hours',
    retention_policy_version = 'demo-retention-v1',
    updated_at = now()
WHERE status IN ('failed','blocked_raw_audit') AND retain_until IS NULL;

UPDATE public.demo_jobs
SET retention_policy_version = 'demo-retention-v1', updated_at = now()
WHERE status IN ('processed','failed','blocked_raw_audit','cancelled')
  AND retain_until IS NOT NULL AND retention_policy_version IS NULL;

COMMENT ON COLUMN public.demo_jobs.storage_deleted_at IS 'Compatibility timestamp set only after physical absence of the original DEM is verified.';
COMMENT ON COLUMN public.demo_jobs.storage_delete_verified_at IS 'Authoritative timestamp of verified physical absence in the private demos bucket.';
COMMENT ON FUNCTION public.evaluate_demo_deletion_gate(uuid) IS 'Central fail-closed retention and lifecycle safety gate. Service role only.';
COMMENT ON FUNCTION public.claim_demo_cleanup_jobs(integer, integer) IS 'Claims eligible terminal DEM objects with row locks; deletion itself occurs through the Storage API and requires post-delete verification.';