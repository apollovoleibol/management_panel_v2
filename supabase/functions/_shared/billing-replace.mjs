// Troca da forma de pagamento: quando a nova mensalidade fica ativa, encerra a anterior no Asaas.
// O Asaas remove as cobranças pendentes/vencidas da assinatura removida; cobranças pagas permanecem.
// Se um mês já foi pago pela forma anterior durante a troca, a cobrança duplicada da nova é removida.
const PAID = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH']);

async function asaasCall(path, method = 'GET') {
  const base = Deno.env.get('ASAAS_BASE_URL') || 'https://api-sandbox.asaas.com/v3';
  const r = await fetch(base + path, { method, signal: AbortSignal.timeout(15000),
    headers: { access_token: Deno.env.get('ASAAS_API_KEY') || '', 'User-Agent': 'Apollo-Huddle', 'Content-Type': 'application/json' } });
  const text = await r.text();
  let body = null; try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!r.ok && r.status !== 404) throw new Error(body?.errors?.map(e => e.description).join(' ') || `Asaas ${r.status}`);
  return r.status === 404 ? null : body;
}

export async function finishReplacement(admin, newSubId, env) {
  const { data: sub } = await admin.from('billing_subscriptions').select('id,replaces_id,asaas_subscription_id,status').eq('id', newSubId).eq('env', env).maybeSingle().throwOnError();
  if (!sub?.replaces_id || sub.status !== 'active') return false;
  const { data: old } = await admin.from('billing_subscriptions').select('*').eq('id', sub.replaces_id).eq('env', env).maybeSingle().throwOnError();
  if (!old || old.status === 'canceled') return false;
  if (old.automatic_mode === 'PIX_AUTOMATIC') {
    const { data: auth } = await admin.from('billing_pix_authorizations').select('asaas_authorization_id,provider_status').eq('subscription_id', old.id).eq('env', env).maybeSingle();
    if (auth?.asaas_authorization_id && !['CANCELLED', 'REFUSED', 'EXPIRED'].includes(auth.provider_status))
      await asaasCall(`/pix/automatic/authorizations/${encodeURIComponent(auth.asaas_authorization_id)}`, 'DELETE');
  }
  if (old.asaas_subscription_id) await asaasCall(`/subscriptions/${encodeURIComponent(old.asaas_subscription_id)}`, 'DELETE');
  else if (old.asaas_checkout_id && old.status === 'pending') await asaasCall(`/checkouts/${encodeURIComponent(old.asaas_checkout_id)}/cancel`, 'POST');
  await admin.from('billing_subscriptions').update({ status: 'canceled', updated_at: new Date().toISOString() }).eq('id', old.id).throwOnError();
  // Meses já pagos pela forma anterior não podem ser cobrados de novo
  if (sub.asaas_subscription_id) {
    const { data: paidOld } = await admin.from('billing_payments').select('due_date,status').eq('env', env).eq('subscription_id', old.id);
    const paidMonths = new Set((paidOld || []).filter(p => PAID.has(p.status)).map(p => String(p.due_date).slice(0, 7)));
    const fresh = await asaasCall(`/subscriptions/${encodeURIComponent(sub.asaas_subscription_id)}/payments`);
    for (const p of fresh?.data || []) {
      if (['PENDING', 'OVERDUE'].includes(p.status) && paidMonths.has(String(p.dueDate).slice(0, 7))) await asaasCall(`/payments/${encodeURIComponent(p.id)}`, 'DELETE');
    }
  }
  return true;
}
