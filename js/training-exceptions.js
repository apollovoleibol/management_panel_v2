/* Exceções de treino (migração 048): mudança de horário de um dia, treino extra
   (reposição em outro dia), substituto, cancelamento com motivo e reposição pendente.
   Mesma regra do banco (private.v2_trainings) e do Manager App: a grade semanal é a
   base e cada data pode ter exceções. Os técnicos registram tudo pelo app; aqui a
   administração vê na agenda, cancela com motivo, dispensa reposições e confere a Folha. */
'use strict';

const TRAINING_REASONS = { court: 'Quadra indisponível', weather: 'Clima', holiday: 'Feriado ou evento', other: 'Outro' };
let TRAINING_SUBS = new Map(); // `${teamId}|${data}` → id do técnico substituto
const trDM = d => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '';
const trSpan = s => toMin(s.end) - toMin(s.start);

// Treinos efetivos da equipe numa data: a grade do dia (com a mudança, se houver) + o treino extra
function trainingsOn(team, key) {
  const dow = parseYmd(key).getDay(), changes = team.changes || [];
  const change = changes.find(c => c.date === key && c.kind === 'change');
  const out = (team.schedule || []).filter(s => s.day === dow).map(s => change
    ? { day: s.day, start: change.start, end: change.end, source: 'change', makeupFor: change.makeupFor, gradeStart: s.start, gradeEnd: s.end }
    : { ...s, source: 'grade' });
  changes.filter(c => c.date === key && c.kind === 'extra')
    .forEach(c => out.push({ day: dow, start: c.start, end: c.end, source: 'extra', makeupFor: c.makeupFor }));
  return out.sort((a, b) => toMin(a.start) - toMin(b.start));
}

// Etiqueta curta: "reposição de 06/11", "treino extra", "+30 min", "horário alterado"
function trainingExTag(s) {
  if (!s) return '';
  if (s.source === 'extra') return s.makeupFor ? `reposição de ${trDM(s.makeupFor)}` : 'treino extra';
  if (s.source === 'change') {
    const plus = trSpan(s) - (s.gradeStart && s.gradeEnd ? toMin(s.gradeEnd) - toMin(s.gradeStart) : trSpan(s));
    if (s.makeupFor) return `+${Math.max(0, plus)} min · reposição de ${trDM(s.makeupFor)}`;
    return plus > 0 ? `+${plus} min` : 'horário alterado';
  }
  return '';
}

const trainingSubId = (teamId, key) => TRAINING_SUBS.get(`${teamId}|${key}`) || null;
function trainingPersonName(id) {
  return coachOf(id)?.name || USERS.find(u => u.id === id)?.name || 'outro técnico';
}
function trainingCancelText(team, key) {
  const c = team.cancelInfo?.[key];
  return c?.reason ? TRAINING_REASONS[c.reason] || 'Outro' : '';
}

// Minutos de reposição já marcados para um cancelamento (reposições em dia cancelado não contam)
function makeupCovered(team, date) {
  return (team.changes || []).filter(x => x.makeupFor === date && !team.cancelled.includes(x.date)).reduce((n, x) => {
    if (x.kind === 'extra') return n + trSpan(x);
    const grade = (team.schedule || []).filter(s => s.day === parseYmd(x.date).getDay()).reduce((k, s) => k + trSpan(s), 0);
    return n + Math.max(0, trSpan(x) - grade);
  }, 0);
}

