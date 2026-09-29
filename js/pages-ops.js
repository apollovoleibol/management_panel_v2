/* Visão geral · Agendamentos · Atletas */
'use strict';

/* ═══════════════ VISÃO GERAL ═══════════════ */
const monthKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const CUR_MONTH = monthKey(TODAY);
const inMonth = (dateStr, key) => dateStr.slice(0, 7) === key;
function monthTotals(key) {
  const rows = LEDGER.filter(l => inMonth(l.date, key));
  const inn = rows.filter(r => r.type === 'in').reduce((s, r) => s + r.amount, 0);
  const out = rows.filter(r => r.type === 'out').reduce((s, r) => s + r.amount, 0);
  return { inn, out, bal: inn - out, mens: rows.filter(r => r.cat === 'Mensalidades').reduce((s, r) => s + r.amount, 0) };
}
const lastMonths = n => [...Array(n)].map((_, i) => new Date(TODAY.getFullYear(), TODAY.getMonth() - (n - 1 - i), 1));
const expectedMonthly = () => ATHLETES.filter(a => a.active).reduce((s, a) => { const p = PLANS.find(x => x.id === a.planId); return s + (p ? p.value : 0); }, 0);

function renderOverview() {
  if (isCoach()) return renderCoachOverview();
  const fin = seesFinance();
  const importedFinance = fin && finHasImports();
  const cur = monthTotals(CUR_MONTH), prevKey = monthKey(new Date(TODAY.getFullYear(), TODAY.getMonth() - 1, 1)), prev = monthTotals(prevKey);
  const expected = expectedMonthly();
  const delinq = DELINQ.reduce((s, d) => s + d.amount, 0), delinqAth = new Set(DELINQ.map(d => d.athleteId)).size;
  const coachCost = COACH_ITEMS.filter(i => inMonth(i.date, CUR_MONTH)).reduce((s, i) => s + itemValue(i), 0);
  const active = ATHLETES.filter(a => a.active).length;
  const monthName = MONTHS[TODAY.getMonth()];
  const dlt = (a, b, invert = false) => { if (!b) return ''; const v = (a - b) / b * 100; const good = invert ? v < 0 : v > 0; return `<span class="delta ${Math.abs(v) < .5 ? 'flat' : good ? 'up' : 'down'}">${v > 0 ? '▲' : v < 0 ? '▼' : ''} ${Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>`; };

  const past = BOOKINGS.filter(b => parseLocal(b.date) < NOW && b.status !== 'Cancelado');
  const showed = past.filter(b => !['Ausente', 'Pendente', 'Agendado'].includes(b.status)).length;
  const recentBookings = BOOKINGS.filter(b => b.createdAt && parseYmd(b.createdAt) >= addDays(TODAY, -29));
  const attended = recentBookings.filter(b => ['Em avaliação','Em cadastro','Tecnofit'].includes(b.status));
  const registering = recentBookings.filter(b => ['Em cadastro','Tecnofit'].includes(b.status));
  const enrolled = recentBookings.filter(b => b.status === 'Tecnofit');
  const funnel = [['Agendamentos', recentBookings.length, 'Supabase'], ['Compareceram ao teste', attended.length, 'Supabase'], ['Em cadastro', registering.length, 'Supabase'], ['Matriculados', enrolled.length, 'Supabase']];

  const months = lastMonths(6), labels = months.map(m => MON[m.getMonth()]);
  const realized = months.map(m => monthKey(m) === CUR_MONTH ? null : monthTotals(monthKey(m)).inn);
  const realizedVals = realized.filter(v => v != null);
  const growth = realizedVals.length > 1 && realizedVals[0] > 0 ? Math.pow(realizedVals.at(-1) / realizedVals[0], 1 / (realizedVals.length - 1)) : 1;
  const future = [1, 2, 3].map(k => new Date(TODAY.getFullYear(), TODAY.getMonth() + k, 1));
  const projStart = realizedVals.at(-1) || 0;
  const projection = [...realized.map((v, i) => i === realized.length - 2 ? v : null), Math.round(projStart * growth), ...future.map((_, k) => Math.round(projStart * Math.pow(growth, k + 2)))];
  const realLine = [...realized, null, null, null];
  const outLine = [...months.map(m => monthKey(m) === CUR_MONTH ? null : monthTotals(monthKey(m)).out), null, null, null];

  const kpis = importedFinance ? (() => { const r = finSummary(CUR_MONTH), overdue = finAlertRows(); return [
    ['Recebido bruto', FIN_REPORTS.receivables ? money(r.gross) : '—', 'Recebimentos confirmados no Tecnofit', 'Tecnofit', 'money'],
    ['Taxas', FIN_REPORTS.receivables ? money(r.fees) : '—', 'Contas a Receber', 'Tecnofit', 'wallet'],
    ['Recebido líquido', FIN_REPORTS.receivables ? money(r.net) : '—', 'Bruto menos taxas', 'Tecnofit', 'trend'],
    ['Mensalidades vencidas', FIN_REPORTS.open ? money(overdue.reduce((s, x) => s + x.alertAmount, 0)) : '—', FIN_REPORTS.open ? `${new Set(overdue.map(x => x.clientId)).size} atleta(s)` : 'Importe Vendas em Aberto', 'Tecnofit', 'alert'],
    ['Fluxo analítico', r.flow ? money(r.flow.total) : '—', 'Entradas agregadas do mês', 'Tecnofit', 'chart'],
  ]; })() : [
    ['Entradas no mês', '—', 'Importe os relatórios do Tecnofit', 'Tecnofit', 'money'],
    ['Receita prevista (tabela)', money(expected), `${active} atletas ativos × pacote`, 'Supabase', 'layers'],
    ['Inadimplência', '—', 'Importe Vendas em Aberto', 'Tecnofit', 'alert'],
    ['Custo com técnicos', COACH_ITEMS.length ? money(coachCost) : '—', 'Cadastre as horas e diárias', 'Pagamentos', 'wallet'],
    ['Resultado do mês', '—', 'Aguardando dados financeiros', 'Financeiro', 'trend'],
  ];
  const svc = [
    ['1ª resposta do assistente', '—', 'Medição ainda indisponível', 'Assistente', 'bot'],
    ['Tempo até agendar', '—', 'Medição ainda indisponível', 'Assistente', 'clock'],
    ['Retorno humano', '—', 'Medição ainda indisponível', 'Assistente', 'whatsapp'],
    ['Comparecimento', pct(showed, past.length), `${showed} de ${past.length} testes realizados`, 'Supabase', 'check'],
    ['Reagendamentos', pct(BOOKINGS.filter(b => b.reag > 0).length, BOOKINGS.length), 'dos agendamentos no período', 'Supabase', 'refresh'],
    ['Satisfação', '—', 'Pesquisa ainda não implantada', 'Proposta', 'star'],
  ];

  return `
  <div class="page-head"><div><div class="eyebrow">Apollo · ${monthName} de ${TODAY.getFullYear()}</div><h1>Visão geral</h1><p>${fin ? 'Finanças, atendimento, conversão e a agenda de treinos em um só lugar.' : 'Operação, atendimento, conversão e a agenda de treinos em um só lugar.'} Cada número indica a fonte de onde vem.</p></div>
    <div class="head-actions"><button class="btn" data-act="export-overview">${icon('download')} Exportar resumo</button></div></div>

  ${importedFinance ? `<div class="banner note">${icon('info')}<span>Indicadores financeiros dos relatórios importados; indicadores operacionais do Supabase.</span></div>` : ''}
  ${fin ? `<div class="section-title" style="margin-top:0"><h2>Financeiro</h2></div>
  <div class="grid g5">${kpis.map(([l, v, f, s, i]) => `<div class="kpi"><div class="kpi-label">${l}${icon(i)}</div><div class="kpi-value">${v}</div><div class="kpi-foot">${f}</div><div class="kpi-foot" style="margin-top:6px">${srcTag(s)}</div></div>`).join('')}</div>` : opsKpisHTML()}

  <div class="section-title"><h2>Agenda da semana</h2></div>
  ${weekCalendarHTML()}

  <div class="section-title"><h2>Atendimento e conversão de leads</h2></div>
  <div class="split-wide">
    <section class="panel"><div class="panel-head"><div><h2>Funil de conversão</h2><div class="sub">Últimos 30 dias · agendamentos registrados no Supabase</div></div><span class="tag nodot st-ok">Conversão total ${pct(enrolled.length, recentBookings.length, 1)}</span></div>
      <div class="panel-pad"><div class="funnel">${funnel.map(([l, v, s], i) => `<div class="funnel-row"><span>${l}<br>${srcTag(s)}</span><div class="funnel-bar"><span style="width:${recentBookings.length ? v / recentBookings.length * 100 : 0}%;opacity:${1 - i * .13}">${v}</span></div><span class="rate">${i ? pct(v, funnel[i - 1][1]) + ' da etapa' : 'base'}</span></div>`).join('')}</div>
      <div class="grid g3 mt">${NUCLEI.map(n => { const local = recentBookings.filter(b => teamOf(b.teamId)?.n === n.id); const converted = local.filter(b => b.status === 'Tecnofit').length; const value = local.length ? Math.round(converted / local.length * 100) : 0; return `<div><div class="stat-line" style="border:0;padding:0 0 6px">${nTag(n.id)}<b>${local.length ? value + '%' : '—'}</b></div><div class="bar"><span style="width:${value}%;background:var(--brand)"></span></div><div class="hint" style="margin-top:4px">agendamento → matrícula</div></div>`; }).join('')}</div></div>
    </section>
    <div class="grid g2">${svc.map(([l, v, f, s, i]) => `<div class="kpi"><div class="kpi-label">${l}${icon(i)}</div><div class="kpi-value" style="font-size:22px">${v}</div><div class="kpi-foot">${f}</div><div class="kpi-foot" style="margin-top:4px">${srcTag(s)}</div></div>`).join('')}</div>
  </div>

  <div class="section-title"><h2>Projeções</h2></div>
  ${false ? `  <div class="split-wide">
    <section class="panel"><div class="panel-head"><div><h2>Receita: realizado e projeção</h2><div class="sub">Entradas mensais; projeção pela tendência dos últimos meses (cenário base)</div></div>
      <div class="legend"><span><i style="background:var(--ok)"></i>Entradas realizadas</span><span><i style="background:var(--brand)"></i>Saídas</span><span><i class="dash" style="border-color:var(--info)"></i>Projeção de entradas</span></div></div>
      <div class="panel-pad">${lineChart({ labels: [...labels, ...future.map(m => MON[m.getMonth()])], series: [{ values: realLine, color: 'var(--ok)', area: true }, { values: outLine, color: 'var(--brand)' }, { values: projection, color: 'var(--info)', dash: true }], fmt: v => 'R$ ' + Math.round(v / 100000) + ' mil' })}</div>
    </section>
    <section class="panel"><div class="panel-head"><div><h2>Próximos 90 dias</h2><div class="sub">Cenário base · atualiza ao importar dados do Tecnofit</div></div></div>
      <div class="panel-pad">
        ${[['Receita prevista em ' + MONTHS[future[0].getMonth()], money(projection[6])],
           ['Receita acumulada (3 meses)', money(projection.slice(6).reduce((a, b) => a + b, 0))],
           ['Atletas ativos em 90 dias', `${Math.round(active * 1.06)} <span class="delta up">+${Math.round(active * .06)}</span>`],
           ['Inadimplência projetada', `${pct(delinq * .9, expected, 1)} <span class="delta up">▼ melhora</span>`],
           ['Folha técnica prevista / mês', money(Math.round(coachCost / Math.max(TODAY.getDate(), 1) * 30))],
           ['Resultado projetado / mês', money(projection[6] - (prev.out || cur.out))]].map(([k, v]) => `<div class="stat-line"><span class="muted">${k}</span><b>${v}</b></div>`).join('')}
        <div class="banner note mt" style="margin-bottom:0">${icon('info')}<span class="small">Projeção estimada: usa receita de tabela, histórico importado e taxa de conversão. Não considera reajustes futuros nem sazonalidade de férias.</span></div>
      </div>
    </section>
  </div>` : athletesProjectionHTML()}
  `;
}

