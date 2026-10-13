import test from 'node:test';
import assert from 'node:assert/strict';
import { revalidatePayment,brasiliaDate,daysOverdue,hostedUrl } from './supabase/functions/_shared/billing-payment.mjs';
import {DEFAULT_POLICY} from './js/billing-rules.mjs';
import {readFileSync} from 'node:fs';
function fixture(){
 const row={id:'local',env:'sandbox',status:'PENDING',asaas_payment_id:'pay_test',subscription_id:'sub_local',base_cents:20000,policy_snapshot:{...structuredClone(DEFAULT_POLICY),methods:{PIX:0,CREDIT_CARD:5}}};
 let remote={id:'pay_test',subscription:'sub_remote',billingType:'PIX',status:'PENDING',value:200,dueDate:'2026-10-10',invoiceUrl:'https://sandbox.asaas.com/i/test'};
 const events=[];
 const store={claim:async()=>row,subscription:async()=>({env:'sandbox',asaas_subscription_id:'sub_remote',package_name:'Escolinha'}),markUpdating:async()=>events.push('updating'),
 finish:async(p,l,c)=>{events.push('finish');Object.assign(row,c);return {id:row.id};},recordStatus:async()=>events.push('paid'),uncertain:async()=>events.push('uncertain'),release:async()=>events.push('release')};
 const provider={get:async()=>({...remote}),update:async(id,b)=>{events.push('provider-write');remote={...remote,...b};return remote;},pix:async()=>({payload:'fake pix'})};
 return {row,remote:()=>remote,setRemote:r=>remote=r,events,store,provider,args:{store,provider,paymentId:'local',env:'sandbox',today:'2026-10-12'}};
}
test('front and backend financial engines stay identical',()=>assert.equal(readFileSync('./js/billing-rules.mjs','utf8'),readFileSync('./supabase/functions/_shared/billing-rules.mjs','utf8')));
test('Brasilia midnight and month boundary use local calendar',()=>{
 assert.equal(brasiliaDate(new Date('2026-11-01T02:59:00Z')),'2026-10-31');
 assert.equal(daysOverdue('2026-10-31','2026-11-01'),1);
 assert.equal(daysOverdue('2026-11-01','2026-10-31'),0);
});
test('card surcharge modifies same title and persists verified components',async()=>{
 const f=fixture();const out=await revalidatePayment({...f.args,method:'CREDIT_CARD'});
 assert.equal(out.quote.value_cents,21000);assert.equal(out.quote.method_adjustment_cents,1000);
 assert.equal(f.remote().id,'pay_test');assert.equal(f.remote().billingType,'CREDIT_CARD');
 assert.deepEqual(f.events,['updating','provider-write','finish','release']);assert.equal(out.pix,null);
});
test('progressive charges explicitly turn off native double charging',async()=>{
 const f=fixture();f.row.policy_snapshot.enabled=true;f.row.policy_snapshot.fine.value=2;
 f.row.policy_snapshot.tiers=[{fromDay:1,rate:1,period:'day'}];
 f.setRemote({...f.remote(),fine:{value:2},interest:{value:1}});
 const out=await revalidatePayment(f.args);
 assert.equal(out.quote.value_cents,20800);assert.equal(out.quote.fine_cents,400);assert.equal(out.quote.interest_cents,400);
 assert.equal(f.remote().fine.value,0);assert.equal(f.remote().interest.value,0);
});
test('settled provider title is never repriced, despite stale local pending',async()=>{
 const f=fixture();f.setRemote({...f.remote(),status:'RECEIVED'});
 const out=await revalidatePayment({...f.args,method:'CREDIT_CARD'});
 assert.equal(out.paid,true);assert.equal(out.invoiceUrl,null);assert.deepEqual(f.events,['paid','release']);
});
test('payment settlement racing provider update returns paid, no checkout',async()=>{
 const f=fixture();f.provider.update=async()=>{f.setRemote({...f.remote(),status:'CONFIRMED'});return f.remote();};
 const out=await revalidatePayment({...f.args,method:'CREDIT_CARD'});
 assert.equal(out.paid,true);assert.ok(!f.events.includes('finish'));
});
test('provider accepts update then persistence fails: no link and uncertain state',async()=>{
 const f=fixture();f.store.finish=async()=>{throw new Error('db unavailable');};
 await assert.rejects(()=>revalidatePayment({...f.args,method:'CREDIT_CARD'}),/db unavailable/);
 assert.deepEqual(f.events,['updating','provider-write','uncertain','release']);
});
test('conditional write prevents stale quote overwriting webhook settlement',async()=>{
 const f=fixture();f.store.finish=async()=>null;
 await assert.rejects(()=>revalidatePayment(f.args),/mudou/);assert.ok(!f.events.includes('provider-write'));
});
test('lock contention causes no provider calls',async()=>{
 const f=fixture();f.store.claim=async()=>null;f.provider.get=async()=>{throw new Error('should not read');};
 await assert.rejects(()=>revalidatePayment(f.args),/em atualização/);
});
test('cross environment and invalid subscription rejected before mutation',async()=>{
 const f=fixture();await assert.rejects(()=>revalidatePayment({...f.args,env:'production'}),/ambiente/);
 f.setRemote({...f.remote(),subscription:'other'});await assert.rejects(()=>revalidatePayment(f.args),/Vínculo/);
 assert.ok(!f.events.includes('provider-write'));
});
test('legacy title retains provider rules, refuses invented method conversion',async()=>{
 const f=fixture();f.row.base_cents=null;f.row.policy_snapshot=null;
 const out=await revalidatePayment(f.args);assert.equal(out.quote.quote_state,'legacy');assert.equal(out.quote.base_cents,null);
 assert.ok(!f.events.includes('provider-write'));
 await assert.rejects(()=>revalidatePayment({...f.args,method:'CREDIT_CARD'}),/sem composição/);
});
test('Pix unavailable still provides safe provider invoice',async()=>{
 const f=fixture();f.provider.pix=async()=>{throw new Error('qr unavailable');};
 const out=await revalidatePayment(f.args);assert.equal(out.pix,null);assert.equal(out.invoiceUrl,'https://sandbox.asaas.com/i/test');
});
test('payment URL rejects wrong environments, credentials and executable links',()=>{
 for(const url of ['javascript:alert(1)','http://sandbox.asaas.com/i/a','https://evil.test/i/a','https://x@sandbox.asaas.com/i/a','https://www.asaas.com/i/a'])assert.throws(()=>hostedUrl(url,'sandbox'));
});

