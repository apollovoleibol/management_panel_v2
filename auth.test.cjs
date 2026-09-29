const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/auth.js', 'utf8');
const token = method => `header.${Buffer.from(JSON.stringify({ amr: [{ method }] })).toString('base64url')}.signature`;

function harness(session, access = { role: 'coach', pages: { overview: { view: true } }, athleteIds: [] }) {
  const calls = { user: 0, rpc: 0, redirects: [] };
  const client = {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      getUser: async () => { calls.user++; return { data: { user: { id: 'staff-1' } }, error: null }; }
    },
    rpc: async () => { calls.rpc++; return { data: access, error: null }; }
  };
  const context = vm.createContext({
    financeDbClient: () => client,
    atob: input => Buffer.from(input, 'base64').toString('binary'),
    location: { replace: url => calls.redirects.push(url) }
  });
  vm.runInContext(source, context);
  return { calls, context };
}

test('without a session, redirect to login without requesting user or permissions', async () => {
  const { calls, context } = harness(null);
  const result = await vm.runInContext("apolloRequireArea('panel')", context);
  assert.equal(result.ok, false);
  assert.deepEqual(calls.redirects, ['login.html']);
  assert.equal(calls.user, 0);
  assert.equal(calls.rpc, 0);
});

test('password session from v1 cannot open v2', async () => {
  const { calls, context } = harness({ access_token: token('password') });
  const result = await vm.runInContext("apolloRequireArea('panel')", context);
  assert.equal(result.ok, false);
  assert.deepEqual(calls.redirects, ['login.html']);
  assert.equal(calls.rpc, 0);
  assert.equal(vm.runInContext('APOLLO_AUTH.googleRequired', context), true);
});

test('Google session receives its panel permission from the database', async () => {
  const { calls, context } = harness({ access_token: token('oauth') });
  const result = await vm.runInContext("apolloRequireArea('panel')", context);
  assert.equal(result.ok, true);
  assert.equal(calls.rpc, 1);
  assert.deepEqual(calls.redirects, []);
});

test('Google session with no assigned profile cannot open the panel', async () => {
  const { calls, context } = harness({ access_token: token('oauth') }, { role: null, pages: {}, athleteIds: [] });
  const result = await vm.runInContext("apolloRequireArea('panel')", context);
  assert.equal(result.ok, false);
  assert.deepEqual(calls.redirects, ['login.html']);
});
