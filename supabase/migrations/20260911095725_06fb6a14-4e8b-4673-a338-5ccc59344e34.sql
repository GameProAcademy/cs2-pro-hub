-- FASE 2.7.2A — o vínculo do jogador é um ESTADO, não uma falha da partida.
-- A canonicalização passa a acontecer sem Steam ID; o job registra
-- explicitamente se a projeção por jogador foi vinculada, por qual método,
-- com qual confiança e, quando não vinculada, o motivo real.
alter table public.demo_jobs
  add column if not exists attachment_state text not null default 'unattached',
  add column if not exists attachment_method text,
  add column if not exists attachment_confidence numeric,
  add column if not exists attachment_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.demo_jobs'::regclass
      and conname = 'demo_jobs_attachment_state_check'
  ) then
    alter table public.demo_jobs
      add constraint demo_jobs_attachment_state_check
      check (attachment_state = any (array['attached'::text, 'unattached'::text]));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.demo_jobs'::regclass
      and conname = 'demo_jobs_attachment_method_check'
  ) then
    alter table public.demo_jobs
      add constraint demo_jobs_attachment_method_check
      check (attachment_method is null or attachment_method = 'steam_id_profile');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.demo_jobs'::regclass
      and conname = 'demo_jobs_attachment_confidence_check'
  ) then
    alter table public.demo_jobs
      add constraint demo_jobs_attachment_confidence_check
      check (attachment_confidence is null
             or (attachment_confidence >= 0 and attachment_confidence <= 1));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.demo_jobs'::regclass
      and conname = 'demo_jobs_attachment_reason_check'
  ) then
    alter table public.demo_jobs
      add constraint demo_jobs_attachment_reason_check
      check (attachment_reason is null or attachment_reason = any (array[
        'no_player_profile'::text,
        'no_steam_id_on_profile'::text,
        'steam_id_not_in_demo'::text
      ]));
  end if;

  -- Coerência: vinculado exige método; não vinculado nunca carrega método.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.demo_jobs'::regclass
      and conname = 'demo_jobs_attachment_coherence_check'
  ) then
    alter table public.demo_jobs
      add constraint demo_jobs_attachment_coherence_check
      check (
        (attachment_state = 'attached' and attachment_method is not null and attachment_reason is null)
        or (attachment_state = 'unattached' and attachment_method is null)
      );
  end if;
end
$$;

comment on column public.demo_jobs.attachment_state is
  'FASE 2.7.2A: se a partida canônica foi vinculada ao jogador do CS2 PRO. Nunca invalida a partida.';
comment on column public.demo_jobs.attachment_reason is
  'Motivo real da ausência de vínculo; nunca inferido de nickname.';