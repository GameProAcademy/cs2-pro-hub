REVOKE ALL ON TABLE public.canonical_mapping_inventory FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.parser_runtime_provenance FROM PUBLIC, anon, authenticated;

ALTER TABLE public.parser_runtime_provenance
  DROP CONSTRAINT parser_runtime_provenance_verification_method_check,
  ADD CONSTRAINT parser_runtime_provenance_verification_method_check
    CHECK (verification_method IN ('GITHUB_COMMIT_RAILWAY_DEPLOYMENT_LIVE_VERSION_V1','GITHUB_ACTIONS_SIGNED_ATTESTATION_V1'));

REVOKE ALL ON FUNCTION public.record_parser_runtime_attestation(jsonb,text,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_parser_runtime_attestation(
  _canonical_payload text,
  _payload jsonb,
  _attestation_digest text,
  _signature text,
  _release_gate_evidence jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _secret text;
  _expected_signature text;
  _id uuid;
  _now timestamptz := clock_timestamp();
  _critical_hashes jsonb;
BEGIN
  IF _canonical_payload IS NULL OR length(_canonical_payload) = 0
     OR _payload IS NULL OR jsonb_typeof(_payload) <> 'object'
     OR _canonical_payload::jsonb IS DISTINCT FROM _payload
     OR _release_gate_evidence IS NULL OR jsonb_typeof(_release_gate_evidence) <> 'object'
     OR _attestation_digest !~ '^[0-9a-f]{64}$' OR _signature !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'PARSER_ATTESTATION_INVALID_INPUT' USING ERRCODE = '22023';
  END IF;
  _secret := current_setting('app.settings.parser_attestation_hmac_secret', true);
  IF _secret IS NULL OR length(_secret) < 32 THEN
    RAISE EXCEPTION 'PARSER_ATTESTATION_SECRET_NOT_CONFIGURED' USING ERRCODE = '55000';
  END IF;
  IF encode(extensions.digest(convert_to(_canonical_payload,'UTF8'),'sha256'),'hex') <> _attestation_digest THEN
    RAISE EXCEPTION 'PARSER_ATTESTATION_DIGEST_MISMATCH' USING ERRCODE = '55000';
  END IF;
  _expected_signature := encode(extensions.hmac(convert_to(_canonical_payload,'UTF8'),convert_to(_secret,'UTF8'),'sha256'),'hex');
  IF _expected_signature <> _signature THEN
    RAISE EXCEPTION 'PARSER_ATTESTATION_SIGNATURE_INVALID' USING ERRCODE = '42501';
  END IF;
  IF _payload->>'schema_version' <> '1'
     OR _payload->>'repository' <> 'GameProAcademy/cs2-pro-hub'
     OR _payload->>'railway_branch' <> 'infra/cs2-parser-worker-v8'
     OR _payload->>'git_commit' <> '5703b1d88f21ee57fdd1d83722edf30e0f0c6f76'
     OR _payload->>'deployment_id' <> '6330c8c4-a410-45db-a364-4eb47702c2fc'
     OR _payload->>'railway_project_id' <> 'aa2176ec-0e35-45f0-8cfa-9f8c0707dca4'
     OR _payload->>'railway_service_id' <> '706fa246-a263-484f-a986-c74516be862b'
     OR _payload->>'railway_environment_id' <> '2385d707-795d-4e32-a00b-0afaba0a9b7e'
     OR _payload->>'parser_name' <> 'demoparser2' OR _payload->>'parser_version' <> '0.42.0'
     OR (_payload->>'contract_version')::integer <> 1
     OR _payload->>'semantic_revision' <> 'git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76'
     OR _payload->>'build_revision' <> 'git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76'
     OR _payload->>'git_tree' !~ '^[0-9a-f]{40}$'
     OR _payload->'attestor'->>'provider' <> 'github_actions'
     OR length(btrim(coalesce(_payload->'attestor'->>'workflow_ref',''))) = 0
     OR length(btrim(coalesce(_payload->'attestor'->>'run_id',''))) = 0
     OR _payload->'attestor'->>'workflow_sha' <> _payload->>'git_commit'
     OR _payload->'deployment_evidence'->>'deployment_id' <> _payload->>'deployment_id'
     OR _payload->'deployment_evidence'->>'source_branch' <> _payload->>'railway_branch'
     OR _payload->'deployment_evidence'->>'source_commit' <> _payload->>'git_commit'
     OR _payload->'custom_domain_version' IS DISTINCT FROM _payload->'railway_domain_version'
     OR _payload->'custom_domain_version'->>'revision' <> _payload->>'semantic_revision'
     OR _payload->'custom_domain_version'->>'semantic_revision' <> _payload->>'semantic_revision'
     OR _payload->'custom_domain_version'->>'build_revision' <> _payload->>'build_revision' THEN
    RAISE EXCEPTION 'PARSER_ATTESTATION_BINDING_INVALID' USING ERRCODE = '55000';
  END IF;
  _critical_hashes := _payload->'critical_file_hashes';
  IF _critical_hashes->'services/cs2-demo-parser/parser.py'->>'observed' <> '9d21670e47ddf330881e95a9d78c19074ccc0aea'
     OR _critical_hashes->'services/cs2-demo-parser/adapter.py'->>'observed' <> '34ce0f196a0ff86f5452c0e8b1f078f88f9b0c71'
     OR _critical_hashes->'services/cs2-demo-parser/worker.py'->>'observed' <> 'dfc2e67fcb3644be91108079f9096947c16119b3'
     OR _critical_hashes->'services/cs2-demo-parser/raw_evidence.py'->>'observed' <> '750195c1218abd53cfc77b6e8d2fb4a88e31579e'
     OR _critical_hashes->'services/cs2-demo-parser/settings.py'->>'observed' <> '35eecfb06223812137a4a2f17114aae57cb7fe54'
     OR EXISTS (SELECT 1 FROM jsonb_each(_critical_hashes) entry WHERE entry.value->>'match' <> 'true') THEN
    RAISE EXCEPTION 'PARSER_ATTESTATION_CRITICAL_HASH_MISMATCH' USING ERRCODE = '55000';
  END IF;
  INSERT INTO public.parser_runtime_provenance (
    railway_project_id, railway_service_id, railway_environment_id, railway_branch,
    deployment_id, deployment_commit, parser_name, parser_version, contract_version,
    semantic_revision, build_revision, verification_timestamp, verification_method,
    critical_source_hashes, status, repository_full_name, attestation_version,
    attestation_digest, verified_endpoint, source_proof, deployment_proof, runtime_proof,
    app_source_commit, release_gate_evidence, git_tree, attestation_payload,
    attestor_identity, workflow_identity, attestation_signature
  ) VALUES (
    _payload->>'railway_project_id', _payload->>'railway_service_id', _payload->>'railway_environment_id', _payload->>'railway_branch',
    _payload->>'deployment_id', _payload->>'git_commit', _payload->>'parser_name', _payload->>'parser_version', (_payload->>'contract_version')::integer,
    _payload->>'semantic_revision', _payload->>'build_revision', _now, 'GITHUB_ACTIONS_SIGNED_ATTESTATION_V1',
    _critical_hashes, 'VERIFIED', _payload->>'repository', 1, _attestation_digest,
    'https://parser.gamepro.network', jsonb_build_object('repository',_payload->>'repository','branch',_payload->>'railway_branch','commit',_payload->>'git_commit','commit_exists',true,'branch_contains_commit',true,'verification_source','GITHUB_ACTIONS_CHECKOUT'),
    _payload->'deployment_evidence', jsonb_build_object('custom_domain_version',_payload->'custom_domain_version','railway_domain_version',_payload->'railway_domain_version','runtime_health',_payload->'runtime_health','verification_source','LIVE_HTTP'),
    _payload->'attestor'->>'workflow_sha', _release_gate_evidence, _payload->>'git_tree', _payload,
    jsonb_build_object('provider','github_actions','repository',_payload->>'repository'), _payload->'attestor', _signature
  ) RETURNING id INTO _id;
  RETURN _id;
END;
$$;
REVOKE ALL ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb) TO service_role;

COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb) IS 'Service-only signed attestation recorder. Recomputes SHA-256 and HMAC from the exact deterministic payload bytes; missing server secret fails closed.';