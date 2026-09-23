CREATE OR REPLACE FUNCTION public.guard_r5_forensic_staging()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'R5_FORENSIC_STAGING_DELETE_FORBIDDEN' USING ERRCODE='55000';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.expires_at <= NEW.created_at THEN
    RAISE EXCEPTION 'R5_FORENSIC_STAGING_EXPIRY_INVALID' USING ERRCODE='22023';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.release_id IS DISTINCT FROM OLD.release_id
    OR NEW.demo_sha256 IS DISTINCT FROM OLD.demo_sha256
    OR NEW.file_size IS DISTINCT FROM OLD.file_size
    OR NEW.filename IS DISTINCT FROM OLD.filename
    OR NEW.bucket_id IS DISTINCT FROM OLD.bucket_id
    OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
    OR NEW.source IS DISTINCT FROM OLD.source
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
  ) THEN
    RAISE EXCEPTION 'R5_FORENSIC_STAGING_IDENTITY_IMMUTABLE' USING ERRCODE='55000';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.bytes_uploaded < OLD.bytes_uploaded
     AND NEW.upload_started_at IS NOT DISTINCT FROM OLD.upload_started_at THEN
    RAISE EXCEPTION 'R5_FORENSIC_STAGING_PROGRESS_REGRESSION' USING ERRCODE='55000';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.transport_status = 'READY_FOR_EXECUTION'
     AND NEW.transport_status IS DISTINCT FROM OLD.transport_status THEN
    RAISE EXCEPTION 'R5_READY_STATE_IMMUTABLE' USING ERRCODE='55000';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.transport_status = 'READY_FOR_EXECUTION' THEN
    IF OLD.transport_status <> 'VERIFYING'
       OR NEW.status::text <> 'READY_FOR_EXECUTION'
       OR NOT NEW.bytes_readable
       OR NEW.bytes_verified_at IS NULL
       OR NEW.observed_size IS DISTINCT FROM NEW.file_size
       OR NEW.observed_sha256 IS DISTINCT FROM NEW.demo_sha256
       OR NEW.deleted_at IS NOT NULL
       OR NEW.expires_at <= now() THEN
      RAISE EXCEPTION 'R5_PREMATURE_READY_FOR_EXECUTION' USING ERRCODE='55000';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.transport_status = 'UPLOADING'
     AND NEW.transport_status NOT IN ('UPLOADING','UPLOADED_UNVERIFIED','BLOCKED') THEN
    RAISE EXCEPTION 'R5_INVALID_UPLOAD_TRANSITION' USING ERRCODE='55000';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.transport_status = 'UPLOADED_UNVERIFIED'
     AND NEW.transport_status NOT IN ('UPLOADED_UNVERIFIED','VERIFYING','BLOCKED') THEN
    RAISE EXCEPTION 'R5_INVALID_UNVERIFIED_TRANSITION' USING ERRCODE='55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_r5_forensic_staging() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_r5_forensic_staging() TO service_role;

CREATE OR REPLACE FUNCTION public.transition_r5_forensic_upload(
  _staging_id uuid,
  _action text,
  _error_code text DEFAULT NULL
)
RETURNS public.r5_forensic_staging
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _row public.r5_forensic_staging%ROWTYPE;
  _now timestamptz := now();
BEGIN
  SELECT * INTO _row
  FROM public.r5_forensic_staging
  WHERE id = _staging_id
    AND bucket_id = 'r5-forensic-staging'
    AND storage_path = 'cf0549c2-dfbd-c4df-25b4-2ce8204edf87/0caa7c9744deec106095895d2dacd19cbfdae689f99e29b00dd4d446b4ec8ae3d.dem'
  FOR UPDATE;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'R5_STAGING_NOT_FOUND' USING ERRCODE='P0002';
  END IF;
  IF _row.expires_at <= _now THEN
    UPDATE public.r5_forensic_staging
       SET transport_status = 'EXPIRED', last_error_code = 'R5_STAGING_EXPIRED'
     WHERE id = _row.id
     RETURNING * INTO _row;
    RETURN _row;
  END IF;
  IF _row.transport_status = 'READY_FOR_EXECUTION' THEN
    RAISE EXCEPTION 'R5_READY_STATE_IMMUTABLE' USING ERRCODE='55000';
  END IF;

  IF _action = 'started' THEN
    IF _row.transport_status NOT IN ('NOT_READY','BLOCKED','UPLOADING') THEN
      RAISE EXCEPTION 'R5_UPLOAD_START_STATE_INVALID' USING ERRCODE='55000';
    END IF;
    UPDATE public.r5_forensic_staging
       SET transport_status = 'UPLOADING',
           upload_started_at = coalesce(upload_started_at, _now),
           upload_attempt_count = upload_attempt_count + 1,
           last_error_code = NULL,
           last_error_message_safe = NULL
     WHERE id = _row.id
     RETURNING * INTO _row;
  ELSIF _action = 'completed' THEN
    IF _row.transport_status <> 'UPLOADING' THEN
      RAISE EXCEPTION 'R5_UPLOAD_COMPLETE_STATE_INVALID' USING ERRCODE='55000';
    END IF;
    UPDATE public.r5_forensic_staging
       SET transport_status = 'UPLOADED_UNVERIFIED',
           upload_completed_at = _now,
           bytes_uploaded = 473748061,
           last_error_code = NULL,
           last_error_message_safe = NULL
     WHERE id = _row.id
     RETURNING * INTO _row;
  ELSIF _action = 'failed' THEN
    IF _row.transport_status <> 'UPLOADING' THEN
      RAISE EXCEPTION 'R5_UPLOAD_FAILURE_STATE_INVALID' USING ERRCODE='55000';
    END IF;
    UPDATE public.r5_forensic_staging
       SET transport_status = 'BLOCKED',
           last_error_code = coalesce(nullif(left(_error_code, 80), ''), 'R5_UPLOAD_FAILED'),
           last_error_message_safe = coalesce(nullif(left(_error_code, 80), ''), 'R5_UPLOAD_FAILED')
     WHERE id = _row.id
     RETURNING * INTO _row;
  ELSE
    RAISE EXCEPTION 'R5_UPLOAD_ACTION_INVALID' USING ERRCODE='22023';
  END IF;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_r5_forensic_upload(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_r5_forensic_upload(uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.transition_r5_forensic_upload(uuid, text, text)
IS 'Atomic, service-only R5 TUS transport transition. It cannot verify bytes, authorize execution, or create attempts.';