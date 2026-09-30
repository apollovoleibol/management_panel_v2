/* Equipes e núcleos · Pacotes e mensalidades · Chatbot Feeder */
'use strict';

/* ═══════════════ EQUIPES E NÚCLEOS ═══════════════ */
const teamWarnings = t => [!t.desc && 'Sem descrição', !t.coach && 'Sem técnico', !t.schedule.length && 'Sem horários', !plansOfTeam(t.id).length && 'Sem pacotes'].filter(Boolean);
function renderTeams() {
  const teamsIn = n => TEAMS.filter(t => t.n === n);
  const q = S.tm.q.toLowerCase();
  const shown = TEAMS.filter(t => (S.tm.n === 'all' || t.n === S.tm.n) && (!q || (t.name + ' ' + t.category + ' ' + t.desc).toLowerCase().includes(q)));
  const card = t => {
    const c = coachOf(t.coach), w = teamWarnings(t), ath = ATHLETES.filter(a => a.active && a.teamId === t.id).length;
    return `<button class="panel tcard ${NCLASS(t.n)}" data-act="team-open" data-id="${t.id}">
      <div class="top"><div><h3>${esc(t.name)}</h3><div class="hint">${esc(t.category)} · ${ageRange(t)} · ${genderLabel(t.gender)}</div></div>${t.available && t.active ? `<span class="tag st-ok nodot" title="O assistente oferece esta equipe">${icon('bot')} No assistente</span>` : `<span class="tag nodot">${t.active ? 'Fora do assistente' : 'Inativa'}</span>`}</div>
      <div class="sched">${t.schedule.map(s => `<span>${schedText(s)}</span>`).join('') || '<span>Sem horários</span>'}</div>
      <div class="stat-line" style="padding:0;border:0;font-size:12px"><span class="muted">${c ? esc(c.name) : 'Sem técnico'} · ${ath} atletas · ${plansOfTeam(t.id).length} pacotes</span></div>
      ${w.length ? `<div class="chips">${w.map(x => `<span class="tag st-warn nodot">${icon('alert')} ${x}</span>`).join('')}</div>` : ''}</button>`;
  };
  return `${viewBanner('teams')}
  <div class="page-head"><div><div class="eyebrow">Operação · estrutura</div><h1>Equipes e núcleos</h1><p>Os núcleos são os locais de treino; cada equipe pertence a um núcleo. Estas informações alimentam a agenda, o cadastro de atletas e o assistente.</p></div>
    <div class="head-actions"><button class="btn" data-act="nucleus-new" data-edit>${icon('plus')} Novo núcleo</button><button class="btn primary" data-act="team-new" data-edit>${icon('plus')} Nova equipe</button></div></div>

  <div class="section-title" style="margin-top:0"><h2>${icon('pin')} Núcleos</h2></div>
  <div class="grid ngrid">${NUCLEI.map(n => {
    const ts = teamsIn(n.id), ath = ATHLETES.filter(a => a.active && ts.some(t => t.id === a.teamId)).length, tr = ts.filter(t => t.active).reduce((s, t) => s + t.schedule.length, 0);
    return `<section class="panel ncard ${NCLASS(n.id)}">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div><div class="eyebrow">Núcleo</div><h3>${esc(n.name)}</h3></div><button class="btn sm" data-act="nucleus-edit" data-id="${n.id}" data-edit>${icon('edit')} Editar</button></div>
      <div class="small"><strong>${esc(n.venue)}</strong><div class="muted">${esc(n.address)}</div>${n.phone ? `<div class="muted">${fmtPhone(n.phone)}</div>` : ''}</div>
      <div class="meta"><span><b>${ts.length}</b>equipes</span><span><b>${ath}</b>atletas ativos</span><span><b>${tr}</b>treinos/semana</span></div>
      <button class="btn sm" data-act="team-filter" data-n="${n.id}" style="align-self:flex-start">Ver equipes do núcleo ${icon('arrow')}</button></section>`;
  }).join('')}<button class="ncard add" data-act="nucleus-new" data-edit>${icon('plus')}<strong>Adicionar núcleo</strong><span class="small">Novo local de treino</span></button></div>

  <div class="divider-band"><span>${icon('users')} Equipes</span></div>
  <section class="panel" style="margin-bottom:16px"><div class="toolbar" style="border:0">
    <div class="seg" role="group" aria-label="Filtrar por núcleo"><button class="${S.tm.n === 'all' ? 'on' : ''}" data-act="team-filter" data-n="all">Todos <span class="muted">${TEAMS.length}</span></button>${NUCLEI.map(n => `<button class="${S.tm.n === n.id ? 'on' : ''}" data-act="team-filter" data-n="${n.id}">${esc(n.name)} <span class="muted">${teamsIn(n.id).length}</span></button>`).join('')}</div>
    <div class="search">${icon('search')}<input class="input" id="tmQ" type="search" placeholder="Buscar equipe..." value="${esc(S.tm.q)}" aria-label="Buscar equipe"></div>
  </div></section>
  <div id="teamGrid">${NUCLEI.filter(n => S.tm.n === 'all' || S.tm.n === n.id).map(n => { const ts = shown.filter(t => t.n === n.id); return ts.length ? `<div style="display:flex;align-items:center;gap:10px;margin:18px 0 10px">${nTag(n.id)}<span class="muted small">${ts.length} equipe${ts.length > 1 ? 's' : ''} · ${esc(n.venue)}</span></div><div class="grid g3">${ts.map(card).join('')}</div>` : ''; }).join('') || emptyState('Nenhuma equipe encontrada', 'Ajuste a busca ou o filtro de núcleo.')}</div>`;
}

function nucleusForm(id) {
  const n = id ? nucleusOf(id) : null;
  openDialog(dHead(id ? 'Editar núcleo' : 'Novo núcleo', id ? 'Núcleo ' + esc(n.name) : 'Novo local de treino') + `<div class="d-body">
    <div class="row2"><div class="field"><label for="nuName">Nome do núcleo *</label><input class="input" id="nuName" value="${esc(n ? n.name : '')}" placeholder="Ex.: Leste"></div><div class="field"><label for="nuVenue">Nome do local</label><input class="input" id="nuVenue" value="${esc(n ? n.venue : '')}" placeholder="Ex.: Ginásio Apollo"></div></div>
    <div class="field"><label for="nuAddr">Endereço *</label><input class="input" id="nuAddr" value="${esc(n ? n.address : '')}" placeholder="Rua, número, bairro, cidade - UF, CEP"><span class="hint">O assistente envia este endereço ao confirmar o agendamento.</span></div>
    <div class="field"><label for="nuPhone">Telefone</label><input class="input" id="nuPhone" inputmode="tel" value="${esc(n ? fmtPhone(n.phone) : '')}" placeholder="(XX) XXXXX-XXXX"></div>
    <div class="field"><label for="nuNotes">Observações</label><textarea class="input" id="nuNotes" placeholder="Informações adicionais...">${esc(n ? n.notes : '')}</textarea></div>
    <div class="err" id="nuErr" role="alert"></div></div>
    <div class="d-foot">${id ? `<button class="btn danger left" data-act="nucleus-delete" data-id="${id}">${icon('trash')} Excluir</button>` : ''}<button class="btn" data-act="close-dialog">Cancelar</button><button class="btn primary" data-act="nucleus-save" data-id="${id || ''}">Salvar núcleo</button></div>`);
  $('#nuPhone').addEventListener('input', e => { e.target.value = maskPhone(e.target.value); });
}
async function saveNucleus(id) {
  const name = $('#nuName').value.trim(), address = $('#nuAddr').value.trim();
  if (!name || !address) { $('#nuErr').textContent = 'Informe nome e endereço do núcleo.'; return; }
  const data = { name, address, venue: $('#nuVenue').value.trim() || name, phone: digits($('#nuPhone').value), notes: $('#nuNotes').value.trim() };
  try {
    await liveWrite('training_locations', { name, venue: data.venue, address, phone: data.phone || null, notes: data.notes || null }, id);
    closeDialog(); await liveReload(); toast(id ? 'Núcleo atualizado.' : 'Núcleo criado.');
  } catch (error) { $('#nuErr').textContent = `Não foi possível salvar: ${error.message}`; }
}

