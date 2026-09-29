const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

let sent;
const context = vm.createContext({
  window: {},
  MONTHS: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
  pad: n => String(n).padStart(2, '0'),
  TODAY: new Date(2026, 8, 29),
  ymd: d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  parseYmd: s => new Date(...s.split('-').map((x, i) => i === 1 ? Number(x) - 1 : Number(x))),
  render: () => {},
});
vm.runInContext(fs.readFileSync(`${__dirname}/js/finance-reports.js`, 'utf8') + '\n' + fs.readFileSync(`${__dirname}/js/finance-db.js`, 'utf8') + `
  FIN_DB.session = { user: { id: 'mock' } }; FIN_DB.authorized = true; FIN_DB.canImport = true;
  FIN_DB.client = { rpc: async (_name, payload) => { globalThis.capture(payload); return { error: null }; } };
  financeDbRefresh = async () => {};
  globalThis.subject = { financeDbPayload, financeDbImport, disconnect: () => FIN_DB.session = null };
`, context);
context.capture = payload => { sent = payload; };

const report = { type: 'receivables', file: 'privado.xlsx', data: [{ key: 'original', date: '2026-09-10', name: 'Pessoa Teste', gross: 10000 }] };
assert.deepEqual(JSON.parse(JSON.stringify(context.subject.financeDbPayload(report))), [{ period: '2026-09-01', key: '1', data: report.data[0] }]);

(async () => {
  await assert.rejects(context.subject.financeDbImport(report, '2026-10-01', '2026-10-31'), /fora do período/);
  await context.subject.financeDbImport(report, '2026-09-01', '2026-09-30');
  assert.equal(sent.p_report_type, 'receivables');
  assert.equal(sent.p_period_start, '2026-09-01');
  assert.equal(sent.p_rows[0].data.gross, 10000);
  assert.equal(JSON.stringify(sent).includes('privado.xlsx'), false);
  await context.subject.financeDbImport({ type: 'open', file: 'snapshot.xls', data: [] }, '2026-09-01', '2026-09-30');
  assert.deepEqual(JSON.parse(JSON.stringify(sent.p_rows)), []);
  context.subject.disconnect();
  await assert.rejects(context.subject.financeDbImport(report, '2026-09-01', '2026-09-30'), /não tem permissão/);
  console.log('Finance database contract: OK');
})().catch(e => { console.error(e); process.exitCode = 1; });
