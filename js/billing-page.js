/* Mensalidades (Asaas): assinaturas dos atletas por Pix mensal ou cartão recorrente. Começa no sandbox. */
'use strict';

const BILL = { loaded: false, loading: false, error: '', subs: [], pays: [], customers: new Map() };
const BILL_SANDBOX = true;
const billStatus = { pending: ['Aguardando cartão', 'st-warn'], active: ['Ativa', 'st-ok'], canceled: ['Cancelada', 'st-cancelado'], expired: ['Link expirado', 'st-bad'] };
const payStatus = { PENDING: ['A vencer', 'st-pendente'], RECEIVED: ['Pago', 'st-ok'], CONFIRMED: ['Pago', 'st-ok'], RECEIVED_IN_CASH: ['Pago (dinheiro)', 'st-ok'],
  OVERDUE: ['Atrasado', 'st-bad'], REFUNDED: ['Estornado', 'st-cancelado'], DELETED: ['Removido', 'st-cancelado'] };
const billTag = ([l, c]) => `<span class="tag nodot ${c}">${esc(l)}</span>`;

async function billingLoad(force = false) {
  if (BILL.loading || (BILL.loaded && !force)) return;
  BILL.loading = true; BILL.error = '';
  try {
    const db = financeDbClient();
    const [s, p, c] = await Promise.all([
      db.from('billing_subscriptions').select('*').order('created_at', { ascending: false }),
      db.from('billing_payments').select('*').order('due_date', { ascending: false }),
      db.from('billing_customers').select('id,name,cpf_cnpj,email,phone')
    ]);
    if (s.error || p.error || c.error) throw (s.error || p.error || c.error);
    BILL.subs = s.data; BILL.pays = p.data; BILL.customers = new Map(c.data.map(x => [x.id, x]));
    BILL.loaded = true;
  } catch (e) { BILL.error = e.message || 'Não foi possível carregar as mensalidades.'; }
  BILL.loading = false;
  if (S.page === 'billing') render();
}

