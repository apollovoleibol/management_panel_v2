-- Shared v1/v2 project: prevent any non-admin from changing their own role,
-- active flag, e-mail or primary key through profiles_update_own.
begin;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active is true);
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
commit;
