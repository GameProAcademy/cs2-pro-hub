REVOKE ALL ON TABLE public.parser_attestation_nonces FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.parser_attestation_nonces FROM service_role;
GRANT SELECT, INSERT ON TABLE public.parser_attestation_nonces TO service_role;

REVOKE ALL ON TABLE public.parser_runtime_provenance FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.parser_runtime_provenance FROM service_role;
GRANT SELECT, INSERT ON TABLE public.parser_runtime_provenance TO service_role;

CREATE OR REPLACE FUNCTION public.assert_cache_attempt_9_ready(_provenance_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _p public.parser_runtime_provenance%ROWTYPE;
  _snapshot jsonb;
  _e jsonb;
  _key text;
  _required constant text[] := ARRAY[
    'inventory_105','zero_generic','db_git_digest_parity','mapping_release_valid',
    'canonical_authorization_false','railway_deployment_exact','railway_commit_exact',
    'railway_branch_exact','live_version_exact','live_health_exact','critical_hashes_exact',
    'hmac_configured','transport_secret_configured','railway_token_configured',
    'endpoint_configured','oidc_operational','oidc_immutable_subject','workflow_identity_valid',
    'provenance_verified','remote_ci','python_tests','python_wasm_parity','determinism',
    'persistence_validation','identity_validation','tick_authority','retention_guard',
    'attempt_9_absent','metrics_uncontaminated','features_uncontaminated',
    'canonical_uncontaminated','runtime_frozen'
  ];
BEGIN
  _snapshot := public.canonical_mapping_inventory_release_snapshot();
  SELECT * INTO _p FROM public.parser_runtime_provenance WHERE id = _provenance_id;

  IF _p.id IS NULL OR _p.mapping_release_id IS DISTINCT FROM (_snapshot->>'release_id')::uuid THEN
    RAISE EXCEPTION 'CACHE_ATTEMPT_9_PROVENANCE_RELEASE_MISMATCH' USING ERRCODE='55000';
  END IF;
  PERFORM public.assert_verified_parser_provenance(_provenance_id);

  _e := _p.release_gate_evidence;
  FOREACH _key IN ARRAY _required LOOP
    IF jsonb_typeof(_e->_key) <> 'object'
       OR _e->_key->>'status' <> 'VERIFIED'
       OR length(btrim(coalesce(_e->_key->>'evidence_ref',''))) = 0 THEN
      RAISE EXCEPTION 'BLOCKED_BEFORE_CACHE_ATTEMPT_9:%', _key USING ERRCODE='55000';
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM public.uploads
    WHERE id = 'd89b697f-c40d-42f4-ae51-040e4e8cabba'::uuid
      AND user_id = '348b6f66-386d-48c4-bac1-7382ab12d7be'::uuid
      AND demo_sha256 = '0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d'
      AND file_size = 473748061
      AND attempt_number = 8
  ) THEN
    RAISE EXCEPTION 'BLOCKED_BEFORE_CACHE_ATTEMPT_9:SOURCE_IDENTITY_MISMATCH' USING ERRCODE='55000';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.uploads
    WHERE user_id = '348b6f66-386d-48c4-bac1-7382ab12d7be'::uuid
      AND demo_sha256 = '0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d'
      AND attempt_number >= 9
  ) THEN
    RAISE EXCEPTION 'BLOCKED_BEFORE_CACHE_ATTEMPT_9:ATTEMPT_ALREADY_EXISTS' USING ERRCODE='55000';
  END IF;

  PERFORM public.assert_canonical_mapping_gate();
  RETURN jsonb_build_object(
    'status','READY_FOR_CACHE_ATTEMPT_9','provenance_id',_provenance_id,
    'release_id',_p.mapping_release_id,'gate_count',array_length(_required,1),
    'controlled_replay','furia-vs-gamerlegion-m1-cache.dem'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_pre_attempt_9_ready(_provenance_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$ SELECT public.assert_cache_attempt_9_ready(_provenance_id) $$;

CREATE OR REPLACE FUNCTION public.assert_real_demo_release_ready(_provenance_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$ SELECT public.assert_cache_attempt_9_ready(_provenance_id) $$;

CREATE OR REPLACE FUNCTION public.pre_attempt_9_gate_status(_provenance_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  PERFORM public.assert_cache_attempt_9_ready(_provenance_id);
  RETURN 'READY_TO_EXECUTE_CACHE_ATTEMPT_9';
EXCEPTION WHEN OTHERS THEN
  RETURN 'BLOCKED';
END;
$$;

REVOKE ALL ON FUNCTION public.assert_cache_attempt_9_ready(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_pre_attempt_9_ready(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_real_demo_release_ready(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pre_attempt_9_gate_status(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_cache_attempt_9_ready(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.assert_pre_attempt_9_ready(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.assert_real_demo_release_ready(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pre_attempt_9_gate_status(uuid) TO service_role;

COMMENT ON FUNCTION public.assert_cache_attempt_9_ready(uuid) IS
  'Fail-closed diagnostic exclusively for the controlled Cache attempt 8 to attempt 9 replay. It performs no write, copy, enqueue, parse, promotion, or cleanup.';
COMMENT ON FUNCTION public.assert_pre_attempt_9_ready(uuid) IS
  'Compatibility wrapper for the Cache-specific controlled replay gate; not a generic DEM readiness API.';