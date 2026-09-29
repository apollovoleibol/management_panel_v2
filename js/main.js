/* Navegação, permissões e eventos */
'use strict';

const RENDER = { overview: renderOverview, bookings: renderBookings, athletes: renderAthletes, teams: renderTeams, packages: renderPackages, feeder: renderFeeder, payments: renderPayments, finance: renderFinanceV3, settings: renderSettings };

function renderNav() {
  let html = '', group = '';
  PAGES.filter(p => canView(p.id)).forEach(p => {
    if (p.group !== group) { group = p.group; html += `<div class="nav-label">${group}</div>`; }
    const badge = p.id === 'bookings' ? BOOKINGS.filter(b => !b.archived && b.status === 'Agendado' && parseLocal(b.date) > NOW && parseLocal(b.date) - NOW <= 48 * 36e5).length : p.id === 'finance' ? (FIN_REPORTS.open ? new Set(finAlertRows().map(r => r.clientId)).size : 0) : 0;
    html += `<button data-page="${p.id}" class="${S.page === p.id ? 'active' : ''}" ${S.page === p.id ? 'aria-current="page"' : ''}>${icon(p.icon)}${p.label}${!canEdit(p.id) ? `<span class="lock" title="Somente visualização">${icon('eye')}</span>` : badge ? `<span class="count" title="${p.id === 'bookings' ? 'Testes nas próximas 48h' : 'Atletas inadimplentes'}">${badge}</span>` : ''}</button>`;
  });
  $('#nav').innerHTML = html;
  const u = me();
  $('#sideUser').innerHTML = `<span class="avatar">${initials(u.name)}</span><div style="min-width:0"><strong>${esc(u.name)}</strong><small>${esc(u.role)}</small></div>${u.id === 'u7' ? `<a class="lock" href="area-do-atleta.html?conta=juliana" title="Ir para a Área do atleta (responsável)" style="margin-left:auto;color:var(--nav-muted)">${icon('users')}</a>` : ''}<a href="login.html" title="Sair" aria-label="Sair" style="${u.id === 'u7' ? '' : 'margin-left:auto;'}color:var(--nav-muted);display:grid;place-items:center">${icon('logout')}</a>`;
  $('#crumb').textContent = PAGES.find(p => p.id === S.page).label;
}
function render() {
  if (!canView(S.page)) S.page = (PAGES.find(p => canView(p.id)) || PAGES[0]).id;
  renderNav();
  const imported = seesFinance() && finHasImports();
  $('.proto-tag').textContent = imported ? 'PROTÓTIPO · FINANCEIRO NO BANCO' : 'PROTÓTIPO · DADOS FICTÍCIOS';
  $('#content').innerHTML = RENDER[S.page]() + `<footer class="foot"><span>Apollo · Painel de Gestão v2 — protótipo navegável</span><span>${imported ? 'Relatórios financeiros persistidos no Supabase; demais módulos demonstrativos' : 'Dados demonstrativos em memória'} · lançamentos manuais desta versão ainda são temporários</span></footer>`;
  if (!canEdit(S.page)) $$('#content [data-edit]').forEach(b => { b.classList.add('locked'); b.setAttribute('aria-disabled', 'true'); b.title = 'Somente visualização para o seu perfil'; });
}
function go(page) { S.page = page; closeSidebar(); render(); window.scrollTo(0, 0); $('#content').focus({ preventScroll: true }); }
function closeSidebar() { $('#sidebar').classList.remove('open'); $('#menuBtn').setAttribute('aria-expanded', 'false'); }
function fillViewAs() { $('#viewAs').innerHTML = USERS.filter(u => u.active).map(u => `<option value="${u.id}" ${u.id === S.userId ? 'selected' : ''}>${esc(u.name)} · ${esc(u.role)}</option>`).join(''); }
async function guardClose() {
  const d = $('#dlg');
  if (d.dataset.dirty !== '1') return closeDialog();
  const r = await confirmBox({ title: 'Atenção', text: 'Há alterações não salvas. Deseja salvar antes de sair?', ok: 'Salvar', cancel: 'Continuar editando', third: 'Descartar' });
  if (r === 'third') { d.dataset.dirty = '0'; closeDialog(); }
  else if (r === true) { const save = d.querySelector('.d-foot [data-act$="-save"]'); if (save) save.click(); }
}
const pageOfAction = el => (el.closest('[data-need]') || {}).dataset?.need || S.page;

