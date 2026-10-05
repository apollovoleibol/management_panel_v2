-- 025 · Notificações no sistema do celular (Web Push) para o Manager App.
-- 1. push_subscriptions: um registro por aparelho (antes: um por pessoa, em
--    profiles.push_token, que se sobrescrevia ao ativar em outro aparelho).
-- 2. Toda linha nova em notifications dispara a Edge Function push-dispatch,
--    que envia ao celular — inclusive as gravadas direto pelo app (tarefas).
begin;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public, anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;
drop policy if exists push_subscriptions_own_read on public.push_subscriptions;
create policy push_subscriptions_own_read on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists push_subscriptions_own_delete on public.push_subscriptions;
create policy push_subscriptions_own_delete on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

-- Registro feito por função: um aparelho usado por outra conta passa para quem entrou agora.
create or replace function public.register_push_subscription(p_subscription jsonb, p_user_agent text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null or coalesce(p_subscription->>'endpoint', '') = '' then
    raise exception 'Invalid subscription';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, subscription, user_agent)
    values (v_uid, p_subscription->>'endpoint', p_subscription, left(p_user_agent, 300))
    on conflict (endpoint) do update
      set user_id = excluded.user_id, subscription = excluded.subscription,
          user_agent = excluded.user_agent, last_seen_at = now();
  update public.profiles set push_enabled = true where id = v_uid and push_enabled is distinct from true;
end;
$$;
revoke all on function public.register_push_subscription(jsonb, text) from public, anon;
grant execute on function public.register_push_subscription(jsonb, text) to authenticated;

-- Inscrições já existentes (uma por pessoa) passam para a tabela nova
insert into public.push_subscriptions (user_id, endpoint, subscription)
select p.id, (p.push_token::jsonb)->>'endpoint', p.push_token::jsonb
from public.profiles p
where p.push_token is not null and left(p.push_token, 1) = '{'
  and (p.push_token::jsonb)->>'endpoint' is not null
on conflict (endpoint) do nothing;

-- Disparo do envio para cada notificação nova
alter table public.notifications add column if not exists pushed_at timestamptz;

create or replace function private.notifications_push_dispatch()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://hrakdydodcmllwnkmrkg.supabase.co/functions/v1/push-dispatch',
    body := jsonb_build_object('id', new.id),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
end;
$$;
drop trigger if exists notifications_push_dispatch on public.notifications;
create trigger notifications_push_dispatch after insert on public.notifications
  for each row execute function private.notifications_push_dispatch();

commit;
