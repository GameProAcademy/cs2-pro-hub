-- 1) Bootstrap the single admin_master (bypass the role guard for this maintenance step)
ALTER TABLE public.profiles DISABLE TRIGGER profiles_guard_role;

UPDATE public.profiles SET role = 'admin_master'
WHERE lower(email) = 'ia@gamepro.academy';

UPDATE public.profiles SET role = 'player'
WHERE lower(email) <> 'ia@gamepro.academy' AND role <> 'player';

ALTER TABLE public.profiles ENABLE TRIGGER profiles_guard_role;

-- Keep authoritative roles in sync for the bootstrapped account
DELETE FROM public.user_roles r
USING public.profiles p
WHERE r.user_id = p.id AND lower(p.email) = 'ia@gamepro.academy' AND r.role <> 'admin_master';

INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'admin_master'::app_role FROM public.profiles p
WHERE lower(p.email) = 'ia@gamepro.academy'
ON CONFLICT (user_id, role) DO NOTHING;

-- 2) Protect the primary administrator
CREATE OR REPLACE FUNCTION public.is_primary_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND lower(email) = 'ia@gamepro.academy'
  );
$$;

CREATE OR REPLACE FUNCTION public.protect_primary_admin_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF lower(COALESCE(OLD.email,'')) = 'ia@gamepro.academy' THEN
      RAISE EXCEPTION 'The primary administrator cannot be removed';
    END IF;
    RETURN OLD;
  END IF;

  IF lower(COALESCE(OLD.email,'')) = 'ia@gamepro.academy' THEN
    NEW.role := 'admin_master';
    NEW.status := 'active';
  ELSIF NEW.role = 'admin_master' AND OLD.role <> 'admin_master' THEN
    -- Only one administrator exists in this product; nobody else may become one.
    NEW.role := OLD.role;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS profiles_protect_primary_admin ON public.profiles;
CREATE TRIGGER profiles_protect_primary_admin
BEFORE UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_primary_admin_profile();

CREATE OR REPLACE FUNCTION public.protect_primary_admin_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'admin_master' AND public.is_primary_admin(OLD.user_id) THEN
      RAISE EXCEPTION 'The primary administrator role cannot be removed';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.role IN ('admin','admin_master') AND NOT public.is_primary_admin(NEW.user_id) THEN
    RAISE EXCEPTION 'Additional administrators are not allowed';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS user_roles_protect_primary_admin ON public.user_roles;
CREATE TRIGGER user_roles_protect_primary_admin
BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.protect_primary_admin_roles();