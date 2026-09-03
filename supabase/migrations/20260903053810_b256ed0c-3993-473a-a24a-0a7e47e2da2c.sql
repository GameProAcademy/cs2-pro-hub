REVOKE ALL ON FUNCTION public.is_primary_admin(uuid) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.protect_primary_admin_profile() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.protect_primary_admin_roles() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.guard_profile_role() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.sync_user_roles() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM anon, authenticated, public;