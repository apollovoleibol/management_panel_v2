-- 048 · Exceções de treino: substituição, cancelamento com motivo e reposição,
-- mudança pontual de horário e treino extra.
-- A grade semanal (teams.training_schedule) continua a base. private.v2_trainings
-- junta grade e exceções e devolve no máximo um treino por equipe e dia (nenhuma
-- equipe tem dois horários no mesmo dia e um treino extra não pode cair em dia
-- que já tem treino). Escritas só pelas funções manager_* abaixo.
-- Desenho: Apollo Manager App/docs/superpowers/specs/2026-11-09-excecoes-de-treino-design.md
begin;

-- ─── 0. Auditoria: o gatilho grava em audit_logs sem esquema. Chamado de funções
-- com search_path vazio (como as abaixo), ele falhava com "audit_logs does not exist".
alter function public.audit_trigger() set search_path = public;

-- ─── 1. Cancelamento: motivo, atraso, minutos perdidos e reposição ───────────
alter table public.v2_training_cancellations
  add column if not exists reason text,
  add column if not exists note text,
  add column if not exists late boolean not null default false,
  add column if not exists lost_minutes integer not null default 0,
  add column if not exists makeup_required boolean not null default false,
  add column if not exists waived_by uuid references public.profiles(id),
  add column if not exists waived_at timestamptz;
alter table public.v2_training_cancellations drop constraint if exists v2_training_cancellations_reason_check;
alter table public.v2_training_cancellations add constraint v2_training_cancellations_reason_check
  check (reason is null or reason in ('court', 'weather', 'holiday', 'other'));
-- A observação (note) fica só para as funções da equipe técnica; famílias veem o motivo
grant select (reason, late, lost_minutes, makeup_required, waived_at) on public.v2_training_cancellations to authenticated;

-- ─── 2. Mudança de horário (change) e treino extra (extra) por data ──────────
create table if not exists public.v2_training_changes (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  training_date date not null,
  kind text not null check (kind in ('change', 'extra')),
  start_time time not null,
  end_time time not null,
  makeup_for date,
  reason text check (reason is null or length(reason) <= 200),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint v2_training_changes_time_check check (end_time > start_time),
  constraint v2_training_changes_makeup_check check (makeup_for is null or makeup_for <> training_date)
);
create unique index if not exists v2_training_changes_one_change
  on public.v2_training_changes(team_id, training_date) where kind = 'change';
create index if not exists v2_training_changes_team_date on public.v2_training_changes(team_id, training_date);
create index if not exists v2_training_changes_makeup
  on public.v2_training_changes(team_id, makeup_for) where makeup_for is not null;
alter table public.v2_training_changes enable row level security;
revoke all on public.v2_training_changes from public, anon, authenticated;
grant select (id, team_id, training_date, kind, start_time, end_time, makeup_for, created_at)
  on public.v2_training_changes to authenticated;
drop policy if exists v2_training_changes_read on public.v2_training_changes;
create policy v2_training_changes_read on public.v2_training_changes for select to authenticated using (
  private.v2_role() is not null or exists (
    select 1 from public.v2_athlete_access link
    join public.athletes athlete on athlete.id = link.athlete_id
    where link.user_id = (select auth.uid()) and athlete.team_id = v2_training_changes.team_id
  )
);

-- ─── 3. Substituto por equipe e data ─────────────────────────────────────────
create table if not exists public.v2_training_substitutes (
  team_id uuid not null references public.teams(id) on delete cascade,
  training_date date not null,
  substitute_id uuid not null references public.profiles(id),
  assigned_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (team_id, training_date)
);
create index if not exists v2_training_substitutes_sub on public.v2_training_substitutes(substitute_id, training_date);
alter table public.v2_training_substitutes enable row level security;
revoke all on public.v2_training_substitutes from public, anon, authenticated;
grant select on public.v2_training_substitutes to authenticated;
drop policy if exists v2_training_substitutes_read on public.v2_training_substitutes;
create policy v2_training_substitutes_read on public.v2_training_substitutes for select to authenticated
  using (private.v2_role() is not null);

-- ─── 4. Regras base (private) ────────────────────────────────────────────────
-- "Hoje" no fuso do clube (o banco roda em UTC)
create or replace function private.v2_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- Fim de um horário da grade; sem fim, início + duração padrão da equipe
create or replace function private.v2_slot_end(p_slot jsonb, p_default integer) returns time
language sql immutable set search_path = '' as $$
  select coalesce(nullif(p_slot->>'end', '')::time,
                  (p_slot->>'start')::time + make_interval(mins => coalesce(p_default, 90)));
$$;

-- Minutos de treino da grade da equipe numa data
create or replace function private.v2_grade_minutes(p_team uuid, p_date date) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(greatest(0, extract(epoch from (private.v2_slot_end(s, t.training_duration_min) - (s->>'start')::time)) / 60)), 0)::integer
  from public.teams t
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(t.training_schedule) = 'array' then t.training_schedule else '[]'::jsonb end) s
  where t.id = p_team and nullif(s->>'start', '') is not null and (s->>'day') ~ '^[0-6]$'
    and (s->>'day')::int = extract(dow from p_date)::int;
$$;

-- Treinos efetivos: grade (com a mudança do dia, se houver) + extras, marcando os cancelados
create or replace function private.v2_trainings(p_from date, p_to date)
returns table (team_id uuid, training_date date, start_time time, end_time time, minutes integer,
               source text, change_id uuid, makeup_for date, cancelled boolean)
