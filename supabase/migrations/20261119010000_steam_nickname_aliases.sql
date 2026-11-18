-- STEAM — Steam persona names as nickname ALIASES of the player (never as identity).
--
-- The verified SteamID64 (player_identities, platform STEAM, verified by OpenID) is the
-- identity. The Steam persona name is only an alias: it can change, repeat across players
-- or be absent. Aliases are kept in the EXISTING canonical history table
-- (`player_nickname_history`), with a new source `steam_profile`, so demo identification
-- reads one history instead of a parallel structure.
--
-- Rules enforced here:
--   * an alias is recorded only for the player whose VERIFIED Steam identity is that SteamID64;
--   * history is never deleted by a sync; repeated syncs are idempotent (no times_seen inflation);
--   * a stronger existing source (manual_selection / demo_observation) is never downgraded;
--   * automatic demo attachment keeps using ONLY `manual_selection` (unchanged); a Steam
--     alias can at most produce an "is this you?" suggestion.
-- Retention: aliases live as long as the player profile (ON DELETE CASCADE, unchanged).
--
-- Rollback:
--   DELETE FROM public.player_nickname_history WHERE source = 'steam_profile';
--   DROP FUNCTION IF EXISTS public.record_steam_alias(uuid, text, text);
--   ALTER TABLE public.player_nickname_history DROP CONSTRAINT player_nickname_history_source_check,
--     ADD CONSTRAINT player_nickname_history_source_check
--     CHECK (source = ANY (ARRAY['declared_profile','demo_observation','manual_selection']));

ALTER TABLE public.player_nickname_history DROP CONSTRAINT IF EXISTS player_nickname_history_source_check;
ALTER TABLE public.player_nickname_history ADD CONSTRAINT player_nickname_history_source_check
  CHECK (source = ANY (ARRAY['declared_profile', 'demo_observation', 'manual_selection', 'steam_profile']));

CREATE OR REPLACE FUNCTION public.record_steam_alias(_player_id uuid, _nickname text, _steam_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _clean text;
  _normalized text;
  _inserted boolean := false;
BEGIN
  IF _player_id IS NULL OR _steam_id IS NULL OR _steam_id !~ '^7656119[0-9]{10}$' THEN
    RAISE EXCEPTION 'STEAM_ALIAS_INVALID';
  END IF;
  _clean := btrim(regexp_replace(normalize(coalesce(_nickname, ''), NFKC), '\s+', ' ', 'g'));
  IF _clean = '' OR length(_clean) > 64 THEN
    RETURN false;
  END IF;
  _normalized := lower(_clean);

  -- Only the player whose Steam identity is VERIFIED for this SteamID64 gets the alias.
  IF NOT EXISTS (
    SELECT 1 FROM public.player_identities
     WHERE player_id = _player_id
       AND platform = 'STEAM'::public.platform_kind
       AND external_id = _steam_id
       AND is_verified = true
       AND identity_status = 'verified'::public.identity_link_status
  ) THEN
    RAISE EXCEPTION 'STEAM_ALIAS_NOT_VERIFIED';
  END IF;

  INSERT INTO public.player_nickname_history (
    player_id, nickname, normalized_nickname, source, method, confidence_label, steam_id, metadata
  ) VALUES (
    _player_id, _clean, _normalized, 'steam_profile', 'steam_web_api', 'low', _steam_id,
    jsonb_build_object('steam_last_seen_at', now())
  )
  ON CONFLICT (player_id, normalized_nickname) DO NOTHING
  RETURNING true INTO _inserted;

  IF NOT COALESCE(_inserted, false) THEN
    -- Already known: refresh the observation only. Source, method, counters, the Steam ID
    -- and the nickname spelling of a stronger (manual/demo) observation are never changed:
    -- only the metadata notes that Steam reported the same name.
    UPDATE public.player_nickname_history
       SET steam_id = CASE WHEN source = 'steam_profile' THEN COALESCE(steam_id, _steam_id) ELSE steam_id END,
           last_seen_at = CASE WHEN source = 'steam_profile' THEN now() ELSE last_seen_at END,
           metadata = metadata || jsonb_build_object('steam_last_seen_at', now()),
           updated_at = now()
     WHERE player_id = _player_id AND normalized_nickname = _normalized;
  END IF;

  RETURN COALESCE(_inserted, false);
END;
$$;

REVOKE ALL ON FUNCTION public.record_steam_alias(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_steam_alias(uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.record_steam_alias(uuid, text, text) IS
  'Steam persona name as a nickname alias of the player with that VERIFIED SteamID64. Idempotent; never downgrades a stronger source.';
