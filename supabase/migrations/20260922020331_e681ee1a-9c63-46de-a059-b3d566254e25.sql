CREATE TABLE public.canonical_mapping_inventory (
  canonical_field text PRIMARY KEY,
  source_capability text NOT NULL,
  source_field text NOT NULL,
  parser_api text NOT NULL,
  python_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  wasm_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  event_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  normalization text NOT NULL,
  normalization_executed boolean NOT NULL DEFAULT false,
  identity_requirement text NOT NULL,
  null_semantics text NOT NULL,
  zero_semantics text NOT NULL,
  false_semantics text NOT NULL,
  empty_string_semantics text NOT NULL,
  missing_semantics text NOT NULL,
  evidence_class text NOT NULL,
  parity_status text NOT NULL,
  determinism_status text NOT NULL,
  canonical_authorization boolean NOT NULL DEFAULT false,
  review_status text NOT NULL,
  mapping_status text NOT NULL,
  depends_on_full_tick_domain boolean NOT NULL DEFAULT false,
  semantic_mismatch boolean NOT NULL DEFAULT false,
  last_verified_at timestamptz,
  evidence_digest text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT canonical_mapping_inventory_status_check CHECK (mapping_status IN ('PROPOSED','REVIEWED','RECONCILED','PARITY_PENDING','DETERMINISM_PENDING','AUTHORIZED_CANONICAL','RAW_ONLY','BLOCKED','REJECTED')),
  CONSTRAINT canonical_mapping_inventory_parity_check CHECK (parity_status IN ('NOT_RUN','BLOCKED','FAILED','VERIFIED')),
  CONSTRAINT canonical_mapping_inventory_determinism_check CHECK (determinism_status IN ('NOT_RUN','BLOCKED','FAILED','VERIFIED')),
  CONSTRAINT canonical_mapping_inventory_evidence_digest_check CHECK (evidence_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT canonical_mapping_inventory_authorization_check CHECK (
    canonical_authorization = false OR (
      mapping_status = 'AUTHORIZED_CANONICAL'
      AND parity_status = 'VERIFIED'
      AND determinism_status = 'VERIFIED'
      AND normalization_executed
      AND NOT depends_on_full_tick_domain
      AND NOT semantic_mismatch
      AND last_verified_at IS NOT NULL
    )
  )
);
GRANT ALL ON public.canonical_mapping_inventory TO service_role;
ALTER TABLE public.canonical_mapping_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY canonical_mapping_inventory_service_role_only ON public.canonical_mapping_inventory FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.canonical_mapping_inventory (
  canonical_field, source_capability, source_field, parser_api, python_evidence,
  wasm_evidence, event_evidence, normalization, identity_requirement,
  null_semantics, zero_semantics, false_semantics, empty_string_semantics,
  missing_semantics, evidence_class, parity_status, determinism_status,
  review_status, mapping_status, evidence_digest
) VALUES
('CanonicalMatch.map','header.map_name','map_name','parse_header','{"ref":"project_catalog:header:map_name"}'::jsonb,'["src/wasm/src/lib.rs#L354-L384"]'::jsonb,'{}'::jsonb,'canonical CS2 map-code normalization','NOT_APPLICABLE','unknown map','INVALID','INVALID','missing','null','DECLARED_SOURCE_ONLY','NOT_RUN','NOT_RUN','REVIEWED','PARITY_PENDING','79e07bfa88a76c4960a1cf3e803c422f7b35063cc805f892defb5d549fc65113'),
('CanonicalParticipant.steamId64','player_info.steamid','steamid','parse_player_info','{"ref":"project_catalog:player_info:steamid"}'::jsonb,'["src/wasm/src/lib.rs#L293-L352"]'::jsonb,'{}'::jsonb,'decimal SteamID64 string; zero is unlinked','STEAM_ID64_OR_NULL','unlinked participant','null','INVALID','null','null','DECLARED_SOURCE_ONLY','NOT_RUN','NOT_RUN','REVIEWED','PARITY_PENDING','df4f0ec14eca455103e36f3a233327a27a47f1c74a381d137282ed3cec3cba60'),
('CanonicalParticipant.nicknameSnapshot','player_info.name','name','parse_player_info','{"ref":"project_catalog:player_info:name"}'::jsonb,'["src/wasm/src/lib.rs#L293-L352"]'::jsonb,'{}'::jsonb,'bounded UTF-8 snapshot; never identity','NICKNAME_NOT_STRONG_IDENTITY','unknown nickname','INVALID','INVALID','null','null','DECLARED_SOURCE_ONLY','NOT_RUN','NOT_RUN','REVIEWED','PARITY_PENDING','cae9de2fe01a4c1e26f0b91fa8b2400070f3a90c3a1cca7d0fbc37078c913963'),
('CanonicalRound.startTick','rounds.start_tick','round_start.tick','parse_event','{"ref":"project_catalog:rounds:start_tick"}'::jsonb,'[]'::jsonb,'{"required":"REAL_DEM"}'::jsonb,'non-negative integer preserving parser order','NOT_APPLICABLE','unknown boundary','valid tick zero','INVALID','INVALID','null','DECLARED_SOURCE_ONLY','NOT_RUN','NOT_RUN','REVIEWED','PARITY_PENDING','39fc787bb0247b591299193d0b7f18a25b240a0d1d926c6c133a1fd32d79608a'),
('CanonicalRound.endTick','rounds.end_tick','round_end.tick','parse_event','{"ref":"project_catalog:rounds:end_tick"}'::jsonb,'[]'::jsonb,'{"required":"REAL_DEM"}'::jsonb,'first valid end after start; pre-start ends ignored','NOT_APPLICABLE','unknown boundary','valid only when ordered after start','INVALID','INVALID','null','DECLARED_SOURCE_ONLY','NOT_RUN','NOT_RUN','REVIEWED','PARITY_PENDING','fce97d9cc6d36e6f9a71a97f9a2dd11027acb3251be914982f5d2d1ab263fa12'),
('CanonicalRound.winningSide','rounds.winner_side','round_end.winner','parse_event','{"ref":"project_catalog:rounds:winner_side"}'::jsonb,'[]'::jsonb,'{"required":"REAL_DEM"}'::jsonb,'explicit CT/T parser-side value only','TEAM_SLOT_IS_NOT_ROUND_SIDE','unknown side','unknown','INVALID','unknown','null','DECLARED_SOURCE_ONLY','NOT_RUN','NOT_RUN','REVIEWED','PARITY_PENDING','74dbaea44940b4139f699a329564b7ac4fc63968512699350310967c160e2be7'),
('CanonicalEvent.sourceActorExternalId','event_fields.attacker_steamid','attacker_steamid','parse_event','{"ref":"project_catalog:event_fields:attacker_steamid"}'::jsonb,'[]'::jsonb,'{"required":"REAL_DEM"}'::jsonb,'source identifier preserved verbatim; participant resolution separate','SOURCE_ID_NOT_PARTICIPANT_KEY','unresolved actor','null','INVALID','null','null','DECLARED_SOURCE_ONLY','NOT_RUN','NOT_RUN','REVIEWED','PARITY_PENDING','71be4b14d2fdde55827820e66b137462261435ca28bbda7a8d2cdfb707d42d82');

ALTER TABLE public.parser_runtime_provenance
  ADD COLUMN IF NOT EXISTS git_tree text,
  ADD COLUMN IF NOT EXISTS attestation_payload jsonb,
  ADD COLUMN IF NOT EXISTS attestor_identity jsonb,
  ADD COLUMN IF NOT EXISTS workflow_identity jsonb,
  ADD COLUMN IF NOT EXISTS attestation_signature text;

ALTER TABLE public.parser_runtime_provenance
  ADD CONSTRAINT parser_runtime_provenance_git_tree_check CHECK (git_tree IS NULL OR git_tree ~ '^[0-9a-f]{40}$'),
  ADD CONSTRAINT parser_runtime_provenance_attestation_payload_check CHECK (attestation_payload IS NULL OR jsonb_typeof(attestation_payload) = 'object'),
  ADD CONSTRAINT parser_runtime_provenance_attestor_identity_check CHECK (attestor_identity IS NULL OR jsonb_typeof(attestor_identity) = 'object'),
  ADD CONSTRAINT parser_runtime_provenance_workflow_identity_check CHECK (workflow_identity IS NULL OR jsonb_typeof(workflow_identity) = 'object'),
  ADD CONSTRAINT parser_runtime_provenance_signature_check CHECK (attestation_signature IS NULL OR attestation_signature ~ '^[0-9a-f]{64}$');

CREATE OR REPLACE FUNCTION public.assert_canonical_mapping_gate()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _total integer;
  _authorized integer;
  _blocked integer;
  _unverified integer;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE canonical_authorization AND mapping_status = 'AUTHORIZED_CANONICAL'),
         count(*) FILTER (WHERE mapping_status IN ('BLOCKED','REJECTED') OR semantic_mismatch OR depends_on_full_tick_domain),
         count(*) FILTER (WHERE NOT canonical_authorization OR mapping_status <> 'AUTHORIZED_CANONICAL' OR parity_status <> 'VERIFIED' OR determinism_status <> 'VERIFIED' OR NOT normalization_executed OR last_verified_at IS NULL)
  INTO _total, _authorized, _blocked, _unverified
  FROM public.canonical_mapping_inventory;
  IF _total = 0 OR _blocked > 0 OR _unverified > 0 THEN
    RAISE EXCEPTION 'CANONICAL_MAPPING_GATE_BLOCKED:total=%,authorized=%,blocked=%,unverified=%', _total, _authorized, _blocked, _unverified USING ERRCODE = '55000';
  END IF;
  RETURN jsonb_build_object('status','VERIFIED','canonical_required_mappings_total',_total,'canonical_authorized_mappings',_authorized,'canonical_blocked_mappings',_blocked,'canonical_unverified_mappings',_unverified);
