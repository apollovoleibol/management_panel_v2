# Painel de Gestão v2 — protótipo navegável

Protótipo da nova versão do Painel de Gestão Apollo (setembro/2026). Os módulos demonstrativos usam dados fictícios. A área Financeiro prepara cada relatório Tecnofit no navegador e grava somente registros tratados e metadados no Supabase, após autenticação real e aplicação da migração de banco. O arquivo original não é enviado. Lançamentos manuais e os demais módulos continuam temporários neste protótipo.

**Como abrir:** dê dois cliques em `index.html`. Para abrir direto numa página, use a âncora: `index.html#bookings`, `#athletes`, `#teams`, `#packages`, `#feeder`, `#payments`, `#finance` ou `#settings`.

**Publicação paralela à v1:** consulte [PUBLICACAO_V2.md](PUBLICACAO_V2.md). A primeira publicação no novo repositório é destinada à homologação visual.

## Login único e Área do atleta

- `login.html`: a mesma tela para todos, com Google ou e-mail e senha. Depois da autenticação:
  - perfil de equipe → Painel de Gestão;
  - atleta ativo, ou responsável por atleta ativo → Área do atleta;
  - quem tem os dois acessos escolhe para onde ir;
  - cadastro inativo → contato da secretaria.
- `area-do-atleta.html?conta=familia|larissa|lucas|juliana`: proposta da área do atleta, pensada primeiro para o celular.
  - **Início:** próximo treino (com como chegar e aviso de ausência), pendências, próxima competição, presença e comunicados.
  - **Agenda:** treinos, competições e eventos, com aviso de ausência e exportação para o calendário do celular (.ics). Para os pais, há a opção "toda a família".
  - **Evolução:** frequência nas últimas 8 semanas. Os competitivos (base e adulto) veem o scout do Manager App; escolinha e iniciantes veem a avaliação de fundamentos. Ambos com recado do técnico.
  - **Mensalidades:** espelho do Tecnofit, com Pix, cartão e recibos.
  - **Cadastro:** dados do atleta, saúde e emergência, atestado médico e autorizações. Para menores, também os responsáveis e a lista de quem pode buscar após o treino.
- **Menores de idade (escolinha e base):** o acesso é do responsável, que vê todos os filhos num só lugar. Autorizar competições e viagens, a lista de retirada, "pode sair sozinho" (a partir de 12 anos) e o uso de imagem dependem do responsável legal. Um segundo responsável pode ter acesso próprio.
- **Adultos:** o competitivo confirma presença em convocações e acompanha o scout; o iniciante acompanha os fundamentos e completa o cadastro inicial.

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

## Decisões do protótipo

- **Agendamentos e Atletas** mantêm as funções atuais: os mesmos 4 KPIs, busca, filtros, arquivados, ordenação, destaque de 48h, separação entre próximos e passados, WhatsApp com mensagem de lembrete ou de confirmação, conversa com o bot, edição com aviso de alterações não salvas, datas só nos dias de treino da equipe, e regras para equipes de menores (responsável obrigatório). As mudanças são de organização: drawer lateral, formulário em seções, prévia da mensagem antes de abrir o WhatsApp.
- **Equipes e núcleos** reúne a configuração que hoje fica dentro do Chatbot Feeder: os núcleos no topo e as equipes abaixo, separados por um divisor. O editor da equipe tem abas: Dados, Horários, Pacotes e Datas indisponíveis.
- **Chatbot Feeder** mostra, campo a campo, o que vai no “QUADRO OFICIAL” enviado ao assistente, de onde vem cada dado e onde editar. Tem também as instruções do assistente, o texto exato enviado e um simulador por idade. Duas propostas ficam sinalizadas no protótipo:
  - hoje as regras estão fixas no Apps Script (`montarPromptMestre`);
  - hoje a faixa etária não é enviada no quadro.
- **Permissões:** cada página tem dois modos, Visualizar e Editar. Use “Visualizar como”, no topo, para testar. Na implementação, a mesma matriz precisa valer no Supabase (RLS/funções), conforme a spec PG-01 do SDD.
- **Dados financeiros:** somente os perfis Administrador e Financeiro acessam, mesmo em visualização, as páginas Pacotes e mensalidades, Pagamentos e Financeiro. Em Configurações, essas páginas ficam travadas para os demais perfis. Para esses perfis, os valores de mensalidade e o banco de pagamento também ficam ocultos no cadastro de atletas e nas equipes.
- **Visão geral por perfil:**
  - Administrador e Financeiro veem as métricas financeiras.
  - Coordenação e Atendimento veem indicadores operacionais e a projeção de atletas, sem valores em R$.
  - O Técnico vê só as próprias equipes, com os indicadores do Manager App: presença, horas, treinos, chamadas, testes a avaliar, presença por equipe, atletas com baixa presença e próximas competições. Agendamentos, Atletas e a agenda também ficam restritos às equipes dele (vínculo definido em Configurações).
- **Demonstração:** `index.html?como=u5` abre o painel já como o técnico Rafael (u2 = coordenação, u3 = financeiro, u4 = atendimento, u7 = técnica Juliana).
- **Tecnofit por upload individual:** a guia **Importações** tem um cartão por relatório: `Contas a Receber (Incluir colunas ocultas).xlsx`, `Relatório de Vendas em Aberto.xls` (HTML exportado como XLS), `Relatório de Fluxo de Caixa Analítico.xls` (HTML exportado como XLS) e extrato `.csv`. O navegador lê e trata um arquivo por vez. Após conferir o intervalo usado no Tecnofit, uma chamada autenticada grava somente registros normalizados e metadados no Supabase. A função de banco substitui atomicamente os meses reimportados; Vendas em Aberto substitui a fotografia anterior. O histórico mostra a última importação, meses cobertos e lacunas nos últimos 12 meses. **É preciso aplicar a migração `Apollo Manager App/supabase/migrations/012_tecnofit_finance_imports.sql` no Supabase principal antes de usar a gravação.** O login demonstrativo de `login.html` não autentica no banco; a guia Importações pede uma conta real autorizada. [Levantamento técnico](../../Documentação%20do%20Ecossistema%20Apollo/INTEGRACAO_TECNOFIT_2026-09-29.md).
- **Alertas:** só entram mensalidades com saldo aberto positivo e vencimento anterior ao dia atual; status de cliente “Bloqueado” e “Não recebido” em Contas a Receber não são usados como prova de atraso. Quando há vários vencimentos na mesma linha exportada, ela é exibida agrupada para conferência. O relatório não traz responsáveis legais, portanto nenhum contato automático é disparado.
- **Pagamentos de técnicos:** as horas de treino são geradas a partir dos horários das equipes, descontando as datas indisponíveis. Competições (diárias) e extras são lançados manualmente. O fluxo segue aprovação → pagamento → saída registrada no Financeiro.
- Métricas marcadas como `PROPOSTA` (retorno humano, satisfação) dependem de dados que ainda não são coletados.
