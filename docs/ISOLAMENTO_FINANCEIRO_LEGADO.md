# Isolamento dos campos financeiros legados

Estado: a migração preparatória [018](../supabase/migrations/018_private_legacy_payment_fields.sql) foi aplicada após autorização do usuário. Ela copiou os 201 atletas e as 16 equipes para tabelas privadas e confirmou zero divergências. Os campos legados permanecem preenchidos e acessíveis pelas políticas antigas; o isolamento ainda não foi concluído.

## Evidência no projeto compartilhado

- `athletes.payment_plan`: 199 registros preenchidos.
- `athletes.payment_bank`: 115 registros preenchidos.
- `teams.available_payment_plans`: 11 equipes com ao menos um plano.
- O Painel de Gestão v1 (`management_panel`) lê e edita esses campos. O Manager App também lê e edita os dois campos do atleta. A v1 não tem um módulo de contas a receber, mas tem a gestão de pacotes e dados de pagamento do cadastro.
- Técnicos, administradores e futuros perfis da v2 compartilham o papel PostgreSQL `authenticated`. Uma política RLS em `athletes` filtra linhas, não colunas. Esconder esses campos na interface não os protege contra uma consulta direta à API.

## Sequência segura de implantação

1. Criar tabelas financeiras separadas por atleta e equipe, com RLS para Administrador/Financeiro e nenhuma leitura por técnico, atendimento ou responsável. Copiar os valores legados e conferir as contagens e somas de verificação, sem apagar os originais. Sincronizar alterações feitas pela v1 enquanto ocorre a transição.
2. Adaptar os leitores e editores da v1, do Manager App e da v2 para usar as novas tabelas ou funções de acesso, preservando as operações que o usuário decidir manter na v1. Publicar as mudanças de código e testar com contas de cada perfil.
3. Em uma transação de corte, conferir novamente a cópia e limpar os três campos legados. Bloquear novas gravações neles ou encaminhá-las com validação ao armazenamento privado. Confirmar que as consultas públicas retornam campos vazios e que Administrador/Financeiro ainda veem e editam os valores nas interfaces apropriadas.
4. Validar login, cadastro de atleta, alteração de pacote, dados financeiros e fluxos do Manager App e da v1. Só então convidar responsáveis e ativar a v2 no GitHub Pages.

## Critérios de parada

- Qualquer divergência entre valores copiados e valores legados interrompe o corte.
- Se uma operação da v1 ou do Manager App depender de um campo ainda não adaptado, não limpar esse campo.
- Não publicar a área do atleta enquanto uma conta `customer` nova puder herdar as políticas amplas da v1; a migração 015 restringe essas políticas, mas ainda precisa de teste com conta real.
- O código da v1 também aceita hoje qualquer perfil ativo `customer` no login. Foi preparada uma alteração numa branch isolada do repositório `management_panel` para consultar `v2_can_use_legacy_panel()`. Ela depende da migração 015 e não deve ser publicada antes dessa função existir.

## Preparação 018

A migração 018 criou `v2_athlete_payment_settings` e `v2_team_payment_plans` com acesso de leitura e edição condicionado à permissão da página Pacotes; técnicos e responsáveis não recebem leitura dessas novas tabelas. Dois gatilhos mantêm a cópia privada sincronizada com escritas nos campos legados enquanto a v1 e o Manager App ainda os utilizam. A verificação após a aplicação encontrou 201 atletas e 16 equipes copiados, zero divergências, RLS ativa e nenhuma leitura anônima. A migração mantém os valores antigos visíveis e, por isso, **não conclui o isolamento**. Adaptar os clientes e só então preparar o corte que elimina os valores das colunas públicas.
