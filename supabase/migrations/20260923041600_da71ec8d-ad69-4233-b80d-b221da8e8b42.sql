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
  _bucket_private boolean;
  _bucket_limit bigint;
  _attempt_9 integer;
  _attempt_10_plus integer;
  _jobs_ge_9 integer;
  _mapping_count integer;
  _authorized_count integer;
  _verified_count integer;
  _generic_count integer;
  _provenance_verified integer;
  _nonce_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('R5_FORENSIC_STAGING:cf0549c2-dfbd-c4df-25b4-2ce8204edf87', 0));

  SELECT count(*) FILTER (WHERE attempt_number = 9),
         count(*) FILTER (WHERE attempt_number >= 10)
    INTO _attempt_9, _attempt_10_plus
  FROM public.uploads
  WHERE user_id = '348b6f66-386d-48c4-bac1-7382ab12d7be'::uuid
    AND demo_sha256 = '0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d';

  SELECT count(*) INTO _jobs_ge_9
  FROM public.demo_jobs j
  JOIN public.uploads u ON u.id = j.upload_id
  WHERE u.user_id = '348b6f66-386d-48c4-bac1-7382ab12d7be'::uuid
    AND u.demo_sha256 = '0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d'
    AND u.attempt_number >= 9;

  SELECT count(*),
         count(*) FILTER (WHERE canonical_authorization),
         count(*) FILTER (WHERE parity_status='VERIFIED' AND determinism_status='VERIFIED' AND semantic_validation='VERIFIED' AND persistence_validation='VERIFIED'),
         count(*) FILTER (WHERE lower(coalesce(mapping_class,'')) IN ('derived_or_constant','generic','unknown','*','all'))
    INTO _mapping_count, _authorized_count, _verified_count, _generic_count
  FROM public.canonical_mapping_inventory_release_rows
  WHERE release_id = 'cf0549c2-dfbd-c4df-25b4-2ce8204edf87'::uuid;

  SELECT count(*) INTO _provenance_verified
  FROM public.parser_runtime_provenance
  WHERE status = 'VERIFIED';

  SELECT count(*) INTO _nonce_count FROM public.parser_attestation_nonces;

  SELECT NOT public, file_size_limit
    INTO _bucket_private, _bucket_limit
  FROM storage.buckets
  WHERE id = 'r5-forensic-staging';

  IF _attempt_9 <> 0 OR _attempt_10_plus <> 0 OR _jobs_ge_9 <> 0 THEN
    RAISE EXCEPTION 'R5_ATTEMPT_OR_JOB_ALREADY_EXISTS' USING ERRCODE='55000';
  END IF;
  IF _mapping_count <> 105 OR _authorized_count <> 0 OR _verified_count <> 0 OR _generic_count <> 0 THEN
    RAISE EXCEPTION 'R5_CANONICAL_BASELINE_CHANGED' USING ERRCODE='55000';
  END IF;
  IF _provenance_verified <> 0 OR _nonce_count <> 0 THEN
    RAISE EXCEPTION 'R5_UNEXPECTED_EXECUTION_EVIDENCE' USING ERRCODE='55000';
  END IF;
  IF NOT coalesce(_bucket_private, false) OR coalesce(_bucket_limit, 0) < 473748061 THEN
    RAISE EXCEPTION 'R5_STORAGE_CONFIGURATION_INVALID' USING ERRCODE='55000';
  END IF;

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