function weekCalendarHTML() {
  const ws = startOfWeek(S.cal.cursor), days = [...Array(7)].map((_, i) => addDays(ws, i));
  const H0 = 6, H1 = 23, PH = 46, end = addDays(ws, 6);
  const range = ws.getMonth() === end.getMonth() ? `${ws.getDate()} – ${end.getDate()} de ${MONTHS[end.getMonth()]} ${end.getFullYear()}` : `${ws.getDate()} ${MON[ws.getMonth()].toLowerCase()} – ${end.getDate()} ${MON[end.getMonth()].toLowerCase()} ${end.getFullYear()}`;
  let total = 0;
  const cols = days.map(d => {
    const key = ymd(d);
    const mine = myTeamIds(); const evs = TEAMS.filter(t => t.active && S.cal.nuclei.has(t.n) && mine.includes(t.id)).flatMap(t => t.schedule.filter(s => s.day === d.getDay()).map(s => ({ t, s, blocked: t.blocked.includes(key), tests: BOOKINGS.filter(b => b.teamId === t.id && b.date.slice(0, 10) === key && b.status !== 'Cancelado' && !b.archived) })))
      .sort((a, b) => toMin(a.s.start) - toMin(b.s.start));
    // faixas por grupo de treinos sobrepostos (eventos isolados ocupam a largura toda)
    let lanes = [], cluster = [], clusterEnd = -1;
    const closeCluster = () => { cluster.forEach(e => { e.L = lanes.length; }); lanes = []; cluster = []; };
    evs.forEach(e => {
      if (toMin(e.s.start) >= clusterEnd) closeCluster();
      let i = lanes.findIndex(l => l <= toMin(e.s.start)); if (i < 0) { i = lanes.length; lanes.push(0); }
      lanes[i] = toMin(e.s.end); e.lane = i; cluster.push(e); clusterEnd = Math.max(clusterEnd, toMin(e.s.end));
    });
    closeCluster();
    total += evs.filter(e => !e.blocked).length;
    const isToday = key === ymd(TODAY);
    const html = evs.map(e => {
      const top = (toMin(e.s.start) - H0 * 60) / 60 * PH, h = (toMin(e.s.end) - toMin(e.s.start)) / 60 * PH - 3;
      const c = coachOf(e.t.coach);
      return `<button class="ev ${e.blocked ? 'blocked' : NCLASS(e.t.n)}" style="top:${top}px;height:${h}px;left:calc(${e.lane / e.L * 100}% + 3px);width:calc(${100 / e.L}% - 6px)" data-act="cal-event" data-team="${e.t.id}" data-date="${key}" aria-label="${esc(e.t.name)}, ${e.s.start} às ${e.s.end}${e.blocked ? ', sem treino' : ''}">
        <strong>${esc(e.t.name)}</strong><span>${e.s.start}–${e.s.end}${e.blocked ? ' · sem treino' : ''}</span>${h > 50 ? `<span>${c ? esc(c.name) : 'Sem técnico'}</span>` : ''}${S.cal.showTests && e.tests.length && !e.blocked ? `<span class="tests">${icon('target')} ${e.tests.length} teste${e.tests.length > 1 ? 's' : ''}</span>` : ''}</button>`;
    }).join('');
    const nowLine = isToday && NOW.getHours() >= H0 && NOW.getHours() < H1 ? `<div class="now-line" style="top:${((NOW.getHours() - H0) * 60 + NOW.getMinutes()) / 60 * PH}px"></div>` : '';
    return { head: `<div class="cal-head ${isToday ? 'today' : ''}"><div class="dname">${DOW[d.getDay()]}</div><div class="dnum">${d.getDate()}</div><span class="dcount">${evs.filter(e => !e.blocked).length} treinos</span></div>`, col: `<div class="cal-col ${isToday ? 'today' : ''}" style="height:${(H1 - H0) * PH}px">${html}${nowLine}</div>` };
  });
  const gutter = [...Array(H1 - H0)].map((_, i) => i ? `<span style="top:${i * PH}px">${pad(H0 + i)}:00</span>` : '').join('');
  return `<section class="panel">
    <div class="cal-toolbar">
      <button class="btn sm" data-act="cal-today">Hoje</button>
      <button class="btn ghost sq" data-act="cal-nav" data-dir="-1" aria-label="Semana anterior">${icon('left')}</button>
      <button class="btn ghost sq" data-act="cal-nav" data-dir="1" aria-label="Próxima semana">${icon('right')}</button>
      <span class="range">${range}</span>
      <span class="muted small">${total} treinos na semana</span>
      <div class="chips" style="margin-left:auto">${NUCLEI.filter(n => TEAMS.some(t => t.n === n.id && myTeamIds().includes(t.id))).map(n => `<button class="chip ${S.cal.nuclei.has(n.id) ? '' : 'off'}" data-act="cal-nucleus" data-n="${n.id}" aria-pressed="${S.cal.nuclei.has(n.id)}"><span class="dot" style="background:var(--n-${NCLASS(n.id)},var(--faint))"></span>Núcleo ${esc(n.name)}</button>`).join('')}
        <label class="chip" style="cursor:pointer"><input type="checkbox" data-act="cal-tests" ${S.cal.showTests ? 'checked' : ''} style="accent-color:var(--brand);margin:0"> Testes agendados</label></div>
    </div>
    <div class="cal-scroll"><div class="cal">
      <div class="cal-head" style="border-right:1px solid var(--line-2)"></div>${cols.map(c => c.head).join('')}
      <div class="cal-gutter" style="height:${(H1 - H0) * PH}px">${gutter}</div>${cols.map(c => c.col).join('')}
    </div></div>
    <div class="panel-foot"><span>Treinos gerados a partir dos horários de cada equipe. Datas indisponíveis aparecem riscadas.</span><span>Clique em um treino para ver detalhes e testes marcados.</span></div>
  </section>`;
}

