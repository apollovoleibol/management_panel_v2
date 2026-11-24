/* Huddle · Rematrículas 2027
   Lê public.reenroll_panel (migração 049): status, itens pendentes e decisão de cada atleta ativo.
   Técnicos veem só as próprias equipes; o atestado abre por link temporário do Storage privado. */
'use strict';

const REENROLL_URL = 'https://apollovoleibol.github.io/management_panel_v2/rematricula.html';
const RE = { rows: null, loading: false, error: '', loadedAt: 0, q: '', status: 'pendentes', team: '', missing: '', limit: 50 };
const RE_MISSING = { cadastro: 'Dados', endereco: 'Endereço', saude: 'Anamnese', equipe: 'Equipe 2027', termos: 'Termos' };
const RE_STATUS = {
  pendente: ['Não iniciada', 'st-pendente'],
  em_andamento: ['Em andamento', 'st-warn'],
  concluida: ['Concluída', 'st-ok'],
  declinada: ['Não vai continuar', 'st-bad'],
};
const RE_FIELD_LABEL = { full_name: 'nome', cpf: 'CPF', rg: 'RG', birth_date: 'nascimento', email: 'e-mail', phone: 'WhatsApp', emergency_contact: 'emergência', parent_name: 'nome do responsável', parent_cpf: 'CPF do responsável', parent_rg: 'RG do responsável', parent_phone: 'WhatsApp do responsável', parent_email: 'e-mail do responsável' };

async function reenrollLoad(force = false) {
  if (RE.loading || (!force && RE.rows && Date.now() - RE.loadedAt < 60000)) return;
  RE.loading = true; RE.error = '';
  try {
    const { data, error } = await financeDbClient().rpc('reenroll_panel', { p_season: 2027 });
    if (error) throw error;
    RE.rows = data || []; RE.loadedAt = Date.now();
  } catch (e) {
    RE.error = /reenroll_panel|function/i.test(e.message || '') ? 'A rematrícula ainda não foi ativada no banco de dados.' : (e.message || 'Não foi possível carregar as rematrículas.');
  } finally {
    RE.loading = false;
    if (S.page === 'rematricula') render();
  }
}

const reTeamName = id => (typeof teamOf === 'function' && teamOf(id)?.name) || '—';
const reIsPending = r => r.status === 'pendente' || r.status === 'em_andamento';
function reFiltered() {
  const q = RE.q.toLowerCase().trim(), qd = digits(q);
  return (RE.rows || []).filter(r =>
    (!RE.team || r.team_id === RE.team || r.team_2027_id === RE.team)
    && (RE.status === 'todos' || (RE.status === 'pendentes' ? reIsPending(r) : r.status === RE.status))
    && (!RE.missing || (r.status === 'em_andamento' && r.missing.includes(RE.missing)))
    && (!q || displayName(r.name).toLowerCase().includes(q) || String(r.contact_name || '').toLowerCase().includes(q) || (qd.length >= 4 && digits(r.contact_phone).includes(qd))));
}

