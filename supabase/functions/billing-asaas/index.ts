// Mensalidades (Asaas): criar, cancelar e sincronizar assinaturas a partir do Huddle.
// Só administração e financeiro (página 'billing' com edição). A chave do Asaas fica
// no segredo ASAAS_API_KEY; ASAAS_BASE_URL padrão = sandbox.
import { createClient } from 'npm:@supabase/supabase-js@2';

const origin = 'https://apollovoleibol.github.io';
const cors = { 'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', ...cors } });

const BASE = Deno.env.get('ASAAS_BASE_URL') || 'https://api-sandbox.asaas.com/v3';
const ENV = BASE.includes('sandbox') ? 'sandbox' : 'production';
const PANEL = 'https://apollovoleibol.github.io/management_panel_v2';

async function asaas(path: string, init: RequestInit = {}) {
  const key = Deno.env.get('ASAAS_API_KEY');
  if (!key) throw new Error('Chave do Asaas não configurada (segredo ASAAS_API_KEY).');
  const res = await fetch(BASE + path, { ...init, headers: { 'Content-Type': 'application/json',
    'User-Agent': 'Apollo-Huddle', access_token: key, ...(init.headers || {}) } });
  const text = await res.text();
  let body: any = null; try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  if (!res.ok) {
    const msg = body?.errors?.map((e: any) => e.description).join(' ') || `Asaas respondeu ${res.status}`;
    throw new Error(msg);
  }
  return body;
}

const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '');
const ymd = (d: Date) => d.toISOString().slice(0, 10);
// Próximo vencimento no dia escolhido (hoje no fuso de Brasília conta como "já passou" se for o mesmo dia)
function nextDue(day: number) {
  const now = new Date(Date.now() - 3 * 3600e3);
  let d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day));
  if (d <= now) d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, day));
  return ymd(d);
}

