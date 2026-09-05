-- FASE 2.5 — STEAM IDENTITY FOUNDATION
-- 1. connection_type gains 'openid' (Steam's official browser flow is OpenID 2.0,
--    NOT OAuth). No statement below uses the new label, so the enum addition is
--    safe inside this migration.
ALTER TYPE public.connection_type ADD VALUE IF NOT EXISTS 'openid';

-- 2. Steam OpenID link attempts. Backend-only surface: the raw state never
--    touches the database (only its SHA-256 hash), the attempt is single-use and
--    short-lived, and it is always bound to the user who started it.
CREATE TABLE IF NOT EXISTS public.steam_link_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_id uuid REFERENCES public.player_profiles(id) ON DELETE SET NULL,
  state_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  return_url text NOT NULL,
  realm text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  cancelled_at timestamptz,
  CONSTRAINT steam_link_attempts_status_chk
    CHECK (status IN ('pending', 'consumed', 'expired', 'cancelled', 'failed')),
  CONSTRAINT steam_link_attempts_state_hash_chk
    CHECK (char_length(state_hash) BETWEEN 32 AND 128)
);

-- Backend only: no GRANT to anon/authenticated at all.
REVOKE ALL ON public.steam_link_attempts FROM anon, authenticated;
GRANT ALL ON public.steam_link_attempts TO service_role;

ALTER TABLE public.steam_link_attempts ENABLE ROW LEVEL SECURITY;
-- Deliberately zero policies: only the service role (which bypasses RLS) may
-- touch attempts. A player can neither read nor forge one.

CREATE UNIQUE INDEX IF NOT EXISTS steam_link_attempts_state_hash_uniq
  ON public.steam_link_attempts (state_hash);
CREATE INDEX IF NOT EXISTS steam_link_attempts_user_status_idx
  ON public.steam_link_attempts (user_id, status);
CREATE INDEX IF NOT EXISTS steam_link_attempts_expires_idx
  ON public.steam_link_attempts (expires_at) WHERE status = 'pending';

-- 3. Metadata must never carry credentials (same rule as player_connections).
CREATE OR REPLACE FUNCTION public.guard_steam_link_attempt_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.metadata IS NOT NULL AND public.jsonb_has_sensitive_key(NEW.metadata) THEN
    RAISE EXCEPTION 'Steam link attempt metadata must not contain credentials or secrets'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.guard_steam_link_attempt_metadata() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_steam_link_attempt_metadata ON public.steam_link_attempts;
CREATE TRIGGER guard_steam_link_attempt_metadata
  BEFORE INSERT OR UPDATE ON public.steam_link_attempts
  FOR EACH ROW EXECUTE FUNCTION public.guard_steam_link_attempt_metadata();

-- 4. UNIQUE OWNERSHIP — a SteamID64 belongs to exactly one GamePro player.
--    Application-side checks come first; these indexes are the last line of
--    defence against a concurrent race (Postgres 23505).
CREATE UNIQUE INDEX IF NOT EXISTS player_connections_steam_external_uniq
  ON public.player_connections (source, external_id)
  WHERE source = 'steam'::public.data_source AND external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS player_identities_steam_external_uniq
  ON public.player_identities (platform, external_id)
  WHERE platform = 'STEAM'::public.platform_kind AND external_id IS NOT NULL;
