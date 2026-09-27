-- FASE 2.4.1C — privilege hardening for public.iso_alpha2_codes.
-- The function definition is versioned by the immediately following migration
-- 20260905213132. Keep this earlier hardening migration safe on a clean install
-- while still applying the grants when the function already exists.
DO $$
BEGIN
  IF to_regprocedure('public.iso_alpha2_codes()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.iso_alpha2_codes() FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.iso_alpha2_codes() FROM anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.iso_alpha2_codes() TO authenticated, service_role';
  END IF;
END
$$;