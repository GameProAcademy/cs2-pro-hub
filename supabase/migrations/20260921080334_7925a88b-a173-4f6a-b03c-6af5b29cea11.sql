ALTER TABLE public.uploads
  DROP CONSTRAINT IF EXISTS uploads_replacement_reason_check,
  ADD CONSTRAINT uploads_replacement_reason_check CHECK (
    replacement_reason IS NULL OR replacement_reason IN (
      'stale', 'failed', 'cancelled', 'legacy_unvalidated',
      'raw_audit_blocked', 'g6r-real-demo-replay'
    )
  ),
  ADD CONSTRAINT uploads_controlled_replay_attempt_check CHECK (
    replacement_reason IS DISTINCT FROM 'g6r-real-demo-replay' OR attempt_number = 9
  );

ALTER TABLE public.demo_jobs
  DROP CONSTRAINT IF EXISTS demo_jobs_replacement_reason_check,
  ADD CONSTRAINT demo_jobs_replacement_reason_check CHECK (
    replacement_reason IS NULL OR replacement_reason IN (
      'stale', 'failed', 'cancelled', 'legacy_unvalidated',
      'raw_audit_blocked', 'g6r-real-demo-replay'
    )
  ),
  ADD CONSTRAINT demo_jobs_controlled_replay_attempt_check CHECK (
    replacement_reason IS DISTINCT FROM 'g6r-real-demo-replay' OR attempt_number = 9
  );

CREATE TABLE public.parser_runtime_provenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  railway_project_id text NOT NULL,
  railway_service_id text NOT NULL,
  railway_environment_id text NOT NULL,
  railway_branch text NOT NULL,
  deployment_id text NOT NULL,
  deployment_commit text NOT NULL,
  parser_name text NOT NULL,
  parser_version text NOT NULL,
  contract_version integer NOT NULL,
  semantic_revision text NOT NULL,
  build_revision text NOT NULL,
  verification_timestamp timestamptz NOT NULL,
  verification_method text NOT NULL,
  critical_source_hashes jsonb NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parser_runtime_provenance_status_check CHECK (status IN ('VERIFIED', 'REJECTED', 'EXPIRED')),
  CONSTRAINT parser_runtime_provenance_contract_check CHECK (contract_version > 0),
  CONSTRAINT parser_runtime_provenance_hashes_check CHECK (
    jsonb_typeof(critical_source_hashes) = 'object' AND critical_source_hashes <> '{}'::jsonb
  )
);
GRANT ALL ON public.parser_runtime_provenance TO service_role;
ALTER TABLE public.parser_runtime_provenance ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX parser_runtime_provenance_deployment_identity_idx
  ON public.parser_runtime_provenance (
    railway_project_id, railway_service_id, railway_environment_id,
    deployment_id, deployment_commit, semantic_revision, build_revision
  );

CREATE OR REPLACE FUNCTION public.prevent_parser_runtime_provenance_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RAISE EXCEPTION 'PARSER_PROVENANCE_IMMUTABLE' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER parser_runtime_provenance_immutable
BEFORE UPDATE OR DELETE ON public.parser_runtime_provenance
FOR EACH ROW EXECUTE FUNCTION public.prevent_parser_runtime_provenance_mutation();

