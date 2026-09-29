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
  $('#sideUser').innerHTML = `<span class="avatar">${initials(u.name)}</span><div style="min-width:0"><strong>${esc(u.name)}</strong><small>${esc(u.role)}</small></div>${apolloHasAthleteAccess() ? `<a class="lock" href="area-do-atleta.html" title="Ir para a Área do atleta" style="margin-left:auto;color:var(--nav-muted)">${icon('users')}</a>` : ''}<button class="icon-btn" data-act="logout" title="Sair" aria-label="Sair" style="margin-left:auto;color:var(--nav-muted)">${icon('logout')}</button>`;
  $('#crumb').textContent = PAGES.find(p => p.id === S.page).label;
}
function render() {
  if (!canView(S.page)) S.page = (PAGES.find(p => canView(p.id)) || PAGES[0]).id;
  renderNav();
  $('#content').innerHTML = RENDER[S.page]() + `<footer class="foot"><span>Apollo · Painel de Gestão v2</span><span>Dados sincronizados com o Supabase</span></footer>`;
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
    case 'logout': return apolloSignOut();
    case 'close-dialog': return closeDialog();
    case 'try-close': return guardClose();
    case 'export-overview': {
      const rows = [['Indicador', 'Valor'], ['Atletas ativos', ATHLETES.filter(x => x.active && myTeamIds().includes(x.teamId)).length], ['Agendamentos ativos', BOOKINGS.filter(b => !b.archived && myTeamIds().includes(b.teamId)).length]];
      if (seesFinance() && finHasImports()) { const r = finSummary(CUR_MONTH); rows.push(['Recebido bruto', FIN_REPORTS.receivables ? money(r.gross) : 'Sem arquivo'], ['Recebido líquido', FIN_REPORTS.receivables ? money(r.net) : 'Sem arquivo'], ['Mensalidades vencidas', FIN_REPORTS.open ? money(finAlertRows().reduce((s, d) => s + d.alertAmount, 0)) : 'Sem arquivo']); }
      else if (seesFinance()) rows.push(['Dados financeiros', 'Aguardando importação do Tecnofit']);
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
      try { await liveWrite('tryouts', { archived_at: new Date().toISOString() }, id); closeDialog(); await liveReload(); toast('Agendamento arquivado.'); }
      catch (error) { toast(error.message, true); } return;
    }
    case 'booking-unarchive': e.stopPropagation(); try { await liveWrite('tryouts', { archived_at: null }, id); closeDialog(); await liveReload(); toast('Agendamento restaurado.'); } catch (error) { toast(error.message, true); } return;
    case 'booking-delete': if (await confirmBox({ title: 'Excluir agendamento?', text: 'Esta ação remove o agendamento definitivamente. Para apenas tirá-lo da lista, use Arquivar.', ok: 'Excluir', danger: true })) { try { await liveDelete('tryouts', id); $('#dlg').dataset.dirty = '0'; closeDialog(); await liveReload(); toast('Agendamento excluído.'); } catch (error) { toast(error.message, true); } } return;
    /* atletas */
    case 'athlete-new': return athleteForm(null);
    case 'athlete-open': return athleteForm(id);
    case 'athlete-save': return saveAthlete(id || null);
    case 'athlete-delete': if (await confirmBox({ title: 'Excluir atleta?', text: 'O cadastro será removido. Prefira marcar como Inativo para preservar o histórico.', ok: 'Excluir', danger: true })) { try { await liveDelete('athletes', id); $('#dlg').dataset.dirty = '0'; closeDialog(); await liveReload(); toast('Atleta excluído.'); } catch (error) { toast(error.message, true); } } return;
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
      if (n || b) return toast(`Esta equipe tem ${n} atleta(s) e ${b} agendamento(s). Desative-a para preservar os dados.`, true);
      if (!(await confirmBox({ title: `Excluir ${TE.name}?`, text: 'A equipe vazia, seus horários e datas indisponíveis serão removidos.', ok: 'Excluir equipe', danger: true }))) return;
      try { await liveDelete('teams', TE.id); $('#dlg').dataset.dirty = '0'; closeDialog(); await liveReload(); toast('Equipe excluída.'); }
      catch (error) { toast(error.message, true); } return;
    }
    case 'goto-packages': $('#dlg').dataset.dirty = '0'; closeDialog(); S.pk.n = TE.n; return go('packages');
    case 'nucleus-new': return nucleusForm(null);
    case 'nucleus-edit': return nucleusForm(id);
    case 'nucleus-save': return saveNucleus(id || null);
    case 'nucleus-delete': {
      if (TEAMS.some(t => t.n === id)) return toast('Este núcleo tem equipes. Mova ou exclua as equipes antes.', true);
      if (await confirmBox({ title: 'Excluir núcleo?', text: 'O local será removido do painel e do assistente.', ok: 'Excluir', danger: true })) { try { await liveDelete('training_locations', id); closeDialog(); await liveReload(); toast('Núcleo excluído.'); } catch (error) { toast(error.message, true); } }
      return;
    }
    /* pacotes */
    case 'pkg-n': S.pk.n = el.dataset.n; return render();
    case 'pkg-open': return packageDrawer(Number(id));
    case 'pkg-links': return toast('Alterações de pacotes aguardam a operação transacional no Supabase.', true);
    case 'pkg-new': return packageNew();
    case 'pkg-create': return toast('Criação de pacotes ainda não está conectada ao Supabase.', true);
    case 'pkg-reprice': return packageReprice(Number(id));
    case 'pkg-review': return packageReview(Number(id));
    case 'pkg-commit': return toast('O reajuste ainda não está conectado ao Supabase. Nenhum valor foi alterado.', true);
    /* chatbot feeder */
    case 'fd-tab': S.fd.tab = el.dataset.tab; return render();
    case 'fd-expand': { const all = feederTeams().map(t => t.id); S.fd.open = S.fd.open.size >= all.length ? new Set() : new Set(all); return render(); }
    case 'fd-visible': {
      if (!canEdit('feeder')) return;
      try {
        await liveWrite('teams', { available_for_booking: el.checked }, id);
        await liveReload(); toast('Disponibilidade da equipe atualizada no banco.');
      } catch (error) { el.checked = !el.checked; toast(error.message, true); }
      return;
    }
    case 'fd-goto-team': if (!canView('teams')) return toast('Seu perfil não acessa Equipes e núcleos.', true); S.page = 'teams'; render(); return teamEditor(id, el.dataset.tab);
    case 'fd-desc': return feederDescEdit(id);
    case 'fd-desc-save': {
      if (!canEdit('feeder')) return;
      try { await liveWrite('teams', { description: $('#fdDescTxt').value.trim() }, id); closeDialog(); await liveReload(); toast('Descrição salva no banco.'); }
      catch (error) { toast(error.message, true); }
      return;
    }
    case 'fd-sync': return toast('Este quadro é uma prévia local. A sincronização com o Apps Script ainda não foi configurada.', true);
    case 'fd-copy': navigator.clipboard?.writeText(quadroText()).catch(() => { }); return toast('Texto do quadro copiado.');
    case 'fd-rule-add': return feederRuleEdit(el.dataset.g, null);
    case 'fd-rule-edit': return feederRuleEdit(el.dataset.g, Number(el.dataset.i));
    case 'fd-rule-del': return toast('As regras ainda estão no Apps Script; altere-as na integração antes de habilitar esta ação.', true);
    case 'fd-rule-save': return toast('As regras ainda estão no Apps Script; altere-as na integração antes de habilitar esta ação.', true);
    /* pagamentos */
    case 'pay-open': return payDrawer(id);
    case 'pay-add': return payAddForm();
    case 'pay-add-save': return payAddSave();
    case 'pay-approve': {
      const it = COACH_ITEMS.find(i => i.id === id);
      if (!it || !canEdit('payments')) return;
      const { error } = await financeDbClient().from('v2_coach_items').update({ status: 'approved' }).eq('id', id);
      if (error) return toast(error.message, true);
      await liveReload(); return payDrawer(it.coach);
    }
    case 'pay-approve-all': {
      if (!canEdit('payments')) return;
      const ids = COACH_ITEMS.filter(i => i.coach === id && inMonth(i.date, S.pay.month) && i.status === 'pendente').map(i => i.id);
      if (ids.length) {
        const { error } = await financeDbClient().from('v2_coach_items').update({ status: 'approved' }).in('id', ids);
        if (error) return toast(error.message, true);
      }
      await liveReload(); return payDrawer(id);
    }
    case 'pay-rates': {
      if (!canEdit('payments')) return;
      const r = centsInput($('#pdRate').value), d = centsInput($('#pdDaily').value);
      if (!(r > 0 && d > 0)) return toast('Valores inválidos.', true);
      const { error } = await financeDbClient().from('v2_coach_rates').upsert({ coach_id: id, hourly_cents: r, daily_cents: d });
      if (error) return toast(error.message, true);
      await liveReload(); payDrawer(id); return toast('Valores do técnico atualizados.');
    }
    case 'pay-mark': {
      const c = coachOf(id), s = coachSummary(id, S.pay.month);
      if (!(await confirmBox({ title: 'Confirmar pagamento realizado?', text: `Confirme que a transferência ao técnico já foi feita fora deste painel.<br>${esc(c.name)} · ${monthLabel(S.pay.month)}<br><b>${money(s.total)}</b>${c.pix ? ` · PIX ${esc(c.pix)}` : ''}. Uma saída “Folha técnica” será lançada no Financeiro.`, ok: 'Marcar como pago' }))) return;
      const { error } = await financeDbClient().rpc('v2_record_coach_payout', { p_coach: id, p_month: `${S.pay.month}-01` });
      if (error) return toast(error.message, true);
      closeDialog(); await liveReload(); return toast('Pagamento registrado e lançado no Financeiro.');
    }
    case 'pay-export': { const key = S.pay.month; return download(`pagamentos-tecnicos-${key}.csv`, csv([['Técnico', 'Data', 'Tipo', 'Descrição', 'Horas', 'Valor (R$)', 'Status'], ...COACH_ITEMS.filter(i => inMonth(i.date, key)).sort((a, b) => a.coach.localeCompare(b.coach) || a.date.localeCompare(b.date)).map(i => [coachOf(i.coach).name, i.date.split('-').reverse().join('/'), i.type, i.desc, i.hours || '', (itemValue(i) / 100).toFixed(2).replace('.', ','), i.status])])); }
    /* financeiro */
    case 'fin-tab': S.fin.tab = el.dataset.tab; return render();
    case 'fin-import': return financeImportWizard(el.dataset.report);
    case 'finance-import-commit': return financeImportCommit();
    case 'fin-db-refresh': return financeDbRefresh().catch(e => toast(e.message, true));
    case 'finance-manual-new': return financeManualForm();
    case 'finance-manual-save': return financeManualSave();
    case 'fin-goto': S.fin.tab = el.dataset.tab; closeDialog(); return render();
    /* configurações */
    case 'st-tab': S.st.tab = el.dataset.tab; return render();
    case 'user-open': return userDrawer(id);
    case 'user-new': return userDrawer(null);
    case 'user-save': return saveUser();
    case 'portal-invite': return portalInviteForm();
    case 'portal-invite-save': return portalInviteSave();
    case 'portal-link': return portalLinkForm();
    case 'portal-link-save': return portalLinkSave();
    case 'portal-unlink': return portalUnlink(el.dataset.user, el.dataset.athlete);
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
  if (fd[t.id]) { render(); toast('Os parâmetros do assistente ainda precisam ser conectados ao Apps Script.', true); }
});