function openCalEvent(tid, date) {
  const t = teamOf(tid), d = parseYmd(date), s = t.schedule.find(x => x.day === d.getDay()), n = nucleusOf(t.n), c = coachOf(t.coach);
  const blocked = t.blocked.includes(date);
  const tests = BOOKINGS.filter(b => b.teamId === tid && b.date.slice(0, 10) === date && !b.archived);
  const count = ATHLETES.filter(a => a.active && a.teamId === tid).length;
  openDialog(dHead(`${DOW_FULL[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`, esc(t.name), `${s.start} às ${s.end}`) + `<div class="d-body">
    <div style="display:flex;gap:8px;flex-wrap:wrap">${nTag(t.n)}<span class="tag nodot">${esc(t.category)}</span><span class="tag nodot">${ageRange(t)} · ${genderLabel(t.gender)}</span>${blocked ? '<span class="tag st-cancelado">Data indisponível — sem treino</span>' : ''}</div>
    <div class="kv"><div><small>Local</small><strong>${esc(n.venue)}</strong><div class="hint">${esc(n.address)}</div></div><div><small>Técnico responsável</small><strong>${c ? esc(c.name) : '—'}</strong></div><div><small>Atletas ativos</small><strong>${count}</strong></div><div><small>Duração</small><strong>${hoursBetween(s.start, s.end).toLocaleString('pt-BR')} h</strong></div></div>
    <h3>Testes marcados neste treino</h3>
    ${tests.length ? `<ul class="list" style="margin:6px -24px 0">${tests.map(b => `<li><span class="time-pill">${b.date.slice(11)}</span><div style="flex:1;min-width:0"><strong>${esc(b.nomeMenor || b.nome)}</strong><div class="hint">${b.nomeMenor ? 'Resp.: ' + esc(b.nome) : fmtPhone(b.whatsapp)}</div></div>${stTag(b.status)}</li>`).join('')}</ul>` : '<p class="muted small">Nenhum teste marcado para esta data.</p>'}
  </div><div class="d-foot"><button class="btn left" data-act="goto-team" data-id="${tid}">${icon('pin')} Abrir equipe</button>${!blocked && parseYmd(date) >= TODAY ? `<button class="btn primary" data-act="booking-new" data-team="${tid}" data-date="${date}" data-need="bookings">${icon('plus')} Agendar teste neste treino</button>` : ''}</div>`, 'drawer');
}