// deno-lint-ignore no-explicit-any
async function upsertPayments(admin: any, sub: any, list: any[]) {
  for (const p of list) {
    await admin.from('billing_payments').upsert({
      env: ENV, asaas_payment_id: p.id, asaas_subscription_id: p.subscription || sub.asaas_subscription_id,
      subscription_id: sub.id, athlete_id: sub.athlete_id,
      value_cents: Math.round(Number(p.value || 0) * 100), net_cents: p.netValue == null ? null : Math.round(Number(p.netValue) * 100),
      billing_type: p.billingType, status: p.status, due_date: p.dueDate || null,
      paid_at: p.clientPaymentDate || p.paymentDate || null, invoice_url: p.invoiceUrl || null, updated_at: new Date().toISOString()
    }, { onConflict: 'asaas_payment_id' });
  }
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });
  if (request.headers.get('Origin') !== origin) return json(403, { error: 'Origin not allowed' });
  const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return json(401, { error: 'Sessão ausente. Entre novamente.' });
  const url = Deno.env.get('SUPABASE_URL')!;
  const publishable = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}').default || Deno.env.get('SUPABASE_ANON_KEY');
  const secret = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const caller = createClient(url, publishable!, { global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false } });
  const { data: u } = await caller.auth.getUser(token);
  if (!u?.user) return json(401, { error: 'Sessão inválida. Entre novamente.' });
  const { data: access } = await caller.rpc('v2_my_access');
  if (access?.pages?.billing?.edit !== true) return json(403, { error: 'Apenas administração e financeiro gerenciam mensalidades.' });
  const admin = createClient(url, secret!, { auth: { persistSession: false, autoRefreshToken: false } });

  let input: any;
  try { input = await request.json(); } catch { return json(400, { error: 'JSON inválido' }); }

  try {
    if (input.action === 'create') {
      const payer = input.payer || {};
      const doc = digits(payer.cpfCnpj), value = Math.round(Number(input.valueCents));
      const day = Number(input.dueDay), method = String(input.method);
      const name = String(payer.name || '').trim(), description = String(input.description || '').trim().slice(0, 200);
      if (!input.athleteId || ![11, 14].includes(doc.length) || !name || !(value >= 500) || !(day >= 1 && day <= 28)
        || !['PIX', 'CREDIT_CARD'].includes(method) || !description) return json(400, { error: 'Dados da mensalidade incompletos ou inválidos.' });
      const { data: athlete } = await admin.from('athletes').select('id,full_name').eq('id', input.athleteId).maybeSingle();
      if (!athlete) return json(404, { error: 'Atleta não encontrado.' });
      const { data: open } = await admin.from('billing_subscriptions').select('id').eq('athlete_id', athlete.id)
        .eq('env', ENV).in('status', ['pending', 'active']).limit(1);
      if (open?.length) return json(409, { error: 'Este atleta já tem uma mensalidade ativa ou aguardando o cartão.' });

      // Pagador: reaproveita pelo CPF/CNPJ
      let { data: customer } = await admin.from('billing_customers').select('*').eq('env', ENV).eq('cpf_cnpj', doc).maybeSingle();
      if (!customer?.asaas_id) {
        const c = await asaas('/customers', { method: 'POST', body: JSON.stringify({
          name, cpfCnpj: doc, email: payer.email || undefined, mobilePhone: digits(payer.phone) || undefined,
          externalReference: athlete.id, notificationDisabled: false }) });
        const { data: saved, error } = await admin.from('billing_customers').upsert({ env: ENV, asaas_id: c.id, name, cpf_cnpj: doc,
          email: payer.email || null, phone: digits(payer.phone) || null }, { onConflict: 'env,cpf_cnpj' }).select().single();
        if (error) throw error;
        customer = saved;
      }

      const { data: sub, error: subErr } = await admin.from('billing_subscriptions').insert({ env: ENV, athlete_id: athlete.id,
        customer_id: customer.id, method, value_cents: value, due_day: day, description, created_by: u.user.id }).select().single();
      if (subErr) throw subErr;
      const due = nextDue(day);

      if (method === 'PIX') {
        const s = await asaas('/subscriptions', { method: 'POST', body: JSON.stringify({ customer: customer.asaas_id,
          billingType: 'PIX', value: value / 100, nextDueDate: due, cycle: 'MONTHLY', description, externalReference: sub.id }) });
        await admin.from('billing_subscriptions').update({ asaas_subscription_id: s.id, status: 'active', updated_at: new Date().toISOString() }).eq('id', sub.id);
        const pays = await asaas(`/subscriptions/${s.id}/payments`);
        await upsertPayments(admin, { ...sub, asaas_subscription_id: s.id }, pays?.data || []);
        return json(200, { ok: true, id: sub.id, method, nextDueDate: due, invoiceUrl: pays?.data?.[0]?.invoiceUrl || null });
      }

      // Cartão: página segura do Asaas; o responsável digita o cartão uma vez e as próximas cobranças são automáticas
      const ck = await asaas('/checkouts', { method: 'POST', body: JSON.stringify({
        billingTypes: ['CREDIT_CARD'], chargeTypes: ['RECURRENT'], minutesToExpire: 1440, customer: customer.asaas_id,
        externalReference: sub.id,
        callback: { successUrl: `${PANEL}/area-do-atleta.html?pagamento=ok`, cancelUrl: `${PANEL}/area-do-atleta.html?pagamento=cancelado`,
          expiredUrl: `${PANEL}/area-do-atleta.html?pagamento=expirado` },
        items: [{ name: 'Mensalidade Apollo', description, quantity: 1, value: value / 100 }],
        subscription: { cycle: 'MONTHLY', nextDueDate: `${due} 00:00:00` } }) });
      const link = ck.link || ck.url || ck.checkoutUrl || null;
      await admin.from('billing_subscriptions').update({ asaas_checkout_id: ck.id, checkout_url: link, updated_at: new Date().toISOString() }).eq('id', sub.id);
      return json(200, { ok: true, id: sub.id, method, nextDueDate: due, checkoutUrl: link, checkout: link ? undefined : ck });
    }

    if (input.action === 'cancel' || input.action === 'sync') {
      const { data: sub } = await admin.from('billing_subscriptions').select('*').eq('id', input.id).maybeSingle();
      if (!sub) return json(404, { error: 'Mensalidade não encontrada.' });
      if (input.action === 'cancel') {
        if (sub.asaas_subscription_id) await asaas(`/subscriptions/${sub.asaas_subscription_id}`, { method: 'DELETE' });
        await admin.from('billing_subscriptions').update({ status: 'canceled', updated_at: new Date().toISOString() }).eq('id', sub.id);
        return json(200, { ok: true });
      }
      if (sub.asaas_subscription_id) {
        const pays = await asaas(`/subscriptions/${sub.asaas_subscription_id}/payments`);
        await upsertPayments(admin, sub, pays?.data || []);
      }
      return json(200, { ok: true });
    }
    return json(400, { error: 'Ação desconhecida.' });
  } catch (e) {
    return json(502, { error: e instanceof Error ? e.message : String(e) });
  }
});