language sql stable security definer set search_path = '' as $$
  with days as (
    select d::date as d from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
  ),
  grade as (
    select t.id as team_id, days.d, (s->>'start')::time as st, private.v2_slot_end(s, t.training_duration_min) as en
    from public.teams t
    cross join days
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(t.training_schedule) = 'array' then t.training_schedule else '[]'::jsonb end) s
    where t.is_active is true and nullif(s->>'start', '') is not null and (s->>'day') ~ '^[0-6]$'
      and (s->>'day')::int = extract(dow from days.d)::int
  ),
  base as (
    select g.team_id, g.d, coalesce(c.start_time, g.st) as st, coalesce(c.end_time, g.en) as en,
           case when c.id is null then 'grade' else 'change' end as src, c.id as cid, c.makeup_for as mf
    from grade g
    left join public.v2_training_changes c
      on c.team_id = g.team_id and c.training_date = g.d and c.kind = 'change'
    union all
    select x.team_id, x.training_date, x.start_time, x.end_time, 'extra', x.id, x.makeup_for
    from public.v2_training_changes x
    join public.teams t on t.id = x.team_id and t.is_active is true
    where x.kind = 'extra' and x.training_date between p_from and p_to
  )
  select b.team_id, b.d, b.st, b.en, greatest(0, extract(epoch from (b.en - b.st)) / 60)::integer,
         b.src, b.cid, b.mf,
         exists (select 1 from public.v2_training_cancellations k
                 where k.team_id = b.team_id and k.training_date = b.d)
  from base b;
$$;

-- Cancelamentos com a situação da reposição (calculada: reposição em dia depois
-- cancelado deixa de contar e a pendência volta sozinha)
create or replace function private.v2_cancellations(p_from date, p_to date)
returns table (team_id uuid, training_date date, reason text, note text, late boolean, lost_minutes integer,
               makeup_required boolean, waived boolean, covered integer, makeup_status text)
language sql stable security definer set search_path = '' as $$
  select k.team_id, k.training_date, k.reason, k.note, k.late, k.lost_minutes, k.makeup_required,
         k.waived_at is not null, cov.m,
         case when k.waived_at is not null then 'waived'
              when not k.makeup_required then 'none'
              when cov.m >= k.lost_minutes then 'scheduled'
              else 'pending' end
  from public.v2_training_cancellations k
  cross join lateral (
    select coalesce(sum(case when c.kind = 'extra'
                               then extract(epoch from (c.end_time - c.start_time)) / 60
                             else greatest(0, extract(epoch from (c.end_time - c.start_time)) / 60
                                              - private.v2_grade_minutes(c.team_id, c.training_date)) end), 0)::integer as m
    from public.v2_training_changes c
    where c.team_id = k.team_id and c.makeup_for = k.training_date
      and not exists (select 1 from public.v2_training_cancellations k2
                      where k2.team_id = c.team_id and k2.training_date = c.training_date)
  ) cov
  where k.training_date between p_from and p_to;
$$;

-- Gere a agenda da equipe: técnico da equipe, administração ou coordenação com edição
create or replace function private.v2_can_manage_team(p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.is_admin()
    or (private.v2_role() = 'coordination' and private.v2_can('teams', 'edit'))
    or (private.v2_role() = 'coach' and exists (
          select 1 from public.team_coaches tc where tc.team_id = p_team and tc.coach_id = (select auth.uid()))), false);
$$;

-- Faz a chamada: quem gere a equipe ou o substituto daquela data
create or replace function private.v2_can_call(p_team uuid, p_date date) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.v2_can_manage_team(p_team) or coalesce(private.v2_role() = 'coach' and exists (
    select 1 from public.v2_training_substitutes s
    where s.team_id = p_team and s.training_date = p_date and s.substitute_id = (select auth.uid())), false);
$$;

-- Técnico titular da equipe (o principal primeiro)
create or replace function private.v2_team_titular(p_team uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select tc.coach_id from public.team_coaches tc
  join public.profiles p on p.id = tc.coach_id and p.is_active is true
  where tc.team_id = p_team
  order by tc.is_head desc nulls last, tc.created_at
  limit 1;
$$;

-- Registro principal do treino no dia: o mais recente com presença; senão, o mais recente
create or replace function private.v2_main_log(p_team uuid, p_date date) returns uuid
language sql stable security definer set search_path = '' as $$
  select l.id from public.training_logs l
  where l.team_id = p_team
    and l.started_at >= (p_date::timestamp at time zone 'America/Sao_Paulo')
    and l.started_at < ((p_date + 1)::timestamp at time zone 'America/Sao_Paulo')
  order by exists (select 1 from public.attendance a where a.log_id = l.id) desc, l.created_at desc
  limit 1;
$$;

-- Folha do técnico já paga no mês da data
create or replace function private.v2_month_paid(p_coach uuid, p_date date) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_coach is not null and exists (
    select 1 from public.v2_coach_payouts p
    where p.coach_id = p_coach and p.month = date_trunc('month', p_date)::date);
$$;

-- Aviso no app (e no celular, pelo gatilho de notifications da migração 025)
create or replace function private.v2_notify(p_users uuid[], p_title text, p_body text, p_url text) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, type, title, body, data)
  select distinct u, 'training_change', p_title, p_body, jsonb_build_object('url', p_url)
  from unnest(p_users) u
  where u is not null and u is distinct from (select auth.uid());
$$;

revoke all on function private.v2_today(), private.v2_slot_end(jsonb, integer), private.v2_grade_minutes(uuid, date),
  private.v2_trainings(date, date), private.v2_cancellations(date, date), private.v2_can_manage_team(uuid),
  private.v2_can_call(uuid, date), private.v2_team_titular(uuid), private.v2_main_log(uuid, date),
  private.v2_month_paid(uuid, date), private.v2_notify(uuid[], text, text, text) from public, anon, authenticated;