CREATE OR REPLACE FUNCTION public.record_r5_forensic_progress(
  _staging_id uuid,
  _bytes_uploaded bigint
)
RETURNS public.r5_forensic_staging
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _row public.r5_forensic_staging%ROWTYPE;
BEGIN
  SELECT * INTO _row
  FROM public.r5_forensic_staging
  WHERE id = _staging_id
  FOR UPDATE;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'R5_STAGING_NOT_FOUND' USING ERRCODE='P0002';
  END IF;
  IF _row.expires_at <= now() THEN
    UPDATE public.r5_forensic_staging
       SET status='BLOCKED', transport_status='EXPIRED', blocked_reason='R5_STAGING_EXPIRED',
           last_error_code='R5_STAGING_EXPIRED', last_error_message_safe='R5_STAGING_EXPIRED'
     WHERE id=_row.id RETURNING * INTO _row;
    RETURN _row;
  END IF;
  IF _row.transport_status <> 'UPLOADING' THEN
    RAISE EXCEPTION 'R5_UPLOAD_PROGRESS_STATE_INVALID' USING ERRCODE='55000';
  END IF;
  IF _bytes_uploaded < _row.bytes_uploaded OR _bytes_uploaded > _row.file_size THEN
    RAISE EXCEPTION 'R5_UPLOAD_PROGRESS_INVALID' USING ERRCODE='22023';
  END IF;

  UPDATE public.r5_forensic_staging
     SET bytes_uploaded = _bytes_uploaded
   WHERE id = _row.id
   RETURNING * INTO _row;
  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.record_r5_forensic_progress(uuid,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_r5_forensic_progress(uuid,bigint) TO service_role;

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
    UPDATE public.r5_forensic_staging SET status='NOT_READY', transport_status='UPLOADING', blocked_reason=NULL, upload_started_at=coalesce(upload_started_at,_now), upload_attempt_count=upload_attempt_count+1, last_error_code=NULL, last_error_message_safe=NULL WHERE id=_row.id RETURNING * INTO _row;
  ELSIF _action='completed' THEN
    IF _row.transport_status<>'UPLOADING' OR _row.bytes_uploaded<>_row.file_size THEN RAISE EXCEPTION 'R5_UPLOAD_COMPLETE_STATE_INVALID' USING ERRCODE='55000'; END IF;
    UPDATE public.r5_forensic_staging SET transport_status='UPLOADED_UNVERIFIED', upload_completed_at=_now, last_error_code=NULL, last_error_message_safe=NULL WHERE id=_row.id RETURNING * INTO _row;
  ELSIF _action='cancelled' THEN
    IF _row.transport_status<>'UPLOADING' THEN RAISE EXCEPTION 'R5_UPLOAD_CANCEL_STATE_INVALID' USING ERRCODE='55000'; END IF;
    UPDATE public.r5_forensic_staging SET last_error_code='R5_UPLOAD_CANCELLED', last_error_message_safe='R5_UPLOAD_CANCELLED' WHERE id=_row.id RETURNING * INTO _row;
  ELSIF _action='failed' THEN
    IF _row.transport_status<>'UPLOADING' THEN RAISE EXCEPTION 'R5_UPLOAD_FAILURE_STATE_INVALID' USING ERRCODE='55000'; END IF;
    UPDATE public.r5_forensic_staging SET status='BLOCKED', transport_status='BLOCKED', blocked_reason=coalesce(nullif(left(_error_code,80),''),'R5_UPLOAD_FAILED'), last_error_code=coalesce(nullif(left(_error_code,80),''),'R5_UPLOAD_FAILED'), last_error_message_safe=coalesce(nullif(left(_error_code,80),''),'R5_UPLOAD_FAILED') WHERE id=_row.id RETURNING * INTO _row;
  ELSE RAISE EXCEPTION 'R5_UPLOAD_ACTION_INVALID' USING ERRCODE='22023'; END IF;
  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_r5_forensic_upload(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_r5_forensic_upload(uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.transition_r5_forensic_verification(
  _staging_id uuid,
  _action text,
  _observed_size bigint DEFAULT NULL,
  _observed_sha256 text DEFAULT NULL,
  _metadata_digest text DEFAULT NULL,
  _error_code text DEFAULT NULL
)
RETURNS public.r5_forensic_staging
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE _row public.r5_forensic_staging%ROWTYPE; _now timestamptz := now();
BEGIN
  SELECT * INTO _row FROM public.r5_forensic_staging WHERE id=_staging_id FOR UPDATE;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'R5_STAGING_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF _row.expires_at <= _now THEN
    UPDATE public.r5_forensic_staging
       SET status='BLOCKED', transport_status='EXPIRED', blocked_reason='R5_STAGING_EXPIRED',
           last_error_code='R5_STAGING_EXPIRED', last_error_message_safe='R5_STAGING_EXPIRED'
     WHERE id=_row.id RETURNING * INTO _row;
    RETURN _row;
  END IF;
  IF _action='started' THEN
    IF _row.transport_status<>'UPLOADED_UNVERIFIED' OR _row.bytes_uploaded<>_row.file_size THEN RAISE EXCEPTION 'R5_VERIFY_START_STATE_INVALID' USING ERRCODE='55000'; END IF;
    UPDATE public.r5_forensic_staging SET transport_status='VERIFYING', verification_started_at=_now, last_error_code=NULL, last_error_message_safe=NULL WHERE id=_row.id RETURNING * INTO _row;
  ELSIF _action='verified' THEN
    IF _row.transport_status<>'VERIFYING' OR _observed_size IS DISTINCT FROM _row.file_size OR _observed_sha256 IS DISTINCT FROM _row.demo_sha256 OR _metadata_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'R5_VERIFY_RESULT_INVALID' USING ERRCODE='55000'; END IF;
    UPDATE public.r5_forensic_staging SET status='READY_FOR_EXECUTION', transport_status='READY_FOR_EXECUTION', bytes_readable=true, bytes_verified_at=_now, observed_sha256=_observed_sha256, observed_size=_observed_size, metadata_digest=_metadata_digest, blocked_reason=NULL, last_error_code=NULL, last_error_message_safe=NULL WHERE id=_row.id RETURNING * INTO _row;
  ELSIF _action='failed' THEN
    IF _row.transport_status NOT IN ('UPLOADED_UNVERIFIED','VERIFYING') THEN RAISE EXCEPTION 'R5_VERIFY_FAILURE_STATE_INVALID' USING ERRCODE='55000'; END IF;
    UPDATE public.r5_forensic_staging SET status='BLOCKED', transport_status='BLOCKED', bytes_readable=false, blocked_reason=coalesce(nullif(left(_error_code,80),''),'R5_VERIFICATION_FAILED'), last_error_code=coalesce(nullif(left(_error_code,80),''),'R5_VERIFICATION_FAILED'), last_error_message_safe=coalesce(nullif(left(_error_code,80),''),'R5_VERIFICATION_FAILED') WHERE id=_row.id RETURNING * INTO _row;
  ELSE RAISE EXCEPTION 'R5_VERIFY_ACTION_INVALID' USING ERRCODE='22023'; END IF;
  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_r5_forensic_verification(uuid,text,bigint,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_r5_forensic_verification(uuid,text,bigint,text,text,text) TO service_role;

COMMENT ON FUNCTION public.record_r5_forensic_progress(uuid,bigint) IS 'Records monotonic R5 TUS progress without storing DEM content.';
COMMENT ON FUNCTION public.transition_r5_forensic_verification(uuid,text,bigint,text,text,text) IS 'Atomically starts or finishes independent server-side R5 byte verification; it never executes a parser or creates an attempt.';