# Implantação do Painel de Gestão v2

Status em 29/09/2026: **em desenvolvimento, não publicar como produto**. A v1 continua no ar e o projeto Supabase compartilhado é `hrakdydodcmllwnkmrkg`.

## Confirmado no banco de produção

- A migração 012 foi aplicada e verificada no banco compartilhado. Existem `finance_access`, `finance_imports`, `finance_report_rows` e `finance_report_coverage`, todas com RLS habilitada. Nenhum relatório foi importado; não há histórico de cobertura ainda.
- O Supabase Auth tem e-mail e Google ativados. A URL da v2 ainda não está na lista de redirecionamentos; o Site URL continua apontando para o Manager App da v1.
- O gatilho `handle_new_user` atual mantém o vínculo por e-mail com perfis pré-criados. Ele deve ser preservado.
- O papel `anon` podia ler toda a tabela `athletes`, inclusive CPF, pagamento e anamnese. Foi restringido em produção a `id` e `phone`, necessários à busca atual do chatbot. A verificação de privilégios retornou `false` para CPF, `payment_plan` e `health_notes`.
- A política `profiles_update_own` permitia ao próprio usuário tentar mudar `role` e `is_active`. A proteção em `supabase/hotfixes/2026-09-29-profile-escalation.sql` foi aplicada em produção e seu gatilho está habilitado.
- A primeira versão da migração 013 foi bloqueada pela revisão automática porque concedia escrita direta a `authenticated` nas tabelas de permissões. Após autorização do usuário, a versão restrita foi aplicada em produção. A consulta de verificação mostrou RLS ativa, `anon` sem `SELECT` e `authenticated` com `SELECT`, sem `INSERT`, `UPDATE` ou `DELETE`, em `v2_staff` e `v2_athlete_access`. Duas contas administradoras foram incluídas em `finance_access`.
- Depois da aplicação, foi identificada a compatibilidade com agendamentos legados sem `team_id` (10 de 182; 9 têm `target_team` correspondente ao nome de uma equipe). A política `v2_tryouts_select` foi ajustada em produção para permitir a leitura desses registros apenas ao técnico vinculado à equipe correspondente. A consulta de verificação confirmou a nova expressão da política; falta teste de interface com uma conta técnica.
- A política legada `athletes_customer_select` dá a todo perfil `customer` leitura de todos os atletas, e as políticas de escrita também são amplas. A migração 015 preparada preserva os `customer` existentes e impede que novos responsáveis herdem essa exceção; ainda não foi aplicada.

## Ainda necessário antes da publicação

1. Validar e aplicar as migrações 014, 015 e 017 no banco real. As migrações 012, 013 e a restrição anônima 016 já foram aplicadas. O projeto tem políticas adicionais criadas diretamente no SQL Editor; revisar seu efeito combinado antes de mudar a RLS.
2. Garantir sigilo financeiro no nível do banco para técnicos e `customer`. Hoje eles compartilham o papel PostgreSQL `authenticated` com administradores, e `athletes` ainda tem `payment_plan` e `payment_bank`. RLS por linha não mascara essas colunas. A solução exige adaptar os leitores da v1 e do Manager App antes de revogar o acesso às colunas ou mover os dados para uma tabela privada.
3. Implantar e testar o convite de usuários pela Edge Function `v2-invite-user`, a edição de permissões e vínculos por RPC e a operação segura de pacotes. O código local dessas primeiras operações está preparado, mas depende das migrações e da função implantada; não convidar usuários ainda.
4. Conectar regras e atualização do Chatbot Feeder ao Apps Script. Descrição e disponibilidade da equipe gravam no Supabase, mas o painel ainda não comprova a atualização do prompt do chatbot.
5. Validar os quatro relatórios Tecnofit em ambiente autenticado e testar importação, cobertura de períodos, alertas e privacidade do portal com contas reais de cada perfil.
6. Adicionar `https://apollovoleibol.github.io/management_panel_v2/login.html` à lista de Redirect URLs do Supabase Auth após os testes. Manter o Site URL da v1. Então ativar GitHub Pages da v2 e testar login Google, e-mail e recuperação de senha no endereço publicado.

**Critério de publicação:** não ativar Pages nem convidar atletas antes de corrigir a exposição das colunas `payment_plan` e `payment_bank` a técnicos e ao `customer` legado. Ocultar campos no JavaScript não protege consultas diretas à API. Também verificar permissões com contas reais de administrador, financeiro, técnico e responsável, e conferir que a v1 continua operando.

## Chaves

O repositório público pode conter a URL do Supabase e a chave `anon`/publishable. A segurança dos dados depende da RLS e dos privilégios de coluna. Chaves `service_role`, tokens e credenciais de provedores nunca devem entrar em HTML, JavaScript, histórico Git ou arquivos distribuídos pelo GitHub Pages. GitHub Actions Secrets só protegem dados usados durante o build/deploy; qualquer valor incorporado ao JavaScript publicado fica público. Segredos de funções Supabase devem ficar nos Secrets do próprio projeto Supabase.
