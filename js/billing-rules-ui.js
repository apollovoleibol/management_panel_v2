/* Versioned billing policy editor. The server authorizes and persists every change. */
'use strict';

const BILL_RULES = { engine: null, record: null, policy: null, available: false };
async function billingRulesLoad() {
  BILL_RULES.available = false;
  BILL_RULES.engine ||= await import('./billing-rules.mjs');
  const { data, error } = await financeDbClient().rpc('billing_get_policy');
  if (error) { BILL_RULES.available = false; throw new Error(`Regras indisponíveis: ${error.message}. Verifique a migração e sua permissão no servidor.`); }
  const record = Array.isArray(data) ? data[0] : data;
  BILL_RULES.record = record || null;
  BILL_RULES.policy = structuredClone(record?.policy || BILL_RULES.engine.DEFAULT_POLICY);
  BILL_RULES.engine.validatePolicy(BILL_RULES.policy);
  BILL_RULES.available = true;
  return BILL_RULES.policy;
}

function billingRulesNumber(value, label) {
  const raw = String(value).trim();
  if (!/^-?\d+(?:[.,]\d{1,4})?$/.test(raw)) throw new Error(`Informe ${label} com até quatro casas decimais.`);
  const n = Number(raw.replace(',', '.'));
  if (!Number.isFinite(n)) throw new Error(`Informe ${label}.`);
  return n;
}
function billingRulesCents(value, label) {
  const raw = String(value).trim();
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(raw)) throw new Error(`Informe ${label} em reais, com até dois centavos.`);
  return Math.round(Number(raw.replace(',', '.')) * 100);
}

function billingRulesFixedMaximum(form) {
  const base=billingRulesCents(form.elements.simBase.value,'o valor-base de referência');
  const methods={PIX:billingRulesNumber(form.elements.pix.value,'o ajuste Pix'),CREDIT_CARD:billingRulesNumber(form.elements.card.value,'o ajuste do cartão')};
  const policy={...BILL_RULES.engine.DEFAULT_POLICY,methods};
  return Math.min(...['PIX','CREDIT_CARD'].map(method=>Math.floor(BILL_RULES.engine.calculateQuote(base,method,policy,0).principalCents/50)));
}
function billingRulesFineLimit(form) {
  const input=form.elements.fineValue, fixed=form.elements.fineType.value==='FIXED', hint=form.querySelector('[data-fine-limit]');
  try {
    const max=fixed?billingRulesFixedMaximum(form):2;
    input.min='0';input.max=fixed?(max/100).toFixed(2):'2';input.step=fixed?'0.01':'0.0001';input.disabled=false;
    const value=fixed?billingRulesCents(input.value,'a multa'):billingRulesNumber(input.value,'a multa');
    const adjusted=value>max;
    if(adjusted)input.value=fixed?(max/100).toFixed(2):'2';
    if(hint)hint.textContent=fixed?`${adjusted?'Valor ajustado ao teto. ':''}Limite de ${money(max)} no cenário ao lado. Cada cobrança respeita o teto de 2%.`:'Máximo permitido: 2% da mensalidade. A multa incide uma única vez.';
  } catch(e) {
    input.max='0';
    if(hint)hint.textContent=e.message;
  }
}

function billingRulesRead(form) {
  const number = (name, label) => billingRulesNumber(form.elements[name].value, label);
  if(form.elements.fineType.value==='FIXED' && billingRulesCents(form.elements.fineValue.value,'a multa')>billingRulesFixedMaximum(form))throw new Error('A multa fixa excede 2% da mensalidade no cenário de referência. Reduza o valor antes de salvar.');
  return {
    enabled: form.elements.enabled.checked,
    methods: { PIX: number('pix', 'o ajuste Pix'), CREDIT_CARD: number('card', 'o ajuste do cartão') },
    graceDays: number('grace', 'os dias de tolerância'),
    fine: { type: form.elements.fineType.value, value: form.elements.fineType.value === 'FIXED'
      ? billingRulesCents(form.elements.fineValue.value, 'a multa') : number('fineValue', 'a multa') },
    tiers: [...form.querySelectorAll('[data-tier]')].map(row => ({
      fromDay: billingRulesNumber(row.querySelector('[data-from]').value, 'o início da faixa'),
      rate: billingRulesNumber(row.querySelector('[data-rate]').value, 'a taxa da faixa'),
      period: row.querySelector('[data-period]').value
    }))
  };
}