CREATE OR REPLACE FUNCTION public.assert_verified_parser_provenance(_provenance_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _p public.parser_runtime_provenance%ROWTYPE;
BEGIN
  SELECT * INTO _p
  FROM public.parser_runtime_provenance
  WHERE id = _provenance_id;

  IF _p.id IS NULL
     OR _p.status <> 'VERIFIED'
     OR _p.railway_project_id <> 'aa2176ec-0e35-45f0-8cfa-9f8c0707dca4'
     OR _p.railway_service_id <> '706fa246-a263-484f-a986-c74516be862b'
     OR _p.railway_environment_id <> '2385d707-795d-4e32-a00b-0afaba0a9b7e'
     OR _p.railway_branch <> 'infra/cs2-parser-worker-v8'
     OR _p.deployment_commit <> '5703b1d88f21ee57fdd1d83722edf30e0f0c6f76'
     OR _p.parser_name <> 'demoparser2'
     OR _p.parser_version <> '0.42.0'
     OR _p.contract_version <> 1
     OR _p.semantic_revision <> 'git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76'
     OR _p.build_revision <> 'git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76'
     OR _p.verification_timestamp > now()
     OR _p.verification_timestamp < now() - interval '24 hours'
     OR length(btrim(_p.deployment_id)) = 0
     OR length(btrim(_p.verification_method)) = 0
     OR jsonb_typeof(_p.critical_source_hashes) <> 'object'
     OR _p.critical_source_hashes = '{}'::jsonb THEN
    RAISE EXCEPTION 'PARSER_PROVENANCE_UNVERIFIED' USING ERRCODE = '55000';
  END IF;

  RETURN jsonb_build_object(
    'provenance_id', _p.id,
    'status', _p.status,
    'deployment_id', _p.deployment_id,
    'deployment_commit', _p.deployment_commit,
    'railway_branch', _p.railway_branch,
    'parser_name', _p.parser_name,
    'parser_version', _p.parser_version,
    'contract_version', _p.contract_version,
    'semantic_revision', _p.semantic_revision,
    'build_revision', _p.build_revision,
    'verification_timestamp', _p.verification_timestamp
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_controlled_demo_replay_attempt_9(
  _user_id uuid,
  _source_job_id uuid,
  _source_upload_id uuid,
  _expected_attempt integer,
  _expected_sha256 text,
  _expected_size bigint,
  _replay_reason text,
  _new_upload_id uuid,
  _provenance_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _source_job public.demo_jobs%ROWTYPE;
  _source_upload public.uploads%ROWTYPE;
  _existing_upload public.uploads%ROWTYPE;
  _existing_job public.demo_jobs%ROWTYPE;
  _attempts_above integer;
  _attempt_nine_count integer;
  _storage_path text;
  _provenance jsonb;
BEGIN
  IF _user_id IS NULL OR _source_job_id IS NULL OR _source_upload_id IS NULL
     OR _new_upload_id IS NULL OR _provenance_id IS NULL THEN
    RAISE EXCEPTION 'CONTROLLED_REPLAY_INVALID_INPUT' USING ERRCODE = '22023';
  END IF;
  IF _expected_attempt <> 8 OR _replay_reason <> 'g6r-real-demo-replay'
     OR _expected_sha256 !~ '^[0-9a-f]{64}$' OR _expected_size <> 473748061 THEN
    RAISE EXCEPTION 'CONTROLLED_REPLAY_CONTRACT_MISMATCH' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text || ':' || _expected_sha256, 0));
  _provenance := public.assert_verified_parser_provenance(_provenance_id);

  SELECT * INTO _source_job
  FROM public.demo_jobs
  WHERE id = _source_job_id AND user_id = _user_id
  FOR UPDATE;
  IF _source_job.id IS NULL
     OR _source_job.upload_id <> _source_upload_id
     OR _source_job.attempt_number <> 8
     OR _source_job.status <> 'failed'
     OR _source_job.demo_sha256 <> _expected_sha256
     OR _source_job.file_size <> _expected_size
     OR _source_job.storage_path <> _user_id::text || '/' || _source_upload_id::text || '.dem' THEN
    RAISE EXCEPTION 'SOURCE_JOB_MISMATCH' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO _source_upload
  FROM public.uploads
  WHERE id = _source_upload_id AND user_id = _user_id
  FOR UPDATE;
  IF _source_upload.id IS NULL
     OR _source_upload.attempt_number <> 8
     OR _source_upload.status <> 'failed'
     OR _source_upload.demo_sha256 <> _expected_sha256
     OR _source_upload.file_size <> _expected_size
     OR _source_upload.storage_path <> _source_job.storage_path THEN
    RAISE EXCEPTION 'SOURCE_UPLOAD_MISMATCH' USING ERRCODE = '55000';
  END IF;

  SELECT count(*) FILTER (WHERE attempt_number > 9),
         count(*) FILTER (WHERE attempt_number = 9)
  INTO _attempts_above, _attempt_nine_count
  FROM public.uploads
  WHERE user_id = _user_id AND demo_sha256 = _expected_sha256;

  IF _attempts_above > 0 THEN
    RAISE EXCEPTION 'ATTEMPT_10_FORBIDDEN' USING ERRCODE = '55000';
  END IF;
  IF _attempt_nine_count > 1 THEN
    RAISE EXCEPTION 'DUPLICATE_ATTEMPT_9' USING ERRCODE = '55000';
  END IF;

  IF _attempt_nine_count = 1 THEN
    SELECT * INTO _existing_upload
    FROM public.uploads
    WHERE user_id = _user_id
      AND demo_sha256 = _expected_sha256
      AND attempt_number = 9
    FOR UPDATE;
    SELECT * INTO _existing_job
    FROM public.demo_jobs
    WHERE upload_id = _existing_upload.id
    FOR UPDATE;

    IF _existing_upload.status NOT IN ('pending', 'processing')
       OR _existing_upload.supersedes_job_id <> _source_job_id
       OR _existing_upload.replacement_reason <> 'g6r-real-demo-replay'
       OR _existing_upload.file_size <> _expected_size
       OR _existing_upload.storage_path <> _user_id::text || '/' || _existing_upload.id::text || '.dem'
       OR (_existing_job.id IS NOT NULL AND (
         _existing_job.attempt_number <> 9
         OR _existing_job.supersedes_job_id <> _source_job_id
         OR _existing_job.replacement_reason <> 'g6r-real-demo-replay'
         OR _existing_job.status NOT IN ('pending', 'processing')
       )) THEN
      RAISE EXCEPTION 'ATTEMPT_9_INCOMPATIBLE' USING ERRCODE = '55000';
    END IF;

    RETURN jsonb_build_object(
      'upload_id', _existing_upload.id,
      'storage_path', _existing_upload.storage_path,
      'attempt_number', 9,
      'supersedes_job_id', _source_job_id,
      'replacement_reason', 'g6r-real-demo-replay',
      'reservation_status', CASE WHEN _existing_job.id IS NULL THEN 'RESERVED' ELSE 'ENQUEUED' END,
      'job_id', _existing_job.id,
      'provenance', _provenance
    );
  END IF;

  _storage_path := _user_id::text || '/' || _new_upload_id::text || '.dem';
  INSERT INTO public.uploads (
    id, user_id, type, source, file_name, file_size, mime_type, demo_sha256,
    storage_path, status, processed_at, error_code, error_message,
    attempt_number, supersedes_job_id, replacement_reason
  ) VALUES (
    _new_upload_id, _user_id, 'demo', 'manual', _source_upload.file_name,
    _expected_size, 'application/octet-stream', _expected_sha256,
    _storage_path, 'pending', NULL, NULL, NULL,
    9, _source_job_id, 'g6r-real-demo-replay'
  );

  RETURN jsonb_build_object(
    'upload_id', _new_upload_id,
    'storage_path', _storage_path,
    'attempt_number', 9,
    'supersedes_job_id', _source_job_id,
    'replacement_reason', 'g6r-real-demo-replay',
    'reservation_status', 'CREATED',
    'job_id', NULL,
    'provenance', _provenance
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_controlled_demo_replay_attempt_9(
  _user_id uuid,
  _upload_id uuid,
  _source_job_id uuid,
  _admin_user_id uuid,
  _provenance_id uuid,
  _source_sha256 text,
  _destination_sha256 text,
  _source_size bigint,
  _destination_size bigint,
  _copy_outcome text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _upload public.uploads%ROWTYPE;
  _queued jsonb;
  _job_id uuid;
  _provenance jsonb;
BEGIN
  IF NOT public.is_admin_master(_admin_user_id) THEN
    RAISE EXCEPTION 'ADMIN_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF _source_sha256 <> '0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d'
     OR _destination_sha256 <> _source_sha256
     OR _source_size <> 473748061
     OR _destination_size <> _source_size
     OR _copy_outcome NOT IN ('COPIED', 'ALREADY_COPIED') THEN
    RAISE EXCEPTION 'COPY_VERIFICATION_MISMATCH' USING ERRCODE = '55000';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text || ':' || _source_sha256, 0));
  _provenance := public.assert_verified_parser_provenance(_provenance_id);

  SELECT * INTO _upload
  FROM public.uploads
  WHERE id = _upload_id AND user_id = _user_id
  FOR UPDATE;
  IF _upload.id IS NULL
     OR _upload.attempt_number <> 9
     OR _upload.status <> 'pending'
     OR _upload.supersedes_job_id <> _source_job_id
     OR _upload.replacement_reason <> 'g6r-real-demo-replay'
     OR _upload.demo_sha256 <> _source_sha256
     OR _upload.file_size <> _source_size
     OR _upload.storage_path <> _user_id::text || '/' || _upload_id::text || '.dem' THEN
    RAISE EXCEPTION 'ATTEMPT_9_RESERVATION_MISMATCH' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.uploads
    WHERE user_id = _user_id AND demo_sha256 = _source_sha256 AND attempt_number > 9
  ) THEN
    RAISE EXCEPTION 'ATTEMPT_10_FORBIDDEN' USING ERRCODE = '55000';
  END IF;

  _queued := public.enqueue_demo_job(_upload_id, _user_id);
  _job_id := NULLIF(_queued->>'job_id', '')::uuid;
  IF _job_id IS NULL
     OR (_queued->>'attempt_number')::integer <> 9
     OR _queued->>'status' <> 'pending'
     OR _queued->>'supersedes_job_id' <> _source_job_id::text
     OR _queued->>'replacement_reason' <> 'g6r-real-demo-replay' THEN
    RAISE EXCEPTION 'ATTEMPT_9_ENQUEUE_MISMATCH' USING ERRCODE = '55000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.admin_audit_logs
    WHERE action = 'DEMO_CONTROLLED_REPLAY_CREATED'
      AND metadata->>'destination_job_id' = _job_id::text
  ) THEN
    INSERT INTO public.admin_audit_logs (admin_user_id, target_user_id, action, metadata)
    VALUES (
      _admin_user_id,
      _user_id,
      'DEMO_CONTROLLED_REPLAY_CREATED',
      jsonb_build_object(
        'source_job_id', _source_job_id,
        'source_upload_id', (SELECT upload_id FROM public.demo_jobs WHERE id = _source_job_id),
        'destination_upload_id', _upload_id,
        'destination_job_id', _job_id,
        'source_sha256', _source_sha256,
        'destination_sha256', _destination_sha256,
        'source_size', _source_size,
        'destination_size', _destination_size,
        'attempt_number', 9,
        'replacement_reason', 'g6r-real-demo-replay',
        'supersedes_job_id', _source_job_id,
        'provenance', _provenance,
        'copy_verification_result', _copy_outcome,
        'timestamp', now()
      )
    );
  END IF;

  RETURN _queued || jsonb_build_object('provenance', _provenance, 'audit_status', 'RECORDED');
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_parser_runtime_provenance_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_verified_parser_provenance(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_verified_parser_provenance(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.reserve_controlled_demo_replay_attempt_9(uuid, uuid, uuid, integer, text, bigint, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_controlled_demo_replay_attempt_9(uuid, uuid, uuid, integer, text, bigint, text, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.finalize_controlled_demo_replay_attempt_9(uuid, uuid, uuid, uuid, uuid, text, text, bigint, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_controlled_demo_replay_attempt_9(uuid, uuid, uuid, uuid, uuid, text, text, bigint, bigint, text) TO service_role;

COMMENT ON TABLE public.parser_runtime_provenance IS
  'Append-only evidence for parser deployment provenance. VERIFIED rows expire after 24 hours for replay admission.';
COMMENT ON FUNCTION public.reserve_controlled_demo_replay_attempt_9(uuid, uuid, uuid, integer, text, bigint, text, uuid, uuid) IS
  'Atomically validates attempt 8 and verified parser provenance, then creates or safely reuses exactly controlled attempt 9.';
COMMENT ON FUNCTION public.finalize_controlled_demo_replay_attempt_9(uuid, uuid, uuid, uuid, uuid, text, text, bigint, bigint, text) IS
  'Atomically enqueues a storage-verified controlled attempt 9 through the official lifecycle and records its audit event.';