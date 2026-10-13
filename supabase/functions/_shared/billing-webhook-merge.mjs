import { calculateQuote } from './billing-rules.mjs';

const PAID = new Set(['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH']);
const OPEN = new Set(['PENDING', 'OVERDUE']);
const REVERSED = new Set(['REFUNDED', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE', 'AWAITING_CHARGEBACK_REVERSAL']);

export async function policyAtIssue(admin, subscription, providerPayment) {
  const raw = providerPayment?.dateCreated;
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(raw)) return subscription?.policy_snapshot || null;
  const calendar = new Date(`${raw.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== raw.slice(0, 10)) return subscription?.policy_snapshot || null;
  const local = raw.length === 10 ? `${raw}T00:00:00-03:00` : /(?:Z|[+-]\d{2}:\d{2})$/.test(raw) ? raw.replace(' ', 'T') : `${raw.replace(' ', 'T')}-03:00`;
  const date = new Date(local);
  if (Number.isNaN(date.getTime())) return subscription?.policy_snapshot || null;
  const { data } = await admin.from('billing_policy_versions').select('policy').lte('created_at', date.toISOString())
    .order('version', { ascending: false }).limit(1).maybeSingle().throwOnError();
  return data?.policy || null;
}

/** Merge trusted provider data. Freeze policy once, preserve quote locks and use
 * conditional updates so stale webhooks/sync cannot overwrite a concurrent row.
 * Optional context seeds a composition only when base and issue policy are known.
 */
export async function mergePayment(admin, row, { subscription, providerPayment } = {}) {
  const { data: previous } = await admin.from('billing_payments').select('*').eq('asaas_payment_id', row.asaas_payment_id).maybeSingle().throwOnError();
  if (previous && previous.env !== row.env) throw new Error('Payment environment mismatch');
  for (const key of ['asaas_subscription_id', 'subscription_id', 'athlete_id']) {
    if (previous?.[key] && row[key] && previous[key] !== row[key]) throw new Error('Payment ownership link changed');
  }
  const status = row.status || previous?.status || null;
  const downgrade = (PAID.has(previous?.status) && !PAID.has(status) && !REVERSED.has(status))
    || (REVERSED.has(previous?.status) && !REVERSED.has(status))
    || (previous?.status === 'RECEIVED' && status === 'CONFIRMED')
    || (previous?.status === 'DELETED' && OPEN.has(status));
  if (downgrade) return { applied: false };
  if (OPEN.has(status) && (previous?.quote_lock || previous?.quote_state === 'updating')) throw new Error('Payment repricing in progress; retry event');
  const value = { ...row, status };
  // Only this helper may set composition fields. Callers cannot replace a
  // previously frozen snapshot or reset a repricing lock through a sync payload.
  for (const key of ['base_cents', 'method_adjustment_cents', 'principal_cents', 'fine_cents', 'interest_cents', 'policy_snapshot',
    'package_name', 'reference_month', 'quote_state', 'quote_date', 'quote_error', 'quote_lock', 'quote_lock_until']) delete value[key];
  for (const key of ['asaas_subscription_id', 'subscription_id', 'athlete_id', 'value_cents', 'net_cents', 'billing_type', 'due_date', 'paid_at', 'invoice_url', 'pix_transaction_id', 'pix_conciliation_id']) {
    if (value[key] == null && previous?.[key] != null) value[key] = previous[key];
  }
  if (!previous?.policy_snapshot && subscription?.base_cents != null) {
    const method = ['PIX', 'CREDIT_CARD'].includes(value.billing_type) ? value.billing_type : subscription.method;
    const policy = ['PIX', 'CREDIT_CARD'].includes(method) ? await policyAtIssue(admin, subscription, providerPayment) : null;
    if (policy) {
      const q = calculateQuote(subscription.base_cents, method, policy, 0);
      Object.assign(value, { base_cents: q.baseCents, method_adjustment_cents: q.methodAdjustmentCents, principal_cents: q.principalCents,
        fine_cents: 0, interest_cents: 0, package_name: subscription.package_name || null, policy_snapshot: policy,
        reference_month: value.due_date?.slice(0, 7) || null, quote_state: value.value_cents === q.totalCents ? 'current' : 'uncertain' });
    }
  }
  const quote = { ...previous, ...value };
  if (quote.policy_snapshot && PAID.has(status)) value.quote_state = value.value_cents === (quote.principal_cents || 0) + (quote.fine_cents || 0) + (quote.interest_cents || 0) ? 'settled' : 'discrepancy';
  else if (previous?.policy_snapshot && OPEN.has(status) && value.value_cents !== previous.value_cents) value.quote_state = 'uncertain';
  let result;
  if (!previous) result = await admin.from('billing_payments').upsert(value, { onConflict: 'asaas_payment_id', ignoreDuplicates: true }).select('asaas_payment_id').throwOnError();
  else {
    let query = admin.from('billing_payments').update(value).eq('asaas_payment_id', value.asaas_payment_id).eq('env', value.env);
    query = previous.status == null ? query.is('status', null) : query.eq('status', previous.status);
    if (previous.updated_at != null) query = query.eq('updated_at', previous.updated_at);
    query = previous.quote_lock == null ? query.is('quote_lock', null) : query.eq('quote_lock', previous.quote_lock);
    for (const key of ['value_cents', 'billing_type', 'due_date', 'principal_cents', 'fine_cents', 'interest_cents']) {
      query = previous[key] == null ? query.is(key, null) : query.eq(key, previous[key]);
    }
    result = await query.select('asaas_payment_id').throwOnError();
  }
  if (!result.data?.length) throw new Error('Concurrent billing change; retry event');
  return { applied: true };
}
