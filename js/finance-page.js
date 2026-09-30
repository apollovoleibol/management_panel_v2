/* Área Financeiro baseada nos arquivos exportados do Tecnofit. */
'use strict';

const FIN_MANUAL = [];
const finSum = (rows, field) => rows.reduce((total, row) => total + (row[field] || 0), 0);
function finKpi(label, value, note, iconName) {
  return `<div class="kpi"><div class="kpi-icon">${icon(iconName)}</div>${metricInfo(label)}<div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-foot">${note}</div></div>`;
}
function finNeed(type) { return FIN_REPORTS[type] ? '' : `<span class="tag nodot st-warn">Aguardando ${finReportNames[type]}</span>`; }
function finGuide() {
  const items = [
    ['Contas a Receber', 'Gerencial → Gestão Financeira → Contas a receber', 'Filtre o mês desejado; Exportar → Todas as páginas (incluir colunas ocultas)', '.xlsx', 'Recebimentos brutos, taxas, líquido e confirmação.'],
    ['Vendas em Aberto', 'Relatórios → Gerencial → Vendas em Aberto', 'Tipo da Venda: Contrato; desde o primeiro mês com possível débito até o fim do mês atual; Pesquisar → ícone Excel', '.xls (HTML)', 'Vencimento, saldo aberto e alertas de atraso.'],
    ['Fluxo de Caixa Analítico', 'Relatórios → Financeiro → Fluxo de Caixa Analítico', 'Inclua o mês atual e os anteriores que deseja comparar; exporte a visão analítica', '.xls (HTML)', 'Totais e composição por forma de recebimento.'],
    ['Extrato', 'Gerencial → Conta Digital → Extrato', 'Selecione exatamente o mês (dia 1 até o último dia); botão .CSV', '.csv', 'Depósitos PIX, tarifas e transferências da conta digital.'],
  ];
  return `<div class="banner note">${icon('info')}<span class="small">Use o mesmo recorte mensal em Contas a Receber e Extrato. Para alertas, Vendas em Aberto deve cobrir também meses anteriores ainda não pagos. Os arquivos .xls do Tecnofit contêm tabelas HTML; envie-os sem conversão. Os relatórios podem fechar em datas diferentes; divergências são mostradas para conferência.</span></div>
  <div class="table-wrap"><table><thead><tr><th>Arquivo</th><th>Onde encontrar</th><th>Filtro e exportação</th><th>Formato</th><th>Uso no painel</th></tr></thead><tbody>${items.map(([name, where, how, format, use]) => `<tr><td><strong>${name}</strong></td><td>${where}</td><td>${how}</td><td><span class="tag nodot">${format}</span></td><td>${use}</td></tr>`).join('')}</tbody></table></div>
  <div class="panel-foot"><span>O arquivo original é lido no navegador e descartado. Somente os dados tratados e o histórico de importação seguem para o banco.</span></div>`;
}
function finSummaryHtml(key, summary) {
  const alerts = finAlertRows();
  const openTotal = summary.openAmount;
  const overdueTotal = finSum(alerts, 'alertAmount');
  const dueLater = finOpenInstallments().filter(r => r.date >= ymd(TODAY));
  const manual = FIN_MANUAL.filter(r => r.date.slice(0, 7) === key);
  const manualIn = finSum(manual.filter(r => r.type === 'in'), 'amount');
  const manualOut = finSum(manual.filter(r => r.type === 'out'), 'amount');
  const difference = summary.flow && FIN_REPORTS.receivables ? summary.flow.total - summary.gross : null;
  return `<div class="grid g3 mb">
    ${finKpi('Recebido bruto', FIN_REPORTS.receivables ? money(summary.gross) : '—', `${summary.paid.length} recebimento(s) confirmados`, 'money')}
    ${finKpi('Taxas dos recebimentos', FIN_REPORTS.receivables ? money(summary.fees) : '—', 'Tecnofit · contas a receber', 'wallet')}
    ${finKpi('Recebido líquido', FIN_REPORTS.receivables ? money(summary.net) : '—', 'Bruto menos taxas do relatório', 'trend')}
    ${finKpi('Em aberto no mês', FIN_REPORTS.open ? money(openTotal) : '—', `${summary.open.length} venda(s) com vencimento em ${monthLabel(key)}`, 'clock')}
    ${finKpi('Em atraso', FIN_REPORTS.open ? money(overdueTotal) : '—', FIN_REPORTS.open ? `${alerts.length} mensalidade(s) vencida(s), de todos os períodos importados` : 'Importe Vendas em Aberto', 'alert')}
    ${finKpi('A vencer', FIN_REPORTS.open ? money(finSum(dueLater, 'amount')) : '—', `${dueLater.length} parcela(s) ainda dentro do prazo`, 'calendar')}
  </div>
  <div class="split-wide mb">
    <section class="panel"><div class="panel-head"><div><h2>Conferência do mês</h2><div class="sub">Fontes com definições diferentes; diferenças exigem revisão</div></div></div><div class="panel-pad">
      <div class="stat-line"><span>Contas a Receber · bruto confirmado</span><b>${FIN_REPORTS.receivables ? money(summary.gross) : '—'}</b></div>
      <div class="stat-line"><span>Contas a Receber · aguardando confirmação</span><b>${FIN_REPORTS.receivables ? `${summary.pendingConfirmation.length} linha(s)` : '—'}</b></div>
      <div class="stat-line"><span>Fluxo de Caixa Analítico · entradas</span><b>${summary.flow ? money(summary.flow.total) : '—'}</b></div>
      <div class="stat-line"><span>Diferença entre fluxo e Contas a Receber</span><b>${difference === null ? '—' : money(difference)}</b></div>
      <p class="hint">O fluxo pode incluir valores e datas de competência diferentes. A diferença é exibida para investigação; ela não é lançada como receita automaticamente.</p>
    </div></section>
    <section class="panel"><div class="panel-head"><div><h2>Conta Digital e lançamentos</h2><div class="sub">O extrato PIX não representa todas as formas de pagamento</div></div></div><div class="panel-pad">
      <div class="stat-line"><span>Depósitos PIX no extrato</span><b>${FIN_REPORTS.statement ? money(summary.bankDeposits) : '—'}</b></div>
      <div class="stat-line"><span>Tarifas no extrato</span><b>${FIN_REPORTS.statement ? money(summary.bankFees) : '—'}</b></div>
      <div class="stat-line"><span>Transferências no extrato</span><b>${FIN_REPORTS.statement ? money(summary.bankTransfers) : '—'}</b></div>
      <div class="stat-line"><span>Entradas manuais</span><b>${money(manualIn)}</b></div>
      <div class="stat-line"><span>Saídas manuais</span><b>${money(manualOut)}</b></div>
      <p class="hint">Depósitos do extrato servem para conferência bancária. Não são somados novamente aos recebimentos do Tecnofit.</p>
    </div></section>
  </div>
  ${FIN_REPORTS.open ? `<section class="panel"><div class="panel-head"><div><h2>Alertas de pagamento</h2><div class="sub">Saldo em aberto com vencimento anterior a hoje</div></div><button class="btn sm" data-act="fin-tab" data-tab="alerts">Ver todos</button></div><div class="panel-pad">${alerts.length ? alerts.slice(0, 4).map(r => `<div class="stat-line"><span><strong>${esc(r.name)}</strong><small class="muted"> · venc. ${finDateLabel(r.due)} · ${r.days} dias</small></span><b>${money(r.alertAmount)}</b></div>`).join('') : '<p class="muted">Nenhuma venda vencida no arquivo importado.</p>'}</div></section>` : `<div class="banner note">${icon('alert')}<span>Importe <b>Vendas em Aberto</b> para ativar os alertas. As outras três exportações não informam o vencimento das mensalidades.</span></div>`}`;
}
function finVisualSummaryHtml(key, summary) {
  const alerts = finAlertRows();
  const overdue = finSum(alerts, 'alertAmount');
  const upcoming = finOpenInstallments().filter(row => row.date >= ymd(TODAY));
  const months = [...Array(6)].map((_, i) => {
    const [year, month] = key.split('-').map(Number);
    return new Date(year, month - 6 + i, 1);
  });
  const labels = months.map(date => MON[date.getMonth()]);
  const covered = (type, month) => FIN_DB.coverage.some(row => row.report_type === type && row.period.slice(0, 7) === month);
  const gross = months.map(date => { const month = monthKey(date); return covered('receivables', month) ? finSummary(month).gross / 100 : null; });
  const flow = months.map(date => { const month = monthKey(date); return covered('flow', month) ? (finSummary(month).flow?.total || 0) / 100 : null; });
  const trend = gross.some(value => value !== null) || flow.some(value => value !== null);
  const aging = [
    ['1–30 dias', alerts.filter(row => row.days <= 30)],
    ['31–60 dias', alerts.filter(row => row.days > 30 && row.days <= 60)],
    ['61+ dias', alerts.filter(row => row.days > 60)]
  ].map(([label, rows]) => ({ label, count: rows.length, amount: finSum(rows, 'alertAmount') }));
  const difference = summary.flow && FIN_REPORTS.receivables ? summary.flow.total - summary.gross : null;
  const manual = FIN_MANUAL.filter(row => row.date.slice(0, 7) === key);
  const manualIn = finSum(manual.filter(row => row.type === 'in'), 'amount');
  const manualOut = finSum(manual.filter(row => row.type === 'out'), 'amount');
  return `<div class="fin-summary-body">
    <div class="fin-hero"><div><div class="eyebrow">Disponível após taxas · ${monthLabel(key)}</div><div class="fin-main-value">${FIN_REPORTS.receivables ? money(summary.net) : '—'} ${metricInfo('Recebido líquido')}</div><p>${FIN_REPORTS.receivables ? `${summary.paid.length} recebimento(s) confirmados no último relatório importado.` : 'Importe Contas a Receber para mostrar os recebimentos.'}</p></div>
      <div class="fin-equation"><div><span>Recebido bruto</span><strong>${FIN_REPORTS.receivables ? money(summary.gross) : '—'}</strong></div><b>−</b><div><span>Taxas</span><strong>${FIN_REPORTS.receivables ? money(summary.fees) : '—'}</strong></div><b>=</b><div><span>Líquido</span><strong>${FIN_REPORTS.receivables ? money(summary.net) : '—'}</strong></div></div></div>
    <div class="fin-submetrics"><div><span>Em aberto no mês ${metricInfo('Em aberto no mês')}</span><strong>${FIN_REPORTS.open ? money(summary.openAmount) : '—'}</strong></div><div><span>Mensalidades vencidas ${metricInfo('Em atraso')}</span><strong>${FIN_REPORTS.open ? money(overdue) : '—'}</strong><small>${FIN_REPORTS.open ? `${alerts.length} parcela(s) na última fotografia` : 'Aguardando Vendas em Aberto'}</small></div><div><span>A vencer ${metricInfo('A vencer')}</span><strong>${FIN_REPORTS.open ? money(finSum(upcoming, 'amount')) : '—'}</strong></div></div>
    <div class="fin-visuals"><section class="fin-visual fin-trend"><h2>Evolução dos recebimentos</h2><div class="hint">Últimos seis meses até ${monthLabel(key)}; meses sem importação ficam sem ponto.</div>
      ${trend ? `<div class="legend"><span><i style="background:var(--ok)"></i>Contas a Receber · bruto</span><span><i style="background:var(--info)"></i>Fluxo de Caixa · entradas</span></div>${lineChart({ labels, series: [{ values: gross, color: 'var(--ok)', area: true }, { values: flow, color: 'var(--info)' }], fmt: value => 'R$ ' + Math.round(value).toLocaleString('pt-BR') })}` : '<p class="muted small">Importe meses anteriores para visualizar a tendência.</p>'}
      <p class="hint">As fontes têm definições diferentes; a distância entre as linhas não representa perda automaticamente.</p></section>
      <section class="fin-visual fin-aging"><h2>Atrasos por faixa ${metricInfo('Em atraso')}</h2><div class="hint">Mensalidades vencidas de todos os períodos presentes em Vendas em Aberto.</div>
      ${FIN_REPORTS.open ? aging.map(row => `<div class="fin-aging-row"><span>${row.label}</span><div class="fin-aging-track"><span style="width:${overdue ? Math.max(2, row.amount / overdue * 100) : 0}%"></span></div><strong>${money(row.amount)}</strong></div>`).join('') + `<p class="hint">${alerts.length} parcela(s) vencida(s); importe nova fotografia para atualizar.</p>` : '<p class="muted small">Importe Vendas em Aberto para ativar esta análise.</p>'}</section></div>
    <div class="fin-footnotes"><details><summary>Conferência entre relatórios</summary><div class="stat-line"><span>Contas a Receber · bruto confirmado</span><b>${FIN_REPORTS.receivables ? money(summary.gross) : '—'}</b></div><div class="stat-line"><span>Aguardando confirmação</span><b>${FIN_REPORTS.receivables ? summary.pendingConfirmation.length + ' linha(s)' : '—'}</b></div><div class="stat-line"><span>Fluxo de Caixa · entradas</span><b>${summary.flow ? money(summary.flow.total) : '—'}</b></div><div class="stat-line"><span>Diferença a investigar</span><b>${difference === null ? '—' : money(difference)}</b></div><p class="hint">O fluxo pode ter valores e datas de competência diferentes. Nenhuma diferença é lançada automaticamente.</p></details>
      <details><summary>Conta Digital e lançamentos</summary><div class="stat-line"><span>Depósitos PIX</span><b>${FIN_REPORTS.statement ? money(summary.bankDeposits) : '—'}</b></div><div class="stat-line"><span>Tarifas no extrato</span><b>${FIN_REPORTS.statement ? money(summary.bankFees) : '—'}</b></div><div class="stat-line"><span>Transferências</span><b>${FIN_REPORTS.statement ? money(summary.bankTransfers) : '—'}</b></div><div class="stat-line"><span>Entradas manuais</span><b>${money(manualIn)}</b></div><div class="stat-line"><span>Saídas manuais</span><b>${money(manualOut)}</b></div><p class="hint">Depósitos do extrato servem para conferência; não são somados novamente aos recebimentos.</p></details></div>
    <div class="fin-alert-preview"><div class="panel-head" style="padding:0 0 12px;border:0"><div><h2>Mensalidades que pedem atenção</h2><div class="sub">Última fotografia de Vendas em Aberto</div></div><button class="btn sm" data-act="fin-tab" data-tab="alerts">Ver alertas</button></div>
      ${FIN_REPORTS.open ? (alerts.length ? alerts.slice(0, 4).map(row => `<div class="stat-line"><span><b>${esc(row.name)}</b><small class="muted"> · ${row.days} dias de atraso</small></span><strong>${money(row.alertAmount)}</strong></div>`).join('') : '<p class="muted small">Nenhuma mensalidade vencida no relatório importado.</p>') : '<p class="muted small">Importe Vendas em Aberto para mostrar alertas.</p>'}</div>
  </div>`;
}
function finReceiptsHtml(summary) {
  if (!FIN_REPORTS.receivables) return emptyState('Sem Contas a Receber', 'Importe o XLSX com todas as páginas e colunas ocultas.');
  const list = [...summary.received].sort((a, b) => b.date.localeCompare(a.date));
  return `<div class="panel-pad"><p class="muted small">${list.length} registros no período. “Não recebido” é uma pendência de confirmação, sem vencimento no arquivo; não gera alerta de atraso.</p></div><div class="table-wrap"><table><thead><tr><th>Data</th><th>Cliente</th><th>Item</th><th>Forma</th><th class="num">Bruto</th><th class="num">Taxa</th><th class="num">Líquido</th><th>Situação</th></tr></thead><tbody>${list.map(r => `<tr><td>${finDateLabel(r.date)}</td><td><strong>${esc(r.name)}</strong><div class="hint">Cód. ${esc(r.clientId)}</div></td><td>${esc(r.item)}</td><td>${esc(r.method)}</td><td class="num">${money(r.gross)}</td><td class="num">${money(r.fees)}</td><td class="num">${money(r.net)}</td><td><span class="tag ${r.received ? 'st-ok' : 'st-warn'}">${r.received ? 'Recebido' : 'Não recebido'}</span></td></tr>`).join('') || '<tr><td colspan="8" class="muted">Sem registros para este mês.</td></tr>'}</tbody></table></div>`;
}
function finStatementHtml(summary) {
  if (!FIN_REPORTS.statement) return emptyState('Sem extrato', 'Importe o CSV da Conta Digital.');
  const list = [...summary.statement].sort((a, b) => b.date.localeCompare(a.date));
  return `<div class="panel-pad"><p class="muted small">${list.length} movimentos bancários no mês. Linhas “Saldo do dia” são informativas e não entram nos totais.</p></div><div class="table-wrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Referência da venda</th><th class="num">Valor</th></tr></thead><tbody>${list.filter(r => !finNorm(r.type).startsWith('saldododia')).map(r => `<tr><td>${finDateLabel(r.date)}</td><td>${esc(r.type)}</td><td>${r.saleId ? esc(r.saleId) : '—'}</td><td class="num" style="color:${r.amount >= 0 ? 'var(--ok)' : 'var(--brand-ink)'}">${money(r.amount)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Sem movimentos para este mês.</td></tr>'}</tbody></table></div>`;
}
function finFlowHtml(key, summary) {
  if (!FIN_REPORTS.flow) return emptyState('Sem fluxo de caixa', 'Importe o XLS analítico do Tecnofit.');
  const flow = summary.flow;
  return `<div class="panel-pad"><p class="muted small">${flow ? `Entradas do fluxo em ${monthLabel(key)}: <strong>${money(flow.total)}</strong>` : 'O arquivo importado não contém este mês.'} O relatório é agregado: não identifica atletas nem parcelas em atraso.</p>
    ${flow ? Object.entries(flow.categories).filter(([, v]) => v).sort((a, b) => b[1] - a[1]).map(([name, amount]) => `<div class="stat-line"><span>${esc(name)}</span><b>${money(amount)}</b></div>`).join('') : ''}
    <h3 class="mt2">Histórico no arquivo</h3><div class="table-wrap"><table><thead><tr><th>Mês</th><th class="num">Entradas</th></tr></thead><tbody>${FIN_REPORTS.flow.data.map(r => `<tr><td>${monthLabel(r.month)}</td><td class="num">${money(r.total)}</td></tr>`).join('')}</tbody></table></div></div>`;
}
function finAlertsHtml() {
  if (!FIN_REPORTS.open) return `<div class="panel-pad">${emptyState('Alertas aguardando relatório', 'Vendas em Aberto informa vencimento e saldo. Importe-o desde o primeiro mês com possível débito.')}</div>`;
  const alerts = finAlertRows(), upcoming = finOpenInstallments().filter(r => r.date >= ymd(TODAY));
  const review = FIN_REPORTS.open.data.filter(r => r.needsReview);
  const clients = new Set(alerts.map(r => r.clientId));
  const dates = FIN_REPORTS.open.data.flatMap(r => r.dueDates).sort();
  return `<div class="panel-pad"><div class="grid g3">${finKpi('Atletas com atraso', String(clients.size), `${alerts.length} registro(s)`, 'users')}${finKpi('Saldo vencido', money(finSum(alerts, 'alertAmount')), 'Total em aberto vencido', 'alert')}${finKpi('A vencer', money(finSum(upcoming, 'amount')), `${upcoming.length} parcela(s) no prazo`, 'clock')}</div>
  <p class="hint mt">Vencimentos presentes no arquivo: ${finDateLabel(dates[0])} a ${finDateLabel(dates.at(-1))}. Este intervalo mostra as linhas encontradas; não comprova que períodos anteriores foram incluídos no filtro de exportação.</p>
  <div class="banner note mt">${icon('info')}<span class="small">O status “Bloqueado” do cliente não define atraso. A regra é <b>vencimento anterior a hoje + saldo em aberto positivo</b>. Se uma linha tiver vários vencimentos, ela aparece agrupada e sinalizada para conferência. Para menores, o contato deve ser com o responsável autorizado; o relatório não fornece esse vínculo.</span></div>
  ${review.length ? `<div class="banner warn mt">${icon('alert')}<span>${review.length} linha(s) têm vencimentos e valores que não puderam ser associados. Elas não entram nos totais de alerta; confira o arquivo original antes de agir.</span></div>` : ''}</div>
  <div class="table-wrap"><table><thead><tr><th>Atleta / cliente</th><th>Mensalidade</th><th>Vencimento</th><th class="num">Dias</th><th class="num">Saldo vencido</th><th>Alerta</th></tr></thead><tbody>${alerts.map(r => `<tr><td><strong>${esc(r.name)}</strong><div class="hint">Cód. Tecnofit ${esc(r.clientId)}</div></td><td>${esc(r.item)}</td><td>${r.dueDates.map(finDateLabel).join(' · ')}</td><td class="num">${r.days}</td><td class="num"><strong>${money(r.alertAmount)}</strong></td><td><span class="tag ${r.days > 60 ? 'st-bad' : r.days > 30 ? 'st-warn' : 'st-info'}">${r.days > 60 ? 'Prioritário' : r.days > 30 ? 'Acompanhar' : 'Recente'}</span>${r.dueDates.length > 1 ? '<div class="hint">Vencimentos agrupados</div>' : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nenhuma mensalidade vencida no arquivo.</td></tr>'}</tbody></table></div>`;
}
function finManualHtml(key) {
  const rows = FIN_MANUAL.filter(r => r.date.slice(0, 7) === key).sort((a, b) => b.date.localeCompare(a.date));
  return `<div class="panel-pad"><p class="muted small">Despesas e outras receitas lançadas manualmente nesta sessão. Não são confundidas com o extrato nem com os recebimentos importados.</p></div><div class="table-wrap"><table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Tipo</th><th class="num">Valor</th></tr></thead><tbody>${rows.map(r => `<tr><td>${finDateLabel(r.date)}</td><td>${esc(r.desc)}</td><td>${esc(r.cat)}</td><td>${r.type === 'out' ? 'Saída' : 'Entrada'}</td><td class="num">${money(r.amount)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nenhum lançamento manual neste mês.</td></tr>'}</tbody></table></div>`;
}
function finCoverageCard(type, name) {
  const history = FIN_HISTORY.filter(h => h.type === type);
  const latest = history[0];
  const covered = new Set(FIN_DB.coverage.filter(c => c.report_type === type).map(c => c.period.slice(0, 7)));
  const recent = lastMonths(12).map(monthKey);
  const missing = recent.filter(month => !covered.has(month));
  const label = latest ? new Date(latest.at).toLocaleString('pt-BR') : 'Nunca importado';
  return `<section class="panel fin-import-card"><div class="panel-pad"><div class="stat-line"><span><strong>${name}</strong><br><small class="muted">Última importação: ${label}</small></span><button class="btn sm primary" data-act="fin-import" data-report="${type}" data-edit ${FIN_DB.canImport ? '' : 'disabled'}>${icon('upload')} Importar</button></div>
    <div class="fin-coverage" role="img" aria-label="${recent.filter(m => covered.has(m)).length} de 12 meses com importação registrada, do mais antigo ao mais recente">${recent.map((month, index) => `<i class="${covered.has(month) ? 'on' : ''} ${index === recent.length - 1 ? 'current' : ''}" title="${monthLabel(month)}: ${covered.has(month) ? 'importado' : 'sem importação'}"></i>`).join('')}</div>
    <div class="hint"><b>${recent.length - missing.length} de 12 meses cobertos</b> · ${latest ? `Filtro mais recente: ${finDateLabel(latest.start)} a ${finDateLabel(latest.end)} · ${latest.count} registros` : 'Nenhuma importação registrada'}</div>
    ${missing.length ? `<details class="small mt"><summary>Ver ${missing.length} mês(es) sem importação</summary><p class="hint">${missing.map(monthLabel).join(' · ')}</p></details>` : '<div class="hint">Todos os últimos 12 meses têm importação registrada.</div>'}
  </div></section>`;
}
function finImportsHtml() {
  const account = FIN_DB.authorized ? FIN_DB.session?.user?.email : '';
  return `<div class="panel-pad"><h3>Importação individual por relatório</h3><p class="muted small">Cada arquivo é tratado e gravado separadamente. O arquivo original não é enviado ao banco. A cobertura abaixo usa o período informado por quem exportou; confira sempre o filtro aplicado no Tecnofit.</p>
    ${account ? `<div class="banner note">${icon('check')}<span>Conectado como <b>${esc(account)}</b> · ${FIN_DB.canImport ? 'visualização e importação' : 'somente visualização'}. <button class="btn sm" data-act="fin-db-refresh">Atualizar dados</button></span></div>` : `<div class="banner warn">${icon('alert')}<span>Esta conta precisa ser autorizada na tabela finance_access para consultar ou importar relatórios.</span></div>`}
    ${FIN_DB.error ? `<p class="err mt" role="alert">${esc(FIN_DB.error)}</p>` : ''}</div>
    <div class="panel-pad"><div class="grid g2">${Object.entries(finReportNames).map(([type, name]) => finCoverageCard(type, name)).join('')}</div></div>
    <details class="fin-export-guide"><summary>Onde exportar, formato e período de cada relatório</summary>${finGuide()}</details>
    <div class="panel-pad"><h3>Histórico de importações</h3>${FIN_HISTORY.length ? FIN_HISTORY.map(h => `<div class="stat-line"><span>${esc(finReportNames[h.type])} · ${finDateLabel(h.start)} a ${finDateLabel(h.end)}</span><small>${h.count} linhas · ${new Date(h.at).toLocaleString('pt-BR')}</small></div>`).join('') : '<p class="muted">Nenhuma importação registrada no banco.</p>'}</div>`;
}
function renderFinanceV3() {
  const key = S.fin.month, summary = finSummary(key), alerts = finAlertRows();
  const tabs = [['summary', 'Resumo'], ['receipts', 'Recebimentos'], ['statement', 'Extrato'], ['flow', 'Fluxo de caixa'], ['alerts', `Alertas ${FIN_REPORTS.open ? `(${alerts.length})` : ''}`], ['manual', 'Lançamentos'], ['imports', 'Importações']];
  const content = { summary: () => finVisualSummaryHtml(key, summary), receipts: () => finReceiptsHtml(summary), statement: () => finStatementHtml(summary), flow: () => finFlowHtml(key, summary), alerts: finAlertsHtml, manual: () => finManualHtml(key), imports: finImportsHtml };
  if (!content[S.fin.tab]) S.fin.tab = 'summary';
  return `${viewBanner('finance')}<div class="page-head"><div><div class="eyebrow">Finanças · Tecnofit</div><h1>Financeiro</h1><p>Recebimentos, movimentações, fluxo de caixa e alertas de mensalidades com origem explícita.</p></div><div class="head-actions"><select class="select" id="finMonth" aria-label="Mês" style="width:auto">${monthOptions(key, 12)}</select><button class="btn" data-act="fin-tab" data-tab="imports">Importações</button><button class="btn primary" data-act="finance-manual-new" data-edit>${icon('plus')} Lançamento manual</button></div></div>
  ${finHasImports() ? `<div class="banner note">${icon('info')}<span>Dados financeiros carregados do banco. ${!FIN_REPORTS.open ? 'Alertas aguardam Vendas em Aberto.' : `${alerts.length} mensalidade(s) vencida(s) na última fotografia.`}</span></div>` : `<div class="banner note">${icon('info')}<span><b>Comece pelas exportações do Tecnofit.</b> Abra “Importações” para enviar cada relatório e conferir os meses cobertos.</span></div>`}
  <section class="panel"><div class="tabs fin-tabs">${tabs.map(([id, name]) => `<button class="${S.fin.tab === id ? 'on' : ''}" data-act="fin-tab" data-tab="${id}">${name}</button>`).join('')}</div>${content[S.fin.tab]()}</section>`;
}
function financeManualForm() {
  openDialog(dHead('Novo lançamento', 'Entrada ou saída manual') + `<div class="d-body"><div class="row2"><div class="field"><label for="fmType">Tipo</label><select id="fmType" class="select"><option value="out">Saída</option><option value="in">Entrada</option></select></div><div class="field"><label for="fmDate">Data</label><input id="fmDate" class="input" type="date" value="${ymd(TODAY)}"></div></div><div class="field"><label for="fmDesc">Descrição</label><input id="fmDesc" class="input"></div><div class="row2"><div class="field"><label for="fmCat">Categoria</label><input id="fmCat" class="input" placeholder="Ex.: Locação"></div><div class="field"><label for="fmAmount">Valor (R$)</label><input id="fmAmount" class="input" type="number" min="0.01" step="0.01"></div></div><div class="err" id="fmError" role="alert"></div></div><div class="d-foot"><button class="btn" data-act="close-dialog">Cancelar</button><button class="btn primary" data-act="finance-manual-save" data-edit>Salvar</button></div>`, 'drawer');
}
async function financeManualSave() {
  if (!canEdit('finance')) return;
  const amount = centsInput($('#fmAmount').value), date = $('#fmDate').value, desc = $('#fmDesc').value.trim();
  if (!desc || !/^\d{4}-\d{2}-\d{2}$/.test(date) || amount <= 0) { $('#fmError').textContent = 'Informe data, descrição e valor maior que zero.'; return; }
  const { error } = await financeDbClient().from('v2_finance_manual').insert({
    entry_date: date, description: desc, category: $('#fmCat').value.trim() || 'Outros',
    direction: $('#fmType').value, amount_cents: amount, created_by: APOLLO_AUTH.user.id
  });
  if (error) { $('#fmError').textContent = `Não foi possível salvar: ${error.message}`; return; }
  await financeManualRefresh();
  S.fin.month = date.slice(0, 7); S.fin.tab = 'manual'; closeDialog(); render(); toast('Lançamento manual salvo.');
}
async function financeManualRefresh() {
  if (!seesFinance()) return;
  const rows = await liveAll('v2_finance_manual', 'id,entry_date,description,category,direction,amount_cents');
  FIN_MANUAL.splice(0, FIN_MANUAL.length, ...rows.map(r => ({
    id: r.id, date: r.entry_date, desc: r.description, cat: r.category, type: r.direction, amount: r.amount_cents
  })));
}