-- ─── 5. Leitura para o Manager App ───────────────────────────────────────────
-- Treinos efetivos das equipes do técnico e das datas em que ele substitui
-- (administração e coordenação: todas), mais as reposições pendentes.
create or replace function public.manager_training_calendar(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_role text := private.v2_role();
  v_all boolean;
  v_today date := private.v2_today();
  v_result jsonb;
begin
  if v_uid is null or v_role is null then
    raise exception 'Acesso restrito à equipe técnica.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 120 then
    raise exception 'Período inválido (até 120 dias).';
  end if;
  v_all := v_role in ('admin', 'coordination');

  with tr as (
    select t.*, s.substitute_id,
      exists (select 1 from public.team_coaches tc where tc.team_id = t.team_id and tc.coach_id = v_uid) as is_titular
    from private.v2_trainings(p_from, p_to) t
    left join public.v2_training_substitutes s on s.team_id = t.team_id and s.training_date = t.training_date
  ),
  mine as (
    select tr.*, private.v2_main_log(tr.team_id, tr.training_date) as log_id
    from tr where v_all or tr.is_titular or tr.substitute_id = v_uid
  ),
  canc as (select * from private.v2_cancellations(p_from, p_to))
  select jsonb_build_object(
    'today', v_today,
    'trainings', coalesce((select jsonb_agg(jsonb_build_object(
        'team_id', m.team_id, 'team_name', t.name, 'team_color', t.color_hex,
        'date', m.training_date, 'start', to_char(m.start_time, 'HH24:MI'), 'end', to_char(m.end_time, 'HH24:MI'),
        'minutes', m.minutes, 'source', m.source, 'change_id', m.change_id, 'makeup_for', m.makeup_for,
        'grade_minutes', case when m.source = 'change' then private.v2_grade_minutes(m.team_id, m.training_date) end,
        'cancelled', m.cancelled,
        'cancel', case when m.cancelled then jsonb_build_object('reason', k.reason, 'note', k.note, 'late', k.late,
            'lost_minutes', k.lost_minutes, 'makeup_status', k.makeup_status,
            'missing', greatest(0, k.lost_minutes - k.covered)) end,
        'is_titular', m.is_titular,
        'titulars', (select string_agg(p.full_name, ', ' order by tc.is_head desc nulls last, p.full_name)
                     from public.team_coaches tc join public.profiles p on p.id = tc.coach_id and p.is_active is true
                     where tc.team_id = m.team_id),
        'substitute_id', m.substitute_id,
        'substitute_name', (select p.full_name from public.profiles p where p.id = m.substitute_id),
        'log_id', m.log_id,
        'has_call', exists (select 1 from public.attendance a where a.log_id = m.log_id),
        'conducted_by', lg.conductor,
        'conductor_name', (select p.full_name from public.profiles p where p.id = lg.conductor)
      ) order by m.training_date, m.start_time)
      from mine m
      join public.teams t on t.id = m.team_id
      left join canc k on k.team_id = m.team_id and k.training_date = m.training_date
      left join lateral (select coalesce(l.conducted_by, l.coach_id) as conductor
                         from public.training_logs l where l.id = m.log_id) lg on true), '[]'::jsonb),
    'pending_makeups', coalesce((select jsonb_agg(jsonb_build_object(
        'team_id', k.team_id, 'team_name', t.name, 'team_color', t.color_hex, 'date', k.training_date,
        'reason', k.reason, 'lost_minutes', k.lost_minutes, 'missing', greatest(0, k.lost_minutes - k.covered))
        order by k.training_date)
      from private.v2_cancellations(v_today - 60, v_today + 60) k
      join public.teams t on t.id = k.team_id and t.is_active is true
      where k.makeup_status = 'pending'
        and (v_all or exists (select 1 from public.team_coaches tc where tc.team_id = k.team_id and tc.coach_id = v_uid))),
      '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- Treinos de outras equipes (hoje e 2 dias antes) que o técnico pode assumir
create or replace function public.manager_open_trainings()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_today date := private.v2_today(); v_result jsonb;
begin
  if v_uid is null or coalesce(private.v2_role(), '') not in ('coach', 'admin') then
    raise exception 'Acesso restrito aos técnicos.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'team_id', t.team_id, 'team_name', tm.name, 'team_color', tm.color_hex, 'date', t.training_date,
      'start', to_char(t.start_time, 'HH24:MI'), 'end', to_char(t.end_time, 'HH24:MI'), 'minutes', t.minutes,
      'source', t.source, 'mine', s.substitute_id = v_uid,
      'titulars', (select string_agg(p.full_name, ', ' order by tc.is_head desc nulls last, p.full_name)
                   from public.team_coaches tc join public.profiles p on p.id = tc.coach_id and p.is_active is true
                   where tc.team_id = t.team_id)
    ) order by t.training_date desc, t.start_time), '[]'::jsonb)
  into v_result
  from private.v2_trainings(v_today - 2, v_today) t
  join public.teams tm on tm.id = t.team_id
  left join public.v2_training_substitutes s on s.team_id = t.team_id and s.training_date = t.training_date
  where not t.cancelled
    and not exists (select 1 from public.team_coaches tc where tc.team_id = t.team_id and tc.coach_id = v_uid)
    and (s.substitute_id is null or s.substitute_id = v_uid)
    and not exists (select 1 from public.attendance a where a.log_id = private.v2_main_log(t.team_id, t.training_date));
  return v_result;
end;
$$;

-- ─── 6. Cancelamento, restauração e reposição ────────────────────────────────
create or replace function public.manager_cancel_training(p_team uuid, p_date date, p_reason text, p_note text, p_makeup boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid()); v_today date := private.v2_today();
  v_tr record; v_lost integer; v_late boolean; v_req boolean;
