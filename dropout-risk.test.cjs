const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('js/dropout-risk.js','utf8');
const now=new Date('2026-10-29T12:00:00Z');
const athlete={id:'a',name:'Ana',active:true,teamId:'t',birth:'2012-01-01',phone:'11911112222',parentPhone:'11933334444'};
const session=(day,status,other={})=>({teamId:'t',startedAt:`2026-10-${day}T12:00:00Z`,recorded:true,att:{a:status},...other});
const context=vm.createContext({Date,Map,Set,URLSearchParams});vm.runInContext(source,context);
test('same attendance rule: two absences, justified/present break, missing calls do not count',()=>{
 const rows=[session('25','absent'),session('27','absent'),session('24','present'),session('28',undefined,{att:{},recorded:false})];
 assert.equal(context.calculateDropoutRisk([athlete],rows,now,['t'])[0].streak,2);
 assert.equal(context.calculateDropoutRisk([athlete],[...rows,session('28','justified')],now,['t']).length,0);
 assert.equal(context.calculateDropoutRisk([athlete],[...rows,session('28','present')],now,['t']).length,0);
});
test('60-day window, active athlete and permitted team scope',()=>{
 const rows=[session('27','absent'),session('28','absent')];
 assert.equal(context.calculateDropoutRisk([{...athlete,active:false}],rows,now,['t']).length,0);
 assert.equal(context.calculateDropoutRisk([athlete],rows,now,['other']).length,0);
 assert.equal(context.calculateDropoutRisk([athlete],[rows[0],session('01','absent',{startedAt:'2026-08-01T12:00:00Z'})],now,['t']).length,0);
});
test('six absences are returned with count; input remains intact',()=>{
 const rows=['20','21','22','23','24','25'].map(d=>session(d,'absent'));
 assert.equal(context.calculateDropoutRisk([athlete],rows,now,['t'])[0].streak,6);
 assert.equal(rows[0].startedAt,'2026-10-20T12:00:00Z');
});
test('contact prefers guardian for minors and athlete for adults; invalid phone has no link',()=>{
 assert.match(context.dropoutContactUrl(athlete,now),/^https:\/\/wa.me\/5511933334444\?/);
 assert.match(context.dropoutContactUrl({...athlete,birth:'1990-01-01'},now),/^https:\/\/wa.me\/5511911112222\?/);
 assert.equal(context.dropoutContactUrl({...athlete,phone:'',parentPhone:''},now),'');
});
test('visibility is limited to admin/reception and overview permission',()=>{
 assert.equal(context.dropoutVisible('Administrador',true),true);
 assert.equal(context.dropoutVisible('Atendimento',true),true);
 assert.equal(context.dropoutVisible('Atendimento',false),false);
 assert.equal(context.dropoutVisible('Financeiro',true),false);
 assert.equal(context.dropoutVisible('Técnico',true),false);
});

test('panel renders real calculation, escapes names and separates long absence review',()=>{
 const recent=n=>new Date(Date.now()-n*86400000).toISOString();
 Object.assign(context,{APOLLO_AUTH:{access:{role:'attendance'}},S:{previewRole:null},canEdit:()=>true,me:()=>({role:'Atendimento'}),canView:()=>true,myTeamIds:()=>['t'],TEAMS:[{id:'t',name:'Equipe'}],ATHLETES:[{...athlete,name:'<Ana>'}],SESSIONS:[session('27','absent',{startedAt:recent(1)}),session('26','absent',{startedAt:recent(2)})],esc:x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),displayName:x=>x,teamOf:()=>({name:'Equipe'}),fmtShort:()=> '28/10',icon:()=>''});
 const html=context.dropoutRiskHTML();
 assert.match(html,/Risco de evasão/);assert.match(html,/&lt;Ana&gt;/);assert.doesNotMatch(html,/<Ana>/);
 assert.match(html,/2 faltas seguidas/);assert.match(html,/Conferir continuidade na equipe \(0\)/);
 context.me=()=>({role:'Financeiro'});assert.equal(context.dropoutRiskHTML(),'');
});
test('only an actual admin outside profile preview may deactivate',()=>{
 assert.equal(context.dropoutCanDeactivate('admin','Administrador',true,false),true);
 assert.equal(context.dropoutCanDeactivate('attendance','Administrador',true,false),false);
 assert.equal(context.dropoutCanDeactivate('admin','Atendimento',true,true),false);
 assert.equal(context.dropoutCanDeactivate('admin','Administrador',false,false),false);
});
test('deactivation preserves athlete/history and writes only inactive flag and exit date',async()=>{
 const writes=[],messages=[];
 Object.assign(context,{APOLLO_AUTH:{access:{role:'admin'}},S:{previewRole:null},me:()=>({role:'Administrador'}),canEdit:()=>true,confirmBox:async()=>true,liveWrite:async(...args)=>writes.push(args),liveReload:async()=>{},toast:(...args)=>messages.push(args),ymd:()=> '2026-10-29',ATHLETES:[{...athlete}],myTeamIds:()=>['t']});
 await context.dropoutDeactivate('a');
 assert.equal(writes.length,1);assert.equal(writes[0][0],'athletes');assert.equal(writes[0][2],'a');
 assert.equal(writes[0][1].is_active,false);assert.equal(writes[0][1].left_at,'2026-10-29');assert.equal(Object.keys(writes[0][1]).length,2);
 context.ATHLETES=[{...athlete}];context.confirmBox=async()=>false;await context.dropoutDeactivate('a');assert.equal(writes.length,1);
 context.APOLLO_AUTH.access.role='attendance';context.confirmBox=async()=>true;await context.dropoutDeactivate('a');assert.equal(writes.length,1);
});
