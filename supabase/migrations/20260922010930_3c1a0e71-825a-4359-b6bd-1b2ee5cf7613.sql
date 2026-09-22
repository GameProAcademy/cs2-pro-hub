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
     OR _p.railway_branch <> 'infra/cs2-parser-worker-v8'
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
     OR _p.source_proof->>'branch' <> _p.railway_branch
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

CREATE OR REPLACE FUNCTION public.assert_real_demo_release_ready(
  _provenance_id uuid,
  _gate_evidence jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _provenance jsonb;
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
  IF _gate_evidence IS NULL OR jsonb_typeof(_gate_evidence) <> 'object' THEN
    RAISE EXCEPTION 'REAL_DEMO_RELEASE_EVIDENCE_INVALID' USING ERRCODE = '22023';
  END IF;

  _provenance := public.assert_verified_parser_provenance(_provenance_id);

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

REVOKE ALL ON FUNCTION public.assert_verified_parser_provenance(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_real_demo_release_ready(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_verified_parser_provenance(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.assert_real_demo_release_ready(uuid, jsonb) TO service_role;

COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid) IS
  'G.6-R.4 parser provenance gate bound to the existing Railway deployment and real branch infra/cs2-parser-worker-v8.';
COMMENT ON FUNCTION public.assert_real_demo_release_ready(uuid, jsonb) IS
  'Fail-closed pre-release gate. Requires independently evidenced provenance, CI, field governance, parity, determinism, Canonical admission and storage integrity; it does not create a replay.';