// Reposições pendentes: cancelamento com reposição obrigatória, não dispensada e ainda sem minutos suficientes
function pendingMakeups(teamIds = myTeamIds()) {
  const out = [];
  TEAMS.filter(t => t.active && teamIds.includes(t.id)).forEach(t => Object.entries(t.cancelInfo || {}).forEach(([date, c]) => {
    if (!c.makeupRequired || c.waived || !(c.lost > 0)) return;
    const missing = c.lost - makeupCovered(t, date);
    if (missing > 0) out.push({ team: t, date, reason: c.reason, late: c.late, missing });
  }));
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
const canWaiveMakeup = () => !S.previewRole && (APOLLO_AUTH.access?.role === 'admin' || (APOLLO_AUTH.access?.role === 'coordination' && canEdit('teams')));

// Folha: etiquetas de um treino do app (substituto, reposição, extensão, horário alterado)
function trainingPayTags(coachId, teamId, date) {
  const team = teamOf(teamId);
  if (!team) return [];
  const tags = [], s = trainingsOn(team, date)[0], tag = trainingExTag(s);
  if (tag) tags.push(tag);
  const titular = team.coach;
  if (coachId && titular && coachId !== titular && !(LIVE.teamCoachIds?.get(teamId) || []).includes(coachId)) {
    tags.push(`substituto (titular: ${trainingPersonName(titular).split(' ')[0]})`);
  }
  return tags;
}

// ─── Cancelar com motivo (mesma função do app) ───
function trainingCancelForm(tid, date) {
  const t = teamOf(tid), s = trainingsOn(t, date)[0];
  const late = s ? new Date(`${date}T${s.start}:00`) - NOW < 864e5 : false;
  const tests = BOOKINGS.filter(b => b.teamId === tid && b.date.slice(0, 10) === date && !b.archived && b.status !== 'Cancelado').length;
  openDialog(dHead('Sinalizar que não haverá treino', esc(t.name), `${fmtDate(parseYmd(date))}${s ? ` · ${s.start}–${s.end}` : ''}`) + `<div class="d-body">
    <div class="field"><label for="tcReason">Motivo</label><select class="input" id="tcReason">${Object.entries(TRAINING_REASONS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
    <div class="field"><label for="tcNote">Observação <span class="muted">(as famílias veem só o motivo)</span></label><textarea class="input" id="tcNote" rows="2" maxlength="200"></textarea></div>
    ${late ? '<p class="hint">Cancelamento em cima da hora: a reposição fica pendente até o técnico remarcar o treino ou estender os próximos.</p>'
      : '<label class="check"><input type="checkbox" id="tcMakeup"> O treino será reposto (fica como reposição pendente)</label>'}
    ${tests ? `<p class="hint">Há ${tests} teste(s) marcado(s) neste treino que precisarão ser reagendados.</p>` : ''}
    <p class="hint">Esta alteração não muda as datas indisponíveis para novos testes.</p>
    <div class="err" id="tcErr" role="alert"></div>
  </div><div class="d-foot"><button class="btn" data-act="close-dialog">Voltar</button><button class="btn danger" data-act="training-cancel-save" data-team="${tid}" data-date="${date}">Sinalizar sem treino</button></div>`, 'drawer');
}

function makeupsDrawer() {
  const list = pendingMakeups(), can = canWaiveMakeup();
  openDialog(dHead('Reposições pendentes', `${list.length} treino(s) cancelado(s) sem reposição`, 'O técnico repõe pelo app (outro dia ou estendendo os próximos treinos). Dispense quando não houver reposição.') + `<div class="d-body">
    ${list.length ? `<ul class="list" style="margin:0 -24px">${list.map(m => `<li><span class="time-pill">${trDM(m.date)}</span><div style="flex:1;min-width:0"><strong>${esc(m.team.name)}</strong>
      <div class="hint">${esc(TRAINING_REASONS[m.reason] || 'Outro')}${m.late ? ' · em cima da hora' : ''} · faltam ${m.missing} min · ${esc(coachOf(m.team.coach)?.name || 'sem técnico')}</div></div>
      ${can ? `<button class="btn sm" data-act="makeup-waive" data-team="${m.team.id}" data-date="${m.date}">Dispensar</button>` : ''}</li>`).join('')}</ul>`
      : '<p class="muted">Nenhuma reposição pendente.</p>'}
  </div><div class="d-foot"><button class="btn" data-act="close-dialog">Fechar</button></div>`, 'drawer');
}

async function trainingExAction(a, el) {
  const team = teamOf(el.dataset.team), date = el.dataset.date;
  switch (a) {
    case 'training-cancel-open':
      if (!team || !canManageTraining(team)) return toast('Seu perfil não pode alterar este treino.', true);
      return trainingCancelForm(team.id, date);
    case 'training-cancel-save': {
      const reason = $('#tcReason').value, note = $('#tcNote').value.trim();
      if (reason === 'other' && !note) { $('#tcErr').textContent = 'Descreva o motivo.'; return; }
      el.disabled = true;
      const { error } = await financeDbClient().rpc('manager_cancel_training', {
        p_team: team.id, p_date: date, p_reason: reason, p_note: note || null, p_makeup: !!$('#tcMakeup')?.checked });
      el.disabled = false;
      if (error) { $('#tcErr').textContent = `Não foi possível cancelar: ${error.message}`; return; }
      closeDialog(); await liveReload();
      return toast('Treino marcado como não realizado.');
    }
    case 'training-restore': {
      if (!team || !canManageTraining(team)) return toast('Seu perfil não pode alterar este treino.', true);
      if (!(await confirmBox({ title: 'Restaurar o treino?', text: `${esc(team.name)} · ${fmtDate(parseYmd(date))}. As reposições ligadas a este cancelamento também serão removidas.`, ok: 'Restaurar treino' }))) return;
      const { error } = await financeDbClient().rpc('manager_restore_training', { p_team: team.id, p_date: date });
      if (error) return toast(`Não foi possível restaurar: ${error.message}`, true);
      closeDialog(); await liveReload();
      return toast('Treino restaurado na agenda.');
    }
    case 'makeup-waive': {
      if (!canWaiveMakeup()) return;
      if (!(await confirmBox({ title: 'Dispensar a reposição?', text: `${esc(team.name)} · treino de ${trDM(date)}. O treino continua cancelado e deixa de aparecer como pendente.`, ok: 'Dispensar' }))) return;
      const { error } = await financeDbClient().rpc('manager_waive_makeup', { p_team: team.id, p_date: date, p_waive: true });
      if (error) return toast(`Não foi possível dispensar: ${error.message}`, true);
      await liveReload(); makeupsDrawer();
      return toast('Reposição dispensada.');
    }
    case 'ov-makeups': return makeupsDrawer();
  }
}
