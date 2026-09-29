-- Give existing active v1 reception users the matching v2 attendance role.
-- No athlete/guardian accounts are enrolled here. Existing explicit v2 roles win.
begin;

insert into public.v2_staff (user_id, role, permissions, is_active)
select p.id, 'attendance', '{}'::jsonb, true
from public.profiles p
join auth.users u on u.id = p.id
join private.v2_legacy_customers legacy on legacy.user_id = p.id
where p.role = 'customer' and p.is_active is true
on conflict (user_id) do nothing;

commit;
