ALTER TABLE public.r5_forensic_staging
  DROP CONSTRAINT IF EXISTS r5_forensic_staging_storage_path_key;

CREATE UNIQUE INDEX IF NOT EXISTS r5_forensic_staging_active_path_key
  ON public.r5_forensic_staging (storage_path)
  WHERE transport_status <> 'EXPIRED';

CREATE UNIQUE INDEX IF NOT EXISTS r5_forensic_staging_ready_path_key
  ON public.r5_forensic_staging (storage_path)
  WHERE transport_status = 'READY_FOR_EXECUTION';

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
     AND NEW.transport_status IS DISTINCT FROM OLD.transport_status
     AND NOT (
       NEW.transport_status = 'EXPIRED'
       AND NEW.status::text = 'BLOCKED'
       AND OLD.expires_at <= now()
     ) THEN
    RAISE EXCEPTION 'R5_READY_STATE_IMMUTABLE' USING ERRCODE='55000';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.transport_status = 'EXPIRED' THEN
    IF OLD.expires_at > now()
       OR NEW.status::text <> 'BLOCKED'
       OR NEW.blocked_reason IS DISTINCT FROM 'R5_STAGING_EXPIRED'
       OR NEW.last_error_code IS DISTINCT FROM 'R5_STAGING_EXPIRED' THEN
      RAISE EXCEPTION 'R5_INVALID_EXPIRY_TRANSITION' USING ERRCODE='55000';
    END IF;
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
     AND NEW.transport_status NOT IN ('UPLOADING','UPLOADED_UNVERIFIED','BLOCKED','EXPIRED') THEN
    RAISE EXCEPTION 'R5_INVALID_UPLOAD_TRANSITION' USING ERRCODE='55000';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.transport_status = 'UPLOADED_UNVERIFIED'
     AND NEW.transport_status NOT IN ('UPLOADED_UNVERIFIED','VERIFYING','BLOCKED','EXPIRED') THEN
    RAISE EXCEPTION 'R5_INVALID_UNVERIFIED_TRANSITION' USING ERRCODE='55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_r5_forensic_staging() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_r5_forensic_staging() TO service_role;

CREATE OR REPLACE FUNCTION public.prepare_r5_forensic_staging()
RETURNS public.r5_forensic_staging
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _row public.r5_forensic_staging%ROWTYPE;
  _now timestamptz := now();
  _path constant text := 'cf0549c2-dfbd-c4df-25b4-2ce8204edf87/0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d.dem';
  _object_exists boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('R5_FORENSIC_STAGING:cf0549c2-dfbd-c4df-25b4-2ce8204edf87', 0));

  SELECT * INTO _row
  FROM public.r5_forensic_staging
  WHERE storage_path = _path
    AND transport_status <> 'EXPIRED'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF _row.id IS NOT NULL AND _row.expires_at <= _now THEN
    UPDATE public.r5_forensic_staging
       SET status = 'BLOCKED',
           transport_status = 'EXPIRED',
           blocked_reason = 'R5_STAGING_EXPIRED',
           last_error_code = 'R5_STAGING_EXPIRED',
           last_error_message_safe = 'R5_STAGING_EXPIRED'
     WHERE id = _row.id
     RETURNING * INTO _row;
  END IF;

  IF _row.id IS NOT NULL AND _row.transport_status <> 'EXPIRED' THEN
    RETURN _row;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'r5-forensic-staging' AND name = _path
  ) INTO _object_exists;

  IF _object_exists THEN
    RAISE EXCEPTION 'R5_EXPIRED_OBJECT_REMAINS' USING ERRCODE='55000';
  END IF;

  INSERT INTO public.r5_forensic_staging (
    release_id, demo_sha256, file_size, filename, bucket_id,
    storage_path, source, expires_at
  ) VALUES (
    'cf0549c2-dfbd-c4df-25b4-2ce8204edf87'::uuid,
    '0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d',
    473748061,
    'furia-vs-gamerlegion-m1-cache.dem',
    'r5-forensic-staging',
    _path,
    'R5_FORENSIC_STAGING',
    _now + interval '24 hours'
  ) RETURNING * INTO _row;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_r5_forensic_staging() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_r5_forensic_staging() TO service_role;

CREATE OR REPLACE FUNCTION public.transition_r5_forensic_upload(_staging_id uuid, _action text, _error_code text DEFAULT NULL)
RETURNS public.r5_forensic_staging
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE _row public.r5_forensic_staging%ROWTYPE; _now timestamptz := now();
BEGIN
  SELECT * INTO _row FROM public.r5_forensic_staging
  WHERE id = _staging_id
    AND bucket_id = 'r5-forensic-staging'
    AND storage_path = 'cf0549c2-dfbd-c4df-25b4-2ce8204edf87/0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d.dem'
  FOR UPDATE;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'R5_STAGING_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF _row.expires_at <= _now THEN
    UPDATE public.r5_forensic_staging
       SET status='BLOCKED', transport_status='EXPIRED', blocked_reason='R5_STAGING_EXPIRED',
           last_error_code='R5_STAGING_EXPIRED', last_error_message_safe='R5_STAGING_EXPIRED'
     WHERE id=_row.id RETURNING * INTO _row;
    RETURN _row;
  END IF;
  IF _row.transport_status='READY_FOR_EXECUTION' THEN RAISE EXCEPTION 'R5_READY_STATE_IMMUTABLE' USING ERRCODE='55000'; END IF;
  IF _action='started' THEN
    IF _row.transport_status NOT IN ('NOT_READY','BLOCKED','UPLOADING') THEN RAISE EXCEPTION 'R5_UPLOAD_START_STATE_INVALID' USING ERRCODE='55000'; END IF;
    UPDATE public.r5_forensic_staging SET transport_status='UPLOADING', upload_started_at=coalesce(upload_started_at,_now), upload_attempt_count=upload_attempt_count+1, last_error_code=NULL, last_error_message_safe=NULL WHERE id=_row.id RETURNING * INTO _row;
  ELSIF _action='completed' THEN
    IF _row.transport_status<>'UPLOADING' THEN RAISE EXCEPTION 'R5_UPLOAD_COMPLETE_STATE_INVALID' USING ERRCODE='55000'; END IF;
    UPDATE public.r5_forensic_staging SET transport_status='UPLOADED_UNVERIFIED', upload_completed_at=_now, bytes_uploaded=473748061, last_error_code=NULL, last_error_message_safe=NULL WHERE id=_row.id RETURNING * INTO _row;
  ELSIF _action='failed' THEN
    IF _row.transport_status<>'UPLOADING' THEN RAISE EXCEPTION 'R5_UPLOAD_FAILURE_STATE_INVALID' USING ERRCODE='55000'; END IF;
    UPDATE public.r5_forensic_staging SET status='BLOCKED', transport_status='BLOCKED', blocked_reason=coalesce(nullif(left(_error_code,80),''),'R5_UPLOAD_FAILED'), last_error_code=coalesce(nullif(left(_error_code,80),''),'R5_UPLOAD_FAILED'), last_error_message_safe=coalesce(nullif(left(_error_code,80),''),'R5_UPLOAD_FAILED') WHERE id=_row.id RETURNING * INTO _row;
  ELSE RAISE EXCEPTION 'R5_UPLOAD_ACTION_INVALID' USING ERRCODE='22023'; END IF;
  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_r5_forensic_upload(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_r5_forensic_upload(uuid,text,text) TO service_role;

COMMENT ON FUNCTION public.prepare_r5_forensic_staging()
IS 'Creates one active 24-hour R5 staging slot at a time, preserving expired history and refusing to overwrite an expired object.';