/* Pagamentos de técnicos · Financeiro · Configurações */
'use strict';

const monthOptions = (sel, n = 6) => lastMonths(n).reverse().map(m => { const k = monthKey(m); return `<option value="${k}" ${sel === k ? 'selected' : ''}>${MONTHS[m.getMonth()][0].toUpperCase() + MONTHS[m.getMonth()].slice(1)} ${m.getFullYear()}</option>`; }).join('');
const monthLabel = k => { const [y, m] = k.split('-').map(Number); return `${MONTHS[m - 1]} de ${y}`; };

/* ═══════════════ PAGAMENTOS DE TÉCNICOS ═══════════════ */
function coachSummary(cid, key) {
  const items = COACH_ITEMS.filter(i => i.coach === cid && inMonth(i.date, key));
  const tr = items.filter(i => i.type === 'treino'), comp = items.filter(i => i.type === 'competicao'), ex = items.filter(i => i.type === 'extra');
  const sum = a => a.reduce((s, i) => s + itemValue(i), 0);
  return { items, hours: tr.reduce((s, i) => s + i.hours, 0), trV: sum(tr), compDays: comp.length, compV: sum(comp), exV: sum(ex), total: sum(items), pending: items.filter(i => i.status === 'pendente').length, paid: PAYOUTS[`${cid}|${key}`] };
}
function renderPayments() {
  const key = S.pay.month, rows = COACHES.map(c => ({ c, s: coachSummary(c.id, key) }));
  const total = rows.reduce((s, r) => s + r.s.total, 0), paid = rows.filter(r => r.s.paid).reduce((s, r) => s + r.s.paid.amount, 0);
  return `${viewBanner('payments')}
  <div class="page-head"><div><div class="eyebrow">Finanças · equipe técnica</div><h1>Pagamentos de técnicos</h1><p>Horas trabalhadas, dias de competição e extras de cada técnico, com aprovação e registro de pagamento.</p></div>
    <div class="head-actions"><select class="select" id="payMonth" aria-label="Mês de referência" style="width:auto">${monthOptions(key, 3)}</select><button class="btn" data-act="pay-export">${icon('download')} Exportar CSV</button><button class="btn primary" data-act="pay-add" data-edit>${icon('plus')} Lançar competição ou extra</button></div></div>
  ${rows.some(r => r.s.items.length) ? `<div class="banner note">${icon('info')}<div>Registre aqui as horas efetivamente trabalhadas, competições e extras. Os horários da agenda não comprovam a realização do treino.</div></div>`
    : `<div class="empty-cta">${icon('clock')}<p><b>Nenhum lançamento em ${monthLabel(key)}.</b> Lance as horas de treino, competições e extras de cada técnico para calcular o fechamento do mês.${COACHES.some(c => !c.rate) ? ' Defina também a hora-aula e a diária em “Detalhes” de cada técnico.' : ''}</p>${canEdit('payments') ? `<button class="btn primary" data-act="pay-add" data-edit>${icon('plus')} Lançar horas ou competição</button>` : ''}</div>`}
  <div class="grid g4 mb">${[['Total do mês', money(total), monthLabel(key), 'wallet'], ['Horas de treino', rows.reduce((s, r) => s + r.s.hours, 0).toLocaleString('pt-BR') + ' h', `${money(rows.reduce((s, r) => s + r.s.trV, 0))} em treinos`, 'clock'], ['Dias de competição', rows.reduce((s, r) => s + r.s.compDays, 0), `${money(rows.reduce((s, r) => s + r.s.compV, 0))} em diárias`, 'trophy'], ['A pagar', money(total - paid), `${rows.reduce((s, r) => s + r.s.pending, 0)} lançamentos aguardando aprovação`, 'alert']].map(([l, v, f, i]) => kpiCard([l, v, f, '', i])).join('')}</div>
  <section class="panel"><div class="panel-head"><div><h2>Fechamento por técnico</h2><div class="sub">${monthLabel(key)} · valores calculados com a hora-aula e a diária de cada técnico</div></div></div>
  <div class="table-wrap"><table><thead><tr><th>Técnico</th><th class="num">Horas de treino</th><th class="num">Competições</th><th class="num">Extras</th><th class="num">Total</th><th>Situação</th><th></th></tr></thead><tbody>${rows.map(({ c, s }) => `<tr class="rowlink" data-act="pay-open" data-id="${c.id}" tabindex="0">
    <td><div class="person"><span class="avatar">${initials(c.name)}</span><div><strong>${esc(c.name)}</strong><small>${TEAMS.filter(t => t.coach === c.id).map(t => esc(t.name)).join(' · ') || 'Sem equipe'}</small></div></div></td>
    <td class="num">${s.hours.toLocaleString('pt-BR')} h<div class="hint">${money(c.rate)}/h · ${money(s.trV)}</div></td><td class="num">${s.compDays} dia${s.compDays === 1 ? '' : 's'}<div class="hint">${money(c.daily)}/dia · ${money(s.compV)}</div></td><td class="num">${money(s.exV)}</td><td class="num"><strong>${money(s.total)}</strong></td>
    <td>${s.paid ? `<span class="tag st-ok">Pago em ${s.paid.paidAt.split('-').reverse().slice(0, 2).join('/')}</span>` : s.pending ? `<span class="tag st-warn">${s.pending} a aprovar</span>` : !s.items.length ? '<span class="tag nodot">Sem lançamentos</span>' : '<span class="tag st-info">Pronto para pagar</span>'}</td>
    <td style="text-align:right"><button class="btn sm">Detalhes</button></td></tr>`).join('')}</tbody></table></div>
  <div class="panel-foot"><span>Pago: ${money(paid)} · A pagar: ${money(total - paid)}</span><span>O pagamento registrado gera uma saída em Financeiro.</span></div></section>`;
}
function payDrawer(cid) {
  const c = coachOf(cid), key = S.pay.month, s = coachSummary(cid, key), ed = canEdit('payments');
  const typeLbl = { treino: 'Treino', competicao: 'Competição', extra: 'Extra' };
  const items = [...s.items].sort((a, b) => a.date.localeCompare(b.date));
  openDialog(dHead(`Pagamento · ${monthLabel(key)}`, esc(c.name), `PIX: ${esc(c.pix)}`) + `<div class="d-body"><fieldset class="plain" ${ed && !s.paid ? '' : 'disabled'}>
    <div class="row2"><div class="field"><label for="pdRate">Valor da hora-aula (R$)</label><input class="input" id="pdRate" type="number" step="0.01" value="${(c.rate / 100).toFixed(2)}"></div><div class="field"><label for="pdDaily">Diária de competição (R$)</label><input class="input" id="pdDaily" type="number" step="0.01" value="${(c.daily / 100).toFixed(2)}"></div></div>
    <div class="kv"><div><small>Treinos</small><strong>${s.hours.toLocaleString('pt-BR')} h · ${money(s.trV)}</strong></div><div><small>Competições</small><strong>${s.compDays} dia(s) · ${money(s.compV)}</strong></div><div><small>Extras</small><strong>${money(s.exV)}</strong></div><div><small>Total</small><strong style="font-size:18px">${money(s.total)}</strong></div></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><h3>Lançamentos</h3>${s.pending && !s.paid ? '<button type="button" class="btn sm" data-act="pay-approve-all" data-id="' + cid + '">' + icon('check') + ' Aprovar todos</button>' : ''}</div>
    <div class="table-wrap" style="margin:0 -24px"><table><thead><tr><th>Data</th><th>Lançamento</th><th class="num">Qtd.</th><th class="num">Valor</th><th>Status</th></tr></thead><tbody>${items.map(i => `<tr><td>${i.date.slice(8)}/${i.date.slice(5, 7)}</td><td><span class="tag nodot ${i.type === 'competicao' ? 'st-em-cadastro' : i.type === 'extra' ? 'st-info' : ''}">${typeLbl[i.type]}</span> ${esc(i.desc)}<div class="hint">${i.origin === 'Agenda' ? 'Gerado pela agenda' : 'Lançado manualmente'}</div></td><td class="num">${i.type === 'competicao' ? '1 dia' : i.hours ? i.hours.toLocaleString('pt-BR') + ' h' : '—'}</td><td class="num">${money(itemValue(i))}</td>
      <td>${i.status === 'pendente' ? `<label class="check small"><input type="checkbox" data-act="pay-approve" data-id="${i.id}"> Aprovar</label>` : '<span class="tag st-ok nodot">Aprovado</span>'}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nenhum lançamento no mês.</td></tr>'}</tbody></table></div>
  </fieldset></div>
  <div class="d-foot">${s.paid ? `<span class="tag st-ok left">Pago em ${s.paid.paidAt.split('-').reverse().join('/')}</span><button class="btn" data-act="close-dialog">Fechar</button>` : `<button class="btn" data-act="close-dialog">Fechar</button>${ed ? `<button class="btn" data-act="pay-rates" data-id="${cid}">Salvar valores</button><button class="btn primary" data-act="pay-mark" data-id="${cid}" ${s.pending ? 'disabled title="Aprove todos os lançamentos antes"' : ''}>${icon('check')} Registrar pagamento de ${money(s.total)}</button>` : ''}`}</div>`, 'drawer wide');
}
function payAddForm() {
  openDialog(dHead('Novo lançamento', 'Competição ou extra') + `<div class="d-body">
    <div class="field"><label>Tipo</label><div class="seg" role="radiogroup" id="paType"><button type="button" class="on" data-v="competicao">Competição (diária)</button><button type="button" data-v="extra">Extra</button><button type="button" data-v="treino">Treino avulso</button></div></div>
    <div class="row2"><div class="field"><label for="paCoach">Técnico *</label><select class="select" id="paCoach">${COACHES.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label for="paTeam">Equipe</label><select class="select" id="paTeam"><option value="">—</option>${TEAMS.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></div></div>
    <div class="field"><label for="paDesc">Descrição *</label><input class="input" id="paDesc" placeholder="Ex.: Copa Regional Sub-17 — fase final"></div>
    <div class="row2"><div class="field"><label for="paDate">Data (início) *</label><input class="input" type="date" id="paDate" value="${ymd(TODAY)}"></div>
      <div class="field" id="paQtyBox"><label for="paQty" id="paQtyLbl">Dias de competição</label><input class="input" type="number" id="paQty" min="0.5" step="0.5" value="1"></div></div>
    <div class="field hide" id="paValBox"><label for="paVal">Valor (R$)</label><input class="input" type="number" id="paVal" min="0" step="0.01" placeholder="Opcional — se vazio, usa horas × hora-aula"></div>
    <div class="preview" id="paPrev"></div><div class="err" id="paErr" role="alert"></div></div>
    <div class="d-foot"><button class="btn" data-act="close-dialog">Cancelar</button><button class="btn primary" data-act="pay-add-save">Lançar</button></div>`);
  const st = { type: 'competicao' };
  const prev = () => { const c = coachOf($('#paCoach').value), q = Number($('#paQty').value) || 0, v = centsInput($('#paVal').value); const val = st.type === 'competicao' ? c.daily * q : st.type === 'extra' && v > 0 ? v : Math.round(c.rate * q); $('#paPrev').innerHTML = `<small>Valor calculado</small>${money(val)} ${st.type === 'competicao' ? `(${q} × diária ${money(c.daily)})` : v > 0 && st.type === 'extra' ? '' : `(${q} h × ${money(c.rate)})`}`; };
  $('#paType').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; st.type = b.dataset.v; $$('#paType button').forEach(x => x.classList.toggle('on', x === b)); $('#paQtyLbl').textContent = st.type === 'competicao' ? 'Dias de competição' : 'Horas'; $('#paValBox').classList.toggle('hide', st.type !== 'extra'); prev(); });
  ['paCoach', 'paQty', 'paVal'].forEach(i => $('#' + i).addEventListener('input', prev)); prev();
  $('#dlg')._pa = st;
}
async function payAddSave() {
  const st = $('#dlg')._pa, coach = $('#paCoach').value, desc = $('#paDesc').value.trim(), date = $('#paDate').value, q = Number($('#paQty').value), v = centsInput($('#paVal').value), team = $('#paTeam').value;
  if (!desc || !date || !(q > 0) || (st.type === 'competicao' && !Number.isInteger(q))) {
    $('#paErr').textContent = 'Preencha descrição, data e quantidade; a diária de competição deve ser inteira.';
    return;
  }
  const days = st.type === 'competicao' ? Math.ceil(q) : 1;
  const rows = Array.from({ length: days }, (_, k) => ({ coach_id: coach,
    team_id: team || null, item_date: st.type === 'competicao' ? ymd(addDays(parseYmd(date), k)) : date,
    kind: ({ competicao: 'competition', treino: 'training', extra: 'extra' })[st.type],
    description: desc, hours: st.type === 'competicao' ? 0 : q,
    amount_cents: st.type === 'extra' && v > 0 ? v : null,
    created_by: APOLLO_AUTH.user.id }));
  const { error } = await financeDbClient().from('v2_coach_items').insert(rows);
  if (error) { $('#paErr').textContent = error.message; return; }
  S.pay.month = date.slice(0, 7); closeDialog(); await liveReload(); toast('Lançamento registrado — aguardando aprovação.');
}

/* ═══════════════ FINANCEIRO ═══════════════ */
function renderFinance() {
  const key = S.fin.month, t = monthTotals(key), expected = expectedMonthly();
  const delinq = DELINQ.reduce((s, d) => s + d.amount, 0), delinqN = new Set(DELINQ.map(d => d.athleteId || d.name)).size;
  const months = lastMonths(6), mt = months.map(m => monthTotals(monthKey(m)));
  const rows = LEDGER.filter(l => inMonth(l.date, key));
  const byCat = type => Object.entries(rows.filter(r => r.type === type).reduce((a, r) => (a[r.cat] = (a[r.cat] || 0) + r.amount, a), {})).sort((a, b) => b[1] - a[1]);
  const catBlock = (type, color) => { const c = byCat(type), max = Math.max(1, ...c.map(x => x[1])); return c.map(([k, v]) => `<div style="margin-bottom:10px"><div class="stat-line" style="border:0;padding:0 0 4px"><span>${esc(k)}</span><b>${money(v)}</b></div><div class="bar"><span style="width:${v / max * 100}%;background:${color}"></span></div></div>`).join('') || '<p class="muted small">Sem lançamentos.</p>'; };
  let body = '';
  if (S.fin.tab === 'ledger') {
    const q = S.fin.q.toLowerCase(), list = rows.filter(r => (S.fin.type === 'all' || r.type === S.fin.type) && (!q || (r.desc + r.cat).toLowerCase().includes(q))).sort((a, b) => b.date.localeCompare(a.date));
    body = `<div class="toolbar"><div class="seg">${[['all', 'Todos'], ['in', 'Entradas'], ['out', 'Saídas']].map(([k, l]) => `<button class="${S.fin.type === k ? 'on' : ''}" data-act="fin-type" data-v="${k}">${l}</button>`).join('')}</div><div class="search">${icon('search')}<input class="input" id="finQ" type="search" placeholder="Buscar lançamento..." value="${esc(S.fin.q)}" aria-label="Buscar lançamento"></div></div>
      ${list.length ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Origem</th><th class="num">Valor</th></tr></thead><tbody>${list.map(r => `<tr><td>${r.date.split('-').reverse().join('/')}</td><td><strong style="font-weight:600">${esc(r.desc)}</strong>${r.n ? ' ' + nTag(r.n, '') : ''}</td><td>${esc(r.cat)}</td><td>${srcTag(r.source)}</td><td class="num" style="font-weight:650;color:${r.type === 'in' ? 'var(--ok)' : 'var(--brand-ink)'}">${r.type === 'in' ? '+' : '−'} ${money(r.amount)}</td></tr>`).join('')}</tbody></table></div>` : emptyState('Nenhum lançamento', 'Não há lançamentos para este filtro no mês.')}`;
  }
  if (S.fin.tab === 'delinq') {
    const groups = Object.values(DELINQ.reduce((a, d) => { const k = d.athleteId || d.name; (a[k] = a[k] || { key: k, athlete: ATHLETES.find(x => x.id === d.athleteId), name: d.name, items: [] }).items.push(d); return a; }, {}))
      .map(g => ({ ...g, total: g.items.reduce((s, i) => s + i.amount, 0), days: Math.max(...g.items.map(i => Math.round((TODAY - parseYmd(i.due)) / 864e5))), contacted: g.items.map(i => i.contacted).filter(Boolean).sort().at(-1) })).sort((a, b) => b.days - a.days);
    const aging = [[0, 30], [31, 60], [61, 9999]].map(([a, b]) => groups.filter(g => g.days >= a && g.days <= b));
    body = `<div class="panel-pad" style="padding-bottom:0"><div class="grid g3">${['Até 30 dias', '31 a 60 dias', 'Mais de 60 dias'].map((l, i) => `<div class="preview"><small>${l}</small><strong style="font-size:18px">${money(aging[i].reduce((s, g) => s + g.total, 0))}</strong> <span class="muted small">· ${aging[i].length} atleta(s)</span></div>`).join('')}</div></div>
      <div class="table-wrap mt"><table><thead><tr><th>Atleta</th><th>Equipe</th><th>Parcelas em aberto</th><th class="num">Atraso</th><th class="num">Valor</th><th>Último contato</th><th></th></tr></thead><tbody>${groups.map(g => { const a = g.athlete, t = a ? teamOf(a.teamId) : null, tel = a ? (a.parentPhone || a.phone) : ''; return `<tr>
        <td><div class="person"><span class="avatar">${initials(a ? a.name : g.name)}</span><div><strong>${esc(a ? a.name : g.name)}</strong><small>${a && a.parentName ? 'Resp.: ' + esc(a.parentName) : fmtPhone(tel)}</small></div></div></td><td>${t ? esc(t.name) + ' ' + nTag(t.n, '') : '—'}</td><td>${g.items.map(i => `<span class="tag nodot">${i.ref}</span>`).join(' ')}</td>
        <td class="num"><span class="tag nodot ${g.days > 60 ? 'st-bad' : g.days > 30 ? 'st-warn' : ''}">${g.days} dias</span></td><td class="num"><strong>${money(g.total)}</strong></td><td>${g.contacted ? g.contacted.split('-').reverse().slice(0, 2).join('/') : '<span class="muted">—</span>'}</td>
        <td><div class="cell-actions" style="justify-content:flex-end">${tel ? `<button class="btn sm wa" data-act="fin-charge" data-k="${esc(g.key)}">${icon('whatsapp')} Cobrar</button>` : ''}<button class="btn sm" data-act="fin-settle" data-k="${esc(g.key)}" data-edit>Marcar pago</button></div></td></tr>`; }).join('') || `<tr><td colspan="7">${emptyState('Sem inadimplência', 'Nenhuma parcela vencida em aberto.')}</td></tr>`}</tbody></table></div>
      <div class="panel-foot"><span>Parcelas vencidas e não pagas segundo a última importação do Tecnofit.</span><span>“Marcar pago” registra a baixa aqui; confira também no Tecnofit.</span></div>`;
  }
  if (S.fin.tab === 'imports') body = `<div class="panel-pad"><div class="dropzone" id="dropzone">${icon('upload')}<h3 style="margin:8px 0 4px">Importar relatório do Tecnofit</h3><p class="muted small" style="margin:0 0 12px">Arraste o arquivo exportado (CSV) ou escolha no computador.</p><button class="btn primary" data-act="fin-import" data-edit>${icon('upload')} Iniciar importação</button></div>
    <h3 class="mt2">Histórico de importações</h3></div><div class="table-wrap"><table><thead><tr><th>Arquivo</th><th>Data</th><th class="num">Linhas</th><th>Por</th></tr></thead><tbody>${IMPORTS.map(i => `<tr><td>${icon('file')} ${esc(i.file)}</td><td>${i.at.split('-').reverse().join('/')}</td><td class="num">${i.rows}</td><td>${esc(i.by)}</td></tr>`).join('')}</tbody></table></div>`;
  return `${viewBanner('finance')}
  <div class="page-head"><div><div class="eyebrow">Finanças · entradas, saídas e inadimplência</div><h1>Financeiro</h1><p>Receitas vêm do Tecnofit por importação de relatórios; despesas e pagamentos de técnicos são lançados aqui.</p></div>
    <div class="head-actions"><select class="select" id="finMonth" aria-label="Mês" style="width:auto">${monthOptions(key)}</select><button class="btn" data-act="fin-import" data-edit>${icon('upload')} Importar do Tecnofit</button><button class="btn primary" data-act="fin-new" data-edit>${icon('plus')} Novo lançamento</button></div></div>
  <div class="grid g5 mb">${[['Entradas', money(t.inn), 'money', 'Tecnofit'], ['Saídas', money(t.out), 'wallet', 'Manual'], ['Saldo do mês', money(t.bal), 'trend', null], ['Inadimplência', money(delinq), 'alert', 'Tecnofit', `${delinqN} atletas · ${pct(delinq, expected, 1)} da receita prevista`], ['A receber no mês', money(Math.max(0, expected - t.mens)), 'clock', null, 'receita prevista − mensalidades recebidas']].map(([l, v, i, s, f]) => `<div class="kpi"><div class="kpi-label">${l}${icon(i)}</div><div class="kpi-value" ${l === 'Saldo do mês' ? `style="color:${t.bal >= 0 ? 'var(--ok)' : 'var(--brand-ink)'}"` : ''}>${v}</div><div class="kpi-foot">${f || monthLabel(key)}</div>${s ? `<div class="kpi-foot" style="margin-top:4px">${srcTag(s)}</div>` : ''}</div>`).join('')}</div>
  <div class="split-wide mb">
    <section class="panel"><div class="panel-head"><div><h2>Fluxo de caixa</h2><div class="sub">Últimos 6 meses</div></div><div class="legend"><span><i style="background:var(--ok)"></i>Entradas</span><span><i style="background:var(--brand)"></i>Saídas</span></div></div>
      <div class="panel-pad">${barChart({ labels: months.map(m => MON[m.getMonth()]), series: [{ name: 'Entradas', color: 'var(--ok)', values: mt.map(x => x.inn) }, { name: 'Saídas', color: 'var(--brand)', values: mt.map(x => x.out) }], fmt: v => 'R$ ' + Math.round(v / 100000) + ' mil' })}</div></section>
    <section class="panel"><div class="panel-head"><div><h2>Composição do mês</h2><div class="sub">${monthLabel(key)}</div></div></div>
      <div class="panel-pad"><h3 class="mb" style="color:var(--ok)">Entradas</h3>${catBlock('in', 'var(--ok)')}<h3 class="mb mt" style="color:var(--brand-ink)">Saídas</h3>${catBlock('out', 'var(--brand)')}</div></section>
  </div>
  <section class="panel"><div class="tabs">${[['ledger', 'Lançamentos', rows.length], ['delinq', 'Inadimplência', new Set(DELINQ.map(d => d.athleteId || d.name)).size], ['imports', 'Importações Tecnofit', IMPORTS.length]].map(([k, l, c]) => `<button class="${S.fin.tab === k ? 'on' : ''}" data-act="fin-tab" data-tab="${k}">${l} <span class="pill">${c}</span></button>`).join('')}</div>${body}</section>`;
}
function finNewForm() {
  openDialog(dHead('Novo lançamento', 'Entrada ou saída') + `<div class="d-body">
    <div class="field"><label>Tipo</label><div class="seg" id="fnType"><button type="button" data-v="in">Entrada</button><button type="button" class="on" data-v="out">Saída</button></div></div>
    <div class="field"><label for="fnDesc">Descrição *</label><input class="input" id="fnDesc" placeholder="Ex.: Compra de bolas"></div>
    <div class="row2"><div class="field"><label for="fnCat">Categoria</label><input class="input" id="fnCat" list="fnCats" placeholder="Material"><datalist id="fnCats">${[...new Set(LEDGER.map(l => l.cat))].map(c => `<option value="${esc(c)}">`).join('')}</datalist></div><div class="field"><label for="fnN">Núcleo</label><select class="select" id="fnN"><option value="">Geral</option>${NUCLEI.map(n => `<option value="${n.id}">${esc(n.name)}</option>`).join('')}</select></div></div>
    <div class="row2"><div class="field"><label for="fnDate">Data *</label><input class="input" type="date" id="fnDate" value="${ymd(TODAY)}"></div><div class="field"><label for="fnVal">Valor (R$) *</label><input class="input" type="number" min="0.01" step="0.01" id="fnVal"></div></div>
    <div class="err" id="fnErr" role="alert"></div></div><div class="d-foot"><button class="btn" data-act="close-dialog">Cancelar</button><button class="btn primary" data-act="fin-new-save">Salvar lançamento</button></div>`);
  const st = { type: 'out' }; $('#dlg')._fn = st;
  $('#fnType').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; st.type = b.dataset.v; $$('#fnType button').forEach(x => x.classList.toggle('on', x === b)); });
}
function finNewSave() {
  const st = $('#dlg')._fn, desc = $('#fnDesc').value.trim(), v = centsInput($('#fnVal').value), date = $('#fnDate').value;
  if (!desc || !(v > 0) || !date) { $('#fnErr').textContent = 'Informe descrição, data e valor.'; return; }
  LEDGER.push({ id: uid('l'), date, desc, cat: $('#fnCat').value.trim() || 'Outros', type: st.type, amount: v, source: 'Manual', n: $('#fnN').value || null });
  S.fin.month = date.slice(0, 7); closeDialog(); render(); toast('Lançamento registrado.');
}

/* Importação Tecnofit */
function sampleCsv() {
  const m = TODAY.getMonth(), y = TODAY.getFullYear(), d = n => `${pad(n)}/${pad(m + 1)}/${y}`, prevM = `${pad(10)}/${pad(m === 0 ? 12 : m)}/${m === 0 ? y - 1 : y}`;
  const rows = [['Data vencimento', 'Data pagamento', 'Cliente', 'Descrição', 'Valor', 'Situação', 'Forma de pagamento']];
  ATHLETES.filter(a => a.active).slice(0, 14).forEach((a, i) => {
    const p = PLANS.find(x => x.id === a.planId), val = ((p ? p.value : 15990) / 100).toFixed(2).replace('.', ',');
    if (i < 9) rows.push([d(10), d(Math.min(8 + i % 4, TODAY.getDate() || 1)), a.name, `Mensalidade ${MON[m]}/${y} - ${p ? p.days + 'x por semana' : 'plano'}`, val, 'Pago', i % 2 ? 'Pix' : 'Cartão de crédito']);
    else if (i < 12) rows.push([prevM, '', a.name, `Mensalidade ${MON[m === 0 ? 11 : m - 1]}/${m === 0 ? y - 1 : y}`, val, 'Vencido', '']);
    else rows.push([d(28), '', a.name, `Mensalidade ${MON[m]}/${y}`, val, 'Em aberto', '']);
  });
  rows.push([d(5), d(5), ATHLETES[3].name, 'Taxa de matrícula', '70,00', 'Pago', 'Pix']);
  return rows.map(r => r.join(';')).join('\n');
}
function parseCsv(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  const delim = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
  const split = l => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === delim && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map(s => s.trim()); };
  return { head: split(lines[0]), rows: lines.slice(1).map(split) };
}
const IMPORT_FIELDS = [['dueDate', 'Data de vencimento', /venc/i], ['payDate', 'Data de pagamento', /pagamento|pago em|recebi/i], ['client', 'Cliente / atleta', /cliente|aluno|nome|atleta/i], ['desc', 'Descrição', /descri|servi|plano|produto/i], ['value', 'Valor', /valor|total/i], ['status', 'Situação', /situa|status/i]];
function importWizard() {
  openDialog(dHead('Importar do Tecnofit', 'Recebimentos e inadimplência', 'Passo 1 de 3 · escolha o arquivo exportado') + `<div class="d-body">
    <div class="stepper"><span class="cur"><b>1</b>Arquivo</span><i></i><span><b>2</b>Conferir</span><i></i><span><b>3</b>Concluído</span></div>
    <div class="banner note">${icon('info')}<div class="small"><b>Como exportar no Tecnofit:</b> abra o relatório financeiro de recebimentos / contas a receber, filtre o período desejado e exporte em planilha. Salve como CSV. O painel reconhece as colunas automaticamente e você confere antes de gravar.<br><br><b>Sem digitação manual:</b> pagos viram entradas, vencidos viram inadimplência e linhas já importadas são ignoradas. A integração direta por API depende de liberação do Tecnofit — a confirmar com o suporte; com ela, esta etapa passaria a ser automática.</div></div>
    <label class="dropzone" id="imDrop" style="display:block;cursor:pointer">${icon('upload')}<h3 style="margin:8px 0 4px">Arraste o arquivo aqui ou clique para escolher</h3><p class="muted small" style="margin:0">.csv (separado por ponto e vírgula ou vírgula)</p><input type="file" id="imFile" accept=".csv,text/csv" class="sr"></label>
    <div style="text-align:center;margin-top:12px"><button class="btn sm" data-act="im-sample">${icon('file')} Usar arquivo de exemplo</button></div><div class="err" id="imErr" role="alert"></div></div>`, 'drawer wide');
  const drop = $('#imDrop'), read = f => { if (!/\.csv$/i.test(f.name)) { $('#imErr').textContent = 'No protótipo, use arquivos .csv (no Excel: Salvar como → CSV).'; return; } f.text().then(t => importReview(t, f.name)); };
  $('#imFile').addEventListener('change', e => e.target.files[0] && read(e.target.files[0]));
  ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag'); }));
  drop.addEventListener('drop', e => e.dataTransfer.files[0] && read(e.dataTransfer.files[0]));
}
function importReview(text, file) {
  let data; try { data = parseCsv(text); } catch { data = null; }
  if (!data || !data.rows.length) { $('#imErr').textContent = 'Não foi possível ler o arquivo.'; return; }
  const map = Object.fromEntries(IMPORT_FIELDS.map(([k, , re]) => [k, data.head.findIndex(h => re.test(h))]));
  const st = { data, file, map };
  const classify = () => {
    const g = (r, k) => st.map[k] >= 0 ? r[st.map[k]] : '';
    return st.data.rows.map(r => {
      const status = g(r, 'status').toLowerCase(), value = cents(g(r, 'value')), [dd, mm, yy] = (g(r, 'payDate') || g(r, 'dueDate')).split('/'), date = yy ? `${yy}-${mm}-${dd}` : '';
      const due = (() => { const [a, b, c] = g(r, 'dueDate').split('/'); return c ? `${c}-${b}-${a}` : date; })();
      const client = g(r, 'client'), desc = g(r, 'desc');
      const kind = /pag|receb|quit/.test(status) ? 'in' : /venc|atras/.test(status) || (due && parseYmd(due) < TODAY && /aberto|pend/.test(status)) ? 'late' : 'open';
      const dup = kind === 'in' && LEDGER.some(l => l.importKey === `${client}|${date}|${value}`);
      return { client, desc, value, date, due, kind, dup, status: g(r, 'status') };
    });
  };
  const draw = () => {
    const rows = classify(), c = k => rows.filter(r => r.kind === k && !r.dup);
    $('#dlg')._im = { ...st, rows };
    $('#dlg').querySelector('.d-body').innerHTML = `<div class="stepper"><span class="done"><b>✓</b>Arquivo</span><i></i><span class="cur"><b>2</b>Conferir</span><i></i><span><b>3</b>Concluído</span></div>
      <p class="small" style="margin-top:0">${icon('file')} <b>${esc(file)}</b> · ${rows.length} linhas</p>
      <h3>Colunas reconhecidas</h3><div class="grid g3 mt mb" style="gap:10px">${IMPORT_FIELDS.map(([k, l]) => `<div class="field" style="margin:0"><label for="map_${k}">${l}</label><select class="select" id="map_${k}" data-map="${k}"><option value="-1">— ignorar —</option>${st.data.head.map((h, i) => `<option value="${i}" ${st.map[k] === i ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select></div>`).join('')}</div>
      <div class="grid g4 mb" style="gap:10px">${[['Viram entradas', c('in').length, money(c('in').reduce((s, r) => s + r.value, 0)), 'st-ok'], ['Viram inadimplência', c('late').length, money(c('late').reduce((s, r) => s + r.value, 0)), 'st-bad'], ['A vencer (ignoradas)', c('open').length, money(c('open').reduce((s, r) => s + r.value, 0)), ''], ['Já importadas', rows.filter(r => r.dup).length, 'serão ignoradas', '']].map(([l, n, v, cl]) => `<div class="preview"><small>${l}</small><strong style="font-size:18px">${n}</strong> <span class="tag nodot ${cl}">${v}</span></div>`).join('')}</div>
      <div class="table-wrap" style="margin:0 -24px"><table><thead><tr><th>Cliente</th><th>Descrição</th><th>Data</th><th class="num">Valor</th><th>Resultado</th></tr></thead><tbody>${rows.slice(0, 12).map(r => `<tr><td>${esc(r.client)}</td><td class="small">${esc(r.desc)}</td><td>${r.date ? r.date.split('-').reverse().join('/') : '—'}</td><td class="num">${Number.isFinite(r.value) ? money(r.value) : '?'}</td><td>${r.dup ? '<span class="tag nodot">Duplicada</span>' : r.kind === 'in' ? '<span class="tag st-ok nodot">Entrada</span>' : r.kind === 'late' ? '<span class="tag st-bad nodot">Inadimplência</span>' : '<span class="tag nodot">A vencer</span>'}</td></tr>`).join('')}</tbody></table></div>
      ${rows.length > 12 ? `<p class="hint">+ ${rows.length - 12} linhas</p>` : ''}`;
    $('#dlg').querySelector('.d-body').addEventListener('change', e => { if (e.target.dataset.map) { st.map[e.target.dataset.map] = Number(e.target.value); draw(); } }, { once: true });
  };
  $('#dlg').querySelector('.d-head p').textContent = 'Passo 2 de 3 · confira antes de gravar';
  $('#dlg').insertAdjacentHTML('beforeend', `<div class="d-foot"><button class="btn left" data-act="fin-import">Trocar arquivo</button><button class="btn" data-act="close-dialog">Cancelar</button><button class="btn primary" data-act="im-commit">${icon('check')} Importar</button></div>`);
  draw();
}
function importCommit() {
  const im = $('#dlg')._im; let nIn = 0, nLate = 0;
  im.rows.filter(r => !r.dup && Number.isFinite(r.value)).forEach(r => {
    const a = ATHLETES.find(x => x.name.toLowerCase() === r.client.toLowerCase());
    if (r.kind === 'in') { LEDGER.push({ id: uid('l'), date: r.date || ymd(TODAY), desc: `${r.desc || 'Recebimento'} — ${r.client}`, cat: /matr/i.test(r.desc) ? 'Matrículas' : 'Mensalidades', type: 'in', amount: r.value, source: 'Tecnofit', n: a ? teamOf(a.teamId).n : null, importKey: `${r.client}|${r.date}|${r.value}` }); nIn++; }
    if (r.kind === 'late' && !DELINQ.some(d => (d.athleteId && a && d.athleteId === a.id || d.name === r.client) && d.due === r.due)) { const dd = parseYmd(r.due); DELINQ.push({ id: uid('d'), athleteId: a ? a.id : null, name: r.client, ref: `${MON[dd.getMonth()]}/${dd.getFullYear()}`, due: r.due, amount: r.value, contacted: null, source: 'Tecnofit' }); nLate++; }
  });
  IMPORTS.unshift({ file: im.file, at: ymd(TODAY), rows: im.rows.length, by: me().name });
  render();
  openDialog(dHead('Importar do Tecnofit', 'Importação concluída') + `<div class="d-body" style="text-align:center"><div class="stepper"><span class="done"><b>✓</b>Arquivo</span><i></i><span class="done"><b>✓</b>Conferir</span><i></i><span class="cur"><b>3</b>Concluído</span></div>
    <div style="width:54px;height:54px;border-radius:50%;background:var(--ok-soft);color:var(--ok);display:grid;place-items:center;margin:4px auto 12px">${icon('check')}</div><h3 style="font-size:18px">${nIn} entradas e ${nLate} parcelas em atraso registradas</h3><p class="muted">Visão geral, projeções e inadimplência já refletem os novos dados.</p></div>
    <div class="d-foot"><button class="btn" data-act="fin-goto" data-tab="delinq">Ver inadimplência</button><button class="btn primary" data-act="close-dialog">Concluir</button></div>`);
}
function chargeMessage(key) {
  const items = DELINQ.filter(d => (d.athleteId || d.name) === key), a = ATHLETES.find(x => x.id === items[0].athleteId);
  const to = a ? (a.parentName || a.name) : items[0].name, tel = a ? (a.parentPhone || a.phone) : '';
  const text = `Olá, ${to.split(' ')[0]}! Tudo bem? Aqui é da Apollo Voleibol. Identificamos ${items.length > 1 ? 'as mensalidades' : 'a mensalidade'} ${items.map(i => i.ref).join(', ')}${a && a.parentName ? ' de ' + a.name.split(' ')[0] : ''} em aberto, no total de ${money(items.reduce((s, i) => s + i.amount, 0))}. Se já pagou, desconsidere. Qualquer dúvida, estamos à disposição! 🏐`;
  const d2 = $('#dlg2');
  d2.innerHTML = `<div class="d-head"><div><div class="eyebrow">Cobrança amigável</div><h2 id="dlg2Title">Mensagem para ${esc(to)}</h2></div></div><div class="d-body"><textarea class="input" id="chText" rows="6">${esc(text)}</textarea><p class="hint">Ao abrir o WhatsApp, o contato fica registrado como “último contato”.</p></div>
    <div class="d-foot"><button class="btn" data-r="close">Fechar</button><a class="btn wa" data-r="open" href="https://wa.me/55${digits(tel)}" target="_blank" rel="noopener">${icon('whatsapp')} Abrir WhatsApp</a></div>`;
  d2.onclick = e => { const r = e.target.closest('[data-r]'); if (!r) return; if (r.dataset.r === 'open') { r.href = `https://wa.me/55${digits(tel)}?text=${encodeURIComponent($('#chText').value)}`; items.forEach(i => { i.contacted = ymd(TODAY); }); setTimeout(render, 50); } d2.close(); };
  d2.showModal();
}

/* ═══════════════ CONFIGURAÇÕES ═══════════════ */
const permCount = u => ({ e: PAGES.filter(p => perm(p.id, u) === 'edit').length, v: PAGES.filter(p => perm(p.id, u) === 'view').length });
function renderSettings() {
  let body = '';
  if (S.st.tab === 'users') body = `<div class="table-wrap"><table><thead><tr><th>Usuário</th><th>Perfil</th><th>Acesso por página</th><th>Status</th><th>Último acesso</th><th></th></tr></thead><tbody>${USERS.map(u => { const c = permCount(u); return `<tr class="rowlink" data-act="user-open" data-id="${u.id}" tabindex="0">
      <td><div class="person"><span class="avatar">${initials(u.name)}</span><div><strong>${esc(u.name)}${u.id === S.userId ? '<span class="you-tag">VOCÊ</span>' : ''}</strong><small>${esc(u.email)}</small></div></div></td>
      <td><span class="role-pill">${u.unassigned && PORTAL_ACCESS.some(link => link.user_id === u.id) ? 'Área do atleta' : esc(u.role)}</span>${presetDiff(u) && !u.unassigned ? ' <span class="hint">ajustado</span>' : ''}${u.coachId ? `<div class="hint">${TEAMS.filter(t => t.coach === u.coachId).length} equipe(s)</div>` : ''}</td>
      <td><div class="perm-dots" title="${PAGES.map(p => p.label + ': ' + ({ edit: 'edição', view: 'visualização', none: 'sem acesso' }[perm(p.id, u)])).join('\n')}">${PAGES.map(p => `<i class="${perm(p.id, u) === 'edit' ? 'e' : perm(p.id, u) === 'view' ? 'v' : ''}"></i>`).join('')}</div><div class="hint">${c.e === PAGES.length ? 'Edita todas as páginas' : c.e ? `Edita ${c.e}${c.v ? ` · consulta ${c.v}` : ''} de ${PAGES.length}` : c.v ? `Só consulta ${c.v} de ${PAGES.length}` : 'Sem acesso'}</div></td>
      <td>${u.unassigned ? `<span class="tag">${PORTAL_ACCESS.some(link => link.user_id === u.id) ? 'Área do atleta' : 'Sem acesso à v2'}</span>` : u.active ? '<span class="tag st-ok">Ativo</span>' : '<span class="tag">Inativo</span>'}</td><td class="muted small">${u.last && u.last !== '—' ? esc(u.last) : 'Sem registro'}</td><td style="text-align:right"><button class="btn sm">Gerenciar</button></td></tr>`; }).join('')}</tbody></table></div>
    <div class="panel-foot"><span class="legend"><span><i style="background:var(--ok)"></i>Edição</span><span><i style="background:color-mix(in srgb,var(--info) 55%,transparent)"></i>Somente visualização</span><span><i style="background:var(--line)"></i>Sem acesso</span></span><span>Ordem dos quadrados: ${PAGES.map(p => p.label).join(' · ')}</span></div>`;
  if (S.st.tab === 'roles') body = `<div class="panel-pad"><p class="muted small" style="margin-top:0">Perfis são modelos: ao escolher um perfil para um usuário, as permissões são preenchidas e ainda podem ser ajustadas página a página. Páginas com dados financeiros ficam restritas aos perfis Administrador e Financeiro; o perfil Técnico enxerga apenas as próprias equipes.</p></div><div class="table-wrap"><table class="perm-table"><thead><tr><th>Página</th>${Object.keys(ROLE_PRESETS).map(r => `<th>${esc(r)}</th>`).join('')}</tr></thead><tbody>${PAGES.map(p => `<tr><td>${icon(p.icon)} ${esc(p.label)}${FIN_PAGES.includes(p.id) ? ' <span class="src proposta">financeiro</span>' : ''}</td>${Object.values(ROLE_PRESETS).map(r => `<td>${r[p.id] === 'edit' ? '<span class="tag st-ok nodot">Editar</span>' : r[p.id] === 'view' ? '<span class="tag st-info nodot">Visualizar</span>' : '<span class="muted">—</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  if (S.st.tab === 'portal') body = `<div class="panel-pad"><div class="head-actions"><button class="btn primary" data-act="portal-invite" data-edit>${icon('plus')} Convidar responsável ou atleta</button><button class="btn" data-act="portal-link" data-edit>Vincular conta existente</button></div><p class="hint mt">Para menores, o acesso pertence ao responsável. Adultos usam a própria conta. Cada vínculo é autorizado por administrador e pode ser removido aqui.</p></div><div class="table-wrap"><table><thead><tr><th>Conta</th><th>Atleta</th><th>Relação</th><th></th></tr></thead><tbody>${PORTAL_ACCESS.map(link => `<tr><td><strong>${esc(link.userName)}</strong><div class="hint">${esc(link.userEmail)}</div></td><td>${esc(link.athleteName)}</td><td>${link.relation === 'guardian' ? 'Responsável' : 'Próprio atleta'}</td><td><button class="btn sm danger" data-act="portal-unlink" data-user="${link.user_id}" data-athlete="${link.athlete_id}" data-edit>Desvincular</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">Nenhum acesso à Área do atleta vinculado.</td></tr>'}</tbody></table></div>`;
  return `${viewBanner('settings')}
  <div class="page-head"><div><div class="eyebrow">Sistema</div><h1>Configurações</h1><p>Gerencie quem acessa o painel e o que cada pessoa pode ver ou alterar em cada página.</p></div>
    <div class="head-actions"><button class="btn primary" data-act="user-new" data-edit>${icon('plus')} Convidar usuário</button></div></div>
  <div class="banner note">${icon('shield')}<div class="small"><b>Dois modos por página:</b> <b>Visualizar</b> permite consultar; <b>Editar</b> permite criar, alterar, arquivar e excluir (e inclui visualizar). Sem nenhum dos dois, a página some do menu. As permissões valem também no banco de dados, não só na tela.</div></div>
  <section class="panel"><div class="tabs">${[['users', 'Usuários do painel', USERS.length], ['roles', 'Perfis de acesso', Object.keys(ROLE_PRESETS).length], ['portal', 'Área do atleta', PORTAL_ACCESS.length]].map(([k, l, c]) => `<button class="${S.st.tab === k ? 'on' : ''}" data-act="st-tab" data-tab="${k}">${l} <span class="pill">${c}</span></button>`).join('')}</div>${body}</section>`;
}
let UE = null;
const presetDiff = u => ROLE_PRESETS[u.role] && PAGES.some(p => !(FIN_PAGES.includes(p.id) && !FIN_ROLES.includes(u.role)) && ROLE_PRESETS[u.role][p.id] !== u.perms[p.id]);
function userDrawer(id) {
  const u = id ? USERS.find(x => x.id === id) : { id: uid('u'), name: '', email: '', role: 'Atendimento', active: true, last: 'Convite pendente', perms: { ...ROLE_PRESETS['Atendimento'] }, isNew: true };
  UE = JSON.parse(JSON.stringify(u)); drawUser();
}
function drawUser() {
  const u = UE, ro = !canEdit('settings'), finOk = FIN_ROLES.includes(u.role);
  const eff = p => FIN_PAGES.includes(p) && !finOk ? 'none' : u.perms[p];
  const c = { e: PAGES.filter(p => eff(p.id) === 'edit').length, v: PAGES.filter(p => eff(p.id) === 'view').length };
  const coachTeams = u.coachId ? TEAMS.filter(t => t.coach === u.coachId).map(t => esc(t.name)).join(', ') : '';
  const row = p => {
    const locked = FIN_PAGES.includes(p.id) && !finOk, v = eff(p.id);
    return `<tr><td>${icon(p.icon)} ${esc(p.label)}${FIN_PAGES.includes(p.id) ? ' <span class="src proposta" title="Dados financeiros">financeiro</span>' : ''}</td>
      <td><input type="checkbox" data-perm="${p.id}" data-k="view" ${v !== 'none' ? 'checked' : ''} ${locked ? 'disabled' : ''} aria-label="Visualizar ${esc(p.label)}"></td>
      <td><input type="checkbox" data-perm="${p.id}" data-k="edit" ${v === 'edit' ? 'checked' : ''} ${locked ? 'disabled' : ''} aria-label="Editar ${esc(p.label)}"></td>
      <td>${locked ? `<span class="muted small">${icon('lock', 'i" style="width:13px;height:13px;vertical-align:-2px')} Só Administrador e Financeiro</span>` : v === 'edit' ? '<span class="tag st-ok nodot">Consulta e altera</span>' : v === 'view' ? '<span class="tag st-info nodot">Só consulta</span>' : '<span class="muted small">Oculta no menu</span>'}</td></tr>`;
  };
  openDialog(dHead(u.isNew ? 'Convidar usuário' : 'Usuário do painel', u.isNew ? 'Novo acesso' : esc(u.name), u.isNew ? 'A pessoa recebe um convite por e-mail para entrar com Google.' : esc(u.email)) + `<div class="d-body"><fieldset class="plain" ${ro ? 'disabled' : ''}>
    <div class="row2"><div class="field"><label for="ueName">Nome *</label><input class="input" id="ueName" value="${esc(u.name)}" ${u.isNew ? '' : 'readonly'}></div><div class="field"><label for="ueEmail">E-mail *</label><input class="input" type="email" id="ueEmail" value="${esc(u.email)}" ${u.isNew ? '' : 'readonly'}></div></div>
    <div class="row2"><div class="field"><label for="ueRole">Perfil</label><select class="select" id="ueRole">${Object.keys(ROLE_PRESETS).filter(r => (u.isNew || u.unassigned) && r === 'Administrador' ? false : u.legacyRole === 'admin' || (u.id === S.userId && u.role === 'Administrador') ? r === 'Administrador' : true).map(r => `<option ${u.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select><span class="hint">${presetDiff(u) ? 'Permissões ajustadas manualmente a partir do perfil.' : 'Preenche as permissões abaixo; você ainda pode ajustá-las.'} ${u.isNew ? 'Para conceder Administração, promova depois uma conta ativa já cadastrada no painel.' : ''}</span></div>
      <div class="field"><label>Acesso</label><label class="check" style="height:40px"><span class="toggle"><input type="checkbox" id="ueActive" ${u.active ? 'checked' : ''} ${u.id === S.userId && u.role === 'Administrador' ? 'disabled' : ''}><span></span></span> ${u.active ? 'Ativo — pode entrar no painel' : 'Inativo — acesso bloqueado'}</label></div></div>
    ${u.role === 'Técnico' ? `<div class="hint">${coachTeams ? 'Equipes vinculadas: ' + coachTeams + '.' : 'Vincule este técnico às equipes na página Equipes e núcleos.'}</div>` : ''}
    ${u.role === 'Administrador' && u.legacyRole !== 'admin' ? `<div class="banner note">${icon('shield')}<span>Este perfil concede administração completa do Huddle v2, inclusive dados financeiros e gestão de usuários. O painel v1 mantém as permissões atuais desta pessoa.</span></div>` : ''}
    ${finOk ? '' : `<div class="banner view">${icon('lock')}<span class="small">Dados financeiros (Pacotes e mensalidades, Pagamentos e Financeiro) só podem ser acessados, mesmo em visualização, pelos perfis <b>Administrador</b> e <b>Financeiro</b>. Para este perfil, valores de mensalidade e dados bancários também ficam ocultos nas demais páginas.</span></div>`}
    <h3 class="mt">Permissões por página</h3><p class="hint" style="margin:2px 0 8px">${c.e} com edição · ${c.v} somente visualização · ${PAGES.length - c.e - c.v} sem acesso</p>
    <div class="table-wrap" style="margin:0 -24px"><table class="perm-table"><thead><tr><th>Página</th><th>Visualizar</th><th>Editar</th><th>Resultado</th></tr></thead><tbody>${PAGES.map(row).join('')}</tbody></table></div>
    <div class="err" id="ueErr" role="alert"></div></fieldset></div>
    <div class="d-foot"><button class="btn" data-act="close-dialog">${ro ? 'Fechar' : 'Cancelar'}</button>${ro ? '' : `<button class="btn primary" data-act="user-save">${u.isNew ? 'Criar acesso' : 'Salvar permissões'}</button>`}</div>`, 'drawer wide');
  const body = $('#dlg .d-body');
  body.addEventListener('change', e => {
    const el = e.target, grab = () => { UE.name = $('#ueName').value; UE.email = $('#ueEmail').value; UE.active = $('#ueActive').checked; if ($('#ueCoach')) UE.coachId = $('#ueCoach').value || null; };
    if (el.id === 'ueRole') { grab(); UE.role = el.value; UE.perms = { ...ROLE_PRESETS[el.value] }; if (el.value !== 'Técnico') UE.coachId = null; drawUser(); }
    else if (el.dataset.perm) { grab(); const p = el.dataset.perm; if (el.dataset.k === 'edit') UE.perms[p] = el.checked ? 'edit' : 'view'; else UE.perms[p] = el.checked ? (UE.perms[p] === 'edit' ? 'edit' : 'view') : 'none'; drawUser(); }
    else if (el.id === 'ueActive' || el.id === 'ueCoach') { grab(); drawUser(); }
  });
}
async function saveUser() {
  UE.name = $('#ueName').value.trim(); UE.email = $('#ueEmail').value.trim(); UE.active = $('#ueActive').checked;
  if (!UE.name || !/^\S+@\S+\.\S+$/.test(UE.email)) { $('#ueErr').textContent = 'Informe nome e um e-mail válido.'; return; }
  if (!FIN_ROLES.includes(UE.role)) FIN_PAGES.forEach(p => { UE.perms[p] = 'none'; });
  const role = { Administrador: 'admin', Financeiro: 'finance', 'Coordenação técnica': 'coordination', Atendimento: 'attendance', 'Técnico': 'coach' }[UE.role];
  if (UE.isNew && role === 'admin') { $('#ueErr').textContent = 'Convide primeiro a pessoa e depois promova a conta ativa.'; return; }
  const button = $('#dlg [data-act="user-save"]'); button.disabled = true;
  $('#ueErr').textContent = '';
  try {
    const previousRole = UE.isNew ? '' : USERS.find(user => user.id === UE.id)?.role;
    if (role === 'admin' && previousRole !== 'Administrador') {
      const confirmed = await confirmBox({ title: 'Promover a Administrador?', text: `${esc(UE.name)} terá acesso integral ao Huddle v2, inclusive finanças, configurações e gestão de usuários. O painel v1 não recebe esta promoção.`, ok: 'Promover' });
      if (!confirmed) { button.disabled = false; return; }
    }
    if (UE.isNew) {
      const { error } = await financeDbClient().functions.invoke('v2-invite-user', {
        body: { email: UE.email, fullName: UE.name, role, permissions: UE.perms }
      });
      if (error) {
        let response = null;
        try { if (error.context?.json) response = await error.context.json(); } catch { }
        throw new Error(response?.error || error.message);
      }
      toast(`Acesso criado. Peça para ${UE.email} entrar com Google.`);
    } else {
      const { error } = await financeDbClient().rpc('v2_admin_set_staff', {
        p_user: UE.id, p_role: role, p_permissions: UE.perms, p_active: UE.active
      });
      if (error) throw error;
      toast('Permissões salvas no banco.');
    }
    closeDialog(); await liveReload(); fillViewAs();
  } catch (error) {
    $('#ueErr').textContent = `Não foi possível salvar: ${error.message}`;
    button.disabled = false;
  }
}

function portalAccountRelation(athlete) {
  if (!athlete?.birth) return null;
  const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 18);
  return athlete.birth <= ymd(cutoff) ? 'self' : 'guardian';
}
function portalAthleteOptions() {
  return ATHLETES.filter(a => a.active && a.birth).sort((a, b) => a.name.localeCompare(b.name))
    .map(a => `<option value="${a.id}">${esc(a.name)} · ${esc(teamOf(a.teamId)?.name || 'Sem equipe')}</option>`).join('');
}
function portalInviteForm() {
  openDialog(dHead('Convidar para a Área do atleta', 'Responsável ou atleta adulto') + `<div class="d-body">
    <div class="field"><label for="piName">Nome da pessoa convidada</label><input class="input" id="piName" autocomplete="name"></div>
    <div class="field"><label for="piEmail">E-mail da conta</label><input class="input" type="email" id="piEmail" autocomplete="email"></div>
    <div class="field"><label for="piAthlete">Atleta vinculado</label><select class="select" id="piAthlete"><option value="">Selecione...</option>${portalAthleteOptions()}</select></div>
    <p class="hint">Para menores, convide o responsável legal. Um adulto recebe acesso somente ao próprio cadastro. Confirme a identidade antes de criar o acesso. A pessoa entra com Google usando este e-mail.</p>
    <div class="err" id="piError" role="alert"></div></div>
    <div class="d-foot"><button class="btn" data-act="close-dialog">Cancelar</button><button class="btn primary" data-act="portal-invite-save" data-edit>Criar acesso</button></div>`, 'drawer');
}
async function portalInviteSave() {
  const fullName = $('#piName').value.trim(), email = $('#piEmail').value.trim();
  const athlete = ATHLETES.find(a => a.id === $('#piAthlete').value);
  const relation = portalAccountRelation(athlete), errorBox = $('#piError');
  if (!fullName || !/^\S+@\S+\.\S+$/.test(email) || !relation) {
    errorBox.textContent = 'Informe nome, e-mail válido e um atleta com data de nascimento.'; return;
  }
  const button = $('#dlg [data-act="portal-invite-save"]'); button.disabled = true;
  try {
    const { error } = await financeDbClient().functions.invoke('v2-invite-user', {
      body: { fullName, email, role: relation === 'guardian' ? 'guardian' : 'athlete', athleteId: athlete.id }
    });
    if (error) {
      let response = null;
      try { if (error.context?.json) response = await error.context.json(); } catch { }
      throw new Error(response?.error || error.message);
    }
    closeDialog(); await liveReload(); toast(`Acesso criado. Peça para ${email} entrar com Google.`);
  } catch (error) { errorBox.textContent = `Não foi possível convidar: ${error.message}`; button.disabled = false; }
}
function portalLinkForm() {
  openDialog(dHead('Vincular conta existente', 'Área do atleta') + `<div class="d-body">
    <div class="field"><label for="plUser">Conta autenticada</label><select class="select" id="plUser"><option value="">Selecione...</option>${USERS.map(u => `<option value="${u.id}">${esc(u.name)} · ${esc(u.email)}</option>`).join('')}</select></div>
    <div class="field"><label for="plAthlete">Atleta</label><select class="select" id="plAthlete"><option value="">Selecione...</option>${portalAthleteOptions()}</select></div>
    <p class="hint">Confira a identidade da conta e o vínculo familiar antes de conceder acesso aos dados do atleta.</p>
    <div class="err" id="plError" role="alert"></div></div><div class="d-foot"><button class="btn" data-act="close-dialog">Cancelar</button><button class="btn primary" data-act="portal-link-save" data-edit>Vincular</button></div>`, 'drawer');
}
async function portalLinkSave() {
  const userId = $('#plUser').value, athlete = ATHLETES.find(a => a.id === $('#plAthlete').value);
  const relation = portalAccountRelation(athlete), errorBox = $('#plError');
  if (!userId || !relation) { errorBox.textContent = 'Selecione uma conta e um atleta com data de nascimento.'; return; }
  const button = $('#dlg [data-act="portal-link-save"]'); button.disabled = true;
  try {
    const { error } = await financeDbClient().rpc('v2_admin_link_athlete', {
      p_user: userId, p_athlete: athlete.id, p_relation: relation
    });
    if (error) throw error;
    closeDialog(); await liveReload(); toast('Acesso do atleta vinculado.');
  } catch (error) { errorBox.textContent = `Não foi possível vincular: ${error.message}`; button.disabled = false; }
}
async function portalUnlink(userId, athleteId) {
  if (!await confirmBox({ title: 'Desvincular acesso?', text: 'A conta deixará de ver este atleta na Área do atleta.', ok: 'Desvincular', danger: true })) return;
  const { error } = await financeDbClient().rpc('v2_admin_unlink_athlete', {
    p_user: userId, p_athlete: athleteId
  });
  if (error) return toast(error.message, true);
  await liveReload(); toast('Acesso removido.');
}
