'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

async function harness() {
  const engine = await import(pathToFileURL(path.join(__dirname, 'billing-rules.mjs')));
  const replies = {}, calls = [];
  const context = vm.createContext({ structuredClone, engine,
    document: { addEventListener() {} },
    financeDbClient: () => ({ rpc: async name => { calls.push(name); return replies[name]; } }),
    esc: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'),
    money: value => (value / 100).toFixed(2)
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'billing-rules-ui.js'), 'utf8'), context);
  vm.runInContext('BILL_RULES.engine = engine', context);
  return { context, engine, replies, calls, run: code => vm.runInContext(code, context) };
}

test('money input accepts comma and dot without silently rounding extra decimals', async () => {
  const { run } = await harness();
  assert.equal(run("billingRulesCents('200,25', 'base')"), 20025);
  assert.equal(run("billingRulesCents('200.25', 'base')"), 20025);
  assert.throws(() => run("billingRulesCents('200.255', 'base')"));
  assert.throws(() => run("billingRulesCents('', 'base')"));
  assert.equal(run("billingRulesNumber('-2,1234', 'ajuste')"), -2.1234);
});

test('policy load records current version and disables persistence after RPC failure', async () => {
  const { run, engine, replies } = await harness();
  replies.billing_get_policy = { data: { id: 'policy-1', version: 3, policy: engine.DEFAULT_POLICY, workerReady: false }, error: null };
  await run('billingRulesLoad()');
  assert.equal(run('BILL_RULES.available'), true);
  assert.equal(run('BILL_RULES.record.version'), 3);
  assert.match(run('billingRulesWorkerNote()'), /processamento agendado/);
  replies.billing_get_policy = { data: null, error: { message: 'function billing_get_policy does not exist' } };
  await assert.rejects(run('billingRulesLoad()'), /migração/);
  assert.equal(run('BILL_RULES.available'), false);
});

test('simulator compares both methods, components and capped fine for all boundary days', async () => {
  const { run, context } = await harness();
  const target = { innerHTML: '' }, error = { textContent: '' };
  const row = { querySelector: selector => ({ value: ({ '[data-from]': '1', '[data-rate]': '1', '[data-period]': 'month' })[selector] }) };
  context.form = { elements: { enabled: { checked: true }, pix: { value: '-2' }, card: { value: '3' }, grace: { value: '0' }, fineType: { value: 'FIXED' }, fineValue: { value: '3,92' }, simBase: { value: '200,00' }, simDays: { value: '15' } }, querySelectorAll: () => [row], querySelector: selector => selector === '[data-simulation]' ? target : error };
  run('billingRulesSimulation(form)');
  assert.equal(error.textContent, '');
  assert.equal((target.innerHTML.match(/<tr /g) || []).length, 12);
  for (const amount of ['196.00', '206.00', '3.92']) assert.ok(target.innerHTML.includes(amount));
  context.form.elements.simDays.value = '2.5';
  run('billingRulesSimulation(form)');
  assert.equal(target.innerHTML, '');
  assert.match(error.textContent, /inteiros/);
});

test('history displays version/date/summary, escapes content, omits author UUID and limits to 50', async () => {
  const { run, context, engine, replies, calls } = await harness();
  context.records = Array.from({ length: 51 }, (_, i) => ({ id: `policy-${i}`, version: 51 - i, created_at: '2026-10-12T14:00:00Z', created_by: 'raw-author-uuid-private', policy: engine.DEFAULT_POLICY }));
  context.records[0].version = '<script>alert(1)</script>';
  const html = run('billingRulesHistoryMarkup(records)');
  assert.equal((html.match(/<th scope="row">/g) || []).length, 50);
  assert.ok(!html.includes('raw-author-uuid-private'));
  assert.ok(!html.includes('<script>'));
  assert.match(html, /12\/10\/2026/);
  assert.match(html, /encargos desativados/i);
  replies.billing_policy_history = { data: context.records, error: null };
  context.historyTarget = { isConnected: true, textContent: '', innerHTML: '' };
  await run('billingRulesHistoryLoad(historyTarget)');
  assert.deepEqual(calls, ['billing_policy_history']);
  assert.match(context.historyTarget.innerHTML, /Versão/);
  replies.billing_policy_history = { data: null, error: { message: 'permission denied' } };
  await run('billingRulesHistoryLoad(historyTarget)');
  assert.match(context.historyTarget.textContent, /Não foi possível carregar/);
});

test('fixed fine input clamps to2% of the smallest principal in the reference scenario',async()=>{
 const {run,context}=await harness();const hint={textContent:''};context.form={elements:{fineType:{value:'FIXED'},fineValue:{value:'10.00'},simBase:{value:'200,00'},pix:{value:'0'},card:{value:'5'}},querySelector:()=>hint};
 run('billingRulesFineLimit(form)');assert.equal(context.form.elements.fineValue.value,'4.00');assert.equal(context.form.elements.fineValue.max,'4.00');assert.match(hint.textContent,/4.00/);
 context.form.elements.simBase.value='100';run('billingRulesFineLimit(form)');assert.equal(context.form.elements.fineValue.value,'2.00');
 context.form.elements.pix.value='-10';run('billingRulesFineLimit(form)');assert.equal(context.form.elements.fineValue.value,'1.80');
 context.form.elements.fineType.value='PERCENTAGE';context.form.elements.fineValue.value='8';run('billingRulesFineLimit(form)');assert.equal(context.form.elements.fineValue.value,'2');assert.equal(context.form.elements.fineValue.max,'2');
});

test('saving rejects a fixed fine over the reference ceiling even without input normalization',async()=>{
 const {run,context}=await harness();context.form={elements:{enabled:{checked:true},pix:{value:'0'},card:{value:'5'},grace:{value:'0'},fineType:{value:'FIXED'},fineValue:{value:'10'},simBase:{value:'200'}},querySelectorAll:()=>[{querySelector:selector=>({value:({'[data-from]':'1','[data-rate]':'2','[data-period]':'month'})[selector]})}]};
 assert.throws(()=>run('billingRulesRead(form)'),/excede 2%/);context.form.elements.fineValue.value='4';assert.equal(run('billingRulesRead(form).fine.value'),400);context.form.elements.simBase.value='100';assert.throws(()=>run('billingRulesRead(form)'),/excede 2%/);context.form.elements.simBase.value='';assert.throws(()=>run('billingRulesRead(form)'),/referência/);
});
