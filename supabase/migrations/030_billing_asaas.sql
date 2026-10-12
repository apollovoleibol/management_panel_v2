-- 030 · Mensalidades próprias (Asaas). Começa no sandbox.
-- billing_customers: pagador no Asaas (responsável ou o próprio atleta adulto).
-- billing_subscriptions: mensalidade recorrente de um atleta (Pix mensal ou cartão recorrente).
-- billing_payments: cada cobrança gerada pelo Asaas, atualizada pelos avisos (webhook).
-- billing_events: registro bruto e idempotente dos avisos recebidos.
-- Nova página 'billing' (Mensalidades): administração e financeiro.
begin;

create table if not exists public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  asaas_id text unique,
  env text not null default 'sandbox' check (env in ('sandbox', 'production')),
  name text not null,
  cpf_cnpj text not null,
  email text,
  phone text,
  created_at timestamptz not null default now()
);
create unique index if not exists billing_customers_doc_env on public.billing_customers(env, cpf_cnpj);

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  env text not null default 'sandbox' check (env in ('sandbox', 'production')),
  athlete_id uuid not null references public.athletes(id) on delete restrict,
  customer_id uuid not null references public.billing_customers(id),
  method text not null check (method in ('PIX', 'CREDIT_CARD')),
  value_cents integer not null check (value_cents > 0),
  due_day integer not null check (due_day between 1 and 28),
  description text not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'canceled', 'expired')),
  asaas_subscription_id text unique,
  asaas_checkout_id text unique,
  checkout_url text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists billing_subscriptions_athlete on public.billing_subscriptions(athlete_id);

create table if not exists public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  env text not null default 'sandbox',
  asaas_payment_id text unique not null,
  asaas_subscription_id text,
  subscription_id uuid references public.billing_subscriptions(id) on delete set null,
  athlete_id uuid references public.athletes(id) on delete set null,
  value_cents integer,
  net_cents integer,
  billing_type text,
  status text,
  due_date date,
  paid_at date,
  invoice_url text,
  updated_at timestamptz not null default now()
);
create index if not exists billing_payments_sub on public.billing_payments(subscription_id);

create table if not exists public.billing_events (
  id text primary key,
  event text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);

alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.billing_payments enable row level security;
alter table public.billing_events enable row level security;
revoke all on public.billing_customers, public.billing_subscriptions, public.billing_payments, public.billing_events from anon;

-- Leitura pelo painel; escrita só pelas funções (chave de serviço)
create policy billing_customers_read on public.billing_customers for select to authenticated using (private.v2_can('billing', 'view'));
create policy billing_subscriptions_read on public.billing_subscriptions for select to authenticated using (private.v2_can('billing', 'view'));
create policy billing_payments_read on public.billing_payments for select to authenticated using (private.v2_can('billing', 'view'));
create policy billing_events_read on public.billing_events for select to authenticated using (private.v2_can('billing', 'view'));

-- Página 'billing' nas permissões do Huddle (como Pagamentos: só administração e financeiro)
create or replace function private.v2_can(p_page text, p_mode text default 'view')
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_role text; v_setting text;
begin
  if p_page not in ('overview','bookings','athletes','teams','packages','feeder','payments','billing','finance','settings')
     or p_mode not in ('view','edit') then return false; end if;
  v_role := private.v2_role();
  if v_role is null then return false; end if;
  if p_page in ('packages','payments','billing','finance') and v_role not in ('admin','finance') then return false; end if;
  if v_role = 'admin' then return true; end if;
  select s.permissions->>p_page into v_setting from public.v2_staff s
    where s.user_id = (select auth.uid()) and s.is_active is true;
  if v_setting is null then
    v_setting := case v_role
      when 'finance' then case when p_page in ('overview','athletes') then 'view'
                               when p_page in ('packages','payments','billing','finance') then 'edit' else 'none' end
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

create or replace function public.v2_my_access()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('role', private.v2_role(),
    'pages', coalesce((select jsonb_object_agg(page, jsonb_build_object('view', private.v2_can(page, 'view'), 'edit', private.v2_can(page, 'edit')))
      from unnest(array['overview','bookings','athletes','teams','packages','feeder','payments','billing','finance','settings']) as pages(page)), '{}'::jsonb),
    'athleteIds', coalesce((select jsonb_agg(a.athlete_id) from public.v2_athlete_access a
      where a.user_id = (select auth.uid()) and private.v2_portal_link(a.athlete_id)), '[]'::jsonb));
$$;

commit;
