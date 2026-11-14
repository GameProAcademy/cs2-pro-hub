-- PM2 Fase 4.2.4: sampled player positions per round (cs2.round-trajectory.v1) for the 2D replay.
--
-- Written by the pipeline (service role) after the canonical match commits, from the worker's
-- bounded `round_trajectories` block; never backfilled, never reprocessed: matches processed
-- before this release simply have no trajectory (the replay says so). First write wins for a
-- canonical match (a later upload of the same match does not overwrite it).
--
-- match_trajectories: one row per match with the overall status and skipped rounds.
-- round_trajectories: one row per round with the compact samples (see src/lib/replay/trajectory.ts);
-- players[] carries participant_key (the same key round_players already exposes to the owner).
-- Read: the canonical match owners (owns_canonical_match). Write: service role only.
-- Additive and idempotent.
BEGIN;

CREATE TABLE IF NOT EXISTS public.match_trajectories (
  match_id uuid PRIMARY KEY REFERENCES public.matches(id) ON DELETE CASCADE,
  schema text NOT NULL,
  encoding text,
  status text NOT NULL,
  reason text,
  step_ticks integer,
  skipped jsonb NOT NULL DEFAULT '[]'::jsonb,
  parser_revision text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT match_trajectories_schema CHECK (schema = 'cs2.round-trajectory.v1'),
  CONSTRAINT match_trajectories_status CHECK (status IN ('COMPLETE', 'PARTIAL', 'UNAVAILABLE')),
  CONSTRAINT match_trajectories_step CHECK (step_ticks IS NULL OR step_ticks > 0),
  CONSTRAINT match_trajectories_skipped_array CHECK (jsonb_typeof(skipped) = 'array')
);

CREATE TABLE IF NOT EXISTS public.round_trajectories (
  match_id uuid NOT NULL REFERENCES public.match_trajectories(match_id) ON DELETE CASCADE,
  round_number integer NOT NULL,
  first_tick integer NOT NULL,
  end_tick integer NOT NULL,
  step_ticks integer NOT NULL,
  sample_count integer NOT NULL,
  players jsonb NOT NULL,
  dropped_players integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, round_number),
  CONSTRAINT round_trajectories_window CHECK (first_tick >= 0 AND end_tick >= first_tick),
  CONSTRAINT round_trajectories_samples CHECK (step_ticks > 0 AND sample_count BETWEEN 1 AND 1600),
  CONSTRAINT round_trajectories_players_array CHECK (
    jsonb_typeof(players) = 'array' AND jsonb_array_length(players) <= 12),
  -- Bounded row: 12 players x 1600 samples in the compact encoding stays far below this.
  CONSTRAINT round_trajectories_players_size CHECK (pg_column_size(players) <= 400000)
);

ALTER TABLE public.match_trajectories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_trajectories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.match_trajectories, public.round_trajectories FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.match_trajectories, public.round_trajectories FROM authenticated;
GRANT SELECT ON public.match_trajectories, public.round_trajectories TO authenticated;
GRANT ALL ON public.match_trajectories, public.round_trajectories TO service_role;

DROP POLICY IF EXISTS match_trajectories_owner_read ON public.match_trajectories;
CREATE POLICY match_trajectories_owner_read ON public.match_trajectories
  FOR SELECT TO authenticated USING (public.owns_canonical_match(match_id));

DROP POLICY IF EXISTS round_trajectories_owner_read ON public.round_trajectories;
CREATE POLICY round_trajectories_owner_read ON public.round_trajectories
  FOR SELECT TO authenticated USING (public.owns_canonical_match(match_id));

COMMIT;
