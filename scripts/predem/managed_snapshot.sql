-- H.3-E pre-DEM managed-database snapshot (read-only).
-- Source of truth for the function; the migration that creates it on a
-- database must contain exactly this text (scripts/tests enforce it).
-- Aggregates and digests only: no row, identifier of a user, payload, secret
-- or storage path leaves the database. STABLE, SECURITY DEFINER,
-- search_path='', EXECUTE for service_role only. It writes nothing.
CREATE OR REPLACE FUNCTION public.h3e_predem_managed_snapshot()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $snapshot$
  WITH body AS (
    SELECT jsonb_build_object(
      'schema_version', 3,
      'snapshot_at', pg_catalog.to_char(pg_catalog.clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'database', jsonb_build_object(
        'name', pg_catalog.current_database(),
        'server_version', pg_catalog.current_setting('server_version'),
        'migration_head', (SELECT max(version) FROM supabase_migrations.schema_migrations),
        'recorder_md5', (SELECT pg_catalog.md5(p.prosrc) FROM pg_catalog.pg_proc p
                         WHERE p.oid = 'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::pg_catalog.regprocedure)),
      'mapping_release', (
        SELECT jsonb_build_object(
          'authoritative_releases', count(*) FILTER (WHERE r.authoritative_candidate),
          'inventory_digests', COALESCE(jsonb_agg(DISTINCT r.inventory_digest) FILTER (WHERE r.authoritative_candidate), '[]'::jsonb),
          'matrix_digests', COALESCE(jsonb_agg(DISTINCT r.matrix_digest) FILTER (WHERE r.authoritative_candidate), '[]'::jsonb),
          'row_counts', COALESCE(jsonb_agg(DISTINCT r.row_count) FILTER (WHERE r.authoritative_candidate), '[]'::jsonb),
          'generic_counts', COALESCE(jsonb_agg(DISTINCT r.generic_count) FILTER (WHERE r.authoritative_candidate), '[]'::jsonb),
          'authorized_counts', COALESCE(jsonb_agg(DISTINCT r.authorized_count) FILTER (WHERE r.authoritative_candidate), '[]'::jsonb),
          'inventory_rows', (SELECT count(*) FROM public.canonical_mapping_inventory))
        FROM public.canonical_mapping_inventory_releases r),
      'attempts', (SELECT jsonb_build_object(
          'max_attempt_number', COALESCE(max(j.attempt_number), 0),
          'jobs_attempt_9_or_more', count(*) FILTER (WHERE j.attempt_number >= 9))
        FROM public.demo_jobs j),
      'derived_rows', jsonb_build_object(
        'match_metrics', (SELECT count(*) FROM public.match_metrics),
        'match_features', (SELECT count(*) FROM public.match_features)),
      'canonical', (SELECT jsonb_build_object(
          'matches_by_status', COALESCE((SELECT jsonb_object_agg(COALESCE(s.canonical_status, 'null'), s.n)
                                        FROM (SELECT m.canonical_status, count(*) AS n FROM public.matches m GROUP BY 1) s), '{}'::jsonb),
          'matches_with_status', count(*) FILTER (WHERE m.canonical_status IS NOT NULL),
          'first_verified_provenance_at', (SELECT min(p.created_at) FROM public.parser_runtime_provenance p WHERE p.status = 'VERIFIED'),
          'matches_created_before_first_verified_provenance', count(*) FILTER (
            WHERE m.canonical_status IS NOT NULL AND m.created_at < COALESCE(
              (SELECT min(p.created_at) FROM public.parser_runtime_provenance p WHERE p.status = 'VERIFIED'), 'infinity'::timestamptz)),
          -- Schema v3: rows preserved and excluded from eligibility by public.canonical_match_quarantine.
          'quarantine', jsonb_build_object(
            'quarantined_matches', (SELECT count(*) FROM public.canonical_match_quarantine),
            'quarantined_with_status', count(*) FILTER (
              WHERE m.canonical_status IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.canonical_match_quarantine q WHERE q.match_id = m.id)),
            'unquarantined_with_status', count(*) FILTER (
              WHERE m.canonical_status IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM public.canonical_match_quarantine q WHERE q.match_id = m.id)),
            'unquarantined_created_before_first_verified_provenance', count(*) FILTER (
              WHERE m.canonical_status IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM public.canonical_match_quarantine q WHERE q.match_id = m.id)
              AND m.created_at < COALESCE(
                (SELECT min(p.created_at) FROM public.parser_runtime_provenance p WHERE p.status = 'VERIFIED'), 'infinity'::timestamptz)),
            'quarantined_completed', count(*) FILTER (
              WHERE m.canonical_status = 'completed' AND EXISTS (
                SELECT 1 FROM public.canonical_match_quarantine q WHERE q.match_id = m.id)),
            'quarantined_derived_rows',
              (SELECT count(*) FROM public.match_metrics x JOIN public.canonical_match_quarantine q ON q.match_id = x.match_id)
              + (SELECT count(*) FROM public.match_features x JOIN public.canonical_match_quarantine q ON q.match_id = x.match_id),
            -- Each guard: the named trigger exists, is enabled and calls the reviewed function.
            'guards', (SELECT jsonb_object_agg(g.tbl || ':' || g.trg, EXISTS (
                SELECT 1 FROM pg_catalog.pg_trigger t
                JOIN pg_catalog.pg_proc f ON f.oid = t.tgfoid
                JOIN pg_catalog.pg_namespace fn ON fn.oid = f.pronamespace
                WHERE t.tgrelid = pg_catalog.to_regclass('public.' || g.tbl) AND t.tgname = g.trg
                  AND t.tgenabled IN ('O', 'A') AND fn.nspname = 'public' AND f.proname = g.fn))
              FROM (VALUES
                ('canonical_match_quarantine', 'canonical_match_quarantine_immutable', 'refuse_canonical_quarantine_change'),
                ('canonical_match_quarantine', 'canonical_match_quarantine_no_truncate', 'refuse_canonical_quarantine_change'),
                ('matches', 'canonical_quarantine_guard', 'guard_canonical_match_quarantine'),
                ('match_sources', 'canonical_quarantine_guard', 'guard_canonical_match_quarantine'),
                ('match_participants', 'canonical_quarantine_guard', 'guard_canonical_match_quarantine'),
                ('match_rounds', 'canonical_quarantine_guard', 'guard_canonical_match_quarantine'),
                ('round_players', 'canonical_quarantine_guard', 'guard_canonical_match_quarantine'),
                ('round_events', 'canonical_quarantine_guard', 'guard_canonical_match_quarantine'),
                ('match_metrics', 'canonical_quarantine_guard', 'guard_canonical_match_quarantine'),
                ('match_features', 'canonical_quarantine_guard', 'guard_canonical_match_quarantine'),
                ('matches', 'canonical_quarantine_no_truncate', 'guard_canonical_quarantine_truncate'),
                ('match_sources', 'canonical_quarantine_no_truncate', 'guard_canonical_quarantine_truncate'),
                ('match_participants', 'canonical_quarantine_no_truncate', 'guard_canonical_quarantine_truncate'),
                ('match_rounds', 'canonical_quarantine_no_truncate', 'guard_canonical_quarantine_truncate'),
                ('round_players', 'canonical_quarantine_no_truncate', 'guard_canonical_quarantine_truncate'),
                ('round_events', 'canonical_quarantine_no_truncate', 'guard_canonical_quarantine_truncate'),
                ('match_metrics', 'canonical_quarantine_no_truncate', 'guard_canonical_quarantine_truncate'),
                ('match_features', 'canonical_quarantine_no_truncate', 'guard_canonical_quarantine_truncate')
              ) AS g(tbl, trg, fn))))
        FROM public.matches m),
      'execution_identity', (SELECT jsonb_build_object(
          'ledger_rows', (SELECT count(*) FROM public.h3e91_execution_evidence_ledger),
          'conflicting_executions', count(*))
        FROM (SELECT l.execution_id FROM public.h3e91_execution_evidence_ledger l GROUP BY l.execution_id
              HAVING count(DISTINCT l.worker_build_commit) > 1 OR count(DISTINCT l.parser_revision) > 1
                  OR count(DISTINCT l.upload_id) > 1) c),
      'retention', public.get_demo_retention_metrics(),
      -- The 20 most recent VERIFIED attestations, identity fields only (no attestation
      -- body, signature value, nonce or secret): what the recorder accepted.
      'provenance', (SELECT jsonb_build_object(
          'verified_rows', (SELECT count(*) FROM public.parser_runtime_provenance WHERE status = 'VERIFIED'),
          'latest', COALESCE(jsonb_agg(r.item ORDER BY r.created_at DESC), '[]'::jsonb))
        FROM (SELECT p.created_at, jsonb_build_object(
                'created_at', pg_catalog.to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
                'deployment_id', p.deployment_id,
                'railway_project_id', p.railway_project_id,
                'railway_service_id', p.railway_service_id,
                'railway_environment_id', p.railway_environment_id,
                'railway_branch', p.railway_branch,
                'git_commit', p.deployment_commit,
                'deployment_source_commit', p.deployment_proof ->> 'source_commit',
                'deployment_status', p.deployment_proof ->> 'deployment_status',
                'semantic_revision', p.semantic_revision,
                'build_revision', p.build_revision,
                'verification_method', p.verification_method,
                'attestation_version', p.attestation_version,
                'signature_is_hmac_sha256_hex', p.attestation_signature ~ '^[0-9a-f]{64}$',
                'attestor_provider', p.attestor_identity ->> 'provider',
                'workflow_event', p.workflow_identity ->> 'event_name',
                'workflow_ref', p.workflow_identity ->> 'workflow_ref',
                'workflow_source_sha', p.workflow_identity ->> 'workflow_source_sha',
                'workflow_run_id', p.workflow_identity ->> 'run_id',
                'critical_hashes', (SELECT jsonb_object_agg(h.key, jsonb_build_object(
                                      'observed', h.value ->> 'observed', 'match', h.value -> 'match'))
                                    FROM jsonb_each(p.critical_source_hashes) h)) AS item
              FROM public.parser_runtime_provenance p
              WHERE p.status = 'VERIFIED'
              ORDER BY p.created_at DESC
              LIMIT 20) r)
    ) AS doc
  )
  SELECT doc || jsonb_build_object('digest', pg_catalog.encode(extensions.digest(pg_catalog.convert_to(doc::text, 'UTF8'), 'sha256'), 'hex'))
  FROM body;
$snapshot$;
REVOKE ALL ON FUNCTION public.h3e_predem_managed_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.h3e_predem_managed_snapshot() TO service_role;
COMMENT ON FUNCTION public.h3e_predem_managed_snapshot() IS
  'H.3-E pre-DEM read-only snapshot: aggregates and digests for the managed-database gates. Writes nothing; never authorizes execution.';
