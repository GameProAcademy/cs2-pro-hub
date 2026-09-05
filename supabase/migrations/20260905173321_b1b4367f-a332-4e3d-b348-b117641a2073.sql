-- 1. player_identities: server-controlled. Authenticated may only SELECT own rows.
DROP POLICY IF EXISTS player_identities_rw ON public.player_identities;
CREATE POLICY player_identities_owner_select ON public.player_identities
  FOR SELECT TO authenticated
  USING (public.owns_player(player_id) OR public.is_staff(auth.uid()));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.player_identities FROM authenticated;
REVOKE ALL ON public.player_identities FROM anon;
GRANT SELECT ON public.player_identities TO authenticated;
GRANT ALL ON public.player_identities TO service_role;

-- 2. identity_correlation_evidence: read-own only, never user-writable.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.identity_correlation_evidence FROM authenticated;
REVOKE ALL ON public.identity_correlation_evidence FROM anon;
GRANT SELECT ON public.identity_correlation_evidence TO authenticated;
GRANT ALL ON public.identity_correlation_evidence TO service_role;

-- 3. Declared roles/goals: no anonymous access.
REVOKE ALL ON public.player_profile_roles FROM anon;
REVOKE ALL ON public.player_profile_goals FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_profile_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_profile_goals TO authenticated;
GRANT ALL ON public.player_profile_roles TO service_role;
GRANT ALL ON public.player_profile_goals TO service_role;

-- 4. At most one primary goal per player.
CREATE UNIQUE INDEX IF NOT EXISTS player_profile_goals_single_primary_idx
  ON public.player_profile_goals (player_id) WHERE is_primary;

-- 5. Migrate legacy player_profiles.competitive_goal into the official table.
INSERT INTO public.player_profile_goals (player_id, goal_code, is_primary)
SELECT p.id, p.competitive_goal, false
  FROM public.player_profiles p
 WHERE p.competitive_goal IS NOT NULL
   AND p.competitive_goal IN ('CLIMB_RATING','AIM_MECHANICS','GAMESENSE_DECISION','CONSISTENCY','COMPETITIVE_TEAM','PRO_CAREER')
   AND NOT EXISTS (
     SELECT 1 FROM public.player_profile_goals g
      WHERE g.player_id = p.id AND g.goal_code = p.competitive_goal
   )
ON CONFLICT DO NOTHING;

COMMENT ON COLUMN public.player_profiles.competitive_goal IS
  'LEGACY: superseded by public.player_profile_goals. Not written by the app anymore.';

-- 6. Atomic profile save. Runs as definer so it can touch profiles.display_name,
--    but every write is scoped to auth.uid(); no caller-supplied user id exists.
CREATE OR REPLACE FUNCTION public.save_player_profile(
  _display_name   text,
  _nickname       text,
  _country        text,
  _main_platform  text,
  _current_level  text,
  _experience     text,
  _team           text,
  _role_codes     text[],
  _goal_codes     text[],
  _primary_goal   text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _uid uuid := auth.uid();
  _player_id uuid;
  _roles text[] := COALESCE(_role_codes, '{}');
  _goals text[] := COALESCE(_goal_codes, '{}');
  _primary text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM unnest(_roles) r WHERE r NOT IN
      ('IGL','ENTRY','TRADE','RIFLER','AWPER','SUPPORT','LURKER','ANCHOR','FLEX')) THEN
    RAISE EXCEPTION 'Invalid team role code' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(_goals) g WHERE g NOT IN
      ('CLIMB_RATING','AIM_MECHANICS','GAMESENSE_DECISION','CONSISTENCY','COMPETITIVE_TEAM','PRO_CAREER')) THEN
    RAISE EXCEPTION 'Invalid goal code' USING ERRCODE = '22023';
  END IF;
  IF _main_platform IS NOT NULL AND _main_platform NOT IN ('STEAM_PREMIER','FACEIT','GAMERS_CLUB','OTHER') THEN
    RAISE EXCEPTION 'Invalid platform code' USING ERRCODE = '22023';
  END IF;
  IF _experience IS NOT NULL AND _experience NOT IN ('LESS_1Y','1_3Y','3_5Y','MORE_5Y') THEN
    RAISE EXCEPTION 'Invalid experience code' USING ERRCODE = '22023';
  END IF;
  IF _country IS NOT NULL AND _country !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'Invalid country code' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO _player_id FROM public.player_profiles WHERE user_id = _uid;
  IF _player_id IS NULL THEN
    INSERT INTO public.player_profiles (user_id) VALUES (_uid) RETURNING id INTO _player_id;
  END IF;

  UPDATE public.player_profiles
     SET nickname = _nickname,
         country = _country,
         main_platform = _main_platform,
         current_level = _current_level,
         experience = _experience,
         team = _team
   WHERE id = _player_id AND user_id = _uid;

  IF _display_name IS NOT NULL THEN
    UPDATE public.profiles SET display_name = _display_name WHERE id = _uid;
  END IF;

  DELETE FROM public.player_profile_roles WHERE player_id = _player_id;
  IF array_length(_roles, 1) > 0 THEN
    INSERT INTO public.player_profile_roles (player_id, role_code)
    SELECT _player_id, r FROM unnest(_roles) r
    ON CONFLICT DO NOTHING;
  END IF;

  DELETE FROM public.player_profile_goals WHERE player_id = _player_id;
  IF array_length(_goals, 1) > 0 THEN
    _primary := CASE WHEN _primary_goal IS NOT NULL AND _primary_goal = ANY(_goals)
                     THEN _primary_goal ELSE _goals[1] END;
    INSERT INTO public.player_profile_goals (player_id, goal_code, is_primary)
    SELECT _player_id, g, g = _primary FROM unnest(_goals) g
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN _player_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_player_profile(text,text,text,text,text,text,text,text[],text[],text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_player_profile(text,text,text,text,text,text,text,text[],text[],text) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_player_profile(text,text,text,text,text,text,text,text[],text[],text) TO authenticated, service_role;