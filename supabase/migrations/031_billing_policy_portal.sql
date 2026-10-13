-- Versioned pricing and family-scoped payment/fiscal reads. No change to old titles.
begin;
create table public.billing_policy_versions (
 id uuid primary key default gen_random_uuid(), version bigint generated always as identity unique,
 policy jsonb not null, created_at timestamptz not null default now(), created_by uuid references auth.users(id)
);
create table private.billing_engine_config (singleton boolean primary key default true check(singleton), worker_ready boolean not null default false);
insert into private.billing_engine_config default values;
alter table private.billing_engine_config enable row level security;
revoke all on private.billing_engine_config from public,anon,authenticated;
grant select,update on private.billing_engine_config to service_role;
insert into public.billing_policy_versions(policy) values
 ('{"enabled":false,"methods":{"PIX":0,"CREDIT_CARD":0},"graceDays":0,"fine":{"type":"PERCENTAGE","value":0},"tiers":[{"fromDay":1,"rate":0,"period":"month"}]}');
alter table public.billing_policy_versions enable row level security;
revoke all on public.billing_policy_versions from anon,authenticated;
grant select on public.billing_policy_versions to authenticated;
create policy billing_policy_read on public.billing_policy_versions for select to authenticated using(private.v2_can('billing','view'));

alter table public.billing_subscriptions
 add column base_cents integer check(base_cents > 0),
 add column base_override_reason text,
 add column package_name text,
 add column policy_version bigint references public.billing_policy_versions(version),
 add column policy_snapshot jsonb,
 add column creation_error text;
-- Prevent two concurrent create requests from issuing duplicate recurrences.
create unique index billing_one_open_per_athlete on public.billing_subscriptions(env,athlete_id) where status in ('pending','active');
alter table public.billing_payments
 add column base_cents integer,
 add column method_adjustment_cents integer,
 add column principal_cents integer,
 add column fine_cents integer,
 add column interest_cents integer,
 add column policy_snapshot jsonb,
 add column package_name text,
 add column reference_month text,
 add column quote_state text not null default 'legacy' check(quote_state in ('legacy','current','updating','uncertain','settled','discrepancy')),
 add column quote_date date,
 add column quote_error text,
 add column quote_lock uuid,
 add column quote_lock_until timestamptz;
create table public.billing_invoices (
 asaas_invoice_id text primary key, env text not null check(env in ('sandbox','production')),
 asaas_payment_id text, status text not null, number text, effective_date date,
 pdf_url text, xml_url text, status_description text, value_cents integer,
 updated_at timestamptz not null default now()
);
create index billing_invoices_payment on public.billing_invoices(asaas_payment_id);
alter table public.billing_invoices enable row level security;
revoke all on public.billing_invoices from anon,authenticated;
grant select on public.billing_invoices to authenticated;
create policy billing_invoices_staff on public.billing_invoices for select to authenticated using(private.v2_can('billing','view'));
-- These tables are not writable by the browser, including staff.
grant all on public.billing_policy_versions,public.billing_invoices to service_role;
grant usage,select on sequence public.billing_policy_versions_version_seq to service_role;

create function private.billing_validate_policy(p jsonb) returns void language plpgsql immutable set search_path='' as $$
declare v numeric; t jsonb; prev_day integer:=0; d integer; typ text; count_t integer:=0;
begin
 if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p->'enabled') is distinct from 'boolean'
 or jsonb_typeof(p->'methods') is distinct from 'object' or jsonb_typeof(p->'fine') is distinct from 'object'
 or jsonb_typeof(p->'tiers') is distinct from 'array' or jsonb_typeof(p->'graceDays') is distinct from 'number' then
  raise exception 'Formato da regra de cobrança inválido'; end if;
 if (select count(*) from jsonb_object_keys(p->'methods'))<>2 then raise exception 'Configure somente Pix e cartão'; end if;
 if (p->>'graceDays')::numeric <> trunc((p->>'graceDays')::numeric) or (p->>'graceDays')::numeric not between 0 and 365 then
  raise exception 'Tolerância deve estar entre 0 e 365 dias'; end if;
 foreach typ in array array['PIX','CREDIT_CARD'] loop
  if jsonb_typeof(p->'methods'->typ) is distinct from 'number' then raise exception 'Percentual da modalidade inválido'; end if;
  v:=(p->'methods'->>typ)::numeric;
  if v not between -99 and 100 or v<>round(v,4) then raise exception 'Percentual da modalidade deve estar entre -99 e 100, com até quatro casas'; end if;
 end loop;
 typ:=p->'fine'->>'type';
 if typ not in ('PERCENTAGE','FIXED') or typ is null or jsonb_typeof(p->'fine'->'value') is distinct from 'number' then raise exception 'Multa inválida'; end if;
 v:=(p->'fine'->>'value')::numeric;
 if v<0 or v>2147483647 or v<>round(v,4) or (typ='PERCENTAGE' and v>2) or (typ='FIXED' and v<>trunc(v)) then raise exception 'Multa percentual máxima de 2%%; valor fixo em centavos'; end if;
 for t in select value from jsonb_array_elements(p->'tiers') loop
  count_t:=count_t+1;
  if jsonb_typeof(t->'fromDay') is distinct from 'number' or jsonb_typeof(t->'rate') is distinct from 'number' then raise exception 'Faixa inválida'; end if;
  v:=(t->>'fromDay')::numeric;
  if v<>trunc(v) or v not between 1 and 36500 then raise exception 'Dia inicial da faixa inválido'; end if;
  d:=v::integer;
  if d<=prev_day or (count_t=1 and d<>1) then raise exception 'Faixas devem iniciar no dia 1 e ser crescentes'; end if;
  prev_day:=d; v:=(t->>'rate')::numeric;
  if v not between 0 and 100 or v<>round(v,4) or coalesce(t->>'period','') not in ('day','week','month') then raise exception 'Taxa ou período da faixa inválido'; end if;
 end loop;
 if count_t not between 1 and 20 then raise exception 'Configure de uma a vinte faixas'; end if;
