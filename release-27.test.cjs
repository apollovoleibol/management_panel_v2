const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function financeScope() {
  const scope = vm.createContext({
    FIN_DB: { coverage: [] }, FIN_HISTORY: [], ATHLETES: [],
    TODAY: new Date(2026, 8, 30), digits: value => String(value || '').replace(/\D/g, ''),
    parseYmd: value => new Date(value + 'T12:00:00'),
    isMinorTeam: team => !!team && team.ageMin < 18,
    teamOf: () => ({ ageMin: 18 }), pad: n => String(n).padStart(2, '0')
  });
  vm.runInContext(fs.readFileSync('js/finance-page.js', 'utf8'), scope);
  return scope;
}

test('coverage marks only full calendar months green using the import that owns each month', () => {
  const scope = financeScope();
  scope.FIN_HISTORY.push({ id: 'latest', type: 'receivables', start: '2026-08-04', end: '2026-09-25' });
  scope.FIN_DB.coverage.push(
    { report_type: 'receivables', period: '2026-08-01', import_id: 'latest' },
    { report_type: 'receivables', period: '2026-09-01', import_id: 'latest' }
  );
  assert.equal(vm.runInContext("finCoverageState('receivables','2026-08')", scope), 'partial');
  assert.equal(vm.runInContext("finCoverageState('receivables','2026-09')", scope), 'partial');
  assert.equal(vm.runInContext("finCoverageState('receivables','2026-11')", scope), 'missing');
  scope.FIN_HISTORY.push({ id: 'full', type: 'statement', start: '2026-09-01', end: '2026-09-30' });
  scope.FIN_DB.coverage.push({ report_type: 'statement', period: '2026-09-01', import_id: 'full' });
  assert.equal(vm.runInContext("finCoverageState('statement','2026-09')", scope), 'complete');
});

test('monthly payment contacts require exact Tecnofit linkage and guardian phone for a minor', () => {
  const scope = financeScope();
  scope.ATHLETES.push({ id: 'a1', active: true, tecnofitClientId: '86', name: 'Atleta',
    birth: '2014-05-01', phone: '11999999999', parentName: 'Responsável', parentPhone: '11988888888' });
  const linked = vm.runInContext("finContactFor({clientId:'86'})", scope);
  assert.equal(linked.name, 'Responsável');
  assert.equal(linked.phone, '11988888888');
  assert.equal(vm.runInContext("finContactFor({clientId:'87'})", scope), null);
  assert.equal(vm.runInContext("finWhatsappHref('11988888888')", scope), 'https://wa.me/5511988888888');
  assert.equal(vm.runInContext("finWhatsappHref('123')", scope), '');
});

test('a date closed to trial bookings still counts as training until separately cancelled', () => {
  const today = new Date(2026, 8, 30, 12);
  const team = { id: 'team-1', name: 'Escolinha', n: 'n1', active: true,
    schedule: [{ day: 3, start: '15:00', end: '16:00' }], blocked: ['2026-09-30'], cancelled: [] };
  const scope = vm.createContext({
    TODAY: today, NOW: today, TEAMS: [team], BOOKINGS: [], NUCLEI: [{ id: 'n1', name: 'Apollo' }],
    S: { cal: { cursor: today, nuclei: new Set(['n1']), showTests: true } },
    startOfWeek: date => new Date(2026, 8, 28),
    addDays: (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days),
    ymd: date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-'),
    myTeamIds: () => ['team-1'], toMin: value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3)),
    coachOf: () => null, NCLASS: () => 'novo', nucleusLabel: value => value, esc: value => value, icon: () => '',
    DOW: ['DOM','SEG','TER','QUA','QUI','SEX','SÁB'], MONTHS: ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'],
    MON: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'], pad: n => String(n).padStart(2, '0')
  });
  vm.runInContext(fs.readFileSync('js/pages-ops.js', 'utf8'), scope);
  let html = vm.runInContext('weekCalendarHTML()', scope);
  assert.match(html, /1 treinos na semana/);
  assert.match(html, /sem novos testes/);
  assert.doesNotMatch(html, /treino cancelado/);
  team.cancelled.push('2026-09-30');
  html = vm.runInContext('weekCalendarHTML()', scope);
  assert.match(html, /0 treinos na semana/);
  assert.match(html, /treino cancelado/);
});
