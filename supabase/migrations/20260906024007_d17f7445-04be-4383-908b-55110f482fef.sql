-- ============================================================
-- FASE 2.6.2 — CANONICAL MATCH ENGINE (source-neutral schema)
-- Evolution, not destruction: legacy player-scoped columns stay.
-- ============================================================

-- ---------- helpers ----------
CREATE OR REPLACE FUNCTION public.canonical_source_priority(_source public.data_source)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE _source
    WHEN 'demo' THEN 100
    WHEN 'faceit' THEN 60
    WHEN 'gamers_club' THEN 50
    WHEN 'steam' THEN 30
    WHEN 'public_profile' THEN 10
    ELSE 0 END;
$$;

-- ---------- match_series ----------
CREATE TABLE IF NOT EXISTS public.match_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game text NOT NULL DEFAULT 'cs2',
  source public.data_source NOT NULL,
  external_series_id text,
  best_of integer CHECK (best_of IS NULL OR best_of > 0),
  status text NOT NULL DEFAULT 'unknown'
    CHECK (status IN ('queued','processing','completed','partial','failed','cancelled','unknown')),
  started_at timestamptz,
  finished_at timestamptz,
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  team_a text,
  team_b text,
  maps_won_team_a integer CHECK (maps_won_team_a IS NULL OR maps_won_team_a >= 0),
  maps_won_team_b integer CHECK (maps_won_team_b IS NULL OR maps_won_team_b >= 0),
  winner_team text CHECK (winner_team IS NULL OR winner_team IN ('team_a','team_b')),
  canonical_schema_version integer NOT NULL DEFAULT 2,
  quality jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.match_series TO authenticated;
GRANT ALL ON public.match_series TO service_role;
ALTER TABLE public.match_series ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS match_series_source_external_uniq
  ON public.match_series (source, external_series_id) WHERE external_series_id IS NOT NULL;

