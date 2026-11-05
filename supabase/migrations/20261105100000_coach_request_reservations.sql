-- Fase 3.5 — durable, global and atomic idempotency for AI Coach requests.
--
-- One row per client request id (UUID), created atomically BEFORE the provider is called.
-- Only the holder of the current lease token may call the provider and write the result;
-- every other caller gets REPLAY, IN_PROGRESS, CONFLICT or OUTCOME_UNKNOWN without a
-- provider call. The question and the reply are written in ONE transaction together with
-- the COMPLETED state (coach_complete_request), so a reservation is never COMPLETED without
-- its messages, nor messages without a COMPLETED reservation.
--
-- States
--   PROCESSING       claimed; the lease holder may call the provider (RESERVED and
--                    PROCESSING are one atomic step here: the claim IS the lease).
--   COMPLETED        question + reply persisted; replays return them.
--   FAILED           the provider definitely did not produce a usable billed reply (or the
--                    rate limit refused): a retry with the same id may take over.
--   OUTCOME_UNKNOWN  the provider may have generated (timeout, lost connection, expired
--                    lease). Never retried automatically: the player asks again (new id).
--                    A late answer from the ORIGINAL lease holder may still complete it.
--   PERSIST_PENDING  the provider answered, the reply passed the guards, the final write
--                    failed: the reply is kept here so a retry persists it WITHOUT a new
--                    generation.
--
-- Fencing: lease_token changes on every takeover; complete/fail/persist_pending require the
-- current token, so an executor that lost its lease can never write.
--
-- Access: the table has RLS enabled and NO policy for anon/authenticated (deny all). The
-- functions are SECURITY INVOKER and executable ONLY by service_role; the server derives
-- user and player from the authenticated session and passes them explicitly.
--
-- Rollback (no historical data touched; coach_messages / coach_conversations unchanged):
--   DROP FUNCTION IF EXISTS public.coach_claim_request(uuid, uuid, uuid, uuid, text, integer);
--   DROP FUNCTION IF EXISTS public.coach_complete_request(uuid, uuid, text, text, text, text, text, text);
--   DROP FUNCTION IF EXISTS public.coach_fail_request(uuid, uuid, text, text);
--   DROP FUNCTION IF EXISTS public.coach_persist_pending(uuid, uuid, text, text, text, text);
--   DROP TABLE IF EXISTS public.coach_request_reservations;
-- and redeploy the previous web build (it does not call these functions).

