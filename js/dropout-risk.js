/* Same rule as Manager: consecutive absent marks in the last 60 days. */
'use strict';
function dropoutVisible(role, overviewAllowed) {
  return overviewAllowed && ['Administrador', 'Atendimento'].includes(role);
}
function dropoutCanDeactivate(actualRole, visibleRole, editAllowed, preview) {
  return actualRole === 'admin' && visibleRole === 'Administrador' && editAllowed && !preview;
}
const dropoutDeactivating = new Set();
async function dropoutDeactivate(id) {
  if (!dropoutCanDeactivate(APOLLO_AUTH.access?.role,me()?.role,canEdit('athletes'),S.previewRole)) return toast('Somente administradores podem desligar atletas nesta visão.',true);
  const athlete = ATHLETES.find(a=>a.id===id && a.active && myTeamIds().includes(a.teamId));
  if (!athlete || dropoutDeactivating.has(id)) return;
  dropoutDeactivating.add(id);
  let saved = false;
  try {
    if (!(await confirmBox({title:'Desligar atleta?',text:`<b>${esc(displayName(athlete.name))}</b> será marcado como inativo e sairá das listas de atletas ativos. A ficha e o histórico serão preservados. Revise mensalidades ativas separadamente.`,ok:'Desligar atleta',danger:true}))) return;
    await liveWrite('athletes',{is_active:false,left_at:ymd(new Date())},id);
    saved = true; athlete.active = false;
    await liveReload();
    toast('Atleta desligado. Ficha e histórico preservados.');
  } catch(error) { toast(saved ? 'Desligamento salvo. Atualize o painel para recarregar os dados.' : `Não foi possível desligar: ${error.message}`,true); }
  finally { dropoutDeactivating.delete(id); }
}
function calculateDropoutRisk(athletes, sessions, now, teamIds) {
  const permitted = new Set(teamIds), cutoff = now.getTime() - 60 * 86400000;
  const ordered = sessions.filter(s => s.recorded && permitted.has(s.teamId)
    && new Date(s.startedAt || `${s.date}T${s.start || '00:00'}:00`).getTime() >= cutoff
    && new Date(s.startedAt || `${s.date}T${s.start || '00:00'}:00`).getTime() <= now.getTime())
    .slice().sort((a,b) => new Date(b.startedAt || `${b.date}T${b.start}:00`) - new Date(a.startedAt || `${a.date}T${a.start}:00`));
  const history = new Map();
  for (const s of ordered) for (const [id,status] of Object.entries(s.att || {})) {
    if (!history.has(id)) history.set(id, []);
    history.get(id).push({status, at:s.startedAt || `${s.date}T${s.start}:00`});
  }
  return athletes.filter(a => a.active && permitted.has(a.teamId)).map(a => {
    const rows = history.get(a.id) || [];
    let streak = 0;
    for (const row of rows) { if (row.status !== 'absent') break; streak++; }
    return streak >= 2 ? {...a, streak, last:rows[0].at} : null;
  }).filter(Boolean).sort((a,b) => b.streak-a.streak || a.name.localeCompare(b.name));
}
function dropoutContactUrl(a, now = new Date()) {
  const birth = /^\d{4}-\d{2}-\d{2}$/.test(a.birth || '') ? new Date(`${a.birth}T12:00:00`) : null;
  const adult = birth && new Date(birth.getFullYear()+18,birth.getMonth(),birth.getDate()) <= now;
  const phone = String((adult ? a.phone : a.parentPhone) || a.parentPhone || a.phone || '').replace(/\D/g,'');
  const national = phone.startsWith('55') && phone.length > 11 ? phone.slice(2) : phone;
  if (!/^\d{10,11}$/.test(national)) return '';
  const first = (a.name || '').split(' ')[0];
  const greeting = adult ? `Olá, ${first}!` : `Olá${a.parentName ? ', '+a.parentName.split(' ')[0] : ''}!`;
  const message = `${greeting} Aqui é da Apollo Voleibol. Sentimos falta ${adult ? 'de você' : 'de '+first} nos últimos treinos. Está tudo bem? Se precisar de algo, conte com a gente.`;
  return `https://wa.me/55${national}?text=${encodeURIComponent(message)}`;
}
let dropoutTeam = '';
function dropoutRiskHTML() {
  if (!dropoutVisible(me()?.role, canView('overview'))) return '';
  const teams = TEAMS.filter(t => myTeamIds().includes(t.id));
  if (!teams.some(t => t.id === dropoutTeam)) dropoutTeam = '';
  const rows = calculateDropoutRisk(ATHLETES,SESSIONS,new Date(),dropoutTeam ? [dropoutTeam] : teams.map(t=>t.id));
  const risk = rows.filter(a=>a.streak<=5), review = rows.filter(a=>a.streak>=6);
  const list = items => items.length ? `<ul class="dropout-list">${items.map(a=>{
    const url = dropoutContactUrl(a);
    const adminAction = dropoutCanDeactivate(APOLLO_AUTH.access?.role,me()?.role,canEdit('athletes'),S.previewRole) ? `<button class="btn sm danger" data-act="dropout-deactivate" data-id="${esc(a.id)}" aria-label="Desligar atleta ${esc(displayName(a.name))}">Desligar atleta</button>` : '';
    return `<li><div><strong>${esc(displayName(a.name))}</strong><span>${esc(teamOf(a.teamId)?.name || 'Sem equipe')} · ${a.streak} faltas seguidas</span><small>Última chamada: ${esc(fmtShort(new Date(a.last)))}</small></div><div class="dropout-actions">${url ? `<a class="btn sm wa-ghost" href="${esc(url)}" target="_blank" rel="noopener">${icon('whatsapp')} Conversar</a>` : '<span class="hint">Sem telefone</span>'}${adminAction}</div></li>`;
  }).join('')}</ul>` : '<p class="dropout-empty">Nenhum atleta nesta faixa.</p>';
  return `<section class="panel dropout-panel" aria-labelledby="dropoutTitle"><div class="panel-head"><div><h2 id="dropoutTitle">${icon('alert')} Risco de evasão</h2><div class="sub">Faltas consecutivas sem justificativa · chamadas dos últimos 60 dias</div></div><select class="select" id="dropoutTeam" aria-label="Filtrar risco de evasão por equipe"><option value="">Todas as equipes</option>${teams.map(t=>`<option value="${esc(t.id)}" ${t.id===dropoutTeam?'selected':''}>${esc(t.name)}</option>`).join('')}</select></div><div class="dropout-summary"><span><b>${risk.length}</b> em risco · 2 a 5 faltas</span><span><b>${review.length}</b> para conferir · 6 ou mais faltas</span></div><div class="panel-pad"><p class="hint">Uma presença ou falta justificada interrompe a sequência. Sem chamada registrada, não contamos falta.</p>${risk.length>5 ? `${list(risk.slice(0,5))}<details><summary>Ver mais ${risk.length-5} atletas em risco</summary>${list(risk.slice(5))}</details>` : list(risk)}<details class="dropout-review"><summary>Conferir continuidade na equipe (${review.length})</summary><p class="hint">Seis ou mais faltas seguidas. Confirme a situação com o atleta ou responsável antes de atualizar o cadastro.</p>${list(review)}</details><p class="hint">Indicador de acompanhamento; não confirma desistência nem altera o cadastro automaticamente.</p></div></section>`;
}
