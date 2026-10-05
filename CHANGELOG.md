# Histórico de versões

## v2.9.2 — 2026-10-05 (publicado)

- "Convidar usuário" e o convite da Área do atleta voltam a funcionar: a função v2-invite-user foi publicada e passa a criar o acesso já confirmado (sem depender de e-mail). A pessoa entra com Google usando o e-mail cadastrado.
- Contas existentes são reaproveitadas sem sobrescrever o perfil; mensagens de erro em português.

## v2.9.1 — 2026-10-01

- Corrige o resumo financeiro: o fundo escuro do destaque cobria a página inteira e escondia o valor "A vencer".
- Ícones dos indicadores à esquerda do texto.
- Agenda de domingo a sábado.
- Pacotes mostram em gráfico quem está fora dos pacotes: sem plano registrado, pacote de outra equipe ou nome fora do catálogo, com os planos mais comuns.
- Fluxo de caixa visual: total com variação sobre o mês anterior, composição por forma de pagamento e gráfico de barras mensal.

## v2.9 — 2026-09-30

- Visão geral começa por um bloco de **Pendências** (testes sem resultado, responsável a confirmar, atrasos sem vínculo, planos fora do catálogo, atletas sem contato, equipes sem técnico), cada uma levando à lista já filtrada.
- Resumo financeiro da visão geral simplificado: recebido líquido em destaque, atrasos e valores a vencer, mês de referência e data da importação. Perfis sem acesso financeiro veem indicadores operacionais.
- Núcleos com cores próprias e consistentes em etiquetas, agenda e cartões, nos temas claro e escuro.
- Agenda com horário ajustado aos treinos da semana, no máximo três colunas por horário com "+N", resumo do dia e lista no celular ou em semanas com poucos treinos.
- Agendamentos: resultado do teste em um clique (Compareceu, Faltou, Aprovado, Matriculado, Cancelado), seleção em lote para mudar status ou arquivar, aviso de filtro ativo e WhatsApp discreto.
- Agendamentos e atletas viram cartões no celular; nomes em caixa alta ou minúscula são exibidos corretamente.
- Alertas de mensalidade: filtros Sem vínculo/Com contato, sugestões de atleta por nome e vínculo em lote dos nomes idênticos. Itens do Tecnofit aparecem resumidos.
- Financeiro: composição bruto/taxas sem repetir o total, gráfico com uma série por vez, menos jargão.
- Contadores do menu neutros, vermelhos apenas com atraso acima de 60 dias.
- Núcleos vazios oferecem "Criar equipe aqui"; pacotes explicam atletas fora do catálogo; fluxo do Chatbot Feeder recolhível; pagamentos sem lançamentos indicam o próximo passo; configurações destacam "Você" e resumem permissões em texto.
- Contraste do botão principal e do WhatsApp ajustado para leitura (WCAG AA).

## v2.8 — 2026-09-30

- Coleta de primeira resposta do assistente, tempo até gravar novo agendamento, encaminhamento humano e satisfação opcional no chatbot.
- Visão geral exibe médias, CSAT e tamanhos de amostra reais dos últimos 30 dias; sem reconstruir horários do histórico antigo.
- Fila de atendimento humano permite abrir WhatsApp e registrar explicitamente a primeira resposta enviada.
- Migração 022 isola telemetria, usa horários do servidor e restringe gravação automática ao Apps Script.

## v2.7 — 2026-09-30

- Ícones dos indicadores alinhados à esquerda e coloridos por significado; cartões de equipes com acento lateral e sem linha inferior.
- Agenda distingue dias fechados para novos testes de treinos realmente cancelados. Técnicos de equipes vinculadas podem sinalizar e restaurar treinos.
- Alertas de mensalidades oferecem WhatsApp quando o código Tecnofit está vinculado ao atleta. Para menores, é obrigatório o contato do responsável. Atendimento recebe uma lista restrita sem valores.
- Cobertura dos relatórios separa meses completos (verde), parciais (amarelo) e não importados. O período de exportação deve ser informado explicitamente.

