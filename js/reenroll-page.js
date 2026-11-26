/* Huddle · Rematrículas 2027
   Lê public.reenroll_panel (migrações 049 e 051): status, itens pendentes e decisão de cada atleta ativo.
   Técnicos veem só as próprias equipes. A rematrícula concluída só fica confirmada quando a administração
   ou o financeiro valida o comprovante Pix (reenroll_staff_fee); o contrato aceito é remontado e conferido pelo hash. */
'use strict';

const REENROLL_URL = 'https://apollovoleibol.github.io/management_panel_v2/rematricula.html';
const RE = { rows: null, loading: false, error: '', loadedAt: 0, q: '', status: 'pendentes', team: '', missing: '', limit: 50 };
const RE_MISSING = { cadastro: 'Dados', endereco: 'Endereço', saude: 'Anamnese', equipe: 'Turma 2027', termos: 'Contrato', pagamento: 'Comprovante Pix' };
const RE_STATUS = {
  pendente: ['Não iniciada', 'st-pendente'],
  em_andamento: ['Em andamento', 'st-warn'],
  concluida: ['Concluída', 'st-ok'],
  declinada: ['Não vai continuar', 'st-bad'],
};
// Concluída = formulário enviado; só vira "confirmada" depois que a administração valida o comprovante Pix
const RE_FEE = {
  pendente: ['Sem comprovante', 'st-pendente'],
  enviado: ['Aguardando validação do Pix', 'st-warn'],
  aprovado: ['Confirmada', 'st-ok'],
  recusado: ['Comprovante recusado', 'st-bad'],
};
const reMiss = m => RE_MISSING[m] || m;
const reRole = () => S.previewRole ? null : APOLLO_AUTH.access?.role;
const reCanFee = () => ['admin', 'finance'].includes(reRole());
const reCanContract = () => ['admin', 'finance', 'coordination', 'attendance'].includes(reRole());
const reState = r => r.status === 'concluida' ? (RE_FEE[r.fee_status] || RE_FEE.enviado) : (RE_STATUS[r.status] || RE_STATUS.pendente);
const reStatusIs = (r, s) => s === 'todos' || (s === 'pendentes' ? reIsPending(r)
  : s === 'validar' ? r.status === 'concluida' && r.fee_status === 'enviado'
  : s === 'confirmada' ? r.status === 'concluida' && r.fee_status === 'aprovado'
  : s === 'pix_recusado' ? r.status === 'concluida' && r.fee_status === 'recusado'
  : r.status === s);
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
    && reStatusIs(r, RE.status)
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
  const toValidate = rows.filter(r => reStatusIs(r, 'validar')).length, confirmed = rows.filter(r => reStatusIs(r, 'confirmada')).length;
  const kpi = (label, value, ic, key, foot) => `<div class="kpi click ${RE.status === key ? 'on' : ''}"><button class="kpi-activate" data-act="re-kpi" data-v="${key}" aria-pressed="${RE.status === key}">${kpiIcon(ic)}<span class="kpi-label">${label}</span><span class="kpi-value">${value}</span><span class="kpi-foot">${foot}</span></button></div>`;
  const teams = [...new Set(rows.map(r => r.team_id))].map(id => {
    const list = rows.filter(r => r.team_id === id);
    return { id, name: reTeamName(id), total: list.length, done: list.filter(r => r.status === 'concluida').length, declined: list.filter(r => r.status === 'declinada').length };
  }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  // Só quem começou: quem não abriu o formulário falta tudo e distorceria a leitura
  const missCounts = Object.keys(RE_MISSING).map(k => [k, rows.filter(r => r.status === 'em_andamento' && r.missing.includes(k)).length]);

  return `${head}
  <div class="grid g4 mb">
    ${kpi('Concluídas', done, 'check', 'concluida', `${confirmed} ${confirmed === 1 ? 'confirmada' : 'confirmadas'} · ${toValidate} ${toValidate === 1 ? 'aguarda' : 'aguardam'} validação do Pix`)}
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
  ${toValidate && reCanFee() && RE.status !== 'validar' ? `<div class="banner mb">${icon('alert')}<span><b>${toValidate} ${toValidate === 1 ? 'comprovante Pix aguarda' : 'comprovantes Pix aguardam'} validação.</b> A rematrícula só fica confirmada depois que o pagamento for conferido.</span><button class="btn sm" data-act="re-kpi" data-v="validar">Validar agora</button></div>` : ''}
  <section class="panel">
    <div class="toolbar">
      <div class="search">${icon('search')}<input class="input" id="reQ" type="search" placeholder="Buscar atleta, responsável ou WhatsApp..." value="${esc(RE.q)}" aria-label="Buscar atleta"></div>
      <select class="select" id="reStatus" aria-label="Filtrar situação">${[['pendentes', 'Pendentes (todas)'], ['pendente', 'Não iniciadas'], ['em_andamento', 'Em andamento'], ['concluida', 'Concluídas (todas)'], ['validar', 'Aguardando validação do Pix'], ['confirmada', 'Confirmadas'], ['pix_recusado', 'Comprovante recusado'], ['declinada', 'Não vão continuar'], ['todos', 'Todas as situações']].map(([v, l]) => `<option value="${v}" ${RE.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
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
    const name = displayName(r.name), [label, cls] = reState(r);
    const moved = r.team_2027_id && r.team_2027_id !== r.team_id;
    const detail = r.status === 'concluida' ? `Enviada em ${fmtTs(r.completed_at)}${r.fee_status === 'recusado' && r.fee_note ? ` · ${esc(r.fee_note)}` : r.fee_status === 'aprovado' && r.fee_reviewed_at ? ` · Pix validado em ${fmtTs(r.fee_reviewed_at)}` : ''}`
      : r.status === 'declinada' ? esc(r.decline_reason || 'Sem motivo informado')
      : r.status === 'em_andamento' ? `Falta: ${r.missing.map(m => reMiss(m).toLowerCase()).join(', ')}` : 'Ainda não abriu o formulário';
    return `<tr class="rowlink" data-act="re-open" data-id="${r.id}" tabindex="0">
      <td class="c-main"><div class="person"><span class="avatar ${r.minor ? 'kid' : ''}">${r.minor ? icon('child') : initials(name)}</span><div><strong>${esc(name)}</strong><small>${r.minor ? `Resp.: ${esc(displayName(r.contact_name))}` : esc(r.contact_phone || 'Sem WhatsApp')}</small></div></div></td>
      <td class="c-sub" data-label="Equipe"><strong style="font-size:13px">${esc(reTeamName(r.team_id))}</strong>${r.offer_label || r.team_2027_id ? `<div class="hint">${moved || (r.offer_label && !r.team_2027_id) ? `→ <b style="color:var(--info)">${esc(r.offer_label || reTeamName(r.team_2027_id))}</b> <span class="tag st-info nodot">troca</span>` : `→ ${r.offer_label ? esc(r.offer_label) : 'mesma equipe'}`}</div>` : ''}</td>
      <td class="c-status"><span class="tag ${cls}">${label}</span>${r.delete_requested ? ' <span class="tag st-bad nodot" title="Pediu exclusão dos dados">LGPD</span>' : ''}<div class="hint" style="white-space:normal;max-width:260px;margin-top:4px">${detail}</div></td>
      <td class="c-act"><div class="cell-actions">${reIsPending(r) && r.contact_phone ? `<a class="btn sq wa-ghost" data-stop data-act="re-wa" data-id="${r.id}" href="#" title="Enviar lembrete por WhatsApp" aria-label="Enviar lembrete por WhatsApp para ${esc(displayName(r.contact_name))}">${icon('whatsapp')}</a>` : ''}${r.fee_path ? `<button class="btn sq" data-stop data-act="re-fee-file" data-id="${r.id}" title="Abrir comprovante Pix" aria-label="Abrir comprovante Pix de ${esc(name)}">${icon('file')}</button>` : ''}${r.fee_path && r.fee_status === 'enviado' && reCanFee() ? `<button class="btn sq" data-stop data-act="re-fee-ok" data-id="${r.id}" title="Validar comprovante" aria-label="Validar comprovante de ${esc(name)}">${icon('check')}</button>` : ''}</div></td></tr>`;
  }).join('')}</tbody></table></div>${listMore('re-more', page.length, list.length)}<div class="panel-foot"><span>${list.length} de ${RE.rows.length} atletas ativos</span><span>Clique em um atleta para ver o detalhe.</span></div>`;
}
const fmtTs = ts => ts ? new Date(ts).toLocaleDateString('pt-BR') : '—';

function reWhatsApp(r) {
  const who = displayName(r.contact_name).split(' ')[0];
  const athlete = displayName(r.name).split(' ')[0];
  const miss = r.status === 'em_andamento' && r.missing.length ? `Falta pouco: ${r.missing.map(m => reMiss(m).toLowerCase()).join(', ')}.` : 'Leva cerca de 10 minutos.';
  const text = `Olá, ${who}! A rematrícula 2027 ${r.minor ? `de ${athlete} ` : ''}na Apollo está aberta. ${miss}\n\nAcesse: ${REENROLL_URL}\nUse o CPF ou o WhatsApp cadastrado e a data de nascimento ${r.minor ? 'do(a) atleta' : ''}.`.replace(/ \./g, '.');
  const tel = digits(r.contact_phone);
  window.open(`https://wa.me/55${tel.slice(-11)}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

