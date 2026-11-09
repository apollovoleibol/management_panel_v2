# Histórico de versões

## Varredura técnica — 2026-11-09

- Mensalidades voltou ao menu (administração e financeiro). A migração 043 (Marketing) tinha recriado as permissões sem a página, e o banco negava mensalidades, cobranças e regras de cobrança a todos. Migração 047.
- Área do atleta: a lista de atletas da conta volta a seguir a regra de vínculo (adulto com a própria conta, menor pelo responsável).
- Nomes com espaços sobrando (" Giovanna…", "Amanda Pereira ") eram listados fora da ordem e atrapalhavam a comparação de nomes. Novos cadastros e agendamentos chegam normalizados e os atletas atuais foram corrigidos.
- Leitura dos dados com ordem fixa: a paginação de 500 em 500 podia repetir ou pular linhas (presenças passam de 4 mil).
- Biblioteca do Supabase em versão fixa (2.119.0) no painel, no login e na Área do atleta.
- Chatbot Feeder: saiu o botão "Atualizar quadro agora" e o indicador fixo "Sincronização: Pendente", que não faziam nada. As instruções do assistente ficam só para consulta (são alteradas no Apps Script).
- Celular: em Agendamentos, equipe e núcleo deixam de aparecer colados ("Equipe ArmstrongNúcleo PUC").

## Folha dos técnicos: fechamento guiado — 2026-11-09

- A página abre no mês a fechar (o anterior, enquanto houver técnico sem pagamento) e mostra a situação do mês: total, quanto já foi pago, quanto falta e os 3 passos (revisar, pagar, pago) com contagens.
- Lista de técnicos na ordem do próximo passo, com um único botão por técnico: "Revisar lançamentos", "Pagar R$ X" ou "Ver detalhes". Técnicos sem treinos no mês ficam recolhidos.
- Treinos com chamada ou confirmados no Manager App entram sozinhos na revisão (acabou o botão "Lançar X treinos").
- Revisão em lote: tudo vem marcado para aprovar; desmarcar reprova. Um botão grava tudo ("Aprovar 29 e reprovar 1"). Cada treino mostra se teve chamada e quantos presentes. Diárias sem valor definido ficam aguardando, com atalho para definir.
- Pagamento em tela própria: valor, chave PIX com botão de copiar (ou campo para cadastrar) e "Já fiz o PIX · registrar". A saída "Folha técnica" continua indo para o Financeiro.
- "Valores e PIX": hora-aula, diária e chave PIX de todos os técnicos numa tela só (antes não havia onde cadastrar a chave PIX).
- "Lançar diária ou extra" lançado pela administração já entra aprovado.
- Migração 046: lançamento reprovado não bloqueia mais o pagamento; diária de competição só é aprovada com valor definido; mensagens de erro em português; "Meu mês" do técnico no Manager App não soma reprovados.

## Competições na agenda — 2026-11-03

- Visão geral: competições previstas (cadastradas no Manager App) aparecem no topo de cada dia da agenda da semana, com a caixa "Competições" para mostrar ou esconder. Clique abre equipe, data e hora, adversário, fase e local.
- Nova seção **Próximos eventos** na Visão geral: as próximas competições com data em destaque, tipo e contagem regressiva.
- Planejamento (marketing): competições no calendário mensal, com caixa para mostrar ou esconder. Da competição dá para planejar o post de divulgação (3 dias antes), o post de resultado (dia seguinte) ou criar a peça "Dia de jogo" já preenchida.
- Métricas de atendimento: ícones centralizados e títulos sem sobreposição do (i).
- Migração 045: função `v2_marketing_competitions` (só leitura: competição, equipe, data, local e adversário) para o perfil Marketing, que não lê equipes nem competições diretamente.

## Marketing · Estúdio v2 — 2026-11-02

