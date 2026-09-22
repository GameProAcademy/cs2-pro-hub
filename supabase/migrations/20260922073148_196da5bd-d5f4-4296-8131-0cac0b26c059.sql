-- FASE 2.7.2G.6-R.4-C.5/C.6: append-only Canonical mapping release authority.
CREATE TABLE public.canonical_mapping_inventory_releases (
  release_id uuid PRIMARY KEY,
  inventory_version text NOT NULL UNIQUE,
  schema_version integer NOT NULL,
  inventory_digest text NOT NULL UNIQUE,
  matrix_digest text NOT NULL,
  row_count integer NOT NULL,
  generic_count integer NOT NULL DEFAULT 0,
  authorized_count integer NOT NULL DEFAULT 0,
  verified_count integer NOT NULL DEFAULT 0,
  generator_revision text NOT NULL,
  generator_commit text NOT NULL,
  status text NOT NULL,
  provenance_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  authoritative_candidate boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT canonical_mapping_release_digest_check CHECK (inventory_digest ~ '^[0-9a-f]{64}$' AND matrix_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT canonical_mapping_release_commit_check CHECK (generator_commit ~ '^[0-9a-f]{40}$'),
  CONSTRAINT canonical_mapping_release_counts_check CHECK (row_count=105 AND generic_count=0 AND authorized_count=0 AND verified_count=0),
  CONSTRAINT canonical_mapping_release_status_check CHECK (status IN ('BLOCKED','VERIFIED','REJECTED')),
  CONSTRAINT canonical_mapping_release_provenance_check CHECK (jsonb_typeof(provenance_metadata)='object')
);
GRANT SELECT ON public.canonical_mapping_inventory_releases TO service_role;
ALTER TABLE public.canonical_mapping_inventory_releases ENABLE ROW LEVEL SECURITY;
CREATE POLICY canonical_mapping_inventory_releases_service_read ON public.canonical_mapping_inventory_releases FOR SELECT TO service_role USING (true);
CREATE UNIQUE INDEX canonical_mapping_inventory_single_authoritative_candidate_idx ON public.canonical_mapping_inventory_releases(authoritative_candidate) WHERE authoritative_candidate;

CREATE TABLE public.canonical_mapping_inventory_release_rows (
  release_id uuid NOT NULL REFERENCES public.canonical_mapping_inventory_releases(release_id),
  canonical_field text NOT NULL,
  source_capability text NOT NULL,
  source_field text NOT NULL,
  mapping_class text NOT NULL,
  parity_status text NOT NULL,
  determinism_status text NOT NULL,
  semantic_validation text NOT NULL,
  persistence_validation text NOT NULL,
  identity_dependency text NOT NULL,
  tick_dependency text NOT NULL,
  canonical_authorization boolean NOT NULL DEFAULT false,
  evidence_digest text NOT NULL,
  metadata jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (release_id, canonical_field),
  CONSTRAINT canonical_mapping_release_row_source_check CHECK (lower(source_field) NOT IN ('derived_or_constant','generic','unknown') AND btrim(source_field)<>''),
  CONSTRAINT canonical_mapping_release_row_class_check CHECK (mapping_class IN ('VERIFIED_DIRECT_SOURCE','VERIFIED_DERIVED_FROM_VERIFIED_SOURCE','VERIFIED_NORMALIZED_SOURCE','DECLARED_BUT_NOT_VERIFIED','PARITY_PENDING','DETERMINISM_PENDING','SEMANTIC_MISMATCH','TYPE_MISMATCH','VALUE_MISMATCH','SOURCE_UNAVAILABLE','PARSE_FAILED','TICK_DOMAIN_BLOCKED','IDENTITY_BLOCKED','NOT_SUPPORTED','CANONICAL_NOT_AUTHORIZED')),
  CONSTRAINT canonical_mapping_release_row_status_check CHECK (parity_status IN ('NOT_RUN','BLOCKED','FAILED','VERIFIED') AND determinism_status IN ('NOT_RUN','BLOCKED','FAILED','VERIFIED')),
  CONSTRAINT canonical_mapping_release_row_digest_check CHECK (evidence_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT canonical_mapping_release_row_metadata_check CHECK (jsonb_typeof(metadata)='object'),
  CONSTRAINT canonical_mapping_release_row_authorization_check CHECK (canonical_authorization=false OR (mapping_class IN ('VERIFIED_DIRECT_SOURCE','VERIFIED_DERIVED_FROM_VERIFIED_SOURCE','VERIFIED_NORMALIZED_SOURCE') AND parity_status='VERIFIED' AND determinism_status='VERIFIED' AND semantic_validation='VERIFIED' AND persistence_validation='VERIFIED' AND identity_dependency<>'BLOCKED' AND tick_dependency<>'BLOCKED'))
);
GRANT SELECT ON public.canonical_mapping_inventory_release_rows TO service_role;
ALTER TABLE public.canonical_mapping_inventory_release_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY canonical_mapping_inventory_release_rows_service_read ON public.canonical_mapping_inventory_release_rows FOR SELECT TO service_role USING (true);

CREATE OR REPLACE FUNCTION public.prevent_canonical_mapping_release_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN RAISE EXCEPTION 'CANONICAL_MAPPING_RELEASE_IMMUTABLE' USING ERRCODE='55000'; END; $$;
REVOKE ALL ON FUNCTION public.prevent_canonical_mapping_release_mutation() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER canonical_mapping_inventory_releases_immutable BEFORE UPDATE OR DELETE ON public.canonical_mapping_inventory_releases FOR EACH ROW EXECUTE FUNCTION public.prevent_canonical_mapping_release_mutation();
CREATE TRIGGER canonical_mapping_inventory_release_rows_immutable BEFORE UPDATE OR DELETE ON public.canonical_mapping_inventory_release_rows FOR EACH ROW EXECUTE FUNCTION public.prevent_canonical_mapping_release_mutation();

CREATE OR REPLACE FUNCTION public.create_canonical_mapping_inventory_release(_release jsonb,_rows jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE _id uuid; _row_count integer; _unique_count integer; _generic_count integer; _authorized integer; _verified integer;
BEGIN
 IF _release IS NULL OR jsonb_typeof(_release)<>'object' OR _rows IS NULL OR jsonb_typeof(_rows)<>'array' THEN RAISE EXCEPTION 'CANONICAL_MAPPING_RELEASE_INVALID_INPUT' USING ERRCODE='22023'; END IF;
 IF _release->>'inventory_version'<>'canonical-demo-v2' OR (_release->>'schema_version')::integer<>2 OR _release->>'inventory_digest'<>'cf0549c2dfbdc4df25b42ce8204edf8705071c586e99696e9ef596c1e742d7b1' OR _release->>'matrix_digest'<>'a276b0306c05ca6a2555db8b3c055bff2df6262b3e2bafccf6d1b5cca8425702' OR _release->>'generator_revision'<>'scripts/canonical_mapping_gate.py:v2' OR _release->>'generator_commit'<>'7443ffd0d21675cef72c9eaca8ed0c6d5f925021' OR _release->>'status'<>'BLOCKED' OR (_release->>'authoritative_candidate')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'CANONICAL_MAPPING_RELEASE_IDENTITY_INVALID' USING ERRCODE='55000'; END IF;
 SELECT count(*),count(DISTINCT x->>'canonical_field'),count(*) FILTER(WHERE lower(x->>'source_field') IN ('derived_or_constant','generic','unknown') OR btrim(coalesce(x->>'source_field',''))=''),count(*) FILTER(WHERE (x->>'canonical_authorization')::boolean),count(*) FILTER(WHERE x->>'parity_status'='VERIFIED' AND x->>'determinism_status'='VERIFIED') INTO _row_count,_unique_count,_generic_count,_authorized,_verified FROM jsonb_array_elements(_rows) x;
 IF _row_count<>105 OR _unique_count<>105 OR _generic_count<>0 OR _authorized<>0 OR _verified<>0 THEN RAISE EXCEPTION 'CANONICAL_MAPPING_RELEASE_CONTENT_INVALID' USING ERRCODE='55000'; END IF;
 _id:=(_release->>'release_id')::uuid;
 INSERT INTO public.canonical_mapping_inventory_releases(release_id,inventory_version,schema_version,inventory_digest,matrix_digest,row_count,generic_count,authorized_count,verified_count,generator_revision,generator_commit,status,provenance_metadata,authoritative_candidate)
 VALUES(_id,_release->>'inventory_version',(_release->>'schema_version')::integer,_release->>'inventory_digest',_release->>'matrix_digest',_row_count,_generic_count,_authorized,_verified,_release->>'generator_revision',_release->>'generator_commit',_release->>'status',coalesce(_release->'provenance_metadata','{}'::jsonb),true);
 INSERT INTO public.canonical_mapping_inventory_release_rows(release_id,canonical_field,source_capability,source_field,mapping_class,parity_status,determinism_status,semantic_validation,persistence_validation,identity_dependency,tick_dependency,canonical_authorization,evidence_digest,metadata)
 SELECT _id,x->>'canonical_field',x->>'source_capability',x->>'source_field',x->>'mapping_class',x->>'parity_status',x->>'determinism_status',x->>'semantic_validation',x->>'persistence_validation',x->>'identity_dependency',x->>'tick_dependency',(x->>'canonical_authorization')::boolean,x->>'evidence_digest',x->'metadata' FROM jsonb_array_elements(_rows) x;
 RETURN _id;
END; $$;
REVOKE ALL ON FUNCTION public.create_canonical_mapping_inventory_release(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_canonical_mapping_inventory_release(jsonb,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.canonical_mapping_inventory_release_snapshot()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE _r public.canonical_mapping_inventory_releases%ROWTYPE; _rows integer; _unique integer; _generic integer; _authorized integer; _verified integer;
BEGIN
 SELECT * INTO _r FROM public.canonical_mapping_inventory_releases WHERE release_id='cf0549c2-dfbd-c4df-25b4-2ce8204edf87'::uuid AND authoritative_candidate;
 IF _r.release_id IS NULL THEN RAISE EXCEPTION 'CANONICAL_MAPPING_RELEASE_MISSING' USING ERRCODE='55000'; END IF;
 SELECT count(*),count(DISTINCT canonical_field),count(*) FILTER(WHERE lower(source_field) IN ('derived_or_constant','generic','unknown')),count(*) FILTER(WHERE canonical_authorization),count(*) FILTER(WHERE parity_status='VERIFIED' AND determinism_status='VERIFIED') INTO _rows,_unique,_generic,_authorized,_verified FROM public.canonical_mapping_inventory_release_rows WHERE release_id=_r.release_id;
 IF _r.inventory_version<>'canonical-demo-v2' OR _r.schema_version<>2 OR _r.inventory_digest<>'cf0549c2dfbdc4df25b42ce8204edf8705071c586e99696e9ef596c1e742d7b1' OR _r.matrix_digest<>'a276b0306c05ca6a2555db8b3c055bff2df6262b3e2bafccf6d1b5cca8425702' OR _r.generator_revision<>'scripts/canonical_mapping_gate.py:v2' OR _r.generator_commit<>'7443ffd0d21675cef72c9eaca8ed0c6d5f925021' OR _r.status<>'BLOCKED' OR _rows<>105 OR _unique<>105 OR _generic<>0 OR _authorized<>0 OR _verified<>0 OR _r.row_count<>_rows OR _r.generic_count<>_generic OR _r.authorized_count<>_authorized OR _r.verified_count<>_verified THEN RAISE EXCEPTION 'CANONICAL_MAPPING_RELEASE_AUTHORITY_MISMATCH' USING ERRCODE='55000'; END IF;
 RETURN jsonb_build_object('status','BLOCKED','release_id',_r.release_id,'inventory_version',_r.inventory_version,'inventory_digest',_r.inventory_digest,'matrix_digest',_r.matrix_digest,'row_count',_rows,'generic_count',_generic,'authorized_count',_authorized,'verified_count',_verified,'generator_revision',_r.generator_revision,'generator_commit',_r.generator_commit);
END; $$;
REVOKE ALL ON FUNCTION public.canonical_mapping_inventory_release_snapshot() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.canonical_mapping_inventory_release_snapshot() TO service_role;

CREATE OR REPLACE FUNCTION public.assert_canonical_mapping_gate()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE _snapshot jsonb; _blocked integer; _unverified integer;
BEGIN
 _snapshot:=public.canonical_mapping_inventory_release_snapshot();
 SELECT count(*) FILTER(WHERE mapping_class NOT IN ('VERIFIED_DIRECT_SOURCE','VERIFIED_DERIVED_FROM_VERIFIED_SOURCE','VERIFIED_NORMALIZED_SOURCE') OR identity_dependency='BLOCKED' OR tick_dependency='BLOCKED'),count(*) FILTER(WHERE parity_status<>'VERIFIED' OR determinism_status<>'VERIFIED' OR semantic_validation<>'VERIFIED' OR persistence_validation<>'VERIFIED' OR NOT canonical_authorization) INTO _blocked,_unverified FROM public.canonical_mapping_inventory_release_rows WHERE release_id=(_snapshot->>'release_id')::uuid;
 IF _blocked>0 OR _unverified>0 THEN RAISE EXCEPTION 'CANONICAL_MAPPING_GATE_BLOCKED:release=%,blocked=%,unverified=%',_snapshot->>'release_id',_blocked,_unverified USING ERRCODE='55000'; END IF;
 RETURN _snapshot||jsonb_build_object('status','VERIFIED');
END; $$;
REVOKE ALL ON FUNCTION public.assert_canonical_mapping_gate() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assert_canonical_mapping_gate() TO service_role;

ALTER TABLE public.parser_runtime_provenance ADD COLUMN mapping_release_id uuid REFERENCES public.canonical_mapping_inventory_releases(release_id);

CREATE OR REPLACE FUNCTION public.assert_pre_attempt_9_ready(_provenance_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE _p public.parser_runtime_provenance%ROWTYPE; _snapshot jsonb; _e jsonb; _key text; _required constant text[]:=ARRAY['inventory_105','zero_generic','db_git_digest_parity','mapping_release_valid','canonical_authorization_false','railway_deployment_exact','railway_commit_exact','railway_branch_exact','live_version_exact','live_health_exact','critical_hashes_exact','hmac_configured','transport_secret_configured','railway_token_configured','endpoint_configured','oidc_operational','oidc_immutable_subject','workflow_identity_valid','provenance_verified','remote_ci','python_tests','python_wasm_parity','determinism','persistence_validation','identity_validation','tick_authority','retention_guard','attempt_9_absent','metrics_uncontaminated','features_uncontaminated','canonical_uncontaminated','runtime_frozen'];
BEGIN
 _snapshot:=public.canonical_mapping_inventory_release_snapshot();
 SELECT * INTO _p FROM public.parser_runtime_provenance WHERE id=_provenance_id;
 IF _p.id IS NULL OR _p.mapping_release_id IS DISTINCT FROM (_snapshot->>'release_id')::uuid THEN RAISE EXCEPTION 'PRE_ATTEMPT_9_PROVENANCE_RELEASE_MISMATCH' USING ERRCODE='55000'; END IF;
 PERFORM public.assert_verified_parser_provenance(_provenance_id);
 _e:=_p.release_gate_evidence;
 FOREACH _key IN ARRAY _required LOOP IF jsonb_typeof(_e->_key)<>'object' OR _e->_key->>'status'<>'VERIFIED' OR length(btrim(coalesce(_e->_key->>'evidence_ref','')))=0 THEN RAISE EXCEPTION 'BLOCKED_BEFORE_ATTEMPT_9:%',_key USING ERRCODE='55000'; END IF; END LOOP;
 IF EXISTS(SELECT 1 FROM public.uploads WHERE user_id='348b6f66-386d-48c4-bac1-7382ab12d7be'::uuid AND demo_sha256='0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d' AND attempt_number>=9) THEN RAISE EXCEPTION 'BLOCKED_BEFORE_ATTEMPT_9:ATTEMPT_ALREADY_EXISTS' USING ERRCODE='55000'; END IF;
 PERFORM public.assert_canonical_mapping_gate();
 RETURN jsonb_build_object('status','READY_FOR_ATTEMPT_9','provenance_id',_provenance_id,'release_id',_p.mapping_release_id,'gate_count',array_length(_required,1));
END; $$;
REVOKE ALL ON FUNCTION public.assert_pre_attempt_9_ready(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assert_pre_attempt_9_ready(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.assert_real_demo_release_ready(_provenance_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$ SELECT public.assert_pre_attempt_9_ready(_provenance_id) $$;
REVOKE ALL ON FUNCTION public.assert_real_demo_release_ready(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assert_real_demo_release_ready(uuid) TO service_role;

REVOKE ALL ON TABLE public.canonical_mapping_inventory_releases,public.canonical_mapping_inventory_release_rows FROM PUBLIC,anon,authenticated;
COMMENT ON TABLE public.canonical_mapping_inventory IS 'Immutable legacy C.1/C.2 mapping snapshot. It is historical only and is not current release authority.';
COMMENT ON TABLE public.canonical_mapping_inventory_releases IS 'Append-only Canonical mapping release authority; one explicitly pinned authoritative candidate, never selected by latest timestamp.';
COMMENT ON FUNCTION public.assert_pre_attempt_9_ready(uuid) IS 'Fail-closed 32-condition diagnostic gate. It never creates, copies, enqueues, processes, or deletes a DEM.';