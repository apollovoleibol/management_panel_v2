/* Mensalidades (Asaas): visão do mês, atrasos e mensalidades por atleta.
   A administração cria a mensalidade; quem paga (atleta adulto ou responsável) escolhe a forma na Área do atleta. */
'use strict';

const BILL = { loaded: false, loading: false, error: '', subs: [], pays: [], customers: new Map() };
const BILL_SANDBOX = true;
const BILL_VIEW = { tab: 'month', q: '' };
const BILL_PAID = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH']);
const BILL_OPEN = new Set(['PENDING', 'OVERDUE']);
const payStatus = { PENDING: ['A vencer', 'st-pendente'], RECEIVED: ['Pago', 'st-ok'], CONFIRMED: ['Pago', 'st-ok'], RECEIVED_IN_CASH: ['Pago em dinheiro', 'st-ok'],
  OVERDUE: ['Em atraso', 'st-bad'], REFUNDED: ['Estornado', 'st-cancelado'], DELETED: ['Removido', 'st-cancelado'] };
const billTag = ([l, c]) => `<span class="tag nodot ${c}">${esc(l)}</span>`;
const billToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const billDate = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—';
const billPayTotal = p => p.value_cents ?? 0;

// Situação da mensalidade (assinatura) em linguagem do dia a dia
function billSubState(s) {
  if (s.status === 'awaiting_choice') return ['Aguardando escolha da família', 'st-warn'];
  if (s.status === 'choosing') return ['Registrando escolha', 'st-warn'];
  if (s.status === 'canceled') return ['Cancelada', 'st-cancelado'];
  if (s.status === 'expired') return ['Link expirado', 'st-bad'];
  if (s.status === 'pending' && s.automatic_mode === 'PIX_AUTOMATIC') return ['Aguardando autorização do Pix', 'st-warn'];
  if (s.status === 'pending' && s.method === 'CREDIT_CARD') return ['Aguardando cadastro do cartão', 'st-warn'];
  return ['Ativa', 'st-ok'];
}
function billMethod(s) {
  if (['awaiting_choice', 'choosing'].includes(s.status)) return '<span class="muted">A família escolhe</span>';
  if (s.automatic_mode === 'PIX_AUTOMATIC') return 'Pix Automático';
  return s.method === 'CREDIT_CARD' ? 'Cartão recorrente' : 'Pix mensal';
}
const billAutomatic = s => s.status === 'active' && (s.method === 'CREDIT_CARD' || s.automatic_mode === 'PIX_AUTOMATIC');

async function billingLoad(force = false) {
  if (BILL.loading || (BILL.loaded && !force)) return;
  BILL.loading = true; BILL.error = '';
  try {
    const db = financeDbClient();
    const [s, p, c] = await Promise.all([
      db.from('billing_subscriptions').select('*').order('created_at', { ascending: false }),
      db.from('billing_payments').select('*').order('due_date', { ascending: true }),
      db.from('billing_customers').select('id,name,cpf_cnpj,email,phone')
    ]);
    if (s.error || p.error || c.error) throw (s.error || p.error || c.error);
    BILL.subs = s.data; BILL.pays = p.data; BILL.customers = new Map(c.data.map(x => [x.id, x]));
    BILL.loaded = true;
  } catch (e) { BILL.error = e.message || 'Não foi possível carregar as mensalidades.'; }
  BILL.loading = false;
  if (S.page === 'billing') render();
}

function billAthleteCell(athleteId, sub) {
  const a = ATHLETES.find(x => x.id === athleteId), c = sub && BILL.customers.get(sub.customer_id);
  return `<strong>${esc(a?.name || 'Atleta')}</strong><div class="hint">${esc(teamOf(a?.teamId)?.name || '')}${c ? ` · paga: ${esc(String(c.name).split(' ')[0])}` : ''}</div>`;
}
function billMatches(athleteId) {
  const q = BILL_VIEW.q.trim().toLowerCase();
  if (!q) return true;
  const a = ATHLETES.find(x => x.id === athleteId);
  return String(a?.name || '').toLowerCase().includes(q);
}