- Logos oficiais do kit nas peças: assinatura azul, branca, vermelha e cinza, selo azul, selo contorno e selo contorno com foguete. Por padrão a assinatura é escolhida pelo fundo (branca em fundo escuro, azul em fundo claro).
- Editor refeito em tela cheia: biblioteca à esquerda (Layouts, Texto, Fotos, Marca, Elementos, Pincel, IA, Camadas), arte no centro, propriedades do que está selecionado à direita e lâminas no rodapé.
- Edição direta na arte: clicar seleciona, arrastar move com encaixe nas margens, no centro e nos outros elementos, alças redimensionam (no texto, o canto muda o tamanho da letra), alça de baixo gira e dois cliques escrevem no texto. Barra rápida sobre a seleção (duplicar, frente, trás, travar, excluir).
- Desfazer e refazer em tudo (Ctrl+Z / Ctrl+Shift+Z), copiar e colar entre lâminas, duplicar (Ctrl+D), setas para ajuste fino, Ctrl+roda para zoom e Ctrl+S para salvar.
- Fotos: arraste do computador direto em cima da arte ou de um espaço de foto; as fotos da peça ficam numa galeria para reaproveitar. Espaço de foto vazio aparece só no editor, nunca no PNG.
- Camadas com reordenação por arrastar, travar e ocultar; elementos renomeáveis. Biblioteca com textos prontos no estilo da marca (título, subtítulo, etiqueta, número gigante, texto vazado), formas (faixa, degradê sobre foto, moldura, foto redonda) e pinceladas.
- Nova peça: galeria com formato, busca e filtro por tipo de post; um clique abre o editor. Atalhos "Comece rápido" na tela do Estúdio e calculadora de custo recolhível.
- Layouts redesenhados: tipografia grande, degradê azul sobre a foto, pinceladas sangrando para fora, palavra vazada de fundo e hierarquia mais clara. Trocar de layout guarda a foto e os textos mesmo quando o novo layout não tem o campo.
- Carrossel com fundo contínuo (pincelada, foto, linha, respingos ou granulado atravessando as lâminas), que pode ficar atrás ou na frente dos elementos; lâminas reordenáveis por arrastar.
- Tratamento de foto com duotone usando só as cores da paleta (azul, vermelho, branco, cinza), além de contraste, brilho, escurecimento e enquadramento.
- Pincéis do Apollo Brushes.abr: pincelada seca, riscado, hachura, respingo e granulado. A pressão controla opacidade e tamanho de cada toque, então a textura aparece com toque leve. Pincel livre lê a pressão real da mesa digitalizadora (Wacom); com mouse a pressão é simulada.
- Portfólio de 34 layouts em 6 grupos (chamadas e anúncios, jogos, pessoas, comunidade e institucional, carrossel, stories), mais "Em branco".
- Migração 044: `marketing_layouts` (layouts próprios) e `marketing_pieces.meta` (fundo contínuo do carrossel e galeria de fotos da peça), com a mesma trava de edição da peça em aprovação.

## Marketing — 2026-11-01

- Novo perfil **Marketing** (só vê Planejamento e Estúdio de peças) e as páginas **Planejamento** (calendário mensal de posts e campanhas com orçamento de IA) e **Estúdio de peças**.
- Estúdio: templates HTML com a marca da Apollo (Infield Block nos títulos, Gridnik nos textos; azul #0f1332, vermelho #ee4036), formatos feed 4:5, stories/reels 9:16, quadrado 1:1 e carrossel; edição por elemento (texto, cor, tamanho, mostrar/ocultar, foto) e exportação em PNG sem Photoshop/Illustrator.
- IA (Gemini, pela Edge Function `marketing-ai`): textos, imagens, revisão da arte e vídeo curto. A IA nunca desenha texto, logo ou layout.
- Calculadora de custo: estimativa antes de gerar (tokens, imagem, vídeo) e custo real registrado por peça e campanha; preços editáveis pela administração.
- Aprovação: peça finalizada fica bloqueada e os administradores são avisados; só o administrador aprova ou reprova (regra no banco).
- Migração 043; Edge Function `v2-invite-user` aceita o perfil Marketing.

## v2.9.7 — 2026-10-06

- Pagamentos: horas atribuídas a quem conduziu o treino (substituto informado no Manager App); diárias de competição lançadas pelo técnico aparecem como "Lançado pelo técnico no app" e podem ser aprovadas ou reprovadas. Reprovados ficam fora dos totais.
- Migração 026: training_logs.conducted_by, hora-aula base de R$ 30, status 'rejected', funções manager_coach_directory, manager_add_competition_day e manager_pay_forecast.

## v2.9.6 — 2026-10-06

- Novo favicon e ícone (Apollo Huddle): A da Apollo em selo sobre gradiente azul-marinho, em SVG, PNG 32 px e apple-touch-icon.

## Supabase — 2026-10-05

- Migração 024 e função call-reminder: treino sem chamada 24 h depois do fim vira tarefa de prioridade alta, atribuída pela administração a cada técnico da equipe, com notificação. A tarefa é concluída automaticamente quando a chamada é salva. Só considera treinos que terminaram entre 24 h e 48 h atrás; cancelados no Huddle não geram tarefa.

## v2.9.5 — 2026-10-05

- Botões e links de WhatsApp no verde oficial (#25D366) e símbolo do WhatsApp preenchido.

## v2.9.4 — 2026-10-05

- Área do atleta: o aviso de ausência pede o motivo (opcional); o técnico vê a falta já justificada na chamada do Manager App.
- Migração 023: função v2_my_month ("Meu mês" do técnico no Manager App), registro de lembretes de chamada e agendamento (pg_cron + pg_net) da Edge Function call-reminder, que avisa os técnicos 30 minutos após o treino sem chamada.

## v2.9.3 — 2026-10-05

- Pagamentos de técnicos: treinos registrados no Manager App (chamada ou "confirmar treino") e ainda sem lançamento aparecem num aviso com o botão "Lançar N treino(s)". Um lançamento por técnico, equipe e dia; sem duração gravada, usa a grade da equipe. Entram pendentes de aprovação.

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