begin
  if not private.v2_can_manage_team(p_team) then
    raise exception 'Só os técnicos da equipe ou a administração podem cancelar este treino.' using errcode = '42501';
  end if;
  if p_date is null or p_date < v_today - 7 or p_date > v_today + 90 then
    raise exception 'Cancele treinos de até 7 dias atrás ou até 90 dias à frente.';
  end if;
  if p_reason is null or p_reason not in ('court', 'weather', 'holiday', 'other') then
    raise exception 'Escolha o motivo do cancelamento.';
  end if;
  if p_reason = 'other' and coalesce(trim(p_note), '') = '' then
    raise exception 'Descreva o motivo do cancelamento.';
  end if;
  select * into v_tr from private.v2_trainings(p_date, p_date) t where t.team_id = p_team order by t.start_time limit 1;
  if not found then raise exception 'Esta equipe não tem treino neste dia.'; end if;
  if v_tr.cancelled then raise exception 'Este treino já está cancelado.'; end if;
  if private.v2_main_log(p_team, p_date) is not null then
    raise exception 'Este treino já tem chamada ou confirmação registrada e não pode ser cancelado.';
  end if;
  -- A parte que já é reposição de outro cancelamento não gera nova reposição
  v_lost := case
    when v_tr.makeup_for is not null and v_tr.source = 'extra' then 0
    when v_tr.makeup_for is not null and v_tr.source = 'change' then least(v_tr.minutes, private.v2_grade_minutes(p_team, p_date))
    else v_tr.minutes end;
  v_late := now() > ((p_date + v_tr.start_time) at time zone 'America/Sao_Paulo') - interval '24 hours';
  v_req := v_lost > 0 and (v_late or coalesce(p_makeup, false));
  insert into public.v2_training_cancellations
    (team_id, training_date, created_by, reason, note, late, lost_minutes, makeup_required)
  values (p_team, p_date, v_uid, p_reason, nullif(left(trim(coalesce(p_note, '')), 200), ''), v_late, v_lost, v_req);
  return jsonb_build_object('late', v_late, 'lost_minutes', v_lost, 'makeup_required', v_req);
end;
$$;

create or replace function public.manager_restore_training(p_team uuid, p_date date)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_today date := private.v2_today(); v_n integer;
begin
  if not private.v2_can_manage_team(p_team) then
    raise exception 'Só os técnicos da equipe ou a administração podem restaurar este treino.' using errcode = '42501';
  end if;
  if p_date is null or p_date < v_today - 7 then
    raise exception 'Só é possível desfazer cancelamentos dos últimos 7 dias.';
  end if;
  if not exists (select 1 from public.v2_training_cancellations k where k.team_id = p_team and k.training_date = p_date) then
    raise exception 'Este treino não está cancelado.';
  end if;
  if exists (select 1 from public.v2_training_changes c
             where c.team_id = p_team and c.makeup_for = p_date
               and private.v2_main_log(p_team, c.training_date) is not null) then
    raise exception 'A reposição deste treino já tem chamada; o cancelamento não pode ser desfeito.';
  end if;
  delete from public.v2_training_changes c where c.team_id = p_team and c.makeup_for = p_date;
  get diagnostics v_n = row_count;
  delete from public.v2_training_cancellations k where k.team_id = p_team and k.training_date = p_date;
  return v_n;
end;
$$;

-- Mudança de horário (change) ou treino extra (extra); p_makeup_for liga a reposição ao cancelamento
create or replace function public.manager_schedule_training(p_team uuid, p_date date, p_start time, p_end time,
  p_kind text, p_makeup_for date, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid()); v_today date := private.v2_today();
  v_tr record; v_found boolean; v_min integer; v_grade integer; v_id uuid;
