-- FASE 2.5.2 — transactional email delivery log + distributed callback throttle.

CREATE TABLE IF NOT EXISTS public.email_delivery_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  kind text NOT NULL,
  recipient text NOT NULL,
  locale text NOT NULL DEFAULT 'pt-BR',
  subject text NOT NULL,
  provider text NOT NULL,
  provider_message_id text NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz NULL,
  CONSTRAINT email_delivery_logs_status_chk
    CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  CONSTRAINT email_delivery_logs_idempotency_uniq UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS email_delivery_logs_user_idx
  ON public.email_delivery_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS email_delivery_logs_status_idx
  ON public.email_delivery_logs (status, created_at DESC);

-- Server-only: no anon, no authenticated. RLS on with zero policies.
REVOKE ALL ON public.email_delivery_logs FROM anon, authenticated;
GRANT ALL ON public.email_delivery_logs TO service_role;
ALTER TABLE public.email_delivery_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.touch_email_delivery_logs()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_delivery_logs_touch ON public.email_delivery_logs;
CREATE TRIGGER email_delivery_logs_touch
  BEFORE UPDATE ON public.email_delivery_logs
  FOR EACH ROW EXECUTE FUNCTION public.touch_email_delivery_logs();

REVOKE ALL ON FUNCTION public.touch_email_delivery_logs() FROM PUBLIC, anon, authenticated;

-- Distributed throttle for the PUBLIC Steam callback. Only a salted hash of the
-- caller identity is stored, never an IP address in clear text.
CREATE TABLE IF NOT EXISTS public.steam_callback_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_hash text NOT NULL,
  outcome text NOT NULL DEFAULT 'received',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT steam_callback_events_outcome_chk
    CHECK (outcome IN ('received', 'invalid_state', 'rejected', 'success'))
);

CREATE INDEX IF NOT EXISTS steam_callback_events_window_idx
  ON public.steam_callback_events (client_hash, created_at DESC);

REVOKE ALL ON public.steam_callback_events FROM anon, authenticated;
GRANT ALL ON public.steam_callback_events TO service_role;
ALTER TABLE public.steam_callback_events ENABLE ROW LEVEL SECURITY;