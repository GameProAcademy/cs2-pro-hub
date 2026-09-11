ALTER TABLE public.demo_jobs
  ADD COLUMN IF NOT EXISTS attachment_source text,
  ADD COLUMN IF NOT EXISTS attachment_confidence_label text,
  ADD COLUMN IF NOT EXISTS attachment_participant_key text,
  ADD COLUMN IF NOT EXISTS declared_participant_key text,
  ADD COLUMN IF NOT EXISTS declared_nickname text,
  ADD COLUMN IF NOT EXISTS observed_nickname text,
  ADD COLUMN IF NOT EXISTS attachment_declared_at timestamptz,
  ADD COLUMN IF NOT EXISTS attachment_declared_by uuid;

ALTER TABLE public.demo_jobs DROP CONSTRAINT IF EXISTS demo_jobs_attachment_state_check;
ALTER TABLE public.demo_jobs DROP CONSTRAINT IF EXISTS demo_jobs_attachment_method_check;
ALTER TABLE public.demo_jobs DROP CONSTRAINT IF EXISTS demo_jobs_attachment_reason_check;
ALTER TABLE public.demo_jobs DROP CONSTRAINT IF EXISTS demo_jobs_attachment_coherence_check;

ALTER TABLE public.demo_jobs
  ADD CONSTRAINT demo_jobs_attachment_state_check
  CHECK (attachment_state = ANY (ARRAY['attached','unattached','conflict']));

ALTER TABLE public.demo_jobs
  ADD CONSTRAINT demo_jobs_attachment_method_check
  CHECK (attachment_method IS NULL OR attachment_method = ANY (ARRAY[
    'steam_id_profile','steam_id_confirmed','self_declared_player','self_declared_nickname'
  ]));

ALTER TABLE public.demo_jobs
  ADD CONSTRAINT demo_jobs_attachment_reason_check
  CHECK (attachment_reason IS NULL OR attachment_reason = ANY (ARRAY[
    'no_player_profile','no_steam_id_on_profile','steam_id_not_in_demo',
    'self_declared_nickname_not_found','ambiguous_nickname','user_not_selected','identity_conflict'
  ]));

ALTER TABLE public.demo_jobs
  ADD CONSTRAINT demo_jobs_attachment_source_check
  CHECK (attachment_source IS NULL OR attachment_source = ANY (ARRAY['system','user']));

ALTER TABLE public.demo_jobs
  ADD CONSTRAINT demo_jobs_attachment_confidence_label_check
  CHECK (attachment_confidence_label IS NULL OR attachment_confidence_label = ANY (ARRAY[
    'high','user_confirmed','low','unresolved'
  ]));

-- A method belongs to an attached state; a reason belongs to a non-attached one.
ALTER TABLE public.demo_jobs
  ADD CONSTRAINT demo_jobs_attachment_coherence_check
  CHECK (
    (attachment_state = 'attached' AND attachment_method IS NOT NULL AND attachment_reason IS NULL)
    OR (attachment_state <> 'attached' AND attachment_method IS NULL)
  );

-- Only one declaration shape at a time: a chosen player OR a declared nickname.
ALTER TABLE public.demo_jobs
  ADD CONSTRAINT demo_jobs_declaration_shape_check
  CHECK (declared_participant_key IS NULL OR declared_nickname IS NULL);

CREATE INDEX IF NOT EXISTS demo_jobs_attachment_state_idx
  ON public.demo_jobs (user_id, attachment_state);