begin
  if not private.v2_can_manage_team(p_team) then
    raise exception 'Só os técnicos da equipe ou a administração podem mudar a agenda desta equipe.' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('change', 'extra') then raise exception 'Tipo de mudança inválido.'; end if;
  if p_date is null or p_date < v_today - 7 or p_date > v_today + 60 then
    raise exception 'Escolha uma data entre 7 dias atrás e 60 dias à frente.';
  end if;
  if p_start is null or p_end is null or p_end <= p_start then
    raise exception 'O horário de término precisa ser depois do início.';
  end if;
  v_min := (extract(epoch from (p_end - p_start)) / 60)::integer;
  if v_min > 300 then raise exception 'Um treino pode ter no máximo 5 horas.'; end if;
  if exists (select 1 from public.v2_training_cancellations k where k.team_id = p_team and k.training_date = p_date) then
    raise exception 'Este dia está cancelado. Restaure o treino antes de marcar outro horário nele.';
  end if;
  select * into v_tr from private.v2_trainings(p_date, p_date) t where t.team_id = p_team order by t.start_time limit 1;
  v_found := found;
  if p_kind = 'change' and (not v_found or v_tr.source = 'extra') then
    raise exception 'Esta equipe não tem treino da grade neste dia. Use "Treino extra".';
  end if;
  if p_kind = 'extra' and v_found then
    raise exception 'Esta equipe já tem treino neste dia. Use "Mudar horário" para alterar ou estender.';
  end if;
  if p_makeup_for is not null then
    if p_makeup_for = p_date then raise exception 'A reposição precisa ser em outra data.'; end if;
    if not exists (select 1 from public.v2_training_cancellations k where k.team_id = p_team and k.training_date = p_makeup_for) then
      raise exception 'O treino a repor não está cancelado.';
    end if;
    if p_kind = 'change' then
      v_grade := private.v2_grade_minutes(p_team, p_date);
      if v_min <= v_grade then
        raise exception 'Para compensar, o novo horário precisa ser mais longo que o da grade (% min).', v_grade;
      end if;
    end if;
  end if;
  -- Treino do dia já registrado: acompanha o novo horário (bloqueado se a folha do mês já foi paga)
  if exists (select 1 from public.training_logs l
             where l.team_id = p_team
               and l.started_at >= (p_date::timestamp at time zone 'America/Sao_Paulo')
               and l.started_at < ((p_date + 1)::timestamp at time zone 'America/Sao_Paulo')
               and private.v2_month_paid(coalesce(l.conducted_by, l.coach_id), p_date)) then
    raise exception 'A folha deste mês já foi paga para quem conduziu o treino; ajuste com a administração.';
  end if;
  update public.training_logs l
    set started_at = (p_date + p_start) at time zone 'America/Sao_Paulo', duration_minutes = v_min
    where l.team_id = p_team
      and l.started_at >= (p_date::timestamp at time zone 'America/Sao_Paulo')
      and l.started_at < ((p_date + 1)::timestamp at time zone 'America/Sao_Paulo');
  if p_kind = 'change' then
    insert into public.v2_training_changes (team_id, training_date, kind, start_time, end_time, makeup_for, reason, created_by)
    values (p_team, p_date, 'change', p_start, p_end, p_makeup_for, nullif(left(trim(coalesce(p_reason, '')), 200), ''), v_uid)
    on conflict (team_id, training_date) where kind = 'change' do update
      set start_time = excluded.start_time, end_time = excluded.end_time, makeup_for = excluded.makeup_for,
          reason = excluded.reason, created_by = excluded.created_by, created_at = now()
    returning id into v_id;
  else
    insert into public.v2_training_changes (team_id, training_date, kind, start_time, end_time, makeup_for, reason, created_by)
    values (p_team, p_date, 'extra', p_start, p_end, p_makeup_for, nullif(left(trim(coalesce(p_reason, '')), 200), ''), v_uid)
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.manager_remove_training_change(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_c public.v2_training_changes; v_today date := private.v2_today();
begin
  select * into v_c from public.v2_training_changes where id = p_id;
  if not found then raise exception 'Mudança não encontrada.'; end if;
  if not private.v2_can_manage_team(v_c.team_id) then
    raise exception 'Só os técnicos da equipe ou a administração podem mudar a agenda desta equipe.' using errcode = '42501';
  end if;
  if v_c.training_date < v_today - 7 then
    raise exception 'Só é possível remover mudanças dos últimos 7 dias.';
  end if;
  if private.v2_main_log(v_c.team_id, v_c.training_date) is not null then
    raise exception 'Este treino já tem chamada ou confirmação; não pode ser removido.';
  end if;
  delete from public.v2_training_changes where id = p_id;
end;
$$;

create or replace function public.manager_waive_makeup(p_team uuid, p_date date, p_waive boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(public.is_admin() or (private.v2_role() = 'coordination' and private.v2_can('teams', 'edit')), false) then
    raise exception 'Só a administração pode dispensar reposições.' using errcode = '42501';
  end if;
  update public.v2_training_cancellations
    set waived_by = case when p_waive then (select auth.uid()) end,
        waived_at = case when p_waive then now() end
    where team_id = p_team and training_date = p_date and makeup_required;
  if not found then raise exception 'Este treino não tem reposição obrigatória.'; end if;
end;
$$;

-- ─── 7. Substituição ─────────────────────────────────────────────────────────
-- Titular/administração indicam (7 dias atrás a 60 à frente); o próprio técnico
-- declara que assumiu (hoje ou 2 dias antes). Técnico nulo ou titular = sem substituto.
create or replace function public.manager_set_substitute(p_team uuid, p_date date, p_coach uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid()); v_today date := private.v2_today();
  v_manage boolean := private.v2_can_manage_team(p_team);
  v_old uuid; v_tr record; v_found boolean; v_team text; v_name text; v_label text;
  v_self boolean := false; v_titulars uuid[]; v_admins uuid[]; v_titular uuid;
begin
  select s.substitute_id into v_old from public.v2_training_substitutes s
    where s.team_id = p_team and s.training_date = p_date;
  if p_coach is not null and not exists (select 1 from public.profiles p
      where p.id = p_coach and p.is_active is true and p.role in ('coach', 'admin')) then
    raise exception 'Escolha um técnico ativo.';
  end if;
  if p_coach is not null and exists (select 1 from public.team_coaches tc where tc.team_id = p_team and tc.coach_id = p_coach) then
    p_coach := null;
  end if;
  if v_manage then
    if p_date is null or p_date < v_today - 7 or p_date > v_today + 60 then
      raise exception 'Escolha uma data entre 7 dias atrás e 60 dias à frente.';
    end if;
  elsif p_coach = v_uid and private.v2_role() = 'coach' then
    v_self := true;
    if p_date is null or p_date < v_today - 2 or p_date > v_today then
      raise exception 'Você pode assumir treinos de hoje ou dos últimos 2 dias.';
    end if;
    if v_old is not null and v_old <> v_uid then
      raise exception 'Outro técnico já está registrado como substituto neste treino.';
    end if;
    if exists (select 1 from public.attendance a where a.log_id = private.v2_main_log(p_team, p_date)) then
      raise exception 'A chamada deste treino já foi feita. Peça ao titular para indicar você.';
    end if;
  elsif p_coach is null and v_old = v_uid then
    if exists (select 1 from public.attendance a where a.log_id = private.v2_main_log(p_team, p_date)) then
      raise exception 'A chamada já foi feita; peça ao titular ou à administração para desfazer.';
    end if;
  else
    raise exception 'Só o titular da equipe ou a administração pode indicar o substituto.' using errcode = '42501';
  end if;

  select * into v_tr from private.v2_trainings(p_date, p_date) t where t.team_id = p_team order by t.start_time limit 1;
  v_found := found;
  if p_coach is not null and (not v_found or v_tr.cancelled) then
    raise exception 'Esta equipe não tem treino ativo neste dia.';
  end if;

  -- Registros já feitos no dia passam para quem conduz agora
  v_titular := private.v2_team_titular(p_team);
  if exists (
    select 1 from public.training_logs l,
      lateral (select coalesce(p_coach, case when exists (select 1 from public.team_coaches tc
                 where tc.team_id = p_team and tc.coach_id = l.coach_id) then l.coach_id else v_titular end) as nc) x
    where l.team_id = p_team
      and l.started_at >= (p_date::timestamp at time zone 'America/Sao_Paulo')
      and l.started_at < ((p_date + 1)::timestamp at time zone 'America/Sao_Paulo')
      and coalesce(l.conducted_by, l.coach_id) is distinct from x.nc
      and (private.v2_month_paid(coalesce(l.conducted_by, l.coach_id), p_date) or private.v2_month_paid(x.nc, p_date))) then
    raise exception 'A folha de % já foi paga para um dos técnicos; ajuste com a administração.', to_char(p_date, 'MM/YYYY');
  end if;
  update public.training_logs l
    set conducted_by = coalesce(p_coach, case when exists (select 1 from public.team_coaches tc
          where tc.team_id = p_team and tc.coach_id = l.coach_id) then l.coach_id else v_titular end, l.coach_id)
    where l.team_id = p_team
      and l.started_at >= (p_date::timestamp at time zone 'America/Sao_Paulo')
      and l.started_at < ((p_date + 1)::timestamp at time zone 'America/Sao_Paulo');

  if p_coach is null then
    delete from public.v2_training_substitutes where team_id = p_team and training_date = p_date;
  else
    insert into public.v2_training_substitutes (team_id, training_date, substitute_id, assigned_by)
    values (p_team, p_date, p_coach, v_uid)
    on conflict (team_id, training_date) do update
      set substitute_id = excluded.substitute_id, assigned_by = excluded.assigned_by, created_at = now();
  end if;

  -- Avisos
  select t.name into v_team from public.teams t where t.id = p_team;
  v_label := to_char(p_date, 'DD/MM') || case when v_found then ' às ' || to_char(v_tr.start_time, 'HH24:MI') else '' end;
  select p.full_name into v_name from public.profiles p where p.id = p_coach;
  if v_self and v_old is null then
    select array_agg(tc.coach_id) into v_titulars from public.team_coaches tc where tc.team_id = p_team;
    select array_agg(p.id) into v_admins from public.profiles p where p.role = 'admin' and p.is_active is true;
    perform private.v2_notify(coalesce(v_titulars, '{}') || coalesce(v_admins, '{}'), 'Substituição registrada',
      v_name || ' assumiu o treino de ' || v_team || ' em ' || v_label || '.', '/#/treinos');
  elsif p_coach is not null and p_coach is distinct from v_old then
    perform private.v2_notify(array[p_coach], 'Você vai conduzir um treino',
      'Treino de ' || v_team || ' em ' || v_label || '. A chamada fica liberada para você.', '/#/hoje');
  end if;
  if v_old is not null and v_old is distinct from p_coach then
    perform private.v2_notify(array[v_old], 'Substituição desfeita',
      'Você não está mais como substituto no treino de ' || v_team || ' em ' || to_char(p_date, 'DD/MM') || '.', '/#/hoje');
  end if;
  return jsonb_build_object('substitute_id', p_coach, 'substitute_name', v_name);
end;
$$;

-- ─── 8. Chamada ──────────────────────────────────────────────────────────────
create or replace function public.manager_call_roster(p_team uuid, p_date date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := private.v2_today(); v_log uuid; v_tr record; v_found boolean; v_result jsonb;
begin
  if not private.v2_can_call(p_team, p_date) then
    raise exception 'Você não tem acesso à chamada desta equipe nesta data.' using errcode = '42501';
  end if;
  if p_date is null or p_date > v_today or p_date < v_today - 60 then
    raise exception 'Escolha uma data dos últimos 60 dias.';
  end if;
  v_log := private.v2_main_log(p_team, p_date);
  select * into v_tr from private.v2_trainings(p_date, p_date) t where t.team_id = p_team order by t.start_time limit 1;
  v_found := found;
  select jsonb_build_object(
    'team', (select jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color_hex) from public.teams t where t.id = p_team),
    'date', p_date,
    'training', case when v_found then jsonb_build_object('start', to_char(v_tr.start_time, 'HH24:MI'),
        'end', to_char(v_tr.end_time, 'HH24:MI'), 'minutes', v_tr.minutes, 'source', v_tr.source,
        'makeup_for', v_tr.makeup_for, 'cancelled', v_tr.cancelled) end,
    'cancel', (select jsonb_build_object('reason', k.reason, 'note', k.note) from private.v2_cancellations(p_date, p_date) k
               where k.team_id = p_team),
    'substitute', (select jsonb_build_object('id', s.substitute_id, 'name', p.full_name)
                   from public.v2_training_substitutes s join public.profiles p on p.id = s.substitute_id
                   where s.team_id = p_team and s.training_date = p_date),
    'log_id', v_log,
    'has_call', exists (select 1 from public.attendance a where a.log_id = v_log),
    'conductor_name', (select p.full_name from public.training_logs l join public.profiles p on p.id = coalesce(l.conducted_by, l.coach_id)
                       where l.id = v_log),
    'athletes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'full_name', a.full_name, 'jersey_number', a.jersey_number, 'position', a.position,
        'status', att.status, 'reason', att.excused_reason,
        'notice', (select coalesce(n.value->>'reason', 'Ausência avisada pela Área do atleta')
                   from public.v2_portal_notices n
                   where n.athlete_id = a.id and n.kind = 'absence' and n.subject_date = p_date
                   order by n.created_at desc limit 1))
        order by a.jersey_number nulls last, a.full_name)
      from public.athletes a
      left join public.attendance att on att.log_id = v_log and att.athlete_id = a.id
      where (a.team_id = p_team and a.is_active is true) or att.id is not null), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- Grava ou edita a chamada (um registro por equipe e dia). Quem conduziu: o
