-- 046 · Folha dos técnicos: lançamento reprovado não bloqueia o pagamento.
-- 1. v2_record_coach_payout: reprovados ficam fora da conta. Só bloqueia quando ainda há
--    lançamento aguardando revisão. Mensagens em português.
-- 2. v2_guard_coach_item: mensagens em português e diária de competição só é aprovada
--    com o valor da diária definido (antes saía por R$ 0,00).
-- 3. v2_my_month (Manager App, "Meu mês"): reprovados não somam no total do técnico.
begin;

create or replace function public.v2_guard_coach_item()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_hourly integer; v_daily integer;
begin
  if tg_op = 'UPDATE' and old.status = 'approved' then
    raise exception 'Lançamento aprovado não pode ser alterado.';
  end if;
  select r.hourly_cents, r.daily_cents into v_hourly, v_daily
    from public.v2_coach_rates r where r.coach_id = new.coach_id for update;
  if exists (select 1 from public.v2_coach_payouts p where p.coach_id = new.coach_id
    and p.month = date_trunc('month', new.item_date)::date) then
    raise exception 'O pagamento deste técnico neste mês já foi registrado.';
  end if;
  if new.status = 'approved' then
    if v_hourly is null then raise exception 'Defina a hora-aula do técnico antes de aprovar.'; end if;
    if new.kind = 'competition' and coalesce(v_daily, 0) <= 0 then
      raise exception 'Defina o valor da diária de competição do técnico antes de aprovar diárias.';
    end if;
    new.amount_cents := case new.kind
      when 'competition' then v_daily
      when 'training' then round(new.hours * v_hourly)::integer
      else coalesce(new.amount_cents, round(new.hours * v_hourly)::integer)
    end;
  end if;
  return new;
end;
$$;

create or replace function public.v2_record_coach_payout(p_coach uuid, p_month date)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_total integer; v_pending integer; v_count integer; v_name text;
begin
  if not private.v2_can('payments', 'edit') or not private.v2_can('finance', 'edit') then
    raise exception 'Seu perfil não pode registrar pagamentos (precisa editar Folha dos técnicos e Financeiro).' using errcode = '42501';
  end if;
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'Mês inválido.';
  end if;
  perform 1 from public.v2_coach_rates r where r.coach_id = p_coach for update;
  if not found then raise exception 'Defina a hora-aula do técnico primeiro.'; end if;
  if exists (select 1 from public.v2_coach_payouts p
             where p.coach_id = p_coach and p.month = p_month) then
    raise exception 'O pagamento deste técnico neste mês já foi registrado.';
  end if;
  -- Reprovados não entram: nem no valor, nem como pendência
  select count(*) filter (where i.status = 'approved'),
         count(*) filter (where i.status = 'pending' or (i.status = 'approved' and i.amount_cents is null)),
         coalesce(sum(i.amount_cents) filter (where i.status = 'approved'), 0)
    into v_count, v_pending, v_total
    from public.v2_coach_items i
    where i.coach_id = p_coach and i.item_date >= p_month
      and i.item_date < (p_month + interval '1 month')::date;
  if v_pending > 0 then
    raise exception 'Ainda há % lançamento(s) aguardando revisão neste mês.', v_pending;
  end if;
  if v_count = 0 or v_total <= 0 then
    raise exception 'Não há valor aprovado para pagar neste mês.';
  end if;
  select p.full_name into v_name from public.profiles p where p.id = p_coach;
  insert into public.v2_coach_payouts(coach_id, month, amount_cents, paid_by)
    values (p_coach, p_month, v_total, auth.uid());
  insert into public.v2_finance_manual(entry_date, description, category, direction, amount_cents, created_by)
    values (current_date, 'Pagamento técnico ' || coalesce(v_name, p_coach::text)
      || ' — ' || to_char(p_month, 'MM/YYYY'), 'Folha técnica', 'out', v_total, auth.uid());
  return v_total;
end;
$$;
revoke all on function public.v2_record_coach_payout(uuid,date) from public, anon;
grant execute on function public.v2_record_coach_payout(uuid,date) to authenticated;

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
revoke all on function public.v2_my_month(date) from public, anon;
grant execute on function public.v2_my_month(date) to authenticated;

commit;
