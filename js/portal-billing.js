/* Server-authorized family billing. Provider confirmation is the only payment receipt. */
'use strict';
window.PortalBilling = (() => {
  const state = { subscriptions: [], payments: [], invoices: [], error: '', busy: false, loading: false, choice: null, delinquency: [], automaticConsent: null };
  const esc = value => portalEsc(value);
  const paid = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH']);
  const canceled = new Set(['CANCELED', 'CANCELLED', 'DELETED', 'REFUNDED', 'REFUND_REQUESTED', 'REFUND_IN_PROGRESS', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE', 'AWAITING_CHARGEBACK_REVERSAL']);
  const payable = new Set(['PENDING', 'OVERDUE']);
  const statuses = { PENDING: 'Pendente', OVERDUE: 'Vencida', RECEIVED: 'Recebida', CONFIRMED: 'Confirmada', RECEIVED_IN_CASH: 'Recebida', CANCELED: 'Cancelada', CANCELLED: 'Cancelada', DELETED: 'Cancelada', REFUNDED: 'Estornada', REFUND_REQUESTED: 'Estorno solicitado', REFUND_IN_PROGRESS: 'Estorno em andamento', CHARGEBACK_REQUESTED: 'Contestação solicitada', CHARGEBACK_DISPUTE: 'Em contestação', AWAITING_CHARGEBACK_REVERSAL: 'Reversão em análise' };
  const methodName = value => ({ PIX: 'Pix mensal', CREDIT_CARD: 'Cartão', BOLETO: 'Boleto' }[value] || 'Forma de pagamento a confirmar');
  function safeUrl(value, checkout = false) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password) return '';
      if (checkout && url.hostname !== 'asaas.com' && !url.hostname.endsWith('.asaas.com')) return '';
      return url.href;
    } catch { return ''; }
  }
  function amount(value) { return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)); }
  function total(row) { return row.total_cents ?? row.value_cents; }
  function composition(row) {
    const knownTotal = total(row);
    if (String(row.quote_state || '').toLowerCase() === 'discrepancy') {
      return `<dl class="billing-composition"><div><dt>Total</dt><dd>${amount(knownTotal) ? portalMoney(knownTotal) : '—'}</dd></div></dl><p class="billing-warning">Pagamento confirmado com valor diferente do previsto. A administração vai conferir esta cobrança.</p>`;
    }
    const complete = ['base_cents', 'method_adjustment_cents', 'fine_cents', 'interest_cents'].every(key => amount(row[key]));
    const line = (label, value) => `<div><dt>${label}</dt><dd>${amount(value) ? portalMoney(value) : '—'}</dd></div>`;
    const adj = Number(row.method_adjustment_cents || 0);
    const pct = amount(row.method_adjustment_percent) && Number(row.method_adjustment_percent) ? ` (${esc(row.method_adjustment_percent)}%)` : '';
    const parts = complete ? [line('Mensalidade', row.base_cents),
      adj ? line(`${adj < 0 ? 'Desconto' : 'Acréscimo'} da forma de pagamento${pct}`, row.method_adjustment_cents) : '',
      Number(row.fine_cents) ? line('Multa por atraso', row.fine_cents) : '',
      Number(row.interest_cents) ? line('Juros por atraso', row.interest_cents) : '',
      amount(row.discount_cents) && Number(row.discount_cents) !== 0 ? line('Outros descontos', row.discount_cents) : ''].join('') : '';
    return `<dl class="billing-composition">${parts}${line('Total', knownTotal)}</dl>${!amount(knownTotal) ? '<p class="billing-note">Total ainda não disponível.</p>' : ''}`;
  }
  function invoiceCards(payment) {
    const rows = state.invoices.filter(i => i.asaas_payment_id === payment.asaas_payment_id && payment.asaas_payment_id);
    if (!rows.length) return '<p class="billing-note">NFS-e: nenhuma nota disponível para esta cobrança.</p>';
    const names = { SCHEDULED: 'Pendente', PENDING: 'Pendente', SYNCHRONIZED: 'Em emissão', PROCESSING: 'Em emissão', AUTHORIZED: 'Emitida', ERROR: 'Falha na emissão', FAILED: 'Falha na emissão', CANCELED: 'Cancelada', CANCELLED: 'Cancelada', CANCELLATION_DENIED: 'Cancelamento negado', CANCELLATION_REQUESTED: 'Cancelamento solicitado' };
    return `<div class="billing-invoices">${rows.map(i => {
      const status = String(i.status || '').toUpperCase(), authorized = status === 'AUTHORIZED';
      const pdf = authorized ? safeUrl(i.pdf_url) : '', xml = authorized ? safeUrl(i.xml_url) : '';
      return `<div><strong>NFS-e${i.number ? ` nº ${esc(i.number)}` : ''} · ${esc(names[status] || 'Situação a confirmar')}</strong>${i.effective_date ? `<p class="billing-note">Data: ${portalDate(i.effective_date)}</p>` : ''}${i.status_description ? `<p class="billing-note">${esc(i.status_description)}</p>` : ''}<div class="billing-actions">${pdf ? `<a class="btn sm" href="${esc(pdf)}" target="_blank" rel="noopener noreferrer">PDF da NFS-e</a>` : ''}${xml ? `<a class="btn sm" href="${esc(xml)}" target="_blank" rel="noopener noreferrer">XML da NFS-e</a>` : ''}</div>${authorized && !pdf && !xml ? '<p class="billing-note">Arquivos ainda não disponíveis.</p>' : ''}</div>`;
    }).join('')}</div>`;
  }
  function monthKey(row) {
    const candidate=String(row.reference_month || row.due_date || '').slice(0,7);
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(candidate) ? candidate : 'unknown';
  }
  function monthName(key) {
    if(key==='unknown') return 'Competência não informada';
    const months=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    return `${months[Number(key.slice(5))-1]} de ${key.slice(0,4)}`;
  }
  // ─── Microinterações ───
  const calm = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const loading = (el, on) => { if (!el) return; el.classList.toggle('is-loading', on); el.setAttribute('aria-busy', on ? 'true' : 'false'); };
  let lastCounted = '';
  // Valor do destaque sobe em contagem quando o atleta muda ou a tela abre
  function countUp() {
    const el = document.querySelector('.pb-hero-amount[data-count]');
    if (!el) return;
    const key = `${PORTAL.selected}|${el.dataset.count}`;
    if (key === lastCounted || calm()) { lastCounted = key; return; }
    lastCounted = key;
    const target = Number(el.dataset.count), start = performance.now(), dur = 650;
    const step = now => { const t = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - t, 3);
      if (!el.isConnected) return; el.textContent = portalMoney(Math.round(target * e)); if (t < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  // Abre o diálogo com animação de entrada (folha que sobe no celular)
  function openSheet(dialog) { dialog.classList.remove('pbd-in'); if (!dialog.open) dialog.showModal(); void dialog.offsetWidth; dialog.classList.add('pbd-in'); }
  // Confirmação visual de pagamento recebido
  function celebrate(row) {
    const dialog = document.querySelector('#billingDialog');
    dialog.innerHTML = `<div class="billing-dialog-content pbd-success"><svg class="pbd-check" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-16"/></svg><h2 id="billingDialogTitle">Pagamento confirmado!</h2><p>${row ? `${esc(monthName(monthKey(row)))} · ${amount(total(row)) ? portalMoney(total(row)) : ''}` : 'Mensalidade quitada.'}</p><p class="pbd-foot">Obrigado! O comprovante e a nota fiscal ficam no histórico.</p><button class="btn primary pb-cta" data-billing-close>Fechar</button></div>`;
    openSheet(dialog);
  }
  const dialogHead = (title, sub='') => `<div class="pbd-head"><div><h2 id="billingDialogTitle">${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div><button class="pbd-x" data-billing-close aria-label="Fechar">×</button></div>`;
  function paymentContext(row) {
    return `<p class="billing-payment-context">Competência: <strong>${esc(monthName(monthKey(row)))}</strong> · Vencimento: ${portalDate(row.due_date)}</p>`;
  }
  function automaticPayment(row) {
    const sub=state.subscriptions.find(s=>s.id===row.subscription_id);
    const type=row.billing_type || sub?.method;
    const instruction=!['REFUSED','CANCELLED'].includes(row.automatic_debit_status);
    const pix=type==='PIX' && sub?.pix_automatic_ready===true && instruction;
    const card=type==='CREDIT_CARD' && sub?.card_automatic_ready===true && row.status==='PENDING';
    return pix ? 'Pix Automático' : card ? 'Cartão de crédito' : '';
  }
  function payButton(payment, compact=false) {
    const automatic=automaticPayment(payment);
    if(automatic){
      const pendingPix=automatic==='Pix Automático' && !(payment.automatic_debit_status==='SCHEDULED' && payment.automatic_debit_ready===true);
      return `<p class="pb-auto-line"><span class="pb-dot is-ok" aria-hidden="true"></span>${pendingPix ? 'Débito automático em preparação' : `Será cobrado automaticamente (${esc(automatic)})`}</p>`;
    }
    const pending=['pending','updating'].includes(String(payment.quote_state).toLowerCase());
    const failed=['REFUSED','CANCELLED'].includes(payment.automatic_debit_status);
    const future=monthKey(payment)!=='unknown' && monthKey(payment)>todayKey().slice(0,7) && !isOverdue(payment);
    const label=pending ? 'Atualizando valor…' : compact ? (future ? 'Antecipar' : 'Pagar') : `${future ? 'Antecipar' : 'Pagar'} ${amount(total(payment)) ? portalMoney(total(payment)) : 'mensalidade'}`;
    return `${failed ? '<p class="pb-auto-line is-bad">O débito automático não foi confirmado. Pague manualmente.</p>' : ''}<button class="btn ${compact ? 'sm' : 'primary pb-cta'}" data-billing-pay="${esc(payment.id)}" ${state.busy || pending ? 'disabled' : ''}>${label}</button>`;
  }
  function forecastBlock(row) {
    if(!payable.has(String(row.status).toUpperCase()))return '';
    if(!Array.isArray(row.forecast) || !row.forecast.length)return '<p class="billing-note">Previsão de atraso indisponível para esta cobrança. Consulte a administração.</p>';
    return `<section class="billing-forecast"><h4>Previsão de atraso</h4><p class="billing-note">${esc(row.forecast_description || '')}</p><div class="billing-forecast-list">${row.forecast.map(q=>`<div><span>Pagamento em <strong>${portalDate(q.date)}</strong><small>${esc(q.days)} dia(s) após o vencimento</small></span><span><strong>${portalMoney(q.totalCents)}</strong><small>Multa ${portalMoney(q.fineCents)} · juros ${portalMoney(q.interestCents)}</small></span></div>`).join('')}</div><p class="billing-note">Estimativa automática na forma de pagamento atual, sem novos pagamentos ou descontos. O valor definitivo será atualizado ao pagar.</p></section>`;
  }
  function paymentDetail(payment) {
    const sub=state.subscriptions.find(s=>s.id===payment.subscription_id);
    return `<div class="billing-charge"><p class="billing-note">${esc(payment.package_name || sub?.package_name || 'Mensalidade')} · ${esc(methodName(payment.billing_type || sub?.method))} · vence ${portalDate(payment.due_date)}${payment.paid_at ? ` · paga em ${portalDate(payment.paid_at)}` : ''}</p>${composition(payment)}${['uncertain','updating'].includes(payment.quote_state) ? '<p class="billing-warning">O valor está sendo atualizado. Tente pagar novamente em instantes.</p>' : ''}${forecastBlock(payment)}</div>`;
  }
  const todayKey = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const up = row => String(row.status || '').toUpperCase();
  function isOverdue(row) { return payable.has(up(row)) && (up(row)==='OVERDUE' || (/^\d{4}-\d{2}-\d{2}$/.test(row.due_date||'') && row.due_date<todayKey())); }
  function chip(row) {
    const st=up(row);
    if(paid.has(st)) return ['Paga','is-ok'];
    if(isOverdue(row)) return ['Em atraso','is-bad'];
    if(payable.has(st)) return monthKey(row)>todayKey().slice(0,7) ? ['Prevista','is-muted'] : ['A vencer','is-warn'];
    if(canceled.has(st)) return [statuses[st] || 'Cancelada','is-muted'];
    return [statuses[st] || 'Em análise','is-muted'];
  }
  const chipHtml = row => { const [l,c]=chip(row); return `<span class="pb-chip ${c}">${esc(l)}</span>`; };
  function shortMonth(key) { if(key==='unknown') return 'Mensalidade'; const m=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']; return `${m[Number(key.slice(5))-1]}/${key.slice(2,4)}`; }
  // Situação do pagamento automático do atleta (o que a família já ativou ou pode ativar)
  function autoState(athlete) {
    const subs=state.subscriptions.filter(s=>s.athlete_id===athlete.id && ['pending','active'].includes(s.status));
    const pix=subs.find(s=>s.automatic_mode==='PIX_AUTOMATIC');
    if(pix?.pix_automatic_ready===true) return {on:true,label:'Pix Automático',sub:pix,cancel:true};
    const card=subs.find(s=>s.method==='CREDIT_CARD' && s.status==='active');
    if(card) return {on:true,label:'Cartão de crédito',sub:card};
    if(pix && ['CREATED','ACTIVE'].includes(pix.pix_authorization_status)) return {waiting:true,label:'Pix Automático',sub:pix};
    return {on:false,pix:pix&&pix.pix_authorization_available?pix:null,card:subs.find(s=>s.card_activation_available===true)||null,any:subs.length>0};
  }
  function autoCard(athlete) {
    const choice=state.subscriptions.find(s=>s.athlete_id===athlete.id && s.status==='awaiting_choice');
    if(choice) return `<section class="pb-auto pb-choose"><span class="pb-auto-icon is-off" aria-hidden="true">★</span><div><strong>Escolha como pagar as mensalidades</strong><p>${portalMoney(choice.base_cents ?? choice.value_cents)} por mês, todo dia ${esc(choice.due_day)}. Com cartão ou Pix Automático, você não precisa entrar aqui todo mês.</p><div class="pb-auto-actions"><button class="btn primary" data-billing-choose="${esc(choice.id)}">Escolher forma de pagamento</button></div></div></section>`;
    if(state.subscriptions.some(s=>s.athlete_id===athlete.id && s.status==='choosing')) return `<section class="pb-auto"><span class="pb-auto-icon is-wait" aria-hidden="true">…</span><div><strong>Registrando sua escolha</strong><p>Isso leva só alguns segundos. Atualize em instantes.</p></div></section>`;
    const pendingCard=state.subscriptions.find(s=>s.athlete_id===athlete.id && s.method==='CREDIT_CARD' && s.status==='pending' && s.checkout_url);
    if(pendingCard) return `<section class="pb-auto"><span class="pb-auto-icon is-wait" aria-hidden="true">…</span><div><strong>Falta cadastrar o cartão</strong><p>Abra a página segura do Asaas e cadastre o cartão uma única vez. As próximas mensalidades serão cobradas automaticamente.</p><div class="pb-auto-actions"><a class="btn primary" href="${esc(safeUrl(pendingCard.checkout_url,true))}" target="_blank" rel="noopener noreferrer" data-billing-card-open>Cadastrar cartão</a></div></div></section>`;
    const a=autoState(athlete);
    if(a.on) return `<section class="pb-auto is-on"><span class="pb-auto-icon" aria-hidden="true">✓</span><div><strong>Pagamento automático ativo</strong><p>${esc(a.label)}. As próximas mensalidades são cobradas sem você precisar entrar aqui.</p></div>${a.cancel ? `<button class="btn sm ghost" data-billing-auto-cancel="${esc(a.sub.id)}">Cancelar</button>` : ''}</section>`;
    if(a.waiting) return `<section class="pb-auto"><span class="pb-auto-icon is-wait" aria-hidden="true">…</span><div><strong>Aguardando confirmação do banco</strong><p>Você iniciou a autorização do Pix Automático. Assim que o banco confirmar, os débitos passam a ser automáticos.</p></div><button class="btn sm" data-billing-auto-status="${esc(a.sub.id)}">Consultar</button></section>`;
    if(!a.any) return '';
    const options=[a.pix ? `<button class="btn" data-billing-auto-prepare="${esc(a.pix.id)}">Ativar Pix Automático</button>` : '', a.card ? `<button class="btn" data-billing-card-activate="${esc(a.card.id)}">Cadastrar cartão de crédito</button>` : ''].filter(Boolean).join('');
    return `<section class="pb-auto"><span class="pb-auto-icon is-off" aria-hidden="true">↻</span><div><strong>Pague sem precisar entrar todo mês</strong><p>${options ? 'Ative uma vez e as próximas mensalidades são cobradas automaticamente.' : 'O pagamento automático (cartão ou Pix Automático) será liberado pela administração em breve. Enquanto isso, pague cada mês por aqui.'}</p>${options ? `<div class="pb-auto-actions">${options}</div>` : ''}</div></section>`;
  }
  function overdueAlert(athlete, overdue) {
    if(!overdue.length) return '';
    const sum=overdue.reduce((n,p)=>n+Number(total(p)||0),0);
    const info=state.delinquency.find(r=>r.athlete_id===athlete.id && r.overdue_count>0);
    const restrict=info && (info.blocked || info.simulation);
    return `<div class="pb-alert" role="alert"><strong>${overdue.length===1 ? '1 mensalidade em atraso' : `${overdue.length} mensalidades em atraso`} · ${portalMoney(sum)}</strong>${restrict ? `<p>A participação nos treinos fica condicionada à regularização.${info.simulation ? ' <em>(Ambiente de testes: nenhum treino é bloqueado.)</em>' : ''}</p>` : ''}</div>`;
  }
  function historyRow(row) {
    const sub=state.subscriptions.find(s=>s.id===row.subscription_id);
    const st=up(row), when=row.paid_at ? `Paga em ${portalDate(row.paid_at)}` : `Vence ${portalDate(row.due_date)}`;
    return `<details class="pb-row"><summary><span class="pb-row-month">${esc(shortMonth(monthKey(row)))}</span><span class="pb-row-main"><strong>${esc(row.package_name || sub?.package_name || 'Mensalidade')}</strong><small>${esc(when)}</small></span><span class="pb-row-end"><b>${amount(total(row)) ? portalMoney(total(row)) : '—'}</b>${chipHtml(row)}</span></summary><div class="pb-row-body">${paymentDetail(row)}${paid.has(st) ? invoiceCards(row) : ''}</div></details>`;
  }

  async function load() {
    state.loading = true;
    try {
      const { data, error } = await financeDbClient().rpc('billing_portal_data');
      if (error) throw error;
      if (!data || !Array.isArray(data.payments) || !Array.isArray(data.subscriptions) || !Array.isArray(data.invoices)) throw new Error('Resposta indisponível');
      state.payments = data.payments; state.subscriptions = data.subscriptions; state.invoices = data.invoices; state.error = '';
      if(state.payments.some(p=>p.forecast_terms)) {
        try { const {buildForecast}=await import('./billing-forecast.mjs'); const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
          for(const row of state.payments) { try { Object.assign(row,buildForecast(row,today)||{}); } catch { /* A malformed estimate cannot block invoices or payments. */ } }
        } catch { /* Estimates are optional; payment remains server-revalidated. */ }
      }
    } catch {
      state.payments = []; state.subscriptions = []; state.invoices = [];
      state.error = 'Não foi possível carregar as cobranças. Tente atualizar em instantes.';
    } finally { state.loading = false; }
    try {const {data,error}=await financeDbClient().rpc('billing_delinquency_state');state.delinquency=!error && Array.isArray(data)?data:[];}catch{state.delinquency=[];}
    notify();
  }
  async function autoRequest(action,subscriptionId,extra={}) {
    const sub=state.subscriptions.find(row=>row.id===subscriptionId && row.athlete_id===PORTAL.selected && row.automatic_mode==='PIX_AUTOMATIC');
    if(!sub)throw new Error('Mensalidade não vinculada ao atleta selecionado.');
    const {data,error}=await financeDbClient().functions.invoke('billing-pix-automatic',{body:{action,subscriptionId,...extra}});
    if(error || !data || data.error)throw new Error(data?.error || 'Não foi possível consultar o Pix Automático. Tente atualizar.');
    return data;
  }
  function autoQr(result,id) {
    const dialog=document.querySelector('#billingDialog'),pix=result.pix;
    if(result.ready===true){state.automaticConsent=null;dialog.close();return;}
    if(!pix?.payload){message('A autorização ainda não foi confirmada. Atualize para consultar novamente.');return;}
    const qr=typeof pix.encodedImage==='string' && /^[A-Za-z0-9+/=\r\n]+$/.test(pix.encodedImage) && pix.encodedImage.length<1000000 ? pix.encodedImage.replace(/[\r\n]/g,'') : '';
    dialog.innerHTML=`<div class="billing-dialog-content">${dialogHead('Autorizar no seu banco')}<p>Este QR reúne o primeiro pagamento e o pedido de autorização para os próximos meses. Confira os valores e confirme a autorização no aplicativo do seu banco. Ela ainda não está ativa.</p><div class="billing-pix">${qr ? `<img src="data:image/png;base64,${qr}" alt="QR de primeiro pagamento e autorização Pix Automático" width="220" height="220">` : ''}<label for="billingPixCode">Pix copia e cola para autorização</label><textarea id="billingPixCode" readonly rows="3">${esc(pix.payload)}</textarea><button class="btn sm" data-billing-copy>Copiar código</button><p id="billingCopyStatus" role="status"></p></div><div id="billingDialogMessage" role="status"></div><button class="btn primary pb-cta" data-billing-auto-status="${esc(id)}">Já autorizei: consultar confirmação</button></div>`;
    openSheet(dialog);
  }
  async function automaticAction(target) {
    if(state.busy)return;
    state.busy=true;target.disabled=true;loading(target,true);
    try{
      if(target.hasAttribute('data-billing-auto-prepare')){
        const id=target.dataset.billingAutoPrepare,result=await autoRequest('prepare',id);
        if(!result.consentToken || !Number.isSafeInteger(result.firstPaymentCents) || !Number.isSafeInteger(result.recurringValueCents))throw new Error('Plano de autorização indisponível.');
        state.automaticConsent={id,athleteId:PORTAL.selected,token:result.consentToken};
        const dialog=document.querySelector('#billingDialog');
        dialog.innerHTML=`<div class="billing-dialog-content">${dialogHead('Pix Automático')}<p>Primeiro pagamento: <strong>${portalMoney(result.firstPaymentCents)}</strong> · competência ${esc(result.firstCompetence || '')}.</p><p>Próximos débitos mensais: <strong>${portalMoney(result.recurringValueCents)}</strong>, a partir de <strong>${portalDate(result.startDate)}</strong>.</p><p>${esc(result.description || '')}</p><p>A confirmação final será feita por você no aplicativo do banco. Você poderá cancelar a autorização. Nenhuma mensalidade é considerada paga antes da confirmação do Asaas.</p><label class="billing-consent-check"><input type="checkbox" id="billingAutoAccept"> Quero iniciar a autorização do primeiro pagamento e dos débitos mensais descritos acima.</label><div id="billingDialogMessage" role="status"></div><button class="btn primary pb-cta" data-billing-auto-consent="${esc(id)}">Gerar QR de autorização</button></div>`;
        openSheet(dialog);
      }else if(target.hasAttribute('data-billing-auto-consent')){
        const id=target.dataset.billingAutoConsent,plan=state.automaticConsent;
        if(!plan || plan.id!==id || plan.athleteId!==PORTAL.selected || !document.querySelector('#billingAutoAccept')?.checked)throw new Error('Marque a confirmação para iniciar a autorização.');
        const result=await autoRequest('consent',id,{consentToken:plan.token,confirm:true});state.automaticConsent=null;autoQr(result,id);
      }else if(target.hasAttribute('data-billing-auto-status')){
        const id=target.dataset.billingAutoStatus,result=await autoRequest('status',id);autoQr(result,id);if(result.ready){await load();portalRender();}
      }else if(target.hasAttribute('data-billing-auto-cancel')){
        const id=target.dataset.billingAutoCancel,dialog=document.querySelector('#billingDialog');
        dialog.innerHTML=`<div class="billing-dialog-content">${dialogHead('Cancelar Pix Automático?')}<p>Os próximos débitos automáticos deixarão de ser programados. Mensalidades já emitidas permanecem devidas e precisam ser acompanhadas. Esta ação não estorna pagamentos.</p><div class="pbd-actions"><button class="btn" data-billing-close>Manter autorização</button><button class="btn danger" data-billing-auto-cancel-confirm="${esc(id)}">Confirmar cancelamento</button></div><div id="billingDialogMessage" class="pbd-msg" role="status"></div></div>`;openSheet(dialog);
      }else if(target.hasAttribute('data-billing-auto-cancel-confirm')){
        await autoRequest('cancel',target.dataset.billingAutoCancelConfirm,{confirm:true});document.querySelector('#billingDialog').close();await load();portalRender();
      }
    }catch(error){message(error.message);}finally{state.busy=false;target.disabled=false;loading(target,false);}
  }
  function render(athlete) {
    const rows=state.payments.filter(p=>p.athlete_id===athlete.id);
    const open=rows.filter(p=>payable.has(up(p))).sort((a,b)=>String(a.due_date||'').localeCompare(String(b.due_date||'')));
    const overdue=open.filter(isOverdue);
    const rest=rows.filter(p=>!payable.has(up(p))).sort((a,b)=>String(b.due_date||'').localeCompare(String(a.due_date||'')));
    const focus=open[0];
    const hero=focus
      ? `<section class="pb-hero ${isOverdue(focus) ? 'is-bad' : ''}"><div class="pb-hero-top"><span>${isOverdue(focus) ? 'Mensalidade em aberto' : 'Próxima mensalidade'}</span>${chipHtml(focus)}</div><div class="pb-hero-amount" ${amount(total(focus)) ? `data-count="${Number(total(focus))}"` : ''}>${amount(total(focus)) ? portalMoney(total(focus)) : 'A confirmar'}</div><p class="pb-hero-sub">${esc(monthName(monthKey(focus)))} · vence ${portalDate(focus.due_date)}</p>${payButton(focus)}<details class="pb-hero-more"><summary>Ver detalhes do valor</summary>${paymentDetail(focus)}</details></section>`
      : `<section class="pb-hero is-ok"><div class="pb-hero-top"><span>Situação</span></div><div class="pb-hero-amount pb-ok">Tudo em dia</div><p class="pb-hero-sub">${rows.length ? 'Nenhuma mensalidade em aberto.' : 'Nenhuma mensalidade lançada para este atleta ainda.'}</p></section>`;
    const others=open.slice(1);
    setTimeout(countUp, 0);
    return `<section class="portal-billing pb" aria-labelledby="billingTitle">
      <div class="pb-head"><h2 id="billingTitle">Mensalidades</h2><button class="btn sm ghost" data-billing-refresh ${state.busy || state.loading ? 'disabled' : ''} aria-label="Atualizar mensalidades">↻ Atualizar</button></div>
      <div id="billingMessage" class="pb-message" role="status" aria-live="polite">${state.error ? `<p class="billing-warning">${esc(state.error)}</p>` : ''}</div>
      ${overdueAlert(athlete, overdue)}
      ${state.error ? '' : hero}
      ${state.error ? '' : autoCard(athlete)}
      ${others.length ? `<h3 class="pb-title">Também em aberto</h3><div class="pb-list">${others.map(p=>`<div class="pb-open"><span class="pb-row-month">${esc(shortMonth(monthKey(p)))}</span><span class="pb-row-main"><strong>${amount(total(p)) ? portalMoney(total(p)) : '—'}</strong><small>Vence ${portalDate(p.due_date)} · ${esc(chip(p)[0])}</small></span>${payButton(p,true)}</div>`).join('')}</div>` : ''}
      ${rest.length ? `<h3 class="pb-title">Histórico</h3><div class="pb-list">${rest.map(historyRow).join('')}</div>` : ''}
    </section>`;
  }
  function notify() {
    // O aviso de atraso aparece no topo da aba Mensalidades; nada abre sobre a tela.
    const dialog=document.querySelector('#billingRestrictionDialog');
    if(dialog?.open) dialog.close();
  }
  function message(text) {
    const el = document.querySelector('#billingMessage');
    if (el) el.textContent = text;
    const dialogMessage = document.querySelector('#billingDialogMessage');
    if (dialogMessage) dialogMessage.textContent = text;
  }
  async function preview(id, trigger) {
    if (state.busy || state.error) return;
    const row = state.payments.find(p => p.id === id && p.athlete_id === PORTAL.selected);
    if (!row || automaticPayment(row) || !payable.has(String(row.status).toUpperCase()) || ['pending', 'updating'].includes(String(row.quote_state).toLowerCase())) return;
    state.busy = true; trigger.disabled = true; loading(trigger, true); state.choice = null;
    try {
      message('Consultando as formas de pagamento…');
      const { data, error } = await financeDbClient().functions.invoke('billing-portal', { body: { action: 'preview', paymentId: id } });
      if (error || !data || data.error) throw new Error('Não foi possível consultar as opções. Atualize as cobranças e tente novamente.');
      if (PORTAL.tab !== 'pay' || PORTAL.selected !== row.athlete_id) return;
      if (data.canChangeMethod !== true) {
        state.busy = false;
        await payment(id, trigger);
        return;
      }
      const quotes = Array.isArray(data.quotes) ? data.quotes.filter(q => ['PIX', 'CREDIT_CARD'].includes(q.method) && amount(total(q))) : [];
      if (!quotes.length) throw new Error('Os preços das formas de pagamento ainda não estão disponíveis.');
      state.choice = { id, athleteId: row.athlete_id, methods: quotes.map(q => q.method) };
      const dialog = document.querySelector('#billingDialog');
      const first = quotes[0].method;
      dialog.innerHTML = `<div class="billing-dialog-content">${dialogHead('Como você quer pagar?', `${esc(monthName(monthKey(row)))} · vence ${portalDate(row.due_date)}`)}<div class="pbd-options" role="radiogroup" aria-label="Forma de pagamento">${quotes.map(q => { const adj=Number(q.method_adjustment_cents||0); return `<label class="pbd-option"><input type="radio" name="pbdMethod" value="${esc(q.method)}" ${q.method===first ? 'checked' : ''}><span class="pbd-option-main"><strong>${q.method === 'PIX' ? 'Pix' : 'Cartão de crédito'}</strong><small>${adj ? `${adj < 0 ? 'Desconto' : 'Acréscimo'} de ${portalMoney(Math.abs(adj))}` : 'Sem acréscimo'}${Number(q.fine_cents)+Number(q.interest_cents) ? ' · inclui multa e juros' : ''}</small></span><b>${portalMoney(total(q))}</b></label>`; }).join('')}</div><details class="pbd-more"><summary>Ver composição do valor</summary>${quotes.map(q => `<div class="pbd-comp"><strong>${q.method === 'PIX' ? 'Pix' : 'Cartão de crédito'}</strong>${composition(q)}</div>`).join('')}</details><div id="billingDialogMessage" class="pbd-msg" role="status" aria-live="polite"></div><button class="btn primary pb-cta" data-billing-confirm="${esc(id)}" data-billing-method="${esc(first)}">Continuar</button><p class="pbd-foot">Vale só para esta cobrança. O valor é conferido no Asaas antes do pagamento.</p></div>`;
      dialog.querySelectorAll('input[name=pbdMethod]').forEach(r => r.onchange = () => { dialog.querySelector('[data-billing-confirm]').dataset.billingMethod = r.value; });
      openSheet(dialog);
      message('');
    } catch (error) { message(error.message); }
    finally { state.busy = false; trigger.disabled = false; loading(trigger, false); }
  }
  async function payment(id, trigger, method = null) {
    if (state.busy || state.error) return;
    if (method && (!state.choice || state.choice.id !== id || state.choice.athleteId !== PORTAL.selected || !state.choice.methods.includes(method))) return;
    const row = state.payments.find(p => p.id === id && p.athlete_id === PORTAL.selected);
    if (!row || automaticPayment(row) || !payable.has(String(row.status).toUpperCase()) || ['pending', 'updating'].includes(String(row.quote_state).toLowerCase())) return;
    state.busy = true; trigger.disabled = true; loading(trigger, true);
    let opened = false;
    try {
      message('Consultando o valor atualizado no Asaas…');
      const { data, error } = await financeDbClient().functions.invoke('billing-portal', { body: { action: 'payment', paymentId: id, ...(method ? { method } : {}) } });
      if (error || !data || data.error) throw new Error('Não foi possível revalidar a cobrança. Atualize os dados e tente novamente.');
      if (data.paid === true || paid.has(String(data.quote?.status).toUpperCase())) {
        state.choice = null;
        await load(); portalRender(); celebrate(state.payments.find(p => p.id === id) || row);
        return;
      }
      const quote = data.quote;
      if (!quote || !['current', 'legacy'].includes(String(quote.quote_state || '').toLowerCase()) || !amount(total(quote))) throw new Error('O valor ainda está em atualização. Aguarde e atualize as cobranças antes de pagar.');
      if (quote.status && !payable.has(String(quote.status).toUpperCase())) throw new Error('Esta cobrança não está disponível para pagamento. Atualize os dados.');
      if (PORTAL.tab !== 'pay' || PORTAL.selected !== row.athlete_id) return;
      if (method && !state.choice) return;
      const url = safeUrl(data.invoiceUrl, true);
      const pix = data.pix && typeof data.pix.payload === 'string' && data.pix.payload ? data.pix : null;
      if (!url && !pix) throw new Error('As opções de pagamento ainda não estão disponíveis.');
      const dialog = document.querySelector('#billingDialog');
      const qr = pix && typeof pix.encodedImage === 'string' && /^[A-Za-z0-9+/=\r\n]+$/.test(pix.encodedImage) && pix.encodedImage.length < 1000000 ? pix.encodedImage.replace(/[\r\n]/g, '') : '';
      const isCard = (method || row.billing_type || state.subscriptions.find(s => s.id === row.subscription_id)?.method) === 'CREDIT_CARD';
      dialog.innerHTML = `<div class="billing-dialog-content">${dialogHead(isCard ? 'Pagar com cartão' : 'Pagar com Pix', `${esc(monthName(monthKey(row)))} · <b>${amount(total(quote)) ? portalMoney(total(quote)) : ''}</b>`)}${pix && !isCard ? `<div class="billing-pix pbd-pix">${qr ? `<img src="data:image/png;base64,${qr}" alt="QR Code Pix desta cobrança" width="200" height="200">` : ''}<p class="pbd-hint">Abra o app do seu banco, escolha Pix e leia o QR Code, ou copie o código abaixo.</p><textarea id="billingPixCode" readonly rows="3">${esc(pix.payload)}</textarea><button class="btn primary pb-cta" data-billing-copy>Copiar código Pix</button><p id="billingCopyStatus" role="status" aria-live="polite"></p></div>` : ''}${url ? `<a class="btn ${isCard || !pix ? 'primary pb-cta' : 'ghost pbd-link'}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${isCard ? 'Abrir página segura de pagamento' : 'Abrir página do Asaas'}</a>` : ''}<details class="pbd-more"><summary>Ver composição do valor</summary>${composition(quote)}</details><button class="btn pbd-return" data-billing-return>Já paguei · atualizar</button><p class="pbd-foot">A mensalidade aparece como paga assim que o Asaas confirmar.</p></div>`;
      state.choice = null;
      state.watching = id; openSheet(dialog); opened = true; message('');
    } catch (error) { message(error.message); }
    finally { state.busy = false; loading(trigger, false); if (!opened) trigger.disabled = false; }
  }
  // ─── Escolha da forma de pagamento pela família ───
  const choiceLabel = { PIX_AUTOMATIC: ['Pix Automático', 'Você autoriza uma vez no app do banco e o débito é automático todo mês.', 'Recomendado'],
    CREDIT_CARD: ['Cartão de crédito', 'Cadastre o cartão uma vez numa página segura. Cobrança automática todo mês.', ''],
    PIX: ['Pix mensal', 'Todo mês você recebe um Pix para pagar por aqui.', ''] };
  async function chooseOpen(id, trigger) {
    const dialog=document.querySelector('#billingDialog');
    loading(trigger,true); trigger.disabled=true;
    try {
      const {data,error}=await financeDbClient().functions.invoke('billing-asaas',{body:{action:'choice_quote',subscriptionId:id}});
      if(error || !data || data.error || !Array.isArray(data.options)) throw new Error(data?.error || 'Não foi possível carregar as opções agora. Tente atualizar.');
      const first=data.options[0].method;
      dialog.innerHTML=`<div class="billing-dialog-content">${dialogHead('Como você quer pagar?', `Mensalidade de ${esc(portalCurrent()?.full_name || '')} · todo dia ${esc(data.dueDay)}`)}<div class="pbd-options" role="radiogroup" aria-label="Forma de pagamento">${data.options.map(o=>{const [n,d,tag]=choiceLabel[o.method];return `<label class="pbd-option"><input type="radio" name="pbdChoice" value="${esc(o.method)}" ${o.method===first?'checked':''}><span class="pbd-option-main"><strong>${n}${tag?` <em class="pbd-tag">${tag}</em>`:''}</strong><small>${d}</small></span><b>${portalMoney(o.totalCents)}<small>/mês</small></b></label>`;}).join('')}</div><div id="billingDialogMessage" class="pbd-msg" role="status" aria-live="polite"></div><button class="btn primary pb-cta" data-billing-choose-confirm="${esc(id)}">Confirmar</button><p class="pbd-foot">Você pode pedir à administração para mudar a forma depois.</p></div>`;
      openSheet(dialog);
    } catch(e) { message(e.message); }
    finally { loading(trigger,false); trigger.disabled=false; }
  }
  async function chooseConfirm(id, trigger) {
    const method=document.querySelector('input[name=pbdChoice]:checked')?.value;
    if(!method) return;
    loading(trigger,true); trigger.disabled=true; state.busy=true;
    try {
      const {data,error}=await financeDbClient().functions.invoke('billing-asaas',{body:{action:'choose',subscriptionId:id,method}});
      let body=data; if(error){ try{ body=await error.context.json(); }catch{ body=null; } }
      if(!body || body.error || !body.ok) throw new Error(body?.error || 'Não foi possível registrar a escolha. Tente novamente.');
      await load(); portalRender();
      const dialog=document.querySelector('#billingDialog');
      if(method==='CREDIT_CARD' && body.checkoutUrl){
        dialog.innerHTML=`<div class="billing-dialog-content pbd-success">${'<svg class="pbd-check" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-16"/></svg>'}<h2 id="billingDialogTitle">Agora cadastre o cartão</h2><p>Abra a página segura do Asaas e cadastre o cartão uma única vez.</p><a class="btn primary pb-cta" href="${esc(safeUrl(body.checkoutUrl,true))}" target="_blank" rel="noopener noreferrer">Cadastrar cartão</a><button class="btn pbd-return" data-billing-return>Já cadastrei · atualizar</button></div>`;
        openSheet(dialog);
      } else if(method==='PIX_AUTOMATIC'){
        state.busy=false; dialog.close();
        const btn=document.querySelector(`[data-billing-auto-prepare="${CSS.escape(id)}"]`); if(btn) await automaticAction(btn);
      } else {
        dialog.innerHTML=`<div class="billing-dialog-content pbd-success"><svg class="pbd-check" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-16"/></svg><h2 id="billingDialogTitle">Tudo certo!</h2><p>Todo mês a mensalidade aparece aqui com o Pix pronto para pagar.${body.nextDueDate ? ` Primeiro vencimento: ${portalDate(body.nextDueDate)}.` : ''}</p><button class="btn primary pb-cta" data-billing-close>Ver mensalidade</button></div>`;
        openSheet(dialog);
      }
    } catch(e) { message(e.message); }
    finally { state.busy=false; loading(trigger,false); trigger.disabled=false; }
  }
  document.addEventListener('click', async event => {
    const choose=event.target.closest('[data-billing-choose],[data-billing-choose-confirm]');
    if(choose){ event.preventDefault(); if(choose.hasAttribute('data-billing-choose')) await chooseOpen(choose.dataset.billingChoose, choose); else await chooseConfirm(choose.dataset.billingChooseConfirm, choose); return; }
  });
  document.addEventListener('click', async event => {
    const target = event.target.closest('[data-billing-refresh],[data-billing-pay],[data-billing-confirm],[data-billing-close],[data-billing-copy],[data-billing-return],[data-billing-dismiss-notice],[data-billing-view-debts],[data-billing-auto-prepare],[data-billing-auto-consent],[data-billing-auto-status],[data-billing-auto-cancel],[data-billing-auto-cancel-confirm]');
    if (!target) return;
    if(['data-billing-auto-prepare','data-billing-auto-consent','data-billing-auto-status','data-billing-auto-cancel','data-billing-auto-cancel-confirm'].some(attr=>target.hasAttribute(attr))){await automaticAction(target);return;}
    if(target.hasAttribute('data-billing-dismiss-notice')){document.querySelector('#billingRestrictionDialog')?.close();return;}
    if(target.hasAttribute('data-billing-view-debts')){document.querySelector('#billingRestrictionDialog')?.close();PORTAL.tab='pay';portalRender();return;}
    if (target.hasAttribute('data-billing-pay')) { await preview(target.dataset.billingPay, target); return; }
    if (target.hasAttribute('data-billing-confirm')) { await payment(target.dataset.billingConfirm, target, target.dataset.billingMethod); return; }
    const dialog = document.querySelector('#billingDialog');
    if (target.hasAttribute('data-billing-close')) { state.choice = null;state.automaticConsent=null; dialog.close(); portalRender(); return; }
    if (target.hasAttribute('data-billing-copy')) {
      const code = document.querySelector('#billingPixCode'), result = document.querySelector('#billingCopyStatus');
      try { await navigator.clipboard.writeText(code.value); result.textContent = 'Agora é só colar no app do seu banco.';
        const label = target.textContent; target.classList.add('is-done'); target.textContent = '✓ Código copiado';
        setTimeout(() => { if (target.isConnected) { target.classList.remove('is-done'); target.textContent = label; } }, 2200); }
      catch { code.focus(); code.select(); result.textContent = 'Selecione e copie o código Pix acima.'; }
      return;
    }
    if (state.busy || state.loading) return;
    state.choice = null;
    if (dialog.open) dialog.close();
    const watched = target.hasAttribute('data-billing-return') ? state.watching : null;
    target.disabled = true; loading(target, true); message('Atualizando cobranças…'); await load(); portalRender(); message('');
    if (watched) { state.watching = null; const row = state.payments.find(p => p.id === watched);
      if (row && paid.has(up(row))) celebrate(row); else message('Ainda não recebemos a confirmação do Asaas. Se você já pagou, aguarde alguns instantes e atualize.'); }
  });
  document.addEventListener('close', event => { if (event.target.id === 'billingDialog') { state.choice = null; portalRender(); } }, true);
  return { load, render, safeUrl, notify };
})();
