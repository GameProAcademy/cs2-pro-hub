ALTER TABLE public.r5_forensic_staging
  ADD COLUMN transport_status text NOT NULL DEFAULT 'NOT_READY',
  ADD COLUMN upload_started_at timestamptz,
  ADD COLUMN upload_completed_at timestamptz,
  ADD COLUMN verification_started_at timestamptz,
  ADD COLUMN bytes_uploaded bigint NOT NULL DEFAULT 0,
  ADD COLUMN upload_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN last_error_code text,
  ADD COLUMN last_error_message_safe text,
  ADD CONSTRAINT r5_forensic_transport_status_check CHECK (transport_status IN ('NOT_READY','UPLOADING','UPLOADED_UNVERIFIED','VERIFYING','READY_FOR_EXECUTION','BLOCKED','EXPIRED')),
  ADD CONSTRAINT r5_forensic_bytes_uploaded_check CHECK (bytes_uploaded >= 0 AND bytes_uploaded <= 473748061),
  ADD CONSTRAINT r5_forensic_upload_attempt_count_check CHECK (upload_attempt_count >= 0),
  ADD CONSTRAINT r5_forensic_safe_error_check CHECK (last_error_message_safe IS NULL OR length(last_error_message_safe) <= 500);

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
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP POLICY IF EXISTS r5_forensic_staging_objects_master_select ON storage.objects;
DROP POLICY IF EXISTS r5_forensic_staging_objects_master_insert ON storage.objects;
DROP POLICY IF EXISTS r5_forensic_staging_objects_master_update ON storage.objects;

CREATE POLICY r5_forensic_staging_objects_master_select
ON storage.objects FOR SELECT TO authenticated
USING (
  public.is_admin_master(auth.uid())
  AND bucket_id = 'r5-forensic-staging'
  AND name = 'r5-forensic-staging/cf0549c2-dfbd-c4df-25b4-2ce8204edf87/0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d.dem'
);

CREATE POLICY r5_forensic_staging_objects_master_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin_master(auth.uid())
  AND bucket_id = 'r5-forensic-staging'
  AND name = 'r5-forensic-staging/cf0549c2-dfbd-c4df-25b4-2ce8204edf87/0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d.dem'
);

CREATE POLICY r5_forensic_staging_objects_master_update
ON storage.objects FOR UPDATE TO authenticated
USING (
  public.is_admin_master(auth.uid())
  AND bucket_id = 'r5-forensic-staging'
  AND name = 'r5-forensic-staging/cf0549c2-dfbd-c4df-25b4-2ce8204edf87/0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d.dem'
)
WITH CHECK (
  public.is_admin_master(auth.uid())
  AND bucket_id = 'r5-forensic-staging'
  AND name = 'r5-forensic-staging/cf0549c2-dfbd-c4df-25b4-2ce8204edf87/0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d.dem'
);

CREATE OR REPLACE FUNCTION public.r5_real_dem_execution_gate(_staging_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _access jsonb;
  _s public.r5_forensic_staging%ROWTYPE;
  _blockers jsonb := '[]'::jsonb;
BEGIN
  _access := public.r5_real_dem_access_gate(_staging_id);
  IF _staging_id IS NOT NULL THEN
    SELECT * INTO _s FROM public.r5_forensic_staging WHERE id = _staging_id;
  ELSE
    SELECT * INTO _s FROM public.r5_forensic_staging ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF coalesce(_access->>'status','NOT_READY') <> 'READY_FOR_EXECUTION' THEN
    _blockers := _blockers || '"R5_STAGING_NOT_READY"'::jsonb;
  END IF;
  IF _s.id IS NULL OR _s.transport_status <> 'READY_FOR_EXECUTION' THEN
    _blockers := _blockers || '"R5_TRANSPORT_NOT_VERIFIED"'::jsonb;
  END IF;
  IF _s.source IS DISTINCT FROM 'R5_FORENSIC_STAGING' THEN
    _blockers := _blockers || '"R5_FIXTURE_OR_TEST_SOURCE_FORBIDDEN"'::jsonb;
  END IF;
  _blockers := _blockers || '"R5_HMAC_NOT_VERIFIED"'::jsonb;
  _blockers := _blockers || '"R5_OIDC_NOT_VERIFIED"'::jsonb;
  _blockers := _blockers || '"R5_CURRENT_RUNTIME_PROVENANCE_NOT_VERIFIED"'::jsonb;

  RETURN jsonb_build_object(
    'gate','R5_REAL_DEM_EXECUTION_GATE',
    'status','BLOCKED',
    'staging_id',_s.id,
    'access_gate',_access,
    'runtime',jsonb_build_object(
      'parser','demoparser2',
      'parser_version','0.42.0',
      'contract_version',1,
      'railway_revision','5703b1d88f21ee57fdd1d83722edf30e0f0c6f76',
      'fixture_mode',false
    ),
    'blockers',_blockers,
    'attempt_9_authorized',false
  );
END;
$$;
REVOKE ALL ON FUNCTION public.r5_real_dem_execution_gate(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.r5_real_dem_execution_gate(uuid) TO service_role, sandbox_exec;

CREATE OR REPLACE FUNCTION public.assert_attempt_9_authorized(_staging_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RAISE EXCEPTION 'R5_ATTEMPT_9_NOT_AUTHORIZED' USING ERRCODE='55000';
END;
$$;
REVOKE ALL ON FUNCTION public.assert_attempt_9_authorized(uuid) FROM PUBLIC, anon, authenticated, service_role, sandbox_exec;

COMMENT ON COLUMN public.r5_forensic_staging.transport_status IS 'Explicit R5 transport state. Identity is immutable; only evidence state may advance.';
COMMENT ON FUNCTION public.r5_real_dem_execution_gate(uuid) IS 'Read-only forensic execution readiness gate. It cannot authorize or create Attempt 9 and remains blocked until independent HMAC, OIDC and current runtime provenance exist.';
COMMENT ON FUNCTION public.assert_attempt_9_authorized(uuid) IS 'Permanent R5.2-R5.4 stop gate. Attempt 9 remains unauthorized in this phase.';