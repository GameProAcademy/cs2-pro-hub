-- ============================================================
-- FASE 2: demo ingestion / processing pipeline foundation
-- ============================================================

-- 1. Permanent upload metadata (demo file itself is temporary)
ALTER TABLE public.uploads
  ADD COLUMN IF NOT EXISTS demo_sha256 text,
  ADD COLUMN IF NOT EXISTS parser_name text,
  ADD COLUMN IF NOT EXISTS parser_version text,
  ADD COLUMN IF NOT EXISTS schema_version integer,
  ADD COLUMN IF NOT EXISTS analysis_version text,
  ADD COLUMN IF NOT EXISTS processing_duration_ms integer,
  ADD COLUMN IF NOT EXISTS error_code text;

CREATE INDEX IF NOT EXISTS uploads_demo_sha256_idx ON public.uploads (demo_sha256);

-- 2. matches: additional demo-derived metadata
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS duration_seconds integer,
  ADD COLUMN IF NOT EXISTS game_version text,
  ADD COLUMN IF NOT EXISTS team_player text,
  ADD COLUMN IF NOT EXISTS team_opponent text,
  ADD COLUMN IF NOT EXISTS demo_metadata jsonb;

-- Idempotency: one match per processed upload
CREATE UNIQUE INDEX IF NOT EXISTS matches_upload_id_key
  ON public.matches (upload_id) WHERE upload_id IS NOT NULL;

-- 3. match_metrics: extended derived metrics
ALTER TABLE public.match_metrics
  ADD COLUMN IF NOT EXISTS trade_kills integer,
  ADD COLUMN IF NOT EXISTS trade_deaths integer,
  ADD COLUMN IF NOT EXISTS opening_attempts integer,
  ADD COLUMN IF NOT EXISTS opening_success_rate numeric,
  ADD COLUMN IF NOT EXISTS damage_taken numeric,
  ADD COLUMN IF NOT EXISTS damage_efficiency numeric,
  ADD COLUMN IF NOT EXISTS clutch_attempts integer,
  ADD COLUMN IF NOT EXISTS clutch_wins integer,
  ADD COLUMN IF NOT EXISTS rounds_played integer;

CREATE UNIQUE INDEX IF NOT EXISTS match_metrics_match_player_key
  ON public.match_metrics (match_id, player_id);

-- 4. demo_jobs
CREATE TABLE IF NOT EXISTS public.demo_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  upload_id uuid NOT NULL UNIQUE REFERENCES public.uploads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  player_id uuid REFERENCES public.player_profiles(id) ON DELETE SET NULL,
  status public.upload_status NOT NULL DEFAULT 'pending',
  stage text NOT NULL DEFAULT 'queued',
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 2,
  queued_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer,
  error_code text,
  error_message text,
  parser_name text,
  parser_version text,
  parser_revision text,
  schema_version integer NOT NULL DEFAULT 1,
  analysis_version text NOT NULL DEFAULT 'v1',
  rounds_detected integer,
  rounds_valid integer,
  players_detected integer,
  events_detected integer,
  extraction_confidence numeric,
  partial_parse boolean NOT NULL DEFAULT false,
  quality_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  identity_status text NOT NULL DEFAULT 'unresolved',
  resolved_steam_id text,
  storage_path text,
  demo_sha256 text,
  file_size bigint,
  retain_until timestamptz,
  storage_deleted_at timestamptz,
  cleanup_error text,
  match_id uuid REFERENCES public.matches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT demo_jobs_retry_count_check CHECK (retry_count >= 0 AND retry_count <= 10),
  CONSTRAINT demo_jobs_confidence_check CHECK (extraction_confidence IS NULL OR (extraction_confidence >= 0 AND extraction_confidence <= 1)),
  CONSTRAINT demo_jobs_identity_status_check CHECK (identity_status IN ('unresolved','resolved','ambiguous'))
);

GRANT SELECT ON public.demo_jobs TO authenticated;
GRANT ALL ON public.demo_jobs TO service_role;
ALTER TABLE public.demo_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "demo_jobs_select_own" ON public.demo_jobs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS demo_jobs_user_idx ON public.demo_jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS demo_jobs_status_idx ON public.demo_jobs (status, queued_at);
CREATE INDEX IF NOT EXISTS demo_jobs_player_idx ON public.demo_jobs (player_id);
CREATE INDEX IF NOT EXISTS demo_jobs_match_idx ON public.demo_jobs (match_id);
CREATE INDEX IF NOT EXISTS demo_jobs_sha_idx ON public.demo_jobs (user_id, demo_sha256);
CREATE INDEX IF NOT EXISTS demo_jobs_cleanup_idx ON public.demo_jobs (retain_until) WHERE storage_deleted_at IS NULL;

