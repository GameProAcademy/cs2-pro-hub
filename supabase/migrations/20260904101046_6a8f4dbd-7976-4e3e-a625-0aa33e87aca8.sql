-- 1. Player declared roles ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.player_profile_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  role_code text NOT NULL CHECK (role_code IN ('IGL','ENTRY','TRADE','RIFLER','AWPER','SUPPORT','LURKER','ANCHOR','FLEX')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT player_profile_roles_unique UNIQUE (player_id, role_code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_profile_roles TO authenticated;
GRANT ALL ON public.player_profile_roles TO service_role;
ALTER TABLE public.player_profile_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner manages own declared roles" ON public.player_profile_roles;
CREATE POLICY "Owner manages own declared roles" ON public.player_profile_roles
  FOR ALL TO authenticated
  USING (public.owns_player(player_id))
  WITH CHECK (public.owns_player(player_id));

DROP POLICY IF EXISTS "Staff reads declared roles" ON public.player_profile_roles;
CREATE POLICY "Staff reads declared roles" ON public.player_profile_roles
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

DROP TRIGGER IF EXISTS player_profile_roles_touch ON public.player_profile_roles;
CREATE TRIGGER player_profile_roles_touch BEFORE UPDATE ON public.player_profile_roles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS player_profile_roles_player_idx ON public.player_profile_roles(player_id);

-- 2. Player declared goals ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.player_profile_goals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  goal_code text NOT NULL CHECK (goal_code IN ('CLIMB_RATING','AIM_MECHANICS','GAMESENSE_DECISION','CONSISTENCY','COMPETITIVE_TEAM','PRO_CAREER')),
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT player_profile_goals_unique UNIQUE (player_id, goal_code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_profile_goals TO authenticated;
GRANT ALL ON public.player_profile_goals TO service_role;
ALTER TABLE public.player_profile_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner manages own declared goals" ON public.player_profile_goals;
CREATE POLICY "Owner manages own declared goals" ON public.player_profile_goals
  FOR ALL TO authenticated
  USING (public.owns_player(player_id))
  WITH CHECK (public.owns_player(player_id));

DROP POLICY IF EXISTS "Staff reads declared goals" ON public.player_profile_goals;
CREATE POLICY "Staff reads declared goals" ON public.player_profile_goals
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

DROP TRIGGER IF EXISTS player_profile_goals_touch ON public.player_profile_goals;
CREATE TRIGGER player_profile_goals_touch BEFORE UPDATE ON public.player_profile_goals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS player_profile_goals_player_idx ON public.player_profile_goals(player_id);
CREATE UNIQUE INDEX IF NOT EXISTS player_profile_goals_single_primary_idx
  ON public.player_profile_goals(player_id) WHERE is_primary;

-- 3. Stable codes on player_profiles --------------------------------------
UPDATE public.player_profiles SET country = NULL
 WHERE country IS NOT NULL AND country !~ '^[A-Z]{2}$';
UPDATE public.player_profiles SET main_platform = NULL
 WHERE main_platform IS NOT NULL
   AND main_platform NOT IN ('STEAM_PREMIER','FACEIT','GAMERS_CLUB','OTHER');

ALTER TABLE public.player_profiles
  DROP CONSTRAINT IF EXISTS player_profiles_country_iso_chk;
ALTER TABLE public.player_profiles
  ADD CONSTRAINT player_profiles_country_iso_chk
  CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');

ALTER TABLE public.player_profiles
  DROP CONSTRAINT IF EXISTS player_profiles_main_platform_chk;
ALTER TABLE public.player_profiles
  ADD CONSTRAINT player_profiles_main_platform_chk
  CHECK (main_platform IS NULL OR main_platform IN ('STEAM_PREMIER','FACEIT','GAMERS_CLUB','OTHER'));

-- 4. Identity confidence integrity ---------------------------------------
UPDATE public.player_identities SET confidence_score = 0
 WHERE confidence_score < 0 OR confidence_score > 1;
ALTER TABLE public.player_identities
  DROP CONSTRAINT IF EXISTS player_identities_confidence_range_chk;
ALTER TABLE public.player_identities
  ADD CONSTRAINT player_identities_confidence_range_chk
  CHECK (confidence_score >= 0 AND confidence_score <= 1);

ALTER TABLE public.identity_correlation_evidence
  DROP CONSTRAINT IF EXISTS identity_correlation_evidence_confidence_range_chk;
ALTER TABLE public.identity_correlation_evidence
  ADD CONSTRAINT identity_correlation_evidence_confidence_range_chk
  CHECK (confidence_score >= 0 AND confidence_score <= 1);

-- 5. Users can never self-promote identity verification -------------------
CREATE OR REPLACE FUNCTION public.guard_identity_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL OR public.is_admin_master(actor) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Server-controlled trust fields always start neutral for user-created rows.
    NEW.is_verified := false;
    NEW.identity_status := 'unlinked'::public.identity_link_status;
    NEW.confidence_score := 0;
    NEW.verification_method := NULL;
    NEW.verified_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified
     OR NEW.identity_status IS DISTINCT FROM OLD.identity_status
     OR NEW.confidence_score IS DISTINCT FROM OLD.confidence_score
     OR NEW.verification_method IS DISTINCT FROM OLD.verification_method
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
     OR NEW.external_id IS DISTINCT FROM OLD.external_id
     OR NEW.platform IS DISTINCT FROM OLD.platform THEN
    RAISE EXCEPTION 'Identity verification state is managed by the server' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $function$;