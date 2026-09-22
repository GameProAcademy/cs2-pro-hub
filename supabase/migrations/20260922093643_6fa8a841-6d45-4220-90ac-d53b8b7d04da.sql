REVOKE ALL ON TABLE public.parser_attestation_nonces FROM PUBLIC, anon, authenticated, service_role, sandbox_exec;
GRANT SELECT, INSERT ON TABLE public.parser_attestation_nonces TO service_role, sandbox_exec;

REVOKE ALL ON TABLE public.parser_runtime_provenance FROM PUBLIC, anon, authenticated, service_role, sandbox_exec;
GRANT SELECT, INSERT ON TABLE public.parser_runtime_provenance TO service_role, sandbox_exec;

CREATE OR REPLACE FUNCTION public.attestation_security_invariants()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT jsonb_build_object(
    'status', CASE WHEN
      NOT has_table_privilege('anon', 'public.parser_attestation_nonces', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
      AND NOT has_table_privilege('authenticated', 'public.parser_attestation_nonces', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
      AND NOT has_table_privilege('anon', 'public.parser_runtime_provenance', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
      AND NOT has_table_privilege('authenticated', 'public.parser_runtime_provenance', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_class c
        CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) a
        WHERE c.oid IN ('public.parser_attestation_nonces'::regclass, 'public.parser_runtime_provenance'::regclass)
          AND a.grantee = 0
      )
      AND has_table_privilege('service_role', 'public.parser_attestation_nonces', 'SELECT,INSERT')
      AND has_table_privilege('sandbox_exec', 'public.parser_attestation_nonces', 'SELECT,INSERT')
      AND has_table_privilege('service_role', 'public.parser_runtime_provenance', 'SELECT,INSERT')
      AND has_table_privilege('sandbox_exec', 'public.parser_runtime_provenance', 'SELECT,INSERT')
      AND NOT has_table_privilege('service_role', 'public.parser_attestation_nonces', 'UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
      AND NOT has_table_privilege('sandbox_exec', 'public.parser_attestation_nonces', 'UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
      AND NOT has_table_privilege('service_role', 'public.parser_runtime_provenance', 'UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
      AND NOT has_table_privilege('sandbox_exec', 'public.parser_runtime_provenance', 'UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
      AND EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE oid='public.parser_attestation_nonces'::regclass AND relrowsecurity)
      AND EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE oid='public.parser_runtime_provenance'::regclass AND relrowsecurity)
      AND EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.parser_attestation_nonces'::regclass AND tgname='parser_attestation_nonces_immutable' AND NOT tgisinternal)
      AND EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.parser_runtime_provenance'::regclass AND tgname='parser_runtime_provenance_immutable' AND NOT tgisinternal)
      THEN 'PASS' ELSE 'BLOCKED' END,
    'client_roles_zero_privileges',
      NOT has_table_privilege('anon', 'public.parser_attestation_nonces', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
      AND NOT has_table_privilege('authenticated', 'public.parser_attestation_nonces', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
      AND NOT has_table_privilege('anon', 'public.parser_runtime_provenance', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
      AND NOT has_table_privilege('authenticated', 'public.parser_runtime_provenance', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES'),
    'trusted_roles', jsonb_build_array('service_role', 'sandbox_exec'),
    'approved_privileges', jsonb_build_array('INSERT', 'SELECT'),
    'rls_enabled', true,
    'immutable_triggers_required', true
  );
$$;

REVOKE ALL ON FUNCTION public.attestation_security_invariants() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attestation_security_invariants() TO service_role, sandbox_exec;

CREATE OR REPLACE FUNCTION public.pre_real_demo_gate_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _security jsonb;
  _verified_provenance integer;
  _attempt_9 integer;
  _attempt_10_plus integer;
  _mapping_count integer;
  _authorized_count integer;
  _verified_mapping_count integer;
BEGIN
  _security := public.attestation_security_invariants();
  SELECT count(*) FILTER (WHERE status='VERIFIED') INTO _verified_provenance
  FROM public.parser_runtime_provenance;
  SELECT
    count(*) FILTER (WHERE attempt_number=9),
    count(*) FILTER (WHERE attempt_number>=10)
  INTO _attempt_9, _attempt_10_plus
  FROM public.uploads
  WHERE user_id='348b6f66-386d-48c4-bac1-7382ab12d7be'::uuid
    AND demo_sha256='0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d';
  SELECT
    count(*),
    count(*) FILTER (WHERE canonical_authorization),
    count(*) FILTER (WHERE parity_status='VERIFIED' AND determinism_status='VERIFIED' AND semantic_validation='VERIFIED' AND persistence_validation='VERIFIED')
  INTO _mapping_count, _authorized_count, _verified_mapping_count
  FROM public.canonical_mapping_inventory_release_rows
  WHERE release_id='cf0549c2-dfbd-c4df-25b4-2ce8204edf87'::uuid;

  RETURN jsonb_build_object(
    'status', 'BLOCKED_BEFORE_REAL_DEMO',
    'security_status', _security->>'status',
    'hmac_configured', false,
    'provenance_verified_count', _verified_provenance,
    'mapping_count', _mapping_count,
    'mapping_authorized_count', _authorized_count,
    'mapping_verified_count', _verified_mapping_count,
    'attempt_9_count', _attempt_9,
    'attempt_10_plus_count', _attempt_10_plus,
    'real_demo_executed', false,
    'parity_status', 'NOT_RUN',
    'determinism_status', 'NOT_RUN',
    'tick_authority_status', 'NOT_VERIFIED',
    'identity_status', 'NOT_VERIFIED',
    'forensic_integrity_status', 'NOT_VERIFIED',
    'blockers', jsonb_build_array(
      'HMAC_NOT_CONFIGURED',
      'RUNTIME_PROVENANCE_NOT_VERIFIED',
      'GITHUB_ATTESTATION_NOT_VERIFIED',
      'RAILWAY_EVIDENCE_NOT_VERIFIED',
      'REAL_DEMO_NOT_RUN',
      'PYTHON_WASM_PARITY_NOT_VERIFIED',
      'DETERMINISM_NOT_VERIFIED',
      'TICK_AUTHORITY_NOT_VERIFIED',
      'IDENTITY_NOT_VERIFIED',
      'FORENSIC_INTEGRITY_NOT_VERIFIED'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pre_real_demo_gate_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pre_real_demo_gate_status() TO service_role, sandbox_exec;

COMMENT ON FUNCTION public.attestation_security_invariants() IS
  'Read-only live ACL/RLS/immutability audit. Client roles have zero privileges; service_role and approved internal sandbox_exec have SELECT/INSERT only.';
COMMENT ON FUNCTION public.pre_real_demo_gate_status() IS
  'Read-only fail-closed C.10-R1.1 diagnostic. It never creates attempts, processes or copies a DEM, authorizes Canonical, mutates Railway, or performs cleanup.';