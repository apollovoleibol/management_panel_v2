import { callerClient,adminClient,response,ENV,provider,paymentStore } from '../_shared/billing-runtime.ts';
import { revalidatePayment } from '../_shared/billing-payment.mjs';
import {calculateQuote} from '../_shared/billing-rules.mjs';
import {brasiliaDate,daysOverdue} from '../_shared/billing-payment.mjs';
Deno.serve(async(request:Request)=>{
 if(request.method==='OPTIONS')return response(204,null);
 if(request.method!=='POST')return response(405,{error:'Método não permitido.'});
 let caller;
 try{caller=await callerClient(request);}catch(e){return response(401,{error:(e as Error).message});}
 let input;
 try{input=await request.json();}catch{return response(400,{error:'JSON inválido.'});}
 if(!['payment','preview'].includes(input.action) || typeof input.paymentId!=='string' || !/^[0-9a-f-]{36}$/i.test(input.paymentId))return response(400,{error:'Solicitação inválida.'});
 try{
  const {data:allowed}=await caller.rpc('billing_portal_can_pay',{p_payment_id:input.paymentId}).throwOnError();
  if(!allowed)return response(403,{error:'Cobrança não vinculada a esta conta.'});
  const admin=adminClient();
  if(input.action==='preview'){
   const {data:p}=await admin.from('billing_payments').select('*').eq('id',input.paymentId).eq('env',ENV).single().throwOnError();
   const {data:s}=await admin.from('billing_subscriptions').select('*').eq('id',p.subscription_id).eq('env',ENV).single().throwOnError();
   const policy=p.policy_snapshot || s.policy_snapshot,base=p.base_cents ?? s.base_cents;
   if(!policy || base==null)return response(200,{canChangeMethod:false,quotes:[]});
   if(!['PENDING','OVERDUE'].includes(p.status))return response(409,{error:'Cobrança não está aberta.'});
   if(s.automatic_mode==='PIX_AUTOMATIC')return response(200,{canChangeMethod:false,quotes:[]});
   const days=daysOverdue(p.due_date,brasiliaDate());
   return response(200,{canChangeMethod:['PIX','CREDIT_CARD'].includes(p.billing_type),quotes:['PIX','CREDIT_CARD'].map(method=>{
    const q=calculateQuote(base,method,policy,days);return {method,method_adjustment_percent:policy.methods[method],base_cents:q.baseCents,method_adjustment_cents:q.methodAdjustmentCents,principal_cents:q.principalCents,fine_cents:q.fineCents,interest_cents:q.interestCents,total_cents:q.totalCents};
   })});
  }
  // Ownership is checked with caller JWT, never a client-supplied athlete ID.
  const result=await revalidatePayment({store:paymentStore(admin),provider,paymentId:input.paymentId,env:ENV,method:input.method});
  if(result.automaticDebit)return response(409,{error:'Esta cobrança tem débito automático pendente ou agendado. Aguarde a confirmação do provedor; nenhum pagamento manual foi criado.',automaticDebit:true});
  // Never return internal snapshots, locks or provider/customer payloads.
  const p=result.quote;
  return response(200,{paid:result.paid||false,invoiceUrl:result.invoiceUrl,pix:result.pix?{payload:result.pix.payload,encodedImage:result.pix.encodedImage,expirationDate:result.pix.expirationDate}:null,
   quote:{status:p.status,quote_state:p.quote_state,base_cents:p.base_cents,method_adjustment_percent:p.method_adjustment_percent,method_adjustment_cents:p.method_adjustment_cents,principal_cents:p.principal_cents,fine_cents:p.fine_cents,interest_cents:p.interest_cents,value_cents:p.value_cents,total_cents:p.value_cents,quote_date:p.quote_date}});
 }catch(e){return response(409,{error:(e as Error).message});}
});
