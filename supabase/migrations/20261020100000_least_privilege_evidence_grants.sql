-- Least privilege on evidence and identity tables (2026-10-20, forward-only).
--
-- Production audit (RLS probe with the real second player account, transaction rolled
-- back): RLS isolates every row, but five tables still carry the platform default
-- table grants, including TRUNCATE (which RLS does not govern) and, for three of them,
-- every privilege to `anon`:
--   demo_identity_decisions, player_nickname_history, raw_demo_evidence_reports:
--     anon + authenticated: INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
--   raw_evidence_artifacts, raw_evidence_chunks:
--     authenticated: INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
-- Each table has only a SELECT policy for `authenticated`; every write is done by the
-- service role or a SECURITY DEFINER function (record_demo_identity_event), and the
-- application reads them with the user client through SELECT only.
--
-- This migration keeps SELECT for `authenticated` where granted (RLS still decides rows),
-- removes every other privilege from `authenticated`, and every privilege from `anon`.
-- service_role, postgres, policies, triggers, rows and functions are untouched.
BEGIN;

DO $least$
DECLARE
  _tables constant text[] := ARRAY[
    'demo_identity_decisions', 'player_nickname_history', 'raw_demo_evidence_reports',
    'raw_evidence_artifacts', 'raw_evidence_chunks'
  ];
  _table text;
  _left text;
  _had_select boolean;
BEGIN
  FOREACH _table IN ARRAY _tables LOOP
    -- Preconditions: the table exists and RLS is on.
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = _table AND c.relkind = 'r' AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'LEAST_PRIVILEGE_PRECONDITION: public.% missing or RLS disabled', _table
        USING ERRCODE = '55000';
    END IF;
    -- SELECT for authenticated is preserved exactly as found (present in production).
    _had_select := EXISTS (
      SELECT 1 FROM information_schema.role_table_grants g
       WHERE g.table_schema = 'public' AND g.table_name = _table
         AND g.grantee = 'authenticated' AND g.privilege_type = 'SELECT'
    );

    EXECUTE pg_catalog.format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM authenticated', _table);
    EXECUTE pg_catalog.format('REVOKE ALL ON public.%I FROM anon', _table);

    -- Postconditions: authenticated keeps exactly the SELECT it had; anon keeps nothing.
    SELECT pg_catalog.string_agg(g.privilege_type, ',' ORDER BY g.privilege_type) INTO _left
      FROM information_schema.role_table_grants g
     WHERE g.table_schema = 'public' AND g.table_name = _table AND g.grantee = 'authenticated';
    IF _left IS DISTINCT FROM (CASE WHEN _had_select THEN 'SELECT' END) THEN
      RAISE EXCEPTION 'LEAST_PRIVILEGE_POSTCONDITION: authenticated on public.% = %', _table, _left
        USING ERRCODE = '55000';
    END IF;
    IF EXISTS (
      SELECT 1 FROM information_schema.role_table_grants g
       WHERE g.table_schema = 'public' AND g.table_name = _table AND g.grantee = 'anon'
    ) THEN
      RAISE EXCEPTION 'LEAST_PRIVILEGE_POSTCONDITION: anon still holds a privilege on public.%', _table
        USING ERRCODE = '55000';
    END IF;
  END LOOP;
END;
$least$;

COMMIT;
