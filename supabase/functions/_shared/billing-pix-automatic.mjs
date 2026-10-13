import {calculateQuote} from './billing-rules.mjs';
// Verified Asaas Journey 3 API. The first QR creates a NEW immediate payment.
// Ordinary subscriptions must never be converted by creating another first QR.
export function assertEnabled(config) {
  if (!config?.enabled || !config?.sandbox_validated || config?.eligibility !== 'ELIGIBLE')
    throw new Error('Pix Automático aguardando elegibilidade da conta e validação no sandbox.');
}
export function authorizationRequest(sub, customerId, today, contractId) {
  if (sub?.automatic_mode !== 'PIX_AUTOMATIC' || sub.status !== 'pending' || sub.method !== 'PIX'
      || sub.asaas_subscription_id || sub.asaas_checkout_id)
    throw new Error('Assinatura existente exige reconciliação antes de migrar para Pix Automático.');
  if (!/^cus_[A-Za-z0-9_]+$/.test(customerId || '') || !contractId || contractId.length > 35)
    throw new Error('Identificação da autorização inválida.');
  if (!Number.isInteger(sub.value_cents) || sub.value_cents < 500 || sub.value_cents > 2147483647
      || !Number.isInteger(sub.due_day) || sub.due_day < 1 || sub.due_day > 28)
    throw new Error('Valor ou vencimento da autorização inválido.');
  const date=new Date(`${today}T00:00:00Z`);
  if(Number.isNaN(date.getTime()) || date.toISOString().slice(0,10)!==today)throw new Error('Data inválida.');
  const start=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,sub.due_day));
  // Conservative calendar lead time; business-day/holiday timing is a sandbox gate.
  if((start.getTime()-date.getTime())/86400000<14)throw new Error('Antecedência insuficiente para o próximo débito; escolha nova data com a administração.');
  return {frequency:'MONTHLY',contractId,customerId,startDate:start.toISOString().slice(0,10),value:sub.value_cents/100,
    paymentCreationMode:'SUBSCRIPTION',retryPolicy:'NOT_ALLOWED',description:'Mensalidade Apollo',
    immediateQrCode:{expirationSeconds:3600,originalValue:sub.value_cents/100,description:`Mensalidade Apollo ${today.slice(0,7)}`}};
}
export function confirmedReady(row,a,s) {
  return Boolean(a?.status==='ACTIVE' && a.paymentCreationMode==='SUBSCRIPTION' && a.frequency==='MONTHLY'
    && a.contractId===row.contract_id && a.customerId===row.customer_asaas_id && Math.round(a.value*100)===row.value_cents
    && a.startDate===row.start_date && a.subscriptionId && s?.id===a.subscriptionId && !s.deleted
    && s.customer===row.customer_asaas_id && s.billingType==='PIX' && s.cycle==='MONTHLY'
    && Math.round(s.value*100)===row.value_cents && s.status==='ACTIVE');
}
export function shouldSuppressManual(status,ready,instructionStatus) {
  return status==='ACTIVE' && ready===true && instructionStatus==='SCHEDULED';
}
export function firstPaymentCorrelation(transaction,payment) {
  const id=transaction?.conciliationIdentifier || transaction?.qrCode?.conciliationIdentifier;
  if(transaction?.id!==payment?.pixTransaction || transaction?.payment!==payment?.id || typeof id!=='string' || !id)
    throw new Error('A transação Pix não identifica esta cobrança e seu QR original.');
  return id;
}
export async function firstPaymentContext(admin,api,p,env) {
  if(!p.pixTransaction)return {subscription:null,conciliationId:null};
  const transaction=await api(`/pix/transactions/${encodeURIComponent(p.pixTransaction)}`);
  const conciliationId=firstPaymentCorrelation(transaction,p);
  const {data:a}=await admin.from('billing_pix_authorizations').select('*').eq('env',env).eq('conciliation_id',conciliationId).maybeSingle().throwOnError();
  if(!a)return {subscription:null,conciliationId};
  const providerPayment=p.customer?p:await api(`/payments/${encodeURIComponent(p.id)}`);
  if(providerPayment.id!==p.id || providerPayment.customer!==a.customer_asaas_id)throw new Error('Cliente do primeiro pagamento diverge da autorização.');
  const {data:sub}=await admin.from('billing_subscriptions').select('*').eq('env',env).eq('id',a.subscription_id).single().throwOnError();
  if(sub.automatic_mode!=='PIX_AUTOMATIC' || p.subscription)throw new Error('O pagamento inicial tem vínculo de assinatura inconsistente.');
  return {subscription:sub,conciliationId,authorization:a};
}
export async function reconcileFirstPayment(admin,row,sub,env) {
  if(!row.conciliation_id)return;
  const {data:payments}=await admin.from('billing_payments').select('*').eq('env',env).eq('pix_conciliation_id',row.conciliation_id).throwOnError();
  if(payments?.length>1)throw new Error('Mais de uma cobrança vinculada ao QR inicial; revisão necessária.');
  for(const p of payments || []) {
    if(p.subscription_id && p.subscription_id!==sub.id)throw new Error('Primeiro Pix já está vinculado a outra mensalidade.');
    if(row.initial_payment_id && row.initial_payment_id!==p.asaas_payment_id)throw new Error('Mais de um pagamento atribuído ao mesmo QR inicial.');
    const q=calculateQuote(sub.base_cents,'PIX',sub.policy_snapshot,0);
    if(q.principalCents!==row.value_cents)throw new Error('Composição inicial diverge do consentimento.');
    const columns={subscription_id:sub.id,athlete_id:sub.athlete_id,base_cents:q.baseCents,method_adjustment_cents:q.methodAdjustmentCents,
      principal_cents:q.principalCents,fine_cents:0,interest_cents:0,policy_snapshot:sub.policy_snapshot,package_name:sub.package_name,
      reference_month:row.first_competence,quote_state:p.value_cents!==row.value_cents?'discrepancy':['RECEIVED','CONFIRMED','RECEIVED_IN_CASH'].includes(p.status)?'settled':'current'};
    let query=admin.from('billing_payments').update(columns).eq('id',p.id).eq('env',env).eq('status',p.status).eq('value_cents',p.value_cents).is('quote_lock',null);
    if(p.updated_at)query=query.eq('updated_at',p.updated_at);
    const {data:written}=await query.select('id').maybeSingle().throwOnError();if(!written)throw new Error('Primeiro pagamento mudou durante conciliação.');
    await admin.from('billing_pix_authorizations').update({initial_payment_id:p.asaas_payment_id,initial_payment_status:p.status})
      .eq('id',row.id).eq('env',env).throwOnError();
  }
}
export function authorizationView(row) {
  const created=row?.provider_status==='CREATED';
  return {status:row?.state || 'UNAVAILABLE',authorizationStatus:row?.provider_status || null,ready:row?.state==='ACTIVE' && row?.recurrence_confirmed===true,
    valueCents:row?.value_cents || null,firstCompetence:row?.first_competence || null,firstPaymentStatus:row?.initial_payment_status || null,startDate:row?.start_date || null,
    qr:created && row?.qr_payload?{payload:row.qr_payload,encodedImage:row.qr_image || null,expirationDate:row.qr_expiration || null}:null,
    message:row?.last_error || null};
}
export async function refreshAuthorization(admin,api,row,env) {
  const a=await api(`/pix/automatic/authorizations/${encodeURIComponent(row.asaas_authorization_id)}`);
  if(a.id!==row.asaas_authorization_id || a.customerId!==row.customer_asaas_id || a.contractId!==row.contract_id
      || a.paymentCreationMode!=='SUBSCRIPTION' || a.frequency!=='MONTHLY' || Math.round(a.value*100)!==row.value_cents
      || a.startDate!==row.start_date || !['CREATED','ACTIVE','CANCELLED','EXPIRED','REFUSED'].includes(a.status))
    throw new Error('Autorização retornada pelo Asaas não corresponde à solicitação.');
  const {data:sub}=await admin.from('billing_subscriptions').select('*').eq('id',row.subscription_id).eq('env',env).single().throwOnError();
  if(sub.automatic_mode!=='PIX_AUTOMATIC' || (sub.asaas_subscription_id && sub.asaas_subscription_id!==a.subscriptionId))throw new Error('Vínculo de recorrência inconsistente.');
  const s=a.status==='ACTIVE' && a.subscriptionId?await api(`/subscriptions/${encodeURIComponent(a.subscriptionId)}`):null;
  const ready=confirmedReady(row,a,s) && ['pending','active'].includes(sub.status);
  const state=a.status==='ACTIVE'?(ready?'ACTIVE':'RECONCILING'):a.status;
  const conciliationId=a.immediateQrCode?.conciliationIdentifier || row.conciliation_id || null;
  if(row.conciliation_id && conciliationId!==row.conciliation_id)throw new Error('Identificador de conciliação inicial foi alterado pelo provedor.');
  const update={provider_status:a.status,state,recurrence_confirmed:ready,asaas_subscription_id:a.subscriptionId || null,
    qr_payload:a.payload || null,qr_image:a.encodedImage || null,qr_expiration:a.immediateQrCode?.expirationDate || null,
    conciliation_id:conciliationId,last_error:ready?null:state==='RECONCILING'?'Confirmação da recorrência pendente.':null,updated_at:new Date().toISOString()};
  if(ready) {
    const {data:linked}=await admin.from('billing_subscriptions').update({asaas_subscription_id:a.subscriptionId,status:'active',updated_at:update.updated_at})
      .eq('id',sub.id).eq('env',env).eq('automatic_mode','PIX_AUTOMATIC').eq('status',sub.status).select('id').maybeSingle().throwOnError();
    if(!linked)throw new Error('Mensalidade mudou durante ativação.');
  }
  let save=admin.from('billing_pix_authorizations').update(update).eq('id',row.id).eq('env',env).eq('updated_at',row.updated_at).eq('state',row.state);
  save=row.provider_status==null?save.is('provider_status',null):save.eq('provider_status',row.provider_status);
  const {data:saved}=await save.select('*').maybeSingle().throwOnError();
  if(!saved)throw new Error('Autorização mudou durante reconciliação. Atualize novamente.');
  if(ready) {
    await admin.from('billing_payments').update({subscription_id:sub.id,athlete_id:sub.athlete_id})
      .eq('env',env).eq('asaas_subscription_id',a.subscriptionId).is('subscription_id',null).throwOnError();
    if(sub.replaces_id){const {finishReplacement}=await import('./billing-replace.mjs');await finishReplacement(admin,sub.id,env);}
  }
  await reconcileFirstPayment(admin,saved,sub,env);
  return saved;
}
export async function applyPixAutomaticEvent(admin,api,evt,env) {
  if(!evt.event?.startsWith('PIX_AUTOMATIC_RECURRING_'))return false;
  if(evt.event==='PIX_AUTOMATIC_RECURRING_ELIGIBILITY_UPDATED') {
    const {data:c}=await admin.from('billing_pix_automatic_config').select('*').eq('env',env).single().throwOnError();
    if(!c.account_id || evt.account?.id!==c.account_id)throw new Error('Conta da elegibilidade Pix Automático não confirmada.');
    if(!['ELIGIBLE','INELIGIBLE'].includes(evt.eligibility?.status))throw new Error('Elegibilidade inválida.');
    await admin.from('billing_pix_automatic_config').update({eligibility:evt.eligibility.status,updated_at:new Date().toISOString()}).eq('env',env).throwOnError();
    return true;
  }
  if(evt.authorization?.id) {
    const id=evt.authorization.id;
    let {data:row}=await admin.from('billing_pix_authorizations').select('*').eq('env',env).eq('asaas_authorization_id',id).maybeSingle().throwOnError();
    if(!row && evt.authorization.contractId) {
      const {data:pending}=await admin.from('billing_pix_authorizations').select('*').eq('env',env).eq('contract_id',evt.authorization.contractId).maybeSingle().throwOnError();
      if(pending && !pending.asaas_authorization_id && ['CREATING','UNCERTAIN'].includes(pending.state)) {
        const a=await api(`/pix/automatic/authorizations/${encodeURIComponent(id)}`);
        if(a.customerId!==pending.customer_asaas_id || a.contractId!==pending.contract_id)throw new Error('Autorização pertence a outro cliente.');
        const {data:saved}=await admin.from('billing_pix_authorizations').update({asaas_authorization_id:id}).eq('id',pending.id).is('asaas_authorization_id',null).select('*').maybeSingle().throwOnError();
        row=saved;
      }
    }
    if(row)await refreshAuthorization(admin,api,row,env);
    return true;
  }
  if(evt.paymentInstruction?.id) {
    const {data:previous}=await admin.from('billing_pix_payment_instructions').select('*').eq('env',env).eq('asaas_instruction_id',evt.paymentInstruction.id).maybeSingle().throwOnError();
    const i=await api(`/pix/automatic/paymentInstructions/${encodeURIComponent(evt.paymentInstruction.id)}`);
    if(i.id!==evt.paymentInstruction.id || !i.authorization?.id || !i.paymentId || !['AWAITING_REQUEST','SCHEDULED','DONE','CANCELLED','REFUSED'].includes(i.status))throw new Error('Instrução de pagamento inválida.');
    const {data:row}=await admin.from('billing_pix_authorizations').select('*').eq('env',env).eq('asaas_authorization_id',i.authorization.id).maybeSingle().throwOnError();
    if(!row)return true;
    const {data:p}=await admin.from('billing_payments').select('*').eq('env',env).eq('asaas_payment_id',i.paymentId).maybeSingle().throwOnError();
    if(!p || p.subscription_id!==row.subscription_id)throw new Error('Cobrança da instrução ainda não conciliada; reenviar evento.');
    if(previous && (previous.authorization_id!==row.id || previous.asaas_payment_id!==i.paymentId))throw new Error('Vínculo da instrução alterado pelo provedor.');
    const values={env,asaas_instruction_id:i.id,authorization_id:row.id,asaas_payment_id:i.paymentId,status:i.status,
      due_date:i.dueDate,refusal_reason:i.refusalReason || null,updated_at:new Date().toISOString()};
    const query=previous?admin.from('billing_pix_payment_instructions').update(values).eq('env',env).eq('asaas_instruction_id',i.id).eq('status',previous.status).eq('updated_at',previous.updated_at)
      :admin.from('billing_pix_payment_instructions').upsert(values,{onConflict:'env,asaas_instruction_id',ignoreDuplicates:true});
    const {data:saved}=await query.select('asaas_instruction_id').throwOnError();
    if(!saved?.length)throw new Error('Instrução alterada durante reconciliação; reenviar evento.');
    return true;
  }
  throw new Error('Evento de Pix Automático sem recurso reconhecido.');
}
