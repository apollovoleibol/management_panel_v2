/* Real athlete/guardian portal. All reads are scoped by database RLS. */
'use strict';
const PORTAL = { athletes: [], teams: [], locations: [], attendance: [], competitions: [], invoices: [], notices: [], blocked: [], changes: [],
  selected: null, tab: new URLSearchParams(location.search).has('pagamento') ? 'pay' : 'home', error: '', historyError: '' };
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
const PORTAL_REASONS = { court: 'quadra indisponível', weather: 'clima', holiday: 'feriado ou evento', other: 'outro motivo' };
const portalDM = d => `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}`;
const portalHM = t => String(t || '').slice(0, 5);
// Treinos efetivos das próximas semanas: a grade com as mudanças de horário do dia e as
// reposições/treinos extras registrados pelos técnicos (migração 048). Com withCancelled,
// os cancelados também voltam, marcados e com o motivo.
function portalSchedule(team, days = 28, withCancelled = false) {
  const raw = team?.training_schedule;
  const schedule = Array.isArray(raw) ? raw : Object.entries(raw || {}).map(([day, time]) => ({ day: Number(day), ...time }));
  const changes = PORTAL.changes.filter(c => c.team_id === team?.id);
  const out = [], now = new Date(), p2 = n => String(n).padStart(2, '0');
  const nowKey = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}T${p2(now.getHours())}:${p2(now.getMinutes())}`;
  for (let i = 0; i < days; i++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const dateStr = `${date.getFullYear()}-${p2(date.getMonth() + 1)}-${p2(date.getDate())}`;
    const cancel = PORTAL.blocked.find(b => b.team_id === team?.id && b.training_date === dateStr);
    const change = changes.find(c => c.training_date === dateStr && c.kind === 'change');
    const slots = schedule.filter(s => Number(s.day) === date.getDay()).map(s => change
      ? { start: portalHM(change.start_time), end: portalHM(change.end_time),
          note: change.makeup_for ? `Horário estendido para repor o treino de ${portalDM(change.makeup_for)}` : 'Horário alterado neste dia' }
      : { start: s.start, end: s.end, note: '' });
    changes.filter(c => c.training_date === dateStr && c.kind === 'extra').forEach(c => slots.push({
      start: portalHM(c.start_time), end: portalHM(c.end_time),
      note: c.makeup_for ? `Reposição do treino de ${portalDM(c.makeup_for)}` : 'Treino extra' }));
    slots.forEach(s => {
      if (`${dateStr}T${s.end}` <= nowKey) return;
      if (cancel) {
        if (withCancelled) out.push({ date: dateStr, start: s.start, end: s.end, cancelled: true,
          note: `Treino cancelado${cancel.reason ? ' · ' + PORTAL_REASONS[cancel.reason] : ''}` });
        return;
      }
      out.push({ date: dateStr, ...s });
    });
  }
  return out.sort((x, y) => `${x.date}${x.start}`.localeCompare(`${y.date}${y.start}`));
}
function portalInvoices(athlete) { return PORTAL.invoices.filter(x => x.athleteId === athlete.id); }
function portalPendingInvoice(invoice) {
  const row = invoice.data || {};
  return invoice.reportType === 'open' && (row.installments || []).some(x => x.date < new Date().toISOString().slice(0, 10) && x.amount > 0);
}
async function portalLoad() {
  const access = await apolloRequireArea('athlete');
  if (!access.ok) { if (access.error) portalError(access.error); return; }
  const ids = access.access.athleteIds;
  const [athletes, teams, locations, attendance, competitions, notices, blocked, invoices, changes] = await Promise.all([
    portalRead('athletes', 'id,team_id,full_name,birth_date,position,jersey_number,joined_at,is_active,phone,parent_phone'),
    portalRead('teams', 'id,name,category,gender,training_schedule,location_id,is_active'),
    portalRead('training_locations', 'id,name,venue,address,phone'),
    portalRead('attendance', 'athlete_id,status,created_at'),
    portalRead('competitions', 'id,team_id,name,scheduled_at,venue_name,status'),
    portalRead('v2_portal_notices', 'id,athlete_id,kind,subject_date,value,created_at'),
    portalRead('v2_training_cancellations', 'team_id,training_date,reason').catch(() => portalRead('v2_training_cancellations', 'team_id,training_date')),
    financeDbClient().rpc('v2_my_invoices').then(({ data, error }) => {
      PORTAL.historyError = error ? 'Histórico Tecnofit indisponível no momento.' : '';
      return error ? [] : data || [];
    }).catch(() => { PORTAL.historyError = 'Histórico Tecnofit indisponível no momento.'; return []; }),
    portalRead('v2_training_changes', 'team_id,training_date,kind,start_time,end_time,makeup_for').catch(() => [])
  ]);
  PORTAL.athletes = athletes.filter(a => ids.includes(a.id) && a.is_active);
  PORTAL.teams = teams; PORTAL.locations = locations; PORTAL.attendance = attendance;
  PORTAL.competitions = competitions; PORTAL.notices = notices; PORTAL.blocked = blocked; PORTAL.invoices = invoices; PORTAL.changes = changes;
  if (!PORTAL.athletes.some(a => a.id === PORTAL.selected)) PORTAL.selected = PORTAL.athletes[0]?.id || null;
  portalRender();
  await window.PortalBilling.load();
  if (PORTAL.tab === 'pay') portalRender();
}
function portalClearSkeleton() {
  portal$('#main').setAttribute('aria-busy', 'false');
  portal$('#hello').removeAttribute('aria-hidden');
  portal$('#deps').removeAttribute('aria-hidden');
}
function portalError(message) {
  PORTAL.error = message;
  portalClearSkeleton();
  for (const selector of ['#hello', '#deps', '#tabs', '#topRight']) portal$(selector).textContent = '';
  portal$('#main').textContent = `Não foi possível carregar a área do atleta: ${message}`;
}
function portalRender() {
  portalClearSkeleton();
  const athlete = portalCurrent();
  if (!athlete) {
    portal$('#hello').textContent = '';
    portal$('#deps').textContent = '';
    portal$('#tabs').textContent = '';
    portal$('#topRight').innerHTML = '<button class="icon-btn" id="portalLogout" title="Sair" aria-label="Sair">Sair</button>';
    portal$('#portalLogout').onclick = apolloSignOut;
    portal$('#main').innerHTML = '<section class="panel panel-pad">Nenhum atleta ativo vinculado a esta conta.</section>';
    return;
  }
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
      ${next?.note ? `<div class="meta"><span>${portalEsc(next.note)}</span></div>` : ''}
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
    ${portalSchedule(team, 28, true).map(s => `<div class="stat-line"><span>${s.cancelled ? '<s>' : ''}${portalDate(s.date)} · ${portalEsc(s.start)}–${portalEsc(s.end)}${s.cancelled ? '</s>' : ''}${s.note ? `<small class="muted" style="display:block">${portalEsc(s.note)}</small>` : ''}</span>${s.cancelled ? '' : `<button class="btn sm" data-absence="${s.date}">Avisar ausência</button>`}</div>`).join('') || '<p class="muted">Horários não cadastrados.</p>'}</section>
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
  return window.PortalBilling.render(athlete) + portalPaymentHistory(athlete);
}
function portalPaymentHistory(athlete) {
  const rows = portalInvoices(athlete);
  if (!rows.length) return PORTAL.historyError ? `<section class="panel panel-pad billing-history"><h2>Histórico Tecnofit</h2><p>${portalEsc(PORTAL.historyError)}</p></section>` : '';
  return `<section class="panel panel-pad billing-history"><h2>Histórico Tecnofit</h2><p class="muted small">Espelho das exportações manuais do Tecnofit. Registros históricos; pagamentos devem ser consultados nos canais oficiais da Apollo.</p>
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
  if (target.dataset.tab) { PORTAL.tab = target.dataset.tab; portalRender(); if(PORTAL.tab==='pay')window.PortalBilling.notify(); return; }
  if (target.dataset.athlete) { PORTAL.selected = target.dataset.athlete; portalRender(); window.PortalBilling.notify(); return; }
  try {
    if (target.dataset.absence) {
      // O motivo aparece para o técnico na chamada do Manager App (já marcada como justificada)
      const reason = prompt(`Avisar ausência em ${portalDate(target.dataset.absence)}.\nMotivo (opcional):`, '');
      if (reason === null) return;
      await portalNotice('absence', target.dataset.absence, { reason: reason.trim().slice(0, 200) || 'Ausência avisada pela família' });
      alert('Ausência avisada. O técnico verá a falta como justificada na chamada.');
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
portalLoad().catch(error => portalError(error.message));