function renderBilling() {
  if (!BILL.loaded && !BILL.loading) billingLoad();
  const today = billToday(), cur = today.slice(0, 7);
  const subOf = id => BILL.subs.find(s => s.id === id);
  const pays = BILL.pays.filter(p => p.status !== 'DELETED');
  const monthPays = pays.filter(p => String(p.due_date || '').startsWith(cur));
  const paidMonth = pays.filter(p => BILL_PAID.has(p.status) && String(p.paid_at || '').startsWith(cur));
  const toReceive = monthPays.filter(p => BILL_OPEN.has(p.status) && p.due_date >= today);
  const overdue = pays.filter(p => BILL_OPEN.has(p.status) && (p.status === 'OVERDUE' || p.due_date < today));
  const live = BILL.subs.filter(s => !['canceled', 'expired'].includes(s.status));
  const auto = live.filter(billAutomatic).length, waiting = live.filter(s => s.status === 'awaiting_choice').length;
  const sum = list => list.reduce((n, p) => n + billPayTotal(p), 0);
  const kpis = [
    ['Recebido no mês', money(sum(paidMonth)), `${paidMonth.length} pagamento(s) em ${MONTHS[TODAY.getMonth()]}`, 'money'],
    ['A receber no mês', money(sum(toReceive)), `${toReceive.length} cobrança(s) dentro do prazo`, 'clock'],
    ['Em atraso', money(sum(overdue)), `${new Set(overdue.map(p => p.athlete_id)).size} atleta(s)`, 'alert'],
    ['Pagamento automático', live.length ? `${Math.round(auto / live.length * 100)}%` : '—', `${auto} de ${live.length} mensalidades${waiting ? ` · ${waiting} aguardando escolha` : ''}`, 'check'],
  ];
  const tabs = [['month', 'Este mês', monthPays.length], ['overdue', 'Em atraso', overdue.length], ['subs', 'Mensalidades', live.length]];
  const linkBtns = (p, s) => { const link = p?.invoice_url || (s?.status === 'pending' ? s.checkout_url : null);
    return `${link ? `<button class="btn sm" data-act="bl-copy" data-url="${esc(link)}" title="Copiar link de pagamento">${icon('copy')}</button>` : ''}<button class="btn sm wa" data-act="bl-wa" data-id="${s?.id || ''}" ${p ? `data-pay="${p.id}"` : ''} title="Enviar mensagem pelo WhatsApp">${icon('whatsapp')}</button>`; };
  let body = '';
  if (!BILL.loaded) body = '<div class="panel-pad muted">Carregando mensalidades…</div>';
  else if (BILL_VIEW.tab === 'month' || BILL_VIEW.tab === 'overdue') {
    const list = (BILL_VIEW.tab === 'month' ? monthPays : overdue).filter(p => billMatches(p.athlete_id));
    body = list.length ? `<div class="table-wrap"><table><thead><tr><th>Atleta</th><th>Vencimento</th><th>Valor</th><th>Forma</th><th>Situação</th><th></th></tr></thead><tbody>${list.map(p => {
      const s = subOf(p.subscription_id), late = BILL_OPEN.has(p.status) && p.due_date < today;
      const days = late ? Math.floor((Date.parse(today) - Date.parse(p.due_date)) / 864e5) : 0;
      return `<tr><td>${billAthleteCell(p.athlete_id, s)}</td><td>${billDate(p.due_date)}${days ? `<div class="hint">${days} dia(s) de atraso</div>` : p.paid_at ? `<div class="hint">pago em ${billDate(p.paid_at)}</div>` : ''}</td>
        <td class="num"><b>${money(billPayTotal(p))}</b></td><td>${p.billing_type === 'CREDIT_CARD' ? 'Cartão' : 'Pix'}</td><td>${billTag(late ? payStatus.OVERDUE : payStatus[p.status] || [p.status, ''])}</td>
        <td class="row-actions">${BILL_OPEN.has(p.status) ? linkBtns(p, s) : ''}</td></tr>`;
    }).join('')}</tbody></table></div>`
      : emptyState(BILL_VIEW.tab === 'month' ? 'Nenhuma cobrança neste mês' : 'Nenhuma mensalidade em atraso', BILL_VIEW.tab === 'month' ? 'As cobranças aparecem aqui quando o Asaas gera a mensalidade do mês.' : 'Tudo em dia. 👍');
  } else {
    const list = live.filter(s => billMatches(s.athlete_id));
    body = list.length ? `<div class="table-wrap"><table><thead><tr><th>Atleta</th><th>Valor</th><th>Forma</th><th>Situação</th><th></th></tr></thead><tbody>${list.map(s => `<tr>
      <td>${billAthleteCell(s.athlete_id, s)}</td><td class="num"><b>${money(s.base_cents ?? s.value_cents)}</b><div class="hint">todo dia ${s.due_day}</div></td>
      <td>${billMethod(s)}</td><td>${billTag(billSubState(s))}</td>
      <td class="row-actions">${linkBtns(null, s)}${s.status === 'active' ? `<button class="btn sm" data-act="bl-sync" data-id="${s.id}" title="Buscar cobranças no Asaas">${icon('refresh')}</button>` : ''}<button class="btn sm danger" data-act="bl-cancel" data-id="${s.id}" data-edit title="Cancelar mensalidade">${icon('x')}</button></td></tr>`).join('')}</tbody></table></div>`
      : emptyState('Nenhuma mensalidade criada', 'Crie a mensalidade do atleta; a família escolhe a forma de pagamento na Área do atleta.', `<button class="btn primary sm" data-act="bl-new" data-edit>${icon('plus')} Nova mensalidade</button>`);
  }
  return `${viewBanner('billing')}
  <div class="page-head"><div><div class="eyebrow">Finanças · atletas</div><h1>Mensalidades</h1><p>Você cria a mensalidade; quem paga escolhe cartão, Pix Automático ou Pix mensal na Área do atleta.</p></div>
    <div class="head-actions"><button class="btn" data-billing-rules data-edit>${icon('settings')} Regras de cobrança</button><button class="btn primary" data-act="bl-new" data-edit>${icon('plus')} Nova mensalidade</button></div></div>
  ${BILL_SANDBOX ? `<div class="banner warn bl-sandbox">${icon('alert')}<span><b>Ambiente de testes do Asaas.</b> Nenhuma cobrança é real.</span></div>` : ''}
  ${BILL.error ? `<div class="banner warn">${icon('alert')}<span>${esc(BILL.error)}</span></div>` : ''}
  <div class="grid g4 mb">${kpis.map(([l, v, f, i]) => `<div class="kpi">${kpiIcon(i)}<div class="kpi-label">${l}</div><div class="kpi-value">${v}</div><div class="kpi-foot">${f}</div></div>`).join('')}</div>
  <section class="panel"><div class="panel-head bl-toolbar"><div class="seg" role="tablist">${tabs.map(([id, l, n]) => `<button class="${BILL_VIEW.tab === id ? 'on' : ''}" data-act="bl-tab" data-tab="${id}" role="tab" aria-selected="${BILL_VIEW.tab === id}">${l}${n ? ` <span class="bl-count ${id === 'overdue' ? 'is-bad' : ''}">${n}</span>` : ''}</button>`).join('')}</div>
    <div class="search">${icon('search')}<input class="input" id="blQ" type="search" placeholder="Buscar atleta…" value="${esc(BILL_VIEW.q)}" aria-label="Buscar atleta"></div>
    <button class="btn sm ghost" data-act="bl-reload" title="Atualizar">${icon('refresh')}</button></div>
  ${body}</section>`;
}

