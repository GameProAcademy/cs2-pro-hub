-- PM2 Fase 4.2.3: player feedback on the death review, stored apart from the diagnosis.
--
-- A player can say whether a rule signal (or the death review as a whole) was useful, not
-- useful, or incorrect, with an optional short note. Feedback never changes a rule outcome or
-- the canonical data; it is kept for the product to review the rule catalog (cs2.death-rules.vN).
--
-- Ownership: a row belongs to its author (user_id = auth.uid()) and may only reference a kill
-- event in which the author's own participant is the victim (public.owns_death_event). Another
-- user's row is never readable or writable.
--
-- Stable key: canonical persistence rewrites a match's round_events (DELETE + INSERT) when a match
-- is re-observed, so event ids are not stable. A death is identified by (match_id, round_number,
-- death_tick); round_event_id is kept only as the id observed at write time (no foreign key, so a
-- rewrite neither deletes the player's feedback nor blocks the canonical rewrite). The service role keeps full access (server-side
-- review). Additive and idempotent; nothing is backfilled.
BEGIN;

CREATE TABLE IF NOT EXISTS public.death_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  round_event_id uuid NOT NULL,
  round_number integer NOT NULL,
  death_tick integer NOT NULL,
  rule_id text,
  rules_version text NOT NULL,
  verdict text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT death_feedback_rule_id_shape CHECK (rule_id IS NULL OR rule_id ~ '^[A-Z][A-Z_]{2,39}$'),
  CONSTRAINT death_feedback_rules_version_shape CHECK (rules_version ~ '^cs2\.death-rules\.v[0-9]{1,3}$'),
  CONSTRAINT death_feedback_verdict CHECK (verdict IN ('USEFUL', 'NOT_USEFUL', 'INCORRECT')),
  CONSTRAINT death_feedback_note_length CHECK (note IS NULL OR char_length(note) <= 500),
  CONSTRAINT death_feedback_death_ref CHECK (round_number >= 0 AND death_tick >= 0)
);

-- One opinion per author, death and rule (NULL rule = the death review as a whole).
CREATE UNIQUE INDEX IF NOT EXISTS death_feedback_one_per_rule
  ON public.death_feedback (user_id, match_id, round_number, death_tick, coalesce(rule_id, ''));
CREATE INDEX IF NOT EXISTS death_feedback_match_idx ON public.death_feedback (match_id);

-- True when the kill event is in the given match, at the given round and tick, and its victim is
-- the caller's own participant.
CREATE OR REPLACE FUNCTION public.owns_death_event(
  _round_event_id uuid, _match_id uuid, _round_number integer, _death_tick integer)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.round_events re
      JOIN public.match_participants mp
        ON mp.match_id = re.match_id AND mp.participant_key = re.victim_steam_id
      JOIN public.player_profiles p ON p.id = mp.internal_player_id
     WHERE re.id = _round_event_id
       AND re.match_id = _match_id
       AND re.round_number = _round_number
       AND re.tick = _death_tick
       AND re.event_type = 'kill'
       AND p.user_id = auth.uid()
  );
$$;
REVOKE ALL ON FUNCTION public.owns_death_event(uuid, uuid, integer, integer) FROM PUBLIC;
-- Supabase default privileges grant EXECUTE to anon on new functions; revoke it explicitly.
REVOKE ALL ON FUNCTION public.owns_death_event(uuid, uuid, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.owns_death_event(uuid, uuid, integer, integer) TO authenticated, service_role;

-- user_id, match and event are immutable after insert; updated_at is maintained.
CREATE OR REPLACE FUNCTION public.guard_death_feedback_update()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.match_id IS DISTINCT FROM OLD.match_id
     OR NEW.round_event_id IS DISTINCT FROM OLD.round_event_id
     OR NEW.round_number IS DISTINCT FROM OLD.round_number
     OR NEW.death_tick IS DISTINCT FROM OLD.death_tick
     OR NEW.rule_id IS DISTINCT FROM OLD.rule_id THEN
    RAISE EXCEPTION 'DEATH_FEEDBACK_KEY_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS death_feedback_guard ON public.death_feedback;
CREATE TRIGGER death_feedback_guard BEFORE UPDATE ON public.death_feedback
  FOR EACH ROW EXECUTE FUNCTION public.guard_death_feedback_update();

ALTER TABLE public.death_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.death_feedback FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.death_feedback TO authenticated;
GRANT ALL ON public.death_feedback TO service_role;

DROP POLICY IF EXISTS death_feedback_select_own ON public.death_feedback;
CREATE POLICY death_feedback_select_own ON public.death_feedback
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS death_feedback_insert_own ON public.death_feedback;
CREATE POLICY death_feedback_insert_own ON public.death_feedback
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.owns_death_event(round_event_id, match_id, round_number, death_tick));

DROP POLICY IF EXISTS death_feedback_update_own ON public.death_feedback;
CREATE POLICY death_feedback_update_own ON public.death_feedback
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND public.owns_death_event(round_event_id, match_id, round_number, death_tick));

DROP POLICY IF EXISTS death_feedback_delete_own ON public.death_feedback;
CREATE POLICY death_feedback_delete_own ON public.death_feedback
  FOR DELETE TO authenticated USING (user_id = auth.uid());

COMMIT;