CREATE TABLE IF NOT EXISTS public.coach_request_reservations (
  request_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  player_id uuid NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  -- CASCADE: a conversation deleted mid-flight takes its reservation with it, so a late
  -- completion finds no lease (COACH_LEASE_LOST) and can never resurrect the conversation.
  conversation_id uuid REFERENCES public.coach_conversations(id) ON DELETE CASCADE,
  message_sha256 text NOT NULL CHECK (message_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (
    status IN ('PROCESSING', 'COMPLETED', 'FAILED', 'OUTCOME_UNKNOWN', 'PERSIST_PENDING')
  ),
  lease_token uuid,
  lease_expires_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count BETWEEN 1 AND 5),
  player_message_id uuid,
  coach_message_id uuid,
  provider text CHECK (provider IS NULL OR provider ~ '^[a-z0-9_-]{1,32}$'),
  model text CHECK (model IS NULL OR char_length(model) <= 128),
  last_error_code text CHECK (last_error_code IS NULL OR last_error_code ~ '^[A-Z0-9_]{1,64}$'),
  pending_reply text CHECK (pending_reply IS NULL OR char_length(pending_reply) <= 20000),
  pending_context_type text CHECK (pending_context_type IS NULL OR char_length(pending_context_type) <= 255),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT coach_reservation_completed_has_messages CHECK (
    status <> 'COMPLETED' OR (player_message_id IS NOT NULL AND coach_message_id IS NOT NULL AND completed_at IS NOT NULL)
  ),
  CONSTRAINT coach_reservation_pending_has_reply CHECK (
    status <> 'PERSIST_PENDING' OR pending_reply IS NOT NULL
  ),
  CONSTRAINT coach_reservation_processing_has_lease CHECK (
    status NOT IN ('PROCESSING', 'PERSIST_PENDING') OR (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS coach_request_reservations_player_idx
  ON public.coach_request_reservations (player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS coach_request_reservations_open_idx
  ON public.coach_request_reservations (status, lease_expires_at)
  WHERE status IN ('PROCESSING', 'PERSIST_PENDING', 'OUTCOME_UNKNOWN');

ALTER TABLE public.coach_request_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coach_request_reservations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_request_reservations TO service_role;

-- ---------------------------------------------------------------------------------------
-- Claim: atomic acquisition. INSERT .. ON CONFLICT DO NOTHING decides the single owner of a
-- new id; for an existing id the row is locked (FOR UPDATE) before any state decision, so
-- two claimers are serialized by PostgreSQL itself.
-- outcome ∈ ACQUIRED | PERSIST_TAKEOVER | REPLAY | IN_PROGRESS | CONFLICT | OUTCOME_UNKNOWN
--         | FAILED_FINAL | NOT_OWNER
-- A CONFLICT returns no other column (nothing about another account leaks).
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.coach_claim_request(
  p_request_id uuid,
  p_user_id uuid,
  p_player_id uuid,
  p_conversation_id uuid,
  p_message_sha256 text,
  p_lease_seconds integer DEFAULT 120
)
RETURNS TABLE (
  outcome text,
  lease_token uuid,
  attempt_count integer,
  conversation_id uuid,
  player_message_id uuid,
  coach_message_id uuid,
  pending_reply text,
  pending_context_type text
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  r public.coach_request_reservations%ROWTYPE;
  v_token uuid := gen_random_uuid();
  v_lease interval := make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 120), 600)));
BEGIN
  IF p_request_id IS NULL OR p_user_id IS NULL OR p_player_id IS NULL
     OR p_message_sha256 IS NULL OR p_message_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'COACH_CLAIM_INVALID' USING ERRCODE = '22023';
  END IF;
  -- Identity: the player must belong to the user the server authenticated.
  IF NOT EXISTS (SELECT 1 FROM public.player_profiles p WHERE p.id = p_player_id AND p.user_id = p_user_id) THEN
    RETURN QUERY SELECT 'NOT_OWNER'::text, NULL::uuid, NULL::integer, NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::text;
    RETURN;
  END IF;
  -- The conversation, when given, must belong to that player.
  IF p_conversation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.coach_conversations c WHERE c.id = p_conversation_id AND c.player_id = p_player_id
  ) THEN
    RETURN QUERY SELECT 'NOT_OWNER'::text, NULL::uuid, NULL::integer, NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::text;
    RETURN;
  END IF;
  -- A message created before this table existed (Fase 3.3 used the request id as the
  -- question's id): never claimable again. Same owner → REPLAY when answered; else CONFLICT.
  IF NOT EXISTS (SELECT 1 FROM public.coach_request_reservations x WHERE x.request_id = p_request_id)
     AND EXISTS (SELECT 1 FROM public.coach_messages m WHERE m.id = p_request_id) THEN
    RETURN QUERY
      SELECT CASE WHEN c.player_id = p_player_id AND reply.id IS NOT NULL THEN 'REPLAY'
                  WHEN c.player_id = p_player_id THEN 'OUTCOME_UNKNOWN'
                  ELSE 'CONFLICT' END,
             NULL::uuid, NULL::integer,
             CASE WHEN c.player_id = p_player_id THEN c.id END,
             CASE WHEN c.player_id = p_player_id THEN m.id END,
             CASE WHEN c.player_id = p_player_id THEN reply.id END,
             NULL::text, NULL::text
        FROM public.coach_messages m
        JOIN public.coach_conversations c ON c.id = m.conversation_id
        LEFT JOIN LATERAL (
          SELECT rm.id FROM public.coach_messages rm
           WHERE rm.conversation_id = m.conversation_id AND rm.context_id = p_request_id AND rm.role = 'coach'
           ORDER BY rm.created_at LIMIT 1
        ) reply ON true
       WHERE m.id = p_request_id;
    RETURN;
  END IF;

  INSERT INTO public.coach_request_reservations AS t
    (request_id, user_id, player_id, conversation_id, message_sha256, status, lease_token, lease_expires_at)
  VALUES
    (p_request_id, p_user_id, p_player_id, p_conversation_id, p_message_sha256, 'PROCESSING', v_token, now() + v_lease)
  ON CONFLICT (request_id) DO NOTHING;
  IF FOUND THEN
    RETURN QUERY SELECT 'ACQUIRED'::text, v_token, 1, p_conversation_id, NULL::uuid, NULL::uuid, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT * INTO r FROM public.coach_request_reservations x WHERE x.request_id = p_request_id FOR UPDATE;
  IF r.user_id <> p_user_id OR r.player_id <> p_player_id OR r.message_sha256 <> p_message_sha256
     OR r.conversation_id IS DISTINCT FROM coalesce(p_conversation_id, r.conversation_id) THEN
    RETURN QUERY SELECT 'CONFLICT'::text, NULL::uuid, NULL::integer, NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF r.status = 'COMPLETED' THEN
    RETURN QUERY SELECT 'REPLAY'::text, NULL::uuid, r.attempt_count, r.conversation_id, r.player_message_id, r.coach_message_id, NULL::text, NULL::text;
  ELSIF r.status = 'PROCESSING' AND r.lease_expires_at > now() THEN
    RETURN QUERY SELECT 'IN_PROGRESS'::text, NULL::uuid, r.attempt_count, NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::text;
  ELSIF r.status = 'PROCESSING' THEN
    -- The holder vanished after possibly calling the provider: never a blind second call.
    UPDATE public.coach_request_reservations x
       SET status = 'OUTCOME_UNKNOWN', last_error_code = 'LEASE_EXPIRED', updated_at = now()
     WHERE x.request_id = p_request_id;
    RETURN QUERY SELECT 'OUTCOME_UNKNOWN'::text, NULL::uuid, r.attempt_count, NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::text;
  ELSIF r.status = 'PERSIST_PENDING' AND r.lease_expires_at > now() THEN
    RETURN QUERY SELECT 'IN_PROGRESS'::text, NULL::uuid, r.attempt_count, NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::text;
  ELSIF r.status = 'PERSIST_PENDING' THEN
    -- Takeover to PERSIST the kept reply: no generation, new fencing token.
    UPDATE public.coach_request_reservations x
       SET lease_token = v_token, lease_expires_at = now() + v_lease,
           attempt_count = least(x.attempt_count + 1, 5), updated_at = now()
     WHERE x.request_id = p_request_id;
    RETURN QUERY SELECT 'PERSIST_TAKEOVER'::text, v_token, least(r.attempt_count + 1, 5), r.conversation_id, NULL::uuid, NULL::uuid, r.pending_reply, r.pending_context_type;
  ELSIF r.status = 'FAILED' AND r.attempt_count < 5 THEN
    UPDATE public.coach_request_reservations x
       SET status = 'PROCESSING', lease_token = v_token, lease_expires_at = now() + v_lease,
           attempt_count = x.attempt_count + 1, last_error_code = NULL, updated_at = now()
     WHERE x.request_id = p_request_id;
    RETURN QUERY SELECT 'ACQUIRED'::text, v_token, r.attempt_count + 1, r.conversation_id, NULL::uuid, NULL::uuid, NULL::text, NULL::text;
  ELSIF r.status = 'FAILED' THEN
    RETURN QUERY SELECT 'FAILED_FINAL'::text, NULL::uuid, r.attempt_count, NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::text;
  ELSE
    RETURN QUERY SELECT 'OUTCOME_UNKNOWN'::text, NULL::uuid, r.attempt_count, NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::text;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------------------
-- Complete: question + reply + COMPLETED in one transaction, fenced by the lease token.
-- A late answer from the ORIGINAL holder may also resolve OUTCOME_UNKNOWN (its token is
-- still the current one: nobody else generated). Any other state/token → COACH_LEASE_LOST.
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.coach_complete_request(
  p_request_id uuid,
  p_lease_token uuid,
  p_title text,
  p_question text,
  p_reply text,
  p_context_type text,
  p_provider text,
  p_model text
)
RETURNS TABLE (
  conversation_id uuid,
  player_message_id uuid,
  player_created_at timestamptz,
  coach_message_id uuid,
  coach_created_at timestamptz
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  r public.coach_request_reservations%ROWTYPE;
  v_conversation uuid;
  v_player_at timestamptz;
  v_coach uuid;
  v_coach_at timestamptz;
BEGIN
  SELECT * INTO r FROM public.coach_request_reservations x WHERE x.request_id = p_request_id FOR UPDATE;
  IF NOT FOUND OR r.lease_token IS DISTINCT FROM p_lease_token
     OR r.status NOT IN ('PROCESSING', 'PERSIST_PENDING', 'OUTCOME_UNKNOWN') THEN
    RAISE EXCEPTION 'COACH_LEASE_LOST' USING ERRCODE = '40001';
  END IF;
  IF p_reply IS NULL OR btrim(p_reply) = '' OR p_question IS NULL OR btrim(p_question) = '' THEN
    RAISE EXCEPTION 'COACH_COMPLETE_INVALID' USING ERRCODE = '22023';
  END IF;

  v_conversation := r.conversation_id;
  IF v_conversation IS NULL THEN
    INSERT INTO public.coach_conversations (player_id, title)
    VALUES (r.player_id, left(p_title, 120))
    RETURNING id INTO v_conversation;
  ELSIF NOT EXISTS (SELECT 1 FROM public.coach_conversations c WHERE c.id = v_conversation AND c.player_id = r.player_id) THEN
    RAISE EXCEPTION 'COACH_CONVERSATION_GONE' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.coach_messages (id, conversation_id, role, content)
  VALUES (p_request_id, v_conversation, 'player', p_question)
  RETURNING created_at INTO v_player_at;

  INSERT INTO public.coach_messages (conversation_id, role, content, context_type, context_id)
  VALUES (v_conversation, 'coach', p_reply, left(p_context_type, 255), p_request_id)
  RETURNING id, created_at INTO v_coach, v_coach_at;

  UPDATE public.coach_conversations c SET updated_at = now() WHERE c.id = v_conversation;

  UPDATE public.coach_request_reservations x
     SET status = 'COMPLETED', conversation_id = v_conversation,
         player_message_id = p_request_id, coach_message_id = v_coach,
         -- A persist takeover passes no provider/model: keep what the generation recorded.
         provider = coalesce(nullif(p_provider, ''), x.provider),
         model = coalesce(nullif(p_model, ''), x.model),
         completed_at = now(), updated_at = now(),
         lease_token = NULL, lease_expires_at = NULL, pending_reply = NULL,
         pending_context_type = NULL, last_error_code = NULL
   WHERE x.request_id = p_request_id;

  RETURN QUERY SELECT v_conversation, p_request_id, v_player_at, v_coach, v_coach_at;
END;
$$;

-- Fail: only the current holder; FAILED (retryable) or OUTCOME_UNKNOWN (never retried).
CREATE OR REPLACE FUNCTION public.coach_fail_request(
  p_request_id uuid,
  p_lease_token uuid,
  p_status text,
  p_error_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF p_status NOT IN ('FAILED', 'OUTCOME_UNKNOWN') THEN
    RAISE EXCEPTION 'COACH_FAIL_INVALID' USING ERRCODE = '22023';
  END IF;
  UPDATE public.coach_request_reservations x
     SET status = p_status, last_error_code = left(p_error_code, 64), updated_at = now(),
         lease_expires_at = CASE WHEN p_status = 'FAILED' THEN NULL ELSE x.lease_expires_at END,
         lease_token = CASE WHEN p_status = 'FAILED' THEN NULL ELSE x.lease_token END
   WHERE x.request_id = p_request_id AND x.lease_token = p_lease_token AND x.status = 'PROCESSING';
  RETURN FOUND;
END;
$$;

-- Persist pending: keep a guarded reply whose final write failed, for a no-cost retry.
CREATE OR REPLACE FUNCTION public.coach_persist_pending(
  p_request_id uuid,
  p_lease_token uuid,
  p_reply text,
  p_context_type text,
  p_provider text,
  p_model text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.coach_request_reservations x
     SET status = 'PERSIST_PENDING', pending_reply = left(p_reply, 20000),
         pending_context_type = left(p_context_type, 255), provider = p_provider, model = p_model,
         -- Immediately takeoverable by the next retry (which only persists).
         lease_expires_at = now(), last_error_code = 'PERSIST_FAILED', updated_at = now()
   WHERE x.request_id = p_request_id AND x.lease_token = p_lease_token
     AND x.status IN ('PROCESSING', 'PERSIST_PENDING');
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.coach_claim_request(uuid, uuid, uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.coach_complete_request(uuid, uuid, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.coach_fail_request(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.coach_persist_pending(uuid, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coach_claim_request(uuid, uuid, uuid, uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.coach_complete_request(uuid, uuid, text, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.coach_fail_request(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.coach_persist_pending(uuid, uuid, text, text, text, text) TO service_role;