-- substituto da data; sem ele, quem chama se for técnico da equipe; senão, o titular.
create or replace function public.manager_save_call(p_team uuid, p_date date, p_records jsonb, p_offline boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid()); v_today date := private.v2_today();
  v_tr record; v_log uuid; v_sub uuid; v_cond uuid; v_present integer;
begin
  if not private.v2_can_call(p_team, p_date) then
    raise exception 'Você não tem acesso à chamada desta equipe nesta data.' using errcode = '42501';
  end if;
  if p_date is null or p_date > v_today or p_date < v_today - 60 then
    raise exception 'Escolha uma data dos últimos 60 dias.';
  end if;
  select * into v_tr from private.v2_trainings(p_date, p_date) t where t.team_id = p_team order by t.start_time limit 1;
  if not found then
    raise exception 'Esta equipe não tem treino neste dia. Registre um treino extra antes de fazer a chamada.';
  end if;
  if v_tr.cancelled then
    raise exception 'Este treino foi cancelado. Restaure o treino para fazer a chamada.';
  end if;
  if p_records is null or jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) = 0 then
    raise exception 'Marque a presença dos atletas.';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_records) r(athlete_id uuid, status text, reason text)
             where r.athlete_id is null or r.status is null or r.status not in ('present', 'excused', 'absent', 'injured')) then
    raise exception 'Situação de presença inválida.';
  end if;
  v_log := private.v2_main_log(p_team, p_date);
  if exists (select 1 from jsonb_to_recordset(p_records) r(athlete_id uuid, status text, reason text)
             where not exists (select 1 from public.athletes a where a.id = r.athlete_id and a.team_id = p_team)
               and not exists (select 1 from public.attendance x where x.log_id = v_log and x.athlete_id = r.athlete_id)) then
    raise exception 'Há atletas na chamada que não são desta equipe.';
  end if;
  select count(distinct r.athlete_id) filter (where r.status = 'present') into v_present
    from jsonb_to_recordset(p_records) r(athlete_id uuid, status text, reason text);
  select s.substitute_id into v_sub from public.v2_training_substitutes s where s.team_id = p_team and s.training_date = p_date;

  if v_log is null then
    v_cond := coalesce(v_sub,
      case when exists (select 1 from public.team_coaches tc where tc.team_id = p_team and tc.coach_id = v_uid) then v_uid end,
      private.v2_team_titular(p_team), v_uid);
    insert into public.training_logs (team_id, coach_id, conducted_by, started_at, duration_minutes, athletes_count, emphasis, offline_created)
    values (p_team, v_uid, v_cond, (p_date + v_tr.start_time) at time zone 'America/Sao_Paulo', v_tr.minutes, v_present,
            'Chamada', coalesce(p_offline, false))
    returning id into v_log;
  else
    update public.training_logs
      set athletes_count = v_present, duration_minutes = coalesce(duration_minutes, v_tr.minutes)
      where id = v_log;
  end if;

  -- Update dos existentes e insert dos novos (sem apagar e regravar: a trava de
  -- inadimplência não barra quem já estava presente)
  with r as (
    select distinct on (x.athlete_id) x.athlete_id, x.status, nullif(left(trim(coalesce(x.reason, '')), 300), '') as reason
    from jsonb_to_recordset(p_records) x(athlete_id uuid, status text, reason text)
  )
  update public.attendance a set status = r.status, excused_reason = r.reason
    from r
    where a.log_id = v_log and a.athlete_id = r.athlete_id
      and (a.status is distinct from r.status or a.excused_reason is distinct from r.reason);
  insert into public.attendance (log_id, athlete_id, team_id, status, excused_reason, offline_created)
  select v_log, r.athlete_id, p_team, r.status, r.reason, coalesce(p_offline, false)
  from (select distinct on (x.athlete_id) x.athlete_id, x.status, nullif(left(trim(coalesce(x.reason, '')), 300), '') as reason
        from jsonb_to_recordset(p_records) x(athlete_id uuid, status text, reason text)) r
  where not exists (select 1 from public.attendance a where a.log_id = v_log and a.athlete_id = r.athlete_id);

  return jsonb_build_object('log_id', v_log, 'present', v_present);
