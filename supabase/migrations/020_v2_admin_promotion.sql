-- Huddle-only administrator promotion. Never change public.profiles.role: the v1
-- panel continues to use that legacy role, so this migration does not grant v1
-- administrator access to newly promoted Huddle users.
begin;

create or replace function private.v2_role()
returns text language sql stable security definer set search_path = '' as $$
  select case
    when not exists (select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_active is true) then null
    when public.is_admin() then 'admin'
    when exists (select 1 from public.v2_staff s where s.user_id = (select auth.uid()))
      then (select s.role from public.v2_staff s
            where s.user_id = (select auth.uid()) and s.is_active is true)
    else (select 'coach' from public.profiles p where p.id = (select auth.uid())
          and p.role = 'coach' and p.is_active is true)
  end;
$$;

-- Browser clients still have SELECT only; administrative mutations use RPCs.
drop policy if exists v2_staff_select on public.v2_staff;
create policy v2_staff_select on public.v2_staff for select to authenticated
  using (user_id = (select auth.uid()) or private.v2_role() = 'admin');
drop policy if exists v2_athlete_access_select on public.v2_athlete_access;
create policy v2_athlete_access_select on public.v2_athlete_access for select to authenticated
  using (user_id = (select auth.uid()) or private.v2_role() = 'admin');
create or replace function public.v2_admin_set_staff(
  p_user uuid, p_role text, p_permissions jsonb, p_active boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_legacy_role text;
begin
  if private.v2_role() <> 'admin' or not private.v2_can('settings','edit') then
    raise exception 'Administrator required' using errcode = '42501';
  end if;
  if p_user is null or p_role is null
    or p_role not in ('admin','finance','coordination','attendance','coach')
    or p_active is null or jsonb_typeof(p_permissions) is distinct from 'object' then
    raise exception 'Invalid staff access';
  end if;
  if exists (select 1 from jsonb_each_text(p_permissions) setting
             where setting.key not in ('overview','bookings','athletes','teams','packages','feeder','payments','finance','settings')
                or setting.value not in ('none','view','edit')) then
    raise exception 'Invalid page permission';
  end if;
  if p_role not in ('admin','finance') and exists (
    select 1 from jsonb_each_text(p_permissions) setting
    where setting.key in ('packages','payments','finance') and setting.value <> 'none'
  ) then
    raise exception 'Financial pages require admin or finance role';
  end if;
  select p.role into v_legacy_role from public.profiles p
    where p.id = p_user and p.is_active is true;
  if v_legacy_role is null then raise exception 'Active profile required'; end if;
  if p_role = 'admin' and v_legacy_role <> 'admin'
    and not exists (select 1 from public.v2_staff s where s.user_id = p_user)
    and v_legacy_role <> 'coach' then
    raise exception 'Promote an existing staff account, not an athlete or guardian account';
  end if;
  if v_legacy_role = 'admin' and p_role <> 'admin' then
    raise exception 'Legacy administrators cannot be demoted from Huddle';
  end if;
  if p_user = (select auth.uid()) and (p_role <> 'admin' or not p_active) then
    raise exception 'An administrator cannot remove their own access';
  end if;
  if p_role = 'coach' and v_legacy_role <> 'coach' then
    raise exception 'Coach role requires a coach profile';
  end if;
  if v_legacy_role = 'admin' and not p_active then
    raise exception 'Legacy administrators must remain active in both systems';
  end if;
  insert into public.v2_staff(user_id,role,permissions,is_active)
    values (p_user,p_role,p_permissions,p_active)
    on conflict (user_id) do update set role = excluded.role,
      permissions = excluded.permissions, is_active = excluded.is_active;
  if p_role in ('admin','finance') and p_active then
    insert into public.finance_access(user_id,can_view,can_import,is_active)
      values (p_user,true,true,true)
      on conflict (user_id) do update set can_view = true, can_import = true, is_active = true;
  else
    update public.finance_access set can_view = false, can_import = false, is_active = false
      where user_id = p_user;
  end if;
end;
$$;

create or replace function public.v2_admin_link_athlete(
  p_user uuid, p_athlete uuid, p_relation text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_birth date;
begin
  if private.v2_role() <> 'admin' or not private.v2_can('settings','edit') then
    raise exception 'Administrator required' using errcode = '42501';
  end if;
  if p_relation not in ('self','guardian') then raise exception 'Invalid relation'; end if;
  if not exists (select 1 from auth.users u where u.id = p_user) then
    raise exception 'Account not found';
  end if;
  select a.birth_date into v_birth from public.athletes a
    where a.id = p_athlete and a.is_active is true;
  if not found then raise exception 'Active athlete not found'; end if;
  if (v_birth is null or v_birth > current_date - interval '18 years')
       and p_relation <> 'guardian' then
    raise exception 'A minor requires a guardian account';
  end if;
  if v_birth <= current_date - interval '18 years' and p_relation <> 'self' then
    raise exception 'An adult athlete uses their own account';
  end if;
  insert into public.v2_athlete_access(user_id,athlete_id,relation)
    values (p_user,p_athlete,p_relation)
    on conflict (user_id,athlete_id) do update set relation = excluded.relation;
end;
$$;

create or replace function public.v2_admin_unlink_athlete(
  p_user uuid, p_athlete uuid
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if private.v2_role() <> 'admin' or not private.v2_can('settings','edit') then
    raise exception 'Administrator required' using errcode = '42501';
  end if;
  delete from public.v2_athlete_access
    where user_id = p_user and athlete_id = p_athlete;
end;
$$;

revoke all on function public.v2_admin_set_staff(uuid,text,jsonb,boolean) from public,anon;
revoke all on function public.v2_admin_link_athlete(uuid,uuid,text) from public,anon;
revoke all on function public.v2_admin_unlink_athlete(uuid,uuid) from public,anon;
grant execute on function public.v2_admin_set_staff(uuid,text,jsonb,boolean),
  public.v2_admin_link_athlete(uuid,uuid,text),
  public.v2_admin_unlink_athlete(uuid,uuid) to authenticated;

commit;
