# Implantação do Painel de Gestão v2

Status em 29/09/2026: **em desenvolvimento, não publicar como produto**. A v1 continua no ar e o projeto Supabase compartilhado é `hrakdydodcmllwnkmrkg`.

## Confirmado no banco de produção

- O banco contém as tabelas operacionais da v1, mas ainda não contém as quatro tabelas `finance_*` previstas pela migração 012.
- O Supabase Auth tem e-mail e Google ativados. A URL da v2 ainda não está na lista de redirecionamentos; o Site URL continua apontando para o Manager App da v1.
- O gatilho `handle_new_user` atual mantém o vínculo por e-mail com perfis pré-criados. Ele deve ser preservado.
- O papel `anon` podia ler toda a tabela `athletes`, inclusive CPF, pagamento e anamnese. Foi restringido em produção a `id` e `phone`, necessários à busca atual do chatbot. A verificação de privilégios retornou `false` para CPF, `payment_plan` e `health_notes`.
- A política `profiles_update_own` permitia ao próprio usuário tentar mudar `role` e `is_active`. A proteção em `supabase/hotfixes/2026-09-29-profile-escalation.sql` foi aplicada em produção e seu gatilho está habilitado.

## Ainda necessário antes da publicação

1. Validar e aplicar as migrações 012 a 015 no banco real. O projeto tem políticas adicionais criadas diretamente no SQL Editor; todas devem ser avaliadas antes de alterar a RLS. A migração 016 já foi aplicada manualmente em produção.
2. Garantir sigilo financeiro no nível do banco para técnicos e `customer`. Hoje eles compartilham o papel PostgreSQL `authenticated` com administradores, e `athletes` ainda tem `payment_plan` e `payment_bank`. RLS por linha não mascara essas colunas. A solução exige adaptar os leitores da v1 e do Manager App antes de revogar o acesso às colunas ou mover os dados para uma tabela privada.
3. Implementar convite de usuários, edição de permissões, vínculo de atletas e responsáveis, e operação segura de pacotes. Esses controles estão bloqueados na interface para evitar confirmação falsa de gravação.
4. Conectar regras e atualização do Chatbot Feeder ao Apps Script. Descrição e disponibilidade da equipe gravam no Supabase, mas o painel ainda não comprova a atualização do prompt do chatbot.
5. Validar os quatro relatórios Tecnofit em ambiente autenticado e testar importação, cobertura de períodos, alertas e privacidade do portal com contas reais de cada perfil.
6. Adicionar `https://apollovoleibol.github.io/management_panel_v2/login.html` à lista de Redirect URLs do Supabase Auth após os testes. Manter o Site URL da v1. Então ativar GitHub Pages da v2 e testar login Google, e-mail e recuperação de senha no endereço publicado.

## Chaves

O repositório público pode conter a URL do Supabase e a chave `anon`/publishable. A segurança dos dados depende da RLS e dos privilégios de coluna. Chaves `service_role`, tokens e credenciais de provedores nunca devem entrar em HTML, JavaScript, histórico Git ou arquivos distribuídos pelo GitHub Pages. GitHub Actions Secrets só protegem dados usados durante o build/deploy; qualquer valor incorporado ao JavaScript publicado fica público. Segredos de funções Supabase devem ficar nos Secrets do próprio projeto Supabase.
