-- Read-only compatibility check for the shared Apollo Supabase project.
-- Run in SQL Editor. It returns schema and policy metadata, no athlete rows.
select table_name, column_name, data_type, udt_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'profiles', 'teams', 'team_coaches', 'athletes', 'tryouts',
    'training_locations', 'team_unavailable_dates', 'training_logs',
    'attendance', 'competitions', 'integrations_cache',
    'finance_access', 'finance_imports', 'finance_report_rows',
    'finance_report_coverage'
  )
order by table_name, ordinal_position;

select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'profiles', 'teams', 'team_coaches', 'athletes', 'tryouts',
    'training_locations', 'team_unavailable_dates', 'training_logs',
    'attendance', 'competitions', 'integrations_cache'
  )
order by tablename, policyname;

select c.relname as table_name, c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in (
  'profiles', 'teams', 'team_coaches', 'athletes', 'tryouts',
  'training_locations', 'team_unavailable_dates', 'training_logs',
  'attendance', 'competitions', 'integrations_cache'
)
order by c.relname;

select p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (
  'is_admin', 'get_my_role', 'handle_new_user',
  'finance_has_access', 'finance_can_import', 'finance_import_report'
)
order by p.proname;
