CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin'::public.app_role, 'admin_master'::public.app_role)
  );
$$;

CREATE OR REPLACE FUNCTION public.guard_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status)
     AND auth.uid() IS NOT NULL
     AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'PROFILE_PRIVILEGED_FIELDS_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_profile_privileged_fields() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_profile_privileged_fields() TO service_role;

DROP TRIGGER IF EXISTS guard_profile_privileged_fields_trigger ON public.profiles;
CREATE TRIGGER guard_profile_privileged_fields_trigger
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.guard_profile_privileged_fields();