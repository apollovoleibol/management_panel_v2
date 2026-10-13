import test from 'node:test';
import assert from 'node:assert/strict';
let engine;
try {engine=await import('./supabase/functions/_shared/billing-pix-automatic.mjs');}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
const sub={id:'12345678-1234-1234-1234-123456789abc',status:'pending',method:'PIX',automatic_mode:'PIX_AUTOMATIC',value_cents:20000,due_day:10};
const flags={enabled:true,sandbox_validated:true,eligibility:'ELIGIBLE'};
test('novo consentimento usa API real SUBSCRIPTION sem uma assinatura Pix comum',()=>{
 assert.ok(engine,'Implementar motor do Pix Automático');
 const body=engine.authorizationRequest(sub,'cus_test','2026-10-12','contract-test');
 assert.equal(body.paymentCreationMode,'SUBSCRIPTION');assert.equal(body.frequency,'MONTHLY');
 assert.equal(body.customerId,'cus_test');assert.equal(body.value,200);
 assert.equal(body.immediateQrCode.originalValue,200);assert.equal(body.immediateQrCode.expirationSeconds,3600);
 assert.equal(body.startDate,'2026-11-10');assert.equal(body.contractId,'contract-test');
});
test('criação permanece bloqueada sem elegibilidade e validação de sandbox',()=>{
 assert.doesNotThrow(()=>engine.assertEnabled(flags));
 for(const invalid of [{...flags,enabled:false},{...flags,sandbox_validated:false},{...flags,eligibility:'INELIGIBLE'}])assert.throws(()=>engine.assertEnabled(invalid));
});
test('recorrência comum existente nunca é convertida criando outra cobrança',()=>{
 for(const invalid of [{...sub,asaas_subscription_id:'sub_old'},{...sub,asaas_checkout_id:'ck_old'},{...sub,automatic_mode:null},{...sub,status:'active'}])assert.throws(()=>engine.authorizationRequest(invalid,'cus_test','2026-10-12','contract-test'));
});
test('primeiro QR não é gerado perto demais do início dos futuros débitos',()=>{
 assert.throws(()=>engine.authorizationRequest({...sub,due_day:1},'cus_test','2026-10-31','contract-test'),/antecedência/i);
 assert.equal(engine.authorizationRequest({...sub,due_day:28},'cus_test','2026-12-10','contract-test').startDate,'2027-01-28');
});
const enrollment={contract_id:'contract-test',customer_asaas_id:'cus_test',value_cents:20000,start_date:'2026-11-10'};
const authorization={id:'auth_test',customerId:'cus_test',contractId:'contract-test',frequency:'MONTHLY',paymentCreationMode:'SUBSCRIPTION',status:'ACTIVE',value:200,startDate:'2026-11-10',subscriptionId:'sub_new'};
const recurrence={id:'sub_new',billingType:'PIX',customer:'cus_test',cycle:'MONTHLY',value:200,status:'ACTIVE',deleted:false};
test('ACTIVE depende de autorização e assinatura verificadas no provedor',()=>{
 assert.equal(engine.confirmedReady(enrollment,authorization,recurrence),true);
 for(const change of [{status:'CREATED'},{subscriptionId:null},{customerId:'cus_other'},{value:201},{contractId:'other'},{paymentCreationMode:'MANUAL'}])assert.equal(engine.confirmedReady(enrollment,{...authorization,...change},recurrence),false);
 for(const change of [{deleted:true},{customer:'cus_other'},{value:201},{id:'sub_other'},{billingType:'CREDIT_CARD'}])assert.equal(engine.confirmedReady(enrollment,authorization,{...recurrence,...change}),false);
 assert.equal(engine.confirmedReady(enrollment,authorization,null),false);
});
test('somente instrução SCHEDULED suprime pagamento manual',()=>{
 assert.equal(engine.shouldSuppressManual('ACTIVE',true,'SCHEDULED'),true);
 for(const status of ['AWAITING_REQUEST','REFUSED','CANCELLED','DONE',null])assert.equal(engine.shouldSuppressManual('ACTIVE',true,status),false);
 assert.equal(engine.shouldSuppressManual('REFUSED',false,'SCHEDULED'),false);
});
test('primeiro pagamento exige vínculo de transação e conciliação reais',()=>{
 const p={id:'pay_first',pixTransaction:'txn_first'};
 assert.equal(engine.firstPaymentCorrelation({id:'txn_first',payment:'pay_first',conciliationIdentifier:'qr_first'},p),'qr_first');
 assert.equal(engine.firstPaymentCorrelation({id:'txn_first',payment:'pay_first',qrCode:{conciliationIdentifier:'qr_first'}},p),'qr_first');
 for(const invalid of [{id:'other',payment:'pay_first',conciliationIdentifier:'qr_first'},{id:'txn_first',payment:'other',conciliationIdentifier:'qr_first'},{id:'txn_first',payment:'pay_first'}])assert.throws(()=>engine.firstPaymentCorrelation(invalid,p));
});
