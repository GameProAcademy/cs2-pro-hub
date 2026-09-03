REVOKE ALL ON FUNCTION public.is_primary_admin(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_primary_admin(uuid) TO service_role;