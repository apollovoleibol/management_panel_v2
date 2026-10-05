-- 023 · "Meu mês" do técnico e lembrete de chamada pendente.
-- 1. v2_my_month: o técnico vê só os próprios lançamentos, sem acesso à página Pagamentos.
--    Valores calculados como no Huddle (core.js itemValue).
-- 2. v2_call_reminders: registro dos lembretes enviados (um por equipe e dia).
-- 3. pg_cron + pg_net chamam a Edge Function call-reminder a cada 10 minutos.
begin;

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
        when i.status = 'approved' and i.amount_cents is not null then i.amount_cents
        when i.kind = 'competition' then v_daily
        when i.kind = 'extra' then coalesce(i.amount_cents, round(v_rate * i.hours)::integer)
        else round(v_rate * i.hours)::integer
      end as value_cents
    from public.v2_coach_items i
    where i.coach_id = v_uid and i.item_date >= v_start and i.item_date < v_end
  ),
  app_days as (
    -- treinos registrados no app (chamada ou confirmação) ainda sem lançamento de horas
    select distinct l.team_id, (l.started_at at time zone 'America/Sao_Paulo')::date as d
    from public.training_logs l
    join public.team_coaches tc on tc.team_id = l.team_id and tc.coach_id = v_uid
    where l.started_at >= v_start and l.started_at < v_end + 1
  )
  select jsonb_build_object(
    'month', to_char(v_start, 'YYYY-MM'),
    'hourly_cents', v_rate,
    'daily_cents', v_daily,
    'training_hours', coalesce((select sum(hours) from items where kind = 'training'), 0),
    'training_cents', coalesce((select sum(value_cents) from items where kind = 'training'), 0),
    'competition_days', (select count(*) from items where kind = 'competition'),
    'competition_cents', coalesce((select sum(value_cents) from items where kind = 'competition'), 0),
    'extra_cents', coalesce((select sum(value_cents) from items where kind = 'extra'), 0),
    'total_cents', coalesce((select sum(value_cents) from items), 0),
    'approved_cents', coalesce((select sum(value_cents) from items where status = 'approved'), 0),
    'pending_count', (select count(*) from items where status = 'pending'),
    'approved_count', (select count(*) from items where status = 'approved'),
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
revoke all on function public.v2_my_month(date) from public, anon;
grant execute on function public.v2_my_month(date) to authenticated;

create table if not exists public.v2_call_reminders (
  team_id uuid not null references public.teams(id) on delete cascade,
  training_date date not null,
  sent_at timestamptz not null default now(),
  primary key (team_id, training_date)
);
alter table public.v2_call_reminders enable row level security;
revoke all on public.v2_call_reminders from public, anon, authenticated;

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'call-reminder';
select cron.schedule('call-reminder', '*/10 * * * *', $cron$
  select net.http_post(
    url := 'https://hrakdydodcmllwnkmrkg.supabase.co/functions/v1/call-reminder',
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
$cron$);

commit;
