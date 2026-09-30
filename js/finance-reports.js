/* Relatórios Tecnofit: leitura local, sem envio de arquivos ao servidor. */
'use strict';

const FIN_REPORTS = { receivables: null, open: null, flow: null, statement: null };
const FIN_HISTORY = [];
let FIN_STAGED = null;
const finHasImports = () => Object.values(FIN_REPORTS).some(Boolean);
const finNorm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const finCol = (head, ...names) => head.findIndex(h => names.some(n => finNorm(h) === finNorm(n)));
const finCell = (row, index) => index < 0 ? '' : String(row[index] ?? '').trim();
function finCents(value) {
  let s = String(value ?? '').replace(/[^\d,.-]/g, '');
  if (!s || s === '-') return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
const finMoneyList = value => (String(value ?? '').match(/(?:R\$\s*)?-?\d[\d.,]*[,.]\d{2}/g) || []).map(finCents);
const finMoneyListTotal = value => finMoneyList(value).reduce((sum, amount) => sum + amount, 0);
function finDate(value) {
  const m = String(value ?? '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return '';
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return d.getFullYear() === Number(m[3]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[1]) ? `${m[3]}-${m[2]}-${m[1]}` : '';
}
const finDateLabel = value => value ? value.split('-').reverse().join('/') : '—';
function finCsvRows(text) {
  const source = text.replace(/^\uFEFF/, '');
  const first = source.split(/\r?\n/, 1)[0];
  const delim = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"' && quoted && source[i + 1] === '"') { cell += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === delim && !quoted) { row.push(cell); cell = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && source[i + 1] === '\n') i++;
      row.push(cell); if (row.some(v => v.trim())) rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  row.push(cell); if (row.some(v => v.trim())) rows.push(row);
  return rows;
}
function finHtmlRows(text) {
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const table = doc.querySelector('table');
  if (!table) throw new Error('O arquivo .xls não contém uma tabela reconhecível.');
  return [...table.querySelectorAll('tr')].map(tr => [...tr.children].filter(c => /^(TD|TH)$/.test(c.tagName)).map(c => {
    const copy = c.cloneNode(true);
    copy.querySelectorAll('hr,br').forEach(separator => separator.replaceWith(doc.createTextNode(' ')));
    return copy.textContent.replace(/\s+/g, ' ').trim();
  }));
}
async function finXlsxRows(buffer) {
  if (typeof JSZip === 'undefined') throw new Error('Leitor de XLSX indisponível.');
  const zip = await JSZip.loadAsync(buffer, { checkCRC32: true });
  const sheet = zip.file('xl/worksheets/sheet1.xml');
  if (!sheet) throw new Error('A primeira aba da planilha não foi encontrada.');
  const xml = new DOMParser().parseFromString(await sheet.async('string'), 'application/xml');
  if (xml.querySelector('parsererror')) throw new Error('A planilha contém XML inválido.');
  const shared = zip.file('xl/sharedStrings.xml');
  let strings = [];
  if (shared) {
    const x = new DOMParser().parseFromString(await shared.async('string'), 'application/xml');
    strings = [...x.getElementsByTagNameNS('*', 'si')].map(si => [...si.getElementsByTagNameNS('*', 't')].map(t => t.textContent).join(''));
  }
  return [...xml.getElementsByTagNameNS('*', 'row')].map(row => {
    const cells = [];
    for (const c of row.getElementsByTagNameNS('*', 'c')) {
      const ref = c.getAttribute('r') || '';
      const letters = (ref.match(/^[A-Z]+/) || [''])[0];
      const index = [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
      if (index < 0 || index > 200) continue;
      const type = c.getAttribute('t');
      const raw = c.getElementsByTagNameNS('*', 'v')[0]?.textContent ?? '';
      cells[index] = type === 's' ? strings[Number(raw)] ?? '' : type === 'inlineStr' ? [...c.getElementsByTagNameNS('*', 't')].map(t => t.textContent).join('') : raw;
    }
    return cells;
  });
}
function finReportType(rows) {
  const first = rows.slice(0, 3).map(r => r.map(finNorm));
  if (first.some(r => r.includes('datarecebimento') && r.includes('valorbruto') && r.includes('recebido'))) return 'receivables';
  if (first.some(r => r.includes('datavencimento') && r.includes('totalemaberto'))) return 'open';
  if (first.some(r => r.includes('idvenda') && r.includes('saldo') && r.includes('tipo'))) return 'statement';
  if (first.some(r => r[0] === '' && r.slice(1).some(v => /202[0-9]/.test(v))) || rows.some(r => finNorm(r[0]) === 'entradas' && r.length === 1)) return 'flow';
  throw new Error('Não reconheci o relatório. Use as quatro exportações indicadas na guia Importações.');
}
function finParseReceivables(rows) {
  const head = rows.find(r => r.some(v => finNorm(v) === 'datarecebimento'));
  const at = rows.indexOf(head);
  const ix = { clientId: finCol(head, 'C�digo do cliente', 'Código do cliente'), name: finCol(head, 'Nome do cliente'), item: finCol(head, 'Item'), method: finCol(head, 'Forma'), receivedDate: finCol(head, 'Data Recebimento'), creditDate: finCol(head, 'Data Cr�dito', 'Data Crédito'), gross: finCol(head, 'Valor Bruto'), fees: finCol(head, 'Valor Taxa'), net: finCol(head, 'Valor L�quido', 'Valor Líquido'), status: finCol(head, 'Recebido'), tid: finCol(head, 'TID'), nsu: finCol(head, 'NSU') };
  if (Object.values(ix).slice(0, 10).some(i => i < 0)) throw new Error('Faltam colunas obrigatórias em Contas a Receber.');
  return rows.slice(at + 1).filter(r => finCell(r, ix.clientId) && finDate(finCell(r, ix.receivedDate))).map((r, i) => ({
    key: `${finCell(r, ix.clientId)}|${finDate(finCell(r, ix.receivedDate))}|${finCell(r, ix.item)}|${i}`,
    clientId: finCell(r, ix.clientId), name: finCell(r, ix.name), item: finCell(r, ix.item), method: finCell(r, ix.method),
    date: finDate(finCell(r, ix.receivedDate)), creditDate: finDate(finCell(r, ix.creditDate)), gross: finCents(finCell(r, ix.gross)), fees: finCents(finCell(r, ix.fees)), net: finCents(finCell(r, ix.net)), received: finNorm(finCell(r, ix.status)) === 'recebido',
    transaction: finCell(r, ix.tid) || finCell(r, ix.nsu)
  }));
}
function finParseOpen(rows) {
  const head = rows.find(r => r.some(v => finNorm(v) === 'datavencimento'));
  const at = rows.indexOf(head);
  const ix = { clientId: finCol(head, 'C�digo', 'Código'), name: finCol(head, 'Cliente'), status: finCol(head, 'Status'), item: finCol(head, 'Itens Venda'), due: finCol(head, 'Data Vencimento'), sale: finCol(head, 'Valor Venda'), open: finCol(head, 'Total em Aberto'), period: finCol(head, 'Aberto no Per�odo', 'Aberto no Período') };
  if (Object.values(ix).some(i => i < 0)) throw new Error('Faltam colunas obrigatórias em Vendas em Aberto.');
  return rows.slice(at + 1).filter(r => /^\d+$/.test(finCell(r, ix.clientId))).map((r, i) => {
    const dueDates = (finCell(r, ix.due).match(/\d{2}\/\d{2}\/\d{4}/g) || []).map(finDate).filter(Boolean);
    const balances = finMoneyList(finCell(r, ix.open));
    const installments = dueDates.length === balances.length ? dueDates.map((date, n) => ({ date, amount: balances[n] })) : [];
    return { key: `${finCell(r, ix.clientId)}|${finCell(r, ix.item)}|${dueDates.join(',')}|${i}`, clientId: finCell(r, ix.clientId), name: finCell(r, ix.name), clientStatus: finCell(r, ix.status), item: finCell(r, ix.item), dueDates, due: [...dueDates].sort()[0] || '', sale: finMoneyListTotal(finCell(r, ix.sale)), open: balances.reduce((sum, amount) => sum + amount, 0), inPeriod: finMoneyListTotal(finCell(r, ix.period)), installments, needsReview: !installments.length };
  }).filter(r => r.open > 0);
}
function finParseStatement(rows) {
  const head = rows.find(r => r.some(v => finNorm(v) === 'idvenda'));
  const at = rows.indexOf(head), ix = { date: finCol(head, 'Data'), value: finCol(head, 'Valor'), type: finCol(head, 'Tipo'), client: finCol(head, 'Cliente'), saleId: finCol(head, 'ID Venda') };
  if (Object.values(ix).some(i => i < 0)) throw new Error('Faltam colunas obrigatórias no extrato.');
  return rows.slice(at + 1).filter(r => finDate(finCell(r, ix.date))).map((r, i) => ({ key: `${finDate(finCell(r, ix.date))}|${finCell(r, ix.type)}|${i}`, date: finDate(finCell(r, ix.date)), amount: finCents(finCell(r, ix.value)), type: finCell(r, ix.type), client: finCell(r, ix.client), saleId: finCell(r, ix.saleId) }));
}
function finParseFlow(rows) {
  const head = rows.find(r => r[0] === '#' && r.length > 2);
  if (!head) throw new Error('Cabeçalho do fluxo de caixa não encontrado.');
  const months = head.slice(1).map(v => { const m = String(v).match(/(\d{4})$/); const name = finNorm(String(v).split('/')[0]); const idx = MONTHS.findIndex(x => finNorm(x).slice(0, 3) === name.slice(0, 3)); return m && idx >= 0 ? `${m[1]}-${pad(idx + 1)}` : ''; });
  const result = months.map(month => ({ month, categories: {}, total: 0 }));
  let inEntries = false;
  for (const r of rows.slice(rows.indexOf(head) + 1)) {
    const label = finNorm(r[0]);
    if (label === 'entradas') { inEntries = true; continue; }
    if (label === 'saidas') { inEntries = false; continue; }
    if (!inEntries || r.length < 2) continue;
    result.forEach((m, i) => { if (!m.month) return; if (label === 'totalr') m.total = finCents(r[i + 1]); else m.categories[String(r[0]).trim()] = finCents(r[i + 1]); });
  }
  return result.filter(m => m.month);
}
async function finParseFile(file) {
  if (file.size > 12 * 1024 * 1024) throw new Error('Arquivo acima de 12 MB.');
  const name = file.name.toLowerCase();
  const rows = name.endsWith('.xlsx') ? await finXlsxRows(await file.arrayBuffer()) : name.endsWith('.xls') ? finHtmlRows(await file.text()) : name.endsWith('.csv') ? finCsvRows(await file.text()) : null;
  if (!rows) throw new Error('Formato inválido. Use .xlsx, .xls ou .csv.');
  const type = finReportType(rows);
  const parse = { receivables: finParseReceivables, open: finParseOpen, statement: finParseStatement, flow: finParseFlow }[type];
  const data = parse(rows);
  // Um relatório vazio ainda é uma fotografia válida: pode limpar débitos quitados.
  return { type, data, file: file.name, count: data.length, at: new Date().toISOString() };
}
const finReportNames = { receivables: 'Contas a Receber', open: 'Vendas em Aberto', flow: 'Fluxo de Caixa Analítico', statement: 'Extrato' };
const finOpenInstallments = () => (FIN_REPORTS.open?.data || []).flatMap(row => row.installments.map(part => ({ ...part, row })));
function finStagedDescription(report) {
  const dates = report.data.map(r => report.type === 'flow' ? r.month : report.type === 'open' ? r.due : r.date).filter(Boolean).sort();
  const range = dates.length ? `${report.type === 'flow' ? dates[0] : finDateLabel(dates[0])} a ${report.type === 'flow' ? dates.at(-1) : finDateLabel(dates.at(-1))}` : 'período não identificado';
  const amount = report.type === 'receivables' ? report.data.filter(r => r.received).reduce((s, r) => s + r.gross, 0) : report.type === 'open' ? report.data.reduce((s, r) => s + r.open, 0) : report.type === 'flow' ? report.data.at(-1)?.total || 0 : report.data.filter(r => finNorm(r.type).startsWith('depositodepix')).reduce((s, r) => s + r.amount, 0);
  const label = { receivables: 'Bruto confirmado', open: 'Saldo em aberto', flow: 'Entradas do último mês', statement: 'Depósitos PIX' }[report.type];
  return `${range} · ${label}: ${money(amount)}`;
}
function finAlertRows() {
  return (FIN_REPORTS.open?.data || []).filter(r => finNorm(r.item).startsWith('mensal') && !r.needsReview).map(r => {
    const late = r.installments.filter(x => x.date < ymd(TODAY));
    const due = late.map(x => x.date).sort()[0] || '';
    return { ...r, due, alertAmount: late.reduce((sum, x) => sum + x.amount, 0), days: due ? Math.round((TODAY - parseYmd(due)) / 864e5) : 0 };
  }).filter(r => r.alertAmount > 0).sort((a, b) => b.days - a.days || b.alertAmount - a.alertAmount);
}
function finSummary(key) {
  const received = (FIN_REPORTS.receivables?.data || []).filter(r => r.date.slice(0, 7) === key);
  const paid = received.filter(r => r.received);
  const statement = (FIN_REPORTS.statement?.data || []).filter(r => r.date.slice(0, 7) === key);
  const flow = (FIN_REPORTS.flow?.data || []).find(r => r.month === key);
  const openParts = finOpenInstallments().filter(r => r.date.slice(0, 7) === key);
  const open = [...new Set(openParts.map(r => r.row))];
  const sum = (rows, prop) => rows.reduce((s, r) => s + r[prop], 0);
  return { received, paid, statement, flow, open, openAmount: sum(openParts, 'amount'), gross: sum(paid, 'gross'), fees: sum(paid, 'fees'), net: sum(paid, 'net'), pendingConfirmation: received.filter(r => !r.received), bankDeposits: sum(statement.filter(r => finNorm(r.type).startsWith('depositodepix')), 'amount'), bankFees: sum(statement.filter(r => finNorm(r.type).startsWith('tarifa')), 'amount'), bankTransfers: sum(statement.filter(r => finNorm(r.type).startsWith('transferencia')), 'amount') };
}

function financeImportWizard(type) {
  if (!canEdit('finance')) return toast('Seu perfil não pode importar relatórios.', true);
  if (!finReportNames[type]) return toast('Escolha um relatório na guia Importações.', true);
  if (!FIN_DB.canImport) { S.fin.tab = 'imports'; render(); return toast('Conecte uma conta com permissão de importação.', true); }
  FIN_STAGED = null;
  const format = { receivables: '.xlsx', open: '.xls', flow: '.xls', statement: '.csv' }[type];
  openDialog(dHead(`Importar ${finReportNames[type]}`, 'Tecnofit', 'Somente dados tratados serão gravados') + `<div class="d-body">
    <p class="muted small">Escolha um único arquivo ${format}. O navegador extrai os registros; o arquivo original não é enviado nem guardado no banco. Depois informe o período completo usado no filtro do Tecnofit. Reimportar substitui os dados deste período${type === 'open' ? ' e toda a fotografia anterior de vendas em aberto' : ''}.</p>
    <button class="btn sm mb" data-act="fin-goto" data-tab="imports">Ver onde exportar, formato e período de cada arquivo</button>
    <label class="dropzone" style="display:block;cursor:pointer">${icon('upload')}<h3>Escolher ${finReportNames[type]}</h3><p class="muted small">Formato ${format}</p><input id="finFiles" type="file" accept="${format}" class="sr"></label>
    <div id="finFileReview" class="mt"></div><div class="err" id="finFileError" role="alert"></div></div><div class="d-foot"><button class="btn" data-act="close-dialog">Cancelar</button><button class="btn primary" data-act="finance-import-commit" data-edit disabled>Gravar dados tratados</button></div>`, 'drawer wide');
  $('#finFiles').addEventListener('change', async e => {
    const file = e.target.files[0]; FIN_STAGED = null; $('#finFileError').textContent = ''; $('#finFileReview').innerHTML = '<p class="muted">Lendo arquivo…</p>';
    if (!file) return;
    try {
      if (!file.name.toLowerCase().endsWith(format)) throw new Error(`Este relatório deve ser enviado como ${format}.`);
      const parsed = await finParseFile(file);
      if (parsed.type !== type) throw new Error(`O conteúdo é de ${finReportNames[parsed.type]}, não de ${finReportNames[type]}.`);
      FIN_STAGED = parsed;
      const dates = parsed.data.flatMap(r => type === 'flow' ? [`${r.month}-01`] : type === 'open' ? r.dueDates : [r.date]).sort();
      $('#finFileReview').innerHTML = `<div class="stat-line"><span><strong>${esc(finReportNames[type])}</strong><br><small class="muted">${esc(parsed.file)} · ${esc(finStagedDescription(parsed))}</small></span><b>${parsed.count} linhas</b></div><div class="row2 mt"><div class="field"><label for="finPeriodStart">Início do filtro no Tecnofit</label><input class="input" id="finPeriodStart" type="date" required></div><div class="field"><label for="finPeriodEnd">Fim do filtro no Tecnofit</label><input class="input" id="finPeriodEnd" type="date" required></div></div><p class="hint">Digite o intervalo exato do filtro usado no Tecnofit. As datas das linhas (${dates.length ? finDateLabel(dates[0]) + ' a ' + finDateLabel(dates.at(-1)) : 'nenhuma linha'}) não comprovam que o mês inteiro foi exportado. Verde exige do dia 1 ao último dia; períodos parciais aparecem em amarelo.</p>`;
      $('#dlg [data-act="finance-import-commit"]').disabled = false;
    } catch (err) { $('#finFileError').textContent = err.message; $('#finFileReview').innerHTML = ''; }
    finally { e.target.value = ''; }
  });
}
async function financeImportCommit() {
  if (!canEdit('finance') || !FIN_STAGED || FIN_DB.busy) return;
  const button = $('#dlg [data-act="finance-import-commit"]');
  button.disabled = true; FIN_DB.busy = true;
  try {
    await financeDbImport(FIN_STAGED, $('#finPeriodStart').value, $('#finPeriodEnd').value);
    FIN_STAGED = null; closeDialog(); S.fin.tab = 'imports'; render(); toast('Dados tratados gravados no banco.');
  } catch (err) { $('#finFileError').textContent = err.message; button.disabled = false; }
  finally { FIN_DB.busy = false; }
}
