// Mensalidades (Asaas): criar, cancelar e sincronizar assinaturas a partir do Huddle.
// Só administração e financeiro (página 'billing' com edição). A chave do Asaas fica
// no segredo ASAAS_API_KEY; ASAAS_BASE_URL padrão = sandbox.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { LOGO_BASE64 } from './logo.ts';
import {calculateQuote,validatePolicy} from '../_shared/billing-rules.mjs';
import {mergePayment} from '../_shared/billing-webhook-merge.mjs';
import {assertEnabled} from '../_shared/billing-pix-automatic.mjs';
import {finishReplacement} from '../_shared/billing-replace.mjs';

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
  const res = await fetch(BASE + path, { ...init, signal:AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json',
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
    await mergePayment(admin,{
      env: ENV, asaas_payment_id: p.id, asaas_subscription_id: p.subscription || sub.asaas_subscription_id,
      subscription_id: sub.id, athlete_id: sub.athlete_id,
      value_cents: Math.round(Number(p.value || 0) * 100), net_cents: p.netValue == null ? null : Math.round(Number(p.netValue) * 100),
      billing_type: p.billingType, status: p.status, due_date: p.dueDate || null,
      paid_at: p.clientPaymentDate || p.paymentDate || null, invoice_url: p.invoiceUrl || null, updated_at: new Date().toISOString()
    }, {subscription:sub,providerPayment:p});
  }
}

// ─── Ativação da forma de pagamento (usada quando a família escolhe na Área do atleta) ───
// deno-lint-ignore no-explicit-any
async function ensureAsaasCustomer(admin: any, customer: any, athleteId: string) {
  if (customer.asaas_id) return customer;
  const c = await asaas('/customers', { method: 'POST', body: JSON.stringify({ name: customer.name, cpfCnpj: customer.cpf_cnpj,
    email: customer.email || undefined, mobilePhone: customer.phone || undefined, externalReference: athleteId, notificationDisabled: false }) });
  const { data } = await admin.from('billing_customers').update({ asaas_id: c.id }).eq('id', customer.id).select().single().throwOnError();
  return data;
}
// deno-lint-ignore no-explicit-any
async function startPix(admin: any, sub: any, customer: any, start?: string) {
  const policy = validatePolicy(sub.policy_snapshot), quote = calculateQuote(sub.base_cents, 'PIX', policy, 0), due = start || nextDue(sub.due_day);
  const c = await ensureAsaasCustomer(admin, customer, sub.athlete_id);
  const s = await asaas('/subscriptions', { method: 'POST', body: JSON.stringify({ customer: c.asaas_id, billingType: 'PIX', value: quote.principalCents / 100,
    nextDueDate: due, cycle: 'MONTHLY', description: sub.description, externalReference: sub.id,
    fine: { value: 0, type: 'PERCENTAGE' }, interest: { value: 0, type: 'PERCENTAGE' }, discount: { value: 0, type: 'PERCENTAGE' } }) });
  await admin.from('billing_subscriptions').update({ method: 'PIX', automatic_mode: null, value_cents: quote.principalCents, asaas_subscription_id: s.id,
    status: 'active', updated_at: new Date().toISOString() }).eq('id', sub.id).throwOnError();
  const pays = await asaas(`/subscriptions/${s.id}/payments`);
  await upsertPayments(admin, { ...sub, asaas_subscription_id: s.id }, pays?.data || []);
  return { nextDueDate: due, invoiceUrl: pays?.data?.[0]?.invoiceUrl || null };
}
// deno-lint-ignore no-explicit-any
async function startCard(admin: any, sub: any, start?: string) {
  const policy = validatePolicy(sub.policy_snapshot), quote = calculateQuote(sub.base_cents, 'CREDIT_CARD', policy, 0), due = start || nextDue(sub.due_day);
  const ck = await asaas('/checkouts', { method: 'POST', body: JSON.stringify({
    billingTypes: ['CREDIT_CARD'], chargeTypes: ['RECURRENT'], minutesToExpire: 1440, externalReference: sub.id,
    callback: { successUrl: `${PANEL}/area-do-atleta.html?pagamento=ok`, cancelUrl: `${PANEL}/area-do-atleta.html?pagamento=cancelado`, expiredUrl: `${PANEL}/area-do-atleta.html?pagamento=expirado` },
    items: [{ name: 'Mensalidade Apollo', description: String(sub.description || '').slice(0, 150), quantity: 1, value: quote.principalCents / 100, imageBase64: LOGO_BASE64 }],
    subscription: { cycle: 'MONTHLY', nextDueDate: `${due} 00:00:00` } }) });
  const link = ck.link || ck.url || ck.checkoutUrl || null;
  await admin.from('billing_subscriptions').update({ method: 'CREDIT_CARD', automatic_mode: null, value_cents: quote.principalCents, status: 'pending',
    asaas_checkout_id: ck.id, checkout_url: link, updated_at: new Date().toISOString() }).eq('id', sub.id).throwOnError();
  return { checkoutUrl: link, nextDueDate: due };
}

