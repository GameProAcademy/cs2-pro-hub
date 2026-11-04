-- Fase 3.2 — optional, player-declared AI Coach preferences.
--
-- What the player CHOOSES to tell the Coach (main difficulty, maps of interest). A preference,
-- never a measurement: the Coach context marks it DECLARED_BY_PLAYER. One row per player,
-- created only when the player saves the optional onboarding, removable by the player
-- (DELETE), and removed with the player profile (ON DELETE CASCADE).
--
-- Level, experience, goals and roles already live in the player profile
-- (player_profiles, player_profile_goals, player_profile_roles) and are not duplicated here.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.coach_preferences (
  player_id uuid PRIMARY KEY REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  main_difficulty text CHECK (
    main_difficulty IS NULL OR main_difficulty IN (
      'AIM', 'POSITIONING', 'UTILITY', 'ECONOMY', 'DECISIONS', 'TEAMPLAY', 'CONSISTENCY', 'MINDSET'
    )
  ),
  maps text[] NOT NULL DEFAULT '{}' CHECK (
    cardinality(maps) <= 12
    AND maps <@ ARRAY[
      'de_ancient', 'de_anubis', 'de_cache', 'de_dust2', 'de_inferno', 'de_mirage',
      'de_nuke', 'de_overpass', 'de_train', 'de_vertigo', 'de_office', 'de_italy'
    ]::text[]
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.coach_preferences ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.coach_preferences FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_preferences TO authenticated;
GRANT ALL ON public.coach_preferences TO service_role;

DROP POLICY IF EXISTS coach_preferences_own ON public.coach_preferences;
CREATE POLICY coach_preferences_own ON public.coach_preferences
  FOR ALL TO authenticated
  USING (public.owns_player(player_id))
  WITH CHECK (public.owns_player(player_id));
