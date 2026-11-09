const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Equipe com treino às terças e sextas 18:00–19:00
function harness(team = {}) {
  const t = { id: 't1', name: 'Escolinha C', active: true, coach: 'caio',
    schedule: [{ day: 2, start: '18:00', end: '19:00' }, { day: 5, start: '18:00', end: '19:00' }],
    cancelled: [], cancelInfo: {}, changes: [], ...team };
  const context = vm.createContext({
    toMin: s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; },
    parseYmd: s => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); },
    TEAMS: [t], USERS: [], COACHES: [{ id: 'caio', name: 'Caio Almeida' }, { id: 'carol', name: 'Carolina Corsi' }],
    LIVE: { teamCoachIds: new Map([['t1', ['caio']]]) }, S: {}, APOLLO_AUTH: { access: { role: 'admin' } },
    myTeamIds: () => ['t1'], canEdit: () => true
  });
  vm.runInContext(`${fs.readFileSync(`${__dirname}/js/training-exceptions.js`, 'utf8')}
    ;globalThis.teamOf = id => TEAMS.find(x => x.id === id); globalThis.coachOf = id => COACHES.find(c => c.id === id);
    globalThis.__set = (k, v) => { if (k === 'subs') TRAINING_SUBS = v; };`, context);
  return { t, run: code => vm.runInContext(code, context), context };
}

test('grade, mudança de horário e treino extra do dia', () => {
  const h = harness({ changes: [
    { date: '2026-11-17', kind: 'change', start: '18:00', end: '19:30', makeupFor: '2026-11-13' },
    { date: '2026-11-11', kind: 'extra', start: '18:00', end: '19:00', makeupFor: '2026-11-06' }
  ] });
  assert.deepEqual(JSON.parse(h.run(`JSON.stringify(trainingsOn(TEAMS[0], '2026-11-10').map(s => [s.start, s.end, s.source]))`)), [['18:00', '19:00', 'grade']]);
  const changed = h.run(`trainingsOn(TEAMS[0], '2026-11-17')[0]`);
  assert.equal(changed.end, '19:30');
  assert.equal(h.run(`trainingExTag(trainingsOn(TEAMS[0], '2026-11-17')[0])`), '+30 min · reposição de 13/11');
  assert.equal(h.run(`trainingExTag(trainingsOn(TEAMS[0], '2026-11-11')[0])`), 'reposição de 06/11');
  assert.equal(h.run(`trainingsOn(TEAMS[0], '2026-11-12').length`), 0);
});

test('reposição pendente até cobrir os minutos perdidos; reposição cancelada deixa de contar', () => {
  const h = harness({ cancelled: ['2026-11-06'], cancelInfo: { '2026-11-06': { reason: 'court', late: true, lost: 60, makeupRequired: true, waived: false } } });
  assert.equal(h.run('pendingMakeups().length'), 1);
  assert.equal(h.run('pendingMakeups()[0].missing'), 60);
  h.t.changes.push({ date: '2026-11-10', kind: 'change', start: '18:00', end: '19:30', makeupFor: '2026-11-06' });
  assert.equal(h.run('pendingMakeups()[0].missing'), 30);
  h.t.changes.push({ date: '2026-11-11', kind: 'extra', start: '18:00', end: '18:30', makeupFor: '2026-11-06' });
  assert.equal(h.run('pendingMakeups().length'), 0);
  h.t.cancelled.push('2026-11-11');
  assert.equal(h.run('pendingMakeups()[0].missing'), 30);
  h.t.cancelInfo['2026-11-06'].waived = true;
  assert.equal(h.run('pendingMakeups().length'), 0);
});

test('etiquetas da Folha: substituto e reposição', () => {
  const h = harness({ changes: [{ date: '2026-11-11', kind: 'extra', start: '18:00', end: '19:00', makeupFor: '2026-11-06' }] });
  assert.deepEqual(JSON.parse(h.run(`JSON.stringify(trainingPayTags('carol', 't1', '2026-11-11'))`)), ['reposição de 06/11', 'substituto (titular: Caio)']);
  assert.deepEqual(JSON.parse(h.run(`JSON.stringify(trainingPayTags('caio', 't1', '2026-11-10'))`)), []);
});