/* ─── Cliques ─── */
document.addEventListener('click', async e => {
  if (e.target.closest('[data-stop]')) { e.stopPropagation(); return; }
  const nav = e.target.closest('[data-page]');
  if (nav) return go(nav.dataset.page);
  const el = e.target.closest('[data-act]');
  if (!el || el.matches('input[type=checkbox][data-act="cal-tests"]')) return;
  const a = el.dataset.act, id = el.dataset.id;
  if (el.hasAttribute('data-edit') && !canEdit(pageOfAction(el))) { e.preventDefault(); e.stopPropagation(); return toast('Seu perfil tem acesso somente de visualização nesta página.', true); }
  if (el.dataset.need && !canEdit(el.dataset.need)) { e.preventDefault(); return toast('Seu perfil não pode editar ' + PAGES.find(p => p.id === el.dataset.need).label + '.', true); }
  if (el.tagName === 'INPUT' && el.type === 'checkbox' && !a.startsWith('fd-visible') && !a.startsWith('pay-approve')) return;
  switch (a) {
    case 'close-dialog': return closeDialog();
    case 'try-close': return guardClose();
    case 'export-overview': {
      const rows = [['Indicador', 'Valor'], ['Atletas ativos', ATHLETES.filter(x => x.active && myTeamIds().includes(x.teamId)).length], ['Agendamentos ativos', BOOKINGS.filter(b => !b.archived && myTeamIds().includes(b.teamId)).length]];
      if (seesFinance() && finHasImports()) { const r = finSummary(CUR_MONTH); rows.push(['Recebido bruto', FIN_REPORTS.receivables ? money(r.gross) : 'Sem arquivo'], ['Recebido líquido', FIN_REPORTS.receivables ? money(r.net) : 'Sem arquivo'], ['Mensalidades vencidas', FIN_REPORTS.open ? money(finAlertRows().reduce((s, d) => s + d.alertAmount, 0)) : 'Sem arquivo']); }
      else if (seesFinance()) rows.push(['Entradas no mês', money(monthTotals(CUR_MONTH).inn)], ['Receita prevista', money(expectedMonthly())], ['Inadimplência', money(DELINQ.reduce((s, d) => s + d.amount, 0))]);
      return download(`apollo-resumo-${CUR_MONTH}.csv`, csv(rows));
    }
    /* calendário */
    case 'cal-today': S.cal.cursor = TODAY; return render();
    case 'cal-nav': S.cal.cursor = addDays(S.cal.cursor, 7 * Number(el.dataset.dir)); return render();
    case 'cal-nucleus': { const n = el.dataset.n; S.cal.nuclei.has(n) ? S.cal.nuclei.delete(n) : S.cal.nuclei.add(n); return render(); }
    case 'cal-event': return openCalEvent(el.dataset.team, el.dataset.date);
    case 'goto-team': closeDialog(); S.page = 'teams'; render(); return teamEditor(id);
    /* agendamentos */
    case 'bk-kpi': S.bk.kpi = S.bk.kpi === el.dataset.k ? '' : el.dataset.k; if (S.bk.kpi) S.bk.status = ''; return render();
    case 'bk-arch': S.bk.archived = el.dataset.v === '1'; return render();
    case 'bk-sort': { const c = el.dataset.col; S.bk.sort = { col: c, dir: S.bk.sort.col === c && S.bk.sort.dir === 'asc' ? 'desc' : 'asc' }; return render(); }
    case 'bk-clear': Object.assign(S.bk, { q: '', status: '', team: '', kpi: '' }); return render();
    case 'booking-open': return openBooking(id);
    case 'booking-new': if (S.page !== 'bookings' && el.dataset.team) { S.page = 'bookings'; render(); } return bookingForm(null, { team: el.dataset.team, date: el.dataset.date });
    case 'booking-edit': return bookingForm(id);
    case 'booking-save': return saveBooking(id || null);
    case 'booking-chat': return openChat(id);
    case 'booking-wa': e.stopPropagation(); return waMessage(id);
    case 'booking-archive': {
      e.stopPropagation();
      if (!(await confirmBox({ title: 'Arquivar agendamento?', text: 'Ele deixará de aparecer na lista principal, mas continua acessível na visão de arquivados.', ok: 'Arquivar', danger: true }))) return;
      BOOKINGS.find(b => b.id === id).archived = true; closeDialog(); render(); return toast('Agendamento arquivado.');
    }
    case 'booking-unarchive': e.stopPropagation(); BOOKINGS.find(b => b.id === id).archived = false; closeDialog(); render(); return toast('Agendamento restaurado.');
    case 'booking-delete': if (await confirmBox({ title: 'Excluir agendamento?', text: 'Esta ação remove o agendamento definitivamente. Para apenas tirá-lo da lista, use Arquivar.', ok: 'Excluir', danger: true })) { BOOKINGS = BOOKINGS.filter(b => b.id !== id); $('#dlg').dataset.dirty = '0'; closeDialog(); render(); toast('Agendamento excluído.'); } return;
    /* atletas */
    case 'athlete-new': return athleteForm(null);
    case 'athlete-open': return athleteForm(id);
    case 'athlete-save': return saveAthlete(id || null);
    case 'athlete-delete': if (await confirmBox({ title: 'Excluir atleta?', text: 'O cadastro será removido. Prefira marcar como Inativo para preservar o histórico.', ok: 'Excluir', danger: true })) { ATHLETES = ATHLETES.filter(x => x.id !== id); $('#dlg').dataset.dirty = '0'; closeDialog(); render(); toast('Atleta excluído.'); } return;
    /* equipes e núcleos */
    case 'team-filter': S.tm.n = el.dataset.n; render(); if (el.closest('.ncard')) document.querySelector('.divider-band')?.scrollIntoView({ behavior: 'smooth' }); return;
    case 'team-open': return teamEditor(id);
    case 'team-new': return teamEditor(null);
    case 'te-tab': collectTE(); { const dirty = $('#dlg').dataset.dirty; TE.tab = el.dataset.tab; drawTeamEditor(); $('#dlg').dataset.dirty = dirty; } return;
    case 'te-day': { const d = Number(el.dataset.day); TE.schedule = TE.schedule.some(s => s.day === d) ? TE.schedule.filter(s => s.day !== d) : [...TE.schedule, { day: d, start: TE.schedule[0]?.start || '18:00', end: TE.schedule[0]?.end || '19:30' }]; drawTeamEditor(); $('#dlg').dataset.dirty = '1'; return; }
    case 'team-save': return saveTeam();
    case 'team-toggle-active': collectTE(); TE.active = !TE.active; if (!TE.active) TE.available = false; drawTeamEditor(); $('#dlg').dataset.dirty = '1'; return toast(TE.active ? 'Equipe será reativada ao salvar.' : 'Equipe será desativada ao salvar: sai da agenda e do assistente.');
    case 'team-delete': {
      const n = ATHLETES.filter(x => x.teamId === TE.id).length, b = BOOKINGS.filter(x => x.teamId === TE.id).length;
      if (!(await confirmBox({ title: `Excluir ${TE.name}?`, text: `${n ? `<b>${n} atletas e ${b} agendamentos</b> estão vinculados a esta equipe e ficarão sem equipe. ` : ''}Horários e datas indisponíveis também serão removidos. Essa ação não pode ser desfeita — considere desativar.`, ok: 'Excluir equipe', danger: true }))) return;
      TEAMS = TEAMS.filter(t => t.id !== TE.id); PLANS.forEach(p => { p.teams = p.teams.filter(t => t !== TE.id); }); $('#dlg').dataset.dirty = '0'; closeDialog(); render(); return toast('Equipe excluída.');
    }
    case 'goto-packages': $('#dlg').dataset.dirty = '0'; closeDialog(); S.pk.n = TE.n; return go('packages');
    case 'nucleus-new': return nucleusForm(null);
    case 'nucleus-edit': return nucleusForm(id);
    case 'nucleus-save': return saveNucleus(id || null);
    case 'nucleus-delete': {
      if (TEAMS.some(t => t.n === id)) return toast('Este núcleo tem equipes. Mova ou exclua as equipes antes.', true);
      if (await confirmBox({ title: 'Excluir núcleo?', text: 'O local será removido do painel e do assistente.', ok: 'Excluir', danger: true })) { NUCLEI.splice(NUCLEI.findIndex(n => n.id === id), 1); closeDialog(); render(); toast('Núcleo excluído.'); }
      return;
    }
    /* pacotes */
    case 'pkg-n': S.pk.n = el.dataset.n; return render();
    case 'pkg-open': return packageDrawer(Number(id));
    case 'pkg-links': return savePackageLinks(Number(id));
    case 'pkg-new': return packageNew();
    case 'pkg-create': return packageCreate();
    case 'pkg-reprice': return packageReprice(Number(id));
    case 'pkg-review': return packageReview(Number(id));
    case 'pkg-commit': return packageCommit(Number(id), Number(el.dataset.v));
    /* chatbot feeder */
    case 'fd-tab': S.fd.tab = el.dataset.tab; return render();
    case 'fd-expand': { const all = feederTeams().map(t => t.id); S.fd.open = S.fd.open.size >= all.length ? new Set() : new Set(all); return render(); }
    case 'fd-visible': { const t = teamOf(id); t.available = el.checked; FEEDER.history.unshift({ at: ymd(TODAY), who: me().name, what: `${t.name} ${t.available ? 'voltou a aparecer' : 'ocultada'} no assistente` }); render(); return toast(t.available ? `${t.name} passa a ser oferecida pelo assistente.` : `${t.name} não será mais oferecida pelo assistente.`); }
    case 'fd-goto-team': if (!canView('teams')) return toast('Seu perfil não acessa Equipes e núcleos.', true); S.page = 'teams'; render(); return teamEditor(id, el.dataset.tab);
    case 'fd-desc': return feederDescEdit(id);
    case 'fd-desc-save': { const t = teamOf(id); t.desc = $('#fdDescTxt').value.trim(); FEEDER.history.unshift({ at: ymd(TODAY), who: me().name, what: `Descrição da equipe ${t.name} atualizada` }); closeDialog(); render(); return toast('Descrição salva. Entra no quadro na próxima atualização.'); }
    case 'fd-sync': FEEDER.lastSync = new Date(NOW.getTime() - 30000); render(); return toast('Quadro do assistente atualizado agora.');
    case 'fd-copy': navigator.clipboard?.writeText(quadroText()).catch(() => { }); return toast('Texto do quadro copiado.');
    case 'fd-rule-add': return feederRuleEdit(el.dataset.g, null);
    case 'fd-rule-edit': return feederRuleEdit(el.dataset.g, Number(el.dataset.i));
    case 'fd-rule-del': if (await confirmBox({ title: 'Remover regra?', text: esc(FEEDER.rules[el.dataset.g][Number(el.dataset.i)]), ok: 'Remover', danger: true })) { FEEDER.rules[el.dataset.g].splice(Number(el.dataset.i), 1); FEEDER.history.unshift({ at: ymd(TODAY), who: me().name, what: 'Instrução do assistente removida' }); render(); } return;
    case 'fd-rule-save': { const txt = $('#fdRuleTxt').value.trim(); if (!txt) return; const g = el.dataset.g, i = el.dataset.i; if (i === '') FEEDER.rules[g].push(txt); else FEEDER.rules[g][Number(i)] = txt; FEEDER.history.unshift({ at: ymd(TODAY), who: me().name, what: 'Instruções do assistente alteradas' }); closeDialog(); render(); return toast('Instrução salva.'); }
    /* pagamentos */
    case 'pay-open': return payDrawer(id);
    case 'pay-add': return payAddForm();
    case 'pay-add-save': return payAddSave();
    case 'pay-approve': { const it = COACH_ITEMS.find(i => i.id === id); it.status = 'aprovado'; const cid = it.coach; render(); return payDrawer(cid); }
    case 'pay-approve-all': COACH_ITEMS.filter(i => i.coach === id && inMonth(i.date, S.pay.month) && i.status === 'pendente').forEach(i => { i.status = 'aprovado'; }); render(); return payDrawer(id);
    case 'pay-rates': { const c = coachOf(id), r = centsInput($('#pdRate').value), d = centsInput($('#pdDaily').value); if (!(r > 0 && d > 0)) return toast('Valores inválidos.', true); c.rate = r; c.daily = d; render(); payDrawer(id); return toast('Valores do técnico atualizados.'); }
    case 'pay-mark': {
      const c = coachOf(id), s = coachSummary(id, S.pay.month);
      if (!(await confirmBox({ title: 'Registrar pagamento?', text: `${esc(c.name)} · ${monthLabel(S.pay.month)}<br><b>${money(s.total)}</b> via PIX (${esc(c.pix)}). Uma saída “Folha técnica” será lançada no Financeiro.`, ok: 'Registrar pagamento' }))) return;
      PAYOUTS[`${id}|${S.pay.month}`] = { paidAt: ymd(TODAY) };
      LEDGER.push({ id: uid('l'), date: ymd(TODAY), desc: `Pagamento ${c.name} — ${monthLabel(S.pay.month)}`, cat: 'Folha técnica', type: 'out', amount: s.total, source: 'Manual', n: null });
      FIN_MANUAL.push({ date: ymd(TODAY), desc: `Pagamento ${c.name} — ${monthLabel(S.pay.month)}`, cat: 'Folha técnica', type: 'out', amount: s.total });
      closeDialog(); render(); return toast('Pagamento registrado e lançado no Financeiro.');
    }
    case 'pay-export': { const key = S.pay.month; return download(`pagamentos-tecnicos-${key}.csv`, csv([['Técnico', 'Data', 'Tipo', 'Descrição', 'Horas', 'Valor (R$)', 'Status'], ...COACH_ITEMS.filter(i => inMonth(i.date, key)).sort((a, b) => a.coach.localeCompare(b.coach) || a.date.localeCompare(b.date)).map(i => [coachOf(i.coach).name, i.date.split('-').reverse().join('/'), i.type, i.desc, i.hours || '', (itemValue(i) / 100).toFixed(2).replace('.', ','), i.status])])); }
    /* financeiro */
    case 'fin-tab': S.fin.tab = el.dataset.tab; return render();
    case 'fin-type': S.fin.type = el.dataset.v; return render();
    case 'fin-new': return finNewForm();
    case 'fin-new-save': return finNewSave();
    case 'fin-import': return financeImportWizard(el.dataset.report);
    case 'finance-import-commit': return financeImportCommit();
    case 'fin-db-signin': return financeDbSignIn();
    case 'fin-db-signout': return financeDbSignOut();
    case 'fin-db-refresh': return financeDbRefresh().catch(e => toast(e.message, true));
    case 'finance-manual-new': return financeManualForm();
    case 'finance-manual-save': return financeManualSave();
    case 'im-sample': return importReview(sampleCsv(), `tecnofit_recebimentos_${MON[TODAY.getMonth()].toLowerCase()}.csv`);
    case 'im-commit': return importCommit();
    case 'fin-goto': S.fin.tab = el.dataset.tab; closeDialog(); return render();
    case 'fin-charge': return chargeMessage(el.dataset.k);
    case 'fin-settle': {
      const items = DELINQ.filter(d => (d.athleteId || d.name) === el.dataset.k), a = ATHLETES.find(x => x.id === items[0].athleteId), total = items.reduce((s, i) => s + i.amount, 0);
      if (!(await confirmBox({ title: 'Registrar pagamento?', text: `${esc(a ? a.name : items[0].name)} · ${items.map(i => i.ref).join(', ')} · <b>${money(total)}</b>. Será lançada uma entrada manual. Dê baixa também no Tecnofit para evitar divergência na próxima importação.`, ok: 'Marcar como pago' }))) return;
      DELINQ = DELINQ.filter(d => !items.includes(d));
      LEDGER.push({ id: uid('l'), date: ymd(TODAY), desc: `Mensalidade em atraso — ${a ? a.name : items[0].name}`, cat: 'Mensalidades', type: 'in', amount: total, source: 'Manual', n: a ? teamOf(a.teamId)?.n : null });
      render(); return toast('Pagamento registrado.');
    }
    /* configurações */
    case 'st-tab': S.st.tab = el.dataset.tab; return render();
    case 'user-open': return userDrawer(id);
    case 'user-new': return userDrawer(null);
    case 'user-save': return saveUser();
    case 'user-viewas': S.userId = id; closeDialog(); fillViewAs(); render(); return toast(`Agora você vê o painel como ${USERS.find(u => u.id === id).name}.`);
  }
});

