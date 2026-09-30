const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/login.js', 'utf8');

function harness(signInWithOAuth, user = null, route = 'unauthorized', reducedMotion = false) {
  const events = {};
  const timers = [];
  const redirects = [];
  const dispatched = [];
  const rootClasses = new Set();
  const root = { classList: {
    add(name) { rootClasses.add(name); },
    remove(name) { rootClasses.delete(name); }
  } };
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
  const elements = {
    card: { innerHTML: '' }, loginMessage: message, googleBtn: button, logoutBtn: logout, loginVersion: version,
    panelChoice: {}, athleteChoice: {}, logoutChoice: {}
  };
  const context = vm.createContext({
    document: { getElementById: id => elements[id], querySelector: () => root },
    financeDbClient: () => ({ auth: { signInWithOAuth } }),
    location: { href: 'http://localhost/login.html', replace(target) { redirects.push(target); } },
    window: { dispatchEvent(event) { dispatched.push(event.type); } },
    Event: class { constructor(type) { this.type = type; } },
    matchMedia: () => ({ matches: reducedMotion }),
    URL,
    APOLLO_VERSION: 'v2.4',
    APOLLO_AUTH: { user, googleRequired: false },
    apolloLoadAccess: async () => ({}),
    apolloRoute: () => route,
    apolloSignOut() {},
    setTimeout: callback => { timers.push(callback); return timers.length; },
    clearTimeout() {}
  });
  vm.runInContext(source, context);
  return { events, elements, button, label, message, logout, rootClasses, timers, redirects, dispatched };
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
  const { message, logout, rootClasses, redirects, dispatched } = harness(async () => ({ error: null }), { email: 'athlete@example.test' });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(message.textContent, /administra.+ativar seu perfil/i);
  assert.equal(logout.hidden, false);
  assert.equal(rootClasses.has('access-denied'), true);
  assert.deepEqual(redirects, []);
  assert.deepEqual(dispatched, []);
});

test('authorized panel account triggers the star exit and navigates after its easing interval', async () => {
  const state = harness(async () => ({ error: null }), { email: 'coach@example.test' }, 'panel');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.rootClasses.has('access-granted'), true);
  assert.deepEqual(state.dispatched, ['huddle:access-granted']);
  assert.deepEqual(state.redirects, []);
  state.timers[0]();
  assert.deepEqual(state.redirects, ['index.html']);
});

test('authorized athlete account uses the athlete destination, while reduced motion navigates immediately', async () => {
  const state = harness(async () => ({ error: null }), { email: 'athlete@example.test' }, 'athlete', true);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(state.redirects, ['area-do-atleta.html']);
  assert.deepEqual(state.dispatched, []);
});

test('an account with both areas waits for the chosen destination before transitioning', async () => {
  const state = harness(async () => ({ error: null }), { email: 'dual@example.test' }, 'choice');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(state.redirects, []);
  assert.deepEqual(state.dispatched, []);
  state.elements.athleteChoice.onclick();
  assert.deepEqual(state.dispatched, ['huddle:access-granted']);
  state.timers[0]();
  assert.deepEqual(state.redirects, ['area-do-atleta.html']);
});
