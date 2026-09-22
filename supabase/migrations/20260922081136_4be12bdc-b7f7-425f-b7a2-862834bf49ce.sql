CREATE TABLE public.parser_attestation_nonces (
  nonce text PRIMARY KEY,
  attestation_digest text NOT NULL UNIQUE,
  workflow_run_id text NOT NULL,
  workflow_run_attempt text NOT NULL,
  attested_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT parser_attestation_nonce_format_check CHECK (nonce ~ '^[0-9a-f]{32,128}$'),
  CONSTRAINT parser_attestation_nonce_digest_check CHECK (attestation_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT parser_attestation_nonce_window_check CHECK (expires_at > attested_at AND expires_at <= attested_at + interval '10 minutes')
);
GRANT SELECT, INSERT ON public.parser_attestation_nonces TO service_role;
ALTER TABLE public.parser_attestation_nonces ENABLE ROW LEVEL SECURITY;
CREATE POLICY parser_attestation_nonces_service_access ON public.parser_attestation_nonces FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.prevent_parser_attestation_nonce_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  RAISE EXCEPTION 'PARSER_ATTESTATION_NONCE_IMMUTABLE' USING ERRCODE='55000';
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_parser_attestation_nonce_mutation() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER parser_attestation_nonces_immutable BEFORE UPDATE OR DELETE ON public.parser_attestation_nonces FOR EACH ROW EXECUTE FUNCTION public.prevent_parser_attestation_nonce_mutation();
REVOKE UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.parser_attestation_nonces FROM service_role;

CREATE OR REPLACE FUNCTION public.assert_canonical_mapping_gate()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE _snapshot jsonb; _blocked integer; _unverified integer; _generic integer; _rows integer; _unique integer;
BEGIN
 _snapshot:=public.canonical_mapping_inventory_release_snapshot();
 SELECT count(*),count(DISTINCT canonical_field),
        count(*) FILTER(WHERE lower(btrim(source_field)) IN ('derived_or_constant','generic','unknown','*','all') OR btrim(source_field)=''),
        count(*) FILTER(WHERE mapping_class NOT IN ('VERIFIED_DIRECT_SOURCE','VERIFIED_DERIVED_FROM_VERIFIED_SOURCE','VERIFIED_NORMALIZED_SOURCE') OR identity_dependency='BLOCKED' OR tick_dependency='BLOCKED'),
        count(*) FILTER(WHERE parity_status<>'VERIFIED' OR determinism_status<>'VERIFIED' OR semantic_validation<>'VERIFIED' OR persistence_validation<>'VERIFIED' OR NOT canonical_authorization)
 INTO _rows,_unique,_generic,_blocked,_unverified
 FROM public.canonical_mapping_inventory_release_rows WHERE release_id=(_snapshot->>'release_id')::uuid;
 IF _rows<>105 OR _unique<>105 OR _generic<>0 THEN RAISE EXCEPTION 'CANONICAL_MAPPING_RELEASE_CONTENT_BLOCKED:rows=%,unique=%,generic=%',_rows,_unique,_generic USING ERRCODE='55000'; END IF;
 IF _blocked>0 OR _unverified>0 THEN RAISE EXCEPTION 'CANONICAL_MAPPING_GATE_BLOCKED:release=%,blocked=%,unverified=%',_snapshot->>'release_id',_blocked,_unverified USING ERRCODE='55000'; END IF;
 RETURN _snapshot||jsonb_build_object('status','VERIFIED');
END;
$$;
REVOKE ALL ON FUNCTION public.assert_canonical_mapping_gate() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assert_canonical_mapping_gate() TO service_role;

DROP FUNCTION IF EXISTS public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb);
CREATE OR REPLACE FUNCTION public.record_parser_runtime_attestation(_canonical_payload text,_payload jsonb,_attestation_digest text,_signature text,_release_gate_evidence jsonb,_attested_at timestamptz,_nonce text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE _secret text; _expected_signature text; _id uuid; _now timestamptz:=clock_timestamp(); _critical_hashes jsonb; _workflow jsonb; _runtime jsonb; _mapping jsonb;
BEGIN
 IF _canonical_payload IS NULL OR length(_canonical_payload)=0 OR _payload IS NULL OR jsonb_typeof(_payload)<>'object' OR _canonical_payload::jsonb IS DISTINCT FROM _payload OR _release_gate_evidence IS NULL OR jsonb_typeof(_release_gate_evidence)<>'object' OR _attestation_digest !~ '^[0-9a-f]{64}$' OR _signature !~ '^[0-9a-f]{64}$' OR _nonce !~ '^[0-9a-f]{32,128}$' THEN RAISE EXCEPTION 'PARSER_ATTESTATION_INVALID_INPUT' USING ERRCODE='22023'; END IF;
 IF _attested_at IS NULL OR _attested_at>_now+interval '1 minute' OR _attested_at<_now-interval '5 minutes' OR _payload->>'attested_at' IS DISTINCT FROM to_char(_attested_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') OR _payload->>'nonce' IS DISTINCT FROM _nonce THEN RAISE EXCEPTION 'PARSER_ATTESTATION_FRESHNESS_INVALID' USING ERRCODE='55000'; END IF;
 _secret:=current_setting('app.settings.parser_attestation_hmac_secret',true);
 IF _secret IS NULL OR length(_secret)<32 THEN RAISE EXCEPTION 'PARSER_ATTESTATION_SECRET_NOT_CONFIGURED' USING ERRCODE='55000'; END IF;
 IF encode(extensions.digest(convert_to(_canonical_payload,'UTF8'),'sha256'),'hex')<>_attestation_digest THEN RAISE EXCEPTION 'PARSER_ATTESTATION_DIGEST_MISMATCH' USING ERRCODE='55000'; END IF;
 _expected_signature:=encode(extensions.hmac(convert_to(_canonical_payload,'UTF8'),convert_to(_secret,'UTF8'),'sha256'),'hex');
 IF decode(_expected_signature,'hex') IS DISTINCT FROM decode(_signature,'hex') THEN RAISE EXCEPTION 'PARSER_ATTESTATION_SIGNATURE_INVALID' USING ERRCODE='42501'; END IF;
 _workflow:=_payload->'workflow_identity'; _runtime:=_payload->'runtime_identity'; _mapping:=_payload->'mapping_release';
 IF _payload->>'schema_version'<>'3' OR _payload->>'repository'<>'GameProAcademy/cs2-pro-hub' OR _payload->>'railway_branch'<>'infra/cs2-parser-worker-v8' OR _payload->>'git_commit'<>'5703b1d88f21ee57fdd1d83722edf30e0f0c6f76' OR _payload->>'deployment_id'<>'6330c8c4-a410-45db-a364-4eb47702c2fc' OR _payload->>'railway_project_id'<>'aa2176ec-0e35-45f0-8cfa-9f8c0707dca4' OR _payload->>'railway_service_id'<>'706fa246-a263-484f-a986-c74516be862b' OR _payload->>'railway_environment_id'<>'2385d707-795d-4e32-a00b-0afaba0a9b7e' OR _payload->>'parser_name'<>'demoparser2' OR _payload->>'parser_version'<>'0.42.0' OR (_payload->>'contract_version')::integer<>1 OR _payload->>'semantic_revision'<>'git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76' OR _payload->>'build_revision'<>'git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76' OR _payload->>'git_tree' !~ '^[0-9a-f]{40}$' OR _runtime->>'repository'<>_payload->>'repository' OR _runtime->>'branch'<>_payload->>'railway_branch' OR _runtime->>'commit'<>_payload->>'git_commit' OR _runtime->>'tree'<>_payload->>'git_tree' OR (_runtime->>'branch_contains_commit')::boolean IS NOT TRUE OR _workflow->>'provider'<>'github_actions' OR _workflow->>'repository'<>_payload->>'repository' OR _workflow->>'workflow_sha' !~ '^[0-9a-f]{40}$' OR _workflow->>'workflow_ref'<>'GameProAcademy/cs2-pro-hub/.github/workflows/parser-runtime-attestation.yml@refs/heads/infra/cs2-parser-worker-v8' OR _workflow->>'event_name'<>'workflow_dispatch' OR length(btrim(coalesce(_workflow->>'run_id','')))=0 OR length(btrim(coalesce(_workflow->>'run_attempt','')))=0 OR _payload->'deployment_evidence'->>'verification_source'<>'RAILWAY_API' OR (_payload->'deployment_evidence'->>'independently_verified')::boolean IS NOT TRUE OR _payload->'deployment_evidence'->>'deployment_id'<>_payload->>'deployment_id' OR _payload->'deployment_evidence'->>'source_branch'<>_payload->>'railway_branch' OR _payload->'deployment_evidence'->>'source_commit'<>_payload->>'git_commit' OR _payload->'custom_domain_version' IS DISTINCT FROM _payload->'railway_domain_version' OR _payload->'custom_domain_version'->>'revision'<>_payload->>'semantic_revision' OR _payload->'custom_domain_version'->>'semantic_revision'<>_payload->>'semantic_revision' OR _payload->'custom_domain_version'->>'build_revision'<>_payload->>'build_revision' THEN RAISE EXCEPTION 'PARSER_ATTESTATION_BINDING_INVALID' USING ERRCODE='55000'; END IF;
 IF _mapping->>'release_id'<>'cf0549c2-dfbd-c4df-25b4-2ce8204edf87' OR _mapping->>'inventory_version'<>'canonical-demo-v2' OR _mapping->>'inventory_digest'<>'cf0549c2dfbdc4df25b42ce8204edf8705071c586e99696e9ef596c1e742d7b1' OR _mapping->>'matrix_digest'<>'a276b0306c05ca6a2555db8b3c055bff2df6262b3e2bafccf6d1b5cca8425702' OR (_mapping->>'row_count')::integer<>105 OR (_mapping->>'generic_count')::integer<>0 OR (_mapping->>'authorized_count')::integer<>0 OR (_mapping->>'verified_count')::integer<>0 OR _mapping->>'status'<>'BLOCKED' THEN RAISE EXCEPTION 'PARSER_ATTESTATION_MAPPING_RELEASE_INVALID' USING ERRCODE='55000'; END IF;
 _critical_hashes:=_payload->'critical_file_hashes';
 IF _critical_hashes->'services/cs2-demo-parser/parser.py'->>'observed'<>'9d21670e47ddf330881e95a9d78c19074ccc0aea' OR _critical_hashes->'services/cs2-demo-parser/adapter.py'->>'observed'<>'34ce0f196a0ff86f5452c0e8b1f078f88f9b0c71' OR _critical_hashes->'services/cs2-demo-parser/worker.py'->>'observed'<>'dfc2e67fcb3644be91108079f9096947c16119b3' OR _critical_hashes->'services/cs2-demo-parser/raw_evidence.py'->>'observed'<>'750195c1218abd53cfc77b6e8d2fb4a88e31579e' OR _critical_hashes->'services/cs2-demo-parser/settings.py'->>'observed'<>'35eecfb06223812137a4a2f17114aae57cb7fe54' OR EXISTS(SELECT 1 FROM jsonb_each(_critical_hashes) entry WHERE entry.value->>'match'<>'true') THEN RAISE EXCEPTION 'PARSER_ATTESTATION_CRITICAL_HASH_MISMATCH' USING ERRCODE='55000'; END IF;
 INSERT INTO public.parser_attestation_nonces(nonce,attestation_digest,workflow_run_id,workflow_run_attempt,attested_at,expires_at) VALUES(_nonce,_attestation_digest,_workflow->>'run_id',_workflow->>'run_attempt',_attested_at,_attested_at+interval '10 minutes');
 INSERT INTO public.parser_runtime_provenance(railway_project_id,railway_service_id,railway_environment_id,railway_branch,deployment_id,deployment_commit,parser_name,parser_version,contract_version,semantic_revision,build_revision,verification_timestamp,verification_method,critical_source_hashes,status,repository_full_name,attestation_version,attestation_digest,verified_endpoint,source_proof,deployment_proof,runtime_proof,app_source_commit,release_gate_evidence,git_tree,attestation_payload,attestor_identity,workflow_identity,attestation_signature,mapping_release_id)
 VALUES(_payload->>'railway_project_id',_payload->>'railway_service_id',_payload->>'railway_environment_id',_payload->>'railway_branch',_payload->>'deployment_id',_payload->>'git_commit',_payload->>'parser_name',_payload->>'parser_version',(_payload->>'contract_version')::integer,_payload->>'semantic_revision',_payload->>'build_revision',_attested_at,'GITHUB_ACTIONS_SIGNED_ATTESTATION_V2',_critical_hashes,'VERIFIED',_payload->>'repository',3,_attestation_digest,'https://parser.gamepro.network',_runtime,_payload->'deployment_evidence',jsonb_build_object('custom_domain_version',_payload->'custom_domain_version','railway_domain_version',_payload->'railway_domain_version','runtime_health',_payload->'runtime_health','verification_source','LIVE_HTTP'),_workflow->>'workflow_sha',_release_gate_evidence,_payload->>'git_tree',_payload,jsonb_build_object('provider','github_actions_oidc','repository',_payload->>'repository','nonce',_nonce),_workflow,_signature,'cf0549c2-dfbd-c4df-25b4-2ce8204edf87'::uuid)
 ON CONFLICT(railway_project_id,railway_service_id,railway_environment_id,deployment_id,deployment_commit,semantic_revision,build_revision) DO NOTHING RETURNING id INTO _id;
 IF _id IS NULL THEN RAISE EXCEPTION 'PARSER_ATTESTATION_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
 RETURN _id;
END;
$$;
REVOKE ALL ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text) TO service_role;

CREATE OR REPLACE FUNCTION public.pre_attempt_9_gate_status(_provenance_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  PERFORM public.assert_pre_attempt_9_ready(_provenance_id);
  RETURN 'READY_TO_EXECUTE_ATTEMPT_9';
EXCEPTION WHEN OTHERS THEN
  RETURN 'BLOCKED';
END;
$$;
REVOKE ALL ON FUNCTION public.pre_attempt_9_gate_status(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pre_attempt_9_gate_status(uuid) TO service_role;

COMMENT ON TABLE public.parser_attestation_nonces IS 'Append-only replay-prevention registry for fresh signed parser attestations.';
COMMENT ON FUNCTION public.pre_attempt_9_gate_status(uuid) IS 'Read-only two-state diagnostic. It never creates an upload, job, queue message, Canonical row, or cleanup operation.';