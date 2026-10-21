-- Rollback of 20261021120000_d20_identical_reobservation_no_rewrite.sql (NOT applied; reference).
-- Restores persist_canonical_observation to md5 d313725db0bb3e94ba72b483344b9d4b by the inverse exact fragment
-- replacement. The rounds_digest column is left in place (unused by the restored body; dropping
-- it is a separate, explicit decision).

BEGIN;
DO $d20_rollback$
DECLARE
  _target constant regprocedure := 'public.persist_canonical_observation(jsonb,uuid,uuid)'::regprocedure;
  _old constant text[] := ARRAY[
$frag$  _round_id uuid;
  -- D20: an identical re-observation of stored content keeps its rounds and events.
  _digest text;
  _unchanged boolean := false;
  _prior_found boolean := false;
  _prior_source_version text;
  _prior_parser_revision text;
  _prior_digest text;
BEGIN$frag$,
$frag$  IF _source_id IS NULL AND _fp IS NOT NULL THEN
    SELECT id, match_id INTO _source_id, _match_id
      FROM public.match_sources
     WHERE source = _source AND fingerprint = _fp
     FOR UPDATE;
  END IF;

  -- D20: what the stored observation was produced from, read before it is updated.
  IF _source_id IS NOT NULL THEN
    SELECT true, ms.source_version, ms.metadata->>'parser_revision', ms.rounds_digest
      INTO _prior_found, _prior_source_version, _prior_parser_revision, _prior_digest
      FROM public.match_sources ms WHERE ms.id = _source_id;
  END IF;$frag$,
$frag$      -- D20: a metadata value with no new or different key keeps its stored (TOASTed)
      -- datum instead of rewriting megabytes on every identical re-observation.
      metadata = CASE
        WHEN NOT EXISTS (
          SELECT 1 FROM jsonb_each(COALESCE(_obs->'metadata','{}'::jsonb)) AS d20(k, v)
           WHERE metadata->d20.k IS DISTINCT FROM d20.v)
        THEN metadata
        ELSE metadata || COALESCE(_obs->'metadata','{}'::jsonb) END
    WHERE id = _source_id;$frag$,
$frag$  -- D20: the same content (content-addressed fingerprint) re-observed from the same
  -- source with identical per-round facts is NOT rewritten. Deleting and re-inserting
  -- thousands of events for an identical observation exceeded the 8 s statement
  -- timeout in production (job 921b55cf) and blocked identity re-runs and every
  -- second uploader. Identity is the stored digest of the per-round facts; an
  -- observation stored before D20 (no digest) is identical only when the same parser
  -- revision and version produced it and every per-round row count matches.
  _digest := md5(COALESCE(_bundle->'rounds','[]'::jsonb)::text || '|' ||
                 COALESCE(_bundle->'roundPlayers','[]'::jsonb)::text || '|' ||
                 COALESCE(_bundle->'events','[]'::jsonb)::text);
  IF NOT _created AND _prior_found
     AND _fp IS NOT NULL AND _fp NOT LIKE 'upload:%'
     AND _existing_round_source IS NOT DISTINCT FROM _source
     AND jsonb_array_length(COALESCE(_bundle->'rounds','[]'::jsonb)) > 0 THEN
    IF _prior_digest IS NOT NULL THEN
      _unchanged := COALESCE(_prior_digest = _digest, false);
    ELSE
      _unchanged := COALESCE(_prior_parser_revision IS NOT NULL
        AND _prior_parser_revision = (_obs->'metadata'->>'parser_revision')
        AND _prior_source_version IS NOT DISTINCT FROM (_obs->>'sourceVersion')
        AND (SELECT count(*) FROM public.match_rounds WHERE match_id = _match_id)
            = jsonb_array_length(_bundle->'rounds')
        AND (SELECT count(*) FROM public.round_players WHERE match_id = _match_id)
            = jsonb_array_length(COALESCE(_bundle->'roundPlayers','[]'::jsonb))
        AND (SELECT count(*) FROM public.round_events WHERE match_id = _match_id)
            = jsonb_array_length(COALESCE(_bundle->'events','[]'::jsonb)), false);
    END IF;
  END IF;

  IF _unchanged THEN
    -- Only the identity links can differ: carry the participants' internal player id
    -- into the stored per-round rows exactly as a rewrite would.
    UPDATE public.round_players rp
       SET internal_player_id = mp.internal_player_id
      FROM public.match_participants mp
     WHERE rp.match_id = _match_id
       AND mp.match_id = _match_id
       AND mp.participant_key = rp.participant_key
       AND rp.internal_player_id IS DISTINCT FROM mp.internal_player_id;
    UPDATE public.match_sources SET rounds_digest = _digest
     WHERE id = _source_id AND rounds_digest IS DISTINCT FROM _digest;
  ELSIF jsonb_array_length(COALESCE(_bundle->'rounds','[]'::jsonb)) > 0
     AND (_existing_round_source IS NULL
          OR _priority >= public.canonical_source_priority(_existing_round_source)) THEN$frag$,
$frag$    -- D20: one set-based statement instead of one INSERT per row (same rows, same
    -- conflict rule, same internal player id lookup).
    INSERT INTO public.round_players (
      match_id, round_id, round_number, participant_key, internal_player_id, side,
      survived, money_start, money_end, equipment_value, buy_context, kills, deaths,
      assists, damage, flash_assists, opening_kill, opening_death, traded, trade_kill,
      metadata)
    SELECT
      _match_id, NULLIF(_round_ids->>(r.value->>'roundNumber'),'')::uuid,
      (r.value->>'roundNumber')::integer, r.value->>'participantKey', mp.internal_player_id,
      r.value->>'side', (r.value->>'survived')::boolean, (r.value->>'moneyStart')::integer,
      (r.value->>'moneyEnd')::integer, (r.value->>'equipmentValue')::integer,
      r.value->>'buyContext', (r.value->>'kills')::integer, (r.value->>'deaths')::integer,
      (r.value->>'assists')::integer, (r.value->>'damage')::numeric,
      (r.value->>'flashAssists')::integer, (r.value->>'openingKill')::boolean,
      (r.value->>'openingDeath')::boolean, (r.value->>'traded')::boolean,
      (r.value->>'tradeKill')::boolean, COALESCE(r.value->'metadata','{}'::jsonb)
      FROM jsonb_array_elements(COALESCE(_bundle->'roundPlayers','[]'::jsonb)) WITH ORDINALITY AS r(value, ord)
      LEFT JOIN public.match_participants mp
        ON mp.match_id = _match_id AND mp.participant_key = r.value->>'participantKey'
     ORDER BY r.ord
    ON CONFLICT (match_id, round_number, participant_key) DO NOTHING;
    _round_players_written := jsonb_array_length(COALESCE(_bundle->'roundPlayers','[]'::jsonb));$frag$,
$frag$    -- D20: one set-based statement instead of one INSERT per event (same rows, in order).
    INSERT INTO public.round_events (
      match_id, match_source_id, round_id, round_number, event_type, tick, time_seconds,
      actor_steam_id, victim_steam_id, assister_steam_id, source_actor_external_id,
      source_victim_external_id, source_assister_external_id, weapon, headshot,
      distance, damage, quality, data)
    SELECT
      _match_id, _source_id, NULLIF(_round_ids->>(e.value->>'roundNumber'),'')::uuid,
      (e.value->>'roundNumber')::integer, e.value->>'type', (e.value->>'tick')::integer,
      (e.value->>'gameTimeSeconds')::numeric, e.value->>'actorParticipantKey',
      e.value->>'victimParticipantKey', e.value->>'assisterParticipantKey',
      e.value->>'sourceActorExternalId', e.value->>'sourceVictimExternalId',
      e.value->>'sourceAssisterExternalId', e.value->>'weapon', (e.value->>'headshot')::boolean,
      (e.value->>'distance')::numeric, (e.value->>'damage')::numeric,
      COALESCE(e.value->'quality','{}'::jsonb), COALESCE(e.value->'data','{}'::jsonb)
      FROM jsonb_array_elements(COALESCE(_bundle->'events','[]'::jsonb)) WITH ORDINALITY AS e(value, ord)
     ORDER BY e.ord;
    GET DIAGNOSTICS _events_written = ROW_COUNT;$frag$,
$frag$    UPDATE public.matches SET round_source = _source WHERE id = _match_id;
    UPDATE public.match_sources SET rounds_digest = _digest WHERE id = _source_id;
  END IF;$frag$,
$frag$    'events_written', _events_written,
    'unchanged_reobservation', _unchanged);$frag$];
  _new constant text[] := ARRAY[
$frag$  _round_id uuid;
BEGIN$frag$,
$frag$  IF _source_id IS NULL AND _fp IS NOT NULL THEN
    SELECT id, match_id INTO _source_id, _match_id
      FROM public.match_sources
     WHERE source = _source AND fingerprint = _fp
     FOR UPDATE;
  END IF;$frag$,
$frag$      metadata = metadata || COALESCE(_obs->'metadata','{}'::jsonb)
    WHERE id = _source_id;$frag$,
$frag$  IF jsonb_array_length(COALESCE(_bundle->'rounds','[]'::jsonb)) > 0
     AND (_existing_round_source IS NULL
          OR _priority >= public.canonical_source_priority(_existing_round_source)) THEN$frag$,
$frag$    FOR _row IN SELECT value FROM jsonb_array_elements(COALESCE(_bundle->'roundPlayers','[]'::jsonb)) LOOP
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
    END LOOP;$frag$,
$frag$    FOR _row IN SELECT value FROM jsonb_array_elements(COALESCE(_bundle->'events','[]'::jsonb)) LOOP
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
    END LOOP;$frag$,
$frag$    UPDATE public.matches SET round_source = _source WHERE id = _match_id;
  END IF;$frag$,
$frag$    'events_written', _events_written);$frag$];
  _expected_before constant text := '3420e6cc7454132d8fa452127727a093';
  _expected_after constant text := 'd313725db0bb3e94ba72b483344b9d4b';
  _definition text;
  _src text;
  _before jsonb;
  _after jsonb;
  _i integer;
