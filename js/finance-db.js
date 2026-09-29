/* Persistência financeira: somente registros tratados seguem para o Supabase. */
'use strict';

const FIN_DB = { client: null, session: null, authorized: false, canImport: false, busy: false, error: '', coverage: [], ready: false };
const FIN_DB_URL = 'https://hrakdydodcmllwnkmrkg.supabase.co';
// Chave pública anon do mesmo projeto usado pelo painel atual; a autorização é feita pelo JWT e RLS.
const FIN_DB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyYWtkeWRvZGNtbGx3bmttcmtnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MDEwNTAsImV4cCI6MjA5MTA3NzA1MH0.LFDcJNf2_uWzmj6zRyc7xUSww7G7mIpgta-1ro4oPFc';

function financeDbClient() {
  if (!FIN_DB.client) {
    if (!window.supabase?.createClient) throw new Error('Cliente Supabase indisponível. Verifique a conexão de internet.');
    FIN_DB.client = window.supabase.createClient(FIN_DB_URL, FIN_DB_ANON, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
  }
  return FIN_DB.client;
}

async function financeDbInit() {
  try {
    const { data, error } = await financeDbClient().auth.getSession();
    if (error) throw error;
    FIN_DB.session = data.session;
    if (FIN_DB.session) {
      await financeDbRequireRole();
      await financeDbRefresh();
    }
  } catch (e) { FIN_DB.authorized = false; FIN_DB.canImport = false; FIN_DB.error = e.message; }
  FIN_DB.ready = true;
  if (seesFinance()) render();
}

async function financeDbSignIn() {
  const email = $('#finDbEmail')?.value.trim(), password = $('#finDbPassword')?.value;
  if (!email || !password) return toast('Informe e-mail e senha do painel real.', true);
  FIN_DB.busy = true; FIN_DB.error = '';
  try {
    const { data, error } = await financeDbClient().auth.signInWithPassword({ email, password });
    if (error) throw error;
    FIN_DB.session = data.session;
    await financeDbRequireRole();
    await financeDbRefresh();
    toast('Banco conectado e dados financeiros atualizados.');
  } catch (e) { FIN_DB.authorized = false; FIN_DB.canImport = false; FIN_DB.error = e.message; toast(`Conexão financeira: ${e.message}`, true); }
  finally { FIN_DB.busy = false; render(); }
}

async function financeDbRequireRole() {
  const { data, error } = await financeDbClient().rpc('finance_has_access');
  if (error) throw error;
  if (data !== true) {
    await financeDbClient().auth.signOut();
    FIN_DB.session = null;
    throw new Error('Esta conta não tem perfil financeiro ativo no banco.');
  }
  const permission = await financeDbClient().rpc('finance_can_import');
  if (permission.error) throw permission.error;
  FIN_DB.authorized = true;
  FIN_DB.canImport = permission.data === true;
}

async function financeDbSignOut() {
  await financeDbClient().auth.signOut();
  FIN_DB.session = null; FIN_DB.authorized = false; FIN_DB.canImport = false; FIN_DB.error = ''; FIN_DB.coverage = [];
  FIN_HISTORY.length = 0;
  Object.keys(FIN_REPORTS).forEach(type => { FIN_REPORTS[type] = null; });
  render();
}

async function financeDbAll(table, fields, order) {
  const client = financeDbClient(), result = [];
  for (let start = 0; ; start += 500) {
    let query = client.from(table).select(fields).range(start, start + 499);
    if (order) query = query.order(order, { ascending: false });
    const { data, error } = await query;
    if (error) throw error;
    result.push(...data);
    if (data.length < 500) break;
  }
  return result;
}

async function financeDbRefresh() {
  if (!FIN_DB.session) return;
  try {
    const [coverage, history, rows] = await Promise.all([
      financeDbAll('finance_report_coverage', 'report_type,period,imported_at,import_id', 'period'),
      financeDbAll('finance_imports', 'id,report_type,period_start,period_end,row_count,imported_at', 'imported_at'),
      financeDbAll('finance_report_rows', 'report_type,period,source_key,data,import_id')
    ]);
    FIN_DB.coverage = coverage;
    FIN_HISTORY.length = 0;
    history.forEach(h => FIN_HISTORY.push({ type: h.report_type, start: h.period_start, end: h.period_end, count: h.row_count, at: h.imported_at }));
    for (const type of Object.keys(FIN_REPORTS)) {
      const data = rows.filter(r => r.report_type === type).map(r => r.data);
      FIN_REPORTS[type] = coverage.some(c => c.report_type === type) ? { type, data, count: data.length, at: history.find(h => h.report_type === type)?.imported_at } : null;
    }
    FIN_DB.error = '';
  } catch (e) { FIN_DB.error = `Não foi possível ler os dados financeiros: ${e.message}`; throw e; }
  render();
}

function financeDbPayload(report) {
  return report.data.map((data, index) => {
    const date = report.type === 'flow' ? data.month : report.type === 'open' ? data.due : data.date;
    if (!/^\d{4}-\d{2}(?:-\d{2})?$/.test(date || '')) throw new Error(`Linha ${index + 1} sem período válido.`);
    return { period: `${date.slice(0, 7)}-01`, key: String(index + 1), data };
  });
}

async function financeDbImport(report, start, end) {
  if (!FIN_DB.session || !FIN_DB.canImport) throw new Error('Esta conta não tem permissão para importar relatórios.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) throw new Error('Informe o período completo usado na exportação.');
  const dates = report.data.flatMap(r => report.type === 'flow' ? [`${r.month}-01`] : report.type === 'open' ? r.dueDates : [r.date]);
  if (dates.some(date => date < start || date > end)) throw new Error('O arquivo contém dados fora do período informado. Confira os filtros de exportação.');
  const payload = financeDbPayload(report);
  const { error } = await financeDbClient().rpc('finance_import_report', {
    p_report_type: report.type, p_period_start: start, p_period_end: end, p_rows: payload
  });
  if (error) throw error;
  await financeDbRefresh();
}
