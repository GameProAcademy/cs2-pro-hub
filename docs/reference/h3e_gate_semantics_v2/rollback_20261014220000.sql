-- Rollback of 20261014220000_h3e_attempt_authorization_registry.sql.
-- Fails closed while any authorization is recorded: dropping the registry would erase owner
-- decisions. Roll back 20261014220100 (snapshot v4) first: the v4 snapshot reads this table.
DO $rollback$
BEGIN
  IF pg_catalog.to_regclass('public.h3e_attempt_authorizations') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.h3e_attempt_authorizations) THEN
    RAISE EXCEPTION 'H3E_ATTEMPT_AUTHORIZATION_ROLLBACK_REFUSED_ROWS_PRESENT' USING ERRCODE = '55000';
  END IF;
END;
$rollback$;
DROP TABLE IF EXISTS public.h3e_attempt_authorizations;
DROP FUNCTION IF EXISTS public.check_h3e_attempt_authorization();
DROP FUNCTION IF EXISTS public.refuse_h3e_attempt_authorization_change();
