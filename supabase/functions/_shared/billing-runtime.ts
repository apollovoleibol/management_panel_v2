import { createClient } from 'npm:@supabase/supabase-js@2';
export const ORIGIN='https://apollovoleibol.github.io';
export const BASE=Deno.env.get('ASAAS_BASE_URL') || 'https://api-sandbox.asaas.com/v3';
export const ENV=BASE.includes('sandbox')?'sandbox':'production';
export const CORS={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
export const response=(status:number,body:unknown)=>new Response(status===204?null:JSON.stringify(body),{status,headers:{...CORS,'Content-Type':'application/json'}});
export function adminClient(){
 const key=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 return createClient(Deno.env.get('SUPABASE_URL')!,key!,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function callerClient(request:Request){
 if(request.headers.get('Origin')!==ORIGIN) throw new Error('Origem não permitida.');
 const token=request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
 if(!token) throw new Error('Entre novamente para acessar suas cobranças.');
 const pub=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default || Deno.env.get('SUPABASE_ANON_KEY');
 const client=createClient(Deno.env.get('SUPABASE_URL')!,pub!,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await client.auth.getUser(token);
 if(error || !data?.user) throw new Error('Sessão inválida.');
 return client;
}
export async function asaas(path:string,body?:unknown){
 const key=Deno.env.get('ASAAS_API_KEY'); if(!key) throw new Error('Asaas não configurado.');
 const result=await fetch(BASE+path,{signal:AbortSignal.timeout(15000),method:body===undefined?'GET':'PUT',headers:{access_token:key,'Content-Type':'application/json','User-Agent':'Apollo-Huddle'},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await result.json();
 if(!result.ok) throw new Error(data?.errors?.map((e:any)=>e.description).join(' ') || `Asaas: ${result.status}`);
 return data;
}
export const provider={get:(id:string)=>asaas(`/payments/${encodeURIComponent(id)}`),update:(id:string,body:unknown)=>asaas(`/payments/${encodeURIComponent(id)}`,body),pix:(id:string)=>asaas(`/payments/${encodeURIComponent(id)}/pixQrCode`),instruction:(id:string)=>asaas(`/pix/automatic/paymentInstructions/${encodeURIComponent(id)}`)};
export function paymentStore(admin:any){
 return {
  async claim(id:string,lock:string){const {data}=await admin.rpc('billing_claim_payment',{p_payment_id:id,p_lock:lock}).throwOnError();return data;},
  async subscription(id:string){const {data}=await admin.from('billing_subscriptions').select('*').eq('id',id).maybeSingle().throwOnError();return data;},
  async automaticInstruction(p:any){const {data}=await admin.from('billing_pix_payment_instructions').select('*').eq('env',p.env).eq('asaas_payment_id',p.asaas_payment_id).order('updated_at',{ascending:false}).limit(1).maybeSingle().throwOnError();return data;},
  async markUpdating(p:any,lock:string){const {data}=await admin.from('billing_payments').update({quote_state:'updating',updated_at:new Date().toISOString()}).eq('id',p.id).eq('quote_lock',lock).in('status',['PENDING','OVERDUE']).select('id').maybeSingle().throwOnError();if(!data)throw new Error('Cobrança mudou durante atualização.');},
  async finish(p:any,lock:string,columns:any){const {data}=await admin.from('billing_payments').update({...columns,updated_at:new Date().toISOString()}).eq('id',p.id).eq('quote_lock',lock).in('status',['PENDING','OVERDUE']).select('id').maybeSingle().throwOnError();return data;},
  async recordStatus(p:any,lock:string,remote:any){await admin.from('billing_payments').update({updated_at:new Date().toISOString(),status:remote.status,value_cents:Math.round(remote.value*100),paid_at:remote.clientPaymentDate||remote.paymentDate||null,quote_state:p.principal_cents!=null && p.value_cents!==Math.round(remote.value*100)?'discrepancy':'settled'}).eq('id',p.id).eq('quote_lock',lock).throwOnError();},
  async uncertain(p:any,lock:string,error:string){await admin.from('billing_payments').update({updated_at:new Date().toISOString(),quote_state:'uncertain',quote_error:error}).eq('id',p.id).eq('quote_lock',lock).in('status',['PENDING','OVERDUE']).throwOnError();},
  async release(id:string,lock:string){await admin.rpc('billing_release_payment',{p_payment_id:id,p_lock:lock}).throwOnError();}
 };
}
