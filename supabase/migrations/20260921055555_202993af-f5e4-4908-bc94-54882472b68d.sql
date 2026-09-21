-- FASE 2.7.2G.6 — include owner identity in cleanup claims.
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
    'eligible', _reason = 'ELIGIBLE', 'reason', _reason,
    'job_id', _job.id, 'upload_id', _job.upload_id, 'user_id', _job.user_id,
    'storage_path', _job.storage_path,
    'metadata_mismatch', _job.storage_deleted_at IS NOT NULL AND _job.storage_delete_verified_at IS NULL
  );
END;
$$;
REVOKE ALL ON FUNCTION public.evaluate_demo_deletion_gate(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_demo_deletion_gate(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_demo_cleanup_jobs(_limit integer DEFAULT 25, _claim_seconds integer DEFAULT 300)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _candidate record; _gate jsonb; _token uuid; _items jsonb := '[]'::jsonb; _claimed integer := 0;
BEGIN
  FOR _candidate IN SELECT j.id FROM public.demo_jobs j
    WHERE j.status IN ('processed','failed','blocked_raw_audit','cancelled')
      AND j.storage_delete_verified_at IS NULL AND j.retain_until IS NOT NULL AND j.retain_until <= now()
      AND (j.cleanup_claim_token IS NULL OR j.cleanup_claim_expires_at <= now())
    ORDER BY j.retain_until, j.id FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(_limit,25),1),100)
  LOOP
    _gate := public.evaluate_demo_deletion_gate(_candidate.id);
    IF COALESCE((_gate->>'eligible')::boolean,false) THEN
      _token := gen_random_uuid();
      UPDATE public.demo_jobs SET cleanup_claim_token=_token, cleanup_claimed_at=now(),
        cleanup_claim_expires_at=now()+make_interval(secs=>LEAST(GREATEST(COALESCE(_claim_seconds,300),60),900)),
        storage_delete_attempted_at=now(), last_cleanup_attempt_at=now(), cleanup_attempt_count=cleanup_attempt_count+1,
        deletion_reason=CASE WHEN storage_deleted_at IS NOT NULL THEN 'metadata_mismatch' WHEN status='cancelled' THEN 'cancelled' ELSE 'retention_expired' END,
        cleanup_error=CASE WHEN storage_deleted_at IS NOT NULL THEN 'DELETION_METADATA_MISMATCH' ELSE NULL END, updated_at=now()
      WHERE id=_candidate.id AND storage_delete_verified_at IS NULL
        AND (cleanup_claim_token IS NULL OR cleanup_claim_expires_at <= now());
      IF FOUND THEN
        _items := _items || jsonb_build_array(jsonb_build_object(
          'job_id',_gate->>'job_id','upload_id',_gate->>'upload_id','user_id',_gate->>'user_id',
          'storage_path',_gate->>'storage_path','claim_token',_token,
          'metadata_mismatch',COALESCE((_gate->>'metadata_mismatch')::boolean,false)));
        _claimed := _claimed+1;
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('claimed',_claimed,'items',_items);
END; $$;
REVOKE ALL ON FUNCTION public.claim_demo_cleanup_jobs(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_demo_cleanup_jobs(integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_demo_cleanup_job(_job_id uuid, _claim_seconds integer DEFAULT 300)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _job public.demo_jobs%ROWTYPE; _gate jsonb; _token uuid;
BEGIN
  SELECT * INTO _job FROM public.demo_jobs WHERE id=_job_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('claimed',false,'reason','JOB_NOT_FOUND'); END IF;
  _gate := public.evaluate_demo_deletion_gate(_job_id);
  IF NOT COALESCE((_gate->>'eligible')::boolean,false) THEN
    RETURN jsonb_build_object('claimed',false,'reason',_gate->>'reason');
  END IF;
  _token := gen_random_uuid();
  UPDATE public.demo_jobs SET cleanup_claim_token=_token, cleanup_claimed_at=now(),
    cleanup_claim_expires_at=now()+make_interval(secs=>LEAST(GREATEST(COALESCE(_claim_seconds,300),60),900)),
    storage_delete_attempted_at=now(), last_cleanup_attempt_at=now(), cleanup_attempt_count=cleanup_attempt_count+1,
    deletion_reason=CASE WHEN storage_deleted_at IS NOT NULL THEN 'metadata_mismatch' WHEN status='cancelled' THEN 'cancelled' ELSE 'retention_expired' END,
    cleanup_error=CASE WHEN storage_deleted_at IS NOT NULL THEN 'DELETION_METADATA_MISMATCH' ELSE NULL END, updated_at=now()
  WHERE id=_job_id AND storage_delete_verified_at IS NULL
    AND (cleanup_claim_token IS NULL OR cleanup_claim_expires_at <= now());
  IF NOT FOUND THEN RETURN jsonb_build_object('claimed',false,'reason','CLAIM_CONFLICT'); END IF;
  RETURN jsonb_build_object('claimed',true,'job_id',_gate->>'job_id','upload_id',_gate->>'upload_id',
    'user_id',_gate->>'user_id','storage_path',_gate->>'storage_path','claim_token',_token,
    'metadata_mismatch',COALESCE((_gate->>'metadata_mismatch')::boolean,false));
END; $$;
REVOKE ALL ON FUNCTION public.claim_demo_cleanup_job(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_demo_cleanup_job(uuid, integer) TO service_role;