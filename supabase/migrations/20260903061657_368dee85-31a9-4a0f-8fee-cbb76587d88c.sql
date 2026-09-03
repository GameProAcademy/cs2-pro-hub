-- 1. Hardened privilege guard on profiles: status/role/email are privileged columns.
CREATE OR REPLACE FUNCTION public.guard_profile_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := auth.uid();
  is_master boolean := false;
BEGIN
  -- No JWT actor => trusted server-side context (service role / triggers).
  IF actor IS NOT NULL THEN
    is_master := public.is_admin_master(actor);
  END IF;

  IF actor IS NOT NULL AND NOT is_master THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Changing the account role is not allowed'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Changing the account status is not allowed'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'Changing the account email is not allowed'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END; $$;

-- 2. Harden search_path of the SECURITY DEFINER helpers used by RLS policies.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role); $$;

CREATE OR REPLACE FUNCTION public.is_admin_master(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin_master'); $$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','admin_master')); $$;

CREATE OR REPLACE FUNCTION public.is_primary_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND lower(email) = 'ia@gamepro.academy'); $$;

CREATE OR REPLACE FUNCTION public.owns_player(_player_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.player_profiles WHERE id = _player_id AND user_id = auth.uid()); $$;

CREATE OR REPLACE FUNCTION public.owns_analysis(_analysis_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.analyses a JOIN public.player_profiles p ON p.id = a.player_id WHERE a.id = _analysis_id AND p.user_id = auth.uid()); $$;

CREATE OR REPLACE FUNCTION public.owns_plan(_plan_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.training_plans tp JOIN public.player_profiles p ON p.id = tp.player_id WHERE tp.id = _plan_id AND p.user_id = auth.uid()); $$;

CREATE OR REPLACE FUNCTION public.owns_conversation(_conversation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.coach_conversations c JOIN public.player_profiles p ON p.id = c.player_id WHERE c.id = _conversation_id AND p.user_id = auth.uid()); $$;

-- 3. Explicit, minimal EXECUTE grants (needed by RLS policy evaluation).
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin_master(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_primary_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owns_player(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owns_analysis(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owns_plan(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owns_conversation(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_master(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_primary_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owns_player(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owns_analysis(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owns_plan(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owns_conversation(uuid) TO authenticated, service_role;

-- Trigger-only functions must never be callable through the API.
REVOKE ALL ON FUNCTION public.guard_profile_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_user_roles() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_primary_admin_profile() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_primary_admin_roles() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 4. Remove the leftover QA account created during development.
DELETE FROM auth.users WHERE lower(email) = 'qa-45c9f1e3@example.com';