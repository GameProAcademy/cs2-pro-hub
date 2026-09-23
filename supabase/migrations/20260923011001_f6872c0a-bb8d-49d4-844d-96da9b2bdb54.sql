CREATE TYPE public.r5_forensic_staging_status AS ENUM (
  'NOT_READY',
  'STAGED',
  'IDENTITY_VERIFIED',
  'ACCESSIBLE',
  'READY_FOR_EXECUTION',
  'BLOCKED'
);

CREATE TABLE public.r5_forensic_staging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL,
  demo_sha256 text NOT NULL,
  file_size bigint NOT NULL,
  filename text NOT NULL,
  bucket_id text NOT NULL DEFAULT 'r5-forensic-staging',
  storage_path text NOT NULL UNIQUE,
  source text NOT NULL,
  status public.r5_forensic_staging_status NOT NULL DEFAULT 'NOT_READY',
  object_private boolean NOT NULL DEFAULT true,
  bytes_readable boolean NOT NULL DEFAULT false,
  bytes_verified_at timestamptz,
  observed_sha256 text,
  observed_size bigint,
  metadata_digest text,
  blocked_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  deleted_at timestamptz,
  CONSTRAINT r5_forensic_staging_release_check CHECK (release_id = 'cf0549c2-dfbd-c4df-25b4-2ce8204edf87'::uuid),
  CONSTRAINT r5_forensic_staging_sha_check CHECK (demo_sha256 = '0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d'),
  CONSTRAINT r5_forensic_staging_size_check CHECK (file_size = 473748061),
  CONSTRAINT r5_forensic_staging_filename_check CHECK (filename = 'furia-vs-gamerlegion-m1-cache.dem'),
  CONSTRAINT r5_forensic_staging_bucket_check CHECK (bucket_id = 'r5-forensic-staging'),
  CONSTRAINT r5_forensic_staging_path_check CHECK (storage_path = 'r5-forensic-staging/cf0549c2-dfbd-c4df-25b4-2ce8204edf87/0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d.dem'),
  CONSTRAINT r5_forensic_staging_source_check CHECK (source = 'R5_FORENSIC_STAGING'),
  CONSTRAINT r5_forensic_staging_expiry_check CHECK (expires_at > created_at),
  CONSTRAINT r5_forensic_staging_observed_sha_check CHECK (observed_sha256 IS NULL OR observed_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT r5_forensic_staging_metadata_digest_check CHECK (metadata_digest IS NULL OR metadata_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT r5_forensic_staging_verification_check CHECK (
    status NOT IN ('IDENTITY_VERIFIED','ACCESSIBLE','READY_FOR_EXECUTION')
    OR (
      object_private
      AND bytes_readable
      AND bytes_verified_at IS NOT NULL
      AND observed_sha256 = demo_sha256
      AND observed_size = file_size
      AND metadata_digest IS NOT NULL
      AND blocked_reason IS NULL
      AND deleted_at IS NULL
    )
  )
);

GRANT SELECT, INSERT, UPDATE ON TABLE public.r5_forensic_staging TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.r5_forensic_staging TO sandbox_exec;

ALTER TABLE public.r5_forensic_staging ENABLE ROW LEVEL SECURITY;

CREATE POLICY r5_forensic_staging_service_select
ON public.r5_forensic_staging FOR SELECT TO service_role
USING (true);

CREATE POLICY r5_forensic_staging_service_insert
ON public.r5_forensic_staging FOR INSERT TO service_role
WITH CHECK (true);

CREATE POLICY r5_forensic_staging_service_update
ON public.r5_forensic_staging FOR UPDATE TO service_role
USING (true) WITH CHECK (true);

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
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_r5_forensic_staging() FROM PUBLIC, anon, authenticated, service_role, sandbox_exec;

CREATE TRIGGER r5_forensic_staging_guard
BEFORE UPDATE OR DELETE ON public.r5_forensic_staging
FOR EACH ROW EXECUTE FUNCTION public.guard_r5_forensic_staging();

CREATE POLICY r5_forensic_staging_objects_service_select
ON storage.objects FOR SELECT TO service_role
USING (bucket_id = 'r5-forensic-staging');

CREATE POLICY r5_forensic_staging_objects_service_insert
ON storage.objects FOR INSERT TO service_role
WITH CHECK (
  bucket_id = 'r5-forensic-staging'
  AND name = 'r5-forensic-staging/cf0549c2-dfbd-c4df-25b4-2ce8204edf87/0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d.dem'
);

CREATE POLICY r5_forensic_staging_objects_service_update
ON storage.objects FOR UPDATE TO service_role
USING (
  bucket_id = 'r5-forensic-staging'
  AND name = 'r5-forensic-staging/cf0549c2-dfbd-c4df-25b4-2ce8204edf87/0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d.dem'
)
WITH CHECK (
  bucket_id = 'r5-forensic-staging'
  AND name = 'r5-forensic-staging/cf0549c2-dfbd-c4df-25b4-2ce8204edf87/0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d.dem'
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
  _object_exists boolean;
  _gate_status text := 'NOT_READY';
  _blockers jsonb := '[]'::jsonb;
BEGIN
  IF _staging_id IS NOT NULL THEN
    SELECT * INTO _s FROM public.r5_forensic_staging WHERE id = _staging_id;
  ELSE
    SELECT * INTO _s FROM public.r5_forensic_staging
    ORDER BY created_at DESC LIMIT 1;
  END IF;

  SELECT count(*) FILTER (WHERE attempt_number = 9), count(*) FILTER (WHERE attempt_number >= 10)
  INTO _attempt_9, _attempt_10_plus
  FROM public.uploads
  WHERE user_id = '348b6f66-386d-48c4-bac1-7382ab12d7be'::uuid
    AND demo_sha256 = '0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d';

  SELECT count(*),
         count(*) FILTER (WHERE canonical_authorization),
         count(*) FILTER (WHERE parity_status='VERIFIED' AND determinism_status='VERIFIED' AND semantic_validation='VERIFIED' AND persistence_validation='VERIFIED'),
         count(*) FILTER (WHERE lower(coalesce(parser_source,'')) IN ('derived_or_constant','generic','unknown','*','all'))
  INTO _mapping_count, _authorized_count, _verified_count, _generic_count
  FROM public.canonical_mapping_inventory_release_rows
  WHERE release_id = 'cf0549c2-dfbd-c4df-25b4-2ce8204edf87'::uuid;

  SELECT NOT public, file_size_limit >= 473748061
  INTO _bucket_private, _object_exists
  FROM storage.buckets WHERE id = 'r5-forensic-staging';

  IF _s.id IS NULL THEN
    _blockers := _blockers || '"R5_DEM_NOT_STAGED"'::jsonb;
  ELSIF _s.status = 'BLOCKED' THEN
    _gate_status := 'BLOCKED';
    _blockers := _blockers || to_jsonb(coalesce(_s.blocked_reason, 'R5_STAGING_BLOCKED'));
  ELSE
    _gate_status := _s.status::text;
    SELECT EXISTS (
      SELECT 1 FROM storage.objects o
      WHERE o.bucket_id = _s.bucket_id AND o.name = _s.storage_path
    ) INTO _object_exists;
    IF NOT coalesce(_object_exists, false) THEN _blockers := _blockers || '"R5_DEM_OBJECT_MISSING"'::jsonb; END IF;
    IF NOT coalesce(_bucket_private, false) OR NOT _s.object_private THEN _blockers := _blockers || '"R5_BUCKET_NOT_PRIVATE"'::jsonb; END IF;
    IF _s.demo_sha256 <> '0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d' OR _s.observed_sha256 IS DISTINCT FROM _s.demo_sha256 THEN _blockers := _blockers || '"R5_DEM_SHA_MISMATCH_OR_UNVERIFIED"'::jsonb; END IF;
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
    'gate', 'R5_REAL_DEM_ACCESS_GATE',
    'status', _gate_status,
    'staging_id', _s.id,
    'object_private', coalesce(_bucket_private, false),
    'object_exists', coalesce(_object_exists, false),
    'bytes_readable', coalesce(_s.bytes_readable, false),
    'identity_verified', coalesce(_s.observed_sha256 = _s.demo_sha256 AND _s.observed_size = _s.file_size, false),
    'attempt_9_count', _attempt_9,
    'attempt_10_plus_count', _attempt_10_plus,
    'canonical', jsonb_build_object('mapping_count',_mapping_count,'authorized_count',_authorized_count,'verified_count',_verified_count,'generic_count',_generic_count),
    'blockers', _blockers
  );
END;
$$;

REVOKE ALL ON FUNCTION public.r5_real_dem_access_gate(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.r5_real_dem_access_gate(uuid) TO service_role, sandbox_exec;

COMMENT ON TABLE public.r5_forensic_staging IS 'Temporary R5 forensic DEM staging, independent from uploads, jobs, queues, attempts, Canonical and production cleanup.';
COMMENT ON FUNCTION public.r5_real_dem_access_gate(uuid) IS 'Read-only exact-identity R5 gate. It never creates Attempt 9, enqueues work, promotes Canonical, changes Railway, or performs cleanup.';