/* Orientação contextual, sem alterar dados nem permissões. */
'use strict';
const GUIDE_PAGES = {
  overview: [
    ['Panorama', 'A visão geral reúne apenas os indicadores permitidos ao seu perfil. O ícone “i” explica a fonte e o cálculo de cada métrica.', '.page-head'],
    ['Indicadores', 'Compare os números com a fonte indicada. Resultados do Tecnofit dependem da última importação; presença e agendamentos vêm do Supabase.', '.kpi'],
    ['Agenda semanal', 'Use Hoje e as setas para mudar de semana. Clique em um treino para ver equipe, horário e testes agendados.', '.cal-wrap, .calendar, .section-title'],
    ['Atendimento', 'O funil acompanha etapas registradas. Métricas sem eventos de origem não recebem valores estimados.', '.funnel']
  ],
  bookings: [
    ['Agendamentos', 'A lista reúne os testes das equipes permitidas ao seu perfil. Os próximos dois dias aparecem em destaque.', '.page-head'],
    ['Filtros', 'Pesquise por nome ou WhatsApp, filtre equipe e status e consulte os arquivados sem perder o histórico.', '.toolbar'],
    ['Detalhes', 'Abra uma linha para ver o teste. Quem tem permissão de edição pode corrigir dados e reagendar.', '#bkTable']
  ],
  athletes: [
    ['Atletas', 'Consulte os atletas e use busca e filtros para encontrar a equipe ou o cadastro desejado.', '.page-head'],
    ['Cadastro', 'Abra um atleta para ver os dados. O perfil com edição pode atualizar o cadastro; menores exigem responsável.', '.table-wrap']
  ],
  teams: [
    ['Núcleos', 'Núcleos são locais de treino. Os números mostram equipes, atletas ativos e horários semanais.', '.ngrid'],
    ['Equipes', 'Filtre por núcleo ou nome. Abra uma equipe para revisar técnicos, horários, disponibilidade e dados usados pelo assistente.', '#teamGrid']
  ],
  packages: [
    ['Pacotes', 'Consulte as modalidades e condições associadas às equipes. Valores são visíveis apenas a perfis financeiros.', '.page-head'],
    ['Detalhes', 'Abra um pacote para ver vínculos e condições. Ações de edição dependem da permissão da sua conta.', '.table-wrap, .grid']
  ],
  feeder: [
    ['Chatbot Feeder', 'Veja quais dados de equipes e horários alimentam o assistente. A página distingue dados sincronizados de configurações ainda pendentes.', '.page-head'],
    ['Origem dos dados', 'Abra uma equipe para conferir o dado, sua origem e onde corrigi-lo.', '.fd-team, .tabs']
  ],
  payments: [
    ['Pagamentos', 'Acompanhe horas, diárias e aprovações de técnicos no mês selecionado.', '.page-head'],
    ['Conferência', 'Confira o lançamento antes de aprovar. Marcar como pago registra um lançamento financeiro após a transferência externa.', '.table-wrap, .grid']
  ],
  finance: [
    ['Financeiro', 'Os números usam relatórios importados manualmente do Tecnofit. A data de cada importação informa até quando os dados estão atualizados.', '.page-head'],
    ['Resumo visual', 'Compare recebido bruto, taxas e líquido. O fluxo de caixa e o extrato podem ter escopos diferentes; diferenças pedem conferência.', '.fin-hero'],
    ['Tendência e atrasos', 'O gráfico compara meses importados; as barras de atraso agrupam mensalidades vencidas por tempo de atraso.', '.fin-visuals'],
    ['Relatórios', 'Use as abas para explorar recebimentos, alertas e movimentações. Em Importações, confira a cobertura antes de carregar outro período.', '.fin-tabs']
  ],
  settings: [
    ['Configurações', 'Administradores podem convidar usuários, definir perfis e escolher visualização ou edição em cada página.', '.page-head'],
    ['Permissões', 'Visualizar permite consultar; Editar inclui alteração. Páginas financeiras só podem ser concedidas a Administrador ou Financeiro.', '.tabs'],
    ['Área do atleta', 'Convide ou vincule responsáveis a atletas menores. Atletas adultos usam o próprio acesso.', '.tabs']
  ]
};
let guideIndex = 0, guidePage = '';
const guidePanel = document.getElementById('guidePanel');
function guideSteps() {
  return (GUIDE_PAGES[S.page] || []).filter(([, , selector]) => document.querySelector(selector));
}
function guideSync() {
  document.querySelectorAll('.guide-target').forEach(el => el.classList.remove('guide-target'));
  if (guidePanel.hidden) return;
  if (guidePage !== S.page) { guidePage = S.page; guideIndex = 0; }
  const steps = guideSteps();
  if (!steps.length) return guideClose();
  guideIndex = Math.min(guideIndex, steps.length - 1);
  const [title, description, selector] = steps[guideIndex];
  const target = document.querySelector(selector);
  target.classList.add('guide-target');
  guidePanel.innerHTML = `<div class="guide-count">PASSO ${guideIndex + 1} DE ${steps.length} · ${esc(PAGES.find(p => p.id === S.page)?.label || '')}</div><h2>${esc(title)}</h2><p>${esc(description)}</p><div class="guide-actions"><button class="btn sm" data-guide="close">Fechar</button><button class="btn sm" data-guide="back" ${guideIndex ? '' : 'disabled'}>Anterior</button><button class="btn sm primary" data-guide="next">${guideIndex === steps.length - 1 ? 'Concluir' : 'Próximo'}</button></div>`;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function guideClose() {
  guidePanel.hidden = true;
  document.getElementById('guideBtn').setAttribute('aria-expanded', 'false');
  document.querySelectorAll('.guide-target').forEach(el => el.classList.remove('guide-target'));
  document.getElementById('guideBtn').focus();
}
document.getElementById('guideBtn').addEventListener('click', () => {
  if (!guidePanel.hidden) return guideClose();
  guideIndex = 0; guidePage = S.page; guidePanel.hidden = false;
  document.getElementById('guideBtn').setAttribute('aria-expanded', 'true');
  guideSync();
});
guidePanel.addEventListener('click', event => {
  const action = event.target.closest('[data-guide]')?.dataset.guide;
  if (action === 'close') return guideClose();
  if (action === 'back') guideIndex--;
  if (action === 'next') guideIndex++;
  if (guideIndex >= guideSteps().length) return guideClose();
  guideSync();
});
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !guidePanel.hidden) guideClose(); });