function renderReenroll() {
  if (!RE.rows && !RE.loading && !RE.error) setTimeout(() => reenrollLoad(), 0);
  const head = `<div class="page-head"><div><div class="eyebrow">Operação · temporada 2027</div><h1>Rematrículas 2027</h1>
      <p>Quem já renovou, quem está no meio do caminho, o que falta para cada um e quem não vai continuar.</p></div>
    <div class="head-actions"><button class="btn" data-act="re-copy">${icon('copy')} Copiar link do formulário</button>
      <button class="btn" data-act="re-export" ${RE.rows?.length ? '' : 'disabled'}>${icon('download')} Exportar</button></div></div>`;
  if (RE.error) return `${head}<section class="panel">${emptyState('Rematrículas indisponíveis', esc(RE.error), `<button class="btn sm" data-act="re-reload">${icon('refresh')} Tentar de novo</button>`)}</section>`;
  if (!RE.rows) return `${head}<section class="panel"><div class="empty">${icon('refresh')}<h3>Carregando rematrículas…</h3></div></section>`;

  const rows = RE.rows;
  const count = s => rows.filter(r => r.status === s).length;
  const total = rows.length, done = count('concluida'), declined = count('declinada'), going = count('em_andamento'), notStarted = count('pendente');
  const pct = total ? Math.round(((done + declined) / total) * 100) : 0;
  const delReq = rows.filter(r => r.delete_requested).length;
  const kpi = (label, value, ic, key, foot) => `<div class="kpi click ${RE.status === key ? 'on' : ''}"><button class="kpi-activate" data-act="re-kpi" data-v="${key}" aria-pressed="${RE.status === key}">${kpiIcon(ic)}<span class="kpi-label">${label}</span><span class="kpi-value">${value}</span><span class="kpi-foot">${foot}</span></button></div>`;
  const teams = [...new Set(rows.map(r => r.team_id))].map(id => {
    const list = rows.filter(r => r.team_id === id);
    return { id, name: reTeamName(id), total: list.length, done: list.filter(r => r.status === 'concluida').length, declined: list.filter(r => r.status === 'declinada').length };
  }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  // Só quem começou: quem não abriu o formulário falta tudo e distorceria a leitura
  const missCounts = Object.keys(RE_MISSING).map(k => [k, rows.filter(r => r.status === 'em_andamento' && r.missing.includes(k)).length]);

  return `${head}
  <div class="grid g4 mb">
    ${kpi('Concluídas', done, 'check', 'concluida', `${total ? Math.round(done / total * 100) : 0}% dos atletas ativos`)}
    ${kpi('Em andamento', going, 'clock', 'em_andamento', 'começaram e ainda falta algo')}
    ${kpi('Não iniciadas', notStarted, 'users', 'pendente', 'ainda não abriram o formulário')}
    ${kpi('Não vão continuar', declined, 'x', 'declinada', delReq ? `${delReq} ${delReq === 1 ? 'pediu' : 'pediram'} exclusão dos dados` : 'decisão registrada')}
  </div>
  <section class="panel mb re-progress">
    <div class="re-progress-head"><div><b>${done + declined} de ${total}</b> atletas já responderam <span class="muted">(${pct}%)</span></div>
      <div class="re-legend"><span><i class="re-ok"></i>Concluída</span><span><i class="re-go"></i>Em andamento</span><span><i class="re-no"></i>Não vai continuar</span><span><i></i>Não iniciada</span></div></div>
    <div class="re-bar" role="img" aria-label="${done} concluídas, ${going} em andamento, ${declined} não vão continuar, ${notStarted} não iniciadas">
      <i class="re-ok" style="width:${total ? done / total * 100 : 0}%"></i><i class="re-go" style="width:${total ? going / total * 100 : 0}%"></i><i class="re-no" style="width:${total ? declined / total * 100 : 0}%"></i></div>
    ${teams.length > 1 ? `<details class="re-teams" ${RE.team ? '' : ''}><summary>Progresso por equipe</summary><div class="re-team-grid">${teams.map(t => `<button class="re-team ${RE.team === t.id ? 'on' : ''}" data-act="re-team" data-id="${t.id}" aria-pressed="${RE.team === t.id}">
      <span class="re-team-name">${esc(t.name)}</span><span class="re-team-num">${t.done + t.declined}/${t.total}</span>
      <span class="re-bar sm"><i class="re-ok" style="width:${t.done / t.total * 100}%"></i><i class="re-no" style="width:${t.declined / t.total * 100}%"></i></span></button>`).join('')}</div></details>` : ''}
    ${missCounts.some(([, n]) => n) ? `<div class="re-missing"><span class="muted small">Começaram e ainda falta:</span>${missCounts.filter(([, n]) => n).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<button class="re-chip ${RE.missing === k ? 'on' : ''}" data-act="re-missing" data-v="${k}" aria-pressed="${RE.missing === k}">${RE_MISSING[k]} <b>${n}</b></button>`).join('')}</div>` : ''}
  </section>
  <section class="panel">
    <div class="toolbar">
      <div class="search">${icon('search')}<input class="input" id="reQ" type="search" placeholder="Buscar atleta, responsável ou WhatsApp..." value="${esc(RE.q)}" aria-label="Buscar atleta"></div>
      <select class="select" id="reStatus" aria-label="Filtrar situação">${[['pendentes', 'Pendentes (todas)'], ['pendente', 'Não iniciadas'], ['em_andamento', 'Em andamento'], ['concluida', 'Concluídas'], ['declinada', 'Não vão continuar'], ['todos', 'Todas as situações']].map(([v, l]) => `<option value="${v}" ${RE.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select class="select" id="reTeam" aria-label="Filtrar equipe"><option value="">Todas as equipes</option>${teams.map(t => `<option value="${t.id}" ${RE.team === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
      <button class="btn sm" data-act="re-reload" title="Atualizar" aria-label="Atualizar lista">${icon('refresh')}</button>
    </div>
    <div id="reTable">${reTable()}</div>
  </section>`;
}

function reTable() {
  const list = reFiltered().sort((a, b) => displayName(a.name).localeCompare(displayName(b.name), 'pt-BR'));
  const filters = [RE.missing && `falta ${RE_MISSING[RE.missing].toLowerCase()}`, RE.team && reTeamName(RE.team)].filter(Boolean);
  const banner = filters.length ? `<div class="filter-banner">${icon('alert')}<span>Mostrando: <b>${esc(filters.join(' · '))}</b> (${list.length})</span><button class="btn sm" data-act="re-clear">Limpar filtros</button></div>` : '';
  if (!list.length) return banner + emptyState('Nenhum atleta aqui', RE.status === 'pendentes' && !filters.length ? 'Todos já responderam. 🎉' : 'Tente outra busca ou filtro.');
  const page = list.slice(0, RE.limit);
  return `${banner}<div class="table-wrap"><table class="cards"><thead><tr><th>Atleta / Responsável</th><th>Equipe atual → 2027</th><th>Situação</th><th><span class="sr">Ações</span></th></tr></thead><tbody>${page.map(r => {
    const name = displayName(r.name), [label, cls] = RE_STATUS[r.status] || RE_STATUS.pendente;
    const moved = r.team_2027_id && r.team_2027_id !== r.team_id;
    const detail = r.status === 'concluida' ? `Concluída em ${fmtTs(r.completed_at)}`
      : r.status === 'declinada' ? esc(r.decline_reason || 'Sem motivo informado')
      : r.status === 'em_andamento' ? `Falta: ${r.missing.map(m => RE_MISSING[m].toLowerCase()).join(', ')}` : 'Ainda não abriu o formulário';
    return `<tr class="rowlink" data-act="re-open" data-id="${r.id}" tabindex="0">
      <td class="c-main"><div class="person"><span class="avatar ${r.minor ? 'kid' : ''}">${r.minor ? icon('child') : initials(name)}</span><div><strong>${esc(name)}</strong><small>${r.minor ? `Resp.: ${esc(displayName(r.contact_name))}` : esc(r.contact_phone || 'Sem WhatsApp')}</small></div></div></td>
      <td class="c-sub" data-label="Equipe"><strong style="font-size:13px">${esc(reTeamName(r.team_id))}</strong>${r.team_2027_id ? `<div class="hint">${moved ? `→ <b style="color:var(--info)">${esc(reTeamName(r.team_2027_id))}</b> <span class="tag st-info nodot">troca</span>` : '→ mesma equipe'}</div>` : ''}</td>
      <td class="c-status"><span class="tag ${cls}">${label}</span>${r.delete_requested ? ' <span class="tag st-bad nodot" title="Pediu exclusão dos dados">LGPD</span>' : ''}<div class="hint" style="white-space:normal;max-width:260px;margin-top:4px">${detail}</div></td>
      <td class="c-act"><div class="cell-actions">${reIsPending(r) && r.contact_phone ? `<a class="btn sq wa-ghost" data-stop data-act="re-wa" data-id="${r.id}" href="#" title="Enviar lembrete por WhatsApp" aria-label="Enviar lembrete por WhatsApp para ${esc(displayName(r.contact_name))}">${icon('whatsapp')}</a>` : ''}${r.atestado_path ? `<button class="btn sq" data-stop data-act="re-file" data-id="${r.id}" title="Abrir atestado" aria-label="Abrir atestado de ${esc(name)}">${icon('file')}</button>` : ''}</div></td></tr>`;
  }).join('')}</tbody></table></div>${listMore('re-more', page.length, list.length)}<div class="panel-foot"><span>${list.length} de ${RE.rows.length} atletas ativos</span><span>Clique em um atleta para ver o detalhe.</span></div>`;
}
const fmtTs = ts => ts ? new Date(ts).toLocaleDateString('pt-BR') : '—';

function reWhatsApp(r) {
  const who = displayName(r.contact_name).split(' ')[0];
  const athlete = displayName(r.name).split(' ')[0];
  const miss = r.status === 'em_andamento' && r.missing.length ? `Falta pouco: ${r.missing.map(m => RE_MISSING[m].toLowerCase()).join(', ')}.` : 'Leva cerca de 10 minutos.';
  const text = `Olá, ${who}! A rematrícula 2027 ${r.minor ? `de ${athlete} ` : ''}na Apollo está aberta. ${miss}\n\nAcesse: ${REENROLL_URL}\nUse o CPF ou o WhatsApp cadastrado e a data de nascimento ${r.minor ? 'do(a) atleta' : ''}.`.replace(/ \./g, '.');
  const tel = digits(r.contact_phone);
  window.open(`https://wa.me/55${tel.slice(-11)}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

async function reOpenFile(r) {
  const win = window.open('', '_blank');
  try {
    const { data, error } = await financeDbClient().storage.from('rematricula').createSignedUrl(r.atestado_path, 300);
    if (error) throw error;
    if (win) win.location = data.signedUrl; else window.location.href = data.signedUrl;
  } catch (e) {
    if (win) win.close();
    toast('Não foi possível abrir o atestado. Confira sua permissão.', true);
  }
}

function reDetail(r) {
  const name = displayName(r.name), [label, cls] = RE_STATUS[r.status] || RE_STATUS.pendente;
  const steps = Object.keys(RE_MISSING);
  const stepAt = k => r.steps?.[k];
  const edit = canEdit('rematricula');
  openDialog(dHead('Rematrícula 2027', esc(name), `${esc(reTeamName(r.team_id))}${r.minor ? ` · responsável: ${esc(displayName(r.contact_name))}` : ''}`) + `<div class="d-body">
    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 14px"><span class="tag ${cls}">${label}</span>${r.updated_at ? `<span class="hint">atualizada em ${fmtTs(r.updated_at)}</span>` : ''}</div>
    ${r.status === 'declinada' ? `<div class="banner">${icon('info')}<div><b>Motivo:</b> ${esc(r.decline_reason || '—')}${r.decline_note ? `<br><b>Mensagem:</b> ${esc(r.decline_note)}` : ''}<br><span class="hint">Registrado em ${fmtTs(r.declined_at)} por ${r.declined_by === 'familia' ? 'atleta ou responsável' : esc(r.declined_by || '—')}.</span>${r.delete_requested ? `<br><b style="color:var(--brand-ink)">Pediu a exclusão dos dados pessoais (LGPD).</b> Avalie o que precisa ser mantido por obrigação legal antes de excluir.` : ''}</div></div>` : ''}
    <ul class="re-steps">${steps.map(k => `<li class="${stepAt(k) ? 'ok' : ''}">${icon(stepAt(k) ? 'check' : 'clock')}<span>${RE_MISSING[k]}</span><span class="hint">${stepAt(k) ? fmtTs(stepAt(k)) : 'pendente'}</span></li>`).join('')}</ul>
    ${r.team_2027_id ? `<p class="small"><b>Equipe 2027:</b> ${esc(reTeamName(r.team_2027_id))}${r.team_2027_id !== r.team_id ? ' <span class="tag st-info nodot">troca de equipe</span>' : ''}</p>` : ''}
    ${r.team_note ? `<p class="small"><b>Observação da família:</b> ${esc(r.team_note)}</p>` : ''}
    ${r.changed_fields?.length ? `<p class="small"><b>Dados alterados na revisão:</b> ${r.changed_fields.map(f => RE_FIELD_LABEL[f] || f).join(', ')}</p>` : ''}
    ${r.respondent ? `<p class="small muted">Preenchido por ${esc(displayName(r.respondent))}.</p>` : ''}
  </div>
  <div class="d-foot">
    ${edit && r.status !== 'declinada' && r.status !== 'concluida' ? `<button class="btn left" data-act="re-decline" data-id="${r.id}">Registrar que não vai continuar</button>` : ''}
    ${edit && (r.status === 'declinada' || r.status === 'concluida') ? `<button class="btn left" data-act="re-reopen" data-id="${r.id}">Reabrir rematrícula</button>` : ''}
    ${r.atestado_path ? `<button class="btn" data-act="re-file" data-id="${r.id}">${icon('file')} Atestado</button>` : ''}
    ${reIsPending(r) && r.contact_phone ? `<button class="btn wa" data-act="re-wa" data-id="${r.id}">${icon('whatsapp')} Lembrete</button>` : ''}
    <button class="btn" data-act="close-dialog">Fechar</button>
  </div>`);
}

async function reStaffSet(r, action) {
  if (!canEdit('rematricula')) return toast('Seu perfil só pode consultar as rematrículas.', true);
  let reason = null;
  if (action === 'decline') {
    const d = $('#dlg2');
    reason = await new Promise(res => {
      d.innerHTML = `<div class="d-head"><div><h2 id="dlg2Title">Não vai continuar em 2027</h2></div></div><div class="d-body">
        <p class="muted small" style="margin-top:0">Use quando a família avisou por telefone ou pessoalmente. Ela ainda pode reabrir pelo formulário.</p>
        <div class="field"><label for="reReason">Motivo</label><select class="select" id="reReason">${['Mudança de cidade', 'Horários ou dias de treino', 'Valor da mensalidade', 'Vai praticar outro esporte ou atividade', 'Saúde ou lesão', 'Insatisfação com o projeto', 'Outro motivo'].map(o => `<option>${o}</option>`).join('')}</select></div>
        <div class="field"><label for="reNote">Observação (opcional)</label><textarea class="input" id="reNote" rows="3"></textarea></div></div>
        <div class="d-foot"><button class="btn" data-r="no">Cancelar</button><button class="btn primary" data-r="yes">Registrar</button></div>`;
      d.onclick = e => { const b = e.target.closest('[data-r]'); if (!b) return; const v = b.dataset.r === 'yes' ? { reason: $('#reReason').value, note: $('#reNote').value.trim() } : null; d.close(); res(v); };
      d.oncancel = () => res(null);
      d.showModal();
    });
    if (!reason) return;
  } else if (!(await confirmBox({ title: 'Reabrir rematrícula?', text: `A rematrícula de <b>${esc(displayName(r.name))}</b> volta para “em andamento”. As etapas já preenchidas continuam salvas.`, ok: 'Reabrir' }))) return;
  try {
    await liveRequireSession();
    const { error } = await financeDbClient().rpc('reenroll_staff_set', { p_athlete: r.id, p_action: action, p_reason: reason?.reason || null, p_note: reason?.note || null });
    if (error) throw error;
    closeDialog();
    toast(action === 'decline' ? 'Decisão registrada.' : 'Rematrícula reaberta.');
    await reenrollLoad(true);
  } catch (e) { toast(e.message || 'Não foi possível salvar.', true); }
}

function reExport() {
  const rows = [['Atleta', 'Menor', 'Responsável/Contato', 'WhatsApp', 'Equipe atual', 'Equipe 2027', 'Situação', 'Falta', 'Concluída em', 'Motivo (não continua)', 'Mensagem', 'Pediu exclusão de dados', 'Observação da família']];
  reFiltered().forEach(r => rows.push([displayName(r.name), r.minor ? 'Sim' : 'Não', displayName(r.contact_name), r.contact_phone || '', reTeamName(r.team_id), r.team_2027_id ? reTeamName(r.team_2027_id) : '',
    (RE_STATUS[r.status] || RE_STATUS.pendente)[0], reIsPending(r) ? r.missing.map(m => RE_MISSING[m]).join(', ') : '', r.completed_at ? fmtTs(r.completed_at) : '',
    r.decline_reason || '', r.decline_note || '', r.delete_requested ? 'Sim' : '', r.team_note || '']));
  download(`rematriculas-2027-${ymd(TODAY)}.csv`, '﻿' + csv(rows));
}

/* Eventos da página (data-act re-*) */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act^="re-"]');
  if (!el || S.page !== 'rematricula' && !el.closest('dialog')) return;
  const a = el.dataset.act, r = (RE.rows || []).find(x => x.id === el.dataset.id);
  switch (a) {
    case 're-kpi': RE.status = RE.status === el.dataset.v ? 'pendentes' : el.dataset.v; RE.limit = 50; return render();
    case 're-team': RE.team = RE.team === el.dataset.id ? '' : el.dataset.id; RE.limit = 50; return render();
    case 're-missing': RE.missing = RE.missing === el.dataset.v ? '' : el.dataset.v; if (RE.missing) RE.status = 'em_andamento'; RE.limit = 50; return render();
    case 're-clear': Object.assign(RE, { missing: '', team: '', q: '', status: 'pendentes' }); return render();
    case 're-more': RE.limit += 50; return liveTable('reTable', reTable);
    case 're-reload': RE.rows = null; RE.error = ''; render(); return reenrollLoad(true);
    case 're-copy': navigator.clipboard?.writeText(REENROLL_URL).then(() => toast('Link do formulário copiado.'), () => toast(REENROLL_URL)); return;
    case 're-export': return reExport();
    case 're-open': return r && reDetail(r);
    case 're-wa': e.preventDefault(); return r && reWhatsApp(r);
    case 're-file': return r && reOpenFile(r);
    case 're-decline': return r && reStaffSet(r, 'decline');
    case 're-reopen': return r && reStaffSet(r, 'reopen');
  }
});
document.addEventListener('input', e => { if (e.target.id === 'reQ') { RE.q = e.target.value; RE.limit = 50; liveTable('reTable', reTable); } });
document.addEventListener('change', e => {
  if (e.target.id === 'reStatus') { RE.status = e.target.value; RE.limit = 50; render(); }
  if (e.target.id === 'reTeam') { RE.team = e.target.value; RE.limit = 50; render(); }
});
// Ao voltar para a aba, atualiza (famílias preenchem durante o dia)
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.page === 'rematricula' && Date.now() - RE.loadedAt > 120000) reenrollLoad(true); });
