DROP FUNCTION IF EXISTS public.record_parser_runtime_attestation(jsonb,text,text,jsonb);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON TABLE public.canonical_mapping_inventory FROM service_role;
GRANT SELECT ON TABLE public.canonical_mapping_inventory TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_canonical_mapping_inventory_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  RAISE EXCEPTION 'CANONICAL_MAPPING_INVENTORY_IMMUTABLE' USING ERRCODE = '55000';
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_canonical_mapping_inventory_mutation() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS canonical_mapping_inventory_immutable ON public.canonical_mapping_inventory;
CREATE TRIGGER canonical_mapping_inventory_immutable BEFORE UPDATE OR DELETE ON public.canonical_mapping_inventory FOR EACH ROW EXECUTE FUNCTION public.prevent_canonical_mapping_inventory_mutation();

CREATE OR REPLACE FUNCTION public.record_parser_runtime_attestation(_canonical_payload text, _payload jsonb, _attestation_digest text, _signature text, _release_gate_evidence jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  _secret text;
  _expected_signature text;
  _id uuid;
  _now timestamptz := clock_timestamp();
  _critical_hashes jsonb;
  _workflow jsonb;
  _runtime jsonb;
BEGIN
  IF _canonical_payload IS NULL OR length(_canonical_payload) = 0 OR _payload IS NULL OR jsonb_typeof(_payload) <> 'object'
     OR _canonical_payload::jsonb IS DISTINCT FROM _payload OR _release_gate_evidence IS NULL OR jsonb_typeof(_release_gate_evidence) <> 'object'
     OR _attestation_digest !~ '^[0-9a-f]{64}$' OR _signature !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'PARSER_ATTESTATION_INVALID_INPUT' USING ERRCODE = '22023';
  END IF;
  _secret := current_setting('app.settings.parser_attestation_hmac_secret', true);
  IF _secret IS NULL OR length(_secret) < 32 THEN RAISE EXCEPTION 'PARSER_ATTESTATION_SECRET_NOT_CONFIGURED' USING ERRCODE = '55000'; END IF;
  IF encode(extensions.digest(convert_to(_canonical_payload,'UTF8'),'sha256'),'hex') <> _attestation_digest THEN
    RAISE EXCEPTION 'PARSER_ATTESTATION_DIGEST_MISMATCH' USING ERRCODE = '55000';
  END IF;
  _expected_signature := encode(extensions.hmac(convert_to(_canonical_payload,'UTF8'),convert_to(_secret,'UTF8'),'sha256'),'hex');
  IF extensions.crypt(_expected_signature, '$2a$06$' || substr(_signature, 1, 22)) <> extensions.crypt(_signature, '$2a$06$' || substr(_signature, 1, 22)) THEN
    RAISE EXCEPTION 'PARSER_ATTESTATION_SIGNATURE_INVALID' USING ERRCODE = '42501';
  END IF;
  _workflow := _payload->'workflow_identity';
  _runtime := _payload->'runtime_identity';
  IF _payload->>'schema_version' <> '2' OR _payload->>'repository' <> 'GameProAcademy/cs2-pro-hub'
     OR _payload->>'railway_branch' <> 'infra/cs2-parser-worker-v8' OR _payload->>'git_commit' <> '5703b1d88f21ee57fdd1d83722edf30e0f0c6f76'
     OR _payload->>'deployment_id' <> '6330c8c4-a410-45db-a364-4eb47702c2fc' OR _payload->>'railway_project_id' <> 'aa2176ec-0e35-45f0-8cfa-9f8c0707dca4'
     OR _payload->>'railway_service_id' <> '706fa246-a263-484f-a986-c74516be862b' OR _payload->>'railway_environment_id' <> '2385d707-795d-4e32-a00b-0afaba0a9b7e'
     OR _payload->>'parser_name' <> 'demoparser2' OR _payload->>'parser_version' <> '0.42.0' OR (_payload->>'contract_version')::integer <> 1
     OR _payload->>'semantic_revision' <> 'git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76' OR _payload->>'build_revision' <> 'git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76'
     OR _payload->>'git_tree' !~ '^[0-9a-f]{40}$' OR _runtime->>'repository' <> _payload->>'repository' OR _runtime->>'branch' <> _payload->>'railway_branch'
     OR _runtime->>'commit' <> _payload->>'git_commit' OR _runtime->>'tree' <> _payload->>'git_tree' OR (_runtime->>'branch_contains_commit')::boolean IS NOT TRUE
     OR _workflow->>'provider' <> 'github_actions' OR _workflow->>'repository' <> _payload->>'repository' OR _workflow->>'workflow_sha' !~ '^[0-9a-f]{40}$'
     OR _workflow->>'workflow_ref' <> 'GameProAcademy/cs2-pro-hub/.github/workflows/parser-runtime-attestation.yml@refs/heads/infra/cs2-parser-worker-v8'
     OR length(btrim(coalesce(_workflow->>'run_id',''))) = 0 OR length(btrim(coalesce(_workflow->>'run_attempt',''))) = 0
     OR _payload->'deployment_evidence'->>'verification_source' <> 'RAILWAY_API' OR (_payload->'deployment_evidence'->>'independently_verified')::boolean IS NOT TRUE
     OR _payload->'deployment_evidence'->>'deployment_id' <> _payload->>'deployment_id' OR _payload->'deployment_evidence'->>'source_branch' <> _payload->>'railway_branch'
     OR _payload->'deployment_evidence'->>'source_commit' <> _payload->>'git_commit' OR _payload->'custom_domain_version' IS DISTINCT FROM _payload->'railway_domain_version'
     OR _payload->'custom_domain_version'->>'revision' <> _payload->>'semantic_revision' OR _payload->'custom_domain_version'->>'semantic_revision' <> _payload->>'semantic_revision'
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
  INSERT INTO public.parser_runtime_provenance (railway_project_id,railway_service_id,railway_environment_id,railway_branch,deployment_id,deployment_commit,parser_name,parser_version,contract_version,semantic_revision,build_revision,verification_timestamp,verification_method,critical_source_hashes,status,repository_full_name,attestation_version,attestation_digest,verified_endpoint,source_proof,deployment_proof,runtime_proof,app_source_commit,release_gate_evidence,git_tree,attestation_payload,attestor_identity,workflow_identity,attestation_signature)
  VALUES (_payload->>'railway_project_id',_payload->>'railway_service_id',_payload->>'railway_environment_id',_payload->>'railway_branch',_payload->>'deployment_id',_payload->>'git_commit',_payload->>'parser_name',_payload->>'parser_version',(_payload->>'contract_version')::integer,_payload->>'semantic_revision',_payload->>'build_revision',_now,'GITHUB_ACTIONS_SIGNED_ATTESTATION_V1',_critical_hashes,'VERIFIED',_payload->>'repository',2,_attestation_digest,'https://parser.gamepro.network',_runtime,_payload->'deployment_evidence',jsonb_build_object('custom_domain_version',_payload->'custom_domain_version','railway_domain_version',_payload->'railway_domain_version','runtime_health',_payload->'runtime_health','verification_source','LIVE_HTTP'),_workflow->>'workflow_sha',_release_gate_evidence,_payload->>'git_tree',_payload,jsonb_build_object('provider','github_actions_oidc','repository',_payload->>'repository'),_workflow,_signature)
  ON CONFLICT (railway_project_id,railway_service_id,railway_environment_id,deployment_id,deployment_commit,semantic_revision,build_revision) DO NOTHING RETURNING id INTO _id;
  IF _id IS NULL THEN SELECT id INTO _id FROM public.parser_runtime_provenance WHERE railway_project_id=_payload->>'railway_project_id' AND railway_service_id=_payload->>'railway_service_id' AND railway_environment_id=_payload->>'railway_environment_id' AND deployment_id=_payload->>'deployment_id' AND deployment_commit=_payload->>'git_commit' AND semantic_revision=_payload->>'semantic_revision' AND build_revision=_payload->>'build_revision' AND attestation_digest=_attestation_digest; END IF;
  IF _id IS NULL THEN RAISE EXCEPTION 'PARSER_ATTESTATION_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN _id;
END;
$$;
REVOKE ALL ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.assert_verified_parser_provenance(_provenance_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE _p public.parser_runtime_provenance%ROWTYPE;
BEGIN
 SELECT * INTO _p FROM public.parser_runtime_provenance WHERE id=_provenance_id;
 IF _p.id IS NULL OR _p.status <> 'VERIFIED' OR _p.verification_timestamp IS NULL OR _p.verification_timestamp > now()+interval '5 minutes' OR _p.verification_timestamp < now()-interval '24 hours'
    OR _p.repository_full_name <> 'GameProAcademy/cs2-pro-hub' OR _p.railway_branch <> 'infra/cs2-parser-worker-v8' OR _p.deployment_id <> '6330c8c4-a410-45db-a364-4eb47702c2fc'
    OR _p.deployment_commit <> '5703b1d88f21ee57fdd1d83722edf30e0f0c6f76' OR _p.parser_name <> 'demoparser2' OR _p.parser_version <> '0.42.0' OR _p.contract_version <> 1
    OR _p.semantic_revision <> 'git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76' OR _p.build_revision <> 'git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76'
    OR _p.git_tree !~ '^[0-9a-f]{40}$' OR _p.attestation_version <> 2 OR _p.attestation_payload IS NULL OR _p.attestor_identity->>'provider' <> 'github_actions_oidc'
    OR _p.workflow_identity->>'workflow_sha' !~ '^[0-9a-f]{40}$' OR _p.workflow_identity->>'workflow_ref' <> 'GameProAcademy/cs2-pro-hub/.github/workflows/parser-runtime-attestation.yml@refs/heads/infra/cs2-parser-worker-v8'
    OR _p.workflow_identity->>'workflow_sha' = _p.deployment_commit OR encode(extensions.digest(convert_to(_p.attestation_payload::text,'UTF8'),'sha256'),'hex') <> _p.attestation_digest
    OR _p.attestation_signature !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'PARSER_PROVENANCE_UNVERIFIED' USING ERRCODE='55000'; END IF;
 RETURN jsonb_build_object('status','VERIFIED','provenance_id',_p.id,'verification_timestamp',_p.verification_timestamp,'attestation_digest',_p.attestation_digest,'deployment_id',_p.deployment_id,'deployment_commit',_p.deployment_commit,'railway_branch',_p.railway_branch);
END;
$$;
REVOKE ALL ON FUNCTION public.assert_verified_parser_provenance(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_verified_parser_provenance(uuid) TO service_role;

COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb) IS 'Service-only idempotent attestation recorder with separate GitHub workflow and frozen Railway runtime identities.';