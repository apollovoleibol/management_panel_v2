-- Apply after 013_v2_access_foundation.sql. Additive policies for the existing
-- Manager App tables plus new data that the old panel never stored.
begin;
alter table public.training_locations add column if not exists venue text;

-- Staff page permissions are checked in the database, including write access.
create policy v2_staff_profiles_read on public.profiles for select to authenticated
  using (private.v2_can('settings','view') or
    ((private.v2_can('teams','view') or private.v2_can('payments','view'))
      and private.v2_role() <> 'coach'));
create policy v2_staff_teams_read on public.teams for select to authenticated
  using ((private.v2_can('teams','view') or private.v2_role() = 'finance') and private.v2_team_scope(id));
create policy v2_staff_teams_insert on public.teams for insert to authenticated
  with check (private.v2_can('teams','edit'));
create policy v2_staff_teams_update on public.teams for update to authenticated
  using (private.v2_can('teams','edit')) with check (private.v2_can('teams','edit'));
create policy v2_staff_team_links_read on public.team_coaches for select to authenticated
  using ((private.v2_can('teams','view') or private.v2_role() = 'finance') and private.v2_team_scope(team_id));
create policy v2_staff_team_links_insert on public.team_coaches for insert to authenticated
  with check (private.v2_can('teams','edit'));
create policy v2_staff_team_links_delete on public.team_coaches for delete to authenticated
  using (private.v2_can('teams','edit'));
create policy v2_staff_athletes_read on public.athletes for select to authenticated
  using (private.v2_can('athletes','view') and private.v2_team_scope(team_id));
create policy v2_staff_athletes_insert on public.athletes for insert to authenticated
  with check (private.v2_can('athletes','edit'));
create policy v2_staff_athletes_update on public.athletes for update to authenticated
  using (private.v2_can('athletes','edit')) with check (private.v2_can('athletes','edit'));

-- Replace the broad v1 tryout read with an explicitly scoped policy. The v1
-- admin still sees everything; v1 coaches see their own teams.
drop policy if exists v2_tryouts_select on public.tryouts;
drop policy if exists "authenticated users can update tryouts" on public.tryouts;
create policy v2_tryouts_select on public.tryouts for select to authenticated using (
  public.is_admin()
  or (private.v2_can('bookings','view') and private.v2_team_scope(team_id))
);
create policy v2_staff_tryouts_insert on public.tryouts for insert to authenticated
  with check (private.v2_can('bookings','edit'));
create policy v2_staff_tryouts_update on public.tryouts for update to authenticated
  using (private.v2_can('bookings','edit') or
    (private.v2_role() = 'coach' and private.v2_team_scope(team_id)))
  with check (private.v2_can('bookings','edit') or
    (private.v2_role() = 'coach' and private.v2_team_scope(team_id)));
create policy v2_staff_tryouts_delete on public.tryouts for delete to authenticated
  using (private.v2_can('bookings','edit'));

create policy v2_staff_locations_insert on public.training_locations for insert to authenticated
  with check (private.v2_can('teams','edit'));
create policy v2_staff_locations_update on public.training_locations for update to authenticated
  using (private.v2_can('teams','edit')) with check (private.v2_can('teams','edit'));
create policy v2_staff_locations_delete on public.training_locations for delete to authenticated
  using (private.v2_can('teams','edit'));
create policy v2_staff_unavailable_read on public.team_unavailable_dates for select to authenticated
  using (private.v2_can('teams','view') and private.v2_team_scope(team_id));
create policy v2_staff_unavailable_insert on public.team_unavailable_dates for insert to authenticated
  with check (private.v2_can('teams','edit'));
create policy v2_staff_unavailable_delete on public.team_unavailable_dates for delete to authenticated
  using (private.v2_can('teams','edit'));
create policy v2_staff_logs_read on public.training_logs for select to authenticated
  using (private.v2_can('overview','view') and private.v2_team_scope(team_id));
create policy v2_staff_attendance_read on public.attendance for select to authenticated
  using (private.v2_can('overview','view') and private.v2_team_scope(team_id));
create policy v2_staff_competitions_read on public.competitions for select to authenticated
  using (private.v2_can('overview','view') and private.v2_team_scope(team_id));

