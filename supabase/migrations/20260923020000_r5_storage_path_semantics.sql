-- R5 storage-path semantics hardening.
-- Supabase Storage object names are relative to the bucket. The previous R5
-- migration incorrectly included the bucket id in storage.objects.name.
-- No R5 staging rows or objects exist at this migration point, so this is a
-- fail-closed correction before any real DEM is admitted.

ALTER TABLE public.r5_forensic_staging
  ADD CONSTRAINT r5_forensic_staging_storage_path_relative_check
  CHECK (
    storage_path = 'cf0549c2-dfbd-c4df-25b4-2ce8204edf87/0caa7c9744deec106095895d2dacd19cbfdae689f99e29b00dd4d446b4ec8ae3d.dem'
  );

DROP POLICY IF EXISTS r5_forensic_staging_objects_master_select ON storage.objects;
DROP POLICY IF EXISTS r5_forensic_staging_objects_master_insert ON storage.objects;
DROP POLICY IF EXISTS r5_forensic_staging_objects_master_update ON storage.objects;

CREATE POLICY r5_forensic_staging_objects_master_select
ON storage.objects FOR SELECT TO authenticated
USING (
  public.is_admin_master(auth.uid())
  AND bucket_id = 'r5-forensic-staging'
  AND name = 'cf0549c2-dfbd-c4df-25b4-2ce8204edf87/0caa7c9744deec106095895d2dacd19cbfdae689f99e29b00dd4d446b4ec8ae3d.dem'
);

CREATE POLICY r5_forensic_staging_objects_master_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin_master(auth.uid())
  AND bucket_id = 'r5-forensic-staging'
  AND name = 'cf0549c2-dfbd-c4df-25b4-2ce8204edf87/0caa7c9744deec106095895d2dacd19cbfdae689f99e29b00dd4d446b4ec8ae3d.dem'
);

CREATE POLICY r5_forensic_staging_objects_master_update
ON storage.objects FOR UPDATE TO authenticated
USING (
  public.is_admin_master(auth.uid())
  AND bucket_id = 'r5-forensic-staging'
  AND name = 'cf0549c2-dfbd-c4df-25b4-2ce8204edf87/0caa7c9744deec106095895d2dacd19cbfdae689e29b00dd4d446b4ec8ae3d.dem'
)
WITH CHECK (
  public.is_admin_master(auth.uid())
  AND bucket_id = 'r5-forensic-staging'
  AND name = 'cf0549c2-dfbd-c4df-25b4-2ce8204edf87/0caa7c9744deec106095895d2dacd19cbfdae689e29b00dd4d446b4ec8ae3d.dem'
);

ALTER TABLE public.r5_forensic_staging
  DROP CONSTRAINT IF EXISTS r5_forensic_staging_storage_path_relative_check;

ALTER TABLE public.r5_forensic_staging
  ADD CONSTRAINT r5_forensic_staging_storage_path_relative_check
  CHECK (
    storage_path = 'cf0549c2-dfbd-c4df-25b4-2ce8204edf87/0caa7c9744deec106095895d2dacd19cbfdae689f99e29b00dd4d446b4ec8ae3d.dem'
  );

