-- FASE 2.4.1C — privilege hardening for public.iso_alpha2_codes.
-- This migration historically ran before the function definition was versioned.
-- Keep the migration idempotent on a clean install: the defining migration
-- 20260905213132 creates the function immediately afterwards and applies the
-- same final grants. On an already-initialized database, apply the hardening
-- when the function exists. This avoids making clean migration order depend on
-- a function defined by a later migration.
DO $$
BEGIN
  IF to_regprocedure('public.iso_alpha2_codes()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.iso_alpha2_codes() FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.iso_alpha2_codes() FROM anon;
    GRANT EXECUTE ON FUNCTION public.iso_alpha2_codes() TO authenticated, service_role;
  END IF;
END
$$;