// deno-lint-ignore no-explicit-any
async function changeStart(admin: any, old: any) {
  const { data: pays } = await admin.from('billing_payments').select('due_date,status').eq('env', ENV).eq('subscription_id', old.id).not('status', 'in', '(DELETED,REFUNDED)');
  const today = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const open = (pays || []).filter((p: any) => ['PENDING', 'OVERDUE'].includes(p.status)).map((p: any) => String(p.due_date)).sort();
  if (open.some((d: string) => d < today)) throw new Error('Pague a mensalidade em atraso antes de trocar a forma de pagamento.');
  if (open.length) return open[0];
  const last = (pays || []).map((p: any) => String(p.due_date)).sort().pop();
  let next = nextDue(old.due_day);
  if (last && next <= last) { const d = new Date(`${last}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1, old.due_day); next = ymd(d); }
  return next;
}
const methodKey = (s: any) => s.automatic_mode === 'PIX_AUTOMATIC' ? 'PIX_AUTOMATIC' : s.method;

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
  let input: any;
  try { input = await request.json(); } catch { return json(400, { error: 'JSON inválido' }); }
  const admin = createClient(url, secret!, { auth: { persistSession: false, autoRefreshToken: false } });

  // Escolha feita por quem paga (atleta adulto ou responsável), dentro da Área do atleta
  if (input.action === 'choice_quote' || input.action === 'choose') {
    if (typeof input.subscriptionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.subscriptionId)) return json(400, { error: 'Solicitação inválida.' });
    const { data: allowed } = await caller.rpc('billing_portal_can_manage_subscription', { p_subscription_id: input.subscriptionId });
    if (!allowed) return json(403, { error: 'Mensalidade não vinculada a esta conta.' });
    try {
      const { data: sub } = await admin.from('billing_subscriptions').select('*').eq('id', input.subscriptionId).eq('env', ENV).single().throwOnError();
      const changing = sub.status !== 'awaiting_choice';
      if (changing && !['active', 'pending'].includes(sub.status)) return json(409, { error: 'Esta mensalidade não está ativa.' });
      const current = changing ? methodKey(sub) : null;
      const policy = validatePolicy(sub.policy_snapshot);
      const { data: config } = await admin.from('billing_pix_automatic_config').select('*').eq('env', ENV).maybeSingle();
      let pixAuto = false; try { assertEnabled(config); pixAuto = true; } catch { pixAuto = false; }
      if (input.action === 'choice_quote') {
        const { data: inFlight } = await admin.from('billing_subscriptions').select('id,method,automatic_mode,checkout_url').eq('replaces_id', sub.id).eq('env', ENV).in('status', ['pending', 'choosing']).maybeSingle();
        return json(200, { dueDay: sub.due_day, baseCents: sub.base_cents, current, pending: inFlight ? { method: methodKey(inFlight), checkoutUrl: inFlight.checkout_url } : null, options: [
          ...(pixAuto ? [{ method: 'PIX_AUTOMATIC', totalCents: calculateQuote(sub.base_cents, 'PIX', policy, 0).totalCents }] : []),
          { method: 'CREDIT_CARD', totalCents: calculateQuote(sub.base_cents, 'CREDIT_CARD', policy, 0).totalCents },
          { method: 'PIX', totalCents: calculateQuote(sub.base_cents, 'PIX', policy, 0).totalCents }].filter(o => o.method !== current) });
      }
      if (changing) {
        if (!['PIX', 'CREDIT_CARD', 'PIX_AUTOMATIC'].includes(input.method) || input.method === current) return json(400, { error: 'Escolha uma forma diferente da atual.' });
        if (input.method === 'PIX_AUTOMATIC' && !pixAuto) return json(409, { error: 'O Pix Automático ainda não está disponível.' });
        const start = await changeStart(admin, sub);
        // Uma troca por vez: a anterior que ainda não foi concluída é descartada
        const { data: prev } = await admin.from('billing_subscriptions').select('*').eq('replaces_id', sub.id).eq('env', ENV).in('status', ['pending', 'choosing']);
        for (const p of prev || []) {
          if (p.asaas_checkout_id) { try { await asaas(`/checkouts/${encodeURIComponent(p.asaas_checkout_id)}/cancel`, { method: 'POST' }); } catch { /* checkout já expirado */ } }
          await admin.from('billing_subscriptions').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', p.id);
        }
        const { data: next } = await admin.from('billing_subscriptions').insert({ env: ENV, athlete_id: sub.athlete_id, customer_id: sub.customer_id,
          method: input.method === 'CREDIT_CARD' ? 'CREDIT_CARD' : 'PIX', value_cents: sub.value_cents, base_cents: sub.base_cents, base_override_reason: sub.base_override_reason,
          package_name: sub.package_name, policy_version: sub.policy_version, policy_snapshot: sub.policy_snapshot, due_day: sub.due_day, description: sub.description,
          created_by: u.user.id, status: 'choosing', replaces_id: sub.id }).select().single().throwOnError();
        try {
          if (input.method === 'PIX') {
            const { data: customer } = await admin.from('billing_customers').select('*').eq('id', sub.customer_id).single().throwOnError();
            const r = await startPix(admin, next, customer, start);
            await finishReplacement(admin, next.id, ENV);
            return json(200, { ok: true, changed: true, method: 'PIX', ...r });
          }
          if (input.method === 'CREDIT_CARD') return json(200, { ok: true, changed: true, method: 'CREDIT_CARD', ...(await startCard(admin, next, start)) });
          await admin.from('billing_subscriptions').update({ automatic_mode: 'PIX_AUTOMATIC', status: 'pending', updated_at: new Date().toISOString() }).eq('id', next.id).throwOnError();
          return json(200, { ok: true, changed: true, method: 'PIX_AUTOMATIC', subscriptionId: next.id, authorizationRequired: true });
        } catch (e) {
          await admin.from('billing_subscriptions').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', next.id).is('asaas_subscription_id', null);
          throw e;
        }
      }
      // Trava a escolha: só uma requisição passa de 'awaiting_choice' para 'choosing'
      const { data: locked } = await admin.from('billing_subscriptions').update({ status: 'choosing', updated_at: new Date().toISOString() })
        .eq('id', sub.id).eq('status', 'awaiting_choice').select('id').throwOnError();
      if (!locked?.length) return json(409, { error: 'A escolha já está sendo processada.' });
      try {
        const { data: customer } = await admin.from('billing_customers').select('*').eq('id', sub.customer_id).single().throwOnError();
        if (input.method === 'PIX') return json(200, { ok: true, method: 'PIX', ...(await startPix(admin, sub, customer)) });
        if (input.method === 'CREDIT_CARD') return json(200, { ok: true, method: 'CREDIT_CARD', ...(await startCard(admin, sub)) });
        if (input.method === 'PIX_AUTOMATIC') {
          if (!pixAuto) throw new Error('O Pix Automático ainda não está disponível.');
          await admin.from('billing_subscriptions').update({ method: 'PIX', automatic_mode: 'PIX_AUTOMATIC', status: 'pending', updated_at: new Date().toISOString() }).eq('id', sub.id).throwOnError();
          return json(200, { ok: true, method: 'PIX_AUTOMATIC', authorizationRequired: true });
        }
        throw new Error('Forma de pagamento inválida.');
      } catch (e) {
        // Devolve a mensalidade para a escolha se nada foi criado no Asaas
        const { data: now } = await admin.from('billing_subscriptions').select('asaas_subscription_id,asaas_checkout_id').eq('id', sub.id).single();
        if (!now?.asaas_subscription_id && !now?.asaas_checkout_id) await admin.from('billing_subscriptions').update({ status: 'awaiting_choice' }).eq('id', sub.id).eq('status', 'choosing');
        throw e;
      }
    } catch (e) { return json(409, { error: e instanceof Error ? e.message : String(e) }); }
  }

  const { data: access } = await caller.rpc('v2_my_access');
  if (access?.pages?.billing?.edit !== true) return json(403, { error: 'Apenas administração e financeiro gerenciam mensalidades.' });

  try {
    if (input.action === 'create') {
      const payer = input.payer || {};
      const doc = digits(payer.cpfCnpj), value = Math.round(Number(input.valueCents));
      const day = Number(input.dueDay), family = !input.method || input.method === 'FAMILY', automatic = input.method === 'PIX_AUTOMATIC', method = automatic || family ? 'PIX' : String(input.method);
      const name = String(payer.name || '').trim(), description = String(input.description || '').trim().slice(0, 200);
      if (!input.athleteId || ![11, 14].includes(doc.length) || !name || !Number.isSafeInteger(Number(input.valueCents)) || !(value >= 500 && value <= 2147483647) || !Number.isInteger(day) || !(day >= 1 && day <= 28)
        || !['PIX', 'CREDIT_CARD'].includes(method) || !description) return json(400, { error: 'Dados da mensalidade incompletos ou inválidos.' });
      const { data: athlete } = await admin.from('athletes').select('id,full_name,payment_plan').eq('id', input.athleteId).maybeSingle().throwOnError();
      if (!athlete) return json(404, { error: 'Atleta não encontrado.' });
      const raw=String(athlete.payment_plan||'');
      const amount=(raw.match(/R\$\s*([\d.]+,\d{2})/)||[])[1];
      const packageBase=amount?Math.round(Number(amount.replace(/\./g,'').replace(',','.'))*100):0;
      const override=String(input.baseOverrideReason||'').trim().slice(0,300);
      if((!packageBase || packageBase!==value) && !override)return json(400,{error:'Informe o motivo do valor individual diferente do pacote.'});
      const {data:rule}=await admin.from('billing_policy_versions').select('version,policy').order('version',{ascending:false}).limit(1).single().throwOnError();
      const policy=validatePolicy(rule.policy),quote=calculateQuote(value,method,policy,0);
      if(automatic){const {data:config}=await admin.from('billing_pix_automatic_config').select('*').eq('env',ENV).single().throwOnError();assertEnabled(config);}
      if(quote.totalCents<500 || quote.totalCents>2147483647)return json(400,{error:'Preço final fora dos limites da cobrança.'});
      const { data: open } = await admin.from('billing_subscriptions').select('id').eq('athlete_id', athlete.id)
        .eq('env', ENV).in('status', ['pending', 'active', 'awaiting_choice', 'choosing']).limit(1).throwOnError();
      if (open?.length) return json(409, { error: 'Este atleta já tem uma mensalidade ativa ou aguardando a escolha da forma de pagamento.' });

      // Pagador: reaproveita pelo CPF/CNPJ. No Pix já criamos o cliente no Asaas; no cartão, o próprio
      // checkout do Asaas coleta endereço e cria o cliente (vinculado depois pelo aviso de assinatura).
      let { data: customer } = await admin.from('billing_customers').select('*').eq('env', ENV).eq('cpf_cnpj', doc).maybeSingle().throwOnError();
      if (!customer && (method === 'CREDIT_CARD' || family)) {
        const { data: saved, error } = await admin.from('billing_customers').insert({ env: ENV, name, cpf_cnpj: doc,
          email: payer.email || null, phone: digits(payer.phone) || null }).select().single();
        if (error) throw error;
        customer = saved;
      }
      if (method === 'PIX' && !family && !customer?.asaas_id) {
        const c = await asaas('/customers', { method: 'POST', body: JSON.stringify({
          name, cpfCnpj: doc, email: payer.email || undefined, mobilePhone: digits(payer.phone) || undefined,
          externalReference: athlete.id, notificationDisabled: false }) });
        const { data: saved, error } = await admin.from('billing_customers').upsert({ env: ENV, asaas_id: c.id, name, cpf_cnpj: doc,
          email: payer.email || null, phone: digits(payer.phone) || null }, { onConflict: 'env,cpf_cnpj' }).select().single();
        if (error) throw error;
        customer = saved;
      }

      const { data: sub, error: subErr } = await admin.from('billing_subscriptions').insert({ env: ENV, athlete_id: athlete.id,
        customer_id: customer.id, method, value_cents: quote.principalCents,base_cents:value,base_override_reason:override||null,package_name:raw||'Valor individual',
        policy_version:rule.version,policy_snapshot:policy,automatic_mode:automatic?'PIX_AUTOMATIC':null,due_day: day, description, created_by: u.user.id,
        ...(family ? { status: 'awaiting_choice' } : {}) }).select().single();
      if (subErr) throw subErr;
      const due = nextDue(day);
      // Intent only: Journey 3 authorization is created later by the payer after
      // explicit first-payment/recurring-debit consent. Never create ordinary PIX.
      if(automatic)return json(200,{ok:true,id:sub.id,method:'PIX_AUTOMATIC',authorizationRequired:true});
      if(family)return json(200,{ok:true,id:sub.id,method:'FAMILY',awaitingChoice:true,nextDueDate:due});
      try {
      if (method === 'PIX') {
        const s = await asaas('/subscriptions', { method: 'POST', body: JSON.stringify({ customer: customer.asaas_id,
          billingType: 'PIX', value: quote.principalCents / 100, nextDueDate: due, cycle: 'MONTHLY', description, externalReference: sub.id,
          fine:{value:0,type:'PERCENTAGE'},interest:{value:0,type:'PERCENTAGE'},discount:{value:0,type:'PERCENTAGE'} }) });
        await admin.from('billing_subscriptions').update({ asaas_subscription_id: s.id, status: 'active', updated_at: new Date().toISOString() }).eq('id', sub.id).throwOnError();
        const pays = await asaas(`/subscriptions/${s.id}/payments`);
        await upsertPayments(admin, { ...sub, asaas_subscription_id: s.id }, pays?.data || []);
        return json(200, { ok: true, id: sub.id, method, nextDueDate: due, invoiceUrl: pays?.data?.[0]?.invoiceUrl || null });
      }

      // Cartão: página segura do Asaas; o responsável digita o cartão uma vez e as próximas cobranças são automáticas
      const ck = await asaas('/checkouts', { method: 'POST', body: JSON.stringify({
        billingTypes: ['CREDIT_CARD'], chargeTypes: ['RECURRENT'], minutesToExpire: 1440,
        // Sem customerData: o Asaas exige endereço completo; o responsável preenche os dados na própria página
        externalReference: sub.id,
        callback: { successUrl: `${PANEL}/area-do-atleta.html?pagamento=ok`, cancelUrl: `${PANEL}/area-do-atleta.html?pagamento=cancelado`,
          expiredUrl: `${PANEL}/area-do-atleta.html?pagamento=expirado` },
        items: [{ name: 'Mensalidade Apollo', description: `${description.slice(0,100)} · Base R$ ${(value/100).toFixed(2)} · ajuste ${(policy.methods.CREDIT_CARD).toFixed(2)}%`, quantity: 1, value: quote.principalCents / 100, imageBase64: LOGO_BASE64 }],
        subscription: { cycle: 'MONTHLY', nextDueDate: `${due} 00:00:00` } }) });
      const link = ck.link || ck.url || ck.checkoutUrl || null;
      await admin.from('billing_subscriptions').update({ asaas_checkout_id: ck.id, checkout_url: link, updated_at: new Date().toISOString() }).eq('id', sub.id).throwOnError();
      return json(200, { ok: true, id: sub.id, method, nextDueDate: due, checkoutUrl: link });
      } catch (e) {
        // Provider may have accepted creation before a network/database failure.
        // Preserve local intent to block accidental duplicate recurring subscriptions.
        try{await admin.from('billing_subscriptions').update({creation_error:String((e as Error).message||e).slice(0,300)}).eq('id',sub.id).throwOnError();}catch{}
        throw e;
      }
    }

    if (input.action === 'cancel' || input.action === 'sync') {
      const { data: sub } = await admin.from('billing_subscriptions').select('*').eq('id', input.id).eq('env',ENV).maybeSingle().throwOnError();
      if (!sub) return json(404, { error: 'Mensalidade não encontrada.' });
      if(sub.automatic_mode==='PIX_AUTOMATIC' && input.action==='cancel')return json(409,{error:'Cancele pelo fluxo de autorização do Pix Automático para confirmar a interrupção no provedor.'});
      if (input.action === 'cancel' && sub.status === 'awaiting_choice') {
        await admin.from('billing_subscriptions').update({ status: 'canceled', updated_at: new Date().toISOString() }).eq('id', sub.id).throwOnError();
        return json(200, { ok: true });
      }
      if (input.action === 'cancel') {
        if (!sub.asaas_subscription_id && sub.asaas_checkout_id) {
          await asaas(`/checkouts/${encodeURIComponent(sub.asaas_checkout_id)}/cancel`,{method:'POST'});
          const {data:fresh}=await admin.from('billing_subscriptions').select('*').eq('id',sub.id).single().throwOnError();
          if(fresh.asaas_subscription_id)sub.asaas_subscription_id=fresh.asaas_subscription_id;
        }
        if (!sub.asaas_subscription_id && !sub.asaas_checkout_id) return json(409,{error:'A criação tem resultado incerto. Reconcilie a assinatura no Asaas antes de cancelar ou emitir outra.'});
        if (sub.asaas_subscription_id) await asaas(`/subscriptions/${sub.asaas_subscription_id}`, { method: 'DELETE' });
        await admin.from('billing_subscriptions').update({ status: 'canceled', updated_at: new Date().toISOString() }).eq('id', sub.id).throwOnError();
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
