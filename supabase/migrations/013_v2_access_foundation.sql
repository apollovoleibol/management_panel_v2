-- Apollo v2: access foundation on the existing Manager App Supabase project.
-- Apply after inspecting the live schema and after 012_tecnofit_finance_imports.sql.
-- Existing v1 users and data are retained.

begin;

-- The legacy self-update policy also covered role/is_active. Keep self-service
-- profile edits, but never let a user elevate their own privileges.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active is true
  );
$$;

create or replace function public.get_my_role()
returns text language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p
  where p.id = (select auth.uid()) and p.is_active is true;
$$;

create or replace function public.v2_guard_profile_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not public.is_admin() then
    if new.id is distinct from old.id
      or new.role is distinct from old.role
      or new.is_active is distinct from old.is_active
      or new.email is distinct from old.email then
      raise exception 'Only an administrator may change profile identity or access'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists v2_guard_profile_update on public.profiles;
create trigger v2_guard_profile_update before update on public.profiles
  for each row execute function public.v2_guard_profile_update();

-- Keep the deployed handle_new_user trigger: it links pre-created v1 profiles
-- by e-mail and already refuses to auto-create arbitrary OAuth profiles.

create table if not exists public.v2_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','finance','coordination','attendance','coach')),
  permissions jsonb not null default '{}'::jsonb check (jsonb_typeof(permissions) = 'object'),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.v2_athlete_access (
  user_id uuid not null references auth.users(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  relation text not null check (relation in ('self','guardian')),
  created_at timestamptz not null default now(),
  primary key (user_id, athlete_id)
);

create schema if not exists private;
grant usage on schema private to authenticated;
create or replace function private.v2_role()
returns text language sql stable security definer set search_path = '' as $$
  select case
    when public.is_admin() then 'admin'
    when exists (select 1 from public.v2_staff s where s.user_id = (select auth.uid()))
      then (select s.role from public.v2_staff s
            where s.user_id = (select auth.uid()) and s.is_active is true)
    else (select 'coach' from public.profiles p where p.id = (select auth.uid())
          and p.role = 'coach' and p.is_active is true)
  end;
$$;

create or replace function private.v2_can(p_page text, p_mode text default 'view')
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_role text; v_setting text;
begin
  if p_page not in ('overview','bookings','athletes','teams','packages','feeder','payments','finance','settings')
     or p_mode not in ('view','edit') then return false; end if;
  v_role := private.v2_role();
  if v_role is null then return false; end if;
  if p_page in ('packages','payments','finance') and v_role not in ('admin','finance') then return false; end if;
  if v_role = 'admin' then return true; end if;
  select s.permissions->>p_page into v_setting from public.v2_staff s
    where s.user_id = (select auth.uid()) and s.is_active is true;
  if v_setting is null then
    v_setting := case v_role
      when 'finance' then case when p_page in ('overview','athletes') then 'view'
                               when p_page in ('packages','payments','finance') then 'edit' else 'none' end
      when 'coordination' then case when p_page in ('overview') then 'view'
                                    when p_page in ('bookings','athletes','teams','feeder') then 'edit' else 'none' end
      when 'attendance' then case when p_page in ('overview','athletes','teams','feeder') then 'view'
                                  when p_page = 'bookings' then 'edit' else 'none' end
      when 'coach' then case when p_page in ('overview','bookings','athletes','teams') then 'view' else 'none' end
      else 'none' end;
  end if;
  return v_setting = 'edit' or (p_mode = 'view' and v_setting = 'view');
end;
$$;

create or replace function private.v2_team_scope(p_team uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.v2_role() <> 'coach' or exists (
    select 1 from public.team_coaches tc
    where tc.team_id = p_team and tc.coach_id = (select auth.uid())
  );
$$;

-- Used only to display the caller's own rights; the database remains the
-- authority for every read and write.
create or replace function public.v2_my_access()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'role', private.v2_role(),
    'pages', coalesce((select jsonb_object_agg(page, jsonb_build_object(
      'view', private.v2_can(page, 'view'), 'edit', private.v2_can(page, 'edit')))
      from unnest(array['overview','bookings','athletes','teams','packages','feeder','payments','finance','settings']) as pages(page)), '{}'::jsonb),
    'athleteIds', coalesce((select jsonb_agg(a.athlete_id) from public.v2_athlete_access a
      join public.athletes ath on ath.id = a.athlete_id and ath.is_active is true
      where a.user_id = (select auth.uid())), '[]'::jsonb)
  );
$$;

alter table public.v2_staff enable row level security;
alter table public.v2_athlete_access enable row level security;
create policy v2_staff_select on public.v2_staff for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy v2_staff_admin on public.v2_staff for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy v2_athlete_access_select on public.v2_athlete_access for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy v2_athlete_access_admin on public.v2_athlete_access for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- A family account may read only the linked active athlete. RLS exposes all
-- columns of that row; the portal must select only fields it needs.
create policy v2_family_athlete_select on public.athletes for select to authenticated
  using (is_active is true and exists (
    select 1 from public.v2_athlete_access a
    where a.athlete_id = athletes.id and a.user_id = (select auth.uid())
  ));

-- Remove broad v1 reads before inviting athlete/guardian accounts. Existing
-- admin and coach users retain access; other v2 staff get page-based access.
drop policy if exists tryouts_select on public.tryouts;
drop policy if exists authenticated_view_tryouts on public.tryouts;
drop policy if exists authenticated_select_tryouts on public.tryouts;
create policy v2_tryouts_select on public.tryouts for select to authenticated using (
  (exists (select 1 from public.profiles p where p.id = (select auth.uid())
    and p.role in ('admin','coach') and p.is_active is true))
  or private.v2_can('bookings','view')
);
drop policy if exists cache_select on public.integrations_cache;
drop policy if exists authenticated_view_cache on public.integrations_cache;
create policy v2_cache_select on public.integrations_cache for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid())
    and p.role in ('admin','coach') and p.is_active is true)
);
drop policy if exists training_locations_select on public.training_locations;
create policy v2_training_locations_select on public.training_locations for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid())
    and p.role in ('admin','coach') and p.is_active is true)
  or private.v2_can('teams','view') or private.v2_role() = 'finance'
);

-- Finance role comes from the v2 allowlist. v1 profiles only support admin/coach.
create or replace function public.finance_has_access()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.v2_can('finance','view') and exists (
    select 1 from public.finance_access a where a.user_id = (select auth.uid())
      and a.is_active is true and a.can_view is true
  );
$$;
create or replace function public.finance_can_import()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.finance_has_access() and private.v2_can('finance','edit') and exists (
    select 1 from public.finance_access a where a.user_id = (select auth.uid())
      and a.is_active is true and a.can_import is true
  );
$$;

insert into public.finance_access(user_id, can_view, can_import, is_active)
select p.id, true, true, true from public.profiles p
where p.role = 'admin' and p.is_active is true
on conflict (user_id) do nothing;

revoke all on public.v2_staff, public.v2_athlete_access from anon, authenticated;
grant select, insert, update, delete on public.v2_staff, public.v2_athlete_access to authenticated;
revoke all on function public.v2_my_access() from public, anon;
grant execute on function public.v2_my_access() to authenticated;
revoke all on function private.v2_role() from public, anon;
revoke all on function private.v2_can(text,text) from public, anon;
revoke all on function private.v2_team_scope(uuid) from public, anon;
grant execute on function private.v2_role(), private.v2_can(text,text),
  private.v2_team_scope(uuid) to authenticated;

commit;
