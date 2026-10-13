// Avisos do Asaas (webhook). Autenticado pelo cabeçalho asaas-access-token = ASAAS_WEBHOOK_TOKEN.
// Cada evento é gravado uma única vez (billing_events.id) e depois aplicado às tabelas de mensalidades.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { mergePayment } from '../_shared/billing-webhook-merge.mjs';
import {applyPixAutomaticEvent,firstPaymentContext,reconcileFirstPayment} from '../_shared/billing-pix-automatic.mjs';
import {finishReplacement} from '../_shared/billing-replace.mjs';

const BASE = Deno.env.get('ASAAS_BASE_URL') || 'https://api-sandbox.asaas.com/v3';
const ENV = BASE.includes('sandbox') ? 'sandbox' : 'production';
const ok = () => new Response('ok', { status: 200 });
async function pixApi(path:string){
 const r=await fetch(BASE+path,{signal:AbortSignal.timeout(15000),headers:{access_token:Deno.env.get('ASAAS_API_KEY')||'','User-Agent':'Apollo-Huddle'}});
 if(!r.ok)throw new Error(`Pix Automatic lookup failed (${r.status})`);return r.json();
}

function cents(value: unknown) {
  const amount = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 2147483647) throw new Error('Invalid provider amount');
  return amount;
}

// Conditional invoice writes preserve concurrent updates, including changes
// arriving during the same timestamp millisecond.
async function saveRow(admin: any, table: string, key: string, value: any, previous: any) {
  let result;
  if (!previous) {
    result = await admin.from(table).upsert(value, { onConflict: key, ignoreDuplicates: true }).select(key).throwOnError();
  } else {
    let query = admin.from(table).update(value).eq(key, value[key]).eq('env', ENV).eq('status', previous.status);
    if (previous.updated_at != null) query = query.eq('updated_at', previous.updated_at);
    for (const column of ['asaas_payment_id', 'pdf_url', 'xml_url', 'number', 'effective_date', 'value_cents', 'status_description'])
      query = previous[column] == null ? query.is(column, null) : query.eq(column, previous[column]);
    result = await query.select(key).throwOnError();
  }
  if (!result.data?.length) throw new Error('Concurrent billing change; retry event');
}

async function applyInvoice(admin: any, evt: any, now: string) {
  const invoice = evt.invoice;
  const { data: previous } = await admin.from('billing_invoices').select('*').eq('asaas_invoice_id', invoice.id).maybeSingle().throwOnError();
  if (previous && previous.env !== ENV) throw new Error('Invoice environment mismatch');
  const eventStatus: Record<string, string> = { INVOICE_CREATED: 'SCHEDULED', INVOICE_SYNCHRONIZED: 'SYNCHRONIZED',
    INVOICE_AUTHORIZED: 'AUTHORIZED', INVOICE_PROCESSING_CANCELLATION: 'PROCESSING_CANCELLATION', INVOICE_CANCELED: 'CANCELED',
    INVOICE_CANCELLATION_DENIED: 'CANCELLATION_DENIED', INVOICE_ERROR: 'ERROR' };
  const status = invoice.status || eventStatus[evt.event];
  if (!status) throw new Error('Invoice status missing');
  if (previous?.status === 'CANCELED' && status !== 'CANCELED') return;
  if (['AUTHORIZED', 'PROCESSING_CANCELLATION', 'CANCELLATION_DENIED'].includes(previous?.status)
    && ['SCHEDULED', 'SYNCHRONIZED', 'ERROR'].includes(status)) return;
  if (['PROCESSING_CANCELLATION', 'CANCELLATION_DENIED'].includes(previous?.status) && status === 'AUTHORIZED' && evt.event !== 'INVOICE_CANCELLATION_DENIED') return;
  if (previous?.asaas_payment_id && invoice.payment && previous.asaas_payment_id !== invoice.payment) throw new Error('Invoice payment link changed');
  await saveRow(admin, 'billing_invoices', 'asaas_invoice_id', {
    asaas_invoice_id: invoice.id, env: ENV, asaas_payment_id: invoice.payment || previous?.asaas_payment_id || null, status,
    number: invoice.number || previous?.number || null, effective_date: invoice.effectiveDate || previous?.effective_date || null,
    pdf_url: invoice.pdfUrl || previous?.pdf_url || null, xml_url: invoice.xmlUrl || previous?.xml_url || null,
    status_description: invoice.statusDescription ?? previous?.status_description ?? null,
    value_cents: invoice.value == null ? previous?.value_cents ?? null : cents(invoice.value), updated_at: now
  }, previous);
}

function safeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const expected = Deno.env.get('ASAAS_WEBHOOK_TOKEN') || '';
  if (!safeEqual(request.headers.get('asaas-access-token') || '', expected)) return new Response('Unauthorized', { status: 401 });
  // deno-lint-ignore no-explicit-any
  let evt: any;
  try { evt = await request.json(); } catch { return new Response('Bad request', { status: 400 }); }
  if (!evt?.id || !evt?.event) return new Response('Bad request', { status: 400 });

  const url = Deno.env.get('SUPABASE_URL')!;
  const secret = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const admin = createClient(url, secret!, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const { data: prev } = await admin.from('billing_events').select('processed_at').eq('id', evt.id).maybeSingle().throwOnError();
    if (prev?.processed_at) return ok();
    if (!prev) await admin.from('billing_events').insert({ id: evt.id, event: evt.event, payload: evt }).throwOnError();
    const now = new Date().toISOString();
    await applyPixAutomaticEvent(admin,pixApi,evt,ENV);
    const p = evt.payment, s = evt.subscription, ck = evt.checkout;
    if (p?.id) {
      let sub = null;
      const initial=p.pixTransaction && !p.subscription?await firstPaymentContext(admin,pixApi,p,ENV):null;
      if(initial?.subscription)sub=initial.subscription;
      if (p.subscription) ({ data: sub } = await admin.from('billing_subscriptions').select('id,athlete_id,base_cents,package_name,method,policy_snapshot').eq('env', ENV).eq('asaas_subscription_id', p.subscription).maybeSingle().throwOnError());
      // Cobrança pode chegar antes de SUBSCRIPTION_CREATED. O checkout identifica
      // exatamente a mensalidade, inclusive quando o mesmo pagador tem vários atletas.
      if (!sub && p.checkoutSession) {
        ({ data: sub } = await admin.from('billing_subscriptions').select('id,athlete_id,base_cents,package_name,method,policy_snapshot').eq('env', ENV).eq('asaas_checkout_id', p.checkoutSession).maybeSingle().throwOnError());
        if (sub && p.subscription) await admin.from('billing_subscriptions').update({ asaas_subscription_id: p.subscription, updated_at: now }).eq('id', sub.id).throwOnError();
      }
      await mergePayment(admin, {
        env: ENV, asaas_payment_id: p.id, asaas_subscription_id: p.subscription || null,
        subscription_id: sub?.id || null, athlete_id: sub?.athlete_id || null,
        value_cents: p.value == null ? null : cents(p.value), net_cents: p.netValue == null ? null : cents(p.netValue),
        billing_type: p.billingType || null, status: evt.event === 'PAYMENT_DELETED' ? 'DELETED' : p.status || null,
        due_date: p.dueDate || null, paid_at: p.clientPaymentDate || p.paymentDate || null,
        invoice_url: p.invoiceUrl || null, updated_at: now
        ,pix_transaction_id:p.pixTransaction || null,pix_conciliation_id:initial?.conciliationId || null
      }, { subscription: sub, providerPayment: p });
      if(initial?.authorization && sub)await reconcileFirstPayment(admin,initial.authorization,sub,ENV);
    }
    if (evt.event.startsWith('INVOICE_')) {
      if (!evt.invoice?.id) throw new Error('Invoice payload missing');
      await applyInvoice(admin, evt, now);
    }
    if (s?.id) {
      if (evt.event === 'SUBSCRIPTION_CREATED') {
        // Pelo identificador nosso (Pix) ou, no cartão via checkout, pelo pagador com cartão pendente
        let target = null;
        if (s.checkoutSession) ({ data: target } = await admin.from('billing_subscriptions').select('id,athlete_id').eq('env', ENV).eq('asaas_checkout_id', s.checkoutSession).maybeSingle().throwOnError());
        if (!target && s.externalReference) ({ data: target } = await admin.from('billing_subscriptions').select('id,athlete_id').eq('env', ENV).eq('id', s.externalReference).maybeSingle().throwOnError());
        if (!target && s.customer) {
          let { data: cust } = await admin.from('billing_customers').select('id').eq('asaas_id', s.customer).maybeSingle().throwOnError();
          // Cliente criado pelo checkout do cartão: identifica pelo CPF/CNPJ
          if (!cust) {
            const r = await fetch(`${BASE}/customers/${s.customer}`, { headers: { access_token: Deno.env.get('ASAAS_API_KEY') || '', 'User-Agent': 'Apollo-Huddle' } });
            if (!r.ok) throw new Error(`Asaas customer lookup failed (${r.status})`);
            const c = await r.json();
            const doc = String(c?.cpfCnpj || '').replace(/\D/g, '');
            if (doc) {
              ({ data: cust } = await admin.from('billing_customers').select('id,asaas_id').eq('env', ENV).eq('cpf_cnpj', doc).maybeSingle().throwOnError());
              if (cust && !(cust as any).asaas_id) await admin.from('billing_customers').update({ asaas_id: s.customer }).eq('id', cust.id).throwOnError();
            }
          }
          if (cust) ({ data: target } = await admin.from('billing_subscriptions').select('id,athlete_id').eq('customer_id', cust.id)
            .eq('method', 'CREDIT_CARD').eq('status', 'pending').is('asaas_subscription_id', null)
            .order('created_at', { ascending: false }).limit(1).maybeSingle().throwOnError());
        }
        if (target) {
          await admin.from('billing_subscriptions').update({ asaas_subscription_id: s.id, status: 'active', updated_at: now }).eq('id', target.id).throwOnError();
          // Recupera cobranças recebidas antes do vínculo da assinatura.
          await admin.from('billing_payments').update({ subscription_id: target.id, athlete_id: target.athlete_id, updated_at: now })
            .eq('env', ENV).eq('asaas_subscription_id', s.id).is('subscription_id', null).throwOnError();
          // Troca de forma de pagamento: encerra a mensalidade anterior
          await finishReplacement(admin, target.id, ENV);
        }
      }
      if (['SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED'].includes(evt.event))
        await admin.from('billing_subscriptions').update({ status: 'canceled', updated_at: now }).eq('asaas_subscription_id', s.id).throwOnError();
    }
    // Checkout pago: se a assinatura ainda não foi vinculada, pelo menos marca como ativa pelo nosso identificador
    if (ck?.id && evt.event === 'CHECKOUT_PAID')
      await admin.from('billing_subscriptions').update({ status: 'active', updated_at: now }).eq('asaas_checkout_id', ck.id).eq('status', 'pending').throwOnError();
    if (ck?.id && ['CHECKOUT_EXPIRED', 'CHECKOUT_CANCELED'].includes(evt.event))
      await admin.from('billing_subscriptions').update({ status: 'expired', updated_at: now }).eq('asaas_checkout_id', ck.id).eq('status', 'pending').throwOnError();
    await admin.from('billing_events').update({ processed_at: now, error: null }).eq('id', evt.id).throwOnError();
  } catch (e) {
    // Mantém o evento pendente e pede nova entrega ao Asaas. Falhar ao registrar
    // o erro também não pode transformar a falha original em HTTP 200.
    try {
      await admin.from('billing_events').update({ error: String((e as any)?.message || e).slice(0, 500) }).eq('id', evt.id).throwOnError();
    } catch { /* O banco pode continuar indisponível. */ }
    return new Response('Processing failed; retry later', { status: 500 });
  }
  return ok();
});
