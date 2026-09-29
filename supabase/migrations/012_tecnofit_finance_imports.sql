-- Tecnofit: somente dados normalizados, sem arquivo original.
-- Aplicar no Supabase principal após conferir o schema real de profiles.
-- Não altera nem remove tabelas/políticas usadas pela v1.
create table if not exists public.finance_access (
  user_id uuid primary key references auth.users(id),
  can_view boolean not null default false,
  can_import boolean not null default false,
  is_active boolean not null default true,
  granted_at timestamptz not null default now(),
  check (not can_import or can_view)
);
create table if not exists public.finance_imports (
  id uuid primary key default gen_random_uuid(),
  report_type text not null check (report_type in ('receivables','open','flow','statement')),
  period_start date not null,
  period_end date not null,
  row_count integer not null check (row_count between 0 and 5000),
  imported_at timestamptz not null default now(),
  imported_by uuid not null references auth.users(id),
  check (period_start <= period_end)
);

create table if not exists public.finance_report_rows (
  report_type text not null check (report_type in ('receivables','open','flow','statement')),
  period date not null,
  source_key text not null,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  import_id uuid not null references public.finance_imports(id),
  primary key (report_type, period, source_key)
);
create index if not exists finance_report_rows_import_idx on public.finance_report_rows(import_id);

create table if not exists public.finance_report_coverage (
  report_type text not null check (report_type in ('receivables','open','flow','statement')),
  period date not null,
  import_id uuid not null references public.finance_imports(id),
  imported_at timestamptz not null,
  primary key (report_type, period)
);

create or replace function public.finance_has_access()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p join public.finance_access a on a.user_id = p.id
    where p.id = auth.uid() and p.is_active is true and a.is_active and a.can_view
      and p.role in ('admin', 'financeiro', 'finance', 'financial')
  );
$$;

create or replace function public.finance_can_import()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.finance_has_access() and exists (
    select 1 from public.finance_access a
    where a.user_id = auth.uid() and a.is_active and a.can_import
  );
$$;

alter table public.finance_access enable row level security;
alter table public.finance_imports enable row level security;
alter table public.finance_report_rows enable row level security;
alter table public.finance_report_coverage enable row level security;

create policy finance_imports_read on public.finance_imports for select to authenticated using (public.finance_has_access());
create policy finance_rows_read on public.finance_report_rows for select to authenticated using (public.finance_has_access());
create policy finance_coverage_read on public.finance_report_coverage for select to authenticated using (public.finance_has_access());

revoke all on public.finance_access, public.finance_imports, public.finance_report_rows, public.finance_report_coverage from anon, authenticated;
grant select on public.finance_imports, public.finance_report_rows, public.finance_report_coverage to authenticated;

create or replace function public.finance_import_report(
  p_report_type text, p_period_start date, p_period_end date, p_rows jsonb
)
returns table(import_id uuid, imported_at timestamptz, row_count integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_at timestamptz;
  v_count integer;
begin
  if not public.finance_can_import() then
    raise exception 'Sem permissão para importar relatórios financeiros' using errcode = '42501';
  end if;
  if p_report_type not in ('receivables','open','flow','statement')
     or p_period_start is null or p_period_end is null
     or p_period_start > p_period_end
     or p_period_end >= p_period_start + interval '24 months' then
    raise exception 'Tipo ou período inválido';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Linhas inválidas';
  end if;
  v_count := jsonb_array_length(p_rows);
  if v_count not between 0 and 5000 then
    raise exception 'Quantidade de linhas inválida';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) e
    where jsonb_typeof(e) <> 'object'
      or e->>'key' is null or length(e->>'key') not between 1 and 300
      or (e->>'period') !~ '^[0-9]{4}-[0-9]{2}-01$'
      or jsonb_typeof(e->'data') <> 'object'
  ) then
    raise exception 'Estrutura das linhas inválida';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) e
    where (e->>'period')::date < date_trunc('month', p_period_start)::date
       or (e->>'period')::date > date_trunc('month', p_period_end)::date
  ) then
    raise exception 'Há linhas fora do período declarado';
  end if;

  -- Uma transação por relatório; reimportar substitui os meses cobertos.
  perform pg_advisory_xact_lock(hashtext('apollo-finance-' || p_report_type));
  insert into public.finance_imports(report_type, period_start, period_end, row_count, imported_by)
  values (p_report_type, p_period_start, p_period_end, v_count, auth.uid())
  returning id, finance_imports.imported_at into v_id, v_at;

  if p_report_type = 'open' then
    -- Vendas em Aberto é uma fotografia completa: pagamentos posteriores retiram dívidas antigas.
    delete from public.finance_report_rows where report_type = 'open';
    delete from public.finance_report_coverage where report_type = 'open';
  else
    delete from public.finance_report_rows
      where report_type = p_report_type
        and period between date_trunc('month', p_period_start)::date and date_trunc('month', p_period_end)::date;
    delete from public.finance_report_coverage
      where report_type = p_report_type
        and period between date_trunc('month', p_period_start)::date and date_trunc('month', p_period_end)::date;
  end if;

  insert into public.finance_report_rows(report_type, period, source_key, data, import_id)
  select p_report_type, (e->>'period')::date, e->>'key', e->'data', v_id
  from jsonb_array_elements(p_rows) e;

  insert into public.finance_report_coverage(report_type, period, import_id, imported_at)
  select p_report_type, g::date, v_id, v_at
  from generate_series(date_trunc('month', p_period_start), date_trunc('month', p_period_end), interval '1 month') g;

  return query select v_id, v_at, v_count;
end;
$$;

revoke all on function public.finance_has_access() from public, anon;
grant execute on function public.finance_has_access() to authenticated;
revoke all on function public.finance_can_import() from public, anon;
grant execute on function public.finance_can_import() to authenticated;
revoke all on function public.finance_import_report(text,date,date,jsonb) from public, anon;
grant execute on function public.finance_import_report(text,date,date,jsonb) to authenticated;