// Nova mensalidade: atleta → quem paga → valor e vencimento. A forma fica com a família.
async function billingForm() {
  if (!canEdit('billing')) return toast('Seu perfil não pode criar mensalidades.', true);
  const busy = new Set(BILL.subs.filter(s => !['canceled', 'expired'].includes(s.status)).map(s => s.athlete_id));
  const pool = ATHLETES.filter(a => a.active && !busy.has(a.id)).sort((a, b) => a.name.localeCompare(b.name));
  openDialog(dHead('Nova mensalidade', 'Cobrança mensal do atleta', 'Depois de criada, quem paga escolhe a forma de pagamento na Área do atleta.') + `<form id="blForm" class="d-body" novalidate>
    <div class="field"><label for="blAth">Atleta *</label><select class="select" id="blAth"><option value="">Selecione…</option>${pool.map(a => `<option value="${a.id}">${esc(a.name)} · ${esc(teamOf(a.teamId)?.name || '')}</option>`).join('')}</select><span class="hint">Atletas que já têm mensalidade não aparecem na lista.</span></div>
    <fieldset class="bl-payer"><legend id="blPayerTitle">Quem paga</legend>
      <div class="row2"><div class="field"><label for="blName">Nome *</label><input class="input" id="blName"></div>
        <div class="field"><label for="blDoc">CPF *</label><input class="input" id="blDoc" inputmode="numeric" placeholder="000.000.000-00"></div></div>
      <div class="row2"><div class="field"><label for="blEmail">E-mail</label><input class="input" id="blEmail" type="email"></div>
        <div class="field"><label for="blPhone">WhatsApp</label><input class="input" id="blPhone" inputmode="tel"></div></div></fieldset>
    <div class="row2"><div class="field"><label for="blValue">Valor mensal (R$) *</label><input class="input" id="blValue" inputmode="decimal" placeholder="0,00"><span class="hint" id="blPlanHint"></span></div>
      <div class="field"><label for="blDay">Vence todo dia *</label><input class="input" id="blDay" type="number" min="1" max="28" value="10"></div></div>
    <div class="field hide" id="blOverrideBox"><label for="blOverride">Por que o valor é diferente do pacote? *</label><input class="input" id="blOverride" maxlength="300" placeholder="Ex.: bolsa parcial, irmãos, valor antigo"></div>
    <p class="hint billing-price-preview" id="blPricePreview" role="status" aria-live="polite"></p>
    <details class="bl-advanced"><summary>A família não usa a Área do atleta? Definir a forma agora</summary>
      <div class="seg" role="group" style="margin-top:10px"><button type="button" class="on" data-m="FAMILY">A família escolhe</button><button type="button" data-m="PIX">Pix mensal</button><button type="button" data-m="CREDIT_CARD">Cartão</button><button type="button" data-m="PIX_AUTOMATIC">Pix Automático</button></div>
      <p class="hint" id="blMethodHint">Recomendado: a família escolhe e ativa o pagamento automático sozinha.</p></details>
    <div class="err" id="blErr" role="alert"></div>
  </form><div class="d-foot"><button class="btn" data-act="close-dialog">Cancelar</button><button class="btn primary" id="blSave">${icon('check')} Criar mensalidade</button></div>`, 'drawer');
  const f = $('#blForm'); let method = 'FAMILY', packageBase = null;
  const valueCents = () => { try { return billingRulesCents($('#blValue').value, 'o valor'); } catch { return NaN; } };
  const refresh = () => {
    const v = valueCents();
    $('#blOverrideBox').classList.toggle('hide', !(Number.isFinite(v) && (packageBase === null || v !== packageBase) && $('#blAth').value));
    if (typeof billingRulesPrincipalPreview === 'function') billingRulesPrincipalPreview(v, method === 'CREDIT_CARD' ? 'CREDIT_CARD' : 'PIX', $('#blPricePreview'));
  };
  $('#blValue').addEventListener('input', refresh);
  const hints = { FAMILY: 'Recomendado: a família escolhe e ativa o pagamento automático sozinha.', PIX: 'Todo mês o Asaas gera um Pix com vencimento.',
    CREDIT_CARD: 'Você envia um link seguro para cadastrar o cartão uma vez.', PIX_AUTOMATIC: 'O pagador autoriza uma vez no banco, pela Área do atleta.' };
  f.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { method = b.dataset.m; f.querySelectorAll('[data-m]').forEach(x => x.classList.toggle('on', x === b)); $('#blMethodHint').textContent = hints[method]; refresh(); });
  $('#blAth').onchange = async () => {
    const id = $('#blAth').value; if (!id) return;
    const a = ATHLETES.find(x => x.id === id);
    const { data } = await financeDbClient().from('athletes').select('full_name,cpf,email,phone,parent_name,parent_cpf,parent_email,parent_phone').eq('id', id).maybeSingle();
    if (!f.isConnected || $('#blAth').value !== id) return;
    const minor = !!(data?.parent_name || a?.parentName);
    $('#blPayerTitle').textContent = minor ? 'Quem paga · responsável' : 'Quem paga · o próprio atleta';
    $('#blName').value = minor ? (data?.parent_name || '') : (data?.full_name || a?.name || '');
    $('#blDoc').value = (minor ? data?.parent_cpf : data?.cpf) || '';
    $('#blEmail').value = (minor ? data?.parent_email : data?.email) || '';
    $('#blPhone').value = fmtPhone((minor ? data?.parent_phone : data?.phone) || '');
    const plan = PLANS.find(p => p.id === a?.planId), terms = plan ? { value: plan.value } : planTerms(a?.plan);
    packageBase = terms.value > 0 ? terms.value : null;
    $('#blValue').value = terms.value ? (terms.value / 100).toFixed(2).replace('.', ',') : '';
    $('#blPlanHint').textContent = a?.plan ? `Pacote: ${a.plan}` : 'Atleta sem pacote no cadastro.';
    refresh();
  };
  $('#blSave').onclick = async () => {
    const err = $('#blErr'); err.textContent = '';
    const ath = $('#blAth').value, doc = digits($('#blDoc').value), value = valueCents();
    const day = Number($('#blDay').value), name = $('#blName').value.trim(), reason = $('#blOverride').value.trim();
    if (!ath) return err.textContent = 'Escolha o atleta.';
    if (!name) return err.textContent = 'Informe quem paga.';
    if (![11, 14].includes(doc.length)) return err.textContent = 'CPF de quem paga inválido.';
    if (!(value >= 500)) return err.textContent = 'Informe o valor mensal (mínimo R$ 5,00).';
    if ((packageBase === null || value !== packageBase) && !reason) return err.textContent = 'Explique por que o valor é diferente do pacote.';
    if (!(day >= 1 && day <= 28)) return err.textContent = 'O vencimento deve ser entre os dias 1 e 28.';
    const a = ATHLETES.find(x => x.id === ath), btn = $('#blSave');
    btn.disabled = true; btn.textContent = 'Criando…';
    try {
      const { data, error } = await financeDbClient().functions.invoke('billing-asaas', { body: { action: 'create', athleteId: ath, method, valueCents: value, dueDay: day, baseOverrideReason: reason,
        description: `Mensalidade Apollo · ${a.name} · ${teamOf(a.teamId)?.name || ''}`.trim(),
        payer: { name, cpfCnpj: doc, email: $('#blEmail').value.trim(), phone: digits($('#blPhone').value) } } });
      if (error) { let msg = error.message; try { msg = (await error.context.json()).error || msg; } catch { } throw new Error(msg); }
      closeDialog(); BILL_VIEW.tab = 'subs'; await billingLoad(true);
      const sub = BILL.subs.find(s => s.id === data.id);
      toast(method === 'FAMILY' ? 'Mensalidade criada. Avise a família para escolher a forma de pagamento.' : 'Mensalidade criada.');
      if (sub && (method === 'FAMILY' || data.checkoutUrl || data.invoiceUrl)) billingShare(sub, data.checkoutUrl || data.invoiceUrl || null);
    } catch (e) { err.textContent = e.message; btn.disabled = false; btn.innerHTML = `${icon('check')} Criar mensalidade`; }
  };
}