let TE = null; // cópia de trabalho da equipe em edição
function teamEditor(id, tab = 'dados', preN = null) {
  const src = id ? teamOf(id) : { id: uid('t'), name: '', category: '', desc: '', ageMin: '', ageMax: '', gender: '', n: preN || (S.tm.n !== 'all' ? S.tm.n : NUCLEI[0].id), coach: null, available: false, active: true, schedule: [], blocked: [], isNew: true };
  TE = { ...JSON.parse(JSON.stringify(src)), plans: PLANS.filter(p => p.teams.includes(src.id)).map(p => p.id), tab, month: new Date(TODAY) };
  drawTeamEditor(); $('#dlg').dataset.dirty = '0';
}
function drawTeamEditor() {
  const t = TE, ro = !canEdit('teams'), isNew = !!t.isNew;
  const tabs = [['dados', 'Dados'], ['horarios', 'Horários'], ['pacotes', 'Pacotes'], ['datas', 'Sem novos testes']];
  const nPlans = PLANS.filter(p => p.n === t.n);
  let body = '';
  if (t.tab === 'dados') body = `
    <div class="banner ${t.available ? '' : 'note'}" style="align-items:center"><label class="toggle"><input type="checkbox" id="teAvail" ${t.available ? 'checked' : ''}><span></span></label><div><b>Disponível para agendamento</b><div class="hint">Quando ativo, o assistente oferece esta equipe nas conversas de auto-agendamento.</div></div></div>
    <div class="row2"><div class="field"><label for="teName">Nome da equipe *</label><input class="input" id="teName" value="${esc(t.name)}" placeholder="Ex.: Sub-15 Feminino"></div><div class="field"><label for="teCat">Categoria *</label><input class="input" id="teCat" value="${esc(t.category)}" placeholder="escolinha, base, competitivo, adulto..."></div></div>
    <div class="field"><label for="teDesc">Descrição</label><textarea class="input" id="teDesc" placeholder="Como o assistente deve apresentar esta turma">${esc(t.desc)}</textarea><span class="hint">Texto enviado ao assistente para descrever a turma.</span></div>
    <div class="row2"><div class="field"><label>Faixa etária</label><div style="display:flex;gap:8px;align-items:center"><input class="input" type="number" min="0" max="120" id="teAgeMin" value="${t.ageMin ?? ''}" placeholder="Mín." aria-label="Idade mínima"><span class="muted">—</span><input class="input" type="number" min="0" max="120" id="teAgeMax" value="${t.ageMax ?? ''}" placeholder="Máx." aria-label="Idade máxima" ${Number(t.ageMin) >= 18 ? 'disabled' : ''}></div><span class="hint">Se a idade mínima for 18+, o máximo fica inativo. Menos de 18 exige responsável no cadastro.</span></div>
      <div class="field"><label for="teGender">Gênero</label><select class="select" id="teGender"><option value="">Selecione...</option><option value="Misto" ${t.gender === 'Misto' ? 'selected' : ''}>Misto</option><option value="F" ${t.gender === 'F' ? 'selected' : ''}>Feminino</option><option value="M" ${t.gender === 'M' ? 'selected' : ''}>Masculino</option></select></div></div>
    <div class="row2"><div class="field"><label for="teN">Núcleo (local de treino)</label><select class="select" id="teN">${NUCLEI.map(n => `<option value="${n.id}" ${t.n === n.id ? 'selected' : ''}>Núcleo ${esc(n.name)} — ${esc(n.venue)}</option>`).join('')}</select></div>
      <div class="field"><label for="teCoach">Técnico responsável</label><select class="select" id="teCoach"><option value="">Sem técnico</option>${COACHES.map(c => `<option value="${c.id}" ${t.coach === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select><span class="hint">Nome e telefone vão para o assistente.</span></div></div>
    ${isNew ? '' : `<div class="fieldset" style="border-color:color-mix(in srgb,var(--brand) 35%,transparent);padding:14px"><b style="color:var(--brand-ink)">Zona de risco</b><p class="hint" style="margin:4px 0 10px">Prefira desativar: a equipe some da agenda e do assistente, mas atletas, agendamentos e histórico são preservados. Excluir remove também horários e datas indisponíveis e não pode ser desfeito.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn sm" data-act="team-toggle-active">${t.active ? 'Desativar equipe' : 'Reativar equipe'}</button><button type="button" class="btn sm danger" data-act="team-delete">${icon('trash')} Excluir equipe</button></div></div>`}`;
  if (t.tab === 'horarios') body = `<p class="muted small" style="margin-top:0">Escolha os dias de treino e ajuste o horário de cada um. Estes horários geram a agenda semanal, as datas oferecidas pelo assistente e as horas de pagamento dos técnicos.</p>
    <div class="days-pick" role="group" aria-label="Dias de treino">${[1, 2, 3, 4, 5, 6, 0].map(d => `<button type="button" class="${t.schedule.some(s => s.day === d) ? 'on' : ''}" data-act="te-day" data-day="${d}" aria-pressed="${t.schedule.some(s => s.day === d)}">${DOW[d]}</button>`).join('')}</div>
    <div class="mt">${[...t.schedule].sort((a, b) => ((a.day + 6) % 7) - ((b.day + 6) % 7)).map(s => `<div class="sched-row"><b>${DOW_FULL[s.day].replace('-feira', '')}</b><input class="input" type="time" step="900" value="${s.start}" data-sched="${s.day}" data-k="start" aria-label="Início ${DOW_FULL[s.day]}"><span class="muted small">às</span><input class="input" type="time" step="900" value="${s.end}" data-sched="${s.day}" data-k="end" aria-label="Fim ${DOW_FULL[s.day]}"><button type="button" class="btn ghost sq" data-act="te-day" data-day="${s.day}" aria-label="Remover ${DOW_FULL[s.day]}">${icon('trash')}</button></div>`).join('') || '<div class="preview muted small">Nenhum dia selecionado. Sem horários, o assistente mostra “A definir” e a equipe não aparece na agenda.</div>'}</div>
    <div class="hint">${t.schedule.length} treino(s) por semana · ${t.schedule.reduce((s, x) => s + Math.max(0, hoursBetween(x.start, x.end)), 0).toLocaleString('pt-BR')} h semanais</div>`;
  if (t.tab === 'pacotes') {
    const warn = nPlans.filter(p => t.plans.includes(p.id) && p.days > t.schedule.length);
    body = `<p class="muted small" style="margin-top:0">Marque os pacotes que esta equipe oferece. Os pacotes pertencem ao Núcleo ${esc(nucleusOf(t.n).name)} e aparecem no cadastro de atletas.</p>
    ${nPlans.map(p => { const cnt = ATHLETES.filter(a => a.active && a.planId === p.id && a.teamId === t.id).length; return `<label class="check fieldset" style="padding:12px 14px;margin-bottom:8px"><input type="checkbox" data-plan="${p.id}" ${t.plans.includes(p.id) ? 'checked' : ''} ${cnt ? 'data-locked="1"' : ''}><span style="flex:1"><b>${p.days}x por semana</b>${seesFinance() ? ` · ${money(p.value)}/mês · ${p.fee ? 'matrícula ' + money(p.fee) : 'sem taxa de matrícula'}` : ''}</span>${cnt ? `<span class="hint">${cnt} atletas</span>` : ''}</label>`; }).join('') || '<div class="preview muted small">Nenhum pacote neste núcleo.</div>'}
    ${warn.length ? `<div class="banner warn">${icon('alert')}<span>${warn.map(p => p.days + 'x').join(', ')} por semana excede os ${t.schedule.length} treino(s) semanais desta equipe.</span></div>` : ''}
    ${canView('packages') ? `<button type="button" class="btn sm" data-act="goto-packages">${icon('layers')} Gerenciar pacotes e reajustes</button>` : '<p class="hint">Valores e reajustes dos pacotes são geridos pelos perfis Administrador e Financeiro.</p>'}`;
  }
  if (t.tab === 'datas') body = `<p class="muted small" style="margin-top:0">Marque os dias em que o assistente não deve oferecer novos testes de ingresso. O treino continua acontecendo. Para indicar que não haverá treino, abra a data na agenda semanal.</p>
    <div id="teCal">${miniCal({ id: 'teMcal', month: t.month, isEnabled: d => t.schedule.some(s => s.day === d.getDay()) && d >= TODAY, cls: d => t.blocked.includes(ymd(d)) ? 'block' : t.schedule.some(s => s.day === d.getDay()) ? 'train' : '' })}</div>
    <div class="legend mt"><span><i style="background:var(--ok-soft);border:1px solid var(--ok)"></i>Treino previsto</span><span><i style="background:var(--brand-soft);border:1px solid var(--brand)"></i>Sem novos testes</span></div>
    ${t.blocked.length ? `<div class="mt small"><b>Datas sem novos testes:</b> ${t.blocked.sort().map(d => parseYmd(d)).map(fmtDate).join(', ')}</div>` : ''}`;
  openDialog(dHead(isNew ? 'Nova equipe' : 'Equipe · Núcleo ' + esc(nucleusOf(t.n).name), isNew ? 'Cadastrar equipe' : esc(t.name) + (t.active ? '' : ' <span class="tag nodot">Inativa</span>')) +
    `<div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${t.tab === k}" class="${t.tab === k ? 'on' : ''}" data-act="te-tab" data-tab="${k}">${l}</button>`).join('')}</div>
    <form class="d-body" id="teForm" novalidate><fieldset class="plain" ${ro ? 'disabled' : ''}>${ro ? `<div class="banner view">${icon('eye')}<span>Modo visualização — alterações bloqueadas para o seu perfil.</span></div>` : ''}${body}<div class="err" id="teErr" role="alert"></div></fieldset></form>
    <div class="d-foot"><button class="btn" data-act="try-close">${ro ? 'Fechar' : 'Descartar'}</button>${ro ? '' : `<button class="btn primary" data-act="team-save">${icon('check')} Salvar alterações</button>`}</div>`, 'drawer wide');
  const dlg = $('#dlg'), f = $('#teForm');
  f.addEventListener('input', e => {
    dlg.dataset.dirty = '1'; const el = e.target;
    if (el.dataset.sched) { const s = TE.schedule.find(x => x.day === Number(el.dataset.sched)); s[el.dataset.k] = el.value; }
    if (el.id === 'teAgeMin') { const ge = Number(el.value) >= 18 && el.value !== ''; $('#teAgeMax').disabled = ge; if (ge) $('#teAgeMax').value = ''; }
  });
  f.addEventListener('change', e => {
    dlg.dataset.dirty = '1'; const el = e.target;
    if (el.dataset.plan) { const id = Number(el.dataset.plan); if (!el.checked && el.dataset.locked) { el.checked = true; toast('Há atletas ativos neste pacote nesta equipe. Transfira-os antes de desvincular.', true); return; } TE.plans = el.checked ? [...TE.plans, id] : TE.plans.filter(x => x !== id); }
    if (el.id === 'teN') { collectTE(); TE.plans = []; }
  });
  const cal = $('#teCal');
  if (cal) cal.addEventListener('click', e => {
    const nav = e.target.closest('[data-mcal]'); if (nav) { TE.month = new Date(TE.month.getFullYear(), TE.month.getMonth() + Number(nav.dataset.mcal), 1); drawTeamEditor(); dlg.dataset.dirty = '1'; return; }
    const d = e.target.closest('[data-day]'); if (!d || d.disabled || ro) return;
    TE.blocked = TE.blocked.includes(d.dataset.day) ? TE.blocked.filter(x => x !== d.dataset.day) : [...TE.blocked, d.dataset.day];
    drawTeamEditor(); $('#dlg').dataset.dirty = '1';
  });
}
function collectTE() {
  if (TE.tab !== 'dados' || !$('#teName')) return;
  Object.assign(TE, { available: $('#teAvail').checked, name: $('#teName').value.trim(), category: $('#teCat').value.trim(), desc: $('#teDesc').value.trim(), ageMin: $('#teAgeMin').value === '' ? '' : Number($('#teAgeMin').value), ageMax: $('#teAgeMax').value === '' ? null : Number($('#teAgeMax').value), gender: $('#teGender').value, n: $('#teN').value, coach: $('#teCoach').value || null });
}
async function saveTeam() {
  collectTE();
  const err = (m, tab) => { if (tab && TE.tab !== tab) { TE.tab = tab; drawTeamEditor(); $('#dlg').dataset.dirty = '1'; } $('#teErr').textContent = m; return false; };
  if (!TE.name || !TE.category) return err('Informe nome e categoria da equipe.', 'dados');
  if (TE.ageMin !== '' && TE.ageMax != null && TE.ageMax < TE.ageMin) return err('A idade máxima deve ser maior que a mínima.', 'dados');
  const bad = TE.schedule.find(s => toMin(s.end) <= toMin(s.start));
  if (bad) return err(`${DOW_FULL[bad.day]}: o fim do treino deve ser depois do início.`, 'horarios');
  const { plans, isNew, ...data } = TE;
  const before = isNew ? null : teamOf(data.id);
  const payload = { name: data.name, category: data.category, description: data.desc,
    age_min: data.ageMin === '' ? null : data.ageMin, age_max: data.ageMax === '' ? null : data.ageMax,
    gender: data.gender || null, location_id: data.n || null, is_active: data.active,
    available_for_booking: data.available,
    training_schedule: data.schedule.map(s => ({ day: s.day, start: s.start, end: s.end })) };
  if (seesFinance()) payload.available_payment_plans = PLANS.filter(p => plans.includes(p.id)).map(planLabel);
  try {
    const saved = await liveWrite('teams', payload, isNew ? null : data.id);
    const teamId = saved.id;
    if (before?.coach !== data.coach) {
      const oldHead = before?.coach;
      const { error: removeError } = oldHead
        ? await financeDbClient().from('team_coaches').delete().eq('team_id', teamId).eq('coach_id', oldHead).eq('is_head', true)
        : { error: null };
      if (removeError) throw removeError;
      if (data.coach) {
        const { error: addError } = await financeDbClient().from('team_coaches')
          .upsert({ team_id: teamId, coach_id: data.coach, is_head: true }, { onConflict: 'team_id,coach_id' });
        if (addError) throw addError;
      }
    }
    const oldDates = new Set(before?.blocked || []), newDates = new Set(data.blocked);
    for (const date of oldDates) if (!newDates.has(date)) {
      const { error } = await financeDbClient().from('team_unavailable_dates').delete().eq('team_id', teamId).eq('date', date);
      if (error) throw error;
    }
    for (const date of newDates) if (!oldDates.has(date)) {
      const { error } = await financeDbClient().from('team_unavailable_dates').insert({ team_id: teamId, date });
      if (error) throw error;
    }
    $('#dlg').dataset.dirty = '0'; closeDialog(); await liveReload(); toast(isNew ? 'Equipe criada.' : 'Equipe atualizada.');
  } catch (error) { err(`Não foi possível salvar todas as alterações: ${error.message}`); await liveReload().catch(() => {}); }
}

/* ═══════════════ PACOTES E MENSALIDADES ═══════════════ */
function renderPackages() {
  const members = PLANS.reduce((s, p) => s + athletesOnPlan(p.id).length, 0), sum = PLANS.reduce((s, p) => s + p.value * athletesOnPlan(p.id).length, 0);
  return `${viewBanner('packages')}
  <div class="page-head"><div><div class="eyebrow">Oferta & organização</div><h1>Pacotes e mensalidades</h1><p>Pacotes por núcleo, vinculados às equipes. Reajustes mostram o impacto antes da confirmação.</p></div>
    <div class="head-actions"><button class="btn primary" data-act="pkg-new" data-edit>${icon('plus')} Criar pacote</button></div></div>
  <div class="grid g4 mb">${[['Pacotes disponíveis', PLANS.length, `Em ${NUCLEI.length} núcleos`, 'layers'], ['Equipes com pacote', new Set(PLANS.flatMap(p => p.teams)).size, 'Oferta organizada por local', 'pin'], ['Atletas nos pacotes', members, 'Somente cadastros ativos', 'users'], ['Valor mensal previsto', money(sum), 'Estimativa de tabela · não é recebido', 'trend']].map(([l, v, s, i]) => kpiCard([l, v, s, '', i])).join('')}</div>
  <section class="panel">
    <div class="tabs">${[{ id: 'all', name: 'Todos os núcleos' }, ...NUCLEI].map(n => `<button class="${S.pk.n === n.id ? 'on' : ''}" data-act="pkg-n" data-n="${n.id}">${esc(n.name)} <span class="pill">${n.id === 'all' ? PLANS.length : PLANS.filter(p => p.n === n.id).length}</span></button>`).join('')}</div>
    <div class="toolbar"><div class="search">${icon('search')}<input class="input" id="pkQ" type="search" placeholder="Buscar pacote ou equipe..." value="${esc(S.pk.q)}" aria-label="Buscar pacote"></div>
      <select class="select" id="pkFreq" aria-label="Frequência"><option value="all">Todas as frequências</option>${[1, 2, 3, 4, 5].map(d => `<option value="${d}" ${S.pk.freq === String(d) ? 'selected' : ''}>${d}x por semana</option>`).join('')}</select></div>
    <div id="pkTable">${packagesTable()}</div>
  </section>`;
}
function packagesTable() {
  const list = PLANS.filter(p => (S.pk.n === 'all' || p.n === S.pk.n) && (S.pk.freq === 'all' || p.days === Number(S.pk.freq)) && (planLabel(p) + ' ' + nucleusOf(p.n).name + ' ' + p.teams.map(t => teamOf(t)?.name).join(' ')).toLowerCase().includes(S.pk.q.toLowerCase()))
    .sort((a, b) => a.n.localeCompare(b.n) || a.days - b.days || a.value - b.value);
  if (!list.length) return emptyState('Nenhum pacote encontrado', 'Tente outra busca ou frequência.');
  return `<div class="table-wrap"><table><thead><tr><th>Pacote</th><th class="num">Mensalidade</th><th class="num">Matrícula</th><th>Núcleo / equipes</th><th class="num">Atletas ativos</th><th></th></tr></thead><tbody>${list.map(p => `<tr>
    <td><strong>${p.days}x por semana</strong><div class="hint">${esc(planLabel(p))}</div></td><td class="num"><strong>${money(p.value)}</strong><span class="hint"> /mês</span></td><td class="num">${p.fee ? money(p.fee) : '<span class="muted">Sem taxa</span>'}</td>
    <td>${nTag(p.n)}<div class="hint">${p.teams.map(t => esc(teamOf(t)?.name)).join(' · ') || 'Nenhuma equipe'}</div></td><td class="num">${athletesOnPlan(p.id).length}</td>
    <td style="text-align:right"><button class="btn sm" data-act="pkg-open" data-id="${p.id}">Gerenciar</button></td></tr>`).join('')}</tbody></table></div><div class="panel-foot"><span>${list.length} de ${PLANS.length} pacotes</span><span>O rótulo padronizado é o que aparece no cadastro do atleta.</span></div>`;
}
const teamChecks = (n, sel, pid) => TEAMS.filter(t => t.n === n).map(t => { const cnt = pid ? ATHLETES.filter(a => a.active && a.planId === pid && a.teamId === t.id).length : 0; return `<label class="check fieldset" style="padding:10px 12px;margin-bottom:6px"><input type="checkbox" name="pkTeam" value="${t.id}" ${sel.includes(t.id) ? 'checked' : ''}><span style="flex:1">${esc(t.name)}</span>${cnt ? `<span class="hint">${cnt} atletas</span>` : ''}</label>`; }).join('');
function packageDrawer(id) {
  const p = PLANS.find(x => x.id === id), cnt = athletesOnPlan(id).length, ed = canEdit('packages');
  openDialog(dHead('Detalhes do pacote', `${p.days}x por semana`) + `<div class="d-body">${nTag(p.n)}
    <div style="font-size:30px;font-weight:700;letter-spacing:-1px;margin:12px 0 0">${money(p.value)} <span class="muted" style="font-size:13px;font-weight:400">/ mês</span></div><p class="muted small" style="margin:2px 0 12px">${p.fee ? 'Taxa de matrícula de ' + money(p.fee) : 'Sem taxa de matrícula'}</p>
    <button class="btn primary" data-act="pkg-reprice" data-id="${id}" data-edit>${icon('trend')} Simular reajuste</button>
    <div class="kv"><div><small>Atletas ativos</small><strong>${cnt}</strong></div><div><small>Total mensal previsto</small><strong>${money(cnt * p.value)}</strong></div></div>
    <h3>Equipes vinculadas</h3><p class="hint">Equipes com atletas ativos neste pacote não podem ser desvinculadas.</p>
    <fieldset class="plain" id="pkLinks" ${ed ? '' : 'disabled'}>${teamChecks(p.n, p.teams, id)}</fieldset><div class="err" id="pkErr" role="alert"></div>
    <div class="preview mt"><small>Rótulo padronizado</small>${esc(planLabel(p))}</div>
    ${p.prev ? `<div class="timeline mt"><div>Reajuste confirmado<small>Valor anterior: ${money(p.prev)}</small></div></div>` : ''}</div>
    <div class="d-foot"><button class="btn" data-act="close-dialog">Fechar</button>${ed ? `<button class="btn primary" data-act="pkg-links" data-id="${id}">Salvar vínculos</button>` : ''}</div>`, 'drawer');
}
function savePackageLinks(id) {
  const p = PLANS.find(x => x.id === id), ids = $$('#pkLinks input:checked').map(x => x.value);
  const locked = p.teams.filter(t => !ids.includes(t) && ATHLETES.some(a => a.active && a.planId === id && a.teamId === t));
  if (!ids.length || locked.length) { $('#pkErr').textContent = 'Mantenha ao menos uma equipe e os vínculos com atletas ativos.'; return; }
  p.teams = ids; closeDialog(); render(); toast('Vínculos atualizados.');
}
function packageNew() {
  const n0 = S.pk.n !== 'all' ? S.pk.n : NUCLEI[0].id;
  openDialog(dHead('Nova oferta', 'Criar pacote') + `<div class="d-body">
    <div class="field"><label for="pnN">Núcleo</label><select class="select" id="pnN">${NUCLEI.map(n => `<option value="${n.id}" ${n.id === n0 ? 'selected' : ''}>Núcleo ${esc(n.name)}</option>`).join('')}</select></div>
    <div class="row3"><div class="field"><label for="pnDays">Treinos/semana</label><select class="select" id="pnDays">${[1, 2, 3, 4, 5].map(d => `<option ${d === 2 ? 'selected' : ''}>${d}</option>`).join('')}</select></div><div class="field"><label for="pnVal">Mensalidade (R$)</label><input class="input" id="pnVal" type="number" min="0.01" step="0.01" placeholder="159,90"></div><div class="field"><label for="pnFee">Matrícula (R$)</label><input class="input" id="pnFee" type="number" min="0" step="0.01" value="0"></div></div>
    <div class="preview" id="pnPrev"><small>Prévia do pacote</small>Preencha o valor da mensalidade.</div>
    <h3 class="mt">Disponibilizar para estas equipes</h3><div id="pnTeams" class="mt">${teamChecks(n0, [])}</div><div class="err" id="pnErr" role="alert"></div></div>
    <div class="d-foot"><button class="btn" data-act="close-dialog">Cancelar</button><button class="btn primary" data-act="pkg-create">Criar pacote</button></div>`, 'drawer');
  const prev = () => { const v = centsInput($('#pnVal').value), f = centsInput($('#pnFee').value || 0); $('#pnPrev').innerHTML = '<small>Prévia do pacote</small>' + (v > 0 && f >= 0 ? esc(planLabel({ days: Number($('#pnDays').value), value: v, fee: f })) : 'Preencha valores válidos.'); };
  ['pnVal', 'pnFee', 'pnDays'].forEach(i => $('#' + i).addEventListener('input', prev));
  $('#pnN').addEventListener('change', e => { $('#pnTeams').innerHTML = teamChecks(e.target.value, []); });
}
function packageCreate() {
  const n = $('#pnN').value, days = Number($('#pnDays').value), value = centsInput($('#pnVal').value), fee = centsInput($('#pnFee').value || 0), teams = $$('#pnTeams input:checked').map(x => x.value), e = $('#pnErr');
  if (!(value > 0) || !(fee >= 0)) return e.textContent = 'Informe mensalidade positiva e matrícula (0 = sem taxa).';
  if (!teams.length) return e.textContent = 'Selecione ao menos uma equipe.';
  if (PLANS.some(p => p.n === n && p.days === days && p.value === value && p.fee === fee)) return e.textContent = 'Este pacote já existe no núcleo. Gerencie seus vínculos no catálogo.';
  PLANS.push({ id: Math.max(...PLANS.map(p => p.id)) + 1, n, days, value, fee, teams }); S.pk.n = n; closeDialog(); render(); toast('Pacote criado e vinculado.');
}
const pkSteps = s => `<div class="stepper">${['Novo valor', 'Revisar impacto', 'Concluído'].map((l, i) => `<span class="${s === i + 1 ? 'cur' : s > i + 1 ? 'done' : ''}"><b>${s > i + 1 ? '✓' : i + 1}</b>${l}</span>`).join('<i></i>')}</div>`;
function packageReprice(id) {
  const p = PLANS.find(x => x.id === id);
  openDialog(dHead('Reajuste de mensalidade', 'Novo valor, decisão consciente') + `<div class="d-body">${pkSteps(1)}${nTag(p.n)}<div class="preview mt"><small>Pacote atual</small>${esc(planLabel(p))}</div>
    <div class="field mt"><label for="rpVal">Nova mensalidade (R$)</label><input class="input" id="rpVal" type="number" step="0.01" min="0.01" value="${(p.value / 100).toFixed(2)}" autofocus><span class="hint">A taxa de matrícula permanece ${p.fee ? money(p.fee) : 'sem cobrança'}.</span></div>
    <p class="hint">O novo valor é aplicado ao pacote nas equipes vinculadas e aos ${athletesOnPlan(id).length} atletas ativos. Inativos e outros núcleos não são alterados.</p><div class="err" id="rpErr" role="alert"></div></div>
    <div class="d-foot"><button class="btn" data-act="close-dialog">Cancelar</button><button class="btn primary" data-act="pkg-review" data-id="${id}">Revisar impacto ${icon('arrow')}</button></div>`);
}
function packageReview(id) {
  const p = PLANS.find(x => x.id === id), v = centsInput($('#rpVal').value);
  if (!(v > 0) || v === p.value) return $('#rpErr').textContent = 'Informe um valor positivo e diferente do atual.';
  if (PLANS.some(x => x.id !== id && x.n === p.n && x.days === p.days && x.value === v && x.fee === p.fee)) return $('#rpErr').textContent = 'Já existe um pacote com essas condições neste núcleo.';
  const count = athletesOnPlan(id).length, delta = v - p.value, sg = x => (x >= 0 ? '+ ' : '− ') + money(Math.abs(x));
  openDialog(dHead('Confira antes de confirmar', 'Revisar o reajuste') + `<div class="d-body">${pkSteps(2)}${nTag(p.n)} <b>${p.days}x por semana</b> · ${p.teams.length} equipes
    <div class="row2 mt"><div class="preview"><small>Atual</small><strong style="font-size:22px">${money(p.value)}</strong></div><div class="preview"><small>Nova</small><strong style="font-size:22px;color:var(--brand-ink)">${money(v)}</strong></div></div>
    <div class="impact">${[['Variação por atleta', `${sg(delta)} (${(delta / p.value * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)`], ['Atletas ativos afetados', count], ['Total mensal anterior', money(p.value * count)], ['Novo total mensal previsto', money(v * count)], ['Impacto mensal estimado', sg(delta * count)]].map(([k, x], i) => `<div class="stat-line" ${i === 4 ? 'style="font-weight:700"' : ''}><span>${k}</span><b>${x}</b></div>`).join('')}</div>
    <p class="hint">Estimativa de tabela, sem descontos ou inadimplência. Cobranças já emitidas no Tecnofit não são alteradas por este painel.</p>
    <label class="check"><input type="checkbox" id="rpAck"> Conferi o núcleo, as equipes e o impacto.</label></div>
    <div class="d-foot"><button class="btn" data-act="pkg-reprice" data-id="${id}">Voltar</button><button class="btn primary" id="rpGo" data-act="pkg-commit" data-id="${id}" data-v="${v}" disabled>Confirmar reajuste de ${count} atletas</button></div>`);
  $('#rpAck').addEventListener('change', e => { $('#rpGo').disabled = !e.target.checked; });
}
function packageCommit(id, v) {
  const p = PLANS.find(x => x.id === id), before = p.value, count = athletesOnPlan(id).length;
  p.prev = before; p.value = v; athletesOnPlan(id).forEach(a => { a.plan = planLabel(p); });
  render();
  openDialog(dHead('Recibo', 'Reajuste concluído') + `<div class="d-body" style="text-align:center">${pkSteps(3)}<div style="width:54px;height:54px;border-radius:50%;background:var(--ok-soft);color:var(--ok);display:grid;place-items:center;margin:4px auto 12px">${icon('check')}</div>
    <h3 style="font-size:18px">Oferta atualizada</h3><p class="muted">${count} atletas ativos · Núcleo ${esc(nucleusOf(p.n).name)}<br>${money(before)} → <b>${money(v)}</b></p><div class="preview" style="text-align:left"><small>Novo rótulo</small>${esc(planLabel(p))}</div></div>
    <div class="d-foot"><button class="btn primary" data-act="close-dialog">Voltar ao catálogo</button></div>`);
}

/* ═══════════════ CHATBOT FEEDER ═══════════════ */
function nextDatesFor(t, n = FEEDER.datesCount) {
  const out = []; let d = new Date(TODAY);
  for (let k = 0; k < 90 && out.length < n; k++, d = addDays(d, 1)) {
    const s = t.schedule.find(x => x.day === d.getDay()); if (!s || t.blocked.includes(ymd(d)) || t.cancelled?.includes(ymd(d))) continue;
    const at = new Date(d); const [h, m] = s.start.split(':').map(Number); at.setHours(h, m);
    if ((at - NOW) / 36e5 < FEEDER.minHoursAhead) continue;
    const hd = x => x.replace(':', 'h').replace(/^0(\d)/, '$1').replace(/h00$/, 'h');
    out.push(`${d.getDate()} de ${MONTHS[d.getMonth()]}, ${hd(s.start)} às ${hd(s.end)}`);
  }
  return out;
}
const feederTeams = () => TEAMS.filter(t => t.active && t.available).sort((a, b) => a.name.localeCompare(b.name));
function quadroText(highlight = false) {
  const k = s => highlight ? `<span class="hl">${s}</span>` : s;
  return feederTeams().map(t => {
    const c = coachOf(t.coach), n = nucleusOf(t.n), dates = nextDatesFor(t);
    return [`${k('EQUIPE:')} ${esc(t.name)}`, `${k('DESCRIÇÃO:')} ${esc(t.desc)}`,
      FEEDER.includeAge ? `${k('FAIXA ETÁRIA:')} ${ageRange(t)}` : null, FEEDER.includeGender ? `${k('GÊNERO:')} ${genderLabel(t.gender)}` : null,
      `${k('LOCAL:')} ${esc(n.address)}`, `${k('TÉCNICO:')} ${c ? esc(c.name) : ''}${FEEDER.includeCoachPhone ? ` | ${k('TELEFONE:')} ${c ? c.phone : ''}` : ''}`,
      `${k('HORÁRIOS:')} ${t.schedule.map(s => `${DOW_FULL[s.day]} ${s.start} às ${s.end}`).join(' / ')}`, `${k('DATAS DISPONÍVEIS:')} ${dates.length ? dates.join(' / ') : 'A definir'}`, '---'].filter(x => x != null).join('\n');
  }).join('\n') || 'Nenhuma equipe cadastrada.';
}
function renderFeeder() {
  const vis = feederTeams(), hidden = TEAMS.filter(t => !(t.active && t.available)), warns = vis.reduce((s, t) => s + teamWarnings(t).filter(w => w !== 'Sem pacotes').length, 0);
  const mins = null;
  const tabs = [['teams', 'Equipes no quadro', vis.length], ['rules', 'Instruções do assistente', FEEDER.rules.format.length + FEEDER.rules.absolute.length + FEEDER.rules.steps.length], ['text', 'Texto enviado', null], ['sim', 'Simulador', null]];
  let body = '';
  if (S.fd.tab === 'teams') body = `<div class="panel-pad"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap"><p class="muted small" style="margin:0">Clique em uma equipe para ver campo a campo o que é enviado e de onde vem.</p><button class="btn sm" data-act="fd-expand">${S.fd.open.size >= vis.length ? 'Recolher todas' : 'Expandir todas'}</button></div>
      ${vis.map(t => {
        const c = coachOf(t.coach), n = nucleusOf(t.n), dates = nextDatesFor(t);
        const row = (k, v, source, act, off = false) => `<div class="inj ${off ? 'off' : ''}"><span class="k">${k}</span><div class="v ${!v ? 'missing' : ''}">${v || 'vazio — o assistente não terá esta informação'}<div class="hint">${source}</div></div>${act || '<span></span>'}</div>`;
        return `<details class="panel fd-team" style="margin-bottom:10px;box-shadow:none" ${S.fd.open.has(t.id) ? 'open' : ''} data-team="${t.id}"><summary class="panel-head" style="cursor:pointer;border-bottom:0"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${icon('right', 'i chev')}<h2>${esc(t.name)}</h2>${nTag(t.n)}${teamWarnings(t).filter(w => w !== 'Sem pacotes').map(w => `<span class="tag st-warn nodot">${w}</span>`).join('')}<span class="hint">${t.schedule.map(schedText).join(' · ')} · próximas: ${dates.slice(0, 2).map(d => d.split(',')[0]).join(', ') || 'a definir'}</span></div>
          <label class="check small" title="Disponível para agendamento"><span class="toggle"><input type="checkbox" data-act="fd-visible" data-id="${t.id}" checked data-edit><span></span></span> Visível</label></summary>
          <div class="panel-pad" style="padding-top:0;padding-bottom:6px;border-top:1px solid var(--line-2)">
          ${row('EQUIPE', esc(t.name), 'Equipes › Dados › Nome', `<button class="btn sm ghost" data-act="fd-goto-team" data-id="${t.id}" data-tab="dados">${icon('edit')} Editar</button>`)}
          ${row('DESCRIÇÃO', esc(t.desc), 'Equipes › Dados › Descrição', `<button class="btn sm ghost" data-act="fd-desc" data-id="${t.id}" data-edit>${icon('edit')} Editar</button>`)}
          ${row('FAIXA ETÁRIA', ageRange(t), FEEDER.includeAge ? 'Equipes › Dados · enviado' : 'Não enviado hoje — recomendado ativar em Instruções', `<button class="btn sm ghost" data-act="fd-goto-team" data-id="${t.id}" data-tab="dados">${icon('edit')} Editar</button>`, !FEEDER.includeAge)}
          ${row('GÊNERO', genderLabel(t.gender), FEEDER.includeGender ? 'Equipes › Dados · enviado' : 'Não enviado hoje', '', !FEEDER.includeGender)}
          ${row('LOCAL', esc(n.address), `Núcleo ${esc(n.name)} › Endereço`, `<button class="btn sm ghost" data-act="nucleus-edit" data-id="${n.id}" data-need="teams">${icon('edit')} Editar</button>`)}
          ${row('TÉCNICO', c ? `${esc(c.name)}${FEEDER.includeCoachPhone ? ' | ' + fmtPhone(c.phone) : ''}` : '', 'Equipes › Dados › Técnico responsável', `<button class="btn sm ghost" data-act="fd-goto-team" data-id="${t.id}" data-tab="dados">${icon('edit')} Editar</button>`)}
          ${row('HORÁRIOS', t.schedule.map(s => `${DOW_FULL[s.day]} ${s.start} às ${s.end}`).join(' / '), 'Equipes › Horários', `<button class="btn sm ghost" data-act="fd-goto-team" data-id="${t.id}" data-tab="horarios">${icon('edit')} Editar</button>`)}
          ${row('DATAS DISPONÍVEIS', dates.join(' / ') || '', `Calculado: próximas ${FEEDER.datesCount} datas, com ${FEEDER.minHoursAhead} h de antecedência, sem datas indisponíveis`, `<button class="btn sm ghost" data-act="fd-goto-team" data-id="${t.id}" data-tab="datas">${icon('calendar')} Bloquear datas</button>`)}
          </div></details>`;
      }).join('')}
      ${hidden.length ? `<h3 class="mt2">Fora do assistente <span class="muted small">(${hidden.length})</span></h3><ul class="list" style="margin:6px -20px 0">${hidden.map(t => `<li>${nTag(t.n, '')}<div style="flex:1"><strong>${esc(t.name)}</strong><div class="hint">${!t.active ? 'Equipe inativa' : 'Disponível para agendamento desligado'}${teamWarnings(t).length ? ' · ' + teamWarnings(t).join(', ') : ''}</div></div>${t.active ? `<label class="check small"><span class="toggle"><input type="checkbox" data-act="fd-visible" data-id="${t.id}" data-edit><span></span></span> Mostrar</label>` : ''}</li>`).join('')}</ul>` : ''}
    </div>`;
  if (S.fd.tab === 'rules') {
    const grp = (k, title, sub) => `<section class="panel" style="box-shadow:none;margin-bottom:14px"><div class="panel-head"><div><h2>${title}</h2><div class="sub">${sub}</div></div><button class="btn sm" data-act="fd-rule-add" data-g="${k}" data-edit>${icon('plus')} Adicionar</button></div><div class="panel-pad" style="padding-top:4px;padding-bottom:4px">${FEEDER.rules[k].map((r, i) => `<div class="rule"><span class="n">${k === 'steps' ? i + 1 : '•'}</span><p>${esc(r)}</p><div class="rule-actions"><button class="btn sm ghost sq" data-act="fd-rule-edit" data-g="${k}" data-i="${i}" data-edit aria-label="Editar regra">${icon('edit')}</button><button class="btn sm ghost sq" data-act="fd-rule-del" data-g="${k}" data-i="${i}" data-edit aria-label="Remover regra">${icon('trash')}</button></div></div>`).join('')}</div></section>`;
    body = `<div class="panel-pad"><div class="banner warn">${icon('alert')}<div><b>Regras ainda não conectadas ao Apps Script.</b> Os controles abaixo são apenas uma prévia e não alteram o chatbot em produção.</div></div>
      <div class="split" style="grid-template-columns:minmax(0,1fr) 300px"><div>${grp('absolute', 'Diretrizes absolutas', 'Regras que o assistente nunca pode quebrar')}${grp('steps', 'Passo a passo do agendamento', 'Ordem obrigatória da conversa para novos agendamentos')}${grp('format', 'Formatação das respostas', 'Como o texto aparece para o usuário')}</div>
      <aside><section class="panel" style="box-shadow:none"><div class="panel-head"><h2>Parâmetros do quadro</h2></div><div class="panel-pad"><fieldset class="plain" ${canEdit('feeder') ? '' : 'disabled'}>
        <div class="field"><label for="fdDates">Datas oferecidas por equipe</label><select class="select" id="fdDates">${[2, 3, 4, 5, 6].map(n => `<option ${FEEDER.datesCount === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="field"><label for="fdAhead">Antecedência mínima</label><select class="select" id="fdAhead">${[6, 12, 24, 48].map(n => `<option value="${n}" ${FEEDER.minHoursAhead === n ? 'selected' : ''}>${n} horas</option>`).join('')}</select></div>
        <div class="field"><label for="fdCache">Atualização do quadro (cache)</label><select class="select" id="fdCache">${[5, 15, 30, 60].map(n => `<option value="${n}" ${FEEDER.cacheMin === n ? 'selected' : ''}>a cada ${n} min</option>`).join('')}</select></div>
        <label class="check mb"><input type="checkbox" id="fdAge" ${FEEDER.includeAge ? 'checked' : ''}> Enviar faixa etária <span class="src proposta">recomendado</span></label>
        <label class="check mb"><input type="checkbox" id="fdGender" ${FEEDER.includeGender ? 'checked' : ''}> Enviar gênero da equipe</label>
        <label class="check mb"><input type="checkbox" id="fdPhone" ${FEEDER.includeCoachPhone ? 'checked' : ''}> Enviar telefone do técnico</label>
        <p class="hint">O assistente escolhe turmas pela idade, mas hoje a faixa etária não vai no quadro — ele deduz pela descrição.</p></fieldset></div></section></aside></div></div>`;
  }
  if (S.fd.tab === 'text') body = `<div class="panel-pad"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap"><p class="muted small" style="margin:0">Exatamente o bloco “QUADRO OFICIAL DE EQUIPES E DATAS” que o assistente recebe junto com as instruções. Atualiza conforme você edita equipes e núcleos.</p><button class="btn sm" data-act="fd-copy">${icon('copy')} Copiar texto</button></div>
    <pre class="code">${esc('Você é o Assistente Virtual da Apollo Voleibol. Você realiza os agendamentos AQUI e AGORA.\nUsuário: {nome} | Data de hoje: ' + fmtDate(TODAY) + '\n\n🚨 DIRETRIZES ABSOLUTAS:\n' + FEEDER.rules.absolute.map((r, i) => `${i + 1}. ${r}`).join('\n') + '\n\n📋 MÁQUINA DE PASSOS:\n' + FEEDER.rules.steps.map((r, i) => `PASSO ${i + 1}: ${r}`).join('\n') + '\n\n🏐 QUADRO OFICIAL DE EQUIPES E DATAS:\n')}${quadroText(true)}</pre></div>`;
  if (S.fd.tab === 'sim') {
    const age = S.fd.simAge === '' ? null : Number(S.fd.simAge), g = S.fd.simGender;
    const res = age == null ? [] : feederTeams().filter(t => (t.ageMin === '' || t.ageMin == null || age >= t.ageMin) && (t.ageMax == null || age <= t.ageMax) && (!g || t.gender === 'Misto' || t.gender === g));
    body = `<div class="panel-pad"><p class="muted small" style="margin-top:0">Teste quais turmas o assistente deveria oferecer para um perfil, com base nos dados atuais.</p>
      <div class="toolbar" style="padding:0 0 14px;border:0"><div class="field" style="margin:0"><label for="simAge">Idade</label><input class="input" id="simAge" type="number" min="3" max="99" value="${esc(S.fd.simAge)}" placeholder="Ex.: 12" style="width:120px"></div><div class="field" style="margin:0"><label for="simGender">Gênero</label><select class="select" id="simGender"><option value="">Qualquer</option><option value="F" ${g === 'F' ? 'selected' : ''}>Feminino</option><option value="M" ${g === 'M' ? 'selected' : ''}>Masculino</option></select></div></div>
      ${age == null ? '<div class="preview muted small">Informe uma idade para simular.</div>' : res.length ? `<div class="grid g2">${res.map(t => `<div class="panel panel-pad" style="box-shadow:none"><div style="display:flex;justify-content:space-between;gap:8px"><h3>👉 ${esc(t.name)}</h3>${nTag(t.n, '')}</div><div class="hint">${ageRange(t)} · ${genderLabel(t.gender)} · ${t.schedule.map(schedText).join(', ')}</div><div class="small mt"><b>Datas que seriam oferecidas:</b><br>${nextDatesFor(t).map(d => '👉 ' + d).join('<br>') || 'A definir'}</div></div>`).join('')}</div>` : `<div class="banner warn">${icon('alert')}<span>Nenhuma turma visível atende a esse perfil. O assistente deveria informar que não há turma disponível no momento.</span></div>`}
      <div class="banner note mt">${icon('info')}<span class="small">Com a faixa etária ${FEEDER.includeAge ? 'sendo enviada' : 'ainda não enviada'} no quadro, ${FEEDER.includeAge ? 'o assistente segue exatamente este resultado.' : 'o assistente pode divergir desta simulação — ative “Enviar faixa etária” em Instruções.'}</span></div></div>`;
  }
  return `${viewBanner('feeder')}
  <div class="page-head"><div><div class="eyebrow">Assistente de IA · agendamentos</div><h1>Chatbot Feeder</h1><p>Veja exatamente quais dados alimentam o assistente de agendamentos, de onde cada um vem, e corrija na origem.</p></div>
    <div class="head-actions"><button class="btn" data-act="fd-sync" data-edit>${icon('refresh')} Atualizar quadro agora</button></div></div>
  <div class="grid g4 mb">
    ${kpiCard(['Equipes visíveis', `${vis.length} <span class="muted" style="font-size:14px;font-weight:500">de ${TEAMS.length}</span>`, 'ativas e disponíveis para agendamento', '', 'bot'])}
    ${kpiCard(['Avisos de dados', warns, 'campos vazios em equipes visíveis', '', 'alert'])}
    ${kpiCard(['Sincronização', 'Pendente', 'Prévia local; confirme os dados no chatbot em produção', '', 'clock'])}
    ${kpiCard(['Datas oferecidas', vis.reduce((s, t) => s + nextDatesFor(t).length, 0), `${FEEDER.datesCount} por equipe · antecedência ${FEEDER.minHoursAhead} h`, '', 'calendar'])}
  </div>
  <section class="panel mb"><div class="panel-head"><div><h2>Fluxo previsto do assistente</h2><div class="sub">A integração com o Apps Script precisa ser validada antes de ativar regras e sincronização</div></div></div>
    <div class="panel-pad"><div class="flow">
      <div class="step"><b>1. Fontes no painel</b>Dados de cadastro<ul><li>Equipes (dados, horários)</li><li>Núcleos (endereço)</li><li>Datas indisponíveis</li><li>Técnico responsável</li></ul></div><div class="arrow">${icon('arrow')}</div>
      <div class="step"><b>2. Quadro oficial</b>Texto montado por equipe visível, com as próximas datas calculadas<ul><li>Atualização a cada ${FEEDER.cacheMin} min</li></ul></div><div class="arrow">${icon('arrow')}</div>
      <div class="step"><b>3. Instruções</b>Diretrizes, passo a passo e formatação<ul><li>Nunca informa preços</li><li>Pergunta idade para menores</li></ul></div><div class="arrow">${icon('arrow')}</div>
      <div class="step"><b>4. Conversa</b>O assistente agenda e grava em Agendamentos<ul><li>Aparece no painel e no Manager</li></ul></div>
    </div>
    <div class="banner note mt" style="margin-bottom:0">${icon('shield')}<span class="small"><b>Nunca é enviado ao assistente:</b> valores de mensalidade, dados de atletas (CPF, endereço, responsáveis), informações financeiras e de pagamento de técnicos.</span></div></div></section>
  <section class="panel"><div class="tabs">${tabs.map(([k, l, c]) => `<button class="${S.fd.tab === k ? 'on' : ''}" data-act="fd-tab" data-tab="${k}">${l}${c != null ? ` <span class="pill">${c}</span>` : ''}</button>`).join('')}</div>${body}</section>
  <section class="panel mt"><div class="panel-head"><h2>Últimas alterações que afetam o assistente</h2></div><ul class="list">${FEEDER.history.slice(0, 5).map(h => `<li><span class="time-pill">${h.at.slice(8)}/${h.at.slice(5, 7)}</span><span style="flex:1">${esc(h.what)}</span><span class="muted small">${esc(h.who)}</span></li>`).join('')}</ul></section>`;
}
function feederDescEdit(id) {
  const t = teamOf(id);
  openDialog(dHead('Descrição enviada ao assistente', esc(t.name)) + `<div class="d-body"><div class="field"><label for="fdDescTxt">Descrição</label><textarea class="input" id="fdDescTxt" rows="5" autofocus>${esc(t.desc)}</textarea><span class="hint">Dica: diga para quem é a turma, o nível e o objetivo. Não inclua preços — o assistente não deve falar de valores.</span></div>
    <div class="preview"><small>Como aparece no quadro</small><span style="font-family:var(--mono);font-size:12px">DESCRIÇÃO: <span id="fdDescPrev">${esc(t.desc)}</span></span></div></div>
    <div class="d-foot"><button class="btn" data-act="close-dialog">Cancelar</button><button class="btn primary" data-act="fd-desc-save" data-id="${id}">Salvar descrição</button></div>`);
  $('#fdDescTxt').addEventListener('input', e => { $('#fdDescPrev').textContent = e.target.value; });
}
function feederRuleEdit(g, i) {
  const cur = i == null ? '' : FEEDER.rules[g][i];
  openDialog(dHead('Instruções do assistente', i == null ? 'Nova regra' : 'Editar regra') + `<div class="d-body"><div class="field"><label for="fdRuleTxt">Texto da regra</label><textarea class="input" id="fdRuleTxt" rows="4" autofocus>${esc(cur)}</textarea><span class="hint">Escreva de forma direta e imperativa. Mudanças entram em vigor na próxima atualização do quadro.</span></div></div>
    <div class="d-foot"><button class="btn" data-act="close-dialog">Cancelar</button><button class="btn primary" data-act="fd-rule-save" data-g="${g}" data-i="${i ?? ''}">Salvar</button></div>`);
}
