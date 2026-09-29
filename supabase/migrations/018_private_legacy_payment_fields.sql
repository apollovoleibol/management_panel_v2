-- Preparation only. Keep the legacy columns populated until the v1 panel and
-- Manager App have switched to these tables. Apply after 013 and 015.
-- A separate cutover must verify the copy and remove the old readable values.
begin;

create table if not exists public.v2_athlete_payment_settings (
  athlete_id uuid primary key references public.athletes(id) on delete cascade,
  payment_plan text,
  payment_bank text,
  updated_at timestamptz not null default now()
);
create table if not exists public.v2_team_payment_plans (
  team_id uuid primary key references public.teams(id) on delete cascade,
  available_payment_plans text[] not null default '{}'::text[],
  updated_at timestamptz not null default now()
);

alter table public.v2_athlete_payment_settings enable row level security;
alter table public.v2_team_payment_plans enable row level security;
create policy v2_athlete_payment_read on public.v2_athlete_payment_settings
  for select to authenticated using (private.v2_can('packages','view'));
create policy v2_athlete_payment_insert on public.v2_athlete_payment_settings
  for insert to authenticated with check (private.v2_can('packages','edit'));
create policy v2_athlete_payment_update on public.v2_athlete_payment_settings
  for update to authenticated using (private.v2_can('packages','edit'))
  with check (private.v2_can('packages','edit'));
create policy v2_team_payment_read on public.v2_team_payment_plans
  for select to authenticated using (private.v2_can('packages','view'));
create policy v2_team_payment_insert on public.v2_team_payment_plans
  for insert to authenticated with check (private.v2_can('packages','edit'));
create policy v2_team_payment_update on public.v2_team_payment_plans
  for update to authenticated using (private.v2_can('packages','edit'))
  with check (private.v2_can('packages','edit'));
revoke all on public.v2_athlete_payment_settings, public.v2_team_payment_plans from anon, authenticated;
grant select, insert, update on public.v2_athlete_payment_settings, public.v2_team_payment_plans to authenticated;

-- Legacy writes continue to update the private copy during the transition.
-- Creating both triggers before copying obtains table locks that prevent a
-- concurrent legacy write from falling between the copy and the trigger.
create or replace function private.v2_sync_athlete_payment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.v2_athlete_payment_settings(athlete_id,payment_plan,payment_bank)
    values (new.id,new.payment_plan,new.payment_bank)
    on conflict (athlete_id) do update set payment_plan = excluded.payment_plan,
      payment_bank = excluded.payment_bank, updated_at = now();
  return new;
end;
$$;
create or replace function private.v2_sync_team_payment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.v2_team_payment_plans(team_id,available_payment_plans)
    values (new.id,coalesce(new.available_payment_plans,'{}'::text[]))
    on conflict (team_id) do update set
      available_payment_plans = excluded.available_payment_plans, updated_at = now();
  return new;
end;
$$;
create trigger v2_sync_athlete_payment after insert or update of payment_plan,payment_bank
  on public.athletes for each row execute function private.v2_sync_athlete_payment();
create trigger v2_sync_team_payment after insert or update of available_payment_plans
  on public.teams for each row execute function private.v2_sync_team_payment();

insert into public.v2_athlete_payment_settings(athlete_id,payment_plan,payment_bank)
  select id,payment_plan,payment_bank from public.athletes
  on conflict (athlete_id) do update set payment_plan = excluded.payment_plan,
    payment_bank = excluded.payment_bank, updated_at = now();
insert into public.v2_team_payment_plans(team_id,available_payment_plans)
  select id,coalesce(available_payment_plans,'{}'::text[]) from public.teams
  on conflict (team_id) do update set
    available_payment_plans = excluded.available_payment_plans, updated_at = now();

do $$
begin
  if exists (
    select 1 from public.athletes a
    left join public.v2_athlete_payment_settings s on s.athlete_id = a.id
    where s.athlete_id is null or s.payment_plan is distinct from a.payment_plan
      or s.payment_bank is distinct from a.payment_bank
  ) or exists (
    select 1 from public.teams t
    left join public.v2_team_payment_plans p on p.team_id = t.id
    where p.team_id is null or p.available_payment_plans is distinct from
      coalesce(t.available_payment_plans,'{}'::text[])
  ) then
    raise exception 'Legacy payment copy verification failed';
  end if;
end;
$$;

revoke all on function private.v2_sync_athlete_payment() from public, anon, authenticated;
revoke all on function private.v2_sync_team_payment() from public, anon, authenticated;
commit;