test('invalid calendar dates are rejected instead of silently normalizing',()=>{assert.throws(()=>daysOverdue('2026-02-30','2026-03-02'),/inválida/);});
test('provider must confirm method as well as amount before exposing checkout',async()=>{const f=fixture();f.provider.update=async()=>{f.setRemote({...f.remote(),value:210});return f.remote();};await assert.rejects(()=>revalidatePayment({...f.args,method:'CREDIT_CARD'}),/confirmou/);assert.ok(f.events.includes('uncertain'));});
test('scheduled repricing does not fetch Pix QR codes',async()=>{const f=fixture();f.provider.pix=async()=>{throw new Error('must not call');};const out=await revalidatePayment({...f.args,includePix:false});assert.equal(out.pix,null);});

test('automatic Pix scheduled instruction blocks manual payment and repricing on server',async()=>{
 const f=fixture();f.store.subscription=async()=>({env:'sandbox',asaas_subscription_id:'sub_remote',automatic_mode:'PIX_AUTOMATIC'});
 f.store.automaticInstruction=async()=>({asaas_instruction_id:'instruction_test'});f.provider.instruction=async()=>({id:'instruction_test',paymentId:'pay_test',status:'SCHEDULED'});
 const out=await revalidatePayment({...f.args,method:'CREDIT_CARD'});
 assert.equal(out.automaticDebit,true);assert.equal(out.invoiceUrl,null);assert.ok(!f.events.includes('provider-write'));
});
test('automatic Pix refuses fallback until provider confirms instruction refusal',async()=>{
 const f=fixture();f.store.subscription=async()=>({env:'sandbox',asaas_subscription_id:'sub_remote',automatic_mode:'PIX_AUTOMATIC'});
 f.store.automaticInstruction=async()=>null;
 assert.equal((await revalidatePayment(f.args)).automaticDebit,true);
 f.store.automaticInstruction=async()=>({asaas_instruction_id:'instruction_test'});f.provider.instruction=async()=>({id:'instruction_test',paymentId:'pay_test',status:'REFUSED'});
 const out=await revalidatePayment(f.args);assert.equal(out.automaticDebit,undefined);assert.equal(out.invoiceUrl,'https://sandbox.asaas.com/i/test');assert.ok(!f.events.includes('provider-write'));
});
test('pending title of active recurring card has no manual checkout or value mutation',async()=>{
 const f=fixture();f.setRemote({...f.remote(),billingType:'CREDIT_CARD'});
 f.store.subscription=async()=>({env:'sandbox',asaas_subscription_id:'sub_remote',method:'CREDIT_CARD',status:'active'});
 const out=await revalidatePayment({...f.args,method:'PIX'});assert.equal(out.automaticDebit,true);assert.equal(out.invoiceUrl,null);assert.ok(!f.events.includes('provider-write'));
});
