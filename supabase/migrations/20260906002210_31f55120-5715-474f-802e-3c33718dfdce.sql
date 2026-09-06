-- =============================================================
-- FASE 2.5.2C — atomic Steam link/unlink, atomic start throttle,
-- and leased/idempotent transactional email delivery.
-- =============================================================

-- ---------- 1. Email delivery log: lease + accepted state ----------

ALTER TABLE public.email_delivery_logs
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

DO $$
DECLARE _c text;
BEGIN
  SELECT conname INTO _c
    FROM pg_constraint
   WHERE conrelid = 'public.email_delivery_logs'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF _c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.email_delivery_logs DROP CONSTRAINT %I', _c);
  END IF;
END $$;

ALTER TABLE public.email_delivery_logs
  ADD CONSTRAINT email_delivery_logs_status_check
  CHECK (status IN ('pending', 'accepted', 'sent', 'failed', 'skipped'));

CREATE INDEX IF NOT EXISTS email_delivery_logs_lease_idx
  ON public.email_delivery_logs (lease_expires_at)
  WHERE status = 'pending';

-- Atomic claim. Exactly one caller can hold a delivery at a time:
--   accepted/sent            -> never re-sent (permanent idempotency)
--   failed / skipped         -> may be retried
--   pending with live lease  -> blocked (a concurrent worker owns it)
--   pending with dead lease  -> recovered
CREATE OR REPLACE FUNCTION public.claim_email_delivery(
  _idempotency_key text,
  _kind text,
  _recipient text,
  _locale text,
  _subject text,
  _provider text,
  _user_id uuid DEFAULT NULL,
  _lease_seconds integer DEFAULT 120
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _id uuid;
  _status text;
  _attempts integer;
  _lease timestamptz := now() + make_interval(secs => GREATEST(COALESCE(_lease_seconds, 120), 10));
BEGIN
  IF _idempotency_key IS NULL OR length(btrim(_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'EMAIL_IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = '22023';
  END IF;

  -- Serialise concurrent claims of the same key.
  PERFORM pg_advisory_xact_lock(hashtext('public.claim_email_delivery'), hashtext(_idempotency_key));

  SELECT id, status, attempt_count INTO _id, _status, _attempts
    FROM public.email_delivery_logs
   WHERE idempotency_key = _idempotency_key
   FOR UPDATE;

  IF _id IS NULL THEN
    INSERT INTO public.email_delivery_logs
      (user_id, kind, recipient, locale, subject, provider, idempotency_key,
       status, attempt_count, lease_expires_at)
    VALUES (_user_id, _kind, _recipient, COALESCE(_locale, 'pt-BR'), _subject,
            COALESCE(_provider, 'none'), _idempotency_key, 'pending', 0, _lease)
    RETURNING id INTO _id;
    RETURN jsonb_build_object('claimed', true, 'log_id', _id, 'attempts', 0, 'reason', NULL);
  END IF;

  IF _status IN ('accepted', 'sent') THEN
    RETURN jsonb_build_object('claimed', false, 'log_id', _id, 'attempts', _attempts,
                              'reason', 'already_delivered');
  END IF;

  IF _status = 'pending'
     AND (SELECT lease_expires_at FROM public.email_delivery_logs WHERE id = _id) > now() THEN
    RETURN jsonb_build_object('claimed', false, 'log_id', _id, 'attempts', _attempts,
                              'reason', 'in_progress');
  END IF;

  UPDATE public.email_delivery_logs
     SET status = 'pending',
         provider = COALESCE(_provider, provider),
         subject = COALESCE(_subject, subject),
         locale = COALESCE(_locale, locale),
         lease_expires_at = _lease,
         updated_at = now()
   WHERE id = _id;

  RETURN jsonb_build_object('claimed', true, 'log_id', _id, 'attempts', COALESCE(_attempts, 0),
                            'reason', 'recovered');
END;
$$;

REVOKE ALL ON FUNCTION public.claim_email_delivery(text, text, text, text, text, text, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_email_delivery(text, text, text, text, text, text, uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.claim_email_delivery(text, text, text, text, text, text, uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_delivery(text, text, text, text, text, text, uuid, integer) TO service_role;

-- ---------- 2. Atomic Steam start throttle ----------

CREATE OR REPLACE FUNCTION public.claim_steam_link_slot(
  _user_id uuid,
  _window_seconds integer DEFAULT 600,
  _max_attempts integer DEFAULT 8
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE _recent integer;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'STEAM_USER_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'STEAM_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- Per-user serialisation: counting and deciding is one observation.
  PERFORM pg_advisory_xact_lock(hashtext('public.claim_steam_link_slot'), hashtext(_user_id::text));

  SELECT count(*) INTO _recent
    FROM public.steam_link_attempts
   WHERE user_id = _user_id
     AND created_at >= now() - make_interval(secs => GREATEST(COALESCE(_window_seconds, 600), 30));

  RETURN _recent < GREATEST(COALESCE(_max_attempts, 8), 1);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_steam_link_slot(uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_steam_link_slot(uuid, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.claim_steam_link_slot(uuid, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_steam_link_slot(uuid, integer, integer) TO service_role;

-- ---------- 3. Atomic Steam LINK ----------

CREATE OR REPLACE FUNCTION public.steam_link_commit(
  _user_id uuid,
  _player_id uuid,
  _steam_id text,
  _connection jsonb,
  _identity jsonb,
  _evidence jsonb DEFAULT '[]'::jsonb,
  _correlations jsonb DEFAULT '[]'::jsonb,
  _audit jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _connection_id uuid;
  _reconnected boolean := false;
  _owner uuid;
  _now timestamptz := now();
  _identity_id uuid;
  _row jsonb;
  _platform public.platform_kind;
  _existing_status public.identity_link_status;
  _existing_conf numeric;
BEGIN
  IF _user_id IS NULL OR _player_id IS NULL OR _steam_id IS NULL OR length(_steam_id) = 0 THEN
    RAISE EXCEPTION 'STEAM_INVALID_INPUT' USING ERRCODE = '22023';
  END IF;

  -- Never trust a caller-supplied user id over the session, when there is one.
  IF auth.uid() IS NOT NULL AND auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'STEAM_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- Ownership of the player profile.
  IF NOT EXISTS (
    SELECT 1 FROM public.player_profiles WHERE id = _player_id AND user_id = _user_id
  ) THEN
    RAISE EXCEPTION 'STEAM_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- Takeover protection: this SteamID64 may not belong to another player.
  SELECT player_id INTO _owner
    FROM public.player_connections
   WHERE source = 'steam' AND external_id = _steam_id
   LIMIT 1;
  IF _owner IS NOT NULL AND _owner <> _player_id THEN
    RAISE EXCEPTION 'STEAM_DUPLICATE_ACCOUNT' USING ERRCODE = '23505';
  END IF;

  SELECT player_id INTO _owner
    FROM public.player_identities
   WHERE platform = 'STEAM'::public.platform_kind AND external_id = _steam_id
   LIMIT 1;
  IF _owner IS NOT NULL AND _owner <> _player_id THEN
    RAISE EXCEPTION 'STEAM_DUPLICATE_ACCOUNT' USING ERRCODE = '23505';
  END IF;

  -- (E) connection upsert
  SELECT id INTO _connection_id
    FROM public.player_connections
   WHERE player_id = _player_id
     AND source = 'steam'
     AND connection_type = 'openid'::public.connection_type
   LIMIT 1;

  IF _connection_id IS NOT NULL THEN
    _reconnected := true;
    UPDATE public.player_connections
       SET external_id = _steam_id,
           external_username = _connection->>'external_username',
           profile_url = _connection->>'profile_url',
           profile_locator_type = _connection->>'profile_locator_type',
           profile_slug = _connection->>'profile_slug',
           metadata = COALESCE(_connection->'metadata', '{}'::jsonb),
           status = 'connected'::public.connection_status,
           connected_at = _now,
           disconnected_at = NULL,
           last_sync_status = NULL,
           last_sync_error = NULL,
           updated_at = _now
     WHERE id = _connection_id;
  ELSE
    INSERT INTO public.player_connections
      (player_id, source, connection_type, external_id, external_username, profile_url,
       profile_locator_type, profile_slug, metadata, status, connected_at, updated_at)
    VALUES (_player_id, 'steam', 'openid'::public.connection_type, _steam_id,
            _connection->>'external_username', _connection->>'profile_url',
            _connection->>'profile_locator_type', _connection->>'profile_slug',
            COALESCE(_connection->'metadata', '{}'::jsonb),
            'connected'::public.connection_status, _now, _now)
    RETURNING id INTO _connection_id;
  END IF;

  -- (F) identity upsert — verified because Steam itself validated the assertion
  SELECT id INTO _identity_id
    FROM public.player_identities
   WHERE player_id = _player_id AND platform = 'STEAM'::public.platform_kind
   LIMIT 1;

  IF _identity_id IS NOT NULL THEN
    UPDATE public.player_identities
       SET external_id = _steam_id,
           username = _identity->>'username',
           profile_url = _identity->>'profile_url',
           profile_locator_type = _identity->>'profile_locator_type',
           profile_slug = _identity->>'profile_slug',
           is_verified = true,
           identity_status = 'verified'::public.identity_link_status,
           confidence_score = 1,
           verification_method = 'openid',
           verified_at = _now,
           updated_at = _now
     WHERE id = _identity_id;
  ELSE
    INSERT INTO public.player_identities
      (player_id, platform, external_id, username, profile_url, profile_locator_type,
       profile_slug, is_verified, identity_status, confidence_score, verification_method,
       verified_at, updated_at)
    VALUES (_player_id, 'STEAM'::public.platform_kind, _steam_id, _identity->>'username',
            _identity->>'profile_url', _identity->>'profile_locator_type',
            _identity->>'profile_slug', true, 'verified'::public.identity_link_status, 1,
            'openid', _now, _now);
  END IF;

  -- (G) correlation evidence — part of THIS transaction, never best effort
  FOR _row IN SELECT value FROM jsonb_array_elements(COALESCE(_evidence, '[]'::jsonb)) LOOP
    INSERT INTO public.identity_correlation_evidence
      (user_id, identity_a_source, identity_a_id, identity_b_source, identity_b_id,
       attribute, match_type, confidence_score, evidence_value_hash, provenance, observed_at)
    VALUES (_user_id,
            _row->>'identity_a_source', _row->>'identity_a_id',
            _row->>'identity_b_source', _row->>'identity_b_id',
            _row->>'attribute', _row->>'match_type',
            COALESCE((_row->>'confidence_score')::numeric, 0),
            _row->>'evidence_value_hash', _row->>'provenance', _now);
  END LOOP;

  -- Cross-source status propagation (never downgrades a verified identity)
  FOR _row IN SELECT value FROM jsonb_array_elements(COALESCE(_correlations, '[]'::jsonb)) LOOP
    _platform := (_row->>'platform')::public.platform_kind;
    SELECT identity_status, confidence_score INTO _existing_status, _existing_conf
      FROM public.player_identities
     WHERE player_id = _player_id AND platform = _platform
     LIMIT 1;
    IF _existing_status IS NULL OR _existing_status = 'verified'::public.identity_link_status THEN
      CONTINUE;
    END IF;
    UPDATE public.player_identities
       SET identity_status = (_row->>'identity_status')::public.identity_link_status,
           confidence_score = GREATEST(COALESCE(_existing_conf, 0),
                                       COALESCE((_row->>'confidence_score')::numeric, 0)),
           updated_at = _now
     WHERE player_id = _player_id AND platform = _platform;
  END LOOP;

  -- (H) audit is MANDATORY and inside the transaction
  INSERT INTO public.admin_audit_logs (admin_user_id, target_user_id, action, metadata)
  VALUES (_user_id, _user_id, 'steam_connection_created',
          COALESCE(_audit, '{}'::jsonb) || jsonb_build_object('reconnected', _reconnected));

  RETURN jsonb_build_object('connection_id', _connection_id, 'reconnected', _reconnected);
END;
$$;

REVOKE ALL ON FUNCTION public.steam_link_commit(uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.steam_link_commit(uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.steam_link_commit(uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.steam_link_commit(uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb) TO service_role;

-- ---------- 4. Atomic Steam UNLINK (non-destructive) ----------

CREATE OR REPLACE FUNCTION public.steam_unlink_commit(
  _user_id uuid,
  _player_id uuid,
  _audit jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _connection_id uuid;
  _external_id text;
  _now timestamptz := now();
BEGIN
  IF _user_id IS NULL OR _player_id IS NULL THEN
    RAISE EXCEPTION 'STEAM_INVALID_INPUT' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'STEAM_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.player_profiles WHERE id = _player_id AND user_id = _user_id
  ) THEN
    RAISE EXCEPTION 'STEAM_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT id, external_id INTO _connection_id, _external_id
    FROM public.player_connections
   WHERE player_id = _player_id
     AND source = 'steam'
     AND connection_type = 'openid'::public.connection_type
   LIMIT 1;

  IF _connection_id IS NULL THEN
    RETURN jsonb_build_object('disconnected', false, 'external_id', NULL);
  END IF;

  UPDATE public.player_connections
     SET status = 'disconnected'::public.connection_status,
         disconnected_at = _now,
         last_sync_status = NULL,
         last_sync_error = NULL,
         updated_at = _now
   WHERE id = _connection_id;

  -- History is preserved; only the ownership proof is revoked. A recorded
  -- conflict is never rewritten by an unlink.
  UPDATE public.player_identities
     SET is_verified = false,
         identity_status = CASE
           WHEN identity_status = 'conflict'::public.identity_link_status
             THEN identity_status
           ELSE 'correlated'::public.identity_link_status
         END,
         verification_method = NULL,
         verified_at = NULL,
         updated_at = _now
   WHERE player_id = _player_id AND platform = 'STEAM'::public.platform_kind;

  INSERT INTO public.admin_audit_logs (admin_user_id, target_user_id, action, metadata)
  VALUES (_user_id, _user_id, 'steam_connection_removed', COALESCE(_audit, '{}'::jsonb));

  RETURN jsonb_build_object('disconnected', true, 'external_id', _external_id);
END;
$$;

REVOKE ALL ON FUNCTION public.steam_unlink_commit(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.steam_unlink_commit(uuid, uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.steam_unlink_commit(uuid, uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.steam_unlink_commit(uuid, uuid, jsonb) TO service_role;