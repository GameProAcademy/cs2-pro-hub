CREATE FUNCTION public.h3e91_live_database_evidence()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $fn$
WITH funcs AS (
 SELECT p.proname, p.oid, p.prosecdef, p.proconfig, pg_catalog.pg_get_functiondef(p.oid) AS definition,
        NOT pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AND NOT pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') AS client_denied,
        pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE') AS service_allowed
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('record_parser_runtime_attestation','record_parser_runtime_attestation_with_secret','assert_verified_parser_provenance','enforce_approved_attestation_workflow')
), checks AS (
 SELECT count(*)=4 AS all_present,
        coalesce(bool_and(prosecdef),false) AS security_definer,
        coalesce(bool_and(coalesce(proconfig,ARRAY[]::text[]) @> ARRAY['search_path=""']),false) AS empty_search_path,
        coalesce(bool_and(client_denied),false) AND coalesce(bool_and(CASE WHEN proname='enforce_approved_attestation_workflow' THEN true ELSE service_allowed END),false) AS service_only,
        coalesce(bool_and(CASE WHEN proname='record_parser_runtime_attestation_with_secret' THEN pg_catalog.strpos(definition,'pg_catalog.set_config')>0 AND pg_catalog.strpos(definition,'true')>0 ELSE true END),false) AS transaction_local_bridge,
        coalesce(bool_and(CASE WHEN proname IN ('record_parser_runtime_attestation','assert_verified_parser_provenance') THEN pg_catalog.strpos(definition,'7a540da0-3a69-44c0-9c42-40209f903fa7')>0 AND pg_catalog.strpos(definition,'fae651ed5174aa609e4b07d575105d80a00d0055')>0 WHEN proname='enforce_approved_attestation_workflow' THEN pg_catalog.strpos(definition,'fae651ed5174aa609e4b07d575105d80a00d0055')>0 ELSE true END),false) AS approved_pins
 FROM funcs
)
SELECT pg_catalog.jsonb_build_object(
 'provenanceCount',(SELECT count(*) FROM public.parser_runtime_provenance),
 'verifiedProvenanceCount',(SELECT count(*) FROM public.parser_runtime_provenance WHERE status='VERIFIED'),
 'nonceCount',(SELECT count(*) FROM public.parser_attestation_nonces),
 'attempt9Count',(SELECT count(*) FROM public.uploads WHERE user_id='348b6f66-386d-48c4-bac1-7382ab12d7be'::uuid AND demo_sha256='0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d' AND attempt_number=9),
 'attempt10PlusCount',(SELECT count(*) FROM public.uploads WHERE user_id='348b6f66-386d-48c4-bac1-7382ab12d7be'::uuid AND demo_sha256='0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d' AND attempt_number>=10),
 'canonical', (SELECT pg_catalog.jsonb_build_object('total',count(*),'authorized',count(*) FILTER(WHERE canonical_authorization),'verified',count(*) FILTER(WHERE parity_status='VERIFIED' AND determinism_status='VERIFIED' AND semantic_validation='VERIFIED' AND persistence_validation='VERIFIED'),'generic',count(*) FILTER(WHERE pg_catalog.lower(source_field) IN ('derived_or_constant','generic','unknown'))) FROM public.canonical_mapping_inventory_release_rows WHERE release_id='cf0549c2-dfbd-c4df-25b4-2ce8204edf87'::uuid),
 'migrationExactMatchCount',(SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='20260925011902' AND name='051ef9cf-6adf-4689-9fe2-c2fc86dedc40'),
 'security',pg_catalog.jsonb_build_object(
   'rlsEnabled',(SELECT coalesce(bool_and(relrowsecurity),false) FROM pg_catalog.pg_class WHERE oid IN ('public.parser_runtime_provenance'::regclass,'public.parser_attestation_nonces'::regclass)),
   'clientPrivilegesZero',NOT pg_catalog.has_table_privilege('anon','public.parser_runtime_provenance','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES') AND NOT pg_catalog.has_table_privilege('authenticated','public.parser_runtime_provenance','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES') AND NOT pg_catalog.has_table_privilege('anon','public.parser_attestation_nonces','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES') AND NOT pg_catalog.has_table_privilege('authenticated','public.parser_attestation_nonces','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES'),
   'recorderServiceRoleOnly',(SELECT coalesce(bool_and(client_denied AND service_allowed),false) FROM funcs WHERE proname IN ('record_parser_runtime_attestation','assert_verified_parser_provenance')),
   'hmacBridgeServiceRoleOnly',(SELECT coalesce(bool_and(client_denied AND service_allowed),false) FROM funcs WHERE proname='record_parser_runtime_attestation_with_secret'),
   'securityDefiner',checks.all_present AND checks.security_definer,
   'emptySearchPath',checks.all_present AND checks.empty_search_path,
   'approvedPinsPresent',checks.all_present AND checks.approved_pins,
   'transactionLocalHmacBridge',checks.all_present AND checks.transaction_local_bridge,
   'noClientExecutableBypass',checks.all_present AND checks.service_only
 )
) FROM checks;
$fn$;
REVOKE ALL ON FUNCTION public.h3e91_live_database_evidence() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.h3e91_live_database_evidence() TO service_role;