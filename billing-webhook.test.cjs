const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const mergeModule = import('./supabase/functions/_shared/billing-webhook-merge.mjs');
const pixModule = import('./supabase/functions/_shared/billing-pix-automatic.mjs');
const replaceModule = import('./supabase/functions/_shared/billing-replace.mjs');

const source = stripTypeScriptTypes(fs.readFileSync(`${__dirname}/supabase/functions/billing-webhook/index.ts`, 'utf8').replace(/^import .*;\r?\n/gm, ''));

function harness(failures = [], paymentExtra = {}) {
  const state = { events: new Map(), payments: new Map(), subscriptions: new Map(), invoices: new Map(), pixAuthorizations:new Map(), provider:new Map(), policyVersions: [], failures: [...failures], attempts: [], beforeWrite: null };
  const admin = { from(table) {
    const query = { op: 'select', value: null, filters: {}, throwing: false,
      select() { return this; }, eq(k, v) { this.filters[k] = v; return this; },
      insert(v) { this.op = 'insert'; this.value = v; return this; },
      upsert(v, options) { this.op = 'upsert'; this.value = v; this.options = options; return this; },
      update(v) { this.op = 'update'; this.value = v; return this; },
      is(k, v) { this.filters[k] = v; return this; },
      lte(k, v) { this.upperBound = [k, v]; return this; }, order() { return this; }, limit() { return this; },
      maybeSingle() { this.singleResult=true;return this; }, single() { this.singleResult=true;return this; },
      throwOnError() { this.throwing = true; return this; },
      then(resolve, reject) {
        try {
          const key = `${table}:${this.op}`;
          state.attempts.push(key);
          if (state.failures[0] === key) {
            state.failures.shift();
            const error = { message: 'Database unavailable', code: '08006' };
            if (this.throwing) throw error;
            return Promise.resolve({ data: null, error }).then(resolve, reject);
          }
          let data = null;
          if (state.beforeWrite && ['upsert', 'update'].includes(this.op)) state.beforeWrite(table, this.op);
          const matches = row => Object.entries(this.filters).every(([k, v]) => v === null ? row[k] == null : row[k] === v);
          if (table === 'billing_events') {
            if (this.op === 'select') data = state.events.get(this.filters.id) || null;
            if (this.op === 'insert' || this.op === 'upsert') state.events.set(this.value.id, { ...this.value });
            if (this.op === 'update') Object.assign(state.events.get(this.filters.id) || {}, this.value);
          }
          if (table === 'billing_payments' || table === 'billing_invoices') {
            const rows = table === 'billing_payments' ? state.payments : state.invoices;
            const idKey = table === 'billing_payments' ? 'asaas_payment_id' : 'asaas_invoice_id';
            if (this.op === 'select') data = this.singleResult ? [...rows.values()].find(matches) || null : [...rows.values()].filter(matches);
            if (this.op === 'upsert') {
              const key = this.value[idKey];
              if (this.options?.ignoreDuplicates && rows.has(key)) data = [];
              else { rows.set(key, { ...rows.get(key), ...this.value }); data = [rows.get(key)]; }
            }
            if (this.op === 'update') {
              data = [...rows.values()].filter(matches);
              data.forEach(row => Object.assign(row, this.value));
              if(this.singleResult)data=data[0]||null;
            }
          }
          if(table==='billing_pix_authorizations'){
            const rows=[...state.pixAuthorizations.values()].filter(matches);
            if(this.op==='select')data=this.singleResult?rows[0]||null:rows;
            if(this.op==='update'){rows.forEach(row=>Object.assign(row,this.value));data=this.singleResult?rows[0]||null:rows;}
          }
          if (table === 'billing_policy_versions') data = state.policyVersions.filter(row => !this.upperBound || Date.parse(row[this.upperBound[0]]) <= Date.parse(this.upperBound[1])).sort((a, b) => b.version - a.version)[0] || null;
          if (table === 'billing_subscriptions') {
            const rows = [...state.subscriptions.values()].filter(row => Object.entries(this.filters).every(([k,v]) => row[k] === v));
            if (this.op === 'select') data = rows[0] || null;
            if (this.op === 'update') rows.forEach(row => Object.assign(row, this.value));
          }
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        } catch (e) { return Promise.reject(e).then(resolve, reject); }
      }
    };
    return query;
  } };
  let handle;
  const env = { ASAAS_WEBHOOK_TOKEN: 'test-secret', SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fake' };
  const providerFetch=async url=>{const body=state.provider.get(String(url));if(!body)throw new Error(`Unexpected provider lookup ${url}`);return new Response(JSON.stringify(body),{status:200});};
  vm.runInNewContext(source, { Response, Request, fetch:providerFetch, Date, AbortSignal, createClient: () => admin, mergePayment: (...args) => mergeModule.then(m => m.mergePayment(...args)),
    applyPixAutomaticEvent:(...args)=>pixModule.then(m=>m.applyPixAutomaticEvent(...args)),finishReplacement:(...args)=>replaceModule.then(m=>m.finishReplacement(...args)),
    firstPaymentContext:(...args)=>pixModule.then(m=>m.firstPaymentContext(...args)),reconcileFirstPayment:(...args)=>pixModule.then(m=>m.reconcileFirstPayment(...args)),
    Deno: { env: { get: key => env[key] }, serve: handler => { handle = handler; } } });
  const event = { id: 'evt-test', event: 'PAYMENT_RECEIVED', payment: { id: 'pay-test', value: 105.9, status: 'RECEIVED', paymentDate: '2026-10-12', ...paymentExtra } };
  const send = (token = 'test-secret', body = event) => handle(new Request('https://example.invalid', {
    method: 'POST', headers: { 'asaas-access-token': token, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }));
  return { state, send };
}

function invoiceEvent(overrides = {}) {
  return { id: 'evt-invoice', event: 'INVOICE_AUTHORIZED', invoice: { id: 'inv-test', payment: 'pay-test', status: 'AUTHORIZED', number: '123',
    effectiveDate: '2026-10-12', value: 200, pdfUrl: 'https://files.example.invalid/nf.pdf', xmlUrl: 'https://files.example.invalid/nf.xml', ...overrides } };
}

function pixInitialFixture({conciliation='qr_first',customer='cus_demo',env='sandbox'}={}) {
 const h=harness();
 const sub={id:'sub_local',env:'sandbox',athlete_id:'athlete_local',method:'PIX',automatic_mode:'PIX_AUTOMATIC',base_cents:20000,package_name:'Demo',
  policy_snapshot:{enabled:false,methods:{PIX:0,CREDIT_CARD:0},graceDays:0,fine:{type:'PERCENTAGE',value:0},tiers:[{fromDay:1,rate:0,period:'day'}]}};
 h.state.subscriptions.set(sub.id,sub);
 h.state.pixAuthorizations.set('auth_local',{id:'auth_local',env,subscription_id:sub.id,customer_asaas_id:'cus_demo',conciliation_id:'qr_first',value_cents:20000,first_competence:'2026-10',state:'REFUSED',provider_status:'REFUSED'});
 h.state.provider.set('https://api-sandbox.asaas.com/v3/pix/transactions/txn_first',{id:'txn_first',payment:'pay_first',conciliationIdentifier:conciliation});
 const event={id:'evt_first',event:'PAYMENT_RECEIVED',payment:{id:'pay_first',customer,pixTransaction:'txn_first',value:200,status:'RECEIVED',dueDate:'2026-10-12',paymentDate:'2026-10-12',billingType:'PIX'}};
 return {...h,event};
}

test('verified first Pix received remains paid and family-linked after authorization refusal',async()=>{
 const h=pixInitialFixture();assert.equal((await h.send('test-secret',h.event)).status,200);
 const p=h.state.payments.get('pay_first');assert.equal(p.subscription_id,'sub_local');assert.equal(p.athlete_id,'athlete_local');
 assert.equal(p.status,'RECEIVED');assert.equal(p.value_cents,20000);assert.equal(p.reference_month,'2026-10');assert.equal(p.quote_state,'settled');
 assert.equal(h.state.pixAuthorizations.get('auth_local').initial_payment_status,'RECEIVED');assert.equal(h.state.pixAuthorizations.get('auth_local').state,'REFUSED');
 assert.equal((await h.send('test-secret',h.event)).status,200);
});
test('wrong first Pix conciliation or authorization environment cannot bind a family title',async()=>{
 for(const options of [{conciliation:'other_qr'},{env:'production'}]){
  const h=pixInitialFixture(options);assert.equal((await h.send('test-secret',h.event)).status,200);
  const p=h.state.payments.get('pay_first');assert.equal(p.subscription_id,null);assert.equal(p.athlete_id,null);
 }
});
test('first Pix customer mismatch is retryable and never linked or saved',async()=>{
 const h=pixInitialFixture({customer:'cus_other'});assert.equal((await h.send('test-secret',h.event)).status,500);
 assert.equal(h.state.payments.has('pay_first'),false);assert.equal(h.state.events.get('evt_first').processed_at,undefined);
});

test('invoice authorization requires the webhook token and persists the fiscal fields', async () => {
  const { state, send } = harness();
  assert.equal((await send('wrong', invoiceEvent())).status, 401);
  assert.equal(state.attempts.length, 0);
  assert.equal((await send('test-secret', invoiceEvent({ statusDescription: 'Autorizada' }))).status, 200);
  const invoice = state.invoices.get('inv-test');
  assert.equal(invoice.asaas_payment_id, 'pay-test');
  assert.equal(invoice.status, 'AUTHORIZED');
  assert.equal(invoice.value_cents, 20000);
  assert.equal(invoice.number, '123');
  assert.equal(invoice.effective_date, '2026-10-12');
  assert.equal(invoice.status_description, 'Autorizada');
  assert.match(invoice.pdf_url, /nf.pdf$/);
  assert.match(invoice.xml_url, /nf.xml$/);
});

test('invoice without files stores null URLs and duplicate delivery preserves later files', async () => {
  const { state, send } = harness();
  assert.equal((await send('test-secret', invoiceEvent({ pdfUrl: null, xmlUrl: null }))).status, 200);
  assert.equal(state.invoices.get('inv-test').pdf_url, null);
  assert.equal(state.invoices.get('inv-test').xml_url, null);
  const updated = invoiceEvent(); updated.id = 'evt-invoice-files'; updated.event = 'INVOICE_UPDATED';
  assert.equal((await send('test-secret', updated)).status, 200);
  assert.equal((await send('test-secret', invoiceEvent({ pdfUrl: null, xmlUrl: null }))).status, 200);
  assert.match(state.invoices.get('inv-test').pdf_url, /nf.pdf$/);
});

test('invoice database failure remains retryable and canceled invoice never reopens from old authorization', async () => {
  const { state, send } = harness(['billing_invoices:upsert']);
  assert.equal((await send('test-secret', invoiceEvent())).status, 500);
  assert.ok(!state.events.get('evt-invoice').processed_at);
  assert.equal((await send('test-secret', invoiceEvent())).status, 200);
  const canceled = invoiceEvent({ status: 'CANCELED' }); canceled.id = 'evt-canceled'; canceled.event = 'INVOICE_CANCELED';
  assert.equal((await send('test-secret', canceled)).status, 200);
  const stale = invoiceEvent(); stale.id = 'evt-stale-authorized';
  assert.equal((await send('test-secret', stale)).status, 200);
  assert.equal(state.invoices.get('inv-test').status, 'CANCELED');
});

test('pending webhook preserves paid status and repricing locks/components', async () => {
  const { state, send } = harness([], { status: 'PENDING', value: 200 });
  state.payments.set('pay-test', { env: 'sandbox', asaas_payment_id: 'pay-test', status: 'RECEIVED', value_cents: 21000 });
  assert.equal((await send()).status, 200);
  assert.equal(state.payments.get('pay-test').status, 'RECEIVED');
  assert.equal(state.payments.get('pay-test').value_cents, 21000);
  state.payments.set('pay-test', { env: 'sandbox', asaas_payment_id: 'pay-test', status: 'PENDING', value_cents: 21000, quote_lock: 'portal-lock', quote_state: 'updating', principal_cents: 21000 });
  const event = { id: 'evt-pending-lock', event: 'PAYMENT_UPDATED', payment: { id: 'pay-test', status: 'PENDING', value: 200 } };
  assert.equal((await send('test-secret', event)).status, 500);
  assert.equal(state.payments.get('pay-test').quote_lock, 'portal-lock');
  assert.equal(state.payments.get('pay-test').value_cents, 21000);
  assert.equal(state.payments.get('pay-test').principal_cents, 21000);
  assert.ok(!state.events.get('evt-pending-lock').processed_at);
  state.payments.get('pay-test').quote_lock = null;
  state.payments.get('pay-test').quote_state = 'current';
  assert.equal((await send('test-secret', event)).status, 200);
});

test('seeds issue-time policy only once and preserves a frozen snapshot on later events', async () => {
  const { state, send } = harness([], { subscription: 'sub-test', billingType: 'PIX', dateCreated: '2026-10-10 10:00:00', dueDate: '2026-10-20', value: 198 });
  const oldPolicy = { enabled: false, methods: { PIX: -1, CREDIT_CARD: 3 }, graceDays: 0, fine: { type: 'PERCENTAGE', value: 0 }, tiers: [{ fromDay: 1, rate: 0, period: 'day' }] };
  state.policyVersions.push({ version: 1, created_at: '2026-10-01T12:00:00Z', policy: oldPolicy }, { version: 2, created_at: '2026-10-11T12:00:00Z', policy: { ...oldPolicy, methods: { PIX: 10, CREDIT_CARD: 10 } } });
  state.subscriptions.set('local', { env: 'sandbox', id: 'local', athlete_id: 'athlete', asaas_subscription_id: 'sub-test', base_cents: 20000, package_name: 'Escolinha', method: 'PIX' });
  assert.equal((await send()).status, 200, state.events.get('evt-test')?.error);
  const payment = state.payments.get('pay-test');
  assert.equal(payment.base_cents, 20000);
  assert.equal(payment.method_adjustment_cents, -200);
  assert.equal(payment.principal_cents, 19800);
  assert.equal(payment.reference_month, '2026-10');
  assert.deepEqual(payment.policy_snapshot.methods, oldPolicy.methods);
  const later = { id: 'evt-later', event: 'PAYMENT_RECEIVED', payment: { id: 'pay-test', subscription: 'sub-test', status: 'RECEIVED', value: 198, dateCreated: '2026-10-12', billingType: 'PIX' } };
  assert.equal((await send('test-secret', later)).status, 200);
  assert.equal(state.payments.get('pay-test').method_adjustment_cents, -200);
  assert.deepEqual(state.payments.get('pay-test').policy_snapshot.methods, oldPolicy.methods);
});

test('without an issue timestamp only the subscription snapshot can seed a quote', async () => {
  const { state, send } = harness([], { subscription: 'sub-test', billingType: 'PIX', value: 200 });
  const policy = { enabled: false, methods: { PIX: 0, CREDIT_CARD: 0 }, graceDays: 0, fine: { type: 'PERCENTAGE', value: 0 }, tiers: [{ fromDay: 1, rate: 0, period: 'day' }] };
  state.subscriptions.set('local', { env: 'sandbox', id: 'local', athlete_id: 'athlete', asaas_subscription_id: 'sub-test', base_cents: 20000, method: 'PIX', policy_snapshot: policy });
  assert.equal((await send()).status, 200, state.events.get('evt-test')?.error);
  assert.equal(state.payments.get('pay-test').principal_cents, 20000);
  assert.ok(!state.attempts.includes('billing_policy_versions:select'));
});

test('concurrent settlement makes the conditional pending update retry instead of overwriting', async () => {
  const { state, send } = harness([], { status: 'PENDING', value: 200 });
  state.payments.set('pay-test', { env: 'sandbox', asaas_payment_id: 'pay-test', status: 'PENDING', updated_at: '2026-10-10T00:00:00Z', value_cents: 20000, quote_lock: null });
  state.beforeWrite = (table, op) => { if (table === 'billing_payments' && op === 'update') { state.payments.get('pay-test').status = 'RECEIVED'; state.beforeWrite = null; } };
  assert.equal((await send()).status, 500);
  assert.equal(state.payments.get('pay-test').status, 'RECEIVED');
  assert.equal((await send()).status, 200);
});

test('a payment with neither issue timestamp nor subscription snapshot stays legacy', async () => {
  const { state, send } = harness([], { subscription: 'sub-test', billingType: 'PIX', value: 200 });
  state.subscriptions.set('local', { env: 'sandbox', id: 'local', athlete_id: 'athlete', asaas_subscription_id: 'sub-test', base_cents: 20000, method: 'PIX' });
  assert.equal((await send()).status, 200);
  assert.equal(state.payments.get('pay-test').policy_snapshot, undefined);
  assert.ok(!state.attempts.includes('billing_policy_versions:select'));
});

test('historical policy DB failure requests retry instead of inventing a new snapshot', async () => {
  const { state, send } = harness(['billing_policy_versions:select'], { subscription: 'sub-test', billingType: 'PIX', value: 200, dateCreated: '2026-10-10' });
  state.subscriptions.set('local', { env: 'sandbox', id: 'local', athlete_id: 'athlete', asaas_subscription_id: 'sub-test', base_cents: 20000, method: 'PIX' });
  assert.equal((await send()).status, 500);
  assert.equal(state.payments.size, 0);
  assert.ok(!state.events.get('evt-test').processed_at);
});

test('settlement during repricing keeps the lock and records received-value discrepancy', async () => {
  const { state, send } = harness();
  state.payments.set('pay-test', { env: 'sandbox', asaas_payment_id: 'pay-test', status: 'PENDING', value_cents: 21000,
    quote_lock: 'portal-lock', quote_state: 'updating', policy_snapshot: { frozen: true }, principal_cents: 21000, fine_cents: 0, interest_cents: 0 });
  assert.equal((await send()).status, 200);
  const row = state.payments.get('pay-test');
  assert.equal(row.status, 'RECEIVED');
  assert.equal(row.value_cents, 10590);
  assert.equal(row.quote_lock, 'portal-lock');
  assert.equal(row.quote_state, 'discrepancy');
  assert.equal(row.principal_cents, 21000);
});

test('invoice compare-and-set conflict requests retry and does not overwrite cancellation', async () => {
  const { state, send } = harness();
  assert.equal((await send('test-secret', invoiceEvent())).status, 200);
  state.beforeWrite = (table, op) => { if (table === 'billing_invoices' && op === 'update') { state.invoices.get('inv-test').status = 'CANCELED'; state.beforeWrite = null; } };
  const updated = invoiceEvent(); updated.id = 'evt-update-race'; updated.event = 'INVOICE_UPDATED';
  assert.equal((await send('test-secret', updated)).status, 500);
  assert.equal(state.invoices.get('inv-test').status, 'CANCELED');
  assert.equal((await send('test-secret', updated)).status, 200);
  assert.equal(state.invoices.get('inv-test').status, 'CANCELED');
});

test('existing payment ownership is never relinked to another athlete by a later event', async () => {
  const { state, send } = harness([], { subscription: 'sub-other' });
  state.payments.set('pay-test', { env: 'sandbox', asaas_payment_id: 'pay-test', status: 'PENDING', subscription_id: 'local-original', athlete_id: 'athlete-original' });
  state.subscriptions.set('local-other', { env: 'sandbox', id: 'local-other', athlete_id: 'athlete-other', asaas_subscription_id: 'sub-other' });
  assert.equal((await send()).status, 500);
  assert.equal(state.payments.get('pay-test').athlete_id, 'athlete-original');
});

test('still requests retry when recording the processing error also fails', async () => {
  const { state, send } = harness(['billing_payments:upsert', 'billing_events:update']);
  assert.equal((await send()).status, 500);
  assert.ok(!state.events.get('evt-test').processed_at);
  assert.equal((await send()).status, 200);
});

test('links a checkout payment arriving before the subscription event', async () => {
  const { state, send } = harness([], { subscription: 'sub-card', checkoutSession: 'checkout-card' });
  state.subscriptions.set('local-card', { id: 'local-card', env: 'sandbox', athlete_id: 'athlete-card', asaas_subscription_id: null, asaas_checkout_id: 'checkout-card', status: 'pending' });
  assert.equal((await send()).status, 200);
  assert.equal(state.payments.get('pay-test').subscription_id, 'local-card');
  assert.equal(state.payments.get('pay-test').athlete_id, 'athlete-card');
  assert.equal(state.subscriptions.get('local-card').asaas_subscription_id, 'sub-card');
});

test('links a subscription by checkout even if checkout paid already marked it active', async () => {
  const { state, send } = harness();
  state.subscriptions.set('local-card', { id: 'local-card', env: 'sandbox', athlete_id: 'athlete-card', asaas_subscription_id: null, asaas_checkout_id: 'checkout-card', status: 'active' });
  state.payments.set('old-payment', { env: 'sandbox', asaas_subscription_id: 'sub-card', subscription_id: null, athlete_id: null });
  assert.equal((await send('test-secret', { id: 'evt-sub', event: 'SUBSCRIPTION_CREATED', subscription: { id: 'sub-card', checkoutSession: 'checkout-card' } })).status, 200);
  assert.equal(state.subscriptions.get('local-card').asaas_subscription_id, 'sub-card');
  assert.equal(state.payments.get('old-payment').subscription_id, 'local-card');
  assert.equal(state.payments.get('old-payment').athlete_id, 'athlete-card');
});

test('does not save an unlinked payment when its subscription lookup fails', async () => {
  const { state, send } = harness(['billing_subscriptions:select'], { subscription: 'sub-test' });
  assert.equal((await send()).status, 500);
  assert.equal(state.payments.size, 0);
  assert.ok(!state.events.get('evt-test').processed_at);
});

test('rejects unauthenticated events before accessing the database', async () => {
  const { state, send } = harness();
  assert.equal((await send('wrong')).status, 401);
  assert.equal(state.attempts.length, 0);
});

test('stores a successful payment and ignores a repeated processed event', async () => {
  const { state, send } = harness();
  assert.equal((await send()).status, 200);
  assert.equal(state.payments.get('pay-test').value_cents, 10590);
  assert.ok(state.events.get('evt-test').processed_at);
  assert.equal((await send()).status, 200);
  assert.equal(state.attempts.filter(x => x === 'billing_payments:upsert').length, 1);
});

for (const operation of ['billing_events:select', 'billing_events:insert', 'billing_payments:upsert', 'billing_events:update']) {
  test(`returns a retryable error when ${operation} fails, then processes the retry`, async () => {
    const { state, send } = harness([operation]);
    assert.equal((await send()).status, 500);
    assert.ok(!state.events.get('evt-test')?.processed_at);
    assert.equal((await send()).status, 200);
    assert.equal(state.payments.get('pay-test').status, 'RECEIVED');
    assert.ok(state.events.get('evt-test').processed_at);
  });
}
