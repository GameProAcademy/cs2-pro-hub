-- R5.7.3: reconcile provenance assertion with attestation schema v3.
-- Additive only. Never rewrites historical provenance rows and never authorizes Attempt 9.

CREATE OR REPLACE FUNCTION public.assert_verified_parser_provenance(_provenance_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  _p public.parser_runtime_provenance%ROWTYPE;
BEGIN
  SELECT * INTO _p
  FROM public.parser_runtime_provenance
  WHERE id = _provenance_id;

  IF _p.id IS NULL
     OR _p.status <> 'VERIFIED'
     OR _p.verification_timestamp IS NULL
     OR _p.verification_timestamp > now() + interval '5 minutes'
     OR _p.verification_timestamp < now() - interval '24 hours'
     OR _p.repository_full_name <> 'GameProAcademy/cs2-pro-hub'
     OR _p.railway_branch <> 'infra/cs2-parser-worker-v8'
     OR _p.deployment_id <> '6330c8c4-a410-45db-a364-4eb47702c2fc'
     OR _p.deployment_commit <> '5703b1d88f21ee57fdd1d83722edf30e0f0c6f76'
     OR _p.parser_name <> 'demoparser2'
     OR _p.parser_version <> '0.42.0'
     OR _p.contract_version <> 1
     OR _p.semantic_revision <> 'git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76'
     OR _p.build_revision <> 'git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76'
     OR _p.git_tree !~ '^[0-9a-f]{40}$'
     OR _p.attestation_version <> 3
     OR _p.attestation_digest !~ '^[0-9a-f]{64}$'
     OR _p.attestation_payload IS NULL
     OR jsonb_typeof(_p.attestation_payload) <> 'object'
     OR _p.attestor_identity->>'provider' <> 'github_actions_oidc'
     OR _p.attestor_identity->>'repository' <> 'GameProAcademy/cs2-pro-hub'
     OR _p.workflow_identity->>'workflow_sha' !~ '^[0-9a-f]{40}$'
     OR _p.workflow_identity->>'workflow_ref' <> 'GameProAcademy/cs2-pro-hub/.github/workflows/parser-runtime-attestation.yml@refs/heads/main'
     OR _p.workflow_identity->>'event_name' <> 'workflow_dispatch'
     OR _p.workflow_identity->>'workflow_path' <> '.github/workflows/parser-runtime-attestation.yml'
     OR _p.workflow_identity->>'workflow_source_sha' <> '13ce10e95a508e62d832bb9dc432e1496499676c'
     OR _p.attestor_identity->>'branch' <> 'main'
     OR _p.workflow_identity->>'workflow_sha' = _p.deployment_commit
     OR _p.release_gate_evidence IS DISTINCT FROM _p.attestation_payload->'release_gate_evidence'
     OR _p.attestation_payload->'attestor_source_identity'->>'repository' <> 'GameProAcademy/cs2-pro-hub'
     OR _p.attestation_payload->'attestor_source_identity'->>'branch' <> 'main'
     OR _p.attestation_payload->'attestor_source_identity'->>'workflow_sha' IS DISTINCT FROM _p.workflow_identity->>'workflow_sha'
     OR _p.attestation_payload->'attestor_source_identity'->>'workflow_path' <> '.github/workflows/parser-runtime-attestation.yml'
     OR _p.attestation_payload->'attestor_source_identity'->>'workflow_source_sha' <> '13ce10e95a508e62d832bb9dc432e1496499676c'
     OR _p.release_gate_evidence->'mapping_inventory' IS NULL
     OR _p.attestation_signature !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'PARSER_PROVENANCE_UNVERIFIED' USING ERRCODE='55000';
  END IF;

  RETURN jsonb_build_object(
    'status','VERIFIED',
    'provenance_id',_p.id,
    'verification_timestamp',_p.verification_timestamp,
    'attestation_digest',_p.attestation_digest,
    'attestation_version',_p.attestation_version,
    'deployment_id',_p.deployment_id,
    'deployment_commit',_p.deployment_commit,
    'railway_branch',_p.railway_branch,
    'workflow_ref',_p.workflow_identity->>'workflow_ref',
    'workflow_source_sha',_p.workflow_identity->>'workflow_source_sha'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_verified_parser_provenance(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_verified_parser_provenance(uuid)
  TO service_role;

COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid) IS
  'R5.7.3: validates immutable VERIFIED provenance under attestation schema v3. Digest integrity was already verified at insertion; this assertion does not recompute a non-canonical JSON digest.';
