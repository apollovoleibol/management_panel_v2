import {callerClient,adminClient,response,ENV,BASE} from '../_shared/billing-runtime.ts';
import {brasiliaDate} from '../_shared/billing-payment.mjs';
import {assertEnabled,authorizationRequest,authorizationView,refreshAuthorization} from '../_shared/billing-pix-automatic.mjs';
async function api(path:string,method='GET',body?:unknown){
 const r=await fetch(BASE+path,{method,signal:AbortSignal.timeout(15000),headers:{access_token:Deno.env.get('ASAAS_API_KEY') || '',
  'Content-Type':'application/json','User-Agent':'Apollo-Huddle'},body:body===undefined?undefined:JSON.stringify(body)});
 const a=await r.json();if(!r.ok)throw new Error(a?.errors?.map((x:any)=>x.description).join(' ')||`Asaas ${r.status}`);return a;
}
async function assertNoFirstCycleCharge(admin:any,sub:any,month:string){
 const start=`${month}-01`,d=new Date(`${start}T00:00:00Z`);d.setUTCMonth(d.getUTCMonth()+1);
 const {data:rows}=await admin.from('billing_payments').select('id').eq('env',ENV).eq('athlete_id',sub.athlete_id)
  .or(`reference_month.eq.${month},and(reference_month.is.null,due_date.gte.${start},due_date.lt.${d.toISOString().slice(0,10)})`)
  .neq('status','DELETED').limit(1).throwOnError();
 const {data:initial}=await admin.from('billing_pix_authorizations').select('initial_payment_id,billing_subscriptions!inner(athlete_id)')
  .eq('env',ENV).eq('billing_subscriptions.athlete_id',sub.athlete_id).eq('first_competence',month).not('initial_payment_id','is',null).limit(1).throwOnError();
 if(rows?.length || initial?.length)throw new Error('Já existe cobrança nesta competência. Não será criado outro pagamento inicial; reconcilie com a administração.');
}
const output=(row:any)=>{const view=authorizationView(row);return {...view,pix:view.qr};};
Deno.serve(async(request:Request)=>{
 if(request.method==='OPTIONS')return response(204,null);
 if(request.method!=='POST')return response(405,{error:'Método não permitido.'});
 let caller,input;
 try{caller=await callerClient(request);input=await request.json();}catch(e){return response(401,{error:(e as Error).message});}
 if(!['prepare','consent','status','cancel'].includes(input.action)||typeof input.subscriptionId!=='string'||!/^[0-9a-f-]{36}$/i.test(input.subscriptionId))return response(400,{error:'Solicitação inválida.'});
 try{
  const {data:allowed}=await caller.rpc('billing_portal_can_manage_subscription',{p_subscription_id:input.subscriptionId}).throwOnError();
  if(!allowed)return response(403,{error:'Mensalidade não vinculada a esta conta.'});
  const admin=adminClient();
  const {data:sub}=await admin.from('billing_subscriptions').select('*').eq('id',input.subscriptionId).eq('env',ENV).single().throwOnError();
  let {data:row}=await admin.from('billing_pix_authorizations').select('*').eq('subscription_id',sub.id).eq('env',ENV).maybeSingle().throwOnError();
  if(input.action==='status'){
   if(row?.asaas_authorization_id)row=await refreshAuthorization(admin,api,row,ENV);
   return response(200,output(row));
  }
  if(input.action==='cancel'){
   if(input.confirm!==true)throw new Error('Confirme explicitamente o cancelamento da autorização.');
   if(sub.automatic_mode!=='PIX_AUTOMATIC')throw new Error('Esta mensalidade não utiliza Pix Automático.');
   if(row?.asaas_authorization_id){const recurrenceId=row.asaas_subscription_id || sub.asaas_subscription_id;
    row=await refreshAuthorization(admin,api,row,ENV);
    if(!['CANCELLED','REFUSED','EXPIRED'].includes(row.provider_status)){await api(`/pix/automatic/authorizations/${encodeURIComponent(row.asaas_authorization_id)}`,'DELETE');row=await refreshAuthorization(admin,api,row,ENV);}
    if(!['CANCELLED','REFUSED','EXPIRED'].includes(row.provider_status))throw new Error('Interrupção ainda não confirmada pelo Asaas.');
    if(recurrenceId){const recurrence=await api(`/subscriptions/${encodeURIComponent(recurrenceId)}`);if(!recurrence.deleted)await api(`/subscriptions/${encodeURIComponent(recurrenceId)}`,'DELETE');}}
   else if(row && row.state!=='PREPARED')throw new Error('Resultado de criação incerto. Reconcilie antes de cancelar ou repetir.');
   if(row && !row.asaas_authorization_id){const {data:canceled}=await admin.from('billing_pix_authorizations').update({state:'CANCELLED',updated_at:new Date().toISOString()}).eq('id',row.id).eq('state','PREPARED').select('id').maybeSingle().throwOnError();if(!canceled)throw new Error('Criação iniciada durante cancelamento. Reconcilie a autorização.');}
   await admin.from('billing_subscriptions').update({status:'canceled',updated_at:new Date().toISOString()}).eq('id',sub.id).eq('automatic_mode','PIX_AUTOMATIC').throwOnError();
   return response(200,{authorizationStatus:'CANCELLED',ready:false,status:'CANCELLED',pix:null});
  }
  const {data:config}=await admin.from('billing_pix_automatic_config').select('*').eq('env',ENV).single().throwOnError();assertEnabled(config);
  if(row?.asaas_authorization_id){row=await refreshAuthorization(admin,api,row,ENV);return response(200,output(row));}
  if(row && row.state!=='PREPARED')throw new Error('A criação está pendente ou incerta. Reconcilie a autorização no Asaas; não repita o primeiro pagamento.');
  const {data:customer}=await admin.from('billing_customers').select('asaas_id').eq('id',sub.customer_id).eq('env',ENV).single().throwOnError();
  const today=brasiliaDate();
  const contract=row?.contract_id || `AP${crypto.randomUUID().replaceAll('-','')}`;
  const body=authorizationRequest(sub,customer.asaas_id,today,contract);
  await assertNoFirstCycleCharge(admin,sub,today.slice(0,7));
  if(input.action==='prepare'){
   if(row && (row.first_competence!==today.slice(0,7)||row.start_date!==body.startDate||row.value_cents!==sub.value_cents))throw new Error('Plano de consentimento expirou por mudança de competência. Reconcilie com a administração.');
   const value={subscription_id:sub.id,env:ENV,contract_id:contract,customer_asaas_id:customer.asaas_id,value_cents:sub.value_cents,
    first_competence:today.slice(0,7),start_date:body.startDate,request_body:body,consent_token:crypto.randomUUID(),consent_expires_at:new Date(Date.now()+10*60000).toISOString(),updated_at:new Date().toISOString()};
   const query=row?admin.from('billing_pix_authorizations').update(value).eq('id',row.id).eq('state','PREPARED'):admin.from('billing_pix_authorizations').insert(value);
   const {data:saved}=await query.select('*').single().throwOnError();
   return response(200,{consentToken:saved.consent_token,firstPaymentCents:saved.value_cents,recurringValueCents:saved.value_cents,
    firstCompetence:saved.first_competence,startDate:saved.start_date,description:'O primeiro QR paga a competência indicada e solicita autorização bancária para débitos mensais futuros.',ready:false,authorizationStatus:'PREPARED'});
  }
  if(!row || input.confirm!==true || input.consentToken!==row.consent_token || new Date(row.consent_expires_at).getTime()<Date.now()
      || row.first_competence!==today.slice(0,7)||row.request_body.startDate!==body.startDate||row.request_body.value!==body.value
      || row.request_body.customerId!==body.customerId||row.request_body.contractId!==body.contractId)throw new Error('Confirme um plano válido antes de gerar o QR de autorização.');
  const {data:user}=await caller.auth.getUser();
  const {data:claimed}=await admin.from('billing_pix_authorizations').update({state:'CREATING',consented_by:user?.user?.id,consented_at:new Date().toISOString(),updated_at:new Date().toISOString()})
   .eq('id',row.id).eq('state','PREPARED').eq('consent_token',input.consentToken).select('*').maybeSingle().throwOnError();
  if(!claimed)throw new Error('Autorização já iniciada; atualize o estado.');
  row=claimed;
  try{
   const a=await api('/pix/automatic/authorizations','POST',row.request_body);
   if(!a.id)throw new Error('O Asaas não retornou o identificador da autorização.');
   const {data:saved}=await admin.from('billing_pix_authorizations').update({asaas_authorization_id:a.id,updated_at:new Date().toISOString()})
    .eq('id',row.id).is('asaas_authorization_id',null).select('*').maybeSingle().throwOnError();
   if(saved)row=saved;else {const {data:fresh}=await admin.from('billing_pix_authorizations').select('*').eq('id',row.id).single().throwOnError();row=fresh;if(row.asaas_authorization_id!==a.id)throw new Error('Autorização divergente; reconciliação necessária.');}
   row=await refreshAuthorization(admin,api,row,ENV);
   return response(200,output(row));
  }catch(e){await admin.from('billing_pix_authorizations').update({state:'UNCERTAIN',recurrence_confirmed:false,last_error:String((e as Error).message).slice(0,300),updated_at:new Date().toISOString()})
    .eq('id',row.id).eq('state','CREATING').throwOnError();throw e;}
 }catch(e){return response(409,{error:(e as Error).message});}
});