/* Lembra quais equipes do Feeder estão abertas */
document.addEventListener('toggle', e => { const d = e.target; if (d.matches && d.matches('details.fd-team')) d.open ? S.fd.open.add(d.dataset.team) : S.fd.open.delete(d.dataset.team); }, true);

/* Linhas de tabela acessíveis por teclado */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeSidebar();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr[data-act]')) { e.preventDefault(); e.target.click(); }
});

/* ─── Filtros e campos ─── */
const debounce = (fn, ms = 160) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const liveTable = debounce((id, html) => { const el = $('#' + id); if (el) el.innerHTML = html(); if (!canEdit(S.page)) $$('#' + id + ' [data-edit]').forEach(b => b.classList.add('locked')); });
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'bkQ') { S.bk.q = t.value; liveTable('bkTable', bookingsTable); }
  if (t.id === 'atQ') { S.at.q = t.value; liveTable('atTable', athletesTable); }
  if (t.id === 'pkQ') { S.pk.q = t.value; liveTable('pkTable', packagesTable); }
  if (t.id === 'tmQ') { S.tm.q = t.value; debounce(() => { render(); const i = $('#tmQ'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250)(); }
  if (t.id === 'finQ') { S.fin.q = t.value; clearTimeout(window._fq); window._fq = setTimeout(() => { render(); const i = $('#finQ'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300); }
  if (t.id === 'simAge') { S.fd.simAge = t.value; clearTimeout(window._sq); window._sq = setTimeout(() => { render(); const i = $('#simAge'); i.focus(); }, 350); }
});
document.addEventListener('change', e => {
  const t = e.target;
  const map = { bkStatus: () => { S.bk.status = t.value; S.bk.kpi = ''; }, bkTeam: () => { S.bk.team = t.value; }, atStatus: () => { S.at.status = t.value; }, atTeam: () => { S.at.team = t.value; }, pkFreq: () => { S.pk.freq = t.value; }, payMonth: () => { S.pay.month = t.value; }, finMonth: () => { S.fin.month = t.value; }, simGender: () => { S.fd.simGender = t.value; } };
  if (map[t.id]) { map[t.id](); return render(); }
  if (t.dataset.act === 'cal-tests') { S.cal.showTests = t.checked; return render(); }
  const fd = { fdDates: () => { FEEDER.datesCount = Number(t.value); }, fdAhead: () => { FEEDER.minHoursAhead = Number(t.value); }, fdCache: () => { FEEDER.cacheMin = Number(t.value); }, fdAge: () => { FEEDER.includeAge = t.checked; }, fdGender: () => { FEEDER.includeGender = t.checked; }, fdPhone: () => { FEEDER.includeCoachPhone = t.checked; } };
  if (fd[t.id]) { fd[t.id](); FEEDER.history.unshift({ at: ymd(TODAY), who: me().name, what: 'Parâmetros do quadro alterados' }); render(); toast('Parâmetro do assistente atualizado.'); }
});

/* ─── Topo ─── */
$('#viewAs').addEventListener('change', e => { S.userId = e.target.value; render(); toast(`Visualizando como ${me().name} (${me().role}).`); });
$('#menuBtn').addEventListener('click', () => { const o = $('#sidebar').classList.toggle('open'); $('#menuBtn').setAttribute('aria-expanded', String(o)); });
$('#themeBtn').addEventListener('click', () => { S.theme = S.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = S.theme; try { localStorage.setItem('apollo-v2-theme', S.theme); } catch { } });
try { const th = localStorage.getItem('apollo-v2-theme'); if (th) { S.theme = th; document.documentElement.dataset.theme = th; } } catch { }

/* Âncora na URL (#bookings, #finance...) abre a página diretamente */
const fromHash = () => { const h = location.hash.slice(1); if (PAGES.some(p => p.id === h)) { S.page = h; render(); } };
window.addEventListener('hashchange', fromHash);
const _go = go; go = page => { _go(page); history.replaceState(null, '', '#' + page); };

/* ?como=u5 abre o painel já no perfil desse usuário (útil para demonstrações) */
const asUser = new URLSearchParams(location.search).get('como');
if (asUser && USERS.some(u => u.id === asUser && u.active)) S.userId = asUser;

fillViewAs();
render();
fromHash();
financeDbInit();
