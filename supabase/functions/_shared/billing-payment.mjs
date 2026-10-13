import { calculateQuote } from './billing-rules.mjs';

export const PAID = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH']);
const OPEN = new Set(['PENDING', 'OVERDUE']);
export function brasiliaDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function daysOverdue(due, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due || '') || !/^\d{4}-\d{2}-\d{2}$/.test(today || '')) throw new Error('Data de vencimento inválida.');
  for (const date of [due,today]) { const n=Date.parse(date+'T00:00:00Z'); if (!Number.isFinite(n) || new Date(n).toISOString().slice(0,10)!==date) throw new Error('Data de vencimento inválida.'); }
  return Math.max(0, Math.floor((Date.parse(today+'T00:00:00Z') - Date.parse(due+'T00:00:00Z'))/86400000));
}
function cents(value) {
  const n = Math.round(Number(value)*100);
  if (!Number.isSafeInteger(n) || n < 0 || n > 2147483647) throw new Error('Valor do provedor inválido.');
  return n;
}
export function hostedUrl(url, env) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || parsed.hostname !== (env === 'sandbox' ? 'sandbox.asaas.com' : 'www.asaas.com')) throw new Error('Link de pagamento inválido.');
  return parsed.href;
}
export function quoteColumns(q, today) {
  return {base_cents:q.baseCents,method_adjustment_cents:q.methodAdjustmentCents,principal_cents:q.principalCents,
    fine_cents:q.fineCents,interest_cents:q.interestCents,value_cents:q.totalCents,quote_date:today,quote_state:'current',quote_error:null};
}

// store owns row locking and conditional writes. No credentials/browser state here.
export async function revalidatePayment({store,provider,paymentId,env,today=brasiliaDate(),method,includePix=true}) {
  const lock = crypto.randomUUID();
  const p = await store.claim(paymentId,lock);
  if (!p) throw new Error('Cobrança em atualização. Tente novamente em instantes.');
  let mutationStarted=false;
  try {
    if (p.env !== env) throw new Error('Cobrança pertence a outro ambiente.');
    let remote = await provider.get(p.asaas_payment_id);
    if (remote.id !== p.asaas_payment_id || remote.deleted) throw new Error('Cobrança indisponível.');
    if (PAID.has(remote.status)) {
      await store.recordStatus(p,lock,remote);
      return {paid:true,quote:{...p,value_cents:cents(remote.value),quote_state:p.principal_cents!=null && p.value_cents!==cents(remote.value)?'discrepancy':'settled',status:remote.status},invoiceUrl:null,pix:null};
    }
    if (!OPEN.has(remote.status)) throw new Error('Esta cobrança não está disponível para pagamento.');
    if (PAID.has(p.status)) throw new Error('Pagamento já registrado. Atualize a página.');
    const sub = await store.subscription(p.subscription_id);
    if (!sub || sub.env !== env || remote.subscription !== sub.asaas_subscription_id) throw new Error('Vínculo da cobrança inconsistente.');
    if(sub.automatic_mode==='PIX_AUTOMATIC') {
      const instruction=await store.automaticInstruction(p);
      const latest=instruction?await provider.instruction(instruction.asaas_instruction_id):null;
      if(latest && (latest.id!==instruction.asaas_instruction_id || latest.paymentId!==p.asaas_payment_id))throw new Error('Vínculo da instrução automática inválido.');
      if(!latest || !['REFUSED','CANCELLED'].includes(latest.status))return {automaticDebit:true,quote:p,invoiceUrl:null,pix:null};
      if(method)throw new Error('Uma autorização de valor fixo não permite alterar modalidade ou total por este fluxo.');
      // Explicitly failed instruction: allow the existing title's secure page,
      // preserving its fixed authorized value. Never create a replacement title.
      return {quote:{...p,value_cents:cents(remote.value),status:remote.status},invoiceUrl:hostedUrl(remote.invoiceUrl,env),pix:null};
    }
    if(sub.method==='CREDIT_CARD' && sub.status==='active' && remote.billingType==='CREDIT_CARD' && remote.status==='PENDING')
      return {automaticDebit:true,quote:p,invoiceUrl:null,pix:null};
    const policy = p.policy_snapshot || sub.policy_snapshot;
    const base = p.base_cents ?? sub.base_cents;
    if (policy && base != null) {
      const chosen = method || (remote.billingType === 'CREDIT_CARD' ? 'CREDIT_CARD' : 'PIX');
      if (!['PIX','CREDIT_CARD'].includes(chosen)) throw new Error('Forma de pagamento inválida.');
      if (method && !['PIX','CREDIT_CARD'].includes(remote.billingType)) throw new Error('Atualize a modalidade desta cobrança pela administração.');
      const q = calculateQuote(base,chosen,policy,daysOverdue(remote.dueDate,today));
      if (q.totalCents < 500 || q.totalCents > 2147483647) throw new Error('Total fora dos limites para cobrança.');
      // Disable native extras: this title uses our own progressive calculation.
      if (cents(remote.value) !== q.totalCents || Number(remote.fine?.value || 0) || Number(remote.interest?.value || 0) || Number(remote.discount?.value || 0) || (method && remote.billingType!==chosen)) {
        await store.markUpdating(p,lock);
        mutationStarted=true;
        remote = await provider.update(remote.id,{value:q.totalCents/100,billingType:chosen,
          fine:{value:0,type:'PERCENTAGE'},interest:{value:0,type:'PERCENTAGE'},discount:{value:0,type:'PERCENTAGE'}});
        // Response may race payment settlement. Never overwrite an actual payment.
        remote = await provider.get(remote.id);
        if (PAID.has(remote.status)) {
          await store.recordStatus(p,lock,remote);
          return {paid:true,quote:{...p,value_cents:cents(remote.value),quote_state:p.principal_cents!=null && p.value_cents!==cents(remote.value)?'discrepancy':'settled',status:remote.status},invoiceUrl:null,pix:null};
        }
      }
      if (!OPEN.has(remote.status) || cents(remote.value)!==q.totalCents || remote.deleted || remote.billingType!==chosen || Number(remote.fine?.value||0) || Number(remote.interest?.value||0) || Number(remote.discount?.value||0)) throw new Error('O Asaas ainda não confirmou o total atualizado.');
      const columns={...quoteColumns(q,today),billing_type:remote.billingType,status:remote.status,
        policy_snapshot:policy,package_name:p.package_name || sub.package_name,reference_month:p.reference_month || remote.dueDate.slice(0,7)};
      const saved=await store.finish(p,lock,columns);
      if (!saved) throw new Error('A cobrança mudou durante a atualização. Atualize a página.');
      p.quote_state=columns.quote_state; Object.assign(p,columns); p.method_adjustment_percent=policy.methods[chosen];
    } else {
      if (method) throw new Error('Cobrança anterior sem composição: use a modalidade original.');
      // Existing titles remain under their original provider rules; no invented base.
      Object.assign(p,{value_cents:cents(remote.value),status:remote.status,quote_state:'legacy'});
    }
    const invoiceUrl=hostedUrl(remote.invoiceUrl,env);
    let pix=null;
    if (includePix && ['PIX','BOLETO','UNDEFINED'].includes(remote.billingType)) {
      try { pix=await provider.pix(remote.id); } catch { /* Hosted invoice remains usable. */ }
    }
    return {invoiceUrl,quote:p,pix};
  } catch (e) {
    if (mutationStarted) await store.uncertain(p,lock,String(e.message||e).slice(0,300));
    throw e;
  } finally { await store.release(paymentId,lock); }
}