function renderBilling() {
  if (!BILL.loaded && !BILL.loading) billingLoad();
  const subs = BILL.subs, cur = `${TODAY.getFullYear()}-${pad(TODAY.getMonth() + 1)}`;
  const paid = BILL.pays.filter(p => ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(p.status) && String(p.paid_at || '').startsWith(cur));
  const overdue = BILL.pays.filter(p => p.status === 'OVERDUE');
  const lastPay = id => BILL.pays.find(p => p.subscription_id === id);
  const kpis = [
    ['Mensalidades ativas', subs.filter(s => s.status === 'active').length, `${money(subs.filter(s => s.status === 'active').reduce((a, s) => a + s.value_cents, 0))} por mês`, 'check'],
    ['Aguardando cartão', subs.filter(s => s.status === 'pending').length, 'link enviado ao responsável', 'clock'],
    ['Recebido no mês', money(paid.reduce((a, p) => a + (p.value_cents || 0), 0)), `${paid.length} pagamento(s) em ${MONTHS[TODAY.getMonth()]}`, 'money'],
    ['Em atraso', overdue.length, money(overdue.reduce((a, p) => a + (p.value_cents || 0), 0)), 'alert'],
  ];
  const rows = subs.map(s => {
    const a = ATHLETES.find(x => x.id === s.athlete_id), c = BILL.customers.get(s.customer_id), lp = lastPay(s.id);
    const link = s.status === 'pending' ? s.checkout_url : lp?.invoice_url;
    return `<tr><td><strong>${esc(a?.name || 'Atleta')}</strong><div class="hint">${esc(teamOf(a?.teamId)?.name || '')}</div></td>
      <td>${esc(c?.name || '')}<div class="hint">${c?.phone ? fmtPhone(c.phone) : ''}</div></td>
      <td>${s.automatic_mode === 'PIX_AUTOMATIC' ? 'Pix Automático' : s.method === 'PIX' ? 'Pix mensal' : 'Cartão recorrente'}</td>
      <td class="num"><b>${money(s.value_cents)}</b><div class="hint">todo dia ${s.due_day}</div></td>
      <td>${billTag(billStatus[s.status] || [s.status, ''])}</td>
      <td>${lp ? `${billTag(payStatus[lp.status] || [lp.status, ''])}<div class="hint">venc. ${lp.due_date ? lp.due_date.split('-').reverse().join('/') : '—'}</div>` : '<span class="muted small">—</span>'}</td>
      <td class="row-actions">${link ? `<button class="btn sm" data-act="bl-copy" data-url="${esc(link)}" title="Copiar link de pagamento">${icon('copy')}</button><button class="btn sm wa" data-act="bl-wa" data-id="${s.id}" title="Enviar pelo WhatsApp">${icon('whatsapp')}</button>` : ''}
        ${s.status === 'active' ? `<button class="btn sm" data-act="bl-sync" data-id="${s.id}" title="Atualizar cobranças">${icon('refresh')}</button>` : ''}
        ${['active', 'pending'].includes(s.status) ? `<button class="btn sm danger" data-act="bl-cancel" data-id="${s.id}" data-edit title="Cancelar mensalidade">${icon('x')}</button>` : ''}</td></tr>`;
  }).join('');
  return `${viewBanner('billing')}
  <div class="page-head"><div><div class="eyebrow">Finanças · atletas</div><h1>Mensalidades</h1><p>Cobrança recorrente dos atletas pelo Asaas: Pix mensal ou cartão de crédito cadastrado uma única vez pelo responsável. Pagamentos dos técnicos ficam em <a href="#payments" data-act="bl-goto-payroll">Folha dos técnicos</a>.</p></div>
    <div class="head-actions"><button class="btn" data-billing-rules data-edit>Regras de cobrança</button><button class="btn" data-act="bl-reload">${icon('refresh')} Atualizar</button><button class="btn primary" data-act="bl-new" data-edit>${icon('plus')} Nova mensalidade</button></div></div>
  ${BILL_SANDBOX ? `<div class="banner warn">${icon('alert')}<span><b>Ambiente de testes (sandbox do Asaas).</b> Nenhuma cobrança é real. Use CPFs e cartões de teste.</span></div>` : ''}
  ${BILL.error ? `<div class="banner warn">${icon('alert')}<span>${esc(BILL.error)}</span></div>` : ''}
  <div class="grid g4 mb">${kpis.map(([l, v, f, i]) => `<div class="kpi">${kpiIcon(i)}<div class="kpi-label">${l}</div><div class="kpi-value">${v}</div><div class="kpi-foot">${f}</div></div>`).join('')}</div>
  <section class="panel">${!BILL.loaded ? '<div class="panel-pad muted">Carregando mensalidades…</div>' : subs.length
    ? `<div class="table-wrap"><table><thead><tr><th>Atleta</th><th>Pagador</th><th>Forma</th><th>Valor</th><th>Situação</th><th>Última cobrança</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
    : emptyState('Nenhuma mensalidade criada', 'Crie a primeira mensalidade para um atleta e envie o link ao responsável.', `<button class="btn primary sm" data-act="bl-new" data-edit>${icon('plus')} Nova mensalidade</button>`)}</section>`;
}

// Formulário: atleta → pagador (responsável para menores) → valor do pacote → forma de pagamento
async function billingForm() {
  if (!canEdit('billing')) return toast('Seu perfil não pode criar mensalidades.', true);
  const pool = ATHLETES.filter(a => a.active).sort((a, b) => a.name.localeCompare(b.name));
  openDialog(dHead('Nova mensalidade', 'Cobrança recorrente', 'O Asaas gera uma cobrança por mês. No cartão, o responsável cadastra o cartão uma única vez num link seguro do Asaas.') + `<form id="blForm" class="d-body" novalidate>
    <div class="field"><label for="blAth">Atleta *</label><select class="select" id="blAth"><option value="">Selecione…</option>${pool.map(a => `<option value="${a.id}">${esc(a.name)} · ${esc(teamOf(a.teamId)?.name || '')}</option>`).join('')}</select></div>
    <div class="row2"><div class="field"><label for="blName">Nome do pagador *</label><input class="input" id="blName"></div>
      <div class="field"><label for="blDoc">CPF do pagador *</label><input class="input" id="blDoc" inputmode="numeric" placeholder="000.000.000-00"></div></div>
    <div class="row2"><div class="field"><label for="blEmail">E-mail</label><input class="input" id="blEmail" type="email"></div>
      <div class="field"><label for="blPhone">WhatsApp</label><input class="input" id="blPhone" inputmode="tel"></div></div>
    <div class="row2"><div class="field"><label for="blValue">Valor-base mensal (R$) *</label><input class="input" id="blValue" inputmode="decimal" placeholder="0,00"><span class="hint" id="blPlanHint"></span><span class="hint">Valor do pacote antes do ajuste da forma de pagamento.</span></div>
      <div class="field"><label for="blDay">Dia do vencimento *</label><input class="input" id="blDay" type="number" min="1" max="28" value="10"></div></div>
    <div class="field"><label for="blOverride">Motivo de valor individual</label><input class="input" id="blOverride" maxlength="500"><span class="hint">Obrigatório se o valor-base diferir do pacote. Atletas sem pacote exigem valor e motivo explícitos.</span></div>
    <div class="field"><label>Forma de pagamento *</label><div class="seg" role="group"><button type="button" class="on" data-m="PIX">Pix mensal</button><button type="button" data-m="CREDIT_CARD">Cartão recorrente</button><button type="button" data-m="PIX_AUTOMATIC">Pix Automático</button></div>
      <span class="hint" id="blMethodHint">Todo mês o Asaas gera um Pix com vencimento e envia ao pagador.</span><span class="hint billing-price-preview" id="blPricePreview" role="status" aria-live="polite"></span></div>
    <div class="err" id="blErr" role="alert"></div>
  </form><div class="d-foot"><button class="btn" data-act="close-dialog">Cancelar</button><button class="btn primary" id="blSave">${icon('check')} Criar mensalidade</button></div>`, 'drawer');
  const f = $('#blForm'); let method = 'PIX', packageBase = null;
  const previewPrices = () => {
    let cents = NaN;
    try { cents = billingRulesCents($('#blValue').value, 'o valor-base'); } catch { }
    if (typeof billingRulesPrincipalPreview === 'function') billingRulesPrincipalPreview(cents, method==='PIX_AUTOMATIC'?'PIX':method, $('#blPricePreview'));
  };
  $('#blValue').addEventListener('input', previewPrices);
  previewPrices();
  f.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
    method = b.dataset.m; f.querySelectorAll('[data-m]').forEach(x => x.classList.toggle('on', x === b));
    $('#blMethodHint').textContent = method === 'PIX_AUTOMATIC' ? 'O pagador autoriza uma vez no próprio banco. O débito só passa a ser automático após confirmação do Asaas. Uma assinatura Pix mensal existente exige conciliação antes de migrar.' : method === 'PIX' ? 'Todo mês o Asaas gera um Pix com vencimento e envia ao pagador.'
      : 'O responsável recebe um link seguro do Asaas, cadastra o cartão uma vez e as próximas mensalidades são cobradas automaticamente.';
    previewPrices();
  });
  $('#blAth').onchange = async () => {
    const id = $('#blAth').value; if (!id) return;
    const a = ATHLETES.find(x => x.id === id);
    const { data } = await financeDbClient().from('athletes').select('full_name,cpf,email,phone,parent_name,parent_cpf,parent_email,parent_phone').eq('id', id).maybeSingle();
    if (!f.isConnected || $('#blAth').value !== id) return;
    const minor = !!(data?.parent_name || a?.parentName);
    $('#blName').value = minor ? (data?.parent_name || '') : (data?.full_name || a?.name || '');
    $('#blDoc').value = (minor ? data?.parent_cpf : data?.cpf) || '';
    $('#blEmail').value = (minor ? data?.parent_email : data?.email) || '';
    $('#blPhone').value = fmtPhone((minor ? data?.parent_phone : data?.phone) || '');
    const plan = PLANS.find(p => p.id === a?.planId), terms = plan ? { value: plan.value } : planTerms(a?.plan);
    packageBase = terms.value > 0 ? terms.value : null;
    $('#blValue').value = terms.value ? (terms.value / 100).toFixed(2).replace('.', ',') : '';
    $('#blPlanHint').textContent = a?.plan ? `Plano no cadastro: ${a.plan}` : 'Atleta sem plano no cadastro.';
    previewPrices();
  };
  $('#blSave').onclick = async () => {
    const err = $('#blErr'); err.textContent = '';
    if (!canEdit('billing')) return err.textContent = 'Seu perfil não pode criar mensalidades.';
    const ath = $('#blAth').value, doc = digits($('#blDoc').value);
    let value;
    try { value = billingRulesCents($('#blValue').value, 'o valor-base'); } catch (e) { return err.textContent = e.message; }
    const day = Number($('#blDay').value), name = $('#blName').value.trim();
    if (!ath) return err.textContent = 'Escolha o atleta.';
    if (!name) return err.textContent = 'Informe o nome do pagador.';
    if (![11, 14].includes(doc.length)) return err.textContent = 'CPF (ou CNPJ) do pagador inválido.';
    if (!(value >= 500)) return err.textContent = 'Informe o valor mensal (mínimo R$ 5,00).';
    const baseOverrideReason = $('#blOverride').value.trim();
    if ((packageBase === null || value !== packageBase) && !baseOverrideReason) return err.textContent = 'Informe o motivo do valor individual ou selecione um pacote no cadastro do atleta.';
    if (!(day >= 1 && day <= 28)) return err.textContent = 'O vencimento deve ser entre os dias 1 e 28.';
    const a = ATHLETES.find(x => x.id === ath);
    const btn = $('#blSave'); btn.disabled = true; btn.textContent = 'Criando…';
    try {
      const { data, error } = await financeDbClient().functions.invoke('billing-asaas', { body: { action: 'create', athleteId: ath, method, valueCents: value, dueDay: day, baseOverrideReason,
        description: `Mensalidade Apollo · ${a.name} · ${teamOf(a.teamId)?.name || ''}`.trim(),
        payer: { name, cpfCnpj: doc, email: $('#blEmail').value.trim(), phone: digits($('#blPhone').value) } } });
      if (error) { let msg = error.message; try { msg = (await error.context.json()).error || msg; } catch { } throw new Error(msg); }
      closeDialog(); await billingLoad(true);
      const link = data.checkoutUrl || data.invoiceUrl;
      toast(method === 'PIX_AUTOMATIC' ? 'Mensalidade preparada. O pagador deverá autorizar o Pix Automático na Área do atleta.' : method === 'PIX' ? `Mensalidade criada. Primeiro vencimento em ${data.nextDueDate.split('-').reverse().join('/')}.` : 'Mensalidade criada. Envie o link para o responsável cadastrar o cartão.');
      if (link) billingShare(BILL.subs.find(s => s.id === data.id), link);
    } catch (e) { err.textContent = e.message; btn.disabled = false; btn.innerHTML = `${icon('check')} Criar mensalidade`; }
  };
}

function billingShare(s, link) {
  if (!s) return;
  const a = ATHLETES.find(x => x.id === s.athlete_id), c = BILL.customers.get(s.customer_id);
  const first = String(c?.name || '').split(' ')[0];
  const text = s.method === 'CREDIT_CARD'
    ? `Olá, ${first}! Aqui é da Apollo Voleibol. Para ativar a mensalidade de ${a?.name || 'seu atleta'} (${money(s.value_cents)} por mês, todo dia ${s.due_day}), cadastre o cartão neste link seguro do Asaas. Depois disso as mensalidades são cobradas automaticamente: ${link}`
    : `Olá, ${first}! Aqui é da Apollo Voleibol. Segue o Pix da mensalidade de ${a?.name || 'seu atleta'} (${money(s.value_cents)}): ${link}`;
  const tel = digits(c?.phone || '');
  window.open(`https://wa.me/${tel.length >= 10 ? '55' + tel.slice(-11) : ''}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

