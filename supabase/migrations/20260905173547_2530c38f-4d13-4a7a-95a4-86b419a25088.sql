-- Normalise legacy declared levels to the official codes.
UPDATE public.player_profiles
   SET current_level = CASE lower(current_level)
     WHEN 'beginner' THEN 'BEGINNER'
     WHEN 'intermediate' THEN 'INTERMEDIATE'
     WHEN 'advanced' THEN 'ADVANCED'
     WHEN 'semi-pro' THEN 'SEMI_PRO'
     WHEN 'semi_pro' THEN 'SEMI_PRO'
     ELSE current_level
   END
 WHERE current_level IS NOT NULL
   AND current_level NOT IN ('BEGINNER','INTERMEDIATE','ADVANCED','SEMI_PRO');

-- Signup now feeds the official goals table with the same codes the profile uses.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  _player_id uuid;
  _goal text := NEW.raw_user_meta_data->>'competitive_goal';
  _level text := upper(replace(COALESCE(NEW.raw_user_meta_data->>'current_level',''), '-', '_'));
BEGIN
  INSERT INTO public.profiles (id, email, display_name, nickname, country, locale)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'name', split_part(COALESCE(NEW.email,''),'@',1)),
    NEW.raw_user_meta_data->>'nickname',
    NEW.raw_user_meta_data->>'country',
    COALESCE(NEW.raw_user_meta_data->>'locale','en')
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.player_profiles (user_id, nickname, country, main_platform, current_level, competitive_goal)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'nickname',
    NEW.raw_user_meta_data->>'country',
    NEW.raw_user_meta_data->>'main_platform',
    NULLIF(_level, ''),
    NULL
  ) ON CONFLICT (user_id) DO NOTHING
  RETURNING id INTO _player_id;

  IF _player_id IS NULL THEN
    SELECT id INTO _player_id FROM public.player_profiles WHERE user_id = NEW.id;
  END IF;

  IF _player_id IS NOT NULL AND _goal IN
     ('CLIMB_RATING','AIM_MECHANICS','GAMESENSE_DECISION','CONSISTENCY','COMPETITIVE_TEAM','PRO_CAREER') THEN
    INSERT INTO public.player_profile_goals (player_id, goal_code, is_primary)
    VALUES (_player_id, _goal, true)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;