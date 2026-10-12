// Avisos do Asaas (webhook). Autenticado pelo cabeçalho asaas-access-token = ASAAS_WEBHOOK_TOKEN.
// Cada evento é gravado uma única vez (billing_events.id) e depois aplicado às tabelas de mensalidades.
import { createClient } from 'npm:@supabase/supabase-js@2';

const BASE = Deno.env.get('ASAAS_BASE_URL') || 'https://api-sandbox.asaas.com/v3';
const ENV = BASE.includes('sandbox') ? 'sandbox' : 'production';
const ok = () => new Response('ok', { status: 200 });

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

  const { data: prev } = await admin.from('billing_events').select('processed_at').eq('id', evt.id).maybeSingle();
  if (prev?.processed_at) return ok();
  if (!prev) await admin.from('billing_events').insert({ id: evt.id, event: evt.event, payload: evt });

  try {
    const now = new Date().toISOString();
    const p = evt.payment, s = evt.subscription, ck = evt.checkout;
    if (p?.id) {
      let sub = null;
      if (p.subscription) ({ data: sub } = await admin.from('billing_subscriptions').select('id,athlete_id').eq('asaas_subscription_id', p.subscription).maybeSingle());
      await admin.from('billing_payments').upsert({
        env: ENV, asaas_payment_id: p.id, asaas_subscription_id: p.subscription || null,
        subscription_id: sub?.id || null, athlete_id: sub?.athlete_id || null,
        value_cents: p.value == null ? null : Math.round(Number(p.value) * 100),
        net_cents: p.netValue == null ? null : Math.round(Number(p.netValue) * 100),
        billing_type: p.billingType || null, status: evt.event === 'PAYMENT_DELETED' ? 'DELETED' : (p.status || null),
        due_date: p.dueDate || null, paid_at: p.clientPaymentDate || p.paymentDate || null,
        invoice_url: p.invoiceUrl || null, updated_at: now
      }, { onConflict: 'asaas_payment_id' });
    }
    if (s?.id) {
      if (evt.event === 'SUBSCRIPTION_CREATED') {
        // Pelo identificador nosso (Pix) ou, no cartão via checkout, pelo pagador com cartão pendente
        let target = null;
        if (s.externalReference) ({ data: target } = await admin.from('billing_subscriptions').select('id').eq('id', s.externalReference).maybeSingle());
        if (!target && s.customer) {
          let { data: cust } = await admin.from('billing_customers').select('id').eq('asaas_id', s.customer).maybeSingle();
          // Cliente criado pelo checkout do cartão: identifica pelo CPF/CNPJ
          if (!cust) {
            const r = await fetch(`${BASE}/customers/${s.customer}`, { headers: { access_token: Deno.env.get('ASAAS_API_KEY') || '', 'User-Agent': 'Apollo-Huddle' } });
            const c = r.ok ? await r.json() : null;
            const doc = String(c?.cpfCnpj || '').replace(/\D/g, '');
            if (doc) {
              ({ data: cust } = await admin.from('billing_customers').select('id,asaas_id').eq('env', ENV).eq('cpf_cnpj', doc).maybeSingle());
              if (cust && !(cust as any).asaas_id) await admin.from('billing_customers').update({ asaas_id: s.customer }).eq('id', cust.id);
            }
          }
          if (cust) ({ data: target } = await admin.from('billing_subscriptions').select('id').eq('customer_id', cust.id)
            .eq('method', 'CREDIT_CARD').eq('status', 'pending').is('asaas_subscription_id', null)
            .order('created_at', { ascending: false }).limit(1).maybeSingle());
        }
        if (target) await admin.from('billing_subscriptions').update({ asaas_subscription_id: s.id, status: 'active', updated_at: now }).eq('id', target.id);
      }
      if (['SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED'].includes(evt.event))
        await admin.from('billing_subscriptions').update({ status: 'canceled', updated_at: now }).eq('asaas_subscription_id', s.id);
    }
    // Checkout pago: se a assinatura ainda não foi vinculada, pelo menos marca como ativa pelo nosso identificador
    if (ck?.id && evt.event === 'CHECKOUT_PAID')
      await admin.from('billing_subscriptions').update({ status: 'active', updated_at: now }).eq('asaas_checkout_id', ck.id).eq('status', 'pending');
    if (ck?.id && ['CHECKOUT_EXPIRED', 'CHECKOUT_CANCELED'].includes(evt.event))
      await admin.from('billing_subscriptions').update({ status: 'expired', updated_at: now }).eq('asaas_checkout_id', ck.id).eq('status', 'pending');
    await admin.from('billing_events').update({ processed_at: now, error: null }).eq('id', evt.id);
  } catch (e) {
    await admin.from('billing_events').update({ error: e instanceof Error ? e.message : String(e) }).eq('id', evt.id);
  }
  return ok();
});
