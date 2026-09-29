const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = vm.createContext({
  MONTHS: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
  pad: n => String(n).padStart(2, '0'),
  TODAY: new Date(2026, 8, 29),
  ymd: d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  parseYmd: s => new Date(...s.split('-').map((x, i) => i === 1 ? Number(x) - 1 : Number(x))),
});
vm.runInContext(fs.readFileSync(`${__dirname}/js/finance-reports.js`, 'utf8') + '\n globalThis.finTest = { finCsvRows, finCents, finMoneyListTotal, finDate, finReportType, finParseReceivables, finParseOpen, finParseStatement, finParseFlow, finAlertRows, finSummary, setOpen: data => FIN_REPORTS.open = { data }, setReceivables: data => FIN_REPORTS.receivables = { data }, setFlow: data => FIN_REPORTS.flow = { data }, setStatement: data => FIN_REPORTS.statement = { data } };', context);
const f = context.finTest;

assert.equal(f.finCents('R$ 1.234,56'), 123456);
assert.equal(f.finCents('R$ 149.90'), 14990);
assert.equal(f.finMoneyListTotal('R$ 109,90 109,90'), 21980);
assert.equal(f.finDate('29/09/2026'), '2026-09-29');
assert.equal(f.finDate('31/02/2026'), '');
assert.deepEqual(JSON.parse(JSON.stringify(f.finCsvRows('A;B\n"valor;com ponto";"linha ""citada"""\n'))), [['A', 'B'], ['valor;com ponto', 'linha "citada"']]);

const openRows = [
  ['C�digo', 'Cliente', 'Status', 'Itens Venda', 'Data Vencimento', 'Valor Venda', 'Total em Aberto', 'Aberto no Per�odo', 'Consultor', '#'],
  ['1', 'Atleta Exemplo', 'Ativo', 'MENSAL | BASE', '10/09/2026 15/09/2026', 'R$ 109,90 109,90', 'R$ 109,90 109,90', 'R$ 109.90 109,90', '-', 'Aberto'],
  ['2', 'Outro Exemplo', 'Bloqueado', 'MENSAL | ESCOLINHA', '10/10/2026', 'R$ 149,90', 'R$ 149,90', 'R$ 149.90', '-', 'Aberto'],
];
assert.equal(f.finReportType(openRows), 'open');
const open = f.finParseOpen(openRows);
assert.equal(open.length, 2);
assert.equal(open[0].open, 21980);
f.setOpen(open);
assert.equal(f.finAlertRows().length, 1);
assert.equal(f.finAlertRows()[0].days, 19);
assert.equal(f.finAlertRows()[0].alertAmount, 21980);
const mixed = f.finParseOpen([openRows[0], ['3', 'Exemplo Misto', 'Ativo', 'MENSAL | BASE', '10/09/2026 10/10/2026', 'R$ 300,00', 'R$ 100,00 200,00', 'R$ 100,00 200,00', '-', 'Aberto']]);
f.setOpen(mixed);
assert.equal(f.finAlertRows()[0].alertAmount, 10000);
assert.equal(f.finSummary('2026-10').openAmount, 20000);
f.setOpen(open);

const receivableRows = [
  ['Contas a Receber'],
  ['C�digo do cliente', 'Nome do cliente', 'Item', 'Forma', 'Data Recebimento', 'Data Cr�dito', 'Valor Bruto', 'Valor Taxa', 'Valor L�quido', 'Recebido', 'TID', 'NSU'],
  ['1', 'Atleta Exemplo', 'MENSAL | BASE', 'PIX', '01/09/2026', '01/09/2026', '149,90', '1,90', '148,00', 'Recebido', '-', '-'],
  ['2', 'Outro Exemplo', 'MENSAL | BASE', 'PIX', '02/09/2026', '02/09/2026', '100,00', '1,90', '98,10', 'N�o recebido', '-', '-'],
];
assert.equal(f.finReportType(receivableRows), 'receivables');
const receivables = f.finParseReceivables(receivableRows);
f.setReceivables(receivables);
const summary = f.finSummary('2026-09');
assert.equal(summary.gross, 14990);
assert.equal(summary.pendingConfirmation.length, 1);

const flowRows = [['#', 'Mar�o/2026', 'Setembro/2026'], ['Entradas'], ['PIX', '1.000,00', '2.000,00'], ['Total R$', '1.000,00', '2.000,00'], ['Sa�das']];
assert.equal(f.finReportType(flowRows), 'flow');
const flow = f.finParseFlow(flowRows);
assert.equal(flow[0].month, '2026-03');
assert.equal(flow[1].total, 200000);

if (process.argv.includes('--actual')) {
  const actual = JSON.parse(fs.readFileSync(0, 'utf8'));
  const rec = f.finParseReceivables(actual.receivables);
  const opened = f.finParseOpen(actual.open);
  const flows = f.finParseFlow(actual.flow);
  const bank = f.finParseStatement(actual.statement);
  f.setOpen(opened); f.setReceivables(rec); f.setFlow(flows); f.setStatement(bank);
  assert.equal(rec.length, 116);
  assert.equal(opened.length, 47);
  assert.equal(opened.reduce((s, x) => s + x.open, 0), 606520);
  assert.equal(bank.length, 157); // 20 linhas de saldo diário não são movimentos
  assert.equal(flows.find(x => x.month === '2026-09').total, 1370375);
  const current = f.finSummary('2026-09');
  console.log(JSON.stringify({ receivables: rec.length, confirmed: current.paid.length, openRows: opened.length, overdueRows: f.finAlertRows().length, openCents: opened.reduce((s, x) => s + x.open, 0), flowCents: current.flow.total, statementRows: bank.length }));
}
console.log('Finance report mapping: OK');