async function billingAction(act, el) {
  const id = el.dataset.id;
  if (act === 'bl-new') return billingForm();
  if (act === 'bl-reload') { await billingLoad(true); return toast('Mensalidades atualizadas.'); }
  if (act === 'bl-goto-payroll') { return go('payments'); }
  if (act === 'bl-copy') { navigator.clipboard?.writeText(el.dataset.url).catch(() => { }); return toast('Link copiado.'); }
  if (act === 'bl-wa') { const s = BILL.subs.find(x => x.id === id); const lp = BILL.pays.find(p => p.subscription_id === id); return billingShare(s, s?.status === 'pending' ? s.checkout_url : lp?.invoice_url); }
  if (act === 'bl-sync' || act === 'bl-cancel') {
    if (act === 'bl-cancel' && !(await confirmBox({ title: 'Cancelar mensalidade?', text: 'As próximas cobranças deixam de ser geradas no Asaas. Cobranças já emitidas continuam valendo.', ok: 'Cancelar mensalidade', danger: true }))) return;
    const { error } = await financeDbClient().functions.invoke('billing-asaas', { body: { action: act === 'bl-cancel' ? 'cancel' : 'sync', id } });
    if (error) { let msg = error.message; try { msg = (await error.context.json()).error || msg; } catch { } return toast(msg, true); }
    await billingLoad(true); return toast(act === 'bl-cancel' ? 'Mensalidade cancelada.' : 'Cobranças atualizadas.');
  }
}
