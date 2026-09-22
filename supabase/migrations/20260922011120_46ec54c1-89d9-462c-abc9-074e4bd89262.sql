ALTER TABLE public.parser_runtime_provenance
  ADD COLUMN IF NOT EXISTS release_gate_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT parser_runtime_provenance_release_gate_evidence_check CHECK (
    jsonb_typeof(release_gate_evidence) = 'object'
  );

REVOKE ALL ON FUNCTION public.assert_real_demo_release_ready(uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assert_real_demo_release_ready(_provenance_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _provenance jsonb;
  _gate_evidence jsonb;
  _required_keys constant text[] := ARRAY[
    'ci',
    'critical_tests',
    'mapping_matrix',
    'tick_authority',
    'python_parity',
    'wasm_parity',
    'determinism',
    'canonical_admission',
    'storage_integrity',
    'source_integrity'
  ];
  _key text;
BEGIN
  _provenance := public.assert_verified_parser_provenance(_provenance_id);

  SELECT release_gate_evidence INTO _gate_evidence
  FROM public.parser_runtime_provenance
  WHERE id = _provenance_id;

  IF _gate_evidence IS NULL OR jsonb_typeof(_gate_evidence) <> 'object' THEN
    RAISE EXCEPTION 'REAL_DEMO_RELEASE_EVIDENCE_INVALID' USING ERRCODE = '22023';
  END IF;

  FOREACH _key IN ARRAY _required_keys LOOP
    IF NOT (_gate_evidence ? _key)
       OR jsonb_typeof(_gate_evidence->_key) <> 'object'
       OR NOT ((_gate_evidence->_key) ? 'status')
       OR NOT ((_gate_evidence->_key) ? 'evidence_ref')
       OR length(btrim(COALESCE(_gate_evidence->_key->>'evidence_ref', ''))) = 0 THEN
      RAISE EXCEPTION 'REAL_DEMO_RELEASE_GATE_MISSING:%', _key USING ERRCODE = '55000';
    END IF;
  END LOOP;

  IF _gate_evidence->'ci'->>'status' <> 'PASS'
     OR _gate_evidence->'critical_tests'->>'status' <> 'PASS'
     OR _gate_evidence->'mapping_matrix'->>'status' <> 'PASS'
     OR _gate_evidence->'tick_authority'->>'status' <> 'VERIFIED'
     OR _gate_evidence->'python_parity'->>'status' <> 'VERIFIED'
     OR _gate_evidence->'wasm_parity'->>'status' <> 'VERIFIED'
     OR _gate_evidence->'determinism'->>'status' <> 'VERIFIED'
     OR _gate_evidence->'canonical_admission'->>'status' <> 'PASS'
     OR _gate_evidence->'storage_integrity'->>'status' <> 'PASS'
     OR _gate_evidence->'source_integrity'->>'status' <> 'PASS' THEN
    RAISE EXCEPTION 'REAL_DEMO_RELEASE_NOT_READY' USING ERRCODE = '55000';
  END IF;

  RETURN jsonb_build_object(
    'status', 'READY_FOR_ATTEMPT_9',
    'provenance', _provenance,
    'gate_evidence', _gate_evidence
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
  _release_gate jsonb;
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
  _release_gate := public.assert_real_demo_release_ready(_provenance_id);

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
       OR _existing_upload.controlled_replay_reservation_id IS NULL
       OR _existing_upload.controlled_replay_source_upload_id <> _source_upload_id
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
      'reservation_id', _existing_upload.controlled_replay_reservation_id,
      'reservation_status', CASE WHEN _existing_job.id IS NULL THEN 'RESERVED' ELSE 'ENQUEUED' END,
      'job_id', _existing_job.id,
      'release_gate', _release_gate
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
    'reservation_id', _reservation_id,
    'source_job_id', _source_job_id,
    'source_upload_id', _source_upload_id,
    'destination_upload_id', _new_upload_id,
    'attempt_number', 9,
    'replacement_reason', 'g6r-real-demo-replay',
    'release_gate', _release_gate,
    'timestamp', now()
  ));

  RETURN jsonb_build_object(
    'upload_id', _new_upload_id,
    'storage_path', _storage_path,
    'attempt_number', 9,
    'supersedes_job_id', _source_job_id,
    'replacement_reason', 'g6r-real-demo-replay',
    'reservation_id', _reservation_id,
    'reservation_status', 'CREATED',
    'job_id', NULL,
    'release_gate', _release_gate
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assert_real_demo_release_ready(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_controlled_demo_replay_attempt_9(uuid, uuid, uuid, integer, text, bigint, text, uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_real_demo_release_ready(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_controlled_demo_replay_attempt_9(uuid, uuid, uuid, integer, text, bigint, text, uuid, uuid, uuid, uuid) TO service_role;

COMMENT ON COLUMN public.parser_runtime_provenance.release_gate_evidence IS
  'Immutable server-verified evidence for CI, critical tests, field matrix, tick authority, parity, determinism, Canonical admission and source/storage integrity.';
COMMENT ON FUNCTION public.assert_real_demo_release_ready(uuid) IS
  'Fail-closed authoritative pre-release gate sourced only from immutable service-role provenance; it does not create a replay.';