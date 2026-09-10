-- FASE 2.7.1C — PROJECTION ATOMICITY
-- The per-player DEMO projection (matches convenience columns + match_metrics +
-- match_features) is written by ONE transactional routine so a later failure can
-- never leave a half-written projection (e.g. features deleted but not inserted).
-- It touches ONLY projection surfaces: no canonical table, no match_sources,
-- no rounds/events/participants, and it never creates a match.

-- NULL ≠ ZERO: opening samples are unknown when no round has a determinable
-- opening duel, so the projection column must be able to hold NULL.
ALTER TABLE public.match_features ALTER COLUMN sample_opening_duels DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.persist_demo_projection(
  _match_id uuid,
  _upload_id uuid,
  _player_id uuid,
  _steam_id text,
  _match_wide jsonb,
  _player_scoped jsonb,
  _metrics jsonb,
  _features jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _existing_player uuid;
  _owns boolean;
BEGIN
  -- Lock the projection row for the whole transaction.
  SELECT m.player_id INTO _existing_player
  FROM public.matches m
  WHERE m.id = _match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'canonical match not found for projection: %', _match_id;
  END IF;

  _owns := _existing_player IS NULL OR _existing_player = _player_id;

  -- Match-wide projection facts: safe for any observer.
  UPDATE public.matches SET
    platform = COALESCE(_match_wide->>'platform', platform),
    rounds = COALESCE((_match_wide->>'rounds')::int, rounds),
    duration_seconds = (_match_wide->>'duration_seconds')::int,
    game_version = _match_wide->>'game_version',
    demo_metadata = _match_wide->'demo_metadata'
  WHERE id = _match_id;

  -- Player-scoped facts: only the owner of the projection may write them.
  IF _owns THEN
    UPDATE public.matches SET
      player_id = _player_id,
      upload_id = _upload_id,
      team_player = _player_scoped->>'team_player',
      team_opponent = _player_scoped->>'team_opponent',
      score_player = (_player_scoped->>'score_player')::int,
      score_opponent = (_player_scoped->>'score_opponent')::int,
      result = (_player_scoped->>'result')::public.match_result
    WHERE id = _match_id;
  END IF;

  INSERT INTO public.match_metrics (
    match_id, player_id, rounds_played, kills, deaths, assists, hs_percent, adr,
    kast, damage_taken, damage_efficiency, first_kills, first_deaths,
    opening_attempts, opening_success, opening_success_rate, trade_kills,
    trade_deaths, clutch_attempts, clutch_wins, clutches, multi_kills,
    utility_damage, grenade_damage, flash_assists, ct_rating, t_rating, rating
  ) VALUES (
    _match_id,
    _player_id,
    (_metrics->>'rounds_played')::int,
    (_metrics->>'kills')::int,
    (_metrics->>'deaths')::int,
    (_metrics->>'assists')::int,
    (_metrics->>'hs_percent')::numeric,
    (_metrics->>'adr')::numeric,
    (_metrics->>'kast')::numeric,
    (_metrics->>'damage_taken')::numeric,
    (_metrics->>'damage_efficiency')::numeric,
    (_metrics->>'first_kills')::int,
    (_metrics->>'first_deaths')::int,
    (_metrics->>'opening_attempts')::int,
    (_metrics->>'opening_success')::int,
    (_metrics->>'opening_success_rate')::numeric,
    (_metrics->>'trade_kills')::int,
    (_metrics->>'trade_deaths')::int,
    (_metrics->>'clutch_attempts')::int,
    (_metrics->>'clutch_wins')::int,
    (_metrics->>'clutches')::int,
    (_metrics->>'multi_kills')::int,
    (_metrics->>'utility_damage')::numeric,
    (_metrics->>'grenade_damage')::numeric,
    (_metrics->>'flash_assists')::int,
    (_metrics->>'ct_rating')::numeric,
    (_metrics->>'t_rating')::numeric,
    (_metrics->>'rating')::numeric
  )
  ON CONFLICT (match_id, player_id) DO UPDATE SET
    rounds_played = EXCLUDED.rounds_played,
    kills = EXCLUDED.kills,
    deaths = EXCLUDED.deaths,
    assists = EXCLUDED.assists,
    hs_percent = EXCLUDED.hs_percent,
    adr = EXCLUDED.adr,
    kast = EXCLUDED.kast,
    damage_taken = EXCLUDED.damage_taken,
    damage_efficiency = EXCLUDED.damage_efficiency,
    first_kills = EXCLUDED.first_kills,
    first_deaths = EXCLUDED.first_deaths,
    opening_attempts = EXCLUDED.opening_attempts,
    opening_success = EXCLUDED.opening_success,
    opening_success_rate = EXCLUDED.opening_success_rate,
    trade_kills = EXCLUDED.trade_kills,
    trade_deaths = EXCLUDED.trade_deaths,
    clutch_attempts = EXCLUDED.clutch_attempts,
    clutch_wins = EXCLUDED.clutch_wins,
    clutches = EXCLUDED.clutches,
    multi_kills = EXCLUDED.multi_kills,
    utility_damage = EXCLUDED.utility_damage,
    grenade_damage = EXCLUDED.grenade_damage,
    flash_assists = EXCLUDED.flash_assists,
    ct_rating = EXCLUDED.ct_rating,
    t_rating = EXCLUDED.t_rating,
    rating = EXCLUDED.rating;

  -- Features are REPLACED, not stacked. Same transaction as everything above,
  -- so a failed insert rolls the delete (and the updates) back.
  DELETE FROM public.match_features
  WHERE match_id = _match_id AND player_id = _player_id;

  INSERT INTO public.match_features (
    match_id, player_id, steam_id, sample_rounds, sample_opening_duels,
    sample_clutches, extraction_confidence, partial_parse, features,
    schema_version, analysis_version
  ) VALUES (
    _match_id,
    _player_id,
    _steam_id,
    (_features->>'sample_rounds')::int,
    (_features->>'sample_opening_duels')::int,
    (_features->>'sample_clutches')::int,
    (_features->>'extraction_confidence')::numeric,
    COALESCE((_features->>'partial_parse')::boolean, false),
    COALESCE(_features->'features', '{}'::jsonb),
    (_features->>'schema_version')::int,
    _features->>'analysis_version'
  );

  RETURN _match_id;
END;
$$;

REVOKE ALL ON FUNCTION public.persist_demo_projection(uuid, uuid, uuid, text, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.persist_demo_projection(uuid, uuid, uuid, text, jsonb, jsonb, jsonb, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_demo_projection(uuid, uuid, uuid, text, jsonb, jsonb, jsonb, jsonb) TO service_role;