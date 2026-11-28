-- VGL 5.0 — Frente 3: public player profile.
--
-- Adds to public.player_profiles:
--   public_id       stable, non-sequential, shareable id (10 chars of a 32-symbol alphabet
--                   without 0/O/1/I, shown as XXXXX-XXXXX ≈ 50 bits): not derived from the
--                   e-mail or any internal id; unique; immutable for client roles.
--   public_profile  the owner's choice, PRIVATE BY DEFAULT (false).
--
-- No new client read path: public reads go through a server function with the service role
-- that returns a whitelisted view only when public_profile = true, and the same "not found"
-- for a private or non-existent id. RLS on player_profiles is unchanged (owner/staff only).
--
-- Rollback (manual):
--   DROP TRIGGER IF EXISTS player_profiles_public_id ON public.player_profiles;
--   DROP FUNCTION IF EXISTS public.player_profiles_public_id_guard();
--   DROP FUNCTION IF EXISTS public.new_player_public_id();
--   ALTER TABLE public.player_profiles DROP COLUMN IF EXISTS public_profile,
--                                      DROP COLUMN IF EXISTS public_id;

ALTER TABLE public.player_profiles
  ADD COLUMN IF NOT EXISTS public_id text,
  ADD COLUMN IF NOT EXISTS public_profile boolean NOT NULL DEFAULT false;

-- Random id from gen_random_uuid() (core, cryptographically random v4); retries on collision.
CREATE OR REPLACE FUNCTION public.new_player_public_id()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path TO ''
AS $$
DECLARE
  _alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  _hex text;
  _raw text;
  _candidate text;
  _i int;
BEGIN
  LOOP
    _hex := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    _raw := '';
    FOR _i IN 0..9 LOOP
      _raw := _raw || substr(
        _alphabet,
        1 + (('x' || substr(_hex, 1 + _i * 2, 2))::bit(8)::int % 32),
        1
      );
    END LOOP;
    _candidate := substr(_raw, 1, 5) || '-' || substr(_raw, 6, 5);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.player_profiles WHERE public_id = _candidate);
  END LOOP;
  RETURN _candidate;
END;
$$;

REVOKE ALL ON FUNCTION public.new_player_public_id() FROM PUBLIC, anon, authenticated;

UPDATE public.player_profiles SET public_id = public.new_player_public_id() WHERE public_id IS NULL;

ALTER TABLE public.player_profiles ALTER COLUMN public_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'player_profiles_public_id_format'
  ) THEN
    ALTER TABLE public.player_profiles
      ADD CONSTRAINT player_profiles_public_id_format
      CHECK (public_id ~ '^[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS player_profiles_public_id_key
  ON public.player_profiles (public_id);

-- Assigns the id on insert and keeps it immutable for client roles (the owner may only
-- toggle public_profile; the id never changes from the browser).
CREATE OR REPLACE FUNCTION public.player_profiles_public_id_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.public_id IS NULL OR auth.uid() IS NOT NULL THEN
      NEW.public_id := public.new_player_public_id();
    END IF;
    IF auth.uid() IS NOT NULL THEN
      NEW.public_profile := false;
    END IF;
  ELSIF NEW.public_id IS DISTINCT FROM OLD.public_id AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'PUBLIC_ID_IMMUTABLE' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS player_profiles_public_id ON public.player_profiles;
CREATE TRIGGER player_profiles_public_id
  BEFORE INSERT OR UPDATE ON public.player_profiles
  FOR EACH ROW EXECUTE FUNCTION public.player_profiles_public_id_guard();

COMMENT ON COLUMN public.player_profiles.public_id IS
  'VGL 5.0: shareable public id (XXXXX-XXXXX, random, unique, immutable for clients).';
COMMENT ON COLUMN public.player_profiles.public_profile IS
  'VGL 5.0: owner choice to make the profile public. Private by default.';