END;
$$;
REVOKE ALL ON FUNCTION public.assert_canonical_mapping_gate() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_canonical_mapping_gate() TO service_role;

CREATE OR REPLACE FUNCTION public.record_parser_runtime_attestation(
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
  IF _payload IS NULL OR jsonb_typeof(_payload) <> 'object'
     OR _release_gate_evidence IS NULL OR jsonb_typeof(_release_gate_evidence) <> 'object'
     OR _attestation_digest !~ '^[0-9a-f]{64}$' OR _signature !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'PARSER_ATTESTATION_INVALID_INPUT' USING ERRCODE = '22023';
  END IF;
  _secret := current_setting('app.settings.parser_attestation_hmac_secret', true);
  IF _secret IS NULL OR length(_secret) < 32 THEN
    RAISE EXCEPTION 'PARSER_ATTESTATION_SECRET_NOT_CONFIGURED' USING ERRCODE = '55000';
  END IF;
  IF encode(extensions.digest(convert_to(_payload::text,'UTF8'),'sha256'),'hex') <> _attestation_digest THEN
    RAISE EXCEPTION 'PARSER_ATTESTATION_DIGEST_MISMATCH' USING ERRCODE = '55000';
  END IF;
  _expected_signature := encode(extensions.hmac(convert_to(_payload::text,'UTF8'),convert_to(_secret,'UTF8'),'sha256'),'hex');
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
     OR _payload->>'parser_name' <> 'demoparser2'
     OR _payload->>'parser_version' <> '0.42.0'
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
REVOKE ALL ON FUNCTION public.record_parser_runtime_attestation(jsonb,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_parser_runtime_attestation(jsonb,text,text,jsonb) TO service_role;

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
  SELECT * INTO _p FROM public.parser_runtime_provenance WHERE id = _provenance_id;
  IF _p.id IS NULL OR _p.status <> 'VERIFIED'
     OR _p.verification_timestamp IS NULL
     OR _p.verification_timestamp > now() + interval '5 minutes'
     OR _p.verification_timestamp < now() - interval '24 hours'
     OR _p.repository_full_name <> 'GameProAcademy/cs2-pro-hub'
     OR _p.railway_branch <> 'infra/cs2-parser-worker-v8'
     OR _p.deployment_id <> '6330c8c4-a410-45db-a364-4eb47702c2fc'
     OR _p.deployment_commit <> '5703b1d88f21ee57fdd1d83722edf30e0f0c6f76'
     OR _p.parser_name <> 'demoparser2' OR _p.parser_version <> '0.42.0' OR _p.contract_version <> 1
     OR _p.semantic_revision <> 'git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76'
     OR _p.build_revision <> 'git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76'
     OR _p.git_tree !~ '^[0-9a-f]{40}$'
     OR _p.attestation_payload IS NULL OR _p.attestor_identity->>'provider' <> 'github_actions'
     OR _p.workflow_identity->>'workflow_sha' <> _p.deployment_commit
     OR encode(extensions.digest(convert_to(_p.attestation_payload::text,'UTF8'),'sha256'),'hex') <> _p.attestation_digest
     OR _p.attestation_signature !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'PARSER_PROVENANCE_UNVERIFIED' USING ERRCODE = '55000';
  END IF;
  RETURN jsonb_build_object('status','VERIFIED','provenance_id',_p.id,'verification_timestamp',_p.verification_timestamp,'attestation_digest',_p.attestation_digest,'deployment_id',_p.deployment_id,'deployment_commit',_p.deployment_commit,'railway_branch',_p.railway_branch);
END;
$$;
REVOKE ALL ON FUNCTION public.assert_verified_parser_provenance(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_verified_parser_provenance(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.assert_real_demo_release_ready(_provenance_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _provenance jsonb;
  _mapping jsonb;
  _evidence jsonb;
  _required constant text[] := ARRAY['parser_runtime_identity','provenance_verified','provenance_fresh','provenance_immutable','attestation_valid','github_source_identity','railway_deployment_identity','runtime_version','custom_domain_binding','critical_file_hashes','canonical_scoped_field_gate','mapping_inventory','tick_domain','real_demo_authorization','attempt_sequencing','cleanup_safety','retry_safety','storage_copy_safety','no_attempt_10_plus','no_canonical_contamination','unresolved_required_mapping','ci'];
  _key text;
  _attempt_10_plus integer;
BEGIN
  _provenance := public.assert_verified_parser_provenance(_provenance_id);
  _mapping := public.assert_canonical_mapping_gate();
  SELECT release_gate_evidence INTO _evidence FROM public.parser_runtime_provenance WHERE id = _provenance_id;
  IF _evidence IS NULL OR jsonb_typeof(_evidence) <> 'object' THEN
    RAISE EXCEPTION 'REAL_DEMO_RELEASE_EVIDENCE_INVALID' USING ERRCODE = '55000';
  END IF;
  FOREACH _key IN ARRAY _required LOOP
    IF jsonb_typeof(_evidence->_key) <> 'object'
       OR _evidence->_key->>'status' <> 'VERIFIED'
       OR length(btrim(coalesce(_evidence->_key->>'evidence_ref',''))) = 0 THEN
      RAISE EXCEPTION 'REAL_DEMO_RELEASE_GATE_BLOCKED:%', _key USING ERRCODE = '55000';
    END IF;
  END LOOP;
  SELECT count(*) INTO _attempt_10_plus FROM public.uploads
  WHERE user_id='348b6f66-386d-48c4-bac1-7382ab12d7be'::uuid
    AND demo_sha256='0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d'
    AND attempt_number >= 10;
  IF _attempt_10_plus <> 0 THEN
    RAISE EXCEPTION 'ATTEMPT_10_FORBIDDEN' USING ERRCODE = '55000';
  END IF;
  RETURN jsonb_build_object('status','RELEASE_GATE_VERIFIED','provenance',_provenance,'canonical_mapping_gate',_mapping,'gate_count',array_length(_required,1));
END;
$$;
REVOKE ALL ON FUNCTION public.assert_real_demo_release_ready(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_real_demo_release_ready(uuid) TO service_role;

COMMENT ON TABLE public.canonical_mapping_inventory IS 'Service-only Canonical mapping governance. Fields stay blocked until real same-DEM parity and determinism evidence authorizes them.';
COMMENT ON FUNCTION public.record_parser_runtime_attestation(jsonb,text,text,jsonb) IS 'Records VERIFIED provenance only after deterministic digest, trusted HMAC, exact GitHub/Railway/runtime identity, and critical hash validation. Missing secret fails closed.';
COMMENT ON FUNCTION public.assert_real_demo_release_ready(uuid) IS 'Fail-closed 22-condition release gate. Verification does not create or authorize automatic replay.';