/* ─── Topo ─── */
$('#viewAs').addEventListener('change', () => { /* O usuário autenticado não pode trocar de identidade. */ });
$('#menuBtn').addEventListener('click', () => { const o = $('#sidebar').classList.toggle('open'); $('#menuBtn').setAttribute('aria-expanded', String(o)); });
$('#themeBtn').addEventListener('click', () => { S.theme = S.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = S.theme; try { localStorage.setItem('apollo-v2-theme', S.theme); } catch { } });
try { const th = localStorage.getItem('apollo-v2-theme'); if (th) { S.theme = th; document.documentElement.dataset.theme = th; } } catch { }

/* Âncora na URL (#bookings, #finance...) abre a página diretamente */
const fromHash = () => { const h = location.hash.slice(1); if (PAGES.some(p => p.id === h)) { S.page = h; render(); } };
window.addEventListener('hashchange', fromHash);
const _go = go; go = page => { _go(page); history.replaceState(null, '', '#' + page); };

async function bootstrapPanel() {
  try {
    const auth = await apolloRequireArea('panel');
    if (!auth.ok) {
      if (auth.error) $('#startup').textContent = `Não foi possível verificar o acesso: ${auth.error}`;
      return;
    }
    await liveLoadPanel();
    fillViewAs();
    document.body.classList.add('app-ready');
    render(); fromHash();
    if (seesFinance()) {
      await financeDbInit();
      try { await financeManualRefresh(); } catch (error) { FIN_DB.error = error.message; }
      render();
    }
  } catch (error) {
    $('#startup').textContent = `Não foi possível carregar os dados: ${error.message}`;
  }
}
bootstrapPanel();