// Mensagens prontas para o WhatsApp de quem paga
function billingShare(s, link, pay = null) {
  if (!s) return;
  const a = ATHLETES.find(x => x.id === s.athlete_id), c = BILL.customers.get(s.customer_id);
  const first = String(c?.name || '').split(' ')[0], who = a?.name || 'o atleta';
  const portal = 'https://apollovoleibol.github.io/management_panel_v2/area-do-atleta.html';
  let text;
  if (pay && BILL_OPEN.has(pay.status) && pay.due_date < billToday()) text = `Olá, ${first}! Aqui é da Apollo Voleibol. A mensalidade de ${who} com vencimento em ${billDate(pay.due_date)} está em aberto (${money(billPayTotal(pay))}). Você pode pagar por aqui: ${pay.invoice_url || portal}`;
  else if (['awaiting_choice', 'choosing'].includes(s.status)) text = `Olá, ${first}! Aqui é da Apollo Voleibol. A mensalidade de ${who} já está disponível. Entre na Área do atleta e escolha como prefere pagar: cartão ou Pix Automático (não precisa entrar todo mês) ou Pix mensal. ${portal}`;
  else if (s.method === 'CREDIT_CARD' && s.status === 'pending') text = `Olá, ${first}! Aqui é da Apollo Voleibol. Para ativar a mensalidade de ${who} (${money(s.value_cents)} por mês, todo dia ${s.due_day}), cadastre o cartão neste link seguro do Asaas. Depois disso, as mensalidades são cobradas automaticamente: ${link || s.checkout_url || portal}`;
  else text = `Olá, ${first}! Aqui é da Apollo Voleibol. Segue o link da mensalidade de ${who}${pay ? ` (${money(billPayTotal(pay))}, vence ${billDate(pay.due_date)})` : ''}: ${link || portal}`;
  const tel = digits(c?.phone || '');
  window.open(`https://wa.me/${tel.length >= 10 ? '55' + tel.slice(-11) : ''}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

async function billingAction(act, el) {
  const id = el.dataset.id;
  if (act === 'bl-new') return billingForm();
  if (act === 'bl-tab') { BILL_VIEW.tab = el.dataset.tab; return render(); }
  if (act === 'bl-reload') { loadingBtn(el, true); await billingLoad(true); return toast('Mensalidades atualizadas.'); }
  if (act === 'bl-goto-payroll') return go('payments');
  if (act === 'bl-copy') { navigator.clipboard?.writeText(el.dataset.url).catch(() => { }); return toast('Link copiado.'); }
  if (act === 'bl-wa') { const s = BILL.subs.find(x => x.id === id); const p = BILL.pays.find(x => x.id === el.dataset.pay); return billingShare(s, p?.invoice_url || null, p || null); }
  if (act === 'bl-sync' || act === 'bl-cancel') {
    if (act === 'bl-cancel' && !(await confirmBox({ title: 'Cancelar mensalidade?', text: 'As próximas cobranças deixam de ser geradas. Cobranças já emitidas continuam valendo.', ok: 'Cancelar mensalidade', danger: true }))) return;
    loadingBtn(el, true);
    const { error } = await financeDbClient().functions.invoke('billing-asaas', { body: { action: act === 'bl-cancel' ? 'cancel' : 'sync', id } });
    loadingBtn(el, false);
    if (error) { let msg = error.message; try { msg = (await error.context.json()).error || msg; } catch { } return toast(msg, true); }
    await billingLoad(true); return toast(act === 'bl-cancel' ? 'Mensalidade cancelada.' : 'Cobranças atualizadas.');
  }
}
const loadingBtn = (el, on) => { if (el) { el.classList.toggle('is-loading', on); el.disabled = on; } };
// Busca por atleta sem perder o foco do campo
document.addEventListener('input', e => {
  if (e.target.id !== 'blQ') return;
  BILL_VIEW.q = e.target.value; const pos = e.target.selectionStart; render();
  const q = $('#blQ'); if (q) { q.focus(); q.setSelectionRange(pos, pos); }
});
