# Painel de Gestão v2 — acesso Google em implantação

O endereço da [v2](https://apollovoleibol.github.io/management_panel_v2/) está publicado em paralelo à v1. A branch `main` contém login Google e operações conectadas ao Supabase compartilhado. O cadastro público de novas contas foi desativado, o retorno OAuth da v2 foi autorizado e o perfil legado de recepção recebeu o papel Atendimento. A implantação ainda requer testes com contas reais de cada perfil e o isolamento dos campos financeiros legados das tabelas compartilhadas. Consulte [o estado da implantação](docs/IMPLEMENTACAO_REAL.md) antes de usar o painel para operações sensíveis.

**Como abrir:** use `login.html` com uma conta Supabase autorizada. Para abrir direto numa página após o login, use a âncora: `index.html#bookings`, `#athletes`, `#teams`, `#packages`, `#feeder`, `#payments`, `#finance` ou `#settings`.

**Publicação paralela à v1:** consulte [PUBLICACAO_V2.md](PUBLICACAO_V2.md). O endereço da v1 permanece separado.

**Versão:** a fonte única do número mostrado no login é `js/version.js`. Em cada mudança relevante publicada, atualize esse número e registre a alteração em `CHANGELOG.md`.

## Login único e Área do atleta

- `login.html`: a mesma tela para todos, com login Google. A sessão deve ter sido criada por OAuth e a autorização vem da função `v2_my_access()` no Supabase. Depois da autenticação:
  - perfil de equipe → Painel de Gestão;
  - atleta ativo, ou responsável por atleta ativo → Área do atleta;
  - quem tem os dois acessos escolhe para onde ir;
  - cadastro inativo → contato da secretaria.
- `area-do-atleta.html`: proposta da área do atleta, pensada primeiro para o celular. Requer vínculo de conta e dados reais no banco.
  - **Início:** próximo treino, endereço, aviso de ausência, pendências do último relatório, próxima competição e presença registrada.
  - **Agenda:** treinos das próximas quatro semanas e competições, com aviso de ausência e resposta de participação. A conta de responsável pode alternar entre atletas vinculados.
  - **Evolução:** frequência calculada das chamadas registradas. Avaliações técnicas e scout ainda não foram conectados.
  - **Mensalidades:** espelho dos relatórios importados, quando houver um código Tecnofit vinculado. O pagamento continua nos canais oficiais da Apollo; o portal não processa Pix, cartão nem emite recibos.
  - **Cadastro:** identificação, equipe e núcleo, com registro de consentimento de uso de imagem. Alterações cadastrais e de saúde ainda passam pela secretaria.
- **Menores de idade (escolinha e base):** o acesso é do responsável, que vê os atletas vinculados à sua conta. O protótipo operacional registra resposta a competições e consentimento de imagem; autorização de viagens e lista de retirada ainda não existem.
- **Adultos:** a conta própria pode responder a competições e consultar presença. Scout, fundamentos e cadastro inicial ainda não estão conectados.

## Estrutura

| Arquivo | Conteúdo |
| --- | --- |
| `index.html` | Casca: menu lateral (logo Apollo branca), topo e diálogos |
| `styles.css` | Tokens de cor (claro/escuro), componentes e responsivo |
| `js/core.js` | Utilitários, dados fictícios, permissões, gráficos SVG |
| `js/pages-ops.js` | Visão geral (métricas + agenda semanal), Agendamentos e Atletas |
| `js/pages-config.js` | Equipes e núcleos, Pacotes e mensalidades, Chatbot Feeder |
| `js/pages-admin.js` | Pagamentos de técnicos, código financeiro anterior e Configurações |
| `js/finance-reports.js` | Leitura local dos quatro formatos exportados pelo Tecnofit e regras de atraso |
| `js/finance-page.js` | Nova área Financeiro: resumo, recebimentos, extrato, fluxo, alertas, lançamentos e orientações de upload |
| `js/main.js` | Navegação, controle de visualização/edição e eventos |
| `js/onboarding.js` | Orientação contextual para cada página |
| `huddle-ui.css` | Hierarquia visual mais leve e visualizações financeiras |

## Decisões do protótipo

- **Agendamentos e Atletas** mantêm as funções atuais: os mesmos 4 KPIs, busca, filtros, arquivados, ordenação, destaque de 48h, separação entre próximos e passados, WhatsApp com mensagem de lembrete ou de confirmação, conversa com o bot, edição com aviso de alterações não salvas, datas só nos dias de treino da equipe, e regras para equipes de menores (responsável obrigatório). As mudanças são de organização: drawer lateral, formulário em seções, prévia da mensagem antes de abrir o WhatsApp.
- **Equipes e núcleos** reúne a configuração que hoje fica dentro do Chatbot Feeder: os núcleos no topo e as equipes abaixo, separados por um divisor. O editor da equipe tem abas: Dados, Horários, Pacotes e Datas indisponíveis.
- **Chatbot Feeder** mostra, campo a campo, o que vai no “QUADRO OFICIAL” enviado ao assistente, de onde vem cada dado e onde editar. Tem também as instruções do assistente, o texto exato enviado e um simulador por idade. Duas propostas ficam sinalizadas no protótipo:
  - hoje as regras estão fixas no Apps Script (`montarPromptMestre`);
  - hoje a faixa etária não é enviada no quadro.
- **Permissões:** cada página tem dois modos, Visualizar e Editar. A versão autenticada lê os direitos do Supabase; a matriz precisa ser validada também nas políticas RLS e funções antes da publicação, conforme a spec PG-01 do SDD.
- **Dados financeiros:** somente os perfis Administrador e Financeiro acessam, mesmo em visualização, as páginas Pacotes e mensalidades, Pagamentos e Financeiro. Em Configurações, essas páginas ficam travadas para os demais perfis. Para esses perfis, os valores de mensalidade e o banco de pagamento também ficam ocultos no cadastro de atletas e nas equipes.
- **Visão geral por perfil:**
  - Administrador e Financeiro veem as métricas financeiras.
  - Coordenação e Atendimento veem indicadores operacionais e a projeção de atletas, sem valores em R$.
  - O Técnico vê só as próprias equipes, com os indicadores do Manager App: presença, horas, treinos, chamadas, testes a avaliar, presença por equipe, atletas com baixa presença e próximas competições. Agendamentos, Atletas e a agenda também ficam restritos às equipes dele (vínculo definido em Configurações).
- **Prévia anterior:** o parâmetro `?como=` pertencia ao protótipo e não concede acesso na versão autenticada.
- **Tecnofit por upload individual:** a guia **Importações** tem um cartão por relatório: `Contas a Receber (Incluir colunas ocultas).xlsx`, `Relatório de Vendas em Aberto.xls` (HTML exportado como XLS), `Relatório de Fluxo de Caixa Analítico.xls` (HTML exportado como XLS) e extrato `.csv`. O navegador lê e trata um arquivo por vez. Após conferir o intervalo usado no Tecnofit, uma chamada autenticada grava somente registros normalizados e metadados no Supabase. A função de banco substitui atomicamente os meses reimportados; Vendas em Aberto substitui a fotografia anterior. O histórico mostra a última importação, meses cobertos e lacunas nos últimos 12 meses. A [migração financeira](supabase/migrations/012_tecnofit_finance_imports.sql) já está no Supabase principal, mas o acesso depende das migrações seguintes. [Levantamento técnico](docs/INTEGRACAO_TECNOFIT_2026-09-29.md).
- **Alertas:** só entram mensalidades com saldo aberto positivo e vencimento anterior ao dia atual; status de cliente “Bloqueado” e “Não recebido” em Contas a Receber não são usados como prova de atraso. Quando há vários vencimentos na mesma linha exportada, ela é exibida agrupada para conferência. O relatório não traz responsáveis legais, portanto nenhum contato automático é disparado.
- **Pagamentos de técnicos:** as horas de treino são geradas a partir dos horários das equipes, descontando as datas indisponíveis. Competições (diárias) e extras são lançados manualmente. O fluxo segue aprovação → pagamento → saída registrada no Financeiro.
- Primeira resposta do assistente, tempo até agendar, retorno humano e satisfação aguardam eventos com horário e pesquisa de satisfação. A visão geral mostra indicadores calculáveis e explica quais medições ainda dependem de instrumentação.
- Um administrador pode pré-visualizar perfis em modo somente leitura. A promoção de uma conta ativa a Administrador do Huddle depende da migração `020_v2_admin_promotion.sql`; essa mudança não altera o papel legado usado pela v1. Convites novos não oferecem o perfil Administrador enquanto o acesso da v1 ainda está sendo isolado.
