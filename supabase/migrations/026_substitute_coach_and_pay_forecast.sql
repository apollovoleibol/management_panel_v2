-- 026 · Técnico substituto, previsão de remuneração e diária lançada pelo técnico.
-- 1. training_logs.conducted_by: quem conduziu o treino (substituto ou o próprio
--    titular). As horas vão para quem conduziu; vazio = quem registrou (coach_id).
-- 2. Hora-aula base de R$ 30 (3000 centavos) para quem ainda não tem valor.
-- 3. Lançamentos podem ser reprovados (status 'rejected').
-- 4. Funções do Manager App: lista de técnicos (para escolher o substituto),
--    lançamento de diária de competição e previsão de remuneração do mês.
begin;

alter table public.training_logs add column if not exists conducted_by uuid references public.profiles(id);
create index if not exists training_logs_conducted_by_idx on public.training_logs(conducted_by);

alter table public.v2_coach_rates alter column hourly_cents set default 3000;
insert into public.v2_coach_rates (coach_id, hourly_cents, daily_cents)
select p.id, 3000, 0 from public.profiles p
where p.role = 'coach' and p.is_active is true
on conflict (coach_id) do nothing;

alter table public.v2_coach_items drop constraint if exists v2_coach_items_status_check;
alter table public.v2_coach_items add constraint v2_coach_items_status_check
  check (status in ('pending', 'approved', 'rejected'));

-- Técnicos ativos (nome e id) para o técnico escolher quem o substituiu
create or replace function public.manager_coach_directory()
returns table (id uuid, full_name text) language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name from public.profiles p
  where p.role = 'coach' and p.is_active is true
    and exists (select 1 from public.profiles me where me.id = (select auth.uid())
                and me.is_active is true and me.role in ('coach', 'admin'))
  order by p.full_name;
$$;
revoke all on function public.manager_coach_directory() from public, anon;
grant execute on function public.manager_coach_directory() to authenticated;

-- Diária de competição lançada pelo técnico: entra pendente nos Pagamentos do Huddle
create or replace function public.manager_add_competition_day(p_date date, p_team uuid, p_description text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_id uuid; v_name text;
begin
  select full_name into v_name from public.profiles where id = v_uid and is_active is true and role = 'coach';
  if v_name is null then raise exception 'Apenas técnicos ativos lançam diárias' using errcode = '42501'; end if;
  if p_date is null or p_date > current_date + 1 or p_date < current_date - 60 then
    raise exception 'Data inválida (até 60 dias atrás)';
  end if;
  if p_team is not null and not exists (select 1 from public.team_coaches where team_id = p_team and coach_id = v_uid) then
    raise exception 'Escolha uma equipe sua';
  end if;
  if coalesce(trim(p_description), '') = '' then raise exception 'Descreva a competição'; end if;
  if exists (select 1 from public.v2_coach_items where coach_id = v_uid and kind = 'competition'
             and item_date = p_date and status <> 'rejected') then
    raise exception 'Já existe diária lançada nesta data';
  end if;
  insert into public.v2_coach_items (coach_id, team_id, item_date, kind, description, hours, status, created_by)
    values (v_uid, p_team, p_date, 'competition', left(trim(p_description), 200), 0, 'pending', v_uid)
    returning id into v_id;
  -- Aviso para a administração revisar (vai ao celular pelo gatilho da migração 025)
  insert into public.notifications (user_id, type, title, body, data)
  select a.id, 'payment_review', 'Diária de competição para aprovar',
         v_name || ' · ' || to_char(p_date, 'DD/MM') || ' · ' || left(trim(p_description), 80),
         jsonb_build_object('url', '/#/dashboard')
  from public.profiles a where a.role = 'admin' and a.is_active is true;
  return v_id;
end;
$$;
revoke all on function public.manager_add_competition_day(date, uuid, text) from public, anon;
grant execute on function public.manager_add_competition_day(date, uuid, text) to authenticated;

-- Previsão de remuneração do mês para o próprio técnico
create or replace function public.manager_pay_forecast(p_month date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_start date := date_trunc('month', p_month)::date;
  v_end date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_rate integer; v_daily integer; v_result jsonb;
begin
  if v_uid is null or not exists (select 1 from public.profiles where id = v_uid and is_active is true) then
    raise exception 'Active profile required' using errcode = '42501';
  end if;
  select r.hourly_cents, r.daily_cents into v_rate, v_daily from public.v2_coach_rates r where r.coach_id = v_uid;
  v_rate := coalesce(v_rate, 3000); v_daily := coalesce(v_daily, 0);

  with logs as (
    -- um treino por equipe e dia; horas pela duração gravada ou pela grade da equipe
    select l.team_id, (l.started_at at time zone 'America/Sao_Paulo')::date as d,
           max(l.duration_minutes) as minutes,
           bool_or(l.conducted_by is not null and l.conducted_by = v_uid
                   and not exists (select 1 from public.team_coaches tc where tc.team_id = l.team_id and tc.coach_id = v_uid)) as as_substitute
    from public.training_logs l
    where coalesce(l.conducted_by, l.coach_id) = v_uid
      and l.started_at >= (v_start - 1) and l.started_at < (v_end + 1)
    group by 1, 2
  ),
  trainings as (
    select g.team_id, g.d, t.name as team_name, g.as_substitute,
      round(coalesce(g.minutes,
        (select extract(epoch from ((s->>'end')::time - (s->>'start')::time)) / 60
           from jsonb_array_elements(case when jsonb_typeof(t.training_schedule) = 'array' then t.training_schedule else '[]'::jsonb end) s
          where (s->>'day')::int = extract(dow from g.d) and s->>'start' is not null and s->>'end' is not null
          limit 1),
        90)::numeric / 60, 2) as hours
    from logs g join public.teams t on t.id = g.team_id
    where g.d >= v_start and g.d < v_end
  ),
  comps as (
    select i.id, i.item_date, i.description, i.status,
      case when i.status = 'approved' and i.amount_cents is not null then i.amount_cents else v_daily end as value_cents
    from public.v2_coach_items i
    where i.coach_id = v_uid and i.kind = 'competition' and i.item_date >= v_start and i.item_date < v_end
  )
  select jsonb_build_object(
    'month', to_char(v_start, 'YYYY-MM'),
    'hourly_cents', v_rate,
    'daily_cents', v_daily,
    'training_hours', coalesce((select sum(hours) from trainings), 0),
    'training_count', (select count(*) from trainings),
    'substitute_count', (select count(*) from trainings where as_substitute),
    'training_cents', round(coalesce((select sum(hours) from trainings), 0) * v_rate),
    'competition_cents', coalesce((select sum(value_cents) from comps where status <> 'rejected'), 0),
    'trainings', coalesce((select jsonb_agg(jsonb_build_object('date', d, 'team', team_name, 'hours', hours, 'substitute', as_substitute) order by d desc) from trainings), '[]'::jsonb),
    'competitions', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'date', item_date, 'description', description, 'status', status, 'value_cents', value_cents) order by item_date desc) from comps), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.manager_pay_forecast(date) from public, anon;
grant execute on function public.manager_pay_forecast(date) to authenticated;

commit;
