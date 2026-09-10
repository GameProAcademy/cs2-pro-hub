DROP FUNCTION IF EXISTS public.canonical_attach_source(public.data_source, text, uuid, text);

CREATE OR REPLACE FUNCTION public.canonical_attach_source(
  _source public.data_source,
  _external_match_id text,
  _match_id uuid,
  _source_contract_version text,
  _fingerprint text DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  _existing_id uuid;
  _existing_match uuid;
  _ext text := NULLIF(_external_match_id, '');
  _fp text := NULLIF(_fingerprint, '');
  _key text;
BEGIN
  IF _source IS NULL OR _match_id IS NULL OR (_ext IS NULL AND _fp IS NULL) THEN
    RAISE EXCEPTION 'CANONICAL_ATTACH_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.matches WHERE id = _match_id) THEN
    RAISE EXCEPTION 'CANONICAL_ATTACH_TARGET_NOT_FOUND' USING ERRCODE = '23503';
  END IF;

  _key := _source::text || '|' || COALESCE('ext:' || _ext, 'fp:' || _fp);
  PERFORM pg_advisory_xact_lock(hashtext('public.canonical_attach_source'), hashtext(_key));

  IF _ext IS NOT NULL THEN
    SELECT id, match_id INTO _existing_id, _existing_match
      FROM public.match_sources
     WHERE source = _source AND external_match_id = _ext
     FOR UPDATE;
  ELSE
    SELECT id, match_id INTO _existing_id, _existing_match
      FROM public.match_sources
     WHERE source = _source AND fingerprint = _fp
     FOR UPDATE;
  END IF;

  IF _existing_id IS NOT NULL THEN
    IF _existing_match IS DISTINCT FROM _match_id THEN
      RAISE EXCEPTION 'CANONICAL_ATTACH_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN _existing_id;
  END IF;

  INSERT INTO public.match_sources (
    match_id, source, source_contract_version, external_match_id, fingerprint,
    fetched_at, status, observation_count)
  VALUES (_match_id, _source, COALESCE(NULLIF(_source_contract_version, ''), 'unknown'),
          _ext, _fp, now(), 'unknown', 0)
  RETURNING id INTO _existing_id;

  RETURN _existing_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.canonical_attach_source(public.data_source, text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.canonical_attach_source(public.data_source, text, uuid, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canonical_attach_source(public.data_source, text, uuid, text, text) TO service_role;

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
  _fp text := NULLIF(_obs->>'fingerprint', '');
  _source public.data_source := (_obs->>'source')::public.data_source;
BEGIN
  IF _attach_match_id IS NOT NULL THEN
    PERFORM 1 FROM public.matches WHERE id = _attach_match_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CANONICAL_ATTACH_TARGET_NOT_FOUND' USING ERRCODE = '23503';
    END IF;
    IF _ext IS NULL AND _fp IS NULL THEN
      RAISE EXCEPTION 'CANONICAL_ATTACH_INVALID' USING ERRCODE = '22023';
    END IF;
    PERFORM public.canonical_attach_source(
      _source, _ext, _attach_match_id,
      COALESCE(_obs->>'sourceContractVersion', 'unknown'), _fp);
  END IF;

  RETURN public.persist_canonical_observation(_bundle, _owner_player_id, _upload_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.persist_canonical_observation_attached(jsonb, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.persist_canonical_observation_attached(jsonb, uuid, uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_canonical_observation_attached(jsonb, uuid, uuid, uuid) TO service_role;