-- ---------- matches: neutral columns ----------
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS series_id uuid REFERENCES public.match_series(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS game text NOT NULL DEFAULT 'cs2',
  ADD COLUMN IF NOT EXISTS map_number integer,
  ADD COLUMN IF NOT EXISTS team_a text,
  ADD COLUMN IF NOT EXISTS team_b text,
  ADD COLUMN IF NOT EXISTS score_team_a integer,
  ADD COLUMN IF NOT EXISTS score_team_b integer,
  ADD COLUMN IF NOT EXISTS winner_team text,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS played_at timestamptz,
  ADD COLUMN IF NOT EXISTS canonical_status text,
  ADD COLUMN IF NOT EXISTS finished boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS terminal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS round_count integer,
  ADD COLUMN IF NOT EXISTS canonical_schema_version integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS quality jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS coverage jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS content_fingerprint text,
  ADD COLUMN IF NOT EXISTS canonical_source public.data_source,
  ADD COLUMN IF NOT EXISTS round_source public.data_source;

-- A canonical match does not belong to one player.
ALTER TABLE public.matches ALTER COLUMN player_id DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.matches ADD CONSTRAINT matches_winner_team_check
    CHECK (winner_team IS NULL OR winner_team IN ('team_a','team_b'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.matches ADD CONSTRAINT matches_canonical_status_check
    CHECK (canonical_status IS NULL OR canonical_status IN
      ('queued','processing','completed','partial','failed','cancelled','unknown'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.matches ADD CONSTRAINT matches_neutral_scores_check
    CHECK ((score_team_a IS NULL OR score_team_a >= 0)
       AND (score_team_b IS NULL OR score_team_b >= 0)
       AND (round_count IS NULL OR round_count >= 0)
       AND (map_number IS NULL OR map_number > 0));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS matches_content_fingerprint_uniq
  ON public.matches (content_fingerprint) WHERE content_fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS matches_series_idx ON public.matches (series_id, map_number);
CREATE INDEX IF NOT EXISTS matches_played_at_idx ON public.matches (played_at DESC);

-- ---------- match_sources ----------
CREATE TABLE IF NOT EXISTS public.match_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  series_id uuid REFERENCES public.match_series(id) ON DELETE SET NULL,
  source public.data_source NOT NULL,
  source_contract_version text NOT NULL,
  external_match_id text,
  external_parent_id text,
  source_version text,
  fetched_at timestamptz NOT NULL,
  source_updated_at timestamptz,
  status text NOT NULL DEFAULT 'unknown'
    CHECK (status IN ('complete','incomplete','stale','conflicting','unknown')),
  quality jsonb NOT NULL DEFAULT '{}'::jsonb,
  fingerprint text,
  upload_id uuid REFERENCES public.uploads(id) ON DELETE SET NULL,
  observation_count integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.match_sources TO authenticated;
GRANT ALL ON public.match_sources TO service_role;
ALTER TABLE public.match_sources ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS match_sources_source_external_uniq
  ON public.match_sources (source, external_match_id) WHERE external_match_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS match_sources_source_fingerprint_uniq
  ON public.match_sources (source, fingerprint) WHERE fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS match_sources_match_idx ON public.match_sources (match_id, source);

-- ---------- match_participants ----------
CREATE TABLE IF NOT EXISTS public.match_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  participant_key text NOT NULL,
  internal_player_id uuid REFERENCES public.player_profiles(id) ON DELETE SET NULL,
  source public.data_source NOT NULL,
  external_player_id text,
  steam_id64 text,
  nickname_snapshot text,
  team text CHECK (team IS NULL OR team IN ('team_a','team_b')),
  is_target_player boolean NOT NULL DEFAULT false,
  identity_status public.identity_link_status NOT NULL DEFAULT 'unlinked',
  identity_confidence numeric
    CHECK (identity_confidence IS NULL OR (identity_confidence >= 0 AND identity_confidence <= 1)),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT match_participants_match_key_uniq UNIQUE (match_id, participant_key)
);

GRANT SELECT ON public.match_participants TO authenticated;
GRANT ALL ON public.match_participants TO service_role;
ALTER TABLE public.match_participants ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS match_participants_player_idx
  ON public.match_participants (internal_player_id) WHERE internal_player_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS match_participants_steam_idx
  ON public.match_participants (steam_id64) WHERE steam_id64 IS NOT NULL;

-- ---------- match_rounds: neutral columns ----------
ALTER TABLE public.match_rounds
  ADD COLUMN IF NOT EXISTS winning_team text,
  ADD COLUMN IF NOT EXISTS winning_side text,
  ADD COLUMN IF NOT EXISTS win_reason text,
  ADD COLUMN IF NOT EXISTS start_time_seconds numeric,
  ADD COLUMN IF NOT EXISTS end_time_seconds numeric,
  ADD COLUMN IF NOT EXISTS quality jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- NULL ≠ FALSE: an unknown bomb fact must be expressible.
ALTER TABLE public.match_rounds ALTER COLUMN bomb_planted DROP NOT NULL;
ALTER TABLE public.match_rounds ALTER COLUMN bomb_defused DROP NOT NULL;
ALTER TABLE public.match_rounds ALTER COLUMN bomb_exploded DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.match_rounds ADD CONSTRAINT match_rounds_winning_team_check
    CHECK (winning_team IS NULL OR winning_team IN ('team_a','team_b'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.match_rounds ADD CONSTRAINT match_rounds_winning_side_check
    CHECK (winning_side IS NULL OR winning_side IN ('CT','T'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.match_rounds ADD CONSTRAINT match_rounds_win_reason_check
    CHECK (win_reason IS NULL OR win_reason IN
      ('elimination','bomb_exploded','bomb_defused','time_expired','surrender','unknown'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- round_players ----------
CREATE TABLE IF NOT EXISTS public.round_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  round_id uuid REFERENCES public.match_rounds(id) ON DELETE CASCADE,
  round_number integer NOT NULL CHECK (round_number > 0),
  participant_key text NOT NULL,
  internal_player_id uuid REFERENCES public.player_profiles(id) ON DELETE SET NULL,
  side text CHECK (side IS NULL OR side IN ('CT','T')),
  survived boolean,
  money_start integer,
  money_end integer,
  equipment_value integer,
  buy_context text CHECK (buy_context IS NULL OR buy_context IN
    ('full_buy','force_buy','half_buy','eco','save','unknown')),
  kills integer CHECK (kills IS NULL OR kills >= 0),
  deaths integer CHECK (deaths IS NULL OR deaths >= 0),
  assists integer CHECK (assists IS NULL OR assists >= 0),
  damage numeric CHECK (damage IS NULL OR damage >= 0),
  flash_assists integer CHECK (flash_assists IS NULL OR flash_assists >= 0),
  opening_kill boolean,
  opening_death boolean,
  traded boolean,
  trade_kill boolean,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT round_players_match_round_participant_uniq
    UNIQUE (match_id, round_number, participant_key)
);

GRANT SELECT ON public.round_players TO authenticated;
GRANT ALL ON public.round_players TO service_role;
ALTER TABLE public.round_players ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS round_players_match_idx ON public.round_players (match_id, round_number);
CREATE INDEX IF NOT EXISTS round_players_participant_idx
  ON public.round_players (match_id, participant_key);

-- ---------- round_events: provenance ----------
ALTER TABLE public.round_events
  ADD COLUMN IF NOT EXISTS match_source_id uuid REFERENCES public.match_sources(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS source_actor_external_id text,
  ADD COLUMN IF NOT EXISTS source_victim_external_id text,
  ADD COLUMN IF NOT EXISTS source_assister_external_id text,
  ADD COLUMN IF NOT EXISTS quality jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS round_events_source_idx
  ON public.round_events (match_source_id) WHERE match_source_id IS NOT NULL;

-- ---------- ownership helpers ----------
CREATE OR REPLACE FUNCTION public.owns_canonical_match(_match_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.matches m
      JOIN public.player_profiles p ON p.id = m.player_id
     WHERE m.id = _match_id AND p.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.match_participants mp
      JOIN public.player_profiles p ON p.id = mp.internal_player_id
     WHERE mp.match_id = _match_id AND p.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.owns_canonical_series(_series_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.matches m
     WHERE m.series_id = _series_id AND public.owns_canonical_match(m.id)
  );
$$;

REVOKE ALL ON FUNCTION public.canonical_source_priority(public.data_source) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owns_canonical_match(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owns_canonical_series(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.canonical_source_priority(public.data_source) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owns_canonical_match(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owns_canonical_series(uuid) TO authenticated, service_role;

-- ---------- RLS: read-only for the participating player, writes are server-side ----------
DROP POLICY IF EXISTS "Players read their canonical series" ON public.match_series;
CREATE POLICY "Players read their canonical series" ON public.match_series
  FOR SELECT TO authenticated USING (public.owns_canonical_series(id));

DROP POLICY IF EXISTS "Players read their match sources" ON public.match_sources;
CREATE POLICY "Players read their match sources" ON public.match_sources
  FOR SELECT TO authenticated USING (public.owns_canonical_match(match_id));

DROP POLICY IF EXISTS "Players read their match participants" ON public.match_participants;
CREATE POLICY "Players read their match participants" ON public.match_participants
  FOR SELECT TO authenticated USING (public.owns_canonical_match(match_id));

DROP POLICY IF EXISTS "Players read their round players" ON public.round_players;
CREATE POLICY "Players read their round players" ON public.round_players
  FOR SELECT TO authenticated USING (public.owns_canonical_match(match_id));

-- ---------- touch triggers ----------
DROP TRIGGER IF EXISTS match_series_touch ON public.match_series;
CREATE TRIGGER match_series_touch BEFORE UPDATE ON public.match_series
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS match_sources_touch ON public.match_sources;
CREATE TRIGGER match_sources_touch BEFORE UPDATE ON public.match_sources
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS match_participants_touch ON public.match_participants;
CREATE TRIGGER match_participants_touch BEFORE UPDATE ON public.match_participants
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- FASE 2.6.5 — transactional, idempotent persistence of ONE observation
-- ============================================================
CREATE OR REPLACE FUNCTION public.persist_canonical_observation(
  _bundle jsonb,
  _owner_player_id uuid DEFAULT NULL,
  _upload_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _obs jsonb := _bundle->'observation';
  _m jsonb := _bundle->'match';
  _ser jsonb := _bundle->'series';
  _source public.data_source;
  _ext text;
  _parent text;
  _fp text;
  _priority integer;
  _match_id uuid;
  _series_id uuid;
  _source_id uuid;
  _existing_source public.data_source;
  _existing_round_source public.data_source;
  _created boolean := false;
  _rounds_written integer := 0;
  _round_players_written integer := 0;
  _events_written integer := 0;
  _row jsonb;
  _round_ids jsonb := '{}'::jsonb;
  _round_id uuid;
BEGIN
  IF _bundle IS NULL OR _obs IS NULL OR _m IS NULL THEN
    RAISE EXCEPTION 'CANONICAL_BUNDLE_INVALID' USING ERRCODE = '22023';
  END IF;
  IF COALESCE((_m->>'schemaVersion')::integer, 0) <> 2 THEN
    RAISE EXCEPTION 'CANONICAL_SCHEMA_UNSUPPORTED' USING ERRCODE = '22023';
  END IF;

  _source := (_obs->>'source')::public.data_source;
  _ext := NULLIF(_obs->>'externalMatchId', '');
  _parent := NULLIF(_obs->>'externalParentId', '');
  _fp := NULLIF(_obs->>'fingerprint', '');
  IF _fp IS NULL AND _ext IS NULL AND _upload_id IS NOT NULL THEN
    _fp := 'upload:' || _upload_id::text;
  END IF;
  IF _fp IS NULL AND _ext IS NULL THEN
    RAISE EXCEPTION 'CANONICAL_OBSERVATION_UNIDENTIFIABLE' USING ERRCODE = '22023';
  END IF;
  _priority := public.canonical_source_priority(_source);

  -- Serialise concurrent writes of the SAME observation.
  PERFORM pg_advisory_xact_lock(hashtext('public.persist_canonical_observation'),
                                hashtext(_source::text || '|' || COALESCE(_ext, _fp)));

  -- 1. Existing observation?
  IF _ext IS NOT NULL THEN
    SELECT id, match_id INTO _source_id, _match_id
      FROM public.match_sources
     WHERE source = _source AND external_match_id = _ext
     FOR UPDATE;
  END IF;
  IF _source_id IS NULL AND _fp IS NOT NULL THEN
    SELECT id, match_id INTO _source_id, _match_id
      FROM public.match_sources
     WHERE source = _source AND fingerprint = _fp
     FOR UPDATE;
  END IF;

  -- 2. Same content observed by another source (demo fingerprint)?
  IF _match_id IS NULL AND _fp IS NOT NULL AND _fp NOT LIKE 'upload:%' THEN
    SELECT id INTO _match_id FROM public.matches WHERE content_fingerprint = _fp FOR UPDATE;
  END IF;

  -- 3. Series (only when the source names a parent record).
  IF _ser IS NOT NULL AND jsonb_typeof(_ser) = 'object' AND _parent IS NOT NULL THEN
    INSERT INTO public.match_series (
      game, source, external_series_id, best_of, status, started_at, finished_at,
      duration_seconds, team_a, team_b, maps_won_team_a, maps_won_team_b, winner_team,
      canonical_schema_version, quality, metadata)
    VALUES (
      COALESCE(_ser->>'game','cs2'), _source, _parent, (_ser->>'bestOf')::integer,
      COALESCE(_ser->>'status','unknown'), (_ser->>'startedAt')::timestamptz,
      (_ser->>'finishedAt')::timestamptz, (_ser->>'durationSeconds')::integer,
      _ser->>'teamA', _ser->>'teamB', (_ser->>'mapsWonTeamA')::integer,
      (_ser->>'mapsWonTeamB')::integer, _ser->>'winnerTeam',
      COALESCE((_ser->>'schemaVersion')::integer, 2),
      COALESCE(_ser->'quality','{}'::jsonb), COALESCE(_ser->'metadata','{}'::jsonb))
    ON CONFLICT (source, external_series_id) WHERE external_series_id IS NOT NULL
    DO UPDATE SET
      best_of = COALESCE(EXCLUDED.best_of, public.match_series.best_of),
      status = EXCLUDED.status,
      started_at = COALESCE(EXCLUDED.started_at, public.match_series.started_at),
      finished_at = COALESCE(EXCLUDED.finished_at, public.match_series.finished_at),
      duration_seconds = COALESCE(EXCLUDED.duration_seconds, public.match_series.duration_seconds),
      team_a = COALESCE(EXCLUDED.team_a, public.match_series.team_a),
      team_b = COALESCE(EXCLUDED.team_b, public.match_series.team_b),
      maps_won_team_a = COALESCE(EXCLUDED.maps_won_team_a, public.match_series.maps_won_team_a),
      maps_won_team_b = COALESCE(EXCLUDED.maps_won_team_b, public.match_series.maps_won_team_b),
      winner_team = COALESCE(EXCLUDED.winner_team, public.match_series.winner_team),
      quality = EXCLUDED.quality,
      metadata = public.match_series.metadata || EXCLUDED.metadata,
      updated_at = now()
    RETURNING id INTO _series_id;
  END IF;

  -- 4. Canonical match row.
  IF _match_id IS NULL THEN
    INSERT INTO public.matches (
      player_id, upload_id, platform, data_source, series_id, game, map, map_number,
      match_date, played_at, started_at, finished_at, duration_seconds, canonical_status,
      finished, terminal, team_a, team_b, score_team_a, score_team_b, winner_team,
      round_count, rounds, canonical_schema_version, quality, coverage, content_fingerprint,
      canonical_source, source_fetched_at, source_version, source_complete)
    VALUES (
      _owner_player_id, _upload_id, _source::text, _source, _series_id,
      COALESCE(_m->>'game','cs2'), _m->>'map', (_m->>'mapNumber')::integer,
      (_m->>'playedAt')::timestamptz, (_m->>'playedAt')::timestamptz,
      (_m->>'startedAt')::timestamptz, (_m->>'finishedAt')::timestamptz,
      (_m->>'durationSeconds')::integer, COALESCE(_m->>'status','unknown'),
      COALESCE((_m->>'finished')::boolean, false), COALESCE((_m->>'terminal')::boolean, false),
      _m->>'teamA', _m->>'teamB', (_m->>'scoreTeamA')::integer, (_m->>'scoreTeamB')::integer,
      _m->>'winnerTeam', (_m->>'roundCount')::integer, (_m->>'roundCount')::integer, 2,
      COALESCE(_m->'quality','{}'::jsonb), COALESCE(_m->'coverage','{}'::jsonb),
      CASE WHEN _fp LIKE 'upload:%' THEN NULL ELSE _fp END,
      _source, (_obs->>'fetchedAt')::timestamptz, _obs->>'sourceVersion',
      COALESCE(_obs->>'status','unknown') = 'complete')
    RETURNING id INTO _match_id;
    _created := true;
  ELSE
    SELECT canonical_source, round_source INTO _existing_source, _existing_round_source
      FROM public.matches WHERE id = _match_id FOR UPDATE;
    -- Source priority is a READ preference: a weaker source never overwrites a
    -- stronger one's canonical facts.
    IF _existing_source IS NULL
       OR _priority >= public.canonical_source_priority(_existing_source) THEN
      UPDATE public.matches SET
        series_id = COALESCE(_series_id, series_id),
        map = COALESCE(_m->>'map', map),
        map_number = COALESCE((_m->>'mapNumber')::integer, map_number),
        match_date = COALESCE((_m->>'playedAt')::timestamptz, match_date),
        played_at = COALESCE((_m->>'playedAt')::timestamptz, played_at),
        started_at = COALESCE((_m->>'startedAt')::timestamptz, started_at),
        finished_at = COALESCE((_m->>'finishedAt')::timestamptz, finished_at),
        duration_seconds = COALESCE((_m->>'durationSeconds')::integer, duration_seconds),
        canonical_status = COALESCE(_m->>'status', canonical_status),
        finished = COALESCE((_m->>'finished')::boolean, finished),
        terminal = COALESCE((_m->>'terminal')::boolean, terminal),
        team_a = COALESCE(_m->>'teamA', team_a),
        team_b = COALESCE(_m->>'teamB', team_b),
        score_team_a = COALESCE((_m->>'scoreTeamA')::integer, score_team_a),
        score_team_b = COALESCE((_m->>'scoreTeamB')::integer, score_team_b),
        winner_team = COALESCE(_m->>'winnerTeam', winner_team),
        round_count = COALESCE((_m->>'roundCount')::integer, round_count),
        quality = COALESCE(_m->'quality', quality),
        coverage = COALESCE(_m->'coverage', coverage),
        content_fingerprint = COALESCE(content_fingerprint,
          CASE WHEN _fp LIKE 'upload:%' THEN NULL ELSE _fp END),
        canonical_source = _source,
        player_id = COALESCE(player_id, _owner_player_id),
        upload_id = COALESCE(upload_id, _upload_id),
        data_source = _source,
        source_fetched_at = (_obs->>'fetchedAt')::timestamptz,
        source_version = COALESCE(_obs->>'sourceVersion', source_version)
      WHERE id = _match_id;
    ELSE
      UPDATE public.matches SET
        series_id = COALESCE(series_id, _series_id),
        player_id = COALESCE(player_id, _owner_player_id)
      WHERE id = _match_id;
    END IF;
  END IF;

  -- 5. Observation row (idempotent).
  IF _source_id IS NULL THEN
    INSERT INTO public.match_sources (
      match_id, series_id, source, source_contract_version, external_match_id,
      external_parent_id, source_version, fetched_at, source_updated_at, status,
      quality, fingerprint, upload_id, metadata)
    VALUES (
      _match_id, _series_id, _source, COALESCE(_obs->>'sourceContractVersion','unknown'),
      _ext, _parent, _obs->>'sourceVersion',
      COALESCE((_obs->>'fetchedAt')::timestamptz, now()),
      (_obs->>'sourceUpdatedAt')::timestamptz, COALESCE(_obs->>'status','unknown'),
      COALESCE(_obs->'quality','{}'::jsonb), _fp, _upload_id,
      COALESCE(_obs->'metadata','{}'::jsonb))
    RETURNING id INTO _source_id;
  ELSE
    UPDATE public.match_sources SET
      match_id = _match_id,
      series_id = COALESCE(_series_id, series_id),
      source_contract_version = COALESCE(_obs->>'sourceContractVersion', source_contract_version),
      external_match_id = COALESCE(_ext, external_match_id),
      external_parent_id = COALESCE(_parent, external_parent_id),
      source_version = COALESCE(_obs->>'sourceVersion', source_version),
      fetched_at = COALESCE((_obs->>'fetchedAt')::timestamptz, fetched_at),
      source_updated_at = COALESCE((_obs->>'sourceUpdatedAt')::timestamptz, source_updated_at),
      status = COALESCE(_obs->>'status', status),
      quality = COALESCE(_obs->'quality', quality),
      fingerprint = COALESCE(_fp, fingerprint),
      upload_id = COALESCE(_upload_id, upload_id),
      observation_count = observation_count + 1,
      metadata = metadata || COALESCE(_obs->'metadata','{}'::jsonb)
    WHERE id = _source_id;
  END IF;

  -- 6. Participants (upsert; identity is never downgraded to a weaker source).
  FOR _row IN SELECT value FROM jsonb_array_elements(COALESCE(_bundle->'participants','[]'::jsonb)) LOOP
    INSERT INTO public.match_participants (
      match_id, participant_key, internal_player_id, source, external_player_id,
      steam_id64, nickname_snapshot, team, is_target_player, identity_status,
      identity_confidence, metadata)
    VALUES (
      _match_id, _row->>'participantKey', NULLIF(_row->>'internalPlayerId','')::uuid,
      _source, _row->>'externalPlayerId', _row->>'steamId64', _row->>'nicknameSnapshot',
      _row->>'team', COALESCE((_row->>'isTargetPlayer')::boolean, false),
      COALESCE((_row->>'identityStatus')::public.identity_link_status, 'unlinked'),
      (_row->>'identityConfidence')::numeric, COALESCE(_row->'metadata','{}'::jsonb))
    ON CONFLICT (match_id, participant_key) DO UPDATE SET
      internal_player_id = COALESCE(EXCLUDED.internal_player_id,
                                    public.match_participants.internal_player_id),
      external_player_id = COALESCE(EXCLUDED.external_player_id,
                                    public.match_participants.external_player_id),
      steam_id64 = COALESCE(EXCLUDED.steam_id64, public.match_participants.steam_id64),
      nickname_snapshot = COALESCE(EXCLUDED.nickname_snapshot,
                                   public.match_participants.nickname_snapshot),
      team = COALESCE(EXCLUDED.team, public.match_participants.team),
      is_target_player = public.match_participants.is_target_player OR EXCLUDED.is_target_player,
      identity_confidence = GREATEST(COALESCE(public.match_participants.identity_confidence, 0),
                                     COALESCE(EXCLUDED.identity_confidence, 0)),
      metadata = public.match_participants.metadata || EXCLUDED.metadata,
      updated_at = now();
  END LOOP;

  -- 7. Rounds / round players / events: only a source that actually HAS them may
  --    write them, and only when it is at least as strong as the current owner.
  IF jsonb_array_length(COALESCE(_bundle->'rounds','[]'::jsonb)) > 0
     AND (_existing_round_source IS NULL
          OR _priority >= public.canonical_source_priority(_existing_round_source)) THEN

    DELETE FROM public.round_events WHERE match_id = _match_id;
    DELETE FROM public.round_players WHERE match_id = _match_id;
    DELETE FROM public.match_rounds WHERE match_id = _match_id;

    FOR _row IN SELECT value FROM jsonb_array_elements(_bundle->'rounds') LOOP
      INSERT INTO public.match_rounds (
        match_id, round_number, start_tick, end_tick, start_time_seconds, end_time_seconds,
        duration_seconds, winning_team, winning_side, winner_side, win_reason,
        bomb_planted, bomb_defused, bomb_exploded, quality, metadata)
      VALUES (
        _match_id, (_row->>'roundNumber')::integer, (_row->>'startTick')::integer,
        (_row->>'endTick')::integer, (_row->>'startTimeSeconds')::numeric,
        (_row->>'endTimeSeconds')::numeric, (_row->>'durationSeconds')::numeric,
        _row->>'winningTeam', _row->>'winningSide', _row->>'winningSide', _row->>'winReason',
        (_row->>'bombPlanted')::boolean, (_row->>'bombDefused')::boolean,
        (_row->>'bombExploded')::boolean, COALESCE(_row->'quality','{}'::jsonb),
        COALESCE(_row->'metadata','{}'::jsonb))
      RETURNING id INTO _round_id;
      _round_ids := _round_ids || jsonb_build_object(_row->>'roundNumber', _round_id::text);
      _rounds_written := _rounds_written + 1;
    END LOOP;

    FOR _row IN SELECT value FROM jsonb_array_elements(COALESCE(_bundle->'roundPlayers','[]'::jsonb)) LOOP
      INSERT INTO public.round_players (
        match_id, round_id, round_number, participant_key, internal_player_id, side,
        survived, money_start, money_end, equipment_value, buy_context, kills, deaths,
        assists, damage, flash_assists, opening_kill, opening_death, traded, trade_kill,
        metadata)
      VALUES (
        _match_id, NULLIF(_round_ids->>(_row->>'roundNumber'),'')::uuid,
        (_row->>'roundNumber')::integer, _row->>'participantKey',
        (SELECT internal_player_id FROM public.match_participants
          WHERE match_id = _match_id AND participant_key = _row->>'participantKey'),
        _row->>'side', (_row->>'survived')::boolean, (_row->>'moneyStart')::integer,
        (_row->>'moneyEnd')::integer, (_row->>'equipmentValue')::integer,
        _row->>'buyContext', (_row->>'kills')::integer, (_row->>'deaths')::integer,
        (_row->>'assists')::integer, (_row->>'damage')::numeric,
        (_row->>'flashAssists')::integer, (_row->>'openingKill')::boolean,
        (_row->>'openingDeath')::boolean, (_row->>'traded')::boolean,
        (_row->>'tradeKill')::boolean, COALESCE(_row->'metadata','{}'::jsonb))
      ON CONFLICT (match_id, round_number, participant_key) DO NOTHING;
      _round_players_written := _round_players_written + 1;
    END LOOP;

    FOR _row IN SELECT value FROM jsonb_array_elements(COALESCE(_bundle->'events','[]'::jsonb)) LOOP
      INSERT INTO public.round_events (
        match_id, match_source_id, round_id, round_number, event_type, tick, time_seconds,
        actor_steam_id, victim_steam_id, assister_steam_id, source_actor_external_id,
        source_victim_external_id, source_assister_external_id, weapon, headshot,
        distance, damage, quality, data)
      VALUES (
        _match_id, _source_id, NULLIF(_round_ids->>(_row->>'roundNumber'),'')::uuid,
        (_row->>'roundNumber')::integer, _row->>'type', (_row->>'tick')::integer,
        (_row->>'gameTimeSeconds')::numeric, _row->>'actorParticipantKey',
        _row->>'victimParticipantKey', _row->>'assisterParticipantKey',
        _row->>'sourceActorExternalId', _row->>'sourceVictimExternalId',
        _row->>'sourceAssisterExternalId', _row->>'weapon', (_row->>'headshot')::boolean,
        (_row->>'distance')::numeric, (_row->>'damage')::numeric,
        COALESCE(_row->'quality','{}'::jsonb), COALESCE(_row->'data','{}'::jsonb));
      _events_written := _events_written + 1;
    END LOOP;

    UPDATE public.matches SET round_source = _source WHERE id = _match_id;
  END IF;

  RETURN jsonb_build_object(
    'match_id', _match_id,
    'series_id', _series_id,
    'match_source_id', _source_id,
    'created', _created,
    'rounds_written', _rounds_written,
    'round_players_written', _round_players_written,
    'events_written', _events_written);
END;
$$;

REVOKE ALL ON FUNCTION public.persist_canonical_observation(jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.persist_canonical_observation(jsonb, uuid, uuid) TO service_role;