end;
$$;

-- "Confirmar treino realizado" sem chamada, com o horário e a duração efetivos
create or replace function public.manager_confirm_training(p_team uuid, p_date date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_today date := private.v2_today(); v_tr record; v_sub uuid; v_id uuid;
begin
  if not private.v2_can_call(p_team, p_date) then
    raise exception 'Você não tem acesso a este treino.' using errcode = '42501';
  end if;
  if p_date is null or p_date > v_today or p_date < v_today - 60 then
    raise exception 'Escolha uma data dos últimos 60 dias.';
  end if;
  select * into v_tr from private.v2_trainings(p_date, p_date) t where t.team_id = p_team order by t.start_time limit 1;
  if not found then raise exception 'Esta equipe não tem treino neste dia.'; end if;
  if v_tr.cancelled then raise exception 'Este treino foi cancelado.'; end if;
  if now() < ((p_date + v_tr.start_time) at time zone 'America/Sao_Paulo') then
    raise exception 'Só é possível confirmar depois do horário de início do treino.';
  end if;
  if private.v2_main_log(p_team, p_date) is not null then raise exception 'Este treino já está registrado.'; end if;
  select s.substitute_id into v_sub from public.v2_training_substitutes s where s.team_id = p_team and s.training_date = p_date;
  insert into public.training_logs (team_id, coach_id, conducted_by, started_at, duration_minutes, emphasis)
  values (p_team, v_uid,
    coalesce(v_sub, case when exists (select 1 from public.team_coaches tc where tc.team_id = p_team and tc.coach_id = v_uid) then v_uid end,
             private.v2_team_titular(p_team), v_uid),
    (p_date + v_tr.start_time) at time zone 'America/Sao_Paulo', v_tr.minutes,
    case when v_sub is not null then 'Treino conduzido por substituto' else 'Treino confirmado' end)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.manager_undo_confirmation(p_team uuid, p_date date)
returns void language plpgsql security definer set search_path = '' as $$
declare v_log uuid;
begin
  if not private.v2_can_call(p_team, p_date) then
    raise exception 'Você não tem acesso a este treino.' using errcode = '42501';
  end if;
  v_log := private.v2_main_log(p_team, p_date);
  if v_log is null then raise exception 'Não há registro deste treino.'; end if;
  if exists (select 1 from public.attendance a where a.log_id = v_log) then
    raise exception 'Este treino tem chamada; edite a chamada em vez de desfazer.';
  end if;
  if exists (select 1 from public.training_logs l where l.id = v_log
             and private.v2_month_paid(coalesce(l.conducted_by, l.coach_id), p_date)) then
    raise exception 'A folha deste mês já foi paga; ajuste com a administração.';
  end if;
  delete from public.training_logs l
    where l.team_id = p_team
      and l.started_at >= (p_date::timestamp at time zone 'America/Sao_Paulo')
      and l.started_at < ((p_date + 1)::timestamp at time zone 'America/Sao_Paulo')
      and not exists (select 1 from public.attendance a where a.log_id = l.id);
end;
$$;

-- ─── 9. Leitura para o lembrete de chamada (só service_role) ─────────────────
create or replace function public.v2_service_trainings(p_from date, p_to date)
returns table (team_id uuid, team_name text, training_date date, start_time time, end_time time,
               minutes integer, source text, makeup_for date, substitute_id uuid)
language sql stable security definer set search_path = '' as $$
  select t.team_id, tm.name, t.training_date, t.start_time, t.end_time, t.minutes, t.source, t.makeup_for, s.substitute_id
  from private.v2_trainings(p_from, p_to) t
  join public.teams tm on tm.id = t.team_id
  left join public.v2_training_substitutes s on s.team_id = t.team_id and s.training_date = t.training_date
  where not t.cancelled;
$$;

-- ─── 10. "Meu mês": treinos conduzidos pelo técnico (inclui substituições) ──
create or replace function public.v2_my_month(p_month date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_start date := date_trunc('month', p_month)::date;
  v_end date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_rate integer := 0;
  v_daily integer := 0;
  v_result jsonb;
begin
  if v_uid is null or not exists (
    select 1 from public.profiles p where p.id = v_uid and p.is_active is true and p.role in ('coach','admin')
  ) then
    raise exception 'Active coach required' using errcode = '42501';
  end if;
  select coalesce(r.hourly_cents, 0), coalesce(r.daily_cents, 0) into v_rate, v_daily
    from public.v2_coach_rates r where r.coach_id = v_uid;
  v_rate := coalesce(v_rate, 0); v_daily := coalesce(v_daily, 0);

  with items as (
    select i.*,
      case
        when i.status = 'rejected' then 0
        when i.status = 'approved' and i.amount_cents is not null then i.amount_cents
        when i.kind = 'competition' then v_daily
        when i.kind = 'extra' then coalesce(i.amount_cents, round(v_rate * i.hours)::integer)
        else round(v_rate * i.hours)::integer
      end as value_cents
    from public.v2_coach_items i
    where i.coach_id = v_uid and i.item_date >= v_start and i.item_date < v_end
  ),
  app_days as (
    -- treinos registrados no app (chamada ou confirmação) conduzidos pelo técnico,
    -- inclusive como substituto, ainda sem lançamento de horas
    select distinct l.team_id, (l.started_at at time zone 'America/Sao_Paulo')::date as d
    from public.training_logs l
    where coalesce(l.conducted_by, l.coach_id) = v_uid
      and l.started_at >= v_start and l.started_at < v_end + 1
  )
  select jsonb_build_object(
    'month', to_char(v_start, 'YYYY-MM'),
    'hourly_cents', v_rate,
    'daily_cents', v_daily,
    'training_hours', coalesce((select sum(hours) from items where kind = 'training' and status <> 'rejected'), 0),
    'training_cents', coalesce((select sum(value_cents) from items where kind = 'training'), 0),
    'competition_days', (select count(*) from items where kind = 'competition' and status <> 'rejected'),
    'competition_cents', coalesce((select sum(value_cents) from items where kind = 'competition'), 0),
    'extra_cents', coalesce((select sum(value_cents) from items where kind = 'extra'), 0),
    'total_cents', coalesce((select sum(value_cents) from items), 0),
    'approved_cents', coalesce((select sum(value_cents) from items where status = 'approved'), 0),
    'pending_count', (select count(*) from items where status = 'pending'),
    'approved_count', (select count(*) from items where status = 'approved'),
    'rejected_count', (select count(*) from items where status = 'rejected'),
    'unlaunched_trainings', (select count(*) from app_days a
      where a.d >= v_start and a.d < v_end and not exists (
        select 1 from items i where i.kind = 'training' and i.team_id = a.team_id and i.item_date = a.d)),
    'paid_cents', (select p.amount_cents from public.v2_coach_payouts p where p.coach_id = v_uid and p.month = v_start),
    'paid_at', (select p.paid_at from public.v2_coach_payouts p where p.coach_id = v_uid and p.month = v_start),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'date', i.item_date, 'kind', i.kind, 'description', i.description, 'hours', i.hours,
        'status', i.status, 'value_cents', i.value_cents) order by i.item_date desc) from items i), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.manager_training_calendar(date, date), public.manager_open_trainings(),
  public.manager_cancel_training(uuid, date, text, text, boolean), public.manager_restore_training(uuid, date),
  public.manager_schedule_training(uuid, date, time, time, text, date, text), public.manager_remove_training_change(uuid),
  public.manager_waive_makeup(uuid, date, boolean), public.manager_set_substitute(uuid, date, uuid),
  public.manager_call_roster(uuid, date), public.manager_save_call(uuid, date, jsonb, boolean),
  public.manager_confirm_training(uuid, date), public.manager_undo_confirmation(uuid, date),
  public.v2_service_trainings(date, date), public.v2_my_month(date) from public, anon;
grant execute on function public.manager_training_calendar(date, date), public.manager_open_trainings(),
  public.manager_cancel_training(uuid, date, text, text, boolean), public.manager_restore_training(uuid, date),
  public.manager_schedule_training(uuid, date, time, time, text, date, text), public.manager_remove_training_change(uuid),
  public.manager_waive_makeup(uuid, date, boolean), public.manager_set_substitute(uuid, date, uuid),
  public.manager_call_roster(uuid, date), public.manager_save_call(uuid, date, jsonb, boolean),
  public.manager_confirm_training(uuid, date), public.manager_undo_confirmation(uuid, date),
  public.v2_my_month(date) to authenticated;
revoke all on function public.v2_service_trainings(date, date) from authenticated;
grant execute on function public.v2_service_trainings(date, date) to service_role;

commit;
