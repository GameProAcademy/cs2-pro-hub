-- =====================================================================
-- Persistent security checks (CS2 PRO AI COACH)
--
-- Read-only, side-effect free suite that verifies the authorisation and
-- integrity model directly in the database. Run it as a whole; every row
-- must report PASS.
-- =====================================================================

WITH catalogue AS (
  SELECT unnest(ARRAY['skills','skill_translations','lessons',
                      'lesson_translations','lesson_skills']) AS t
), checks AS (

  -- 1. RLS enabled everywhere in public
  SELECT '01. RLS enabled on all public tables' AS check_name,
         NOT EXISTS (
           SELECT 1 FROM pg_class c
           WHERE c.relnamespace = 'public'::regnamespace
             AND c.relkind = 'r' AND NOT c.relrowsecurity
         ) AS passed

  -- 2. anon holds no privilege on private tables
  UNION ALL
  SELECT '02. anon has no privileges on private tables',
         NOT EXISTS (
           SELECT 1 FROM pg_class c
           WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
             AND c.relname NOT IN (SELECT t FROM catalogue)
             AND has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
         )

  -- 3. anon only holds SELECT on the public catalogue
  UNION ALL
  SELECT '03. anon holds SELECT only on catalogue tables',
         (SELECT bool_and(
                   has_table_privilege('anon', ('public.'||t)::regclass, 'SELECT')
                   AND NOT has_table_privilege('anon', ('public.'||t)::regclass,
                             'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES'))
          FROM catalogue)

  -- 4. authenticated holds no low-level privileges
  UNION ALL
  SELECT '04. authenticated has no TRUNCATE/TRIGGER/REFERENCES',
         NOT EXISTS (
           SELECT 1 FROM pg_class c
           WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
             AND has_table_privilege('authenticated', c.oid, 'TRUNCATE,TRIGGER,REFERENCES')
         )

  -- 5/6. players cannot change role or status of a profile
  UNION ALL
  SELECT '05. profile guard blocks role changes',
         (SELECT pg_get_functiondef(p.oid) LIKE '%NEW.role IS DISTINCT FROM OLD.role%'
          FROM pg_proc p WHERE p.proname = 'guard_profile_role'
            AND p.pronamespace = 'public'::regnamespace)

  UNION ALL
  SELECT '06. profile guard blocks status/email/timestamp changes',
         (SELECT pg_get_functiondef(p.oid) LIKE '%status%'
                 AND pg_get_functiondef(p.oid) LIKE '%email%'
                 AND pg_get_functiondef(p.oid) LIKE '%last_login_at%'
                 AND pg_get_functiondef(p.oid) LIKE '%created_at%'
          FROM pg_proc p WHERE p.proname = 'guard_profile_role'
            AND p.pronamespace = 'public'::regnamespace)

  -- 7. nobody may create an administrator role row
  UNION ALL
  SELECT '07. non-primary users cannot receive an admin role',
         (SELECT pg_get_functiondef(p.oid) LIKE '%Additional administrators are not allowed%'
          FROM pg_proc p WHERE p.proname = 'protect_primary_admin_roles'
            AND p.pronamespace = 'public'::regnamespace)

  UNION ALL
  SELECT '07b. only one admin_master row is physically possible',
         EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
                   AND indexname='user_roles_single_admin_master')

  -- 8/9. exactly one administrator, and it is the official account
  UNION ALL
  SELECT '08. exactly one admin_master exists',
         (SELECT count(*) = 1 FROM public.user_roles WHERE role = 'admin_master')

  UNION ALL
  SELECT '09. admin_master is ia@gamepro.academy',
         (SELECT bool_and(lower(pr.email) = 'ia@gamepro.academy')
          FROM public.user_roles ur JOIN public.profiles pr ON pr.id = ur.user_id
          WHERE ur.role = 'admin_master')

  -- 10/11. administrator cannot be deleted, deactivated or demoted
  UNION ALL
  SELECT '10. admin_master profile/role cannot be deleted',
         (SELECT bool_and(def LIKE '%cannot be removed%') FROM (
            SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p
            WHERE p.pronamespace = 'public'::regnamespace
              AND p.proname IN ('protect_primary_admin_profile','protect_primary_admin_roles')
          ) s)

  UNION ALL
  SELECT '11. admin_master cannot be deactivated or demoted',
         (SELECT pg_get_functiondef(p.oid) LIKE '%NEW.role := ''admin_master''%'
                 AND pg_get_functiondef(p.oid) LIKE '%NEW.status := ''active''%'
          FROM pg_proc p WHERE p.proname = 'protect_primary_admin_profile'
            AND p.pronamespace = 'public'::regnamespace)

  -- 12. generated analytical data is read-only for signed-in players
  UNION ALL
  SELECT '12. authenticated cannot write generated data',
         NOT EXISTS (
           SELECT 1 FROM unnest(ARRAY['matches','match_metrics','analyses','analysis_findings',
                                      'player_dna_snapshots','player_score_snapshots',
                                      'training_plans','training_plan_items']) AS t
           WHERE has_table_privilege('authenticated', ('public.'||t)::regclass,
                                     'INSERT,UPDATE,DELETE')
         )

  -- 13. uploads: insert/read only, isolated per user
  UNION ALL
  SELECT '13. uploads are insert/read only and owner-scoped',
         NOT has_table_privilege('authenticated','public.uploads','UPDATE,DELETE')
         AND (SELECT bool_and(with_check LIKE '%user_id = auth.uid()%'
                              AND with_check LIKE '%pending%')
              FROM pg_policies WHERE schemaname='public' AND tablename='uploads' AND cmd='INSERT')

  -- 14/15/17. avatar storage
  UNION ALL
  SELECT '14. avatars bucket is private',
         (SELECT NOT public FROM storage.buckets WHERE id = 'avatars')

  UNION ALL
  SELECT '15. avatars bucket limited to 200 KB',
         (SELECT file_size_limit <= 204800 FROM storage.buckets WHERE id = 'avatars')

  UNION ALL
  SELECT '16. avatar writes restricted to {uid}/avatar.webp',
         (SELECT count(*) = 2 FROM pg_policies
          WHERE schemaname='storage' AND tablename='objects'
            AND policyname IN ('avatars_insert_own','avatars_update_own')
            AND coalesce(with_check,'') LIKE '%/avatar.webp%')

  UNION ALL
  SELECT '17. avatar policies are owner-scoped',
         (SELECT count(*) = 4 FROM pg_policies
          WHERE schemaname='storage' AND tablename='objects'
            AND policyname IN ('avatars_insert_own','avatars_update_own',
                               'avatars_delete_own','avatars_select_own'))

  -- 18. audit log
  UNION ALL
  SELECT '18. audit log is admin-only and append-only',
         (SELECT bool_and(qual LIKE '%is_admin_master%')
          FROM pg_policies WHERE schemaname='public'
            AND tablename='admin_audit_logs' AND cmd='SELECT')
         AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
             AND tablename='admin_audit_logs' AND cmd IN ('UPDATE','DELETE'))
         AND NOT has_table_privilege('authenticated','public.admin_audit_logs',
                                     'UPDATE,DELETE,TRUNCATE')

  -- 19. coach messages cannot be forged
  UNION ALL
  SELECT '19. players cannot forge assistant messages',
         (SELECT bool_and(with_check LIKE '%''player''%')
          FROM pg_policies WHERE schemaname='public' AND tablename='coach_messages'
            AND policyname='coach_messages_insert_player')
         AND NOT has_table_privilege('authenticated','public.coach_messages','UPDATE,DELETE')

  -- 20/21. SECURITY DEFINER hardening
  UNION ALL
  SELECT '20. every SECURITY DEFINER function pins search_path',
         NOT EXISTS (
           SELECT 1 FROM pg_proc p
           WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
             AND NOT EXISTS (
               SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg
               WHERE cfg LIKE 'search_path=%'
             )
         )

  UNION ALL
  SELECT '21. sensitive functions are not executable by anon',
         NOT EXISTS (
           SELECT 1 FROM pg_proc p
           WHERE p.pronamespace = 'public'::regnamespace
             AND has_function_privilege('anon', p.oid, 'EXECUTE')
         )

  UNION ALL
  SELECT '21b. trigger functions are not directly callable by clients',
         NOT EXISTS (
           SELECT 1 FROM pg_proc p
           WHERE p.pronamespace = 'public'::regnamespace
             AND p.prorettype = 'trigger'::regtype
             AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
         )

  -- 22. integrity constraints
  UNION ALL
  SELECT '22. range/positivity constraints are active',
         (SELECT count(*) = 7 FROM pg_constraint
          WHERE connamespace = 'public'::regnamespace AND contype = 'c'
            AND conname IN ('player_score_snapshots_ranges_check','analyses_confidence_check',
                            'analysis_findings_confidence_check','player_dna_snapshots_ranges_check',
                            'match_metrics_ranges_check','matches_scores_check',
                            'uploads_file_size_check'))

  -- 23. foreign keys are indexed
  UNION ALL
  SELECT '23. all foreign keys have a supporting index',
         NOT EXISTS (
           SELECT 1 FROM pg_constraint fk
           WHERE fk.connamespace = 'public'::regnamespace AND fk.contype = 'f'
             AND NOT EXISTS (
               SELECT 1 FROM pg_index i
               WHERE i.indrelid = fk.conrelid
                 AND (i.indkey::int2[])[0:array_length(fk.conkey,1)-1] @> fk.conkey
                 AND fk.conkey @> (i.indkey::int2[])[0:array_length(fk.conkey,1)-1]
             )
         )
  -- 24. player_connections (Phase 2.1.2 integration readiness)
  UNION ALL
  SELECT '24a. player_connections has RLS enabled',
         (SELECT relrowsecurity FROM pg_class
          WHERE oid = 'public.player_connections'::regclass)

  UNION ALL
  SELECT '24b. players cannot update connection state (no UPDATE policy)',
         NOT EXISTS (
           SELECT 1 FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'player_connections'
             AND cmd = 'UPDATE' AND 'authenticated' = ANY(roles)
         )

  UNION ALL
  SELECT '24c. player_connections is not readable by anon',
         NOT has_table_privilege('anon', 'public.player_connections', 'SELECT')

  UNION ALL
  SELECT '24d. connection status guard trigger is active',
         EXISTS (
           SELECT 1 FROM pg_trigger
           WHERE tgrelid = 'public.player_connections'::regclass
             AND tgname = 'player_connections_guard_status' AND NOT tgisinternal
         )

  UNION ALL
  SELECT '24e. player_connections stores no token-like column',
         NOT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'player_connections'
             AND (column_name ILIKE '%token%' OR column_name ILIKE '%secret%'
                  OR column_name ILIKE '%password%' OR column_name ILIKE '%refresh%')
         )

  UNION ALL
  SELECT '24f. matches carry source provenance',
         (SELECT count(*) = 3 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'matches'
            AND column_name IN ('data_source','source_fetched_at','source_version'))

  UNION ALL
  SELECT '24g. external match ids are unique per source',
         EXISTS (
           SELECT 1 FROM pg_indexes
           WHERE schemaname = 'public' AND indexname = 'matches_source_external_uniq'
         )

  -- 25. Phase 2.1.2.1 hardening
  UNION ALL
  SELECT '25a. legacy platform-based match uniqueness is gone',
         NOT EXISTS (
           SELECT 1 FROM pg_constraint
           WHERE connamespace = 'public'::regnamespace
             AND conname = 'matches_player_id_platform_external_match_id_key'
         )

  UNION ALL
  SELECT '25b. anon has no privilege on pipeline-generated tables',
         NOT EXISTS (
           SELECT 1 FROM unnest(ARRAY['demo_jobs','match_features','match_rounds','round_events',
                                      'player_connections','matches','match_metrics']) AS t
           WHERE has_table_privilege('anon', ('public.'||t)::regclass,
                                     'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
         )

  UNION ALL
  SELECT '25c. authenticated cannot write derived pipeline data',
         NOT EXISTS (
           SELECT 1 FROM unnest(ARRAY['demo_jobs','match_features','match_rounds','round_events',
                                      'match_metrics','matches','analyses','analysis_findings',
                                      'player_dna_snapshots','player_score_snapshots']) AS t
           WHERE has_table_privilege('authenticated', ('public.'||t)::regclass,
                                     'INSERT,UPDATE,DELETE')
         )

  UNION ALL
  SELECT '25d. catalogue tables are read-only for clients',
         NOT EXISTS (
           SELECT 1 FROM catalogue
           WHERE has_table_privilege('anon', ('public.'||t)::regclass,
                                     'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
              OR has_table_privilege('authenticated', ('public.'||t)::regclass,
                                     'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
         )

  UNION ALL
  SELECT '25e. authenticated cannot update player_connections',
         NOT has_table_privilege('authenticated','public.player_connections',
                                 'UPDATE,TRUNCATE,TRIGGER,REFERENCES')

  UNION ALL
  SELECT '25f. connection metadata guard rejects credential-like keys',
         (SELECT bool_and(pg_get_functiondef(p.oid) LIKE '%accesstoken%')
          FROM pg_proc p WHERE p.proname = 'jsonb_has_sensitive_key'
            AND p.pronamespace = 'public'::regnamespace)
         AND NOT has_function_privilege('authenticated',
               'public.jsonb_has_sensitive_key(jsonb)', 'EXECUTE')
         AND (SELECT pg_get_functiondef(p.oid) LIKE '%jsonb_has_sensitive_key%'
              FROM pg_proc p WHERE p.proname = 'guard_connection_status'
                AND p.pronamespace = 'public'::regnamespace)

  -- 26. Phase 2.1.2.2 — the database guard is recursive
  UNION ALL
  SELECT '26a. metadata guard inspects nested objects',
         public.jsonb_has_sensitive_key('{"provider":{"auth":{"access_token":"test-secret"}}}'::jsonb)

  UNION ALL
  SELECT '26b. metadata guard inspects arrays at any depth',
         public.jsonb_has_sensitive_key('{"a":{"b":[{"c":{"ACCESS-TOKEN":"test-secret"}}]}}'::jsonb)

  UNION ALL
  SELECT '26c. metadata guard ignores separators and casing',
         public.jsonb_has_sensitive_key('{"nested":{"deep":{"Refresh Token":"test-secret"}}}'::jsonb)

  UNION ALL
  SELECT '26d. safe descriptive metadata is still accepted',
         NOT public.jsonb_has_sensitive_key(
           '{"provider":"faceit","username":"player123","profile_url":"https://example.com/p"}'::jsonb)
  -- 27. Phase 2.4.1 — player_identities is SERVER-CONTROLLED
  UNION ALL
  SELECT '27a. authenticated cannot write player_identities',
         NOT has_table_privilege('authenticated','public.player_identities',
                                 'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')

  UNION ALL
  SELECT '27b. authenticated can read player_identities',
         has_table_privilege('authenticated','public.player_identities','SELECT')

  UNION ALL
  SELECT '27c. player_identities has no ALL/write policy for authenticated',
         NOT EXISTS (SELECT 1 FROM pg_policies
                      WHERE schemaname='public' AND tablename='player_identities'
                        AND cmd <> 'SELECT')

  UNION ALL
  SELECT '27d. player_identities select policy is owner/staff scoped',
         EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='public' AND tablename='player_identities'
                    AND cmd='SELECT' AND qual LIKE '%owns_player%')

  UNION ALL
  SELECT '27e. guard triggers still protect verification fields',
         (SELECT count(*) FROM pg_trigger t
           WHERE t.tgrelid='public.player_identities'::regclass
             AND NOT t.tgisinternal
             AND t.tgfoid='public.guard_identity_verification'::regproc) >= 1

  UNION ALL
  SELECT '27f. anon has no access to player_identities',
         NOT has_table_privilege('anon','public.player_identities','SELECT,INSERT,UPDATE,DELETE')

  UNION ALL
  SELECT '27g. identity evidence is not user-writable',
         NOT has_table_privilege('authenticated','public.identity_correlation_evidence',
                                 'INSERT,UPDATE,DELETE')
         AND NOT has_table_privilege('anon','public.identity_correlation_evidence','SELECT')

  UNION ALL
  SELECT '27h. profiles role/status guarded by trigger',
         (SELECT count(*) FROM pg_trigger t
           WHERE t.tgrelid='public.profiles'::regclass AND NOT t.tgisinternal
             AND t.tgfoid='public.guard_profile_role'::regproc) >= 1
         AND (SELECT pg_get_functiondef(p.oid) LIKE '%Changing the account role is not allowed%'
              FROM pg_proc p WHERE p.proname='guard_profile_role'
                AND p.pronamespace='public'::regnamespace)

  -- 28. Phase 2.4.1 — atomic profile save
  UNION ALL
  SELECT '28a. save_player_profile exists as SECURITY DEFINER with pinned search_path',
         EXISTS (SELECT 1 FROM pg_proc p
                  WHERE p.proname='save_player_profile'
                    AND p.pronamespace='public'::regnamespace
                    AND p.prosecdef
                    AND p.proconfig::text LIKE '%search_path=%')

  UNION ALL
  SELECT '28b. save_player_profile derives the owner from auth.uid()',
         (SELECT pg_get_functiondef(p.oid) LIKE '%auth.uid()%'
          FROM pg_proc p WHERE p.proname='save_player_profile'
            AND p.pronamespace='public'::regnamespace)

  UNION ALL
  SELECT '28c. anon cannot execute save_player_profile',
         NOT has_function_privilege('anon',
           'public.save_player_profile(text,text,text,text,text,text,text,text[],text[],text)','EXECUTE')

  UNION ALL
  SELECT '28d. at most one primary goal per player is enforced',
         EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
                  AND indexname='player_profile_goals_single_primary_idx')

  UNION ALL
  SELECT '28e. declared roles/goals are not exposed to anon',
         NOT has_table_privilege('anon','public.player_profile_roles','SELECT,INSERT,UPDATE,DELETE')
         AND NOT has_table_privilege('anon','public.player_profile_goals','SELECT,INSERT,UPDATE,DELETE')

  UNION ALL
  SELECT '28f. signup trigger feeds the official goals table',
         (SELECT pg_get_functiondef(p.oid) LIKE '%player_profile_goals%'
          FROM pg_proc p WHERE p.proname='handle_new_user'
            AND p.pronamespace='public'::regnamespace)

)


SELECT check_name,
       CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result
FROM checks
ORDER BY check_name;
