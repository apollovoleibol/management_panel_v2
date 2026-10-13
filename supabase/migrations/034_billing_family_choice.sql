-- 034 · A família escolhe a forma de pagamento.
-- A administração cria a mensalidade (atleta, valor, vencimento) e ela fica em
-- 'awaiting_choice' até quem paga (atleta adulto ou responsável) escolher, na
-- Área do atleta, cartão recorrente, Pix Automático ou Pix mensal.
-- 'choosing' é uma trava curta enquanto a escolha é registrada no Asaas.
begin;
alter table public.billing_subscriptions drop constraint if exists billing_subscriptions_status_check;
alter table public.billing_subscriptions add constraint billing_subscriptions_status_check
  check (status in ('awaiting_choice', 'choosing', 'pending', 'active', 'canceled', 'expired'));
commit;
