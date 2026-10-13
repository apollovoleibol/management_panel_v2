const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function harness() {
  const calls = [], button = { setAttribute() {}, hidden: false, textContent: '' };
  const auth = { user: { id: 'coach-A' }, access: { role: 'coach' } };
  const listeners = {};
  let reply = async () => ({ data: [], error: null });
  const context = vm.createContext({
    APOLLO_AUTH: auth,
    financeDbClient: () => ({ rpc: async (name, args) => { calls.push({ name, args }); return reply(name, args); } }),
    document: { body: { classList: { contains: () => false } }, hidden: true,
      querySelector: () => button, getElementById: () => null, addEventListener: (name, fn) => { listeners[name] = fn; } },
    window: { addEventListener() {} }, MutationObserver: class { observe() {} disconnect() {} }, setInterval() {},
    esc: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'),
    toast() {}
  });
  vm.runInContext(fs.readFileSync(`${__dirname}/js/billing-notices.js`, 'utf8'), context);
  return { context, calls, auth, button, listeners, reply: fn => { reply = fn; }, run: code => vm.runInContext(code, context) };
}

test('staff inbox labels sandbox as simulation, actual restrictions accurately, and escapes athlete names', async () => {
  const h = harness();
  h.reply(async () => ({ data: [
    { id: 'n1', athlete_name: '<script>secret</script>', team_name: 'Equipe A', simulation: true, blocked: false, overdue_count: 1, earliest_due: '2026-10-10' },
    { id: 'n2', athlete_name: 'Atleta B', team_name: 'Equipe A', simulation: false, blocked: true, overdue_count: 2 }
  ], error: null }));
  await h.run('billingNoticesLoad()');
  const markup = h.run('billingNoticesMarkup()');
  assert.ok(!markup.includes('<script>'));
  assert.match(markup, /Simulação · sandbox/);
  assert.match(markup, /Não restringe a participação/);
  assert.match(markup, /Presença restrita/);
  assert.equal(h.button.textContent, 'Avisos (2)');
  assert.deepEqual(h.calls.map(call => call.name), ['billing_staff_notices']);
});

test('unavailable server shows a confirmation error without a false unread count', async () => {
  const h = harness();
  h.reply(async () => ({ data: null, error: { message: 'permission denied' } }));
  await h.run('billingNoticesLoad()');
  assert.match(h.run('billingNoticesMarkup()'), /não puderam ser confirmados/);
  assert.equal(h.button.textContent, 'Avisos');
});

test('account switch while loading never displays the previous account notices', async () => {
  const h = harness(); let release;
  h.reply(() => new Promise(resolve => { release = resolve; }));
  const first = h.run('billingNoticesLoad()');
  h.auth.user = { id: 'coach-B' };
  assert.match(h.run('billingNoticesMarkup()'), /Carregando/);
  h.reply(async () => ({ data: [{ id: 'B', athlete_name: 'Only coach B', overdue_count: 1, simulation: true }], error: null }));
  const second = h.run('billingNoticesLoad()');
  release({ data: [{ id: 'A', athlete_name: 'Private coach A' }], error: null });
  await Promise.all([first, second]);
  assert.match(h.run('billingNoticesMarkup()'), /Only coach B/);
  assert.ok(!h.run('billingNoticesMarkup()').includes('Private coach A'));
  assert.equal(h.calls.length, 2);
});

test('athlete accounts cannot load staff inbox', async () => {
  const h = harness(); h.auth.access = { role: null };
  await h.run('billingNoticesLoad()');
  assert.equal(h.calls.length, 0);
  assert.equal(h.button.hidden, true);
});
