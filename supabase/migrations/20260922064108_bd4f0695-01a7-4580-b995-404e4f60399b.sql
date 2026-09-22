-- FASE 2.7.2G.6-R.4-C.2: complete fail-closed Canonical surface.
DO $migration$
DECLARE
  _fields constant text[] := ARRAY[
    'CanonicalEvent.actorParticipantKey','CanonicalEvent.assisterParticipantKey','CanonicalEvent.damage','CanonicalEvent.data','CanonicalEvent.distance','CanonicalEvent.gameTimeSeconds','CanonicalEvent.headshot','CanonicalEvent.quality.confidence','CanonicalEvent.quality.reasons','CanonicalEvent.quality.status','CanonicalEvent.roundNumber','CanonicalEvent.sourceActorExternalId','CanonicalEvent.sourceAssisterExternalId','CanonicalEvent.sourceVictimExternalId','CanonicalEvent.tick','CanonicalEvent.type','CanonicalEvent.victimParticipantKey','CanonicalEvent.weapon','CanonicalMatch.coverage.eventsObserved','CanonicalMatch.coverage.hasEventData','CanonicalMatch.coverage.hasPlayerRoundState','CanonicalMatch.coverage.hasRoundData','CanonicalMatch.coverage.participantsExpected','CanonicalMatch.coverage.participantsObserved','CanonicalMatch.coverage.participantsResolved','CanonicalMatch.coverage.roundsExpected','CanonicalMatch.coverage.roundsObserved','CanonicalMatch.durationSeconds','CanonicalMatch.finished','CanonicalMatch.finishedAt','CanonicalMatch.game','CanonicalMatch.map','CanonicalMatch.mapNumber','CanonicalMatch.playedAt','CanonicalMatch.quality.confidence','CanonicalMatch.quality.reasons','CanonicalMatch.quality.status','CanonicalMatch.roundCount','CanonicalMatch.schemaVersion','CanonicalMatch.scoreTeamA','CanonicalMatch.scoreTeamB','CanonicalMatch.startedAt','CanonicalMatch.status','CanonicalMatch.teamA','CanonicalMatch.teamB','CanonicalMatch.terminal','CanonicalMatch.winnerTeam','CanonicalMatchSource.externalMatchId','CanonicalMatchSource.externalParentId','CanonicalMatchSource.fetchedAt','CanonicalMatchSource.fingerprint','CanonicalMatchSource.metadata','CanonicalMatchSource.quality.confidence','CanonicalMatchSource.quality.reasons','CanonicalMatchSource.quality.status','CanonicalMatchSource.source','CanonicalMatchSource.sourceContractVersion','CanonicalMatchSource.sourceUpdatedAt','CanonicalMatchSource.sourceVersion','CanonicalMatchSource.status','CanonicalParticipant.externalPlayerId','CanonicalParticipant.identityConfidence','CanonicalParticipant.identityStatus','CanonicalParticipant.internalPlayerId','CanonicalParticipant.isTargetPlayer','CanonicalParticipant.metadata','CanonicalParticipant.nicknameSnapshot','CanonicalParticipant.participantKey','CanonicalParticipant.source','CanonicalParticipant.steamId64','CanonicalParticipant.team','CanonicalRound.bombDefused','CanonicalRound.bombExploded','CanonicalRound.bombPlanted','CanonicalRound.durationSeconds','CanonicalRound.endTick','CanonicalRound.endTimeSeconds','CanonicalRound.metadata','CanonicalRound.quality.confidence','CanonicalRound.quality.reasons','CanonicalRound.quality.status','CanonicalRound.roundNumber','CanonicalRound.startTick','CanonicalRound.startTimeSeconds','CanonicalRound.winReason','CanonicalRound.winningSide','CanonicalRound.winningTeam','CanonicalRoundPlayer.assists','CanonicalRoundPlayer.buyContext','CanonicalRoundPlayer.damage','CanonicalRoundPlayer.deaths','CanonicalRoundPlayer.equipmentValue','CanonicalRoundPlayer.flashAssists','CanonicalRoundPlayer.kills','CanonicalRoundPlayer.metadata','CanonicalRoundPlayer.moneyEnd','CanonicalRoundPlayer.moneyStart','CanonicalRoundPlayer.openingDeath','CanonicalRoundPlayer.openingKill','CanonicalRoundPlayer.participantKey','CanonicalRoundPlayer.roundNumber','CanonicalRoundPlayer.side','CanonicalRoundPlayer.survived','CanonicalRoundPlayer.tradeKill','CanonicalRoundPlayer.traded'
  ];
  _field text;
  _capability text;
  _api text;
  _source_field text;
  _normalization text;
  _identity text;
  _null_semantics text;
  _zero_semantics text;
  _false_semantics text;
  _empty_semantics text;
  _event_evidence jsonb;
  _full_tick boolean;
  _digest text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.canonical_mapping_inventory
    WHERE canonical_authorization OR parity_status = 'VERIFIED' OR determinism_status = 'VERIFIED'
  ) THEN
    RAISE EXCEPTION 'CANONICAL_MAPPING_SEED_REFUSES_VERIFIED_OR_AUTHORIZED_ROWS' USING ERRCODE='55000';
  END IF;

  DROP TRIGGER IF EXISTS canonical_mapping_inventory_immutable ON public.canonical_mapping_inventory;

  FOREACH _field IN ARRAY _fields LOOP
    IF _field LIKE 'CanonicalParticipant.%' THEN
      _capability := 'player_info.steamid'; _api := 'parse_player_info';
    ELSIF _field LIKE 'CanonicalRoundPlayer.%' THEN
      _capability := 'economy.balance'; _api := 'parse_ticks';
    ELSIF _field LIKE 'CanonicalRound.%' THEN
      _capability := 'rounds.number'; _api := 'parse_event';
    ELSIF _field LIKE 'CanonicalEvent.%' THEN
      _capability := 'events.player_death'; _api := 'parse_event';
    ELSE
      _capability := 'header.map_name'; _api := 'parse_header';
    END IF;
    _source_field := 'derived_or_constant';
    _normalization := 'Demo adapter translation; real same-DEM evidence required';
    _identity := 'EXPLICIT_CANONICAL_SEMANTICS';
    _null_semantics := 'unknown remains null';
    _zero_semantics := 'observed zero preserved';
    _false_semantics := 'observed false preserved';
    _empty_semantics := 'not promoted without validation';
    _full_tick := _field LIKE 'CanonicalRound.%' OR _field LIKE 'CanonicalRoundPlayer.%' OR _field LIKE 'CanonicalEvent.%';
    _event_evidence := CASE WHEN _api='parse_event' THEN '{"required":"REAL_DEM"}'::jsonb ELSE '{}'::jsonb END;

    IF _field='CanonicalMatch.map' THEN
      _capability:='header.map_name'; _source_field:='map_name'; _api:='parse_header'; _normalization:='canonical CS2 map-code normalization'; _identity:='NOT_APPLICABLE'; _null_semantics:='unknown map'; _zero_semantics:='INVALID'; _false_semantics:='INVALID'; _empty_semantics:='missing'; _full_tick:=false;
    ELSIF _field='CanonicalParticipant.steamId64' THEN
      _capability:='player_info.steamid'; _source_field:='steamid'; _api:='parse_player_info'; _normalization:='decimal SteamID64 string; zero is unlinked'; _identity:='STEAM_ID64_OR_NULL'; _null_semantics:='unlinked participant'; _zero_semantics:='null'; _false_semantics:='INVALID'; _empty_semantics:='null'; _full_tick:=false;
    ELSIF _field='CanonicalParticipant.nicknameSnapshot' THEN
      _capability:='player_info.name'; _source_field:='name'; _api:='parse_player_info'; _normalization:='bounded UTF-8 snapshot; never identity'; _identity:='NICKNAME_NOT_STRONG_IDENTITY'; _null_semantics:='unknown nickname'; _zero_semantics:='INVALID'; _false_semantics:='INVALID'; _empty_semantics:='null'; _full_tick:=false;
    ELSIF _field='CanonicalRound.startTick' THEN
      _capability:='rounds.start_tick'; _source_field:='round_start.tick'; _api:='parse_event'; _normalization:='non-negative integer preserving parser order'; _identity:='NOT_APPLICABLE'; _null_semantics:='unknown boundary'; _zero_semantics:='valid tick zero'; _false_semantics:='INVALID'; _empty_semantics:='INVALID'; _full_tick:=false; _event_evidence:='{"required":"REAL_DEM"}'::jsonb;
    ELSIF _field='CanonicalRound.endTick' THEN
      _capability:='rounds.end_tick'; _source_field:='round_end.tick'; _api:='parse_event'; _normalization:='first valid end after start; pre-start ends ignored'; _identity:='NOT_APPLICABLE'; _null_semantics:='unknown boundary'; _zero_semantics:='valid only when ordered after start'; _false_semantics:='INVALID'; _empty_semantics:='INVALID'; _full_tick:=false; _event_evidence:='{"required":"REAL_DEM"}'::jsonb;
    ELSIF _field='CanonicalRound.winningSide' THEN
      _capability:='rounds.winner_side'; _source_field:='round_end.winner'; _api:='parse_event'; _normalization:='explicit CT/T parser-side value only'; _identity:='TEAM_SLOT_IS_NOT_ROUND_SIDE'; _null_semantics:='unknown side'; _zero_semantics:='unknown'; _false_semantics:='INVALID'; _empty_semantics:='unknown'; _full_tick:=false; _event_evidence:='{"required":"REAL_DEM"}'::jsonb;
    ELSIF _field='CanonicalEvent.sourceActorExternalId' THEN
      _capability:='event_fields.attacker_steamid'; _source_field:='attacker_steamid'; _api:='parse_event'; _normalization:='source identifier preserved verbatim; participant resolution separate'; _identity:='SOURCE_ID_NOT_PARTICIPANT_KEY'; _null_semantics:='unresolved actor'; _zero_semantics:='null'; _false_semantics:='INVALID'; _empty_semantics:='null'; _full_tick:=false; _event_evidence:='{"required":"REAL_DEM"}'::jsonb;
    END IF;

    _digest := encode(extensions.digest(convert_to(jsonb_build_object(
      'canonicalAuthorization',false,'canonicalField',_field,'dependsOnFullTickDomain',_full_tick,
      'determinismStatus','NOT_RUN','emptyStringSemantics',_empty_semantics,'eventEvidence',CASE WHEN _event_evidence='{}'::jsonb THEN 'NOT_APPLICABLE' ELSE 'REQUIRED_ON_REAL_DEM' END,
      'evidenceClass','DECLARED_SOURCE_ONLY','falseSemantics',_false_semantics,'identityRequirement',_identity,'lastVerifiedAt',NULL,
      'missingSemantics','null or fail-closed constant','normalization',_normalization,'normalizationExecuted',false,
      'nullSemantics',_null_semantics,'parityStatus','NOT_RUN','parserApi',_api,'pythonEvidence','project_catalog:'||replace(_capability,'.',':'),
      'reviewStatus','REVIEWED','semanticMismatch',false,'sourceCapability',_capability,'sourceField',_source_field,
      'status','PARITY_PENDING','wasmEvidence','[]'::jsonb,'zeroSemantics',_zero_semantics
    )::text,'UTF8'),'sha256'),'hex');

    INSERT INTO public.canonical_mapping_inventory (
      canonical_field,source_capability,source_field,parser_api,python_evidence,wasm_evidence,event_evidence,
      normalization,normalization_executed,identity_requirement,null_semantics,zero_semantics,false_semantics,
      empty_string_semantics,missing_semantics,evidence_class,parity_status,determinism_status,canonical_authorization,
      review_status,mapping_status,depends_on_full_tick_domain,semantic_mismatch,last_verified_at,evidence_digest
    ) VALUES (
      _field,_capability,_source_field,_api,jsonb_build_object('ref','project_catalog:'||replace(_capability,'.',':')),'[]'::jsonb,_event_evidence,
      _normalization,false,_identity,_null_semantics,_zero_semantics,_false_semantics,_empty_semantics,'null or fail-closed constant',
      'DECLARED_SOURCE_ONLY','NOT_RUN','NOT_RUN',false,'REVIEWED','PARITY_PENDING',_full_tick,false,NULL,_digest
    ) ON CONFLICT (canonical_field) DO UPDATE SET
      source_capability=excluded.source_capability,source_field=excluded.source_field,parser_api=excluded.parser_api,
      python_evidence=excluded.python_evidence,wasm_evidence=excluded.wasm_evidence,event_evidence=excluded.event_evidence,
      normalization=excluded.normalization,normalization_executed=false,identity_requirement=excluded.identity_requirement,
      null_semantics=excluded.null_semantics,zero_semantics=excluded.zero_semantics,false_semantics=excluded.false_semantics,
      empty_string_semantics=excluded.empty_string_semantics,missing_semantics=excluded.missing_semantics,evidence_class=excluded.evidence_class,
      parity_status='NOT_RUN',determinism_status='NOT_RUN',canonical_authorization=false,review_status='REVIEWED',mapping_status='PARITY_PENDING',
      depends_on_full_tick_domain=excluded.depends_on_full_tick_domain,semantic_mismatch=false,last_verified_at=NULL,evidence_digest=excluded.evidence_digest,updated_at=now();
  END LOOP;

  IF (SELECT count(*) FROM public.canonical_mapping_inventory) <> 105
     OR EXISTS (SELECT 1 FROM public.canonical_mapping_inventory WHERE canonical_field <> ALL(_fields)) THEN
    RAISE EXCEPTION 'CANONICAL_MAPPING_DATABASE_SURFACE_MISMATCH' USING ERRCODE='55000';
  END IF;

  CREATE TRIGGER canonical_mapping_inventory_immutable
  BEFORE UPDATE OR DELETE ON public.canonical_mapping_inventory
  FOR EACH ROW EXECUTE FUNCTION public.prevent_canonical_mapping_inventory_mutation();
