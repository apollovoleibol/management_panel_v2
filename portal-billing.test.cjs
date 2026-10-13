const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function portalFixture(overrides = {}) {
  const listeners = {}, requests = [];
  const dialog = { open: false, innerHTML: '', showModal() { this.open = true; }, close() { this.open = false; } };
  const message = { textContent: '' };const autoAccept={checked:false};
  const notice={open:false,innerHTML:'',showModal(){this.open=true;},close(){this.open=false;}};
  const defaultPayment = { id: 'p', athlete_id: 'a', status: 'PENDING', value_cents: 10000, asaas_payment_id: 'pay1', billing_type: 'PIX' };
  const data = { payments: [defaultPayment], subscriptions: [], invoices: [], ...overrides };
  const quote = { status: 'PENDING', quote_state: 'current', base_cents: 10000, method_adjustment_cents: 0, principal_cents: 10000, fine_cents: 0, interest_cents: 0, total_cents: 10000 };
  let rpcError = null, rpcCalls = 0;
  const responses = { preview: { canChangeMethod: false, quotes: [] }, payment: { quote, invoiceUrl: 'https://sandbox.asaas.com/i/1', pix: null } };
  const context = {
    window: {}, URL, Intl, Date, Set,
    document: { addEventListener: (name, fn) => { listeners[name] = fn; }, querySelector: s => s === '#billingAutoAccept' ? autoAccept : s === '#billingRestrictionDialog' ? notice : s === '#billingDialog' ? dialog : s === '#billingMessage' ? message : s === '#billingDialogMessage' ? message : null },
    PORTAL: { athletes: [{ id: 'a', full_name: 'Ana' }], selected: 'a', tab: 'pay' },
    portalEsc: v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    portalDate: v => v || '—', portalMoney: v => `R$ ${v / 100}`, portalRender: () => {},
    financeDbClient: () => ({
      rpc: async name => { if(name==='billing_delinquency_state')return {data:overrides.delinquency || []}; rpcCalls++; return rpcError ? { error: rpcError } : { data }; },
      functions: { invoke: async (name, input) => { assert.ok(['billing-portal','billing-pix-automatic'].includes(name)); requests.push(JSON.parse(JSON.stringify(input.body))); return { data: responses[input.body.action] }; } }
    })
  };
  context.portalCurrent = () => context.PORTAL.athletes[0];
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'js/portal-billing.js'), 'utf8'), context);
  return {
    api: context.window.PortalBilling, context, data, quote, notice, autoAccept, responses, requests, dialog, message,
    rpcCalls: () => rpcCalls, failRpc: () => { rpcError = { message: 'missing RPC' }; },
    render: () => context.window.PortalBilling.render(context.PORTAL.athletes[0]),
    click: async (attribute, value = '', method = '') => {
      const target = { disabled: false, dataset: { billingPay: value, billingConfirm: value, billingMethod: method,billingAutoPrepare:value,billingAutoConsent:value,billingAutoStatus:value,billingAutoCancel:value,billingAutoCancelConfirm:value }, hasAttribute: name => name === attribute };
      await listeners.click({ target: { closest: () => target } });
    }
  };
}

test('payment links require HTTPS Asaas hosts and no embedded credentials', () => {
  const { api } = portalFixture();
  for (const url of ['javascript:alert(1)', 'http://asaas.com/pay', 'https://asaas.com.evil.test/pay', 'https://user:secret@asaas.com/pay']) assert.equal(api.safeUrl(url, true), '');
  assert.equal(api.safeUrl('https://sandbox.asaas.com/i/test', true), 'https://sandbox.asaas.com/i/test');
});

test('legacy totals retain unknown composition and family display is scoped', async () => {
  const f = portalFixture({ payments: [{ id: 'p', athlete_id: 'a', status: 'PENDING', value_cents: 12000 }, { id: 'other', athlete_id: 'b', status: 'PENDING', value_cents: 9000 }] });
  await f.api.load(); const html = f.render();
  assert.match(html, /Composição não disponível para cobrança anterior/);
  assert.match(html, /R\$ 120/); assert.doesNotMatch(html, /data-billing-pay="other"/);
  await f.click('data-billing-pay', 'other'); assert.equal(f.requests.length, 0);
});

