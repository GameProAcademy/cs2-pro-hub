-- PM5 / Fase 4.2.9 — adaptive training plans (module H).
--
-- New tables instead of the legacy `training_plans` / `training_plan_items` (initial schema, never
-- written: 0 rows; horizon CHECK 30/60/90; no versions, sessions or evidence). The legacy tables
-- stay untouched (the admin view still reads them).
--
--   adaptive_training_plans          one plan per row; at most one ACTIVE/PAUSED plan per user.
--   adaptive_training_plan_versions  immutable versions (content = priorities with evidence,
--                                    sessions, goals; diff = what changed and why). A revision
--                                    or an edit adds a version; nothing is overwritten.
--   adaptive_training_sessions       scheduled sessions of a version; DONE / SKIPPED only by an
--                                    explicit action of the player; superseded sessions are kept.
-- Players read their own rows; every write goes through the server (service role) with the
-- owner taken from the session — the plan content is computed by the backend, never sent by the
-- browser.
--
-- Rollback (nothing existing is altered):
--   DROP TABLE IF EXISTS public.adaptive_training_sessions, public.adaptive_training_plan_versions,
--     public.adaptive_training_plans;

CREATE TABLE IF NOT EXISTS public.adaptive_training_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  horizon smallint NOT NULL CHECK (horizon IN (7, 30, 90)),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED')),
  active_version integer NOT NULL DEFAULT 1 CHECK (active_version >= 1),
  start_date date NOT NULL DEFAULT current_date,
  pause_reason text CHECK (pause_reason IS NULL OR char_length(pause_reason) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS adaptive_training_plans_one_open_idx
  ON public.adaptive_training_plans (user_id) WHERE status IN ('ACTIVE', 'PAUSED');
CREATE INDEX IF NOT EXISTS adaptive_training_plans_user_idx ON public.adaptive_training_plans (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.adaptive_training_plan_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.adaptive_training_plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1),
  reason text NOT NULL CHECK (reason IN ('CREATED', 'REVISION', 'USER_EDIT')),
  content jsonb NOT NULL,
  diff jsonb,
  method_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, version)
);

CREATE TABLE IF NOT EXISTS public.adaptive_training_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.adaptive_training_plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1),
  session_index integer NOT NULL CHECK (session_index >= 0),
  scheduled_on date NOT NULL,
  area text NOT NULL CHECK (area ~ '^[a-z_]{1,32}$'),
  exercise_id text NOT NULL CHECK (exercise_id ~ '^[a-z_]{1,48}$'),
  minutes smallint NOT NULL CHECK (minutes BETWEEN 5 AND 180),
  status text NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'DONE', 'SKIPPED', 'SUPERSEDED')),
  duration_minutes smallint CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 1 AND 300),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, version, session_index),
  CONSTRAINT adaptive_training_sessions_done_has_time CHECK (status <> 'DONE' OR completed_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS adaptive_training_sessions_plan_idx
  ON public.adaptive_training_sessions (plan_id, scheduled_on);

ALTER TABLE public.adaptive_training_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_training_plan_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_training_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.adaptive_training_plans, public.adaptive_training_plan_versions,
  public.adaptive_training_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.adaptive_training_plans, public.adaptive_training_plan_versions,
  public.adaptive_training_sessions TO authenticated;
GRANT ALL ON public.adaptive_training_plans, public.adaptive_training_plan_versions,
  public.adaptive_training_sessions TO service_role;

DROP POLICY IF EXISTS adaptive_training_plans_select_own ON public.adaptive_training_plans;
CREATE POLICY adaptive_training_plans_select_own ON public.adaptive_training_plans FOR SELECT TO authenticated
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS adaptive_training_plan_versions_select_own ON public.adaptive_training_plan_versions;
CREATE POLICY adaptive_training_plan_versions_select_own ON public.adaptive_training_plan_versions FOR SELECT TO authenticated
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS adaptive_training_sessions_select_own ON public.adaptive_training_sessions;
CREATE POLICY adaptive_training_sessions_select_own ON public.adaptive_training_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE public.adaptive_training_plans IS 'PM5 module H: adaptive training plan (7/30/90 days); server-written.';
COMMENT ON TABLE public.adaptive_training_plan_versions IS 'PM5 module H: immutable plan versions with evidence and diff.';
COMMENT ON TABLE public.adaptive_training_sessions IS 'PM5 module H: scheduled sessions; DONE/SKIPPED only by explicit player action.';