end; $$;
revoke all on function private.billing_validate_policy(jsonb) from public,anon,authenticated;

create function public.billing_get_policy() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.v2_can('billing','view') then raise exception 'Acesso negado' using errcode='42501'; end if;
 select jsonb_build_object('id',id,'version',version,'policy',policy,'created_at',created_at,
  'workerReady',(select worker_ready from private.billing_engine_config where singleton)) into result
 from public.billing_policy_versions order by version desc limit 1;
 return result;
end; $$;
create function public.billing_save_policy(p_policy jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare row public.billing_policy_versions;
begin
 if not private.v2_can('billing','edit') then raise exception 'Acesso negado' using errcode='42501'; end if;
 perform private.billing_validate_policy(p_policy);
 if (p_policy->>'enabled')::boolean and not (select worker_ready from private.billing_engine_config where singleton) then
  raise exception 'Configure e valide o processamento periódico antes de ativar encargos. O simulador permanece disponível.';
 end if;
 -- Serialize publication of versions; existing snapshots are never changed.
 perform pg_advisory_xact_lock(31031031);
 insert into public.billing_policy_versions(policy,created_by) values(p_policy,auth.uid()) returning * into row;
 return jsonb_build_object('id',row.id,'version',row.version,'policy',row.policy);
end; $$;

create function public.billing_portal_data() returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object(
 'subscriptions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'athlete_id',s.athlete_id,'env',s.env,'method',s.method,'status',s.status,
 'value_cents',s.value_cents,'base_cents',s.base_cents,'package_name',s.package_name,'checkout_url',s.checkout_url,'due_day',s.due_day))
 from public.billing_subscriptions s where private.v2_portal_link(s.athlete_id)), '[]'::jsonb),
 'payments',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'athlete_id',s.athlete_id,'subscription_id',s.id,'env',p.env,
 'asaas_payment_id',p.asaas_payment_id,'billing_type',p.billing_type,'status',p.status,'value_cents',p.value_cents,'due_date',p.due_date,'paid_at',p.paid_at,
 'base_cents',p.base_cents,'method_adjustment_percent',p.policy_snapshot->'methods'->p.billing_type,'method_adjustment_cents',p.method_adjustment_cents,'principal_cents',p.principal_cents,'fine_cents',p.fine_cents,
 'forecast_terms',case when p.policy_snapshot is not null then jsonb_build_object('enabled',p.policy_snapshot->'enabled','graceDays',p.policy_snapshot->'graceDays','fine',p.policy_snapshot->'fine','tiers',p.policy_snapshot->'tiers') else null end,
 'interest_cents',p.interest_cents,'package_name',p.package_name,'reference_month',p.reference_month,'quote_state',p.quote_state,'quote_date',p.quote_date)
 order by p.due_date desc) from public.billing_payments p join public.billing_subscriptions s on s.id=p.subscription_id and s.env=p.env
 where private.v2_portal_link(s.athlete_id)), '[]'::jsonb),
 'invoices',coalesce((select jsonb_agg(to_jsonb(i)) from public.billing_invoices i
 join public.billing_payments p on p.asaas_payment_id=i.asaas_payment_id and p.env=i.env
 join public.billing_subscriptions s on s.id=p.subscription_id and s.env=p.env
 where private.v2_portal_link(s.athlete_id)), '[]'::jsonb)); $$;

-- Edge endpoint checks family scope with caller JWT before using service credentials.
create function public.billing_portal_can_pay(p_payment_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.billing_payments p join public.billing_subscriptions s on s.id=p.subscription_id and s.env=p.env
  where p.id=p_payment_id and private.v2_portal_link(s.athlete_id)); $$;

create function public.billing_policy_history() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.v2_can('billing','view') then raise exception 'Acesso negado' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(v)) from (select id,version,policy,created_at,created_by from public.billing_policy_versions order by version desc limit 50) v),'[]'::jsonb);
end; $$;
revoke all on function public.billing_policy_history() from public,anon;
grant execute on function public.billing_policy_history() to authenticated;

create function public.billing_claim_payment(p_payment_id uuid,p_lock uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare row public.billing_payments;
begin
 update public.billing_payments set quote_lock=p_lock,quote_lock_until=now()+interval '2 minutes'
 where id=p_payment_id and (quote_lock_until is null or quote_lock_until<now())
 returning * into row;
 if row.id is null then return null; end if;
 return to_jsonb(row);
end; $$;
create function public.billing_release_payment(p_payment_id uuid,p_lock uuid) returns void language sql security definer set search_path='' as $$
 update public.billing_payments set quote_lock=null,quote_lock_until=null where id=p_payment_id and quote_lock=p_lock; $$;
revoke all on function public.billing_claim_payment(uuid,uuid), public.billing_release_payment(uuid,uuid) from public,anon,authenticated;
grant execute on function public.billing_claim_payment(uuid,uuid), public.billing_release_payment(uuid,uuid) to service_role;
revoke all on function public.billing_get_policy(),public.billing_save_policy(jsonb),public.billing_portal_data(),public.billing_portal_can_pay(uuid) from public,anon;
grant execute on function public.billing_get_policy(),public.billing_save_policy(jsonb),public.billing_portal_data(),public.billing_portal_can_pay(uuid) to authenticated;
commit;
