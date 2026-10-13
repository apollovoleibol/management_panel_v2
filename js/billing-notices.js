/* Internal staff inbox. Billing notice rows never dispatch external messages. */
'use strict';
const BILLING_NOTICES = { rows: [], loading: false, pending: null, error: '', user: null };

function billingNoticesEligible() {
  return !!APOLLO_AUTH.user && ['coach', 'admin'].includes(APOLLO_AUTH.access?.role);
}
async function billingNoticesLoad() {
  if (!billingNoticesEligible()) { BILLING_NOTICES.rows = []; BILLING_NOTICES.user = null; billingNoticesBadge(); return; }
  if (BILLING_NOTICES.loading) {
    await BILLING_NOTICES.pending;
    if (billingNoticesEligible() && BILLING_NOTICES.user !== APOLLO_AUTH.user.id) return billingNoticesLoad();
    return;
  }
  const user = APOLLO_AUTH.user.id;
  if (BILLING_NOTICES.user !== user) { BILLING_NOTICES.rows = []; BILLING_NOTICES.user = user; }
  BILLING_NOTICES.loading = true; BILLING_NOTICES.error = '';
  BILLING_NOTICES.pending = (async () => { try {
    const { data, error } = await financeDbClient().rpc('billing_staff_notices');
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('O servidor não retornou os avisos.');
    if (APOLLO_AUTH.user?.id === user) BILLING_NOTICES.rows = data;
  } catch (e) { if (APOLLO_AUTH.user?.id === user) BILLING_NOTICES.error = e.message || 'Não foi possível carregar os avisos.'; }
  finally { BILLING_NOTICES.loading = false; billingNoticesBadge(); }
  })();
  return BILLING_NOTICES.pending;
}
function billingNoticesBadge() {
  const button = document.querySelector('[data-billing-notices]');
  if (!button) return;
  button.hidden = !billingNoticesEligible();
  const active = !BILLING_NOTICES.error && BILLING_NOTICES.user === APOLLO_AUTH.user?.id ? BILLING_NOTICES.rows.filter(row => !row.resolved_at).length : 0;
  button.textContent = `Avisos${!BILLING_NOTICES.error && active ? ` (${active})` : ''}`;
  button.setAttribute('aria-label', `Avisos internos da sua conta${active ? `: ${active} pendência(s)` : ''}`);
}
function billingNoticesMarkup() {
  if (!billingNoticesEligible() || BILLING_NOTICES.user !== APOLLO_AUTH.user.id) return '<p class="muted">Carregando os avisos da sua conta…</p>';
  if (BILLING_NOTICES.error) return `<div class="banner warn" role="alert">${esc(BILLING_NOTICES.error)} Os avisos não puderam ser confirmados.</div>`;
  if (!BILLING_NOTICES.rows.length) return '<p class="muted">Nenhum aviso de mensalidade na sua caixa de entrada.</p>';
  return BILLING_NOTICES.rows.map(row => {
    const resolved = !!row.resolved_at;
    const label = resolved ? 'Regularizado' : row.simulation ? 'Simulação · sandbox' : row.blocked ? 'Presença restrita' : 'Mensalidade vencida';
    const detail = resolved ? 'A pendência foi encerrada.' : row.simulation ? 'Aviso de teste. Não restringe a participação nos treinos.'
      : row.blocked ? 'A presença está restrita até a regularização da mensalidade.' : 'Há cobrança vencida. A restrição de presença está desativada.';
    return `<section class="panel mb"><div class="panel-pad"><h3>${esc(row.athlete_name || 'Atleta')}</h3><p class="hint">${esc(row.team_name || 'Sem equipe')}</p>
      <span class="tag nodot ${resolved ? 'st-ok' : row.blocked ? 'st-bad' : 'st-warn'}">${label}</span><p>${detail}</p>
      ${!resolved ? `<p class="hint">${Number(row.overdue_count) || 0} cobrança(s) vencida(s)${row.earliest_due ? ` · desde ${esc(row.earliest_due.split('-').reverse().join('/'))}` : ''}.</p>` : ''}
      ${row.read_at ? '<span class="hint">Aviso lido</span>' : `<button class="btn sm" data-billing-notice-read="${esc(row.id)}">Marcar como lido</button>`}</div></section>`;
  }).join('');
}
async function billingNoticesOpen() {
  if (!billingNoticesEligible()) return;
  openDialog(dHead('Sua conta', 'Avisos de mensalidades', 'Avisos internos enviados aos técnicos responsáveis e à administração.') + '<div class="d-body" id="billingNoticeList" role="status">Carregando avisos…</div><div class="d-foot"><button class="btn" data-act="close-dialog">Fechar</button><button class="btn" data-billing-notice-refresh>Atualizar</button></div>', 'drawer');
  await billingNoticesLoad();
  const list = document.getElementById('billingNoticeList'); if (list) list.innerHTML = billingNoticesMarkup();
}
document.addEventListener('click', async e => {
  if (e.target.closest('[data-billing-notices],[data-billing-notice-refresh]')) return billingNoticesOpen();
  const read = e.target.closest('[data-billing-notice-read]');
  if (!read || !billingNoticesEligible()) return;
  read.disabled = true;
  try {
    const { error } = await financeDbClient().rpc('billing_staff_notice_read', { p_notice_id: read.dataset.billingNoticeRead });
    if (error) throw error;
    await billingNoticesLoad();
    const list = document.getElementById('billingNoticeList'); if (list) list.innerHTML = billingNoticesMarkup();
  } catch (e) { read.disabled = false; toast(e.message || 'Não foi possível marcar o aviso como lido.', true); }
});

function billingNoticesStart() {
  if (!document.body.classList.contains('app-ready')) return;
  const top = document.querySelector('.top-right');
  if (top && !top.querySelector('[data-billing-notices]')) {
    const button = document.createElement('button'); button.className = 'btn sm'; button.type = 'button';
    button.dataset.billingNotices = ''; button.textContent = 'Avisos'; button.hidden = !billingNoticesEligible(); top.prepend(button);
  }
  billingNoticesLoad();
}
const billingNoticesStartupObserver = new MutationObserver(() => {
  if (document.body.classList.contains('app-ready')) { billingNoticesStartupObserver.disconnect(); billingNoticesStart(); }
});
billingNoticesStartupObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
billingNoticesStart();
window.addEventListener('focus', () => billingNoticesLoad());
document.addEventListener('visibilitychange', () => { if (!document.hidden) billingNoticesLoad(); });
setInterval(() => { if (!document.hidden && document.body.classList.contains('app-ready')) billingNoticesLoad(); }, 60000);
