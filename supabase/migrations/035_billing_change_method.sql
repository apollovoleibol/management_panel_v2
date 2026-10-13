-- 035 · Troca da forma de pagamento pela família.
-- A nova mensalidade aponta para a que ela substitui; a anterior só é encerrada
-- quando a nova fica ativa (cartão cadastrado, Pix Automático autorizado ou Pix criado).
begin;
alter table public.billing_subscriptions add column if not exists replaces_id uuid references public.billing_subscriptions(id);
create index if not exists billing_subscriptions_replaces on public.billing_subscriptions(replaces_id);
commit;
