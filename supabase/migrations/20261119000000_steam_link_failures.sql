-- STEAM — server-only diagnostics of failed Steam OpenID callbacks.
--
-- The callback redirects the browser with a coarse reason only, and runtime logs are not
-- reachable from the operator tooling. Each failed callback records WHERE it failed and
-- the internal error code (plus the upstream HTTP status when there is one). Nothing else:
-- no user id, no SteamID64, no state, no signature, no nonce, no URL, no body.
-- No client role can read or write it.
--
-- Rollback: DROP TABLE IF EXISTS public.steam_link_failures;

CREATE TABLE IF NOT EXISTS public.steam_link_failures (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  stage text NOT NULL CHECK (stage IN ('payload', 'throttle', 'validate', 'link')),
  error_code text NOT NULL CHECK (error_code ~ '^[A-Z_]{3,64}$'),
  http_status smallint CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599)
);
CREATE INDEX IF NOT EXISTS steam_link_failures_created_idx ON public.steam_link_failures (created_at DESC);

ALTER TABLE public.steam_link_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.steam_link_failures FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.steam_link_failures TO service_role;
GRANT USAGE ON SEQUENCE public.steam_link_failures_id_seq TO service_role;

COMMENT ON TABLE public.steam_link_failures IS
  'Steam OpenID callback failures: stage + internal code only; no identifiers or protocol values. Server-only.';
