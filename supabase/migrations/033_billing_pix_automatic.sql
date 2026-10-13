-- Real Pix Automático Journey 3, distinct from ordinary PIX recurring invoices.
-- Disabled until account eligibility and sandbox contract/timing are validated.
begin;
alter table public.billing_subscriptions add column automatic_mode text
 check(automatic_mode is null or automatic_mode='PIX_AUTOMATIC');
alter table public.billing_payments add column pix_transaction_id text, add column pix_conciliation_id text;
create index billing_payment_pix_conciliation on public.billing_payments(env,pix_conciliation_id);
create table public.billing_pix_automatic_config (
 env text primary key check(env in ('sandbox','production')),
 enabled boolean not null default false, sandbox_validated boolean not null default false,
 eligibility text not null default 'UNKNOWN' check(eligibility in ('UNKNOWN','ELIGIBLE','INELIGIBLE')),
 account_id text, updated_at timestamptz not null default now()
);
insert into public.billing_pix_automatic_config(env) values('sandbox'),('production');
create table public.billing_pix_authorizations (
 id uuid primary key default gen_random_uuid(), subscription_id uuid not null unique references public.billing_subscriptions(id),
 env text not null check(env in ('sandbox','production')), contract_id text not null unique check(length(contract_id)<=35),
 customer_asaas_id text not null, value_cents integer not null check(value_cents>=500),
 first_competence text not null check(first_competence ~ '^\d{4}-\d{2}$'), start_date date not null,
 consent_token uuid not null default gen_random_uuid(), consent_expires_at timestamptz not null,
 consented_by uuid references auth.users(id), consented_at timestamptz,
 state text not null default 'PREPARED' check(state in ('PREPARED','CREATING','CREATED','ACTIVE','RECONCILING','REFUSED','CANCELLED','EXPIRED','UNCERTAIN')),
 provider_status text check(provider_status in ('CREATED','ACTIVE','REFUSED','CANCELLED','EXPIRED')),
 asaas_authorization_id text unique, asaas_subscription_id text, recurrence_confirmed boolean not null default false,
 request_body jsonb not null, qr_payload text, qr_image text, qr_expiration text, conciliation_id text,
 initial_payment_id text unique, initial_payment_status text,
 last_error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(not recurrence_confirmed or (provider_status='ACTIVE' and state='ACTIVE' and asaas_subscription_id is not null))
);
create table public.billing_pix_payment_instructions (
 env text not null check(env in ('sandbox','production')), asaas_instruction_id text not null,
 authorization_id uuid not null references public.billing_pix_authorizations(id), asaas_payment_id text not null,
 status text not null check(status in ('AWAITING_REQUEST','SCHEDULED','DONE','CANCELLED','REFUSED')),
 due_date date, refusal_reason text, updated_at timestamptz not null default now(),
 primary key(env,asaas_instruction_id)
);
create index billing_pix_instruction_payment on public.billing_pix_payment_instructions(env,asaas_payment_id);
alter table public.billing_pix_automatic_config enable row level security;
alter table public.billing_pix_authorizations enable row level security;
alter table public.billing_pix_payment_instructions enable row level security;
revoke all on public.billing_pix_automatic_config,public.billing_pix_authorizations,public.billing_pix_payment_instructions from public,anon,authenticated;
grant all on public.billing_pix_automatic_config,public.billing_pix_authorizations,public.billing_pix_payment_instructions to service_role;
create function public.billing_portal_can_manage_subscription(p_subscription_id uuid) returns boolean
 language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.billing_subscriptions s where s.id=p_subscription_id and private.v2_portal_link(s.athlete_id)); $$;
revoke all on function public.billing_portal_can_manage_subscription(uuid) from public,anon;
grant execute on function public.billing_portal_can_manage_subscription(uuid) to authenticated;

-- Preserve the existing family-scoped projection and add sanitized automation
-- state; do not expose customer identifiers, QR tokens, or raw authorization data.
alter function public.billing_portal_data() rename to billing_portal_base_data;
revoke all on function public.billing_portal_base_data() from public,anon,authenticated;
create function public.billing_portal_data() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 result:=public.billing_portal_base_data();
 result:=jsonb_set(result,'{subscriptions}',coalesce((select jsonb_agg(j.value || jsonb_build_object(
  'automatic_mode',s.automatic_mode,
  'pix_authorization_available',s.automatic_mode='PIX_AUTOMATIC' and coalesce(c.enabled and c.sandbox_validated and c.eligibility='ELIGIBLE',false),
  'pix_authorization_status',a.provider_status,'pix_automatic_ready',coalesce(a.state='ACTIVE' and a.recurrence_confirmed,false),
  'automatic_status',a.state,
  'card_automatic_ready',s.method='CREDIT_CARD' and s.status='active' and s.asaas_subscription_id is not null))
  from jsonb_array_elements(result->'subscriptions') j
  join public.billing_subscriptions s on s.id=(j.value->>'id')::uuid
  left join public.billing_pix_authorizations a on a.subscription_id=s.id and a.env=s.env
  left join public.billing_pix_automatic_config c on c.env=s.env),'[]'::jsonb));
 result:=jsonb_set(result,'{payments}',coalesce((select jsonb_agg(j.value || jsonb_build_object(
  'automatic_debit_status',i.status,
  'automatic_debit_ready',coalesce(a.state='ACTIVE' and a.recurrence_confirmed and i.status='SCHEDULED',false)))
  from jsonb_array_elements(result->'payments') j
  left join lateral(select x.* from public.billing_pix_payment_instructions x
   where x.env=j.value->>'env' and x.asaas_payment_id=j.value->>'asaas_payment_id' order by x.updated_at desc limit 1) i on true
  left join public.billing_pix_authorizations a on a.id=i.authorization_id and a.subscription_id=(j.value->>'subscription_id')::uuid and a.env=j.value->>'env'),'[]'::jsonb));
 return result;
end; $$;
revoke all on function public.billing_portal_data() from public,anon;
grant execute on function public.billing_portal_data() to authenticated;
commit;