## v2.6.1 — 2026-09-30

- Corrige o carregamento de arquivos antigos no navegador após a publicação da v2.6.

## v2.6 — 2026-09-30

- Interface mais leve nas páginas operacionais, indicadores com ícones à esquerda e explicações acessíveis pelo botão de informação.
- Resumo financeiro visual com composição bruto/taxas/líquido, evolução mensal sem preencher meses não importados, faixas de atraso e detalhes de conciliação sob demanda.
- Cobertura das importações apresentada por mês; instruções de exportação recolhíveis.
- Orientação contextual por página no cabeçalho e prévia dos perfis de acesso para administradores, em modo somente leitura.
- Indicadores de atendimento calculáveis substituem cartões sem eventos disponíveis; métricas que dependem de instrumentação são identificadas.
- Agendamentos de menores com nomes duplicados são sinalizados; novos salvamentos exigem responsável diferente do atleta.

## v2.5 — 2026-09-30

- Skeletons responsivos no carregamento inicial do Painel de Gestão e da Área do Atleta, sem exibir dados antes da autorização.
- O Painel de Gestão aguarda também os dados financeiros antes de mostrar o conteúdo para perfis com permissão.
- Botão Google passa a informar “Validando acesso...” durante o início do login.

## v2.4 — 2026-09-30

- Transição de acesso autorizado: estrelas saem da tela com aceleração suave; brilho vermelho e conteúdo se dissipam antes da navegação.
- Contas sem permissão recebem um fundo vermelho mais intenso, mantendo a orientação para solicitar acesso.
- Movimento reduzido respeitado com navegação imediata.

## v2.3 — 2026-09-30

- Área de menor brilho estelar atrás da marca, do título e do botão de acesso.
- Ícone Google oficial e feedback de carregamento com prevenção de cliques repetidos.
- Layout com rolagem em telas baixas e orientação mais clara para contas sem acesso.

## v2.2.2 — 2026-09-30

- Divisória horizontal reduzida à metade e subtítulo Sistema Integrado de Gestão ampliado.

## v2.2.1 — 2026-09-30

- Logo Apollo centralizada no topo e identidade Huddle centralizada na tela.
- Divisória horizontal entre Huddle e Sistema Integrado de Gestão; botão Google próximo de dois terços da altura.

## v2.2 — 2026-09-30

- Fonte Chakra Petch com peso mais leve na identidade Huddle e subtítulo em uma linha fora de celulares.
- Fundo espacial em toda a tela, com camadas de estrelas em órbita do centro inferior.
- Estrelas atraídas pelo mouse, diminuindo até desaparecerem ao se aproximar do cursor.

## v2.1 — 2026-09-30

- Identidade Huddle no centro do login e logo Apollo menor no topo.
- Nebulosa vermelha animada e estrelas interativas com resposta suave ao mouse.
- Animações pausadas em abas ocultas e apresentação estática com movimento reduzido.

O número da versão exibido na tela de login é definido em `js/version.js`. A cada mudança relevante publicada, atualize esse arquivo e registre aqui a data e as alterações. Use o próximo número menor para novas funcionalidades e o terceiro número para correções após uma versão publicada.

## v2.0.2 — 2026-09-30

- Remoção da moldura externa do botão Google e redução da largura do botão.
- Brilho vermelho de fundo maior e deslocado para a direita.

## v2.0.1 — 2026-09-30

- Alinhamento da marca Apollo + SIG à esquerda, com maior espaçamento entre as letras.
- Fundo azul com brilho vermelho difuso na base e área de login branca.

## v2.0 — 2026-09-30

- Login Google para contas autorizadas no Supabase, com encaminhamento conforme o perfil.
- Tela de login com identidade “Sistema Integrado de Gestão”, marca Apollo + SIG e versão no rodapé.
- Painel de Gestão e Área do atleta publicados em endereço separado da v1.