create table if not exists public.v2_finance_manual (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  description text not null check (length(description) between 1 and 300),
  category text not null,
  direction text not null check (direction in ('in','out')),
  amount_cents integer not null check (amount_cents > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.v2_finance_manual enable row level security;
create policy v2_finance_manual_read on public.v2_finance_manual for select to authenticated
  using (private.v2_can('finance','view'));
create policy v2_finance_manual_insert on public.v2_finance_manual for insert to authenticated
  with check (private.v2_can('finance','edit') and created_by = (select auth.uid()));
create policy v2_finance_manual_delete on public.v2_finance_manual for delete to authenticated
  using (private.v2_can('finance','edit'));
revoke all on public.v2_finance_manual from anon, authenticated;
grant select, insert, delete on public.v2_finance_manual to authenticated;

create table if not exists public.v2_coach_rates (
  coach_id uuid primary key references public.profiles(id),
  hourly_cents integer not null default 0 check (hourly_cents >= 0),
  daily_cents integer not null default 0 check (daily_cents >= 0),
  pix_key text,
  updated_at timestamptz not null default now()
);
create table if not exists public.v2_coach_items (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id),
  team_id uuid references public.teams(id),
  item_date date not null,
  kind text not null check (kind in ('training','competition','extra')),
  description text not null,
  hours numeric(6,2) not null default 0 check (hours >= 0),
  amount_cents integer check (amount_cents >= 0),
  status text not null default 'pending' check (status in ('pending','approved')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.v2_coach_payouts (
  coach_id uuid not null references public.profiles(id),
  month date not null check (extract(day from month) = 1),
  amount_cents integer not null check (amount_cents >= 0),
  paid_at timestamptz not null default now(),
  paid_by uuid not null references auth.users(id),
  primary key (coach_id, month)
);
alter table public.v2_coach_rates enable row level security;
alter table public.v2_coach_items enable row level security;
alter table public.v2_coach_payouts enable row level security;
create policy v2_coach_rates_read on public.v2_coach_rates for select to authenticated
  using (private.v2_can('payments','view'));
create policy v2_coach_rates_write on public.v2_coach_rates for all to authenticated
  using (private.v2_can('payments','edit')) with check (private.v2_can('payments','edit'));
create policy v2_coach_items_read on public.v2_coach_items for select to authenticated
  using (private.v2_can('payments','view'));
create policy v2_coach_items_write on public.v2_coach_items for all to authenticated
  using (private.v2_can('payments','edit')) with check (private.v2_can('payments','edit'));
create policy v2_coach_payouts_read on public.v2_coach_payouts for select to authenticated
  using (private.v2_can('payments','view'));
create policy v2_coach_payouts_write on public.v2_coach_payouts for all to authenticated
  using (private.v2_can('payments','edit')) with check (private.v2_can('payments','edit'));
revoke all on public.v2_coach_rates, public.v2_coach_items, public.v2_coach_payouts from anon, authenticated;
grant select, insert, update, delete on public.v2_coach_rates, public.v2_coach_items, public.v2_coach_payouts to authenticated;

-- The payout and its ledger entry must succeed or fail together. The browser
-- never supplies the amount, which is recomputed from approved source items.
create or replace function public.v2_record_coach_payout(p_coach uuid, p_month date)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_total integer; v_pending integer; v_count integer; v_name text;
begin
  if not private.v2_can('payments', 'edit') or not private.v2_can('finance', 'edit') then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'Month must start on day one';
  end if;
  perform 1 from public.v2_coach_rates r where r.coach_id = p_coach for update;
  if not found then raise exception 'Set the coach rate first'; end if;
  if exists (select 1 from public.v2_coach_payouts p
             where p.coach_id = p_coach and p.month = p_month) then
    raise exception 'This month has already been paid';
  end if;
  select count(*), count(*) filter (where i.status <> 'approved'),
         coalesce(sum(case when i.kind = 'competition' then r.daily_cents
           when i.kind = 'extra' and i.amount_cents is not null then i.amount_cents
           else round(i.hours * r.hourly_cents)::integer end), 0)
    into v_count, v_pending, v_total
    from public.v2_coach_items i
    join public.v2_coach_rates r on r.coach_id = i.coach_id
    where i.coach_id = p_coach and i.item_date >= p_month
      and i.item_date < (p_month + interval '1 month')::date;
  if v_count = 0 or v_pending > 0 or v_total <= 0 then
    raise exception 'No payable approved items for this month';
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

commit;
