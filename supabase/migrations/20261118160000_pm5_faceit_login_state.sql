-- PM5 — "Continue with FACEIT" (sign in / sign up with FACEIT).
--
-- A LOGIN OAuth attempt has no CS2 PRO user yet: user_id becomes nullable and a `purpose`
-- column tells LINK (Fase 2.2.1, always bound to a user) from LOGIN (bound to the browser by
-- the SHA-256 of an HttpOnly cookie, `browser_binding_hash`). Constraints keep a LINK attempt
-- bound to a user and a LOGIN attempt bound to a browser. The table stays server-only (no
-- client grant, RLS on, unchanged). Existing rows are LINK attempts (default).
--
-- Rollback:
--   DELETE FROM public.oauth_connection_states WHERE purpose = 'login';
--   ALTER TABLE public.oauth_connection_states DROP CONSTRAINT IF EXISTS oauth_connection_states_purpose_binding,
--     DROP COLUMN IF EXISTS browser_binding_hash, DROP COLUMN IF EXISTS purpose,
--     ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.oauth_connection_states
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'link',
  ADD COLUMN IF NOT EXISTS browser_binding_hash text,
  ALTER COLUMN user_id DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.oauth_connection_states
    ADD CONSTRAINT oauth_connection_states_purpose_binding CHECK (
      (purpose = 'link' AND user_id IS NOT NULL)
      OR (purpose = 'login' AND user_id IS NULL AND browser_binding_hash IS NOT NULL
          AND browser_binding_hash ~ '^[0-9a-f]{64}$')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS oauth_connection_states_login_created_idx
  ON public.oauth_connection_states (created_at) WHERE purpose = 'login';

REVOKE ALL ON public.oauth_connection_states FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.oauth_connection_states.purpose IS
  'PM5: link (connect FACEIT to the signed-in user) or login (Continue with FACEIT).';
COMMENT ON COLUMN public.oauth_connection_states.browser_binding_hash IS
  'PM5: SHA-256 of the HttpOnly login cookie; a LOGIN callback must present the same cookie.';