// Pacotes cadastrados (valor praticado) para a prévia; sem pacotes, volta ao valor digitado
function billingRulesPackages() {
  const list = typeof PLANS !== 'undefined' && Array.isArray(PLANS) ? PLANS.filter(p => p.value > 0) : [];
  const seen = new Map();
  for (const p of list) {
    const key = `${p.days}|${p.value}`, teams = (p.teams || []).map(id => typeof teamOf === 'function' ? teamOf(id)?.name : '').filter(Boolean);
    if (!seen.has(key)) seen.set(key, { days: p.days, value: p.value, teams: [] });
    seen.get(key).teams.push(...teams);
  }
  return [...seen.values()].sort((a, b) => a.value - b.value);
}
function billingRulesPackageField() {
  const pkgs = billingRulesPackages();
  if (!pkgs.length) return '<div class="field"><label for="brSimBase">Mensalidade (R$)</label><input class="input" id="brSimBase" name="simBase" inputmode="decimal" value="200,00"></div>';
  const fmt = c => (c / 100).toFixed(2).replace('.', ',');
  return `<div class="field br-pkg"><label for="brSimBase">Pacote</label><select class="select" id="brSimBase" name="simBase">${pkgs.map((p, i) => {
    const teams = [...new Set(p.teams)], who = teams.length ? ` · ${teams.slice(0, 2).join(', ')}${teams.length > 2 ? ` +${teams.length - 2}` : ''}` : '';
    return `<option value="${fmt(p.value)}" ${i === 0 ? 'selected' : ''}>${p.days ? `${p.days}x por semana · ` : ''}${money(p.value)}${esc(who)}</option>`; }).join('')}</select></div>`;
}

