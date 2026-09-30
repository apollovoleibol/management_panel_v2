const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function scope(){const c=vm.createContext({canView:()=>true,APOLLO_AUTH:{access:{role:'admin'}},esc:s=>s,
  kpiIcon:()=>'',metricInfo:()=>'',icon:()=>'',financeDbClient:()=>({rpc:async()=>({data:{started:0,firstResponseCount:0,bookingCount:0,humanReplyCount:0,pendingHandoffs:0,ratingCount:0}})})});
  vm.runInContext(fs.readFileSync('js/service-metrics.js','utf8'),c);return c;}
test('no samples show missing values, never zero seconds or zero satisfaction',async()=>{
  const c=scope();await c.serviceMetricsLoad();const html=c.serviceMetricsHTML();
  assert.equal((html.match(/<strong>—<\/strong>/g)||[]).length,4);
  assert.match(html,/Aguardando novas conversas/);
});
test('metrics fetch failure has an actionable retry without fabricated numbers',async()=>{
  const c=scope();c.financeDbClient=()=>({rpc:async()=>({error:Error('offline')})});await c.serviceMetricsLoad();
  assert.match(c.serviceMetricsHTML(),/Tentar novamente/);
});
test('global service metrics are not requested by a coach',async()=>{
  const c=scope();c.APOLLO_AUTH.access.role='coach';let called=false;c.financeDbClient=()=>{called=true;};
  await c.serviceMetricsLoad();assert.equal(called,false);assert.equal(c.serviceMetricsHTML(),'');
});