BEGIN
  SELECT pg_catalog.md5(p.prosrc) INTO STRICT _src FROM pg_catalog.pg_proc p WHERE p.oid = _target;
  IF _src = _expected_after THEN
    RAISE NOTICE 'D20_ROLLBACK_ALREADY_AT_TARGET_STATE';
    RETURN;
  END IF;
  IF _src IS DISTINCT FROM _expected_before THEN
    RAISE EXCEPTION 'D20_ROLLBACK_UNEXPECTED_FUNCTION_STATE: md5=%', _src USING ERRCODE = '55000';
  END IF;
  SELECT pg_catalog.jsonb_build_object(
    'owner', pg_catalog.pg_get_userbyid(p.proowner), 'security_definer', p.prosecdef,
    'volatility', p.provolatile, 'strict', p.proisstrict, 'config', p.proconfig::text,
    'acl', p.proacl::text, 'language', l.lanname, 'return_type', pg_catalog.pg_get_function_result(p.oid),
    'arg_types', p.proargtypes::text, 'arg_names', p.proargnames::text)
    INTO STRICT _before
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid = p.prolang WHERE p.oid = _target;
  _definition := pg_catalog.pg_get_functiondef(_target);
  FOR _i IN 1 .. pg_catalog.array_length(_old, 1) LOOP
    IF (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _old[_i], '')))
       / pg_catalog.length(_old[_i]) <> 1 THEN
      RAISE EXCEPTION 'D20_ROLLBACK_FRAGMENT_NOT_UNIQUE: %', _i USING ERRCODE = '55000';
    END IF;
    _definition := pg_catalog.replace(_definition, _old[_i], _new[_i]);
  END LOOP;
  EXECUTE _definition;
  SELECT pg_catalog.md5(p.prosrc) INTO STRICT _src FROM pg_catalog.pg_proc p WHERE p.oid = _target;
  IF _src IS DISTINCT FROM _expected_after THEN
    RAISE EXCEPTION 'D20_ROLLBACK_POSTCONDITION_INVALID: md5=%', _src USING ERRCODE = '55000';
  END IF;
  SELECT pg_catalog.jsonb_build_object(
    'owner', pg_catalog.pg_get_userbyid(p.proowner), 'security_definer', p.prosecdef,
    'volatility', p.provolatile, 'strict', p.proisstrict, 'config', p.proconfig::text,
    'acl', p.proacl::text, 'language', l.lanname, 'return_type', pg_catalog.pg_get_function_result(p.oid),
    'arg_types', p.proargtypes::text, 'arg_names', p.proargnames::text)
    INTO STRICT _after
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid = p.prolang WHERE p.oid = _target;
  IF _before IS DISTINCT FROM _after THEN
    RAISE EXCEPTION 'D20_ROLLBACK_FUNCTION_PROPERTIES_CHANGED: before=% after=%', _before, _after USING ERRCODE = '55000';
  END IF;
  RAISE NOTICE 'D20_ROLLBACK_PATCHED: md5 % -> %', _expected_before, _src;
END;
$d20_rollback$;

COMMIT;
