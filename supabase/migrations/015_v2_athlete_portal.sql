-- Athlete/guardian access on the shared Supabase project.
begin;

-- The v1 "customer" role currently has full athlete CRUD, including rows of
-- unrelated families. Freeze that legacy exception to accounts which already
-- exist before v2 portal invitations. New guardians also use the legacy role
-- because of its check constraint, but must never inherit those broad grants.
create table if not exists private.v2_legacy_customers (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table private.v2_legacy_customers enable row level security;
insert into private.v2_legacy_customers(user_id)
select p.id from public.profiles p where p.role = 'customer'
on conflict (user_id) do nothing;
create or replace function private.v2_is_legacy_customer()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.v2_legacy_customers legacy
    join public.profiles p on p.id = legacy.user_id
    where legacy.user_id = (select auth.uid())
      and p.role = 'customer' and p.is_active is true);
$$;
revoke all on private.v2_legacy_customers from public, anon, authenticated;
revoke all on function private.v2_is_legacy_customer() from public, anon;
grant execute on function private.v2_is_legacy_customer() to authenticated;
create or replace function public.v2_can_use_legacy_panel()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin() or private.v2_is_legacy_customer()
    or exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and p.role = 'coach' and p.is_active is true);
$$;
revoke all on function public.v2_can_use_legacy_panel() from public, anon;
grant execute on function public.v2_can_use_legacy_panel() to authenticated;
drop policy if exists athletes_customer_select on public.athletes;
drop policy if exists athletes_customer_insert on public.athletes;
drop policy if exists athletes_customer_update on public.athletes;
drop policy if exists athletes_customer_delete on public.athletes;
create policy athletes_customer_select on public.athletes for select to authenticated
  using (private.v2_is_legacy_customer());
create policy athletes_customer_insert on public.athletes for insert to authenticated
  with check (private.v2_is_legacy_customer());
create policy athletes_customer_update on public.athletes for update to authenticated
  using (private.v2_is_legacy_customer()) with check (private.v2_is_legacy_customer());
create policy athletes_customer_delete on public.athletes for delete to authenticated
  using (private.v2_is_legacy_customer());

-- The existing reception account also used the v1 tryout list. Restore its
-- previous read scope without giving future guardian accounts the same access.
drop policy if exists v2_tryouts_select on public.tryouts;
create policy v2_tryouts_select on public.tryouts for select to authenticated using (
  public.is_admin() or private.v2_is_legacy_customer()
  or (private.v2_can('bookings','view') and private.v2_tryout_team_scope(team_id,target_team))
);

create or replace function private.v2_portal_link(p_athlete uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.v2_athlete_access access
    join public.athletes athlete on athlete.id = access.athlete_id
    where access.user_id = (select auth.uid())
      and access.athlete_id = p_athlete and athlete.is_active is true
      and ((athlete.birth_date is not null and athlete.birth_date <= current_date - interval '18 years'
            and access.relation = 'self')
        or ((athlete.birth_date is null or athlete.birth_date > current_date - interval '18 years')
            and access.relation = 'guardian'))
  );
$$;

create or replace function public.v2_my_access()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'role', private.v2_role(),
    'pages', coalesce((select jsonb_object_agg(page, jsonb_build_object(
      'view', private.v2_can(page, 'view'), 'edit', private.v2_can(page, 'edit')))
      from unnest(array['overview','bookings','athletes','teams','packages','feeder','payments','finance','settings']) as pages(page)), '{}'::jsonb),
    'athleteIds', coalesce((select jsonb_agg(a.athlete_id) from public.v2_athlete_access a
      where a.user_id = (select auth.uid()) and private.v2_portal_link(a.athlete_id)), '[]'::jsonb)
  );
$$;

-- Portal reads only the linked athlete's records. The client selects a small
-- field list; other athletes remain invisible at the row level.
drop policy if exists v2_family_athlete_select on public.athletes;
create policy v2_family_athlete_select on public.athletes for select to authenticated
  using (private.v2_portal_link(id));
create policy v2_family_team_select on public.teams for select to authenticated using (
  exists (select 1 from public.athletes a where a.team_id = teams.id
    and private.v2_portal_link(a.id))
);
create policy v2_family_location_select on public.training_locations for select to authenticated using (
  exists (select 1 from public.teams t join public.athletes a on a.team_id = t.id
    where t.location_id = training_locations.id and private.v2_portal_link(a.id))
);
create policy v2_family_competitions_select on public.competitions for select to authenticated using (
  exists (select 1 from public.athletes a where a.team_id = competitions.team_id
    and private.v2_portal_link(a.id))
);
create policy v2_family_attendance_select on public.attendance for select to authenticated
  using (private.v2_portal_link(athlete_id));
create policy v2_family_unavailable_select on public.team_unavailable_dates for select to authenticated
  using (exists (select 1 from public.athletes a where a.team_id = team_unavailable_dates.team_id
    and private.v2_portal_link(a.id)));

create table if not exists public.v2_portal_notices (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  kind text not null check (kind in ('absence','event_response','image_consent','health_update')),
  subject_date date,
  value jsonb not null default '{}'::jsonb check (jsonb_typeof(value) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists v2_portal_notices_athlete_idx on public.v2_portal_notices(athlete_id, created_at desc);
alter table public.v2_portal_notices enable row level security;
create policy v2_portal_notices_read on public.v2_portal_notices for select to authenticated using (
  private.v2_portal_link(athlete_id) or
  (private.v2_can('athletes','view') and exists (
    select 1 from public.athletes a where a.id = athlete_id and private.v2_team_scope(a.team_id)
  ))
);
create policy v2_portal_notices_insert on public.v2_portal_notices for insert to authenticated with check (
  author_id = (select auth.uid()) and private.v2_portal_link(athlete_id)
);

-- A Tecnofit client ID is linked explicitly by an administrator. Names alone
-- are not reliable enough to expose payment records to families.
create table if not exists public.v2_tecnofit_athlete_links (
  athlete_id uuid primary key references public.athletes(id) on delete cascade,
  client_id text not null,
  linked_by uuid not null references auth.users(id),
  linked_at timestamptz not null default now()
);
create unique index if not exists v2_tecnofit_one_athlete_per_client
  on public.v2_tecnofit_athlete_links(client_id);
create index if not exists v2_tecnofit_client_idx on public.v2_tecnofit_athlete_links(client_id);
alter table public.v2_tecnofit_athlete_links enable row level security;
create policy v2_tecnofit_links_read on public.v2_tecnofit_athlete_links for select to authenticated using (
  public.finance_has_access() or private.v2_portal_link(athlete_id)
);
create or replace function public.v2_my_invoices()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'athleteId', link.athlete_id, 'reportType', row.report_type,
    'data', row.data, 'importId', row.import_id
  ) order by row.period desc), '[]'::jsonb)
  from public.v2_tecnofit_athlete_links link
  join public.finance_report_rows row on row.data->>'clientId' = link.client_id
    and row.report_type in ('open','receivables')
    and lower(coalesce(row.data->>'item', '')) like 'mensal%'
  where private.v2_portal_link(link.athlete_id);
$$;

revoke all on public.v2_portal_notices, public.v2_tecnofit_athlete_links from anon, authenticated;
grant select, insert on public.v2_portal_notices to authenticated;
grant select on public.v2_tecnofit_athlete_links to authenticated;
revoke all on function public.v2_my_invoices() from public, anon;
grant execute on function public.v2_my_invoices() to authenticated;
revoke all on function private.v2_portal_link(uuid) from public, anon;
grant execute on function private.v2_portal_link(uuid) to authenticated;

commit;
