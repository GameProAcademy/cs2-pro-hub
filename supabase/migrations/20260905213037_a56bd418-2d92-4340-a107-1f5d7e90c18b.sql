REVOKE ALL ON FUNCTION public.iso_alpha2_codes() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.iso_alpha2_codes() FROM anon;
GRANT EXECUTE ON FUNCTION public.iso_alpha2_codes() TO authenticated, service_role;