/* ═══════════════ AGENDAMENTOS ═══════════════ */
function weeksCount(pred) {
  const w = [0, 0, 0, 0];
  BOOKINGS.filter(pred).forEach(b => { const diff = Math.ceil(Math.abs(NOW - parseLocal(b.date)) / 864e5); if (diff <= 7) w[3]++; else if (diff <= 14) w[2]++; else if (diff <= 21) w[1]++; else if (diff <= 28) w[0]++; });
  return w;
}
function renderBookings() {
  const live = BOOKINGS.filter(b => !b.archived && myTeamIds().includes(b.teamId));
  const k = [
    ['agendado', 'Agendados', live.filter(b => b.status === 'Agendado').length, weeksCount(b => b.status === 'Agendado'), 'var(--ok)', 'check'],
    ['reag', 'Reagendados', live.filter(b => b.reag > 0).length, weeksCount(b => b.reag > 0), 'var(--violet)', 'refresh'],
    ['ausente', 'Ausentes', live.filter(b => b.status === 'Ausente').length, weeksCount(b => b.status === 'Ausente'), 'var(--warn)', 'clock'],
    ['cancelado', 'Cancelados', live.filter(b => b.status === 'Cancelado').length, weeksCount(b => b.status === 'Cancelado'), 'var(--brand)', 'x'],
  ];
  const teams = [...new Set(BOOKINGS.map(b => b.teamId))].filter(id => myTeamIds().includes(id)).map(teamOf).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  return `${viewBanner('bookings')}${coachScopeBanner()}
  <div class="page-head"><div><div class="eyebrow">Operação · peneiras e aulas experimentais</div><h1>Agendamentos</h1><p>Agendamentos feitos pelo assistente e manualmente. Os próximos 2 dias ficam em destaque.</p></div>
    <div class="head-actions"><button class="btn primary" data-act="booking-new" data-edit>${icon('plus')} Novo agendamento</button></div></div>
  <div class="grid g4 mb">${k.map(([id, l, v, w, c, i]) => `<button class="kpi click ${S.bk.kpi === id ? 'on' : ''}" data-act="bk-kpi" data-k="${id}" aria-pressed="${S.bk.kpi === id}"><span class="kpi-label">${l}${icon(i)}</span><span class="kpi-value">${v}</span><span class="kpi-foot">últimas 4 semanas</span>${sparkline(w, c)}</button>`).join('')}</div>
  <section class="panel">
    <div class="toolbar">
      <div class="search">${icon('search')}<input class="input" id="bkQ" type="search" placeholder="Buscar por nome ou WhatsApp..." value="${esc(S.bk.q)}" aria-label="Buscar agendamento"></div>
      <select class="select" id="bkStatus" aria-label="Filtrar status"><option value="">Todos os status</option>${STATUS.map(s => `<option ${S.bk.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <select class="select" id="bkTeam" aria-label="Filtrar equipe"><option value="">Todas as equipes</option>${teams.map(t => `<option value="${t.id}" ${S.bk.team === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
      <div class="seg" role="group" aria-label="Visão"><button class="${S.bk.archived ? '' : 'on'}" data-act="bk-arch" data-v="0">Ativos</button><button class="${S.bk.archived ? 'on' : ''}" data-act="bk-arch" data-v="1">${icon('archive')} Arquivados <span class="muted">${BOOKINGS.filter(b => b.archived).length}</span></button></div>
    </div>
    <div id="bkTable">${bookingsTable()}</div>
  </section>`;
}
function bookingsFiltered() {
  const q = S.bk.q.toLowerCase().trim();
  const mine = myTeamIds();
  return BOOKINGS.filter(b => mine.includes(b.teamId) && (S.bk.archived ? b.archived : !b.archived)
    && (!q || [b.nome, b.nomeMenor, b.whatsapp, fmtPhone(b.whatsapp)].some(v => String(v || '').toLowerCase().includes(q)))
    && (!S.bk.status || b.status === S.bk.status) && (!S.bk.team || b.teamId === S.bk.team)
    && (!S.bk.kpi || (S.bk.kpi === 'reag' ? b.reag > 0 : b.status.toLowerCase() === S.bk.kpi)));
}
function bookingsTable() {
  const list = bookingsFiltered();
  if (!list.length) return emptyState('Nenhum agendamento encontrado', 'Ajuste a busca ou os filtros.', `<button class="btn sm" data-act="bk-clear">Limpar filtros</button>`);
  const { col, dir } = S.bk.sort, m = dir === 'asc' ? 1 : -1;
  const key = b => col === 'nome' ? (b.nomeMenor || b.nome).toLowerCase() : col === 'equipe' ? teamOf(b.teamId).name.toLowerCase() : b.date;
  const sorted = [...list].sort((a, b) => key(a) < key(b) ? -m : key(a) > key(b) ? m : 0);
  const fut = sorted.filter(b => parseLocal(b.date) >= TODAY), past = sorted.filter(b => parseLocal(b.date) < TODAY);
  if (col === 'data') past.reverse();
  const in48 = b => { const d = parseLocal(b.date); return d > NOW && d - NOW <= 48 * 36e5; };
  const row = b => {
    const t = teamOf(b.teamId), minor = !!b.nomeMenor;
    return `<tr class="rowlink ${in48(b) ? 'soon' : ''}" data-act="booking-open" data-id="${b.id}" tabindex="0">
      <td><div class="person"><span class="avatar ${minor ? 'kid' : ''}">${minor ? icon('child') : initials(b.nome)}</span><div><strong>${esc(b.nomeMenor || b.nome)}</strong>${minor ? `<small>Resp.: ${esc(b.nome)}</small>` : `<small>${fmtPhone(b.whatsapp)}</small>`}</div></div></td>
      <td><div class="cell-actions"><button class="btn sq" data-act="${b.archived ? 'booking-unarchive' : 'booking-archive'}" data-id="${b.id}" data-edit title="${b.archived ? 'Restaurar' : 'Arquivar'}" aria-label="${b.archived ? 'Restaurar' : 'Arquivar'} agendamento">${icon(b.archived ? 'unarchive' : 'archive')}</button><button class="btn sq wa" data-act="booking-wa" data-id="${b.id}" title="Contatar via WhatsApp" aria-label="Contatar via WhatsApp">${icon('whatsapp')}</button></div></td>
      <td><div style="display:flex;align-items:center;gap:8px;white-space:nowrap">${fmtDT(b.date)}${b.reag ? `<span class="reag" title="${b.reag} reagendamento(s)">${b.reag}</span>` : ''}${in48(b) ? '<span class="tag st-ok nodot">em 48h</span>' : ''}</div></td>
      <td><strong style="font-size:13px">${esc(t.name)}</strong><div class="hint">${esc(nucleusOf(t.n).venue)}</div></td>
      <td>${stTag(b.status)}</td></tr>`;
  };
  const th = (c, l) => `<th><button class="sort ${col === c ? 'on' : ''}" data-act="bk-sort" data-col="${c}" aria-label="Ordenar por ${l}">${l} ${icon('sort')}</button></th>`;
  return `<div class="table-wrap"><table><thead><tr>${th('nome', 'Atleta / Resp.')}<th>Contato</th>${th('data', 'Data do teste')}${th('equipe', 'Equipe / Local')}<th>Status</th></tr></thead><tbody>
    ${fut.map(row).join('')}${fut.length && past.length ? '<tr class="sep"><td colspan="5">Agendamentos passados</td></tr>' : ''}${past.map(row).join('')}</tbody></table></div>
    <div class="panel-foot"><span>${list.length} agendamento${list.length > 1 ? 's' : ''}${S.bk.archived ? ' arquivados' : ''}</span><span>Clique em uma linha para ver detalhes, conversa e ações.</span></div>`;
}

function openBooking(id) {
  const b = BOOKINGS.find(x => x.id === id), t = teamOf(b.teamId), n = nucleusOf(t.n), ed = canEdit('bookings');
  openDialog(dHead('Agendamento', esc(b.nomeMenor || b.nome), b.nomeMenor ? 'Responsável: ' + esc(b.nome) : '') + `<div class="d-body">
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${stTag(b.status)}${b.reag ? `<span class="tag st-em-cadastro nodot">${b.reag} reagendamento(s)</span>` : ''}${b.archived ? '<span class="tag nodot">Arquivado</span>' : ''}</div>
    <div class="kv"><div><small>Data e hora</small><strong>${fmtDT(b.date)}</strong></div><div><small>WhatsApp</small><strong>${fmtPhone(b.whatsapp)}</strong></div><div><small>Equipe</small><strong>${esc(t.name)}</strong></div><div><small>Local</small><strong>${esc(n.venue)}</strong><div class="hint">${esc(n.address)}</div></div></div>
    <div class="grid g2" style="gap:8px">
      <button class="btn" data-act="booking-edit" data-id="${id}" data-edit>${icon('edit')} Editar manualmente</button>
      <button class="btn" data-act="booking-chat" data-id="${id}">${icon('chat')} Ver conversa com o assistente</button>
      <button class="btn wa" data-act="booking-wa" data-id="${id}">${icon('whatsapp')} Mensagem no WhatsApp</button>
      <button class="btn" data-act="${b.archived ? 'booking-unarchive' : 'booking-archive'}" data-id="${id}" data-edit>${icon(b.archived ? 'unarchive' : 'archive')} ${b.archived ? 'Restaurar' : 'Arquivar'}</button>
    </div>
    <h3 class="mt2">Histórico</h3>
    <div class="timeline"><div>Agendamento criado<small>${b.createdAt ? b.createdAt.split('-').reverse().join('/') : 'Data indisponível'}</small></div>${b.reag ? `<div>Reagendado ${b.reag}x</div>` : ''}${b.status !== 'Agendado' && b.status !== 'Pendente' ? `<div>Status atual: ${esc(b.status)}</div>` : ''}${b.archived ? '<div>Arquivado</div>' : ''}</div>
    ${ed ? '' : `<div class="banner view mt">${icon('eye')}<span>Seu perfil pode consultar este agendamento, mas não editar.</span></div>`}
  </div>`, 'drawer');
}

function bookingForm(id, preset = {}) {
  const b = id ? BOOKINGS.find(x => x.id === id) : null;
  const st = { team: b ? b.teamId : preset.team || '', date: b ? b.date : '', month: b ? parseLocal(b.date) : preset.date ? parseYmd(preset.date) : new Date(TODAY) };
  if (preset.date && preset.team) { const t = teamOf(preset.team), s = t.schedule.find(x => x.day === parseYmd(preset.date).getDay()); if (s) st.date = `${preset.date}T${s.start}`; }
  const teams = TEAMS.filter(t => t.active);
  const draw = () => {
    const t = teamOf(st.team), minor = isMinorTeam(t);
    const body = $('#bkFormBody');
    body.querySelector('#fbNomeLbl').textContent = minor ? 'Nome do responsável *' : 'Nome do atleta *';
    body.querySelector('#fbMenorBox').classList.toggle('hide', !minor);
    body.querySelector('#fbDate').value = st.date ? fmtDT(st.date) : '';
    body.querySelector('#fbCal').innerHTML = t ? miniCal({ id: 'fbMcal', month: st.month, selected: st.date.slice(0, 10), isEnabled: d => d >= TODAY && t.schedule.some(s => s.day === d.getDay()) && !t.blocked.includes(ymd(d)), cls: d => t.blocked.includes(ymd(d)) && t.schedule.some(s => s.day === d.getDay()) ? 'block' : t.schedule.some(s => s.day === d.getDay()) && d >= TODAY ? 'train' : '' }) + `<div class="hint" style="margin-top:6px">Dias em verde: treinos de ${esc(t.name)} (${t.schedule.map(schedText).join(', ')}). O horário é preenchido automaticamente.</div>` : '<div class="preview muted small">Selecione a equipe para ver os dias de treino disponíveis.</div>';
  };
  openDialog(dHead(id ? 'Editar agendamento' : 'Novo agendamento', id ? esc(b.nomeMenor || b.nome) : 'Agendar teste', id ? '' : 'O agendamento é criado com status Agendado e aparece para o técnico no Manager.') + `<form id="bkForm" class="d-body" novalidate><div id="bkFormBody">
    <div class="field"><label for="fbTeam">Equipe / Local *</label><select class="select" id="fbTeam" required><option value="">Selecione uma equipe...</option>${NUCLEI.map(n => `<optgroup label="Núcleo ${esc(n.name)}">${teams.filter(t => t.n === n.id).map(t => `<option value="${t.id}" ${st.team === t.id ? 'selected' : ''}>${esc(t.name)} — ${esc(n.venue)}</option>`).join('')}</optgroup>`).join('')}</select></div>
    <div class="field"><label for="fbNome" id="fbNomeLbl">Nome do atleta *</label><input class="input" id="fbNome" required value="${esc(b ? b.nome : '')}"></div>
    <div class="field" id="fbMenorBox"><label for="fbMenor">Nome do atleta menor *</label><input class="input" id="fbMenor" value="${esc(b ? b.nomeMenor : '')}"><span class="hint">Equipe de base: o responsável é o contato; o nome do atleta é obrigatório.</span></div>
    <div class="field"><label for="fbWpp">WhatsApp *</label><input class="input" id="fbWpp" inputmode="tel" placeholder="(XX) XXXXX-XXXX" value="${esc(b ? fmtPhone(b.whatsapp) : '')}"><span class="err hide" id="fbWppErr">Número inválido — informe DDD e número.</span></div>
    <div class="field"><label for="fbDate">Data e hora *</label><input class="input" id="fbDate" readonly placeholder="Escolha no calendário abaixo"><div id="fbCal"></div></div>
    ${id ? `<div class="field"><label for="fbStatus">Status</label><select class="select" id="fbStatus">${[...STATUS, ...(STATUS.includes(b.status) ? [] : [b.status])].map(s => `<option ${b.status === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>` : ''}
    <div class="err" id="fbErr" role="alert"></div>
  </div></form>
  <div class="d-foot">${id ? `<button class="btn danger left" data-act="booking-delete" data-id="${id}" data-edit>${icon('trash')} Excluir</button>` : ''}<button class="btn" data-act="try-close">Cancelar</button><button class="btn ok" data-act="booking-save" data-id="${id || ''}">${icon('check')} Salvar</button></div>`, 'drawer');
  const dlg = $('#dlg'); dlg.dataset.dirty = '0';
  dlg._bk = st; draw();
  $('#fbTeam').addEventListener('change', e => { st.team = e.target.value; st.date = ''; draw(); dlg.dataset.dirty = '1'; });
  $('#fbWpp').addEventListener('input', e => { e.target.value = maskPhone(e.target.value); });
  $('#bkForm').addEventListener('input', () => { dlg.dataset.dirty = '1'; });
  $('#fbCal').addEventListener('click', e => {
    const nav = e.target.closest('[data-mcal]'); if (nav) { st.month = new Date(st.month.getFullYear(), st.month.getMonth() + Number(nav.dataset.mcal), 1); draw(); return; }
    const day = e.target.closest('[data-day]'); if (!day || day.disabled) return;
    const t = teamOf(st.team), s = t.schedule.find(x => x.day === parseYmd(day.dataset.day).getDay());
    st.date = `${day.dataset.day}T${s ? s.start : '00:00'}`; dlg.dataset.dirty = '1'; draw();
  });
}
async function saveBooking(id) {
  const st = $('#dlg')._bk, t = teamOf(st.team), minor = isMinorTeam(t);
  const nome = $('#fbNome').value.trim(), menor = $('#fbMenor').value.trim(), wpp = digits($('#fbWpp').value);
  $('#fbWppErr').classList.toggle('hide', !wpp || wpp.length >= 10);
  if (!st.team || !nome || !wpp || !st.date || (minor && !menor)) { $('#fbErr').textContent = 'Preencha todos os campos obrigatórios.'; return false; }
  if (wpp.length < 10) { $('#fbErr').textContent = 'Número de WhatsApp inválido.'; return false; }
  const statuses = { 'Pendente': 'PENDING', 'Agendado': 'CONFIRMED', 'Em avaliação': 'IN_EVALUATION',
    'Em cadastro': 'IN_REGISTRATION', 'Tecnofit': 'TECNOFIT', 'Ausente': 'MISSED', 'Cancelado': 'CANCELLED' };
  const before = id ? BOOKINGS.find(x => x.id === id) : null;
  const payload = { name: nome, minor_name: minor ? menor : null, whatsapp_phone: wpp,
    scheduled_at: st.date, target_team: t.name, target_location: nucleusOf(t.n)?.venue || '', team_id: t.id,
    status: id ? statuses[$('#fbStatus').value] : 'CONFIRMED' };
  if (before && before.date !== st.date) payload.reschedule_count = before.reag + 1;
  try {
    await liveWrite('tryouts', payload, id);
    $('#dlg').dataset.dirty = '0'; closeDialog(); await liveReload();
    toast(id ? 'Agendamento atualizado.' : 'Agendamento criado.'); return true;
  } catch (error) { $('#fbErr').textContent = `Não foi possível salvar: ${error.message}`; return false; }
}
function waMessage(id) {
  const b = BOOKINGS.find(x => x.id === id), t = teamOf(b.teamId), n = nucleusOf(t.n), d = parseLocal(b.date);
  const tomorrow = ymd(d) === ymd(addDays(TODAY, 1)), hh = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const text = tomorrow
    ? `Olá, ${b.nome}! Estou passando pra te lembrar que o seu agendamento está marcado para amanhã, às ${hh}. O endereço é ${n.address}. Até breve! 👋`
    : `Olá, ${b.nome}, tudo bem? Espero que sim! O seu agendamento para fazer parte da nossa equipe está marcado para o dia ${fmtDate(d)}, às ${hh}. Relembro que o endereço é ${n.address}. Te aguardamos! Até breve 👋`;
  const num = '55' + digits(b.whatsapp);
  const d2 = $('#dlg2');
  d2.innerHTML = `<div class="d-head"><div><div class="eyebrow">${tomorrow ? 'Lembrete — o teste é amanhã' : 'Confirmação do agendamento'}</div><h2 id="dlg2Title">Mensagem para ${esc(b.nome)}</h2></div></div>
    <div class="d-body"><textarea class="input" id="waText" rows="6">${esc(text)}</textarea><p class="hint">A mensagem é copiada e o WhatsApp abre no número ${fmtPhone(b.whatsapp)}. Você ainda pode editar o texto antes de enviar.</p></div>
    <div class="d-foot"><button class="btn" data-r="close">Fechar</button><button class="btn" data-r="copy">${icon('copy')} Copiar</button><a class="btn wa" data-r="open" href="https://wa.me/${num}" target="_blank" rel="noopener">${icon('whatsapp')} Copiar e abrir WhatsApp</a></div>`;
  d2.onclick = e => { const r = e.target.closest('[data-r]'); if (!r) return; const txt = $('#waText').value; if (r.dataset.r !== 'close') { navigator.clipboard?.writeText(txt).catch(() => { }); toast('Mensagem copiada.'); } if (r.dataset.r === 'open') r.href = `https://wa.me/${num}?text=${encodeURIComponent(txt)}`; if (r.dataset.r !== 'copy') d2.close(); };
  d2.oncancel = null; d2.showModal();
}
const fmtBot = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/__(.+?)__/g, '<u>$1</u>').replace(/_(.+?)_/g, '<i>$1</i>');
function openChat(id) {
  const b = BOOKINGS.find(x => x.id === id);
  openDialog(dHead('Histórico — Apollo AI Bot', esc(b.nome), fmtPhone(b.whatsapp)) + `<div class="d-body"><div class="banner note">${icon('info')}<span>O histórico de conversa deste agendamento ainda não está conectado ao banco. Consulte o canal original do chatbot.</span></div></div>
    <div class="d-foot"><button class="btn" data-act="booking-open" data-id="${id}">${icon('left')} Voltar ao agendamento</button></div>`, 'drawer');
}

/* ═══════════════ ATLETAS ═══════════════ */
function renderAthletes() {
  const pool = ATHLETES.filter(a => myTeamIds().includes(a.teamId));
  const act = pool.filter(a => a.active).length, minors = pool.filter(a => isMinorTeam(teamOf(a.teamId))).length;
  return `${viewBanner('athletes')}${coachScopeBanner()}
  <div class="page-head"><div><div class="eyebrow">Operação · cadastros</div><h1>Gestão de atletas</h1><p>Gerencie cadastros, planos e status dos atletas das equipes.</p></div>
    <div class="head-actions"><button class="btn primary" data-act="athlete-new" data-edit>${icon('plus')} Novo atleta</button></div></div>
  <div class="grid g4 mb">${[['Atletas cadastrados', pool.length, 'users'], ['Ativos', act, 'check'], ['Inativos', pool.length - act, 'x'], ['Menores de idade', minors, 'child']].map(([l, v, i]) => `<div class="kpi"><div class="kpi-label">${l}${icon(i)}</div><div class="kpi-value">${v}</div></div>`).join('')}</div>
  <section class="panel">
    <div class="toolbar">
      <div class="search">${icon('search')}<input class="input" id="atQ" type="search" placeholder="Buscar por nome, CPF ou telefone..." value="${esc(S.at.q)}" aria-label="Buscar atleta"></div>
      <select class="select" id="atStatus" aria-label="Filtrar status"><option value="">Todos os status</option><option value="ativo" ${S.at.status === 'ativo' ? 'selected' : ''}>Ativos</option><option value="inativo" ${S.at.status === 'inativo' ? 'selected' : ''}>Inativos</option></select>
      <select class="select" id="atTeam" aria-label="Filtrar equipe"><option value="">Todas as equipes</option>${NUCLEI.map(n => `<optgroup label="Núcleo ${esc(n.name)}">${TEAMS.filter(t => t.n === n.id && myTeamIds().includes(t.id)).map(t => `<option value="${t.id}" ${S.at.team === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</optgroup>`).join('')}</select>
    </div>
    <div id="atTable">${athletesTable()}</div>
  </section>`;
}
function athletesTable() {
  const q = S.at.q.toLowerCase().trim(), qd = digits(q);
  const mine = myTeamIds();
  const list = ATHLETES.filter(a => mine.includes(a.teamId) && (!q || a.name.toLowerCase().includes(q) || a.parentName.toLowerCase().includes(q) || (qd && (digits(a.cpf).includes(qd) || digits(a.phone).includes(qd) || digits(a.parentPhone).includes(qd))))
    && (!S.at.status || (S.at.status === 'ativo') === a.active) && (!S.at.team || a.teamId === S.at.team)).sort((a, b) => a.name.localeCompare(b.name));
  if (!list.length) return emptyState('Nenhum atleta encontrado', 'Tente outra busca ou filtro.');
  return `<div class="table-wrap"><table><thead><tr><th>Atleta / Responsável</th><th>Contato</th><th>Equipe / Plano</th><th>Status</th></tr></thead><tbody>${list.map(a => {
    const t = teamOf(a.teamId), minor = isMinorTeam(t) || !!a.parentName, tel = minor ? (a.parentPhone || a.phone) : a.phone;
    return `<tr class="rowlink" data-act="athlete-open" data-id="${a.id}" tabindex="0">
      <td><div class="person"><span class="avatar ${minor ? 'kid' : ''}">${minor ? icon('child') : initials(a.name)}</span><div><strong>${esc(a.name)}</strong>${minor ? `<small>Resp.: ${esc(a.parentName || '—')}</small>` : `<small>${esc(a.email)}</small>`}</div></div></td>
      <td><div class="cell-actions"><span style="white-space:nowrap">${fmtPhone(tel) || '—'}</span>${tel ? `<a class="btn sm wa" href="https://wa.me/55${digits(tel)}" target="_blank" rel="noopener" data-stop>${icon('whatsapp')} Contatar</a>` : ''}</div></td>
      <td><strong style="font-size:13px">${t ? esc(t.name) : 'Não definida'}</strong> ${t ? nTag(t.n, '') : ''}<div class="hint" style="max-width:300px;white-space:normal">${esc(maskPlan(a.plan) || 'Sem plano')}</div></td>
      <td>${a.active ? '<span class="tag st-agendado">Ativo</span>' : '<span class="tag st-cancelado">Inativo</span>'}</td></tr>`;
  }).join('')}</tbody></table></div><div class="panel-foot"><span>${list.length} de ${ATHLETES.filter(a => mine.includes(a.teamId)).length} atletas</span><span>Clique em um atleta para ver ou editar o cadastro.</span></div>`;
}
function athleteForm(id) {
  const a = id ? ATHLETES.find(x => x.id === id) : null, ro = !canEdit('athletes');
  openDialog(dHead(id ? 'Cadastro do atleta' : 'Novo atleta', id ? esc(a.name) : 'Cadastrar atleta', id ? `Atleta desde ${a.since.split('-').reverse().join('/')}` : 'Comece pela equipe: ela define plano e campos do responsável.') + `<form class="d-body" id="atForm" novalidate><fieldset class="plain" ${ro ? 'disabled' : ''}>
    ${ro ? `<div class="banner view">${icon('eye')}<span>Modo visualização — campos bloqueados para o seu perfil.</span></div>` : ''}
    <fieldset class="fieldset"><legend>Equipe e plano</legend>
      <div class="row2"><div class="field"><label for="faTeam">Equipe *</label><select class="select" id="faTeam" required><option value="">Selecione uma equipe...</option>${NUCLEI.map(n => `<optgroup label="Núcleo ${esc(n.name)}">${TEAMS.filter(t => t.n === n.id).map(t => `<option value="${t.id}" ${a && a.teamId === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</optgroup>`).join('')}</select></div>
      <div class="field"><label for="faStatus">Status</label><select class="select" id="faStatus"><option value="ativo">Ativo</option><option value="inativo" ${a && !a.active ? 'selected' : ''}>Inativo</option></select></div></div>
      <div class="field"><label for="faPlan">Plano / Mensalidade *</label><select class="select" id="faPlan"></select><span class="hint" id="faPlanHint"></span></div>
    </fieldset>
    <fieldset class="fieldset"><legend>Identificação</legend>
      <div class="field"><label for="faName">Nome completo do atleta *</label><input class="input" id="faName" required value="${esc(a ? a.name : '')}"></div>
      <div class="row2"><div class="field"><label for="faBirth">Data de nascimento</label><input class="input" type="date" id="faBirth" value="${a ? a.birth : ''}"></div><div class="field"><label for="faEmail">E-mail</label><input class="input" type="email" id="faEmail" value="${esc(a ? a.email : '')}"></div></div>
      <div class="row2"><div class="field"><label for="faCpf">CPF *</label><input class="input" id="faCpf" placeholder="000.000.000-00" value="${esc(a ? a.cpf : '')}"></div><div class="field"><label for="faRg">RG</label><input class="input" id="faRg" placeholder="00.000.000-0" value="${esc(a ? a.rg : '')}"></div></div>
    </fieldset>
    <fieldset class="fieldset"><legend>Contato</legend>
      <div class="field"><label for="faWpp" id="faWppLbl">WhatsApp (atleta) *</label><input class="input" id="faWpp" inputmode="tel" placeholder="(XX) XXXXX-XXXX" value="${esc(a ? fmtPhone(a.phone) : '')}"></div>
      <div id="faRespBox"><div class="hint" style="margin:-4px 0 10px">Equipe de base (menores de 18 anos): dados do responsável são obrigatórios.</div>
        <div class="row2"><div class="field"><label for="faResp">Nome do responsável *</label><input class="input" id="faResp" value="${esc(a ? a.parentName : '')}"></div><div class="field"><label for="faRespWpp">WhatsApp do responsável *</label><input class="input" id="faRespWpp" inputmode="tel" placeholder="(XX) XXXXX-XXXX" value="${esc(a ? fmtPhone(a.parentPhone) : '')}"></div></div></div>
    </fieldset>
    <fieldset class="fieldset"><legend>${seesFinance() ? 'Endereço e pagamento' : 'Endereço'}</legend>
      <div class="field"><label for="faAddr">Endereço</label><input class="input" id="faAddr" placeholder="Rua, número, bairro, CEP" value="${esc(a ? a.address : '')}"></div>
      <div class="field ${seesFinance() ? '' : 'hide'}"><label for="faBank">Banco de pagamento</label><input class="input" id="faBank" placeholder="Ex.: Nubank" value="${esc(a ? a.bank : '')}"></div>
    </fieldset>
    <div class="err" id="faErr" role="alert"></div>
  </fieldset></form>
  ${a && seesFinance() ? `<div class="d-body"><div class="field"><label for="faClientId">Código do cliente no Tecnofit</label><div class="cell-actions"><input class="input" id="faClientId" inputmode="numeric" pattern="[0-9]+" value="${esc(a.tecnofitClientId || '')}" placeholder="Código numérico do relatório"><button type="button" class="btn sm" id="faLinkBtn" ${canEdit('finance') ? '' : 'disabled'}>Vincular</button></div><span class="hint">Vincule pelo código do relatório antes de mostrar mensalidades na Área do atleta. Confira a identidade do atleta no Tecnofit.</span><div class="err" id="faLinkErr" role="alert"></div></div></div>` : ''}
  <div class="d-foot">${id && !ro ? `<button class="btn danger left" data-act="athlete-delete" data-id="${id}">${icon('trash')} Excluir</button>` : ''}<button class="btn" data-act="try-close">${ro ? 'Fechar' : 'Cancelar'}</button>${ro ? '' : `<button class="btn ok" data-act="athlete-save" data-id="${id || ''}">${icon('check')} Salvar</button>`}</div>`, 'drawer');
  const dlg = $('#dlg'); dlg.dataset.dirty = '0';
  const sync = () => {
    const t = teamOf($('#faTeam').value), minor = isMinorTeam(t), sel = $('#faPlan'), prev = sel.value || (a ? a.plan : '');
    const plans = t ? plansOfTeam(t.id) : [];
    sel.innerHTML = !t ? '<option value="">Selecione uma equipe primeiro...</option>' : !plans.length ? '<option value="">Nenhum plano cadastrado para esta equipe</option>' : '<option value="">Selecione...</option>' + plans.map(p => `<option value="${p.id}">${esc(planText(p))}</option>`).join('');
    const match = plans.find(p => planLabel(p) === prev || String(p.id) === String(prev));
    if (match) sel.value = match.id; else if (a && prev && t && t.id === a.teamId) { sel.insertAdjacentHTML('beforeend', `<option value="legacy" hidden>${esc(maskPlan(prev))}</option>`); sel.value = 'legacy'; }
    $('#faPlanHint').textContent = sel.value === 'legacy' ? 'Plano legado, fora do catálogo atual da equipe. Escolha um pacote vigente ao salvar alterações de plano.' : t ? `Pacotes do Núcleo ${nucleusOf(t.n).name} vinculados a ${t.name}.` : '';
    $('#faRespBox').classList.toggle('hide', !minor);
    $('#faWppLbl').textContent = minor ? 'WhatsApp (atleta) — opcional' : 'WhatsApp (atleta) *';
  };
  sync();
  $('#faTeam').addEventListener('change', sync);
  ['faWpp', 'faRespWpp'].forEach(i => $('#' + i).addEventListener('input', e => { e.target.value = maskPhone(e.target.value); }));
  $('#faCpf').addEventListener('input', e => { e.target.value = maskCpf(e.target.value); });
  $('#atForm').addEventListener('input', () => { dlg.dataset.dirty = '1'; });
  $('#atForm').addEventListener('change', () => { dlg.dataset.dirty = '1'; });
  if (a && seesFinance()) $('#faLinkBtn').addEventListener('click', async () => {
    const clientId = $('#faClientId').value.trim(), errorBox = $('#faLinkErr');
    if (!/^\d{1,30}$/.test(clientId)) { errorBox.textContent = 'Informe o código numérico do cliente no Tecnofit.'; return; }
    errorBox.textContent = ''; $('#faLinkBtn').disabled = true;
    try {
      const { error } = await financeDbClient().rpc('v2_link_tecnofit_client', {
        p_athlete: a.id, p_client_id: clientId
      });
      if (error) throw error;
      a.tecnofitClientId = clientId;
      toast('Código Tecnofit vinculado ao atleta.');
    } catch (error) { errorBox.textContent = `Não foi possível vincular: ${error.message}`; }
    finally { $('#faLinkBtn').disabled = !canEdit('finance'); }
  });
}
async function saveAthlete(id) {
  const t = teamOf($('#faTeam').value), minor = isMinorTeam(t), v = i => $('#' + i).value.trim();
  const planSel = $('#faPlan').value, plan = PLANS.find(p => String(p.id) === planSel);
  const err = m => { $('#faErr').textContent = m; return false; };
  if (!t) return err('Selecione a equipe.');
  if (!v('faName')) return err('Informe o nome completo do atleta.');
  if (digits(v('faCpf')).length !== 11) return err('Informe um CPF com 11 dígitos.');
  if (plansOfTeam(t.id).length && !planSel) return err('Selecione o plano / mensalidade.');
  if (!minor && digits(v('faWpp')).length < 10) return err('Informe o WhatsApp do atleta.');
  if (minor && (!v('faResp') || digits(v('faRespWpp')).length < 10)) return err('Equipe de menores: informe nome e WhatsApp do responsável.');
  const data = { name: v('faName'), birth: v('faBirth'), email: v('faEmail'), cpf: v('faCpf'), rg: v('faRg'), phone: digits(v('faWpp')), parentName: minor ? v('faResp') : '', parentPhone: minor ? digits(v('faRespWpp')) : '', teamId: t.id, address: v('faAddr'), bank: v('faBank'), active: $('#faStatus').value === 'ativo' };
  if (plan) Object.assign(data, { plan: planLabel(plan), planId: plan.id });
  const payload = { full_name: data.name, birth_date: data.birth || null,
    email: data.email || null, cpf: digits(data.cpf), rg: data.rg || null,
    phone: data.phone || null, parent_name: data.parentName || null,
    parent_phone: data.parentPhone || null, team_id: data.teamId,
    address: data.address || null,
    is_active: data.active };
  if (seesFinance()) {
    payload.payment_bank = data.bank || null;
    if (plan) payload.payment_plan = planLabel(plan);
  }
  try {
    await liveWrite('athletes', payload, id);
    $('#dlg').dataset.dirty = '0'; closeDialog(); await liveReload();
    toast(id ? 'Cadastro atualizado.' : 'Atleta cadastrado.'); return true;
  } catch (error) { return err(`Não foi possível salvar: ${error.message}`); }
}