END
$migration$;

CREATE OR REPLACE FUNCTION public.canonical_mapping_inventory_snapshot()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE _count integer; _authorized integer; _parity integer; _determinism integer;
BEGIN
  SELECT count(*),count(*) FILTER(WHERE canonical_authorization),count(*) FILTER(WHERE parity_status='VERIFIED'),count(*) FILTER(WHERE determinism_status='VERIFIED')
  INTO _count,_authorized,_parity,_determinism FROM public.canonical_mapping_inventory;
  IF _count<>105 OR _authorized<>0 OR _parity<>0 OR _determinism<>0 THEN
    RAISE EXCEPTION 'CANONICAL_MAPPING_DATABASE_AUTHORITY_MISMATCH' USING ERRCODE='55000';
  END IF;
  RETURN jsonb_build_object('status','BLOCKED','row_count',_count,'authorized_count',_authorized,
    'parity_verified_count',_parity,'determinism_verified_count',_determinism,
    'inventory_digest','206b649f141b291f51d3b7d47b9ea6f20efc19148974b1bd5432eec9e35c7453',
    'matrix_digest','a276b0306c05ca6a2555db8b3c055bff2df6262b3e2bafccf6d1b5cca8425702');
END; $$;
REVOKE ALL ON FUNCTION public.canonical_mapping_inventory_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canonical_mapping_inventory_snapshot() TO service_role;

DROP FUNCTION IF EXISTS public.assert_real_demo_release_ready(uuid,jsonb);
REVOKE ALL ON TABLE public.canonical_mapping_inventory FROM PUBLIC, anon, authenticated;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES ON TABLE public.canonical_mapping_inventory FROM service_role;
GRANT SELECT ON TABLE public.canonical_mapping_inventory TO service_role;
COMMENT ON FUNCTION public.canonical_mapping_inventory_snapshot() IS 'C.2 fail-closed authority: 105 adapter fields and zero authorization before real parity and determinism.';