-- 036 · Durante a troca da forma de pagamento convivem a mensalidade atual e a que vai
-- substituí-la (até a nova ser confirmada). A regra de uma mensalidade aberta por atleta
-- passa a valer para as mensalidades originais; cada mensalidade tem no máximo uma
-- substituta em andamento.
begin;
drop index if exists public.billing_one_open_per_athlete;
create unique index billing_one_open_per_athlete on public.billing_subscriptions(env, athlete_id)
  where status in ('pending', 'active', 'awaiting_choice', 'choosing') and replaces_id is null;
create unique index if not exists billing_one_replacement on public.billing_subscriptions(replaces_id)
  where replaces_id is not null and status in ('pending', 'choosing');
commit;
