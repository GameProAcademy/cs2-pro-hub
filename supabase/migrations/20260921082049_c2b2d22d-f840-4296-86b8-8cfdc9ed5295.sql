ALTER TABLE public.parser_runtime_provenance
  ADD COLUMN repository_full_name text,
  ADD COLUMN attestation_version integer,
  ADD COLUMN attestation_digest text,
  ADD COLUMN verified_endpoint text,
  ADD COLUMN source_proof jsonb,
  ADD COLUMN deployment_proof jsonb,
  ADD COLUMN runtime_proof jsonb,
  ADD COLUMN app_source_commit text;

ALTER TABLE public.parser_runtime_provenance
  DROP CONSTRAINT parser_runtime_provenance_status_check,
  ADD CONSTRAINT parser_runtime_provenance_status_check
    CHECK (status IN ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED')),
  ADD CONSTRAINT parser_runtime_provenance_verification_method_check
    CHECK (verification_method = 'GITHUB_COMMIT_RAILWAY_DEPLOYMENT_LIVE_VERSION_V1'),
  ADD CONSTRAINT parser_runtime_provenance_attestation_version_check
    CHECK (attestation_version = 1),
  ADD CONSTRAINT parser_runtime_provenance_attestation_digest_check
    CHECK (attestation_digest ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT parser_runtime_provenance_repository_check
    CHECK (repository_full_name = 'GameProAcademy/cs2-pro-hub'),
  ADD CONSTRAINT parser_runtime_provenance_endpoint_check
    CHECK (verified_endpoint IN (
      'https://parser.gamepro.network',
      'https://cs2-demo-parser-production.up.railway.app'
    )),
  ADD CONSTRAINT parser_runtime_provenance_proofs_shape_check CHECK (
    jsonb_typeof(source_proof) = 'object'
    AND jsonb_typeof(deployment_proof) = 'object'
    AND jsonb_typeof(runtime_proof) = 'object'
  ),
  ADD CONSTRAINT parser_runtime_provenance_server_time_check CHECK (
    verification_timestamp <= created_at
    AND verification_timestamp >= created_at - interval '5 minutes'
  );

ALTER TABLE public.parser_runtime_provenance
  ALTER COLUMN repository_full_name SET NOT NULL,
  ALTER COLUMN attestation_version SET NOT NULL,
  ALTER COLUMN attestation_digest SET NOT NULL,
  ALTER COLUMN verified_endpoint SET NOT NULL,
  ALTER COLUMN source_proof SET NOT NULL,
  ALTER COLUMN deployment_proof SET NOT NULL,
  ALTER COLUMN runtime_proof SET NOT NULL;

ALTER TABLE public.uploads
  ADD COLUMN controlled_replay_reservation_id uuid,
  ADD COLUMN controlled_replay_source_upload_id uuid REFERENCES public.uploads(id),
  ADD COLUMN controlled_replay_copy_status text,
  ADD COLUMN controlled_replay_copy_verified_at timestamptz,
  ADD CONSTRAINT uploads_controlled_replay_reservation_check CHECK (
    replacement_reason IS DISTINCT FROM 'g6r-real-demo-replay'
    OR (
      attempt_number = 9
      AND controlled_replay_reservation_id IS NOT NULL
      AND controlled_replay_source_upload_id IS NOT NULL
      AND controlled_replay_copy_status IN ('RESERVED', 'VERIFIED')
    )
  ),
  ADD CONSTRAINT uploads_controlled_replay_copy_state_check CHECK (
    (controlled_replay_copy_status = 'VERIFIED') = (controlled_replay_copy_verified_at IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION public.parser_attestation_canonical_payload(_attestation jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path TO ''
AS $$
  SELECT jsonb_build_object(
    'attestation_version', _attestation->'attestation_version',
    'repository_full_name', _attestation->'repository_full_name',
    'railway_project_id', _attestation->'railway_project_id',
    'railway_service_id', _attestation->'railway_service_id',
    'railway_environment_id', _attestation->'railway_environment_id',
    'railway_branch', _attestation->'railway_branch',
    'deployment_id', _attestation->'deployment_id',
    'deployment_commit', _attestation->'deployment_commit',
    'parser_name', _attestation->'parser_name',
    'parser_version', _attestation->'parser_version',
    'contract_version', _attestation->'contract_version',
    'semantic_revision', _attestation->'semantic_revision',
    'build_revision', _attestation->'build_revision',
    'critical_source_hashes', _attestation->'critical_source_hashes',
    'verified_endpoint', _attestation->'verified_endpoint',
    'source_proof', _attestation->'source_proof',
    'deployment_proof', _attestation->'deployment_proof',
    'runtime_proof', _attestation->'runtime_proof'
  )::text
$$;

CREATE OR REPLACE FUNCTION public.parser_attestation_digest(_attestation jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path TO ''
AS $$
  SELECT encode(extensions.digest(
    convert_to(public.parser_attestation_canonical_payload(_attestation), 'UTF8'),
    'sha256'
  ), 'hex')
$$;

CREATE OR REPLACE FUNCTION public.assert_verified_parser_provenance(_provenance_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _p public.parser_runtime_provenance%ROWTYPE;
  _attestation jsonb;
  _expected_hashes constant jsonb := jsonb_build_object(
    'services/cs2-demo-parser/parser.py', jsonb_build_object('expected', '9d21670e47ddf330881e95a9d78c19074ccc0aea', 'observed', '9d21670e47ddf330881e95a9d78c19074ccc0aea', 'match', true, 'source', 'GITHUB_API'),
    'services/cs2-demo-parser/adapter.py', jsonb_build_object('expected', '34ce0f196a0ff86f5452c0e8b1f078f88f9b0c71', 'observed', '34ce0f196a0ff86f5452c0e8b1f078f88f9b0c71', 'match', true, 'source', 'GITHUB_API'),
    'services/cs2-demo-parser/worker.py', jsonb_build_object('expected', 'dfc2e67fcb3644be91108079f9096947c16119b3', 'observed', 'dfc2e67fcb3644be91108079f9096947c16119b3', 'match', true, 'source', 'GITHUB_API'),
    'services/cs2-demo-parser/raw_evidence.py', jsonb_build_object('expected', '750195c1218abd53cfc77b6e8d2fb4a88e31579e', 'observed', '750195c1218abd53cfc77b6e8d2fb4a88e31579e', 'match', true, 'source', 'GITHUB_API'),
    'services/cs2-demo-parser/settings.py', jsonb_build_object('expected', '35eecfb06223812137a4a2f17114aae57cb7fe54', 'observed', '35eecfb06223812137a4a2f17114aae57cb7fe54', 'match', true, 'source', 'GITHUB_API')
  );
BEGIN
  SELECT * INTO _p
  FROM public.parser_runtime_provenance
  WHERE id = _provenance_id;

  IF _p.id IS NULL THEN
    RAISE EXCEPTION 'PARSER_PROVENANCE_UNVERIFIED' USING ERRCODE = '55000';
  END IF;

  _attestation := to_jsonb(_p) - ARRAY['id', 'status', 'verification_timestamp', 'verification_method', 'created_at', 'app_source_commit'];

  IF _p.status <> 'VERIFIED'
     OR _p.repository_full_name <> 'GameProAcademy/cs2-pro-hub'
     OR _p.railway_project_id <> 'aa2176ec-0e35-45f0-8cfa-9f8c0707dca4'
     OR _p.railway_service_id <> '706fa246-a263-484f-a986-c74516be862b'
     OR _p.railway_environment_id <> '2385d707-795d-4e32-a00b-0afaba0a9b7e'
     OR _p.railway_branch <> 'infra/cs2-demo-parser-worker-v8'
     OR _p.deployment_id <> '6330c8c4-a410-45db-a364-4eb47702c2fc'
     OR _p.deployment_commit <> '5703b1d88f21ee57fdd1d83722edf30e0f0c6f76'
     OR _p.parser_name <> 'demoparser2'
     OR _p.parser_version <> '0.42.0'
     OR _p.contract_version <> 1
     OR _p.semantic_revision <> 'git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76'
     OR _p.build_revision <> 'git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76'
     OR _p.attestation_version <> 1
     OR _p.verification_method <> 'GITHUB_COMMIT_RAILWAY_DEPLOYMENT_LIVE_VERSION_V1'
     OR _p.verification_timestamp > _p.created_at
     OR _p.verification_timestamp < _p.created_at - interval '5 minutes'
     OR _p.created_at > now()
     OR _p.created_at < now() - interval '24 hours'
     OR _p.critical_source_hashes <> _expected_hashes
     OR _p.source_proof->>'repository' <> _p.repository_full_name
     OR _p.source_proof->>'commit' <> _p.deployment_commit
     OR _p.source_proof->>'commit_exists' <> 'true'
     OR _p.source_proof->>'branch_contains_commit' <> 'true'
     OR _p.source_proof->>'verification_source' <> 'GITHUB_API'
     OR _p.deployment_proof->>'deployment_id' <> _p.deployment_id
     OR _p.deployment_proof->>'deployment_commit' <> _p.deployment_commit
     OR _p.deployment_proof->>'branch' <> _p.railway_branch
     OR _p.deployment_proof->>'verification_source' <> 'RAILWAY_API'
     OR _p.runtime_proof->>'custom_domain_identity_match' <> 'true'
     OR _p.runtime_proof->>'railway_domain_identity_match' <> 'true'
     OR _p.runtime_proof->>'parse_endpoint_binding_verified' <> 'true'
     OR _p.runtime_proof->>'verification_source' <> 'LIVE_HTTP'
     OR _p.verified_endpoint <> 'https://parser.gamepro.network'
     OR public.parser_attestation_digest(_attestation) <> _p.attestation_digest THEN
    RAISE EXCEPTION 'PARSER_PROVENANCE_UNVERIFIED' USING ERRCODE = '55000';
  END IF;

  RETURN jsonb_build_object(
    'provenance_id', _p.id,
    'status', _p.status,
    'repository_full_name', _p.repository_full_name,
    'deployment_id', _p.deployment_id,
    'deployment_commit', _p.deployment_commit,
    'railway_branch', _p.railway_branch,
    'parser_name', _p.parser_name,
    'parser_version', _p.parser_version,
    'contract_version', _p.contract_version,
    'semantic_revision', _p.semantic_revision,
    'build_revision', _p.build_revision,
    'verified_endpoint', _p.verified_endpoint,
    'attestation_version', _p.attestation_version,
    'attestation_digest', _p.attestation_digest,
    'verification_timestamp', _p.verification_timestamp
  );
END;
$$;

REVOKE ALL ON FUNCTION public.parser_attestation_canonical_payload(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parser_attestation_digest(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_verified_parser_provenance(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.parser_attestation_canonical_payload(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.parser_attestation_digest(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.assert_verified_parser_provenance(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.reserve_controlled_demo_replay_attempt_9(uuid, uuid, uuid, integer, text, bigint, text, uuid, uuid) FROM service_role;

CREATE OR REPLACE FUNCTION public.reserve_controlled_demo_replay_attempt_9(
  _user_id uuid,
  _source_job_id uuid,
  _source_upload_id uuid,
  _expected_attempt integer,
  _expected_sha256 text,
  _expected_size bigint,
  _replay_reason text,
  _new_upload_id uuid,
  _provenance_id uuid,
  _admin_user_id uuid,
  _reservation_id uuid
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
  IF NOT public.is_admin_master(_admin_user_id) THEN
    RAISE EXCEPTION 'ADMIN_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF _user_id IS NULL OR _source_job_id IS NULL OR _source_upload_id IS NULL
     OR _new_upload_id IS NULL OR _provenance_id IS NULL OR _reservation_id IS NULL THEN
    RAISE EXCEPTION 'CONTROLLED_REPLAY_INVALID_INPUT' USING ERRCODE = '22023';
  END IF;
  IF _expected_attempt <> 8 OR _replay_reason <> 'g6r-real-demo-replay'
     OR _expected_sha256 !~ '^[0-9a-f]{64}$' OR _expected_size <> 473748061 THEN
    RAISE EXCEPTION 'CONTROLLED_REPLAY_CONTRACT_MISMATCH' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text || ':' || _expected_sha256, 0));
  _provenance := public.assert_verified_parser_provenance(_provenance_id);

  SELECT * INTO _source_job FROM public.demo_jobs
  WHERE id = _source_job_id AND user_id = _user_id FOR UPDATE;
  IF _source_job.id IS NULL OR _source_job.upload_id <> _source_upload_id
     OR _source_job.attempt_number <> 8 OR _source_job.status <> 'failed'
     OR _source_job.demo_sha256 <> _expected_sha256 OR _source_job.file_size <> _expected_size
     OR _source_job.storage_path <> _user_id::text || '/' || _source_upload_id::text || '.dem' THEN
    RAISE EXCEPTION 'SOURCE_JOB_MISMATCH' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO _source_upload FROM public.uploads
  WHERE id = _source_upload_id AND user_id = _user_id FOR UPDATE;
  IF _source_upload.id IS NULL OR _source_upload.attempt_number <> 8
     OR _source_upload.status <> 'failed' OR _source_upload.demo_sha256 <> _expected_sha256
     OR _source_upload.file_size <> _expected_size OR _source_upload.storage_path <> _source_job.storage_path THEN
    RAISE EXCEPTION 'SOURCE_UPLOAD_MISMATCH' USING ERRCODE = '55000';
  END IF;

  SELECT count(*) FILTER (WHERE attempt_number > 9), count(*) FILTER (WHERE attempt_number = 9)
  INTO _attempts_above, _attempt_nine_count FROM public.uploads
  WHERE user_id = _user_id AND demo_sha256 = _expected_sha256;
  IF _attempts_above > 0 THEN RAISE EXCEPTION 'ATTEMPT_10_FORBIDDEN' USING ERRCODE = '55000'; END IF;
  IF _attempt_nine_count > 1 THEN RAISE EXCEPTION 'DUPLICATE_ATTEMPT_9' USING ERRCODE = '55000'; END IF;

  IF _attempt_nine_count = 1 THEN
    SELECT * INTO _existing_upload FROM public.uploads
    WHERE user_id = _user_id AND demo_sha256 = _expected_sha256 AND attempt_number = 9 FOR UPDATE;
    SELECT * INTO _existing_job FROM public.demo_jobs WHERE upload_id = _existing_upload.id FOR UPDATE;
    IF _existing_upload.status NOT IN ('pending', 'processing')
       OR _existing_upload.supersedes_job_id <> _source_job_id
       OR _existing_upload.replacement_reason <> 'g6r-real-demo-replay'
       OR _existing_upload.file_size <> _expected_size
       OR _existing_upload.storage_path <> _user_id::text || '/' || _existing_upload.id::text || '.dem'
       OR _existing_upload.controlled_replay_reservation_id IS NULL
       OR _existing_upload.controlled_replay_source_upload_id <> _source_upload_id
       OR (_existing_job.id IS NOT NULL AND (
         _existing_job.attempt_number <> 9 OR _existing_job.supersedes_job_id <> _source_job_id
         OR _existing_job.replacement_reason <> 'g6r-real-demo-replay'
         OR _existing_job.status NOT IN ('pending', 'processing')
       )) THEN
      RAISE EXCEPTION 'ATTEMPT_9_INCOMPATIBLE' USING ERRCODE = '55000';
    END IF;
    RETURN jsonb_build_object(
      'upload_id', _existing_upload.id, 'storage_path', _existing_upload.storage_path,
      'attempt_number', 9, 'supersedes_job_id', _source_job_id,
      'replacement_reason', 'g6r-real-demo-replay',
      'reservation_id', _existing_upload.controlled_replay_reservation_id,
      'reservation_status', CASE WHEN _existing_job.id IS NULL THEN 'RESERVED' ELSE 'ENQUEUED' END,
      'job_id', _existing_job.id, 'provenance', _provenance
    );
  END IF;

  _storage_path := _user_id::text || '/' || _new_upload_id::text || '.dem';
  INSERT INTO public.uploads (
    id, user_id, type, source, file_name, file_size, mime_type, demo_sha256,
    storage_path, status, processed_at, error_code, error_message,
    attempt_number, supersedes_job_id, replacement_reason,
    controlled_replay_reservation_id, controlled_replay_source_upload_id,
    controlled_replay_copy_status, controlled_replay_copy_verified_at
  ) VALUES (
    _new_upload_id, _user_id, 'demo', 'manual', _source_upload.file_name,
    _expected_size, 'application/octet-stream', _expected_sha256,
    _storage_path, 'pending', NULL, NULL, NULL,
    9, _source_job_id, 'g6r-real-demo-replay',
    _reservation_id, _source_upload_id, 'RESERVED', NULL
  );

  INSERT INTO public.admin_audit_logs (admin_user_id, target_user_id, action, metadata)
  VALUES (_admin_user_id, _user_id, 'DEMO_CONTROLLED_REPLAY_RESERVED', jsonb_build_object(
    'reservation_id', _reservation_id, 'source_job_id', _source_job_id,
    'source_upload_id', _source_upload_id, 'destination_upload_id', _new_upload_id,
    'attempt_number', 9, 'replacement_reason', 'g6r-real-demo-replay',
    'provenance', _provenance, 'timestamp', now()
  ));

  RETURN jsonb_build_object(
    'upload_id', _new_upload_id, 'storage_path', _storage_path,
    'attempt_number', 9, 'supersedes_job_id', _source_job_id,
    'replacement_reason', 'g6r-real-demo-replay', 'reservation_id', _reservation_id,
    'reservation_status', 'CREATED', 'job_id', NULL, 'provenance', _provenance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_controlled_demo_replay_attempt_9(uuid, uuid, uuid, integer, text, bigint, text, uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_controlled_demo_replay_attempt_9(uuid, uuid, uuid, integer, text, bigint, text, uuid, uuid, uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.finalize_controlled_demo_replay_attempt_9(uuid, uuid, uuid, uuid, uuid, text, text, bigint, bigint, text) FROM service_role;

CREATE OR REPLACE FUNCTION public.finalize_controlled_demo_replay_attempt_9(
  _user_id uuid,
  _upload_id uuid,
  _source_job_id uuid,
  _admin_user_id uuid,
  _provenance_id uuid,
  _reservation_id uuid,
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
  IF NOT public.is_admin_master(_admin_user_id) THEN RAISE EXCEPTION 'ADMIN_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF _reservation_id IS NULL THEN RAISE EXCEPTION 'CONTROLLED_REPLAY_INVALID_INPUT' USING ERRCODE = '22023'; END IF;
  IF _source_sha256 <> '0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d'
     OR _destination_sha256 <> _source_sha256 OR _source_size <> 473748061
     OR _destination_size <> _source_size OR _copy_outcome NOT IN ('COPIED', 'ALREADY_COPIED') THEN
    RAISE EXCEPTION 'COPY_VERIFICATION_MISMATCH' USING ERRCODE = '55000';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text || ':' || _source_sha256, 0));
  _provenance := public.assert_verified_parser_provenance(_provenance_id);
  SELECT * INTO _upload FROM public.uploads WHERE id = _upload_id AND user_id = _user_id FOR UPDATE;
  IF _upload.id IS NULL OR _upload.attempt_number <> 9 OR _upload.status <> 'pending'
     OR _upload.supersedes_job_id <> _source_job_id
     OR _upload.replacement_reason <> 'g6r-real-demo-replay'
     OR _upload.demo_sha256 <> _source_sha256 OR _upload.file_size <> _source_size
     OR _upload.storage_path <> _user_id::text || '/' || _upload_id::text || '.dem'
     OR _upload.controlled_replay_reservation_id <> _reservation_id
     OR _upload.controlled_replay_source_upload_id IS NULL
     OR _upload.controlled_replay_copy_status <> 'RESERVED' THEN
    RAISE EXCEPTION 'ATTEMPT_9_RESERVATION_MISMATCH' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM public.uploads WHERE user_id = _user_id AND demo_sha256 = _source_sha256 AND attempt_number > 9) THEN
    RAISE EXCEPTION 'ATTEMPT_10_FORBIDDEN' USING ERRCODE = '55000';
  END IF;

  UPDATE public.uploads SET controlled_replay_copy_status = 'VERIFIED', controlled_replay_copy_verified_at = now()
  WHERE id = _upload_id;

  _queued := public.enqueue_demo_job(_upload_id, _user_id);
  _job_id := NULLIF(_queued->>'job_id', '')::uuid;
  IF _job_id IS NULL OR (_queued->>'attempt_number')::integer <> 9 OR _queued->>'status' <> 'pending'
     OR _queued->>'supersedes_job_id' <> _source_job_id::text
     OR _queued->>'replacement_reason' <> 'g6r-real-demo-replay' THEN
    RAISE EXCEPTION 'ATTEMPT_9_ENQUEUE_MISMATCH' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.admin_audit_logs (admin_user_id, target_user_id, action, metadata)
  VALUES (_admin_user_id, _user_id, 'DEMO_CONTROLLED_REPLAY_CREATED', jsonb_build_object(
    'reservation_id', _reservation_id, 'source_job_id', _source_job_id,
    'source_upload_id', _upload.controlled_replay_source_upload_id,
    'destination_upload_id', _upload_id, 'destination_job_id', _job_id,
    'source_sha256', _source_sha256, 'destination_sha256', _destination_sha256,
    'source_size', _source_size, 'destination_size', _destination_size,
    'attempt_number', 9, 'replacement_reason', 'g6r-real-demo-replay',
    'supersedes_job_id', _source_job_id, 'provenance', _provenance,
    'copy_verification_result', _copy_outcome, 'timestamp', now()
  ));

  RETURN _queued || jsonb_build_object('reservation_id', _reservation_id, 'provenance', _provenance, 'audit_status', 'RECORDED');
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_controlled_demo_replay_attempt_9(uuid, uuid, uuid, uuid, uuid, uuid, text, text, bigint, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_controlled_demo_replay_attempt_9(uuid, uuid, uuid, uuid, uuid, uuid, text, text, bigint, bigint, text) TO service_role;

COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid) IS
  'One-off G.6-R attempt-9 release gate. Validates exact source, deployment, runtime, hashes, canonical digest and 24-hour server-anchored freshness; every future deployment requires a new migration.';
COMMENT ON COLUMN public.uploads.controlled_replay_reservation_id IS
  'Opaque server-generated binding from the dedicated G.6-R reservation to copy finalization; never supplied by browser input.';