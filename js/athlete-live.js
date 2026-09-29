/* Real athlete/guardian portal. All reads are scoped by database RLS. */
'use strict';
const PORTAL = { athletes: [], teams: [], locations: [], attendance: [], competitions: [], invoices: [], notices: [], blocked: [],
  selected: null, tab: 'home', error: '' };
const portal$ = selector => document.querySelector(selector);
const portalEsc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const portalDate = value => value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—';
const portalMoney = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0) / 100);
const portalCurrent = () => PORTAL.athletes.find(a => a.id === PORTAL.selected);
const portalTeam = athlete => PORTAL.teams.find(t => t.id === athlete?.team_id);
const portalLocation = team => PORTAL.locations.find(x => x.id === team?.location_id);
const portalMinor = athlete => !athlete?.birth_date || new Date(athlete.birth_date) > new Date(new Date().setFullYear(new Date().getFullYear() - 18));
async function portalRead(table, fields) {
  const { data, error } = await financeDbClient().from(table).select(fields);
  if (error) throw error;
  return data;
}
function portalSchedule(team, days = 28) {
  const raw = team?.training_schedule;
  const schedule = Array.isArray(raw) ? raw : Object.entries(raw || {}).map(([day, time]) => ({ day: Number(day), ...time }));
  const out = [], now = new Date();
  for (let i = 0; i < days; i++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    schedule.filter(s => Number(s.day) === date.getDay() && !PORTAL.blocked.some(b => b.team_id === team.id && b.date === dateStr))
      .forEach(s => { if (`${dateStr}T${s.end}` > `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`) out.push({ date: dateStr, start: s.start, end: s.end }); });
  }
  return out;
}
function portalInvoices(athlete) { return PORTAL.invoices.filter(x => x.athleteId === athlete.id); }
function portalPendingInvoice(invoice) {
  const row = invoice.data || {};
  return invoice.reportType === 'open' && (row.installments || []).some(x => x.date < new Date().toISOString().slice(0, 10) && x.amount > 0);
}
async function portalLoad() {
  const access = await apolloRequireArea('athlete');
  if (!access.ok) { if (access.error) portal$('#main').textContent = access.error; return; }
  const ids = access.access.athleteIds;
  const [athletes, teams, locations, attendance, competitions, notices, blocked, invoices] = await Promise.all([
    portalRead('athletes', 'id,team_id,full_name,birth_date,position,jersey_number,joined_at,is_active,phone,parent_phone'),
    portalRead('teams', 'id,name,category,gender,training_schedule,location_id,is_active'),
    portalRead('training_locations', 'id,name,venue,address,phone'),
    portalRead('attendance', 'athlete_id,status,created_at'),
    portalRead('competitions', 'id,team_id,name,scheduled_at,venue_name,status'),
    portalRead('v2_portal_notices', 'id,athlete_id,kind,subject_date,value,created_at'),
    portalRead('team_unavailable_dates', 'team_id,date'),
    financeDbClient().rpc('v2_my_invoices').then(({ data, error }) => { if (error) throw error; return data || []; })
  ]);
  PORTAL.athletes = athletes.filter(a => ids.includes(a.id) && a.is_active);
  PORTAL.teams = teams; PORTAL.locations = locations; PORTAL.attendance = attendance;
  PORTAL.competitions = competitions; PORTAL.notices = notices; PORTAL.blocked = blocked; PORTAL.invoices = invoices;
  if (!PORTAL.athletes.some(a => a.id === PORTAL.selected)) PORTAL.selected = PORTAL.athletes[0]?.id || null;
  portalRender();
}
function portalRender() {
  const athlete = portalCurrent();
  if (!athlete) { portal$('#main').innerHTML = '<section class="panel panel-pad">Nenhum atleta ativo vinculado a esta conta.</section>'; return; }
  const team = portalTeam(athlete);
  const name = APOLLO_AUTH.user?.user_metadata?.full_name || APOLLO_AUTH.user?.email || '';
  portal$('#hello').innerHTML = `<div class="eyebrow">${PORTAL.athletes.length > 1 ? 'Família Apollo' : 'Área do atleta'}</div><h1>Olá, ${portalEsc(name.split(' ')[0])}</h1><p>Informações reais do cadastro, dos treinos e dos relatórios importados.</p>`;
  portal$('#topRight').innerHTML = `${apolloHasStaffAccess() ? '<a class="btn sm" href="index.html">Painel de Gestão</a>' : ''}<button class="icon-btn" id="portalLogout" title="Sair" aria-label="Sair">Sair</button>`;
  portal$('#portalLogout').onclick = apolloSignOut;
  portal$('#deps').innerHTML = PORTAL.athletes.length > 1 ? PORTAL.athletes.map(a =>
    `<button class="dep ${a.id === athlete.id ? 'on' : ''}" data-athlete="${a.id}"><span class="avatar">${portalEsc(a.full_name.slice(0, 1))}</span><span><strong>${portalEsc(a.full_name)}</strong><small>${portalEsc(portalTeam(a)?.name || '')}</small></span></button>`).join('') : '';
  portal$('#deps').classList.toggle('hide', PORTAL.athletes.length < 2);
  const tabs = [['home','Início'],['agenda','Agenda'],['evo','Evolução'],['pay','Mensalidades'],['cad','Cadastro']];
  portal$('#tabs').innerHTML = tabs.map(([id,label]) => `<button data-tab="${id}" class="${PORTAL.tab === id ? 'on' : ''}">${label}</button>`).join('');
  const views = { home: portalHome, agenda: portalAgenda, evo: portalEvolution, pay: portalPayments, cad: portalRegistration };
  portal$('#main').innerHTML = views[PORTAL.tab](athlete, team);
}
function portalHome(athlete, team) {
  const next = portalSchedule(team, 21)[0], loc = portalLocation(team);
  const attendance = PORTAL.attendance.filter(x => x.athlete_id === athlete.id);
  const pending = portalInvoices(athlete).filter(portalPendingInvoice).length;
  return `<div class="agrid"><div class="stack">
    <section class="hero"><div class="eyebrow">Próximo treino</div><h2>${portalEsc(team?.name || 'Equipe a definir')}</h2>
      <div class="when">${next ? `${portalDate(next.date)} · ${portalEsc(next.start)} às ${portalEsc(next.end)}` : 'Agenda ainda não cadastrada'}</div>
      <div class="meta"><span>${portalEsc(loc?.venue || loc?.name || '')}</span><span>${portalEsc(loc?.address || '')}</span></div>
      ${next ? `<button class="btn primary sm" data-absence="${next.date}">Avisar ausência</button>` : ''}</section>
    <section class="panel panel-pad"><h2>O que precisa da sua atenção</h2>
      <p>${pending ? `${pending} cobrança(s) vencida(s) no último relatório do Tecnofit.` : 'Nenhuma mensalidade vencida vinculada a este atleta.'}</p>
      ${pending ? '<button class="btn sm" data-tab="pay">Ver mensalidades</button>' : ''}</section>
  </div><div class="stack"><section class="panel panel-pad"><h2>Presença registrada</h2>
    <div class="mini-stats"><div><b>${attendance.filter(x => x.status === 'present').length}</b><small>presenças</small></div>
    <div><b>${attendance.filter(x => x.status === 'absent').length}</b><small>faltas</small></div>
    <div><b>${attendance.filter(x => x.status === 'excused').length}</b><small>justificadas</small></div></div></section>
    <section class="panel panel-pad"><h2>Próxima competição</h2>${portalCompetitions(athlete, true)}</section></div></div>`;
}
function portalCompetitions(athlete, one = false) {
  const list = PORTAL.competitions.filter(x => x.team_id === athlete.team_id && x.scheduled_at >= new Date().toISOString())
    .sort((a,b) => a.scheduled_at.localeCompare(b.scheduled_at));
  return (one ? list.slice(0, 1) : list).map(c => `<div class="stat-line"><span><b>${portalEsc(c.name)}</b><br><small>${portalDate(c.scheduled_at)} · ${portalEsc(c.venue_name || '')}</small></span>
    <button class="btn sm" data-event="${c.id}">Responder</button></div>`).join('') || '<p class="muted">Nenhuma competição agendada.</p>';
}
function portalAgenda(athlete, team) {
  const loc = portalLocation(team);
  return `<section class="panel panel-pad"><h2>Treinos das próximas quatro semanas</h2><p class="muted small">${portalEsc(team?.name || '')} · ${portalEsc(loc?.address || '')}</p>
    ${portalSchedule(team).map(s => `<div class="stat-line"><span>${portalDate(s.date)} · ${portalEsc(s.start)}–${portalEsc(s.end)}</span><button class="btn sm" data-absence="${s.date}">Avisar ausência</button></div>`).join('') || '<p class="muted">Horários não cadastrados.</p>'}</section>
    <section class="panel panel-pad mt"><h2>Competições</h2>${portalCompetitions(athlete)}</section>`;
}
function portalEvolution(athlete) {
  const rows = PORTAL.attendance.filter(x => x.athlete_id === athlete.id);
  const rate = rows.length ? Math.round(100 * rows.filter(x => x.status === 'present').length / rows.length) : null;
  return `<section class="panel panel-pad"><h2>Presença nos treinos</h2><p class="muted small">Registros efetuados pelos técnicos no Manager App.</p>
    <div class="mini-stats"><div><b>${rate === null ? '—' : rate + '%'}</b><small>presença</small></div><div><b>${rows.length}</b><small>chamadas</small></div></div>
    <p class="hint">Avaliações técnicas e scout aparecerão aqui quando forem vinculados ao cadastro do atleta.</p></section>`;
}
function portalPayments(athlete) {
  const rows = portalInvoices(athlete);
  if (!rows.length) return `<section class="panel panel-pad"><h2>Mensalidades</h2><p>Não há cobranças vinculadas a este atleta no último conjunto de relatórios importados.</p>
    <p class="hint">A secretaria precisa vincular o código de cliente Tecnofit ao cadastro e manter os relatórios atualizados. Para pagar, use os canais oficiais informados pela Apollo.</p></section>`;
  return `<section class="panel panel-pad"><h2>Mensalidades</h2><p class="muted small">Espelho das exportações manuais do Tecnofit. Confirme o pagamento na plataforma antes de agir.</p>
    ${rows.map(invoice => { const r = invoice.data || {}; const open = invoice.reportType === 'open';
      return `<div class="stat-line"><span><b>${portalEsc(r.item || 'Mensalidade')}</b><br><small>${open ? `Vencimento: ${portalDate(r.due)}` : `Recebido em: ${portalDate(r.date)}`}</small></span>
        <b>${portalMoney(open ? r.open : r.gross)} · ${open ? 'Em aberto' : 'Recebido'}</b></div>`; }).join('')}</section>`;
}
function portalRegistration(athlete, team) {
  const loc = portalLocation(team), minor = portalMinor(athlete);
  const consent = PORTAL.notices.filter(n => n.athlete_id === athlete.id && n.kind === 'image_consent').sort((a,b) => b.created_at.localeCompare(a.created_at))[0];
  return `<section class="panel panel-pad"><h2>Cadastro</h2><div class="stat-line"><span>Atleta</span><b>${portalEsc(athlete.full_name)}</b></div>
    <div class="stat-line"><span>Nascimento</span><b>${portalDate(athlete.birth_date)}</b></div>
    <div class="stat-line"><span>Equipe</span><b>${portalEsc(team?.name || '—')}</b></div>
    <div class="stat-line"><span>Núcleo</span><b>${portalEsc(loc?.name || '—')}</b></div>
    <div class="stat-line"><span>Desde</span><b>${portalDate(athlete.joined_at)}</b></div>
    ${minor ? `<div class="banner note mt">Autorizações para menores devem ser enviadas pelo responsável legal vinculado a esta conta.</div>` : ''}
    <h3 class="mt">Uso de imagem</h3><p class="muted small">Última resposta: ${consent ? (consent.value?.authorized ? 'autorizado' : 'não autorizado') : 'pendente'}.</p>
    <div class="actions"><button class="btn sm" data-consent="yes">Autorizar</button><button class="btn sm" data-consent="no">Não autorizar</button></div>
    <p class="hint mt">Para corrigir dados pessoais, condições de saúde ou documentos, procure a secretaria. Os avisos enviados aqui ficam registrados com a conta e a data.</p></section>`;
}
async function portalNotice(kind, subjectDate, value) {
  const athlete = portalCurrent();
  const { error } = await financeDbClient().from('v2_portal_notices').insert({
    athlete_id: athlete.id, author_id: APOLLO_AUTH.user.id, kind,
    subject_date: subjectDate || null, value
  });
  if (error) throw error;
  await portalLoad();
}
document.addEventListener('click', async event => {
  const target = event.target.closest('[data-tab],[data-athlete],[data-absence],[data-event],[data-consent]');
  if (!target) return;
  if (target.dataset.tab) { PORTAL.tab = target.dataset.tab; portalRender(); return; }
  if (target.dataset.athlete) { PORTAL.selected = target.dataset.athlete; portalRender(); return; }
  try {
    if (target.dataset.absence) {
      if (!confirm(`Avisar ausência em ${portalDate(target.dataset.absence)}?`)) return;
      await portalNotice('absence', target.dataset.absence, { reason: 'Aviso enviado pelo portal' });
      alert('Ausência registrada para a equipe.');
    } else if (target.dataset.event) {
      const going = confirm('Confirma a participação nesta competição?');
      if (!going && !confirm('Deseja registrar que não participará?')) return;
      await portalNotice('event_response', null, { competitionId: target.dataset.event, attending: going });
      alert('Resposta registrada.');
    } else if (target.dataset.consent) {
      await portalNotice('image_consent', null, { authorized: target.dataset.consent === 'yes' });
      alert('Sua resposta foi registrada.');
    }
  } catch (error) { alert(`Não foi possível registrar: ${error.message}`); }
});
portalLoad().catch(error => { PORTAL.error = error.message; portal$('#main').textContent = `Não foi possível carregar a área do atleta: ${error.message}`; });
