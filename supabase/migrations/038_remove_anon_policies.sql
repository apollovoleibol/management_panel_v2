-- 038 · Remove regras antigas que davam acesso a visitantes sem login (chave pública).
-- O RLS já estava ativo em todas as tabelas, mas estas regras anulavam a proteção:
--   athletes: qualquer visitante lia todas as fichas (CPF, endereço, saúde) e podia inserir;
--   tryouts:  qualquer visitante podia criar agendamentos.
-- O chatbot usa a chave de servidor (service role), que não depende destas regras.
-- Mantida: leitura pública das datas sem treino (team_unavailable_dates), sem dados pessoais.
begin;
drop policy if exists chatbot_select_athletes on public.athletes;
drop policy if exists chatbot_insert_athletes on public.athletes;
drop policy if exists anon_insert_tryouts on public.tryouts;
commit;