test('invoice links appear only for authorized documents with safe URLs', async () => {
  for (const status of ['ERROR', 'PENDING', 'CANCELED', 'SYNCHRONIZED']) {
    const f = portalFixture({ invoices: [{ asaas_payment_id: 'pay1', status, pdf_url: 'https://municipal.example/nf.pdf' }] });
    await f.api.load(); assert.doesNotMatch(f.render(), /href="https:\/\/municipal/);
  }
  const f = portalFixture({ invoices: [{ asaas_payment_id: 'pay1', status: 'AUTHORIZED', pdf_url: 'https://municipal.example/nf.pdf', xml_url: 'javascript:alert(1)' }] });
  await f.api.load(); assert.match(f.render(), /href="https:\/\/municipal/); assert.doesNotMatch(f.render(), /javascript:/);
});

test('RPC failure stays section-scoped and discards previously usable payment actions', async () => {
  const f = portalFixture(); await f.api.load(); f.failRpc(); await f.api.load();
  assert.match(f.render(), /Não foi possível carregar as cobranças/); assert.doesNotMatch(f.render(), /data-billing-pay=/);
});

test('snapshot price chooser previews server totals before explicit method confirmation', async () => {
  const f = portalFixture(); f.responses.preview = { canChangeMethod: true, quotes: [{ ...f.quote, method: 'PIX', total_cents: 9500, method_adjustment_cents: -500 }, { ...f.quote, method: 'CREDIT_CARD', total_cents: 10100, method_adjustment_cents: 100 }] };
  await f.api.load(); await f.click('data-billing-pay', 'p');
  assert.deepEqual(f.requests, [{ action: 'preview', paymentId: 'p' }]);
  assert.equal(f.dialog.open, true); assert.match(f.dialog.innerHTML, /R\$ 95/); assert.match(f.dialog.innerHTML, /R\$ 101/);
  assert.match(f.dialog.innerHTML, /próximas mensalidades/); assert.doesNotMatch(f.dialog.innerHTML, /href="https:\/\/sandbox/);
  await f.click('data-billing-confirm', 'p', 'CREDIT_CARD');
  assert.deepEqual(f.requests[1], { action: 'payment', paymentId: 'p', method: 'CREDIT_CARD' });
  assert.match(f.dialog.innerHTML, /Abrir página segura do Asaas/);
});

test('legacy checkout keeps current method and fails closed on uncertain server quote', async () => {
  const f = portalFixture(); f.responses.payment.quote = { ...f.quote, quote_state: 'uncertain' };
  await f.api.load(); await f.click('data-billing-pay', 'p');
  assert.deepEqual(f.requests, [{ action: 'preview', paymentId: 'p' }, { action: 'payment', paymentId: 'p' }]);
  assert.equal(f.dialog.open, false); assert.match(f.message.textContent, /atualização/);
});

test('provider paid response refreshes records without reopening checkout or inferring a receipt', async () => {
  const f = portalFixture(); f.responses.payment = { paid: true, quote: { ...f.quote, status: 'RECEIVED' }, invoiceUrl: 'https://sandbox.asaas.com/i/1' };
  await f.api.load(); await f.click('data-billing-pay', 'p');
  assert.equal(f.rpcCalls(), 2); assert.equal(f.dialog.open, false); assert.doesNotMatch(f.dialog.innerHTML, /href=/);
});

test('Pix payload is escaped and checkout has no card data inputs', async () => {
  const f = portalFixture(); f.responses.payment.pix = { payload: '<script>evil</script>', encodedImage: 'aGVsbG8=' };
  await f.api.load(); await f.click('data-billing-pay', 'p');
  assert.match(f.dialog.innerHTML, /&lt;script&gt;evil/); assert.doesNotMatch(f.dialog.innerHTML, /<script>|type="(?:text|number)"/);
  assert.match(f.dialog.innerHTML, /após a confirmação/);
});

test('unknown quote readiness cannot expose a checkout even when total and link exist', async () => {
  const f = portalFixture(); f.responses.payment.quote = { ...f.quote, quote_state: 'failed' };
  await f.api.load(); await f.click('data-billing-pay', 'p');
  assert.equal(f.dialog.open, false); assert.match(f.message.textContent, /atualização/);
});

test('method confirmation requires a matching active preview choice', async () => {
  const f = portalFixture(); await f.api.load();
  await f.click('data-billing-confirm', 'p', 'CREDIT_CARD');
  assert.equal(f.requests.length, 0);
});

test('paid discrepancy displays provider total without a conflicting calculated breakdown', async () => {
  const f = portalFixture();
  f.data.payments = [{ ...f.data.payments[0], ...f.quote, status: 'RECEIVED', quote_state: 'discrepancy', value_cents: 10300, total_cents: 10300 }];
  await f.api.load(); const html = f.render();
  assert.match(html, /R\$ 103/);
  assert.match(html, /Pagamento confirmado com valor diferente da composição prevista\. A administração precisa conciliar esta cobrança\./);
  assert.doesNotMatch(html, /<dt>Mensalidade-base|<dt>Principal|<dt>Multa|<dt>Juros|Composição não disponível para cobrança anterior/);
});
test('one horizontal month card combines titles in the same competence without charging canceled titles', async () => {
 const f=portalFixture({payments:[{id:'paid',athlete_id:'a',reference_month:'2026-08',status:'RECEIVED',value_cents:20000},{id:'canceled',athlete_id:'a',reference_month:'2026-08',status:'CANCELED',value_cents:5000},{id:'pending',athlete_id:'a',reference_month:'2026-09',status:'PENDING',value_cents:20000}]});
 await f.api.load();const html=f.render();assert.equal((html.match(/class="billing-month-card/g)||[]).length,2);assert.match(html,/Agosto de 2026/);assert.match(html,/Setembro de 2026/);assert.doesNotMatch(html,/R\$ 250/);assert.doesNotMatch(html,/Pendentes <span/);
});
test('athlete billing has no configuration entry point and shows automatic read-only late forecast',async()=>{
 const f=portalFixture({payments:[{id:'p',athlete_id:'a',reference_month:'2026-10',status:'PENDING',value_cents:20000,forecast:[{date:'2026-10-27',days:7,totalCents:20500,fineCents:400,interestCents:100}],forecast_description:'Multa única de 2%. Juros simples proporcionais.'}]});
 await f.api.load();const html=f.render();assert.match(html,/Previsão de atraso/);assert.match(html,/R\$ 205/);assert.match(html,/Multa única de 2%/);assert.doesNotMatch(html,/data-billing-rules|Salvar nova versão|Ver regras e simulador/);
});
test('compact summaries contain only month status due amount and action; icons represent paid overdue future',async()=>{
 const f=portalFixture({payments:[{id:'one',athlete_id:'a',reference_month:'2026-10',due_date:'2026-10-20',status:'PENDING',value_cents:20000,package_name:'PACKAGE-HIDDEN'},{id:'two',athlete_id:'a',reference_month:'2026-09',due_date:'2026-09-20',status:'OVERDUE',value_cents:20000},{id:'three',athlete_id:'a',reference_month:'2026-08',due_date:'2026-08-20',status:'RECEIVED',value_cents:20000}]});await f.api.load();const html=f.render();
 assert.match(html,/billing-status-icon is-yellow/);assert.match(html,/billing-status-icon is-red/);assert.match(html,/billing-status-icon is-green/);
 const summary=html.split('<details')[0];assert.doesNotMatch(summary,/PACKAGE-HIDDEN|billing-month-preview|billing-forecast/);assert.match(html,/PACKAGE-HIDDEN/);
});
test('confirmed automatic debit replaces manual payment action but refusal keeps a recovery action',async()=>{
 const f=portalFixture({subscriptions:[{id:'s',pix_automatic_ready:true}],payments:[{id:'auto',subscription_id:'s',athlete_id:'a',status:'PENDING',value_cents:20000,billing_type:'PIX',automatic_debit_status:'SCHEDULED',automatic_debit_ready:true}]});await f.api.load();let html=f.render();assert.match(html,/Pix Automático ativo/);assert.doesNotMatch(html,/data-billing-pay="auto"/);
 f.data.payments[0].status='OVERDUE';f.data.payments[0].automatic_debit_status='REFUSED';await f.api.load();html=f.render();assert.match(html,/data-billing-pay="auto"/);assert.match(html,/não foi confirmado/);
});

test('late floating notice repeats on entry and never invents staff delivery',async()=>{
 const f=portalFixture({delinquency:[{athlete_id:'a',overdue_count:1,blocked:true,coach_notified:false,admin_notified:false}]});await f.api.load();assert.equal(f.notice.open,true);assert.match(f.notice.innerHTML,/somente após a regularização/);assert.match(f.notice.innerHTML,/pendente de confirmação/);assert.doesNotMatch(f.notice.innerHTML,/já foram notificados/);
 await f.click('data-billing-dismiss-notice');assert.equal(f.notice.open,false);f.api.notify();assert.equal(f.notice.open,true);
 f.context.PORTAL.selected='b';f.api.notify();assert.equal(f.notice.open,false);
});
test('server persisted coach and admin records justify the delivered inbox wording',async()=>{
 const f=portalFixture({delinquency:[{athlete_id:'a',overdue_count:1,blocked:true,coach_notified:true,admin_notified:true}]});await f.api.load();assert.match(f.notice.innerHTML,/já foram notificados no painel/);
});

test('automatic Pix QR requires explicit consent and stays pending until bank confirmation',async()=>{
 const f=portalFixture({subscriptions:[{id:'s',athlete_id:'a',automatic_mode:'PIX_AUTOMATIC',status:'pending',pix_authorization_available:true}]});
 f.responses.prepare={consentToken:'plan',firstPaymentCents:20000,recurringValueCents:20000,startDate:'2026-11-20',firstCompetence:'2026-10'};
 f.responses.consent={ready:false,authorizationStatus:'CREATED',pix:{payload:'demo code'}};
 await f.api.load();assert.match(f.render(),/Autorizar Pix Automático/);await f.click('data-billing-auto-prepare','s');assert.match(f.dialog.innerHTML,/Primeiro pagamento/);
 await f.click('data-billing-auto-consent','s');assert.equal(f.requests.length,1);assert.match(f.message.textContent,/Marque/);
 f.autoAccept.checked=true;await f.click('data-billing-auto-consent','s');assert.equal(f.requests.length,2);assert.equal(f.requests[1].confirm,true);assert.equal(f.requests[1].consentToken,'plan');assert.match(f.dialog.innerHTML,/ainda não está ativa/);
});
test('changing athlete invalidates previous automatic Pix consent plan',async()=>{
 const f=portalFixture({subscriptions:[{id:'s',athlete_id:'a',automatic_mode:'PIX_AUTOMATIC',status:'pending',pix_authorization_available:true}]});f.responses.prepare={consentToken:'plan',firstPaymentCents:20000,recurringValueCents:20000,startDate:'2026-11-20'};await f.api.load();await f.click('data-billing-auto-prepare','s');f.context.PORTAL.selected='b';f.autoAccept.checked=true;await f.click('data-billing-auto-consent','s');assert.equal(f.requests.length,1);
});

test('automatic instruction awaiting scheduling suppresses manual action without claiming debit ready',async()=>{
 const f=portalFixture({subscriptions:[{id:'s',pix_automatic_ready:true}],payments:[{id:'auto',subscription_id:'s',athlete_id:'a',status:'PENDING',value_cents:20000,billing_type:'PIX',automatic_debit_status:'AWAITING_REQUEST',automatic_debit_ready:false}]});await f.api.load();const html=f.render();assert.match(html,/Débito automático em preparação/);assert.doesNotMatch(html,/Pix Automático ativo|data-billing-pay="auto"/);
});

test('refused automatic Pix recovery opens existing fixed title without selecting a new method',async()=>{
 const f=portalFixture({subscriptions:[{id:'s',automatic_mode:'PIX_AUTOMATIC',pix_automatic_ready:true}],payments:[{id:'auto',athlete_id:'a',subscription_id:'s',status:'OVERDUE',billing_type:'PIX',value_cents:20000,automatic_debit_status:'REFUSED'}]});
 f.responses.preview={canChangeMethod:false,quotes:[]};f.responses.payment={quote:{...f.quote,total_cents:20000},invoiceUrl:'https://sandbox.asaas.com/i/existing',pix:null};
 await f.api.load();await f.click('data-billing-pay','auto');assert.deepEqual(f.requests,[{action:'preview',paymentId:'auto'},{action:'payment',paymentId:'auto'}]);assert.match(f.dialog.innerHTML,/sandbox\.asaas\.com\/i\/existing/);assert.doesNotMatch(f.dialog.innerHTML,/data-billing-confirm/);
});

test('only future competence uses blue anticipation; current month still says pay',async()=>{
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),current=today.slice(0,7),d=new Date(today+'T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+1,20);const next=d.toISOString().slice(0,7);
 const f=portalFixture({payments:[{id:'current',athlete_id:'a',status:'PENDING',reference_month:current,due_date:current+'-28',value_cents:20000},{id:'future',athlete_id:'a',status:'PENDING',reference_month:next,due_date:next+'-20',value_cents:20000}]});await f.api.load();const html=f.render();assert.match(html,/class="btn billing-advance" data-billing-pay="future"[^>]*>Antecipar mensalidade/);assert.match(html,/class="btn billing-due" data-billing-pay="current"[^>]*>Pagar mensalidade/);assert.match(html,/billing-status is-due">A pagar/);assert.match(html,/billing-status-icon is-yellow/);assert.match(html,/billing-status is-pending">Prevista/);assert.match(html,/billing-status-icon is-blue/);
 const first=html.split('<details')[0];assert.ok(first.indexOf('billing-month-identity')<first.indexOf('billing-month-due'));assert.ok(first.indexOf('billing-month-due')<first.indexOf('billing-month-total'));assert.ok(first.indexOf('billing-month-total')<first.indexOf('billing-month-action'));assert.match(first,/billing-month-identity"><span class="billing-status-icon[^]*billing-month-title/);
 await f.click('data-billing-pay','future');assert.match(f.dialog.innerHTML,/Competência:/);assert.match(f.dialog.innerHTML,new RegExp(next+'-20'));assert.deepEqual(f.requests,[{action:'preview',paymentId:'future'},{action:'payment',paymentId:'future'}]);
});
