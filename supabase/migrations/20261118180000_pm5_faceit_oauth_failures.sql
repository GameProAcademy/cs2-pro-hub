-- PM5 — server-only diagnostics of failed FACEIT OAuth callbacks.
--
-- The callback redirects the browser with a coarse reason only ("error"), so a failure in
-- production cannot be told apart (token exchange? userinfo? Data API profile? database?).
-- Each failed callback now records WHERE it failed and the stable internal error code, plus
-- the upstream HTTP status when there is one. Nothing else: no user id, no FACEIT id, no
-- code, state, token, e-mail, URL or response body. No client role can read or write it.
--
-- Rollback: DROP TABLE IF EXISTS public.faceit_oauth_failures;

CREATE TABLE IF NOT EXISTS public.faceit_oauth_failures (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  purpose text NOT NULL CHECK (purpose IN ('link', 'login')),
  stage text NOT NULL CHECK (stage IN ('state', 'token', 'userinfo', 'link', 'sync', 'session', 'account')),
  error_code text NOT NULL CHECK (error_code ~ '^[A-Z_]{3,64}$'),
  http_status smallint CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599)
);
CREATE INDEX IF NOT EXISTS faceit_oauth_failures_created_idx ON public.faceit_oauth_failures (created_at DESC);

ALTER TABLE public.faceit_oauth_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.faceit_oauth_failures FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.faceit_oauth_failures TO service_role;
GRANT USAGE ON SEQUENCE public.faceit_oauth_failures_id_seq TO service_role;

COMMENT ON TABLE public.faceit_oauth_failures IS
  'PM5: stage + internal code of failed FACEIT OAuth callbacks; no identifiers, tokens or bodies. Server-only.';
