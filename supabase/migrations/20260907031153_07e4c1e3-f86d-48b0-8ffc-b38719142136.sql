-- FASE 2.6.11.1 — atomic attach + persistence for the canonical path.
-- A single SECURITY DEFINER routine runs the attach reservation AND the full
-- observation persistence in ONE transaction, so a failure in any later step
-- rolls back the attach too: no partial attach, no orphan match_source.
CREATE OR REPLACE FUNCTION public.persist_canonical_observation_attached(
  _bundle jsonb,
  _owner_player_id uuid DEFAULT NULL::uuid,
  _upload_id uuid DEFAULT NULL::uuid,
  _attach_match_id uuid DEFAULT NULL::uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  _obs jsonb := _bundle->'observation';
  _ext text := NULLIF(_obs->>'externalMatchId', '');
  _source public.data_source := (_obs->>'source')::public.data_source;
BEGIN
  IF _attach_match_id IS NOT NULL THEN
    PERFORM 1 FROM public.matches WHERE id = _attach_match_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CANONICAL_ATTACH_TARGET_NOT_FOUND' USING ERRCODE = '23503';
    END IF;
    IF _ext IS NULL THEN
      RAISE EXCEPTION 'CANONICAL_ATTACH_INVALID' USING ERRCODE = '22023';
    END IF;
    -- Reserves the source slot on the target canonical match. Same transaction
    -- as the persistence below, therefore indivisible.
    PERFORM public.canonical_attach_source(
      _source, _ext, _attach_match_id,
      COALESCE(_obs->>'sourceContractVersion', 'unknown'));
  END IF;

  RETURN public.persist_canonical_observation(_bundle, _owner_player_id, _upload_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.persist_canonical_observation_attached(jsonb, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.persist_canonical_observation_attached(jsonb, uuid, uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_canonical_observation_attached(jsonb, uuid, uuid, uuid) TO service_role;

-- FASE 2.6.11.1 — canonical privilege hardening: writes are server-side only.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.matches FROM authenticated;
REVOKE ALL ON public.matches FROM anon;
GRANT ALL ON public.matches TO service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.match_series FROM authenticated;
REVOKE ALL ON public.match_series FROM anon;
GRANT ALL ON public.match_series TO service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.match_sources FROM authenticated;
REVOKE ALL ON public.match_sources FROM anon;
GRANT ALL ON public.match_sources TO service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.match_participants FROM authenticated;
REVOKE ALL ON public.match_participants FROM anon;
GRANT ALL ON public.match_participants TO service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.match_rounds FROM authenticated;
REVOKE ALL ON public.match_rounds FROM anon;
GRANT ALL ON public.match_rounds TO service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.round_players FROM authenticated;
REVOKE ALL ON public.round_players FROM anon;
GRANT ALL ON public.round_players TO service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.round_events FROM authenticated;
REVOKE ALL ON public.round_events FROM anon;
GRANT ALL ON public.round_events TO service_role;