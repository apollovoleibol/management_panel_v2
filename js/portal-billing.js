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
      return `<dl class="billing-composition"><div><dt>Total informado</dt><dd>${amount(knownTotal) ? portalMoney(knownTotal) : '—'}</dd></div></dl><p class="billing-warning">Pagamento confirmado com valor diferente da composição prevista. A administração precisa conciliar esta cobrança.</p>`;
    }
    const complete = ['base_cents', 'method_adjustment_cents', 'principal_cents', 'fine_cents', 'interest_cents'].every(key => amount(row[key]));
    const line = (label, value) => `<div><dt>${label}</dt><dd>${amount(value) ? portalMoney(value) : '—'}</dd></div>`;
    const pct = amount(row.method_adjustment_percent) ? ` (${esc(row.method_adjustment_percent)}%)` : '';
    const adjustment = Number(row.method_adjustment_cents);
    return `<dl class="billing-composition">${complete ? `${line('Mensalidade-base', row.base_cents)}${line(`${adjustment < 0 ? 'Desconto' : 'Ajuste'} da forma de pagamento${pct}`, row.method_adjustment_cents)}${line('Principal', row.principal_cents)}${line('Multa', row.fine_cents)}${line('Juros', row.interest_cents)}${amount(row.discount_cents) && Number(row.discount_cents) !== 0 ? line('Outros descontos', row.discount_cents) : ''}` : ''}${line('Total informado', knownTotal)}</dl>${!amount(knownTotal) ? '<p class="billing-note">Total ainda não disponível.</p>' : ''}${!complete ? '<p class="billing-note">Composição não disponível para cobrança anterior</p>' : ''}`;
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
  function payButton(payment) {
    const automatic=automaticPayment(payment);
    if(automatic){
      const pendingPix=automatic==='Pix Automático' && !(payment.automatic_debit_status==='SCHEDULED' && payment.automatic_debit_ready===true);
      return `<p class="billing-auto-note"><strong>${pendingPix ? 'Débito automático em preparação' : `${esc(automatic)} ativo`}</strong><span>${pendingPix ? 'Aguarde a confirmação da programação. Se houver falha, a opção de regularizar será exibida.' : 'Não é necessário pagar manualmente. Aguarde a confirmação do débito.'}</span></p>`;
    }
    const pending=['pending','updating'].includes(String(payment.quote_state).toLowerCase());
    const failed=['REFUSED','CANCELLED'].includes(payment.automatic_debit_status);
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const dueNow=payment.status==='PENDING' && !(payment.due_date && payment.due_date<today);
    const advance=monthKey(payment)!=='unknown' && monthKey(payment)>today.slice(0,7) && payment.status==='PENDING' && !(payment.due_date && payment.due_date<today);
    return `${failed ? '<p class="billing-auto-failed">O débito automático não foi confirmado.</p>' : ''}<button class="btn ${advance ? 'billing-advance' : dueNow ? 'billing-due' : 'primary'}" data-billing-pay="${esc(payment.id)}" ${state.busy || pending ? 'disabled' : ''}>${pending ? 'Atualizando valor' : advance ? 'Antecipar mensalidade' : 'Pagar mensalidade'}</button>`;
  }
  function statusIcon(kind) {
    const paths={green:'<path d="m6 12 4 4 8-9"/>',red:'<path d="m7 7 10 10M17 7 7 17"/>',blue:'<path d="M7 3h10M7 21h10M8 3v4l4 5-4 5v4M16 3v4l-4 5 4 5v4"/>',gray:'<path d="M6 12h12"/>'};
    return `<span class="billing-status-icon is-${kind}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${paths[kind==='yellow'?'blue':kind]}</svg></span>`;
  }
  function forecastBlock(row) {
    if(!payable.has(String(row.status).toUpperCase()))return '';
    if(!Array.isArray(row.forecast) || !row.forecast.length)return '<p class="billing-note">Previsão de atraso indisponível para esta cobrança. Consulte a administração.</p>';
    return `<section class="billing-forecast"><h4>Previsão de atraso</h4><p class="billing-note">${esc(row.forecast_description || '')}</p><div class="billing-forecast-list">${row.forecast.map(q=>`<div><span>Pagamento em <strong>${portalDate(q.date)}</strong><small>${esc(q.days)} dia(s) após o vencimento</small></span><span><strong>${portalMoney(q.totalCents)}</strong><small>Multa ${portalMoney(q.fineCents)} · juros ${portalMoney(q.interestCents)}</small></span></div>`).join('')}</div><p class="billing-note">Estimativa automática na forma de pagamento atual, sem novos pagamentos ou descontos. O valor definitivo será atualizado ao pagar.</p></section>`;
  }
  function paymentDetail(payment) {
    const sub=state.subscriptions.find(s=>s.id===payment.subscription_id);
    return `<div class="billing-charge"><h4>${esc(payment.package_name || sub?.package_name || 'Mensalidade')}</h4><p class="billing-note">${esc(statuses[payment.status] || 'Situação a confirmar')} · ${esc(methodName(payment.billing_type || sub?.method))} · Vencimento ${portalDate(payment.due_date)}${payment.paid_at ? ` · Recebida em ${portalDate(payment.paid_at)}` : ''}</p>${composition(payment)}${['uncertain','updating'].includes(payment.quote_state) ? '<p class="billing-warning">O valor está pendente de revalidação antes do pagamento.</p>' : ''}${forecastBlock(payment)}</div>`;
  }
  function monthCard(key,rows,athlete) {
    const open=rows.filter(p=>payable.has(String(p.status).toUpperCase()));
    const received=rows.filter(p=>paid.has(String(p.status).toUpperCase()));
    const allCanceled=rows.every(p=>canceled.has(String(p.status).toUpperCase()));
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const hasOverdue=open.some(p=>String(p.status).toUpperCase()==='OVERDUE' || /^\d{4}-\d{2}-\d{2}$/.test(p.due_date||'') && p.due_date<today);
    const future=open.length>0 && !hasOverdue && key!=='unknown' && key>today.slice(0,7);
    const badge=open.length ? (hasOverdue ? 'Em atraso' : future ? 'Prevista' : 'A pagar') : allCanceled ? 'Cancelada' : received.length===rows.filter(p=>!canceled.has(String(p.status).toUpperCase())).length ? 'Paga' : 'Em análise';
    const totalRows=open.length ? open : received.length ? received : rows;
    const known=totalRows.every(p=>amount(total(p)));
    const sum=totalRows.reduce((n,p)=>n+Number(total(p)||0),0);
    const dueDates=[...new Set(totalRows.map(p=>p.due_date).filter(Boolean))].sort();
    const due=dueDates.length ? portalDate(dueDates[0])+(dueDates.length>1 ? ' · outros nos detalhes' : '') : 'Não informado';
    const icon=hasOverdue ? 'red' : !open.length && received.length ? 'green' : allCanceled ? 'gray' : future ? 'blue' : 'yellow';
    return `<article class="billing-month-card"><div class="billing-month-summary"><div class="billing-month-identity">${statusIcon(icon)}<div class="billing-month-title"><h3>${esc(monthName(key))}</h3><span class="billing-status ${hasOverdue ? 'is-overdue' : open.length ? (future ? 'is-pending' : 'is-due') : received.length ? 'is-paid' : 'is-canceled'}">${badge}</span></div></div><div class="billing-month-due"><span>Vencimento</span><strong>${esc(due)}</strong></div><div class="billing-month-total"><span>${open.length ? 'Total a pagar' : received.length ? 'Total pago' : allCanceled ? 'Valor cancelado' : 'Total informado'}</span><strong>${known ? portalMoney(sum) : 'A confirmar'}</strong></div><div class="billing-month-action">${open.length===1 ? payButton(open[0]) : open.length>1 ? '<span>Escolha a cobrança nos detalhes</span>' : ''}</div></div><details class="billing-month-details"><summary>Ver detalhamento</summary>${rows.map(p=>paymentDetail(p)+invoiceCards(p)+(open.length>1 && payable.has(p.status) ? payButton(p) : '')).join('')}</details></article>`;
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
  function pixOptIn(athlete) {
    return state.subscriptions.filter(sub=>sub.athlete_id===athlete.id && sub.automatic_mode==='PIX_AUTOMATIC' && ['pending','active'].includes(sub.status)).map(sub=>{
      const ready=sub.pix_automatic_ready===true;
      const created=['CREATED','ACTIVE'].includes(sub.pix_authorization_status);
      return `<section class="billing-pix-optin"><h3>Pix Automático ${ready ? 'ativo' : '· autorização única'}</h3><p>${ready ? 'A autorização foi confirmada pelo banco. As próximas mensalidades serão debitadas automaticamente; acompanhe a confirmação de cada mês.' : 'Autorize uma vez no aplicativo do seu banco para que as próximas mensalidades sejam pagas automaticamente. A autorização depende da confirmação do banco.'}</p>${ready ? `<button class="btn sm" data-billing-auto-cancel="${esc(sub.id)}">Cancelar autorização</button>` : created ? `<button class="btn" data-billing-auto-status="${esc(sub.id)}">Consultar autorização</button>` : sub.pix_authorization_available ? `<button class="btn primary" data-billing-auto-prepare="${esc(sub.id)}">Autorizar Pix Automático</button>` : '<p class="billing-note">A ativação depende da liberação da integração pela administração. Nenhum débito automático está habilitado nesta mensalidade.</p>'}</section>`;
    }).join('');
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
    dialog.innerHTML=`<div class="billing-dialog-content"><div class="billing-section-heading"><h2 id="billingDialogTitle">Autorizar no seu banco</h2><button class="btn sm" data-billing-close>Fechar</button></div><p>Este QR reúne o primeiro pagamento e o pedido de autorização para os próximos meses. Confira os valores e confirme a autorização no aplicativo do seu banco. Ela ainda não está ativa.</p><div class="billing-pix">${qr ? `<img src="data:image/png;base64,${qr}" alt="QR de primeiro pagamento e autorização Pix Automático" width="220" height="220">` : ''}<label for="billingPixCode">Pix copia e cola para autorização</label><textarea id="billingPixCode" readonly rows="3">${esc(pix.payload)}</textarea><button class="btn sm" data-billing-copy>Copiar código</button><p id="billingCopyStatus" role="status"></p></div><div id="billingDialogMessage" role="status"></div><button class="btn primary" data-billing-auto-status="${esc(id)}">Já autorizei: consultar confirmação</button></div>`;
    if(!dialog.open)dialog.showModal();
  }
  async function automaticAction(target) {
    if(state.busy)return;
    state.busy=true;target.disabled=true;
    try{
      if(target.hasAttribute('data-billing-auto-prepare')){
        const id=target.dataset.billingAutoPrepare,result=await autoRequest('prepare',id);
        if(!result.consentToken || !Number.isSafeInteger(result.firstPaymentCents) || !Number.isSafeInteger(result.recurringValueCents))throw new Error('Plano de autorização indisponível.');
        state.automaticConsent={id,athleteId:PORTAL.selected,token:result.consentToken};
        const dialog=document.querySelector('#billingDialog');
        dialog.innerHTML=`<div class="billing-dialog-content"><div class="billing-section-heading"><h2 id="billingDialogTitle">Pix Automático</h2><button class="btn sm" data-billing-close>Fechar</button></div><p>Primeiro pagamento: <strong>${portalMoney(result.firstPaymentCents)}</strong> · competência ${esc(result.firstCompetence || '')}.</p><p>Próximos débitos mensais: <strong>${portalMoney(result.recurringValueCents)}</strong>, a partir de <strong>${portalDate(result.startDate)}</strong>.</p><p>${esc(result.description || '')}</p><p>A confirmação final será feita por você no aplicativo do banco. Você poderá cancelar a autorização. Nenhuma mensalidade é considerada paga antes da confirmação do Asaas.</p><label class="billing-consent-check"><input type="checkbox" id="billingAutoAccept"> Quero iniciar a autorização do primeiro pagamento e dos débitos mensais descritos acima.</label><div id="billingDialogMessage" role="status"></div><button class="btn primary" data-billing-auto-consent="${esc(id)}">Gerar QR de autorização</button></div>`;
        if(!dialog.open)dialog.showModal();
      }else if(target.hasAttribute('data-billing-auto-consent')){
        const id=target.dataset.billingAutoConsent,plan=state.automaticConsent;
        if(!plan || plan.id!==id || plan.athleteId!==PORTAL.selected || !document.querySelector('#billingAutoAccept')?.checked)throw new Error('Marque a confirmação para iniciar a autorização.');
        const result=await autoRequest('consent',id,{consentToken:plan.token,confirm:true});state.automaticConsent=null;autoQr(result,id);
      }else if(target.hasAttribute('data-billing-auto-status')){
        const id=target.dataset.billingAutoStatus,result=await autoRequest('status',id);autoQr(result,id);if(result.ready){await load();portalRender();}
      }else if(target.hasAttribute('data-billing-auto-cancel')){
        const id=target.dataset.billingAutoCancel,dialog=document.querySelector('#billingDialog');
        dialog.innerHTML=`<div class="billing-dialog-content"><h2 id="billingDialogTitle">Cancelar Pix Automático?</h2><p>Os próximos débitos automáticos deixarão de ser programados. Mensalidades já emitidas permanecem devidas e precisam ser acompanhadas. Esta ação não estorna pagamentos.</p><button class="btn" data-billing-close>Manter autorização</button><button class="btn danger" data-billing-auto-cancel-confirm="${esc(id)}">Confirmar cancelamento</button><div id="billingDialogMessage" role="status"></div></div>`;if(!dialog.open)dialog.showModal();
      }else if(target.hasAttribute('data-billing-auto-cancel-confirm')){
        await autoRequest('cancel',target.dataset.billingAutoCancelConfirm,{confirm:true});document.querySelector('#billingDialog').close();await load();portalRender();
      }
    }catch(error){message(error.message);}finally{state.busy=false;target.disabled=false;}
  }
  function render(athlete) {
    const rows=state.payments.filter(p=>p.athlete_id===athlete.id);
    const groups=new Map();for(const row of rows){const key=monthKey(row);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
    const keys=[...groups.keys()].sort((a,b)=>a==='unknown'?1:b==='unknown'?-1:b.localeCompare(a));
    return `<section class="panel panel-pad portal-billing" aria-labelledby="billingTitle"><div class="billing-section-heading"><h2 id="billingTitle">Suas mensalidades</h2><button class="btn sm" data-billing-refresh ${state.busy || state.loading ? 'disabled' : ''}>Atualizar</button></div><p class="billing-note">${esc(athlete.full_name)} · acompanhe cada mês, escolha como pagar e consulte sua nota fiscal.</p><div id="billingMessage" role="status" aria-live="polite">${state.error ? `<p class="billing-warning">${esc(state.error)}</p>` : ''}</div>${!state.error && !rows.length ? '<p>Nenhuma cobrança disponível para este atleta.</p>' : ''}${pixOptIn(athlete)}<div class="billing-month-stack">${keys.map(key=>monthCard(key,groups.get(key),athlete)).join('')}</div></section>`;
  }
  function notify() {
    const dialog=document.querySelector('#billingRestrictionDialog');
    if(!dialog)return;
    const alerts=state.delinquency.filter(row=>row.athlete_id===PORTAL.selected && (row.blocked || row.simulation) && row.overdue_count>0);
    if(!alerts.length){if(dialog.open)dialog.close();return;}
    const alert=alerts.find(row=>row.blocked)||alerts[0];
    const names=alert.coach_notified && alert.admin_notified ? 'O técnico responsável pela equipe e a administração já foram notificados no painel sobre a situação irregular.' : 'A comunicação ao técnico e à administração está pendente de confirmação no sistema.';
    dialog.innerHTML=`<div class="billing-restriction-content"><div class="billing-section-heading"><h2 id="billingRestrictionTitle">${alert.simulation ? 'Demonstração: mensalidade em atraso' : 'Mensalidade em atraso'}</h2><button class="btn sm" data-billing-dismiss-notice aria-label="Fechar aviso">Fechar</button></div><p><strong>${esc(portalCurrent()?.full_name || 'Atleta')}</strong> tem ${esc(alert.overdue_count)} mensalidade(s) em atraso.</p>${alert.simulation ? '<p class="billing-note">Ambiente de testes: este exemplo não bloqueia a participação em treinos reais.</p>' : ''}<p>${alert.simulation ? 'Exemplo de aviso: ' : ''}A participação nos treinos da equipe será autorizada somente após a regularização da mensalidade atrasada.</p><p>${names}</p><button class="btn primary" data-billing-view-debts>Ver mensalidades</button></div>`;
    if(!dialog.open)dialog.showModal();
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
    state.busy = true; trigger.disabled = true; state.choice = null;
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
      dialog.innerHTML = `<div class="billing-dialog-content"><div class="billing-section-heading"><h2 id="billingDialogTitle">Escolha a forma de pagamento</h2><button class="btn sm" data-billing-close aria-label="Fechar opções de pagamento">Fechar</button></div><p>${esc(portalCurrent()?.full_name || '')} · ${esc(row.package_name || 'Mensalidade')}</p>${paymentContext(row)}<p class="billing-note">A escolha vale apenas para esta cobrança. A forma de pagamento das próximas mensalidades da assinatura permanece a mesma. O valor será revalidado no Asaas ao confirmar.</p><div id="billingDialogMessage" role="status" aria-live="polite"></div><div class="billing-method-options">${quotes.map(q => `<section class="billing-card"><h3>${esc(methodName(q.method))}</h3>${composition(q)}<button class="btn primary" data-billing-confirm="${esc(id)}" data-billing-method="${esc(q.method)}">Confirmar ${q.method === 'PIX' ? 'Pix' : 'cartão'} · ${portalMoney(total(q))}</button></section>`).join('')}</div></div>`;
      if (!dialog.open) dialog.showModal();
      message('Confira os preços e confirme a forma de pagamento.');
    } catch (error) { message(error.message); }
    finally { state.busy = false; trigger.disabled = false; }
  }
  async function payment(id, trigger, method = null) {
    if (state.busy || state.error) return;
    if (method && (!state.choice || state.choice.id !== id || state.choice.athleteId !== PORTAL.selected || !state.choice.methods.includes(method))) return;
    const row = state.payments.find(p => p.id === id && p.athlete_id === PORTAL.selected);
    if (!row || automaticPayment(row) || !payable.has(String(row.status).toUpperCase()) || ['pending', 'updating'].includes(String(row.quote_state).toLowerCase())) return;
    state.busy = true; trigger.disabled = true;
    let opened = false;
    try {
      message('Consultando o valor atualizado no Asaas…');
      const { data, error } = await financeDbClient().functions.invoke('billing-portal', { body: { action: 'payment', paymentId: id, ...(method ? { method } : {}) } });
      if (error || !data || data.error) throw new Error('Não foi possível revalidar a cobrança. Atualize os dados e tente novamente.');
      if (data.paid === true || paid.has(String(data.quote?.status).toUpperCase())) {
        const dialog = document.querySelector('#billingDialog');
        if (dialog.open) dialog.close();
        state.choice = null;
        await load(); portalRender();
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
      dialog.innerHTML = `<div class="billing-dialog-content"><div class="billing-section-heading"><h2 id="billingDialogTitle">Pagamento seguro</h2><button class="btn sm" data-billing-close aria-label="Fechar opções de pagamento">Fechar</button></div><p>${esc(portalCurrent()?.full_name || '')} · ${esc(row.package_name || 'Mensalidade')}</p>${paymentContext(row)}${composition(quote)}<p class="billing-note">${(method || row.billing_type || state.subscriptions.find(s => s.id === row.subscription_id)?.method) === 'CREDIT_CARD' ? 'Preencha os dados do cartão diretamente no checkout seguro do Asaas. A recorrência das próximas mensalidades segue as condições da assinatura.' : 'Pix mensal: pague esta cobrança pelo QR Code, copia e cola ou página segura do Asaas.'} O pagamento aparecerá como recebido após a confirmação do provedor.</p>${url ? `<a class="btn primary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Abrir página segura do Asaas</a>` : ''}${pix ? `<div class="billing-pix">${qr ? `<img src="data:image/png;base64,${qr}" alt="QR Code Pix desta cobrança" width="220" height="220">` : ''}<label for="billingPixCode">Pix copia e cola</label><textarea id="billingPixCode" readonly rows="3">${esc(pix.payload)}</textarea><button class="btn sm" data-billing-copy>Copiar código Pix</button><p id="billingCopyStatus" role="status" aria-live="polite"></p></div>` : ''}<button class="btn" data-billing-return>Já voltei do pagamento: atualizar</button></div>`;
      state.choice = null;
      if (!dialog.open) dialog.showModal(); opened = true; message('Opções atualizadas. A confirmação será consultada ao atualizar as cobranças.');
    } catch (error) { message(error.message); }
    finally { state.busy = false; if (!opened) trigger.disabled = false; }
  }
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
      try { await navigator.clipboard.writeText(code.value); result.textContent = 'Código Pix copiado.'; }
      catch { code.focus(); code.select(); result.textContent = 'Selecione e copie o código Pix acima.'; }
      return;
    }
    if (state.busy || state.loading) return;
    state.choice = null;
    if (dialog.open) dialog.close();
    target.disabled = true; message('Atualizando cobranças…'); await load(); portalRender();
  });
  document.addEventListener('close', event => { if (event.target.id === 'billingDialog') { state.choice = null; portalRender(); } }, true);
  return { load, render, safeUrl, notify };
})();