async function reOpenFile(path, what = 'o arquivo') {
  const win = window.open('', '_blank');
  try {
    const { data, error } = await financeDbClient().storage.from('rematricula').createSignedUrl(path, 300);
    if (error) throw error;
    if (win) win.location = data.signedUrl; else window.location.href = data.signedUrl;
  } catch (e) {
    if (win) win.close();
    toast(`Não foi possível abrir ${what}. Confira sua permissão.`, true);
  }
}

// Contrato aceito: remonta o texto com os dados congelados e confere o código de integridade
async function reOpenContract(r) {
  const win = window.open('', '_blank');
  if (!win) return toast('Permita a abertura de nova janela para ver o contrato.', true);
  win.document.write('<p style="font:14px system-ui;padding:24px">Carregando contrato…</p>');
  try {
    if (typeof contratoHtml !== 'function') throw new Error('Recarregue a página para ver o contrato.');
    const { data: c, error } = await financeDbClient().rpc('reenroll_staff_contract', { p_athlete: r.id });
    if (error) throw error;
    const base = contratoHtml(c.data);
    const ok = c.version === CONTRATO_VERSION && (await contratoHash(base)) === c.hash;
    const html = contratoHtml({ ...c.data, assinatura: { name: displayName(c.name || c.data?.contratante?.name || ''), at: c.accepted_at ? new Date(c.accepted_at).toLocaleString('pt-BR') : '—', ip: c.ip, hash: c.hash } });
    const check = ok
      ? `<div class="ct-check ok">✓ Texto conferido: o código de integridade bate com o contrato aceito (${esc(c.version)}).</div>`
      : `<div class="ct-check bad">⚠ Não foi possível conferir o texto: ${c.version !== CONTRATO_VERSION ? `o contrato aceito é a versão ${esc(c.version || '—')} e esta página exibe a ${CONTRATO_VERSION}` : 'o código de integridade não bate com o texto atual'}. Os dados do aceite continuam registrados.</div>`;
    win.document.open();
    win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Contrato 2027 – ${esc(displayName(r.name))}</title>
      <link rel="stylesheet" href="${new URL('rematricula.css?v=3', location.href)}">
      <style>.ct-check{max-width:820px;margin:16px auto;padding:10px 14px;border-radius:10px;font:14px Inter,system-ui,sans-serif}.ct-check.ok{background:#e7f6ec;color:#17603a}.ct-check.bad{background:#fdecec;color:#8a1f1f}@media print{.ct-check{display:none}}</style>
      </head><body class="ct-print">${check}${html}</body></html>`);
    win.document.close();
  } catch (e) {
    win.close();
    toast(e.message || 'Não foi possível abrir o contrato.', true);
  }
}

async function reFeeSet(r, action) {
  if (!reCanFee()) return toast('Somente a administração e o financeiro validam o comprovante.', true);
  let note = null;
  if (action === 'reject') {
    const d = $('#dlg2');
    note = await new Promise(res => {
      d.innerHTML = `<div class="d-head"><div><h2 id="dlg2Title">Recusar comprovante Pix</h2></div></div><div class="d-body">
        <p class="muted small" style="margin-top:0">O motivo aparece para a família, que poderá enviar um novo comprovante pelo formulário.</p>
        <div class="field"><label for="reFeeNote">Motivo</label><select class="select" id="reFeeReason">${['Valor diferente de R$ 40,00', 'Comprovante ilegível ou incompleto', 'Pagamento não localizado na conta', 'Comprovante de outro atleta ou duplicado', 'Outro motivo'].map(o => `<option>${o}</option>`).join('')}</select>
        <textarea class="input" id="reFeeNote" rows="3" style="margin-top:8px" placeholder="Detalhe (opcional)" maxlength="200"></textarea></div><div class="err" id="reFeeErr" role="alert"></div></div>
        <div class="d-foot"><button class="btn" data-r="no">Cancelar</button><button class="btn danger" data-r="yes">Recusar comprovante</button></div>`;
      d.onclick = e => { const b = e.target.closest('[data-r]'); if (!b) return; const extra = $('#reFeeNote').value.trim(); const v = b.dataset.r === 'yes' ? [$('#reFeeReason').value, extra].filter(Boolean).join(': ') : null; d.close(); res(v); };
      d.oncancel = () => res(null);
      d.showModal();
    });
    if (!note) return;
  } else if (action === 'approve' && !(await confirmBox({ title: 'Validar comprovante?', text: `Confirme que o Pix de <b>R$ 40,00</b> da rematrícula de <b>${esc(displayName(r.name))}</b> entrou na conta. A rematrícula passa a constar como <b>confirmada</b>.`, ok: 'Validar e confirmar' }))) return;
  else if (action === 'reset' && !(await confirmBox({ title: 'Desfazer a validação?', text: 'O comprovante volta para “aguardando validação”.', ok: 'Desfazer' }))) return;
  try {
    await liveRequireSession();
    const { error } = await financeDbClient().rpc('reenroll_staff_fee', { p_athlete: r.id, p_action: action, p_note: note });
    if (error) throw error;
    closeDialog();
    toast(action === 'approve' ? 'Comprovante validado. Rematrícula confirmada.' : action === 'reject' ? 'Comprovante recusado. A família verá o motivo no formulário.' : 'Validação desfeita.');
    await reenrollLoad(true);
  } catch (e) { toast(e.message || 'Não foi possível salvar.', true); }
}

function reDetail(r) {
  const name = displayName(r.name), [label, cls] = reState(r);
  const steps = Object.keys(RE_MISSING);
  const stepAt = k => r.steps?.[k];
  const edit = canEdit('rematricula');
  const fee = RE_FEE[r.fee_status] || RE_FEE.pendente;
  const feeBox = r.fee_at || r.fee_status !== 'pendente' ? `<div class="banner ${r.fee_status === 'recusado' ? '' : 'note'}" style="margin:0 0 12px">${icon(r.fee_status === 'aprovado' ? 'check' : 'file')}<div>
      <b>Taxa de rematrícula (Pix R$ 40,00):</b> <span class="tag ${fee[1]}">${fee[0]}</span>
      ${r.fee_at ? `<br><span class="hint">Comprovante enviado em ${fmtTs(r.fee_at)}${r.fee_name ? ` · ${esc(r.fee_name)}` : ''}</span>` : ''}
      ${r.fee_reviewed_at ? `<br><span class="hint">${r.fee_status === 'aprovado' ? 'Validado' : 'Analisado'} em ${fmtTs(r.fee_reviewed_at)} por ${esc(r.fee_reviewed_by || '—')}</span>` : ''}
      ${r.fee_status === 'recusado' && r.fee_note ? `<br><b>Motivo:</b> ${esc(r.fee_note)}` : ''}
      ${!r.fee_path && r.fee_at ? '<br><span class="hint">O arquivo só é visível para a administração e o financeiro.</span>' : ''}</div></div>` : '';
  openDialog(dHead('Rematrícula 2027', esc(name), `${esc(reTeamName(r.team_id))}${r.minor ? ` · responsável: ${esc(displayName(r.contact_name))}` : ''}`) + `<div class="d-body">
    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 14px"><span class="tag ${cls}">${label}</span>${r.updated_at ? `<span class="hint">atualizada em ${fmtTs(r.updated_at)}</span>` : ''}</div>
    ${r.status === 'declinada' ? `<div class="banner">${icon('info')}<div><b>Motivo:</b> ${esc(r.decline_reason || '—')}${r.decline_note ? `<br><b>Mensagem:</b> ${esc(r.decline_note)}` : ''}<br><span class="hint">Registrado em ${fmtTs(r.declined_at)} por ${r.declined_by === 'familia' ? 'atleta ou responsável' : esc(r.declined_by || '—')}.</span>${r.delete_requested ? `<br><b style="color:var(--brand-ink)">Pediu a exclusão dos dados pessoais (LGPD).</b> Avalie o que precisa ser mantido por obrigação legal antes de excluir.` : ''}</div></div>` : ''}
    <ul class="re-steps">${steps.map(k => `<li class="${stepAt(k) ? 'ok' : ''}">${icon(stepAt(k) ? 'check' : 'clock')}<span>${RE_MISSING[k]}</span><span class="hint">${stepAt(k) ? fmtTs(stepAt(k)) : 'pendente'}</span></li>`).join('')}</ul>
    ${r.status === 'concluida' ? feeBox : ''}
    ${r.offer_label || r.team_2027_id ? `<p class="small"><b>Turma 2027:</b> ${esc(r.offer_label || reTeamName(r.team_2027_id))}${r.team_2027_id && r.team_2027_id !== r.team_id || (r.offer_label && !r.team_2027_id) ? ' <span class="tag st-info nodot">troca de equipe</span>' : ''}</p>` : ''}
    ${r.contract_version ? `<p class="small"><b>Contrato:</b> aceito em ${fmtTs(r.contract_at)} (${esc(r.contract_version)}) · <b>Uso de imagem:</b> ${r.image_consent === true ? 'autorizado' : r.image_consent === false ? '<span style="color:var(--brand-ink)">não autorizado</span>' : '—'}</p>` : ''}
    ${r.team_note ? `<p class="small"><b>Observação da família:</b> ${esc(r.team_note)}</p>` : ''}
    ${r.changed_fields?.length ? `<p class="small"><b>Dados alterados na revisão:</b> ${r.changed_fields.map(f => RE_FIELD_LABEL[f] || f).join(', ')}</p>` : ''}
    ${r.respondent ? `<p class="small muted">Preenchido por ${esc(displayName(r.respondent))}.</p>` : ''}
  </div>
  <div class="d-foot">
    ${edit && r.status !== 'declinada' && r.status !== 'concluida' ? `<button class="btn left" data-act="re-decline" data-id="${r.id}">Registrar que não vai continuar</button>` : ''}
    ${edit && (r.status === 'declinada' || r.status === 'concluida') ? `<button class="btn left" data-act="re-reopen" data-id="${r.id}">Reabrir rematrícula</button>` : ''}
    ${r.atestado_path ? `<button class="btn" data-act="re-file" data-id="${r.id}">${icon('file')} Atestado</button>` : ''}
    ${r.contract_version && reCanContract() ? `<button class="btn" data-act="re-contract" data-id="${r.id}">${icon('file')} Contrato</button>` : ''}
    ${r.fee_path ? `<button class="btn" data-act="re-fee-file" data-id="${r.id}">${icon('file')} Comprovante</button>` : ''}
    ${r.fee_path && reCanFee() && r.fee_status === 'enviado' ? `<button class="btn" data-act="re-fee-no" data-id="${r.id}">Recusar</button><button class="btn primary" data-act="re-fee-ok" data-id="${r.id}">${icon('check')} Validar Pix</button>` : ''}
    ${r.fee_path && reCanFee() && (r.fee_status === 'aprovado' || r.fee_status === 'recusado') ? `<button class="btn" data-act="re-fee-reset" data-id="${r.id}">Desfazer análise</button>` : ''}
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
  const rows = [['Atleta', 'Menor', 'Responsável/Contato', 'WhatsApp', 'Equipe atual', 'Turma 2027', 'Situação', 'Falta', 'Enviada em', 'Pix', 'Pix analisado em', 'Motivo da recusa do Pix', 'Contrato aceito em', 'Uso de imagem', 'Motivo (não continua)', 'Mensagem', 'Pediu exclusão de dados', 'Observação da família']];
  reFiltered().forEach(r => rows.push([displayName(r.name), r.minor ? 'Sim' : 'Não', displayName(r.contact_name), r.contact_phone || '', reTeamName(r.team_id), r.offer_label || (r.team_2027_id ? reTeamName(r.team_2027_id) : ''),
    reState(r)[0], reIsPending(r) ? r.missing.map(m => reMiss(m)).join(', ') : '', r.completed_at ? fmtTs(r.completed_at) : '',
    r.fee_at || r.fee_status !== 'pendente' ? (RE_FEE[r.fee_status] || RE_FEE.pendente)[0] : '', r.fee_reviewed_at ? fmtTs(r.fee_reviewed_at) : '', r.fee_status === 'recusado' ? r.fee_note || '' : '',
    r.contract_at ? fmtTs(r.contract_at) : '', r.image_consent === true ? 'Autorizado' : r.image_consent === false ? 'Não autorizado' : '',
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
    case 're-file': return r && reOpenFile(r.atestado_path, 'o atestado');
    case 're-fee-file': return r && reOpenFile(r.fee_path, 'o comprovante');
    case 're-fee-ok': return r && reFeeSet(r, 'approve');
    case 're-fee-no': return r && reFeeSet(r, 'reject');
    case 're-fee-reset': return r && reFeeSet(r, 'reset');
    case 're-contract': return r && reOpenContract(r);
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
