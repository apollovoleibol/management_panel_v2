const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/login.js', 'utf8');

function harness(signInWithOAuth, user = null) {
  const events = {};
  const label = { textContent: 'Entrar com Google' };
  const button = {
    disabled: false,
    attributes: {},
    classList: { values: new Set(), toggle(name, on) { on ? this.values.add(name) : this.values.delete(name); } },
    querySelector: () => label,
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, callback) { events[name] = callback; }
  };
  const message = { textContent: '', style: {} };
  const logout = { hidden: true, addEventListener() {} };
  const version = { textContent: '' };
  const elements = { card: { innerHTML: '' }, loginMessage: message, googleBtn: button, logoutBtn: logout, loginVersion: version };
  const context = vm.createContext({
    document: { getElementById: id => elements[id] },
    financeDbClient: () => ({ auth: { signInWithOAuth } }),
    location: { href: 'http://localhost/login.html', replace() {} },
    URL,
    APOLLO_VERSION: 'v2.3',
    APOLLO_AUTH: { user, googleRequired: false },
    apolloLoadAccess: async () => ({}),
    apolloRoute: () => 'unauthorized',
    apolloSignOut() {},
    setTimeout: () => 1,
    clearTimeout() {}
  });
  vm.runInContext(source, context);
  return { events, button, label, message, logout };
}

test('Google sign-in blocks duplicate clicks and restores the button after failure', async () => {
  let resolveOAuth;
  let calls = 0;
  const pending = new Promise(resolve => { resolveOAuth = resolve; });
  const { events, button, label, message } = harness(() => { calls++; return pending; });
  const first = events.click();
  await events.click();
  assert.equal(calls, 1);
  assert.equal(button.disabled, true);
  assert.equal(label.textContent, 'Abrindo Google...');
  assert.equal(button.attributes['aria-busy'], 'true');
  resolveOAuth({ error: new Error('OAuth unavailable') });
  await first;
  assert.equal(button.disabled, false);
  assert.equal(label.textContent, 'Entrar com Google');
  assert.match(message.textContent, /tente novamente/i);
});

test('unauthorized account receives a recovery step and a way to switch accounts', async () => {
  const { message, logout } = harness(async () => ({ error: null }), { email: 'athlete@example.test' });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(message.textContent, /administra.+ativar seu perfil/i);
  assert.equal(logout.hidden, false);
});
