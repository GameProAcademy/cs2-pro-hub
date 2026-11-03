-- Training catalog: tighten table privileges to the project convention (forward-only fix).
--
-- 20261103120000_training_catalog granted only what it needed, but new tables in `public`
-- also received the platform's default privileges: ALL (including TRUNCATE, which RLS does
-- not govern) for `anon` and `authenticated`. Read back on production 2026-11-03 right after
-- the apply. This migration removes everything the catalog does not use, exactly like
-- earlier migrations do for their tables (e.g. player_identities):
--   anon          → nothing;
--   authenticated → SELECT, INSERT, UPDATE, DELETE on groups/courses/lessons (RLS: read
--                   active rows, write admin_master only); SELECT, INSERT on import runs
--                   (RLS: admin_master only);
--   service_role  → unchanged.
-- No row, policy, function or other table is touched. Idempotent.
BEGIN;

REVOKE ALL ON public.catalog_content_groups, public.catalog_courses, public.catalog_lessons,
  public.catalog_import_runs FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.catalog_content_groups, public.catalog_courses,
  public.catalog_lessons FROM authenticated;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.catalog_import_runs FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_content_groups, public.catalog_courses,
  public.catalog_lessons TO authenticated;
GRANT SELECT, INSERT ON public.catalog_import_runs TO authenticated;

DO $grants$
DECLARE
  _t text;
BEGIN
  FOREACH _t IN ARRAY ARRAY['catalog_content_groups','catalog_courses','catalog_lessons','catalog_import_runs'] LOOP
    IF pg_catalog.has_table_privilege('anon', 'public.' || _t, 'SELECT')
       OR pg_catalog.has_table_privilege('authenticated', 'public.' || _t, 'TRUNCATE') THEN
      RAISE EXCEPTION 'CATALOG_GRANTS_NOT_TIGHTENED: %', _t USING ERRCODE = '55000';
    END IF;
  END LOOP;
END;
$grants$;

COMMIT;
