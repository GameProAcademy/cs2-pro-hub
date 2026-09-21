-- FASE 2.7.2G.6 — targeted cleanup claim for immediate cancellation.
CREATE OR REPLACE FUNCTION public.claim_demo_cleanup_job(
  _job_id uuid,
  _claim_seconds integer DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _job public.demo_jobs%ROWTYPE;
  _gate jsonb;
  _token uuid;
BEGIN
  SELECT * INTO _job FROM public.demo_jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('claimed', false, 'reason', 'JOB_NOT_FOUND'); END IF;

  _gate := public.evaluate_demo_deletion_gate(_job_id);
  IF NOT COALESCE((_gate->>'eligible')::boolean, false) THEN
    RETURN jsonb_build_object('claimed', false, 'reason', _gate->>'reason');
  END IF;

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
  WHERE id = _job_id
    AND storage_delete_verified_at IS NULL
    AND (cleanup_claim_token IS NULL OR cleanup_claim_expires_at <= now());

  IF NOT FOUND THEN RETURN jsonb_build_object('claimed', false, 'reason', 'CLAIM_CONFLICT'); END IF;
  RETURN jsonb_build_object(
    'claimed', true,
    'job_id', _gate->>'job_id',
    'upload_id', _gate->>'upload_id',
    'storage_path', _gate->>'storage_path',
    'claim_token', _token,
    'metadata_mismatch', COALESCE((_gate->>'metadata_mismatch')::boolean, false)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.claim_demo_cleanup_job(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_demo_cleanup_job(uuid, integer) TO service_role;
COMMENT ON FUNCTION public.claim_demo_cleanup_job(uuid, integer) IS 'Claims one eligible terminal DEM for immediate verified Storage deletion; service role only.';