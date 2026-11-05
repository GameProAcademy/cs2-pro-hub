-- Fase 4.0.1 B — how the player wants the AI Coach to call them (optional).
--
-- One additive, nullable column on the player's own coach_preferences row: same RLS
-- (coach_preferences_own → owns_player), same lifecycle (deleted with the row and with the
-- player profile). It is a preference, never a measurement, and it never holds an e-mail,
-- a link, an id or markup: the CHECK mirrors sanitizeCoachName (src/lib/coach/coachPersona.ts),
-- which the server applies first. Idempotent.
--
-- Rollback: ALTER TABLE public.coach_preferences DROP COLUMN IF EXISTS preferred_name;
-- (the web build reads the column defensively: absent → field hidden, Coach falls back to
-- the nickname / display name / "you").

ALTER TABLE public.coach_preferences
  ADD COLUMN IF NOT EXISTS preferred_name text;

ALTER TABLE public.coach_preferences
  DROP CONSTRAINT IF EXISTS coach_preferences_preferred_name_check;
ALTER TABLE public.coach_preferences
  ADD CONSTRAINT coach_preferences_preferred_name_check CHECK (
    preferred_name IS NULL OR (
      char_length(preferred_name) BETWEEN 1 AND 32
      AND preferred_name = btrim(preferred_name)
      AND preferred_name !~ '[@<>*_`#|\\{}\[\]]'
      AND preferred_name !~ '[[:cntrl:]]'
      AND preferred_name !~ '[0-9]{7,}'
      AND preferred_name !~* 'https?:|www\.'
    )
  );
