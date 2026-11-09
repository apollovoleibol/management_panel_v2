/* Visão geral: o que fazer agora (por urgência), o dia de hoje e indicadores em abas */
'use strict';
if (!S.ov.tab) S.ov.tab = 'agenda';

const OV_TONE = { bad: 0, warn: 1, '': 2 };
const ovDaysSince = iso => iso ? Math.max(0, Math.floor((Date.now() - new Date(iso.length <= 16 ? iso + (iso.length === 10 ? 'T12:00' : '') : iso).getTime()) / 864e5)) : null;
// Dias desde a última importação do Tecnofit (null quando nunca houve)
function finImportAgeDays() {
  const stamps = Object.values(FIN_REPORTS).filter(Boolean).map(r => r.at).filter(Boolean).map(s => new Date(s).getTime());
  return stamps.length ? Math.floor((Date.now() - Math.max(...stamps)) / 864e5) : null;
}

// Todas as tarefas do dia num lugar só; cada uma leva direto à lista ou à página certa
function ovTasks() {
  const tasks = [], mine = myTeamIds();
  const add = t => { if (t.n) tasks.push(t); };
  if (showsLeadCards()) {
    [['stale', 'Registrar resultado de testes', 'Compareceu, faltou, aprovado ou reprovado', b => b.date, 'Registrar', d => d >= 3 ? 'bad' : 'warn'],
     ['guardian', 'Completar dados do responsável', 'Menores agendados sem o WhatsApp do responsável legal', b => b.createdAt || b.date, 'Completar', () => 'warn'],
     ['approved', 'Aprovados sem cadastro', 'Enviar o link do cadastro e acompanhar', b => b.approvedAt || b.date, 'Ver lista', d => d >= 14 ? 'warn' : ''],
     ['registered', 'Inserir no Tecnofit', 'Cadastro concluído, falta a inserção manual', b => b.approvedAt || b.date, 'Ver lista', d => d >= 7 ? 'warn' : '']]
      .forEach(([k, title, hint, since, btn, tone]) => {
        const list = BOOKINGS.filter(b => mine.includes(b.teamId) && BOOKING_FILTERS[k][1](b));
        const oldest = list.reduce((m, b) => Math.max(m, ovDaysSince(since(b)) ?? 0), 0);
        add({ n: list.length, title, hint: `${hint}${oldest ? ` · o mais antigo há ${oldest} dia${oldest === 1 ? '' : 's'}` : ''}`, tone: tone(oldest), btn, attrs: `data-act="pending-go" data-k="${k}"` });
      });
  }
  if (dropoutVisible(me()?.role, canView('overview'))) {
    const rows = calculateDropoutRisk(ATHLETES, SESSIONS, new Date(), mine), risk = rows.filter(a => a.streak <= 5).length;
    add({ n: rows.length, title: 'Atletas em risco de evasão', hint: `${risk} com 2 a 5 faltas seguidas${rows.length - risk ? ` · ${rows.length - risk} para conferir (6 ou mais)` : ''}`, tone: risk ? 'bad' : 'warn', btn: S.ov.riskOpen ? 'Fechar lista' : 'Ver atletas', attrs: 'data-act="ov-risk"' });
  }
  if (canView('payments') && typeof payCoach === 'function') {
    const prev = new Date(TODAY.getFullYear(), TODAY.getMonth() - 1, 1), open = COACHES.map(c => payCoach(c.id, monthKey(prev))).filter(r => r.state === 'review' || r.state === 'ready');
    const toReview = open.reduce((n, r) => n + r.pending.length, 0);
    add({ n: open.length, title: `Fechar a folha de ${MONTHS[prev.getMonth()]}`, hint: `${toReview ? `${toReview} lançamento${toReview === 1 ? '' : 's'} para revisar · ` : ''}${money(open.reduce((n, r) => n + r.total, 0))} a pagar`, tone: TODAY.getDate() > 10 ? 'bad' : 'warn', btn: 'Abrir folha', attrs: 'data-page="payments"' });
  }
  if (seesFinance()) {
    const age = finImportAgeDays();
    if (age === null || age > 10) add({ n: icon('upload'), title: 'Importar relatórios do Tecnofit', hint: age === null ? 'Nenhum relatório importado ainda' : `Última importação há ${age} dias: o Financeiro está desatualizado`, tone: age === null || age > 35 ? 'bad' : 'warn', btn: 'Importar', attrs: 'data-act="ov-finance" data-tab="imports"' });
  }
  pendingItems().forEach(i => add({ n: i.n, title: i.label[0].toUpperCase() + i.label.slice(1), hint: i.hint, tone: '', btn: 'Ver lista', attrs: `data-act="pending-go" data-k="${i.k}"` }));
  return tasks.map((t, i) => ({ ...t, i })).sort((a, b) => OV_TONE[a.tone] - OV_TONE[b.tone] || a.i - b.i);
}
function ovTasksHTML(tasks) {
  const row = t => `<button class="ov-task ${t.tone ? 'tone-' + t.tone : ''}" ${t.attrs}><span class="ov-task-n">${t.n}</span><span class="ov-task-body"><b>${t.title}</b><small>${t.hint}</small></span><span class="ov-task-go">${t.btn} ${icon('arrow')}</span></button>`;
  const top = tasks.slice(0, 6), rest = tasks.slice(6);
  return `<div class="panel-head"><div><h2>O que fazer agora</h2><div class="sub">${tasks.length ? 'Por urgência: o mais atrasado primeiro' : 'Nenhuma pendência'}</div></div></div>
    ${tasks.length ? `<div class="ov-task-list">${top.map(row).join('')}</div>${rest.length ? `<details class="ov-more"><summary>${icon('right')} ${rest.length} tarefa${rest.length === 1 ? '' : 's'} de menor prioridade</summary><div class="ov-task-list">${rest.map(row).join('')}</div></details>` : ''}`
      : `<div class="ov-done">${icon('check')}<div><b>Tudo em dia</b><small>Quando aparecer algo para resolver, ele vem para cá.</small></div></div>`}`;
}

