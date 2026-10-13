const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const source=stripTypeScriptTypes(fs.readFileSync(`${__dirname}/supabase/functions/billing-portal/index.ts`,'utf8').replace(/^import .*;\r?\n/gm,''));
function portalHarness(){
 const payment={id:'11111111-1111-1111-1111-111111111111',subscription_id:'sub_local',env:'sandbox',status:'OVERDUE',billing_type:'PIX',base_cents:20000,policy_snapshot:{enabled:false},due_date:'2026-10-10'};
 const subscription={id:'sub_local',env:'sandbox',automatic_mode:'PIX_AUTOMATIC',base_cents:20000,policy_snapshot:{enabled:false}};
 const calls=[];
 const admin={from:table=>{const query={select(){return this},eq(){return this},single(){return this},throwOnError(){return Promise.resolve({data:table==='billing_payments'?payment:subscription})}};return query;}};
 let handler;
 vm.runInNewContext(source,{Response,Date,Deno:{serve:h=>handler=h},ENV:'sandbox',provider:{},paymentStore:()=>({}),
  callerClient:async()=>({rpc:()=>({throwOnError:async()=>({data:true})})}),adminClient:()=>admin,
  response:(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}}),
  calculateQuote:()=>{throw new Error('An automatic title must never offer a recalculated modality quote');},brasiliaDate:()=> '2026-10-12',daysOverdue:()=>2,
  revalidatePayment:async args=>{calls.push(args);return {invoiceUrl:'https://sandbox.asaas.com/i/existing',quote:{...payment,value_cents:20000},pix:null};}
 });
 return {calls,send:action=>handler(new Request('https://example.invalid',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,paymentId:payment.id})}))};
}
test('automatic fixed title preview disables method choice even with a policy snapshot',async()=>{
 const h=portalHarness();const reply=await h.send('preview');assert.equal(reply.status,200);
 assert.deepEqual(await reply.json(),{canChangeMethod:false,quotes:[]});
});
test('automatic refusal recovery requests the existing hosted title without a payment method',async()=>{
 const h=portalHarness();const reply=await h.send('payment');assert.equal(reply.status,200);
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].method,undefined);
 assert.equal((await reply.json()).invoiceUrl,'https://sandbox.asaas.com/i/existing');
});