CREATE OR REPLACE FUNCTION public.r5_real_dem_access_gate(_staging_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _s public.r5_forensic_staging%ROWTYPE;
  _attempt_9 integer;
  _attempt_10_plus integer;
  _mapping_count integer;
  _authorized_count integer;
  _verified_count integer;
  _generic_count integer;
  _bucket_private boolean;
  _bucket_limit_ok boolean;
  _object_exists boolean := false;
  _gate_status text := 'NOT_READY';
  _blockers jsonb := '[]'::jsonb;
BEGIN
  IF _staging_id IS NOT NULL THEN
    SELECT * INTO _s FROM public.r5_forensic_staging WHERE id = _staging_id;
  ELSE
    SELECT * INTO _s FROM public.r5_forensic_staging ORDER BY created_at DESC LIMIT 1;
  END IF;

  SELECT count(*) FILTER (WHERE attempt_number = 9), count(*) FILTER (WHERE attempt_number >= 10)
  INTO _attempt_9, _attempt_10_plus
  FROM public.uploads
  WHERE user_id = '348b6f66-386d-48c4-bac1-7382ab12d7be'::uuid
    AND demo_sha256 = '0caa7c9744deec106095895d2dacd19cbfdae689f99e29b00dd4d446b4ec8ae3d';

  SELECT count(*),
         count(*) FILTER (WHERE canonical_authorization),
         count(*) FILTER (WHERE parity_status='VERIFIED' AND determinism_status='VERIFIED' AND semantic_validation='VERIFIED' AND persistence_validation='VERIFIED'),
         count(*) FILTER (WHERE lower(coalesce(mapping_class,'')) IN ('derived_or_constant','generic','unknown','*','all'))
  INTO _mapping_count, _authorized_count, _verified_count, _generic_count
  FROM public.canonical_mapping_inventory_release_rows
  WHERE release_id = 'cf0549c2-dfbd-c4df-25b4-2ce8204edf87'::uuid;

  SELECT NOT public, file_size_limit >= 473748061
  INTO _bucket_private, _bucket_limit_ok
  FROM storage.buckets WHERE id = 'r5-forensic-staging';

  IF _s.id IS NULL THEN
    _blockers := _blockers || '"R5_DEM_NOT_STAGED"'::jsonb;
  ELSIF _s.status = 'BLOCKED' THEN
    _gate_status := 'BLOCKED';
    _blockers := _blockers || to_jsonb(coalesce(_s.blocked_reason, 'R5_STAGING_BLOCKED'));
  ELSE
    _gate_status := _s.status::text;
    IF _s.bucket_id IS DISTINCT FROM 'r5-forensic-staging' THEN
      _blockers := _blockers || '"R5_BUCKET_MISMATCH"'::jsonb;
    END IF;
    IF _s.storage_path IS DISTINCT FROM 'cf0549c2-dfbd-c4df-25b4-2ce8204edf87/0caa7c9744deec106095895d2dacd19cbfdae689f99e29b00dd4d446b4ec8ae3d.dem' THEN
      _blockers := _blockers || '"R5_PATH_MISMATCH"'::jsonb;
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM storage.objects o
      WHERE o.bucket_id = _s.bucket_id AND o.name = _s.storage_path
    ) INTO _object_exists;
    IF NOT _object_exists THEN _blockers := _blockers || '"R5_DEM_OBJECT_MISSING"'::jsonb; END IF;
    IF NOT coalesce(_bucket_private, false) OR NOT _s.object_private THEN _blockers := _blockers || '"R5_BUCKET_NOT_PRIVATE"'::jsonb; END IF;
    IF NOT coalesce(_bucket_limit_ok, false) THEN _blockers := _blockers || '"R5_BUCKET_SIZE_LIMIT_INVALID"'::jsonb; END IF;
    IF _s.demo_sha256 <> '0caa7c9744deec106095895d2dacd19cbfdae689f99e29b00dd4d446b4ec8ae3d' OR _s.observed_sha256 IS DISTINCT FROM _s.demo_sha256 THEN _blockers := _blockers || '"R5_DEM_SHA_MISMATCH_OR_UNVERIFIED"'::jsonb; END IF;
    IF _s.file_size <> 473748061 OR _s.observed_size IS DISTINCT FROM _s.file_size THEN _blockers := _blockers || '"R5_DEM_SIZE_MISMATCH_OR_UNVERIFIED"'::jsonb; END IF;
    IF NOT _s.bytes_readable OR _s.bytes_verified_at IS NULL THEN _blockers := _blockers || '"R5_DEM_BYTES_NOT_READ"'::jsonb; END IF;
    IF _s.deleted_at IS NOT NULL THEN _blockers := _blockers || '"R5_STAGING_CLEANUP_OBSERVED"'::jsonb; END IF;
    IF _s.expires_at <= now() THEN _blockers := _blockers || '"R5_STAGING_EXPIRED"'::jsonb; END IF;
  END IF;

  IF _attempt_9 <> 0 THEN _blockers := _blockers || '"ATTEMPT_9_ALREADY_EXISTS"'::jsonb; END IF;
  IF _attempt_10_plus <> 0 THEN _blockers := _blockers || '"ATTEMPT_10_PLUS_EXISTS"'::jsonb; END IF;
  IF _mapping_count <> 105 OR _authorized_count <> 0 OR _verified_count <> 0 OR _generic_count <> 0 THEN _blockers := _blockers || '"CANONICAL_BASELINE_CHANGED"'::jsonb; END IF;

  IF jsonb_array_length(_blockers) = 0 AND _s.status = 'READY_FOR_EXECUTION' THEN
    _gate_status := 'READY_FOR_EXECUTION';
  ELSIF _gate_status <> 'BLOCKED' AND _s.id IS NOT NULL THEN
    _gate_status := CASE
      WHEN _s.bytes_readable AND _s.observed_sha256 = _s.demo_sha256 AND _s.observed_size = _s.file_size THEN 'ACCESSIBLE'
      WHEN _object_exists THEN 'STAGED'
      ELSE 'NOT_READY'
    END;
  END IF;

  RETURN jsonb_build_object(
    'gate','R5_REAL_DEM_ACCESS_GATE','status',_gate_status,'staging_id',_s.id,
    'object_private',coalesce(_bucket_private,false),'object_exists',_object_exists,
    'bytes_readable',coalesce(_s.bytes_readable,false),
    'identity_verified',coalesce(_s.observed_sha256 = _s.demo_sha256 AND _s.observed_size = _s.file_size,false),
    'attempt_9_count',_attempt_9,'attempt_10_plus_count',_attempt_10_plus,
    'canonical',jsonb_build_object('mapping_count',_mapping_count,'authorized_count',_authorized_count,'verified_count',_verified_count,'generic_count',_generic_count),
    'blockers',_blockers
  );
END;
$$;

REVOKE ALL ON FUNCTION public.r5_real_dem_access_gate(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.r5_real_dem_access_gate(uuid) TO service_role, sandbox_exec;

COMMENT ON FUNCTION public.r5_real_dem_access_gate(uuid)
IS 'Read-only R5 access gate. Storage path is bucket-relative and must exactly match the authorized Cache DEM object name.';

-- Fail closed if any future staging row tries to reintroduce a bucket-prefixed name.
COMMENT ON CONSTRAINT r5_forensic_staging_storage_path_relative_check ON public.r5_forensic_staging
IS 'Supabase Storage object name is relative to bucket r5-forensic-staging; bucket prefix is forbidden.';