function billingRulesTier(tier, index) {
  return `<div class="billing-tier" data-tier><div class="field"><label for="brFrom${index}">A partir do dia</label><input class="input" id="brFrom${index}" data-from type="number" min="1" step="1" value="${esc(tier.fromDay)}" required></div>
    <div class="field"><label for="brRate${index}">Juros (%)</label><input class="input" id="brRate${index}" data-rate inputmode="decimal" value="${esc(tier.rate)}" required></div>
    <div class="field"><label for="brPeriod${index}">Período da taxa</label><select class="select" id="brPeriod${index}" data-period>${[['day', 'Dia'], ['week', 'Semana'], ['month', 'Mês']].map(([value, label]) => `<option value="${value}" ${tier.period === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
    <button type="button" class="btn sm danger" data-remove-tier aria-label="Remover faixa ${index + 1}">Remover</button></div>`;
}

function billingRulesWorkerNote() {
  return BILL_RULES.record?.workerReady === false
    ? '<div class="banner warn" role="status">A simulação de encargos está disponível. Para ativar multa e juros em cobranças reais, configure primeiro o processamento agendado no servidor.</div>' : '';
}

function billingRulesHistoryMarkup(records) {
  if (!records.length) return '<p class="hint">Nenhuma versão registrada.</p>';
  const rows = records.slice(0, 50).map(record => {
    const date = new Date(record.created_at), policy = record.policy || {};
    const dateLabel = Number.isNaN(date.getTime()) ? 'Data indisponível' : date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const adjustments = `Pix ${policy.methods?.PIX ?? '—'}%; cartão ${policy.methods?.CREDIT_CARD ?? '—'}%`;
    const fine = policy.fine?.type === 'FIXED' ? money(policy.fine.value) : `${policy.fine?.value ?? 0}%`;
    const summary = `${adjustments}. Encargos ${policy.enabled ? 'ativos' : 'desativados'}; tolerância ${policy.graceDays ?? 0} dia(s); multa única ${fine}; ${Array.isArray(policy.tiers) ? policy.tiers.length : 0} faixa(s).`;
    return `<tr><th scope="row">${esc(record.version)}</th><td>${esc(dateLabel)}</td><td>${esc(summary)}</td></tr>`;
  }).join('');
  return `<div class="table-wrap"><table><caption>Até 50 versões mais recentes. Horários de São Paulo.</caption><thead><tr><th scope="col">Versão</th><th scope="col">Registrada em</th><th scope="col">Configuração</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

async function billingRulesHistoryLoad(target) {
  target.textContent = 'Carregando histórico…';
  try {
    const { data, error } = await financeDbClient().rpc('billing_policy_history');
    if (error) throw new Error(error.message);
    if (!Array.isArray(data)) throw new Error('O servidor não retornou uma lista de versões.');
    if (target.isConnected) target.innerHTML = billingRulesHistoryMarkup(data);
  } catch (e) { if (target.isConnected) target.textContent = `Não foi possível carregar o histórico: ${e.message}`; }
}

function billingRulesSimulation(form) {
  const target = form.querySelector('[data-simulation]'), err = form.querySelector('[data-simulation-error]');
  try {
    const policy = billingRulesRead(form);
    BILL_RULES.engine.validatePolicy(policy);
    const base = billingRulesCents(form.elements.simBase.value, 'o valor-base de simulação');
    const selected = billingRulesNumber(form.elements.simDays.value, 'os dias de atraso');
    if (!Number.isInteger(selected) || selected < 0) throw new Error('Os dias de atraso devem ser inteiros, a partir de zero.');
    const days = [...new Set([0, 1, 7, 14, 15, 30, selected])].sort((a, b) => a - b);
    const live=form.querySelector('[data-live-preview]');
    if(live)live.innerHTML=['PIX','CREDIT_CARD'].map(method=>{
      const q=BILL_RULES.engine.calculateQuote(base,method,policy,selected);
      return `<section class="br-receipt"><div class="br-receipt-title"><strong>${method==='PIX'?'Pix':'Cartão de crédito'}</strong><span>${selected===0?'No vencimento':`${selected} dias de atraso`}</span></div><div class="br-receipt-total">${money(q.totalCents)}</div><dl>${[['Mensalidade',q.baseCents],['Ajuste da forma de pagamento',q.methodAdjustmentCents],['Multa única',q.fineCents],['Juros',q.interestCents]].map(([label,value])=>`<div><dt>${label}</dt><dd>${money(value)}</dd></div>`).join('')}</dl></section>`;
    }).join('');
    target.innerHTML = `<div class="table-wrap"><table class="billing-simulation"><caption>Simulação por forma e dias de atraso. Valores ilustrativos, sem emissão de cobrança.</caption><thead><tr><th scope="col">Atraso</th><th scope="col">Forma</th><th scope="col">Base</th><th scope="col">Ajuste</th><th scope="col">Principal</th><th scope="col">Multa única</th><th scope="col">Juros</th><th scope="col">Total</th></tr></thead><tbody>${days.flatMap(day => ['PIX', 'CREDIT_CARD'].map(method => {
      const q = BILL_RULES.engine.calculateQuote(base, method, policy, day);
      return `<tr ${day === selected ? 'class="billing-selected"' : ''}><th scope="row">${day} dia(s)</th><td>${method === 'PIX' ? 'Pix' : 'Cartão'}</td>${['baseCents', 'methodAdjustmentCents', 'principalCents', 'fineCents', 'interestCents', 'totalCents'].map(key => `<td class="num">${money(q[key])}</td>`).join('')}</tr>`;
    })).join('')}</tbody></table></div>`;
    err.textContent = '';
  } catch (e) { target.innerHTML = ''; const live=form.querySelector('[data-live-preview]');if(live)live.innerHTML='';err.textContent = e.message; }
}

async function billingRulesForm() {
  if (!canEdit('billing')) return toast('Seu perfil não pode alterar regras de cobrança.', true);
  openDialog(dHead('Mensalidades', 'Regras de cobrança') + '<div class="d-body" role="status">Carregando as regras…</div>', 'drawer wide billing-rules-dialog');
  let policy, failure = '';
  try { policy = await billingRulesLoad(); }
  catch (e) {
    failure = e.message;
    if (!BILL_RULES.engine) {
      if ($('#dlg').open) openDialog(dHead('Mensalidades', 'Regras de cobrança') + `<div class="d-body err" role="alert">${esc(failure)}</div><div class="d-foot"><button class="btn" data-act="close-dialog">Fechar</button></div>`);
      return;
    }
    policy = structuredClone(BILL_RULES.engine.DEFAULT_POLICY);
  }
  if (!$('#dlg').open || !$('#dlg').classList.contains('billing-rules-dialog')) return;
  openDialog(dHead('Mensalidades', 'Regras de cobrança', 'Valem para as próximas cobranças. Mensalidades já emitidas mantêm as regras de quando foram criadas.') + `<div class="br-versionbar"><span class="tag nodot" id="brVersion">${BILL_RULES.record && !failure ? `Versão ${esc(BILL_RULES.record.version)} em uso` : 'Nova política'}</span></div><form id="billingRulesForm" class="d-body billing-rules-body" novalidate>
    <div class="br-notices">${failure ? `<div class="banner warn" role="alert">${esc(failure)} Salvar está desativado.</div>` : billingRulesWorkerNote()}</div>
    <div class="br-editor">
      <section class="br-section" aria-labelledby="brMethodsTitle"><div class="br-section-heading"><span class="br-step">01</span><div><h3 id="brMethodsTitle">Formas de pagamento</h3><p>Acréscimo ou desconto sobre o valor do pacote.</p></div></div>
        <div class="br-method-grid"><div class="br-method-card"><div class="br-method-name"><span class="br-method-icon" aria-hidden="true">${icon('money')}</span><div><strong>Pix</strong><small>Pagamento direto</small></div></div><label for="brPix">Ajuste sobre o pacote</label><div class="br-input-unit"><input class="input" id="brPix" name="pix" inputmode="decimal" value="${esc(policy.methods.PIX)}" required><span>%</span></div></div>
        <div class="br-method-card"><div class="br-method-name"><span class="br-method-icon" aria-hidden="true">${icon('wallet')}</span><div><strong>Cartão de crédito</strong><small>Pagamento com cartão</small></div></div><label for="brCard">Ajuste sobre o pacote</label><div class="br-input-unit"><input class="input" id="brCard" name="card" inputmode="decimal" value="${esc(policy.methods.CREDIT_CARD)}" required><span>%</span></div></div></div>
        <p class="br-help">Use 0 para manter o preço, um valor positivo para acrescentar ou negativo para descontar.</p>
      </section>
      <section class="br-section" aria-labelledby="brLateTitle"><div class="br-section-heading"><span class="br-step">02</span><div><h3 id="brLateTitle">Atraso no pagamento</h3><p>Uma multa única, seguida dos juros por período.</p></div></div>
        <label class="br-toggle"><span><strong>Aplicar encargos por atraso</strong><small>Multa e juros começam após a tolerância.</small></span><input type="checkbox" name="enabled" ${policy.enabled ? 'checked' : ''}></label>
        <div class="br-fine-grid"><div class="field"><label for="brGrace">Tolerância</label><div class="br-input-unit"><input class="input" id="brGrace" name="grace" type="number" min="0" step="1" value="${esc(policy.graceDays)}" required><span>dias</span></div></div><div class="field"><label for="brFineType">Tipo de multa única</label><select class="select" id="brFineType" name="fineType"><option value="PERCENTAGE" ${policy.fine.type === 'PERCENTAGE' ? 'selected' : ''}>Percentual (%)</option><option value="FIXED" ${policy.fine.type === 'FIXED' ? 'selected' : ''}>Valor fixo (R$)</option></select></div><div class="field"><label for="brFineValue" id="brFineLabel">${policy.fine.type === 'FIXED' ? 'Multa (R$)' : 'Multa (%)'}</label><input class="input" id="brFineValue" name="fineValue" type="number" min="0" inputmode="decimal" aria-describedby="brFineLimit" value="${esc(policy.fine.type === 'FIXED' ? (policy.fine.value / 100).toFixed(2) : policy.fine.value)}" required></div></div>
        <p class="br-limit" id="brFineLimit" data-fine-limit role="status" aria-live="polite"></p>
      </section>
      <section class="br-section" aria-labelledby="brInterestTitle"><div class="br-section-heading"><span class="br-step">03</span><div><h3 id="brInterestTitle">Juros progressivos</h3><p>Defina quando cada faixa começa e sua taxa.</p></div><button type="button" class="btn sm br-add" data-add-tier>+ Adicionar faixa</button></div><div data-tiers>${policy.tiers.map(billingRulesTier).join('')}</div><p class="br-help">Cada taxa vale apenas para os dias de sua faixa, após a tolerância. Cálculo proporcional, sem juros sobre juros.</p></section>
      <details class="billing-rule-history" id="brHistory"><summary>Histórico de alterações</summary><div data-history role="status" aria-live="polite"><p class="hint">Abra para consultar as versões registradas.</p></div></details>
    </div>
    <aside class="br-preview" aria-labelledby="brPreviewTitle"><div class="br-preview-heading"><span class="br-live-dot" aria-hidden="true"></span><span>PRÉVIA EM TEMPO REAL</span></div><h3 id="brPreviewTitle">Como fica para o atleta</h3><p class="br-help">Escolha um pacote e um prazo de atraso.</p><div class="br-preview-controls">${billingRulesPackageField()}<div class="field"><label for="brSimDays">Dias de atraso</label><input class="input" id="brSimDays" name="simDays" type="number" min="0" step="1" value="15"></div></div><div class="err" data-simulation-error role="status" aria-live="polite"></div><div data-live-preview aria-live="polite"></div><p class="br-preview-note">Simulação com os pacotes cadastrados. Nada é cobrado nem salvo aqui.</p></aside>
    <details class="br-comparison"><summary>Comparar valores por dias de atraso <span>Pix e cartão, lado a lado</span></summary><div data-simulation></div></details><div class="err br-wide" id="brError" role="alert"></div>
  </form><div class="d-foot"><span class="hint br-foot-note">Válido para as próximas cobranças.</span><button class="btn" data-act="close-dialog">Cancelar</button><button class="btn primary" id="brSave" data-edit ${failure ? 'disabled' : ''}>Salvar regras</button></div>`, 'drawer wide billing-rules-dialog');
  const form = $('#billingRulesForm'); let sequence = policy.tiers.length, saving = false;
  const history = form.querySelector('#brHistory'); let historyLoaded = false;
  history.addEventListener('toggle', () => {
    if (history.open && !historyLoaded) { historyLoaded = true; billingRulesHistoryLoad(form.querySelector('[data-history]')); }
  });
  form.addEventListener('input', () => { billingRulesFineLimit(form); billingRulesSimulation(form); });
  form.addEventListener('change', e => {
    if (e.target.name === 'fineType') {
      form.elements.fineValue.value = '0';
      $('#brFineLabel').textContent = e.target.value === 'FIXED' ? 'Multa (R$)' : 'Multa (%)';
    }
    billingRulesFineLimit(form);
    billingRulesSimulation(form);
  });
  form.addEventListener('click', e => {
    if (e.target.closest('[data-add-tier]')) {
      const rows = form.querySelectorAll('[data-tier]');
      const last = rows.length ? Number(rows[rows.length - 1].querySelector('[data-from]').value) : 0;
      form.querySelector('[data-tiers]').insertAdjacentHTML('beforeend', billingRulesTier({ fromDay: last + 1, rate: 0, period: 'day' }, sequence++));
      form.querySelector('[data-tiers]').lastElementChild.querySelector('input').focus();
    }
    const remove = e.target.closest('[data-remove-tier]');
    if (remove) { remove.closest('[data-tier]').remove(); form.querySelector('[data-add-tier]').focus(); }
    billingRulesFineLimit(form);
    billingRulesSimulation(form);
  });
  const save = async e => {
    e.preventDefault();
    if (saving || !BILL_RULES.available) return;
    if (!canEdit('billing')) return $('#brError').textContent = 'Seu perfil não pode alterar regras.';
    const btn = $('#brSave'), err = $('#brError'); err.textContent = '';
    let persisted = false;
    try {
      const next = billingRulesRead(form); BILL_RULES.engine.validatePolicy(next);
      if (next.enabled && BILL_RULES.record?.workerReady === false) throw new Error('A simulação está disponível. Configure o processamento agendado no servidor antes de salvar encargos ativos.');
      saving = true; btn.disabled = true; btn.textContent = 'Salvando…';
      const { error } = await financeDbClient().rpc('billing_save_policy', { p_policy: next });
      if (error) throw new Error(error.message);
      persisted = true;
      await billingRulesLoad();
      if (!BILL_RULES.record) { BILL_RULES.available = false; throw new Error('A nova versão não foi retornada pela consulta.'); }
      closeDialog(); toast(`Regras salvas${BILL_RULES.record ? ` na versão ${BILL_RULES.record.version}` : ''}. Válidas para futuras emissões.`);
    } catch (e) { err.textContent = persisted ? `O servidor aceitou a gravação, mas não foi possível carregar a versão atual: ${e.message} Feche e reabra as regras antes de tentar novamente.` : e.message; }
    finally { saving = false; btn.disabled = !BILL_RULES.available; btn.textContent = 'Salvar regras'; }
  };
  form.addEventListener('submit', save); $('#brSave').onclick = save;
  billingRulesFineLimit(form);
  billingRulesSimulation(form);
}

async function billingRulesPrincipalPreview(baseCents, selectedMethod, target) {
  const sequence = (target.billingPreviewSequence || 0) + 1;
  target.billingPreviewSequence = sequence;
  try {
    if (!BILL_RULES.available) await billingRulesLoad();
    if (!target.isConnected || target.billingPreviewSequence !== sequence) return;
    if (!Number.isSafeInteger(baseCents) || baseCents <= 0) { target.textContent = 'Informe o valor-base para comparar as formas de pagamento.'; return; }
    const quotes = ['PIX', 'CREDIT_CARD'].map(method => ({ method, ...BILL_RULES.engine.calculateQuote(baseCents, method, BILL_RULES.policy, 0) }));
    target.textContent = quotes.map(q => `${q.method === 'PIX' ? 'Pix' : 'Cartão'}: ${money(q.principalCents)} (base ${money(q.baseCents)}, ajuste ${money(q.methodAdjustmentCents)})${q.method === selectedMethod ? ' · selecionado' : ''}`).join(' | ');
  } catch (e) { if (target.isConnected && target.billingPreviewSequence === sequence) target.textContent = 'Prévia de preços indisponível. O servidor validará as regras ao criar a mensalidade.'; }
}

document.addEventListener('click', e => {
  if (!e.target.closest('[data-billing-rules]')) return;
  e.preventDefault(); billingRulesForm().catch(err => toast(err.message, true));
});
