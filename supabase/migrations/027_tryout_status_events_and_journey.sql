-- 027 · Jornada do lead: histórico de status dos agendamentos e função de leitura.
-- 1. tryout_status_events: uma linha a cada mudança de status (gatilho), com a hora.
--    Histórico anterior reconstruído com as datas que existiam (source = 'backfill').
-- 2. manager_lead_journey(p_days): datas de cada etapa por lead, para o dashboard
--    do Manager App (contato no chat, agendamento, teste, aprovação, Tecnofit).
begin;

create table if not exists public.tryout_status_events (
  id bigserial primary key,
  tryout_id uuid not null references public.tryouts(id) on delete cascade,
  status text not null,
  changed_at timestamptz not null default now(),
  changed_by uuid,
  source text not null default 'trigger'
);
create index if not exists tryout_status_events_tryout_idx on public.tryout_status_events(tryout_id, changed_at);
alter table public.tryout_status_events enable row level security;
revoke all on public.tryout_status_events from public, anon, authenticated;

create or replace function private.tryout_status_log()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.tryout_status_events (tryout_id, status, changed_at, changed_by)
      values (new.id, coalesce(new.status, 'PENDING'), now(), (select auth.uid()));
  end if;
  return new;
end;
$$;
drop trigger if exists tryouts_status_log on public.tryouts;
create trigger tryouts_status_log after insert or update of status on public.tryouts
  for each row execute function private.tryout_status_log();

-- Histórico reconstruído (só uma vez)
insert into public.tryout_status_events (tryout_id, status, changed_at, source)
select t.id, 'CREATED', t.created_at, 'backfill' from public.tryouts t
where t.created_at is not null and not exists (select 1 from public.tryout_status_events e where e.tryout_id = t.id);
insert into public.tryout_status_events (tryout_id, status, changed_at, source)
select t.id, 'IN_REGISTRATION', t.approved_at, 'backfill' from public.tryouts t
where t.approved_at is not null
  and not exists (select 1 from public.tryout_status_events e where e.tryout_id = t.id and e.status = 'IN_REGISTRATION');
insert into public.tryout_status_events (tryout_id, status, changed_at, source)
select t.id, t.status, coalesce(t.updated_at, t.created_at), 'backfill' from public.tryouts t
where t.status in ('TECNOFIT', 'MISSED', 'CANCELLED', 'IN_EVALUATION')
  and not exists (select 1 from public.tryout_status_events e where e.tryout_id = t.id and e.status = t.status);

-- Jornada por lead (administração e quem vê agendamentos no Huddle)
create or replace function public.manager_lead_journey(p_days integer default 90)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_admin() or coalesce(private.v2_can('bookings', 'view'), false)) then
    raise exception 'Administração requerida' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id,
      'name', coalesce(nullif(trim(t.minor_name), ''), t.name),
      'team', t.target_team,
      'status', t.status,
      'phone', coalesce(t.whatsapp_phone, t.phone),
      'created_at', t.created_at,
      'contact_at', (select min(s.first_message_at) from public.v2_chat_sessions s where s.tryout_id = t.id),
      'scheduled_at', t.scheduled_at,
      'evaluated_at', (select min(e.changed_at) from public.tryout_status_events e where e.tryout_id = t.id and e.status in ('IN_EVALUATION','IN_REGISTRATION','TECNOFIT','MISSED','CANCELLED') and e.source = 'trigger'),
      'approved_at', coalesce(t.approved_at, (select min(e.changed_at) from public.tryout_status_events e where e.tryout_id = t.id and e.status = 'IN_REGISTRATION')),
      'tecnofit_at', (select min(e.changed_at) from public.tryout_status_events e where e.tryout_id = t.id and e.status = 'TECNOFIT'),
      'closed_at', (select max(e.changed_at) from public.tryout_status_events e where e.tryout_id = t.id and e.status in ('MISSED','CANCELLED')),
      'archived', t.archived_at is not null
    ) order by t.created_at desc)
    from public.tryouts t
    where t.created_at >= now() - make_interval(days => greatest(1, least(p_days, 365)))
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.manager_lead_journey(integer) from public, anon;
grant execute on function public.manager_lead_journey(integer) to authenticated;

commit;