CREATE TRIGGER demo_jobs_touch BEFORE UPDATE ON public.demo_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5. match_rounds
CREATE TABLE IF NOT EXISTS public.match_rounds (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  round_number integer NOT NULL,
  winner_team text,
  winner_side text,
  start_tick integer,
  end_tick integer,
  duration_seconds numeric,
  bomb_planted boolean NOT NULL DEFAULT false,
  bomb_defused boolean NOT NULL DEFAULT false,
  bomb_exploded boolean NOT NULL DEFAULT false,
  player_side text,
  player_money_start integer,
  player_money_end integer,
  player_equipment_value integer,
  buy_context text,
  player_survived boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT match_rounds_match_round_key UNIQUE (match_id, round_number),
  CONSTRAINT match_rounds_round_number_check CHECK (round_number > 0),
  CONSTRAINT match_rounds_winner_side_check CHECK (winner_side IS NULL OR winner_side IN ('CT','T')),
  CONSTRAINT match_rounds_buy_context_check CHECK (buy_context IS NULL OR buy_context IN ('full_buy','force_buy','half_buy','eco','save','unknown'))
);

GRANT SELECT ON public.match_rounds TO authenticated;
GRANT ALL ON public.match_rounds TO service_role;
ALTER TABLE public.match_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "match_rounds_select_own" ON public.match_rounds
  FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.matches m
      JOIN public.player_profiles p ON p.id = m.player_id
      WHERE m.id = match_rounds.match_id AND p.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS match_rounds_match_idx ON public.match_rounds (match_id, round_number);

-- 6. round_events
CREATE TABLE IF NOT EXISTS public.round_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  round_id uuid REFERENCES public.match_rounds(id) ON DELETE CASCADE,
  round_number integer NOT NULL,
  tick integer,
  time_seconds numeric,
  event_type text NOT NULL,
  actor_steam_id text,
  victim_steam_id text,
  assister_steam_id text,
  weapon text,
  headshot boolean,
  distance numeric,
  damage numeric,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT round_events_event_type_check CHECK (event_type IN (
    'kill','death','assist','damage','flash','smoke','molotov','incendiary','he',
    'bomb_plant','bomb_defuse','bomb_explode','weapon_fire','weapon_purchase',
    'round_start','round_end'
  ))
);

GRANT SELECT ON public.round_events TO authenticated;
GRANT ALL ON public.round_events TO service_role;
ALTER TABLE public.round_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "round_events_select_own" ON public.round_events
  FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.matches m
      JOIN public.player_profiles p ON p.id = m.player_id
      WHERE m.id = round_events.match_id AND p.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS round_events_match_idx ON public.round_events (match_id, round_number);
CREATE INDEX IF NOT EXISTS round_events_round_idx ON public.round_events (round_id);
CREATE INDEX IF NOT EXISTS round_events_type_idx ON public.round_events (match_id, event_type);

-- 7. match_features (analytical signals, NOT a diagnosis)
CREATE TABLE IF NOT EXISTS public.match_features (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  player_id uuid REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  steam_id text,
  sample_rounds integer NOT NULL DEFAULT 0,
  sample_opening_duels integer NOT NULL DEFAULT 0,
  sample_clutches integer NOT NULL DEFAULT 0,
  extraction_confidence numeric,
  partial_parse boolean NOT NULL DEFAULT false,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  schema_version integer NOT NULL DEFAULT 1,
  analysis_version text NOT NULL DEFAULT 'v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT match_features_match_player_key UNIQUE (match_id, player_id),
  CONSTRAINT match_features_confidence_check CHECK (extraction_confidence IS NULL OR (extraction_confidence >= 0 AND extraction_confidence <= 1))
);

GRANT SELECT ON public.match_features TO authenticated;
GRANT ALL ON public.match_features TO service_role;
ALTER TABLE public.match_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "match_features_select_own" ON public.match_features
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR public.owns_player(match_features.player_id));

CREATE INDEX IF NOT EXISTS match_features_player_idx ON public.match_features (player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS match_features_match_idx ON public.match_features (match_id);

-- 8. SECURITY FIX: avatar DELETE restricted to the exact own object
DROP POLICY IF EXISTS "avatars_delete_own" ON storage.objects;
CREATE POLICY "avatars_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND name = auth.uid()::text || '/avatar.webp');

-- 9. Private demo bucket policies (bucket created via storage tooling)
DROP POLICY IF EXISTS "demos_no_client_read" ON storage.objects;
DROP POLICY IF EXISTS "demos_insert_own" ON storage.objects;
CREATE POLICY "demos_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'demos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "demos_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'demos'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_staff(auth.uid()))
  );
