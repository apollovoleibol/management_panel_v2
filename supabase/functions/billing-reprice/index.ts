import {adminClient,response,ENV,provider,paymentStore} from '../_shared/billing-runtime.ts';
import {revalidatePayment,brasiliaDate} from '../_shared/billing-payment.mjs';
Deno.serve(async(request:Request)=>{
 if(request.method!=='POST')return response(405,{error:'Método não permitido.'});
 const expected=Deno.env.get('BILLING_JOB_TOKEN');
 if(!expected || request.headers.get('Authorization')!==`Bearer ${expected}`)return response(401,{error:'Não autorizado.'});
 const admin=adminClient();
 try{
  const today=brasiliaDate();
  // Automatic authorizations have a fixed amount and their own instruction
  // lifecycle. Keep repricing away from automatic Pix and recurring cards.
  const {data:rows}=await admin.from('billing_payments').select('id,billing_subscriptions!inner(automatic_mode,method)').eq('env',ENV)
   .is('billing_subscriptions.automatic_mode',null).neq('billing_subscriptions.method','CREDIT_CARD').in('status',['PENDING','OVERDUE']).not('policy_snapshot','is',null)
   .or(`quote_date.is.null,quote_date.lt.${today},quote_state.eq.uncertain`).order('due_date').limit(3).throwOnError();
  const result=[];
  for(const p of rows){
   try{await revalidatePayment({store:paymentStore(admin),provider,paymentId:p.id,env:ENV,today,includePix:false});result.push({id:p.id,ok:true});}
   catch(e){result.push({id:p.id,ok:false,error:(e as Error).message});}
  }
  return response(result.some(x=>!x.ok)?207:200,{processed:result.length,result});
 }catch(e){return response(500,{error:(e as Error).message});}
});
