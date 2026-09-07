-- ============================================================
-- FASE 2.6.11 — CANONICAL CONVERGENCE
--  * cross-source attach (resolver-decided identity)
--  * SERIES-ONLY observations (a known BO3 without per-map data)
-- ============================================================

-- Provenance only: WHOSE collection surfaced this series. It never makes the
-- series' facts belong to that player; it only lets the owner read the row.
ALTER TABLE public.match_series
  ADD COLUMN IF NOT EXISTS discovered_by_player_id uuid
    REFERENCES public.player_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS match_series_discovered_by_idx
  ON public.match_series (discovered_by_player_id);

CREATE OR REPLACE FUNCTION public.owns_canonical_series(_series_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.matches m
     WHERE m.series_id = _series_id AND public.owns_canonical_match(m.id)
  ) OR EXISTS (
    SELECT 1 FROM public.match_series s
     WHERE s.id = _series_id
       AND s.discovered_by_player_id IS NOT NULL
       AND public.owns_player(s.discovered_by_player_id)
  );
$$;

-- A source observation may describe a SERIES with no identified map yet.
ALTER TABLE public.match_sources ALTER COLUMN match_id DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.match_sources ADD CONSTRAINT match_sources_target_check
    CHECK (match_id IS NOT NULL OR series_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS match_sources_series_only_uniq
  ON public.match_sources (source, series_id) WHERE match_id IS NULL;

DROP POLICY IF EXISTS "Players read their match sources" ON public.match_sources;
CREATE POLICY "Players read their match sources" ON public.match_sources
  FOR SELECT TO authenticated USING (
    CASE WHEN match_id IS NOT NULL
      THEN public.owns_canonical_match(match_id)
      ELSE series_id IS NOT NULL AND public.owns_canonical_series(series_id)
    END
  );

-- Cross-source convergence WITHOUT touching the big persistence routine:
-- the Match Identity Resolver decides (EXACT_MATCH only) that an incoming
-- observation describes an ALREADY canonical match, and reserves the source
-- slot pointing at it. `persist_canonical_observation` then finds that slot and
-- writes into the same canonical match instead of creating a duplicate.
-- It never merges facts: source precedence inside the routine still decides
-- which observation may write the canonical columns.
CREATE OR REPLACE FUNCTION public.canonical_attach_source(
  _source public.data_source,
  _external_match_id text,
  _match_id uuid,
  _source_contract_version text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  _existing_id uuid;
  _existing_match uuid;
BEGIN
  IF _source IS NULL OR NULLIF(_external_match_id,'') IS NULL OR _match_id IS NULL THEN
    RAISE EXCEPTION 'CANONICAL_ATTACH_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.matches WHERE id = _match_id) THEN
    RAISE EXCEPTION 'CANONICAL_ATTACH_TARGET_NOT_FOUND' USING ERRCODE = '23503';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('public.canonical_attach_source'),
                                hashtext(_source::text || '|' || _external_match_id));

  SELECT id, match_id INTO _existing_id, _existing_match
    FROM public.match_sources
   WHERE source = _source AND external_match_id = _external_match_id
   FOR UPDATE;

  IF _existing_id IS NOT NULL THEN
    -- An existing observation is NEVER re-pointed at another canonical match.
    IF _existing_match IS DISTINCT FROM _match_id THEN
      RAISE EXCEPTION 'CANONICAL_ATTACH_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN _existing_id;
  END IF;

  INSERT INTO public.match_sources (
    match_id, source, source_contract_version, external_match_id, fetched_at, status,
    observation_count)
  VALUES (_match_id, _source, COALESCE(NULLIF(_source_contract_version,''),'unknown'),
          _external_match_id, now(), 'unknown', 0)
  RETURNING id INTO _existing_id;

  RETURN _existing_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.canonical_attach_source(public.data_source, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.canonical_attach_source(public.data_source, text, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canonical_attach_source(public.data_source, text, uuid, text) TO service_role;

-- SERIES-ONLY observation: a known BO3/BO5 whose individual maps FACEIT never
-- reported. It persists the series (and its source observation) WITHOUT
-- inventing a canonical match.
CREATE OR REPLACE FUNCTION public.persist_canonical_series_observation(_series jsonb, _observation jsonb, _owner_player_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  _source public.data_source;
  _ext text;
  _series_id uuid;
  _source_id uuid;
  _created boolean := false;
BEGIN
  IF _series IS NULL OR _observation IS NULL THEN
    RAISE EXCEPTION 'CANONICAL_BUNDLE_INVALID' USING ERRCODE = '22023';
  END IF;
  IF COALESCE((_series->>'schemaVersion')::integer, 0) <> 2 THEN
    RAISE EXCEPTION 'CANONICAL_SCHEMA_UNSUPPORTED' USING ERRCODE = '22023';
  END IF;

  _source := (_observation->>'source')::public.data_source;
  _ext := NULLIF(_observation->>'externalSeriesId', '');
  IF _ext IS NULL THEN
    RAISE EXCEPTION 'CANONICAL_OBSERVATION_UNIDENTIFIABLE' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('public.persist_canonical_series_observation'),
                                hashtext(_source::text || '|' || _ext));

  SELECT id INTO _series_id FROM public.match_series
   WHERE source = _source AND external_series_id = _ext FOR UPDATE;
  _created := _series_id IS NULL;

  INSERT INTO public.match_series (
    game, source, external_series_id, best_of, status, started_at, finished_at,
    duration_seconds, team_a, team_b, maps_won_team_a, maps_won_team_b, winner_team,
    canonical_schema_version, quality, metadata, discovered_by_player_id)
  VALUES (
    COALESCE(_series->>'game','cs2'), _source, _ext, (_series->>'bestOf')::integer,
    COALESCE(_series->>'status','unknown'), (_series->>'startedAt')::timestamptz,
    (_series->>'finishedAt')::timestamptz, (_series->>'durationSeconds')::integer,
    _series->>'teamA', _series->>'teamB', (_series->>'mapsWonTeamA')::integer,
    (_series->>'mapsWonTeamB')::integer, _series->>'winnerTeam',
    COALESCE((_series->>'schemaVersion')::integer, 2),
    COALESCE(_series->'quality','{}'::jsonb), COALESCE(_series->'metadata','{}'::jsonb),
    _owner_player_id)
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
    discovered_by_player_id = COALESCE(public.match_series.discovered_by_player_id,
                                       EXCLUDED.discovered_by_player_id),
    updated_at = now()
  RETURNING id INTO _series_id;

  SELECT id INTO _source_id FROM public.match_sources
   WHERE source = _source AND external_match_id IS NULL AND series_id = _series_id
   FOR UPDATE;

  IF _source_id IS NULL THEN
    INSERT INTO public.match_sources (
      match_id, series_id, source, source_contract_version, external_match_id,
      external_parent_id, source_version, fetched_at, source_updated_at, status,
      quality, fingerprint, metadata)
    VALUES (
      NULL, _series_id, _source,
      COALESCE(_observation->>'sourceContractVersion','unknown'), NULL, _ext,
      _observation->>'sourceVersion',
      COALESCE((_observation->>'fetchedAt')::timestamptz, now()), NULL,
      COALESCE(_observation->>'status','incomplete'),
      COALESCE(_observation->'quality','{}'::jsonb), NULL,
      COALESCE(_observation->'metadata','{}'::jsonb))
    RETURNING id INTO _source_id;
  ELSE
    UPDATE public.match_sources SET
      fetched_at = COALESCE((_observation->>'fetchedAt')::timestamptz, fetched_at),
      status = COALESCE(_observation->>'status', status),
      quality = COALESCE(_observation->'quality', quality),
      observation_count = observation_count + 1,
      metadata = metadata || COALESCE(_observation->'metadata','{}'::jsonb)
    WHERE id = _source_id;
  END IF;

  RETURN jsonb_build_object(
    'series_id', _series_id,
    'match_source_id', _source_id,
    'created', _created);
END;
$function$;

REVOKE ALL ON FUNCTION public.persist_canonical_series_observation(jsonb, jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.persist_canonical_series_observation(jsonb, jsonb, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_canonical_series_observation(jsonb, jsonb, uuid) TO service_role;