// Coluna do lado: treinos de hoje, próximos testes e competições
function ovTodayHTML() {
  const mine = myTeamIds(), evs = calWeekEvents(TODAY), key = ymd(TODAY);
  const tests = canView('bookings') ? BOOKINGS.filter(b => mine.includes(b.teamId) && !b.archived && b.status !== 'Cancelado' && parseLocal(b.date) >= NOW && parseLocal(b.date) <= addDays(NOW, 7)).sort((a, b) => a.date.localeCompare(b.date)) : [];
  const comps = COMPETITIONS.filter(k => mine.includes(k.teamId) && k.date >= key && k.date <= ymd(addDays(TODAY, 30)) && k.status !== 'completed').sort((a, b) => `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`)).slice(0, 3);
  const when = s => { const d = parseLocal(s), dd = Math.round((startOfDay(d) - TODAY) / 864e5); return `${dd === 0 ? 'hoje' : dd === 1 ? 'amanhã' : DOW[d.getDay()].toLowerCase() + ' ' + fmtShort(d)} ${s.slice(11, 16)}`; };
  const training = e => { const c = coachOf(e.t.coach); return `<button class="ov-ev ${e.cancelled ? 'off' : ''} ${NCLASS(e.t.n)}" data-act="cal-event" data-team="${e.t.id}" data-date="${key}"><b>${e.s.start}</b><span>${esc(e.t.name)}<small>${c ? esc(c.name.split(' ')[0]) : 'sem técnico'}${e.cancelled ? ' · cancelado' : ''}</small></span>${e.tests.length ? `<span class="tag st-info nodot">${e.tests.length} teste${e.tests.length > 1 ? 's' : ''}</span>` : ''}</button>`; };
  return `<section class="panel ov-today"><div class="panel-head"><div><h2>Hoje</h2><div class="sub">${DOW_FULL[TODAY.getDay()]}, ${fmtShort(TODAY)} · ${payPlural(evs.filter(e => !e.cancelled).length, 'treino', 'treinos')}</div></div><button class="btn sm ghost" data-act="ov-tab" data-v="agenda" data-scroll>Semana ${icon('arrow')}</button></div>
      <div class="ov-ev-list">${evs.map(training).join('') || '<p class="muted small" style="margin:0">Sem treinos hoje.</p>'}</div></section>
    ${canView('bookings') ? `<section class="panel ov-today"><div class="panel-head"><div><h2>Próximos testes</h2><div class="sub">${tests.length ? `${tests.length} nos próximos 7 dias` : 'Nenhum nos próximos 7 dias'}</div></div><button class="btn sm ghost" data-page="bookings">Agendamentos ${icon('arrow')}</button></div>
      ${tests.length ? `<div class="ov-ev-list">${tests.slice(0, 5).map(b => `<button class="ov-ev" data-act="booking-open" data-id="${b.id}"><b>${when(b.date)}</b><span>${esc(bookingName(b))}<small>${esc(teamOf(b.teamId)?.name || '')}</small></span>${b.status === 'Pendente' ? stTag(b.status) : ''}</button>`).join('')}</div>` : ''}</section>` : ''}
    ${comps.length ? `<section class="panel ov-today"><div class="panel-head"><div><h2>Competições</h2><div class="sub">Próximos 30 dias</div></div></div><div class="ov-ev-list">${comps.map(k => { const d = parseYmd(k.date); return `<button class="ov-ev" data-act="comp-open" data-id="${esc(k.id)}"><b>${DOW[d.getDay()].toLowerCase()} ${fmtShort(d)}</b><span>${esc(k.name)}${k.opponent ? ` x ${esc(k.opponent)}` : ''}<small>${esc(teamOf(k.teamId)?.name || '')}${k.time ? ' · ' + k.time : ''}</small></span></button>`; }).join('')}</div></section>` : ''}`;
}

function ovGreeting(tasks) {
  const h = new Date().getHours(), first = String(me()?.name || '').replace(/^Prévia · /, '').split(' ')[0];
  const tests48 = canView('bookings') ? BOOKINGS.filter(b => myTeamIds().includes(b.teamId) && !b.archived && b.status !== 'Cancelado' && parseLocal(b.date) >= NOW && parseLocal(b.date) - NOW <= 48 * 36e5).length : 0;
  return `${h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'}${first ? ', ' + esc(first) : ''}. ${tasks.length ? payPlural(tasks.length, 'tarefa pede', 'tarefas pedem') + ' atenção' : 'Tudo em dia'}${tests48 ? ` · ${payPlural(tests48, 'teste', 'testes')} nas próximas 48 h` : ''}.`;
}
