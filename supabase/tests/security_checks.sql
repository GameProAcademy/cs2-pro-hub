-- =====================================================================
-- Persistent security checks (CS2 PRO AI COACH)
--
-- Read-only, side-effect free suite that verifies the authorisation model
-- directly in the database. Run it as a whole; every row must report PASS.
--
-- What is verified:
--   1. RLS is enabled on every application table.
--   2. No table in the public schema is exposed to anonymous users beyond
--      the intentionally public catalogue (skills / lessons + translations).
--   3. Only `admin_master` is recognised as an administrator.
--   4. Players cannot write system-generated analytical data.
--   5. Audit log is administrator-only and append-only.
--   6. Avatar storage is owner-scoped and the bucket is private with a
--      200 KB ceiling.
-- =====================================================================

WITH checks AS (

  -- 1. RLS enabled everywhere in public
  SELECT '1. RLS enabled on all public tables' AS check_name,
         NOT EXISTS (
           SELECT 1 FROM pg_tables t
           JOIN pg_class c ON c.relname = t.tablename AND c.relnamespace = 'public'::regnamespace
           WHERE t.schemaname = 'public' AND NOT c.relrowsecurity
         ) AS passed

  -- 2. anon may only read the public catalogue
  UNION ALL
  SELECT '2. anon privileges limited to public catalogue',
         NOT EXISTS (
           SELECT 1 FROM information_schema.role_table_grants
           WHERE grantee = 'anon' AND table_schema = 'public'
             AND table_name NOT IN ('skills','skill_translations','lessons',
                                    'lesson_translations','lesson_skills')
         )

  -- 3. single-administrator model
  UNION ALL
  SELECT '3. is_staff recognises only admin_master',
         (SELECT pg_get_functiondef(p.oid) LIKE '%admin_master%'
                 AND pg_get_functiondef(p.oid) NOT LIKE '%''admin''%'
          FROM pg_proc p WHERE p.proname = 'is_staff'
            AND p.pronamespace = 'public'::regnamespace)

  UNION ALL
  SELECT '3b. exactly one admin_master role row',
         (SELECT count(*) = 1 FROM public.user_roles WHERE role = 'admin_master')

  UNION ALL
  SELECT '3c. admin_master belongs to the primary administrator',
         (SELECT bool_and(lower(pr.email) = 'ia@gamepro.academy')
          FROM public.user_roles ur JOIN public.profiles pr ON pr.id = ur.user_id
          WHERE ur.role = 'admin_master')

  -- 4. generated data is read-only for signed-in players
  UNION ALL
  SELECT '4. authenticated cannot write generated data',
         NOT EXISTS (
           SELECT 1 FROM information_schema.role_table_grants
           WHERE grantee = 'authenticated' AND table_schema = 'public'
             AND table_name IN ('matches','match_metrics','analyses','analysis_findings',
                                'player_dna_snapshots','player_score_snapshots',
                                'training_plans','training_plan_items')
             AND privilege_type IN ('INSERT','UPDATE','DELETE')
         )

  UNION ALL
  SELECT '4b. uploads are insert/read only for players',
         NOT EXISTS (
           SELECT 1 FROM information_schema.role_table_grants
           WHERE grantee = 'authenticated' AND table_schema = 'public'
             AND table_name = 'uploads' AND privilege_type IN ('UPDATE','DELETE')
         )

  -- 5. audit log
  UNION ALL
  SELECT '5. audit log readable by admin_master only',
         (SELECT bool_and(qual LIKE '%is_admin_master%')
          FROM pg_policies WHERE schemaname='public'
            AND tablename='admin_audit_logs' AND cmd='SELECT')

  UNION ALL
  SELECT '5b. audit log is append-only',
         NOT EXISTS (
           SELECT 1 FROM pg_policies WHERE schemaname='public'
             AND tablename='admin_audit_logs' AND cmd IN ('UPDATE','DELETE')
         )

  -- 6. avatar storage
  UNION ALL
  SELECT '6. avatars bucket private with 200 KB limit',
         (SELECT NOT public AND file_size_limit <= 204800
          FROM storage.buckets WHERE id = 'avatars')

  UNION ALL
  SELECT '6b. avatar writes are owner-scoped',
         (SELECT count(*) = 3 FROM pg_policies
          WHERE schemaname='storage' AND tablename='objects'
            AND policyname IN ('avatars_insert_own','avatars_update_own','avatars_delete_own'))

  -- 7. role/status/email/timestamps guarded on profiles
  UNION ALL
  SELECT '7. profile guard protects privileged columns',
         (SELECT pg_get_functiondef(p.oid) LIKE '%role%'
                 AND pg_get_functiondef(p.oid) LIKE '%status%'
                 AND pg_get_functiondef(p.oid) LIKE '%email%'
                 AND pg_get_functiondef(p.oid) LIKE '%last_login_at%'
                 AND pg_get_functiondef(p.oid) LIKE '%created_at%'
          FROM pg_proc p WHERE p.proname = 'guard_profile_role'
            AND p.pronamespace = 'public'::regnamespace)
)
SELECT check_name,
       CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result
FROM checks
ORDER BY check_name;
