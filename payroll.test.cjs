const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
// Regras da Folha dos técnicos (js/payroll.js) com os utilitários do núcleo
const itemValue=fs.readFileSync('js/core.js','utf8').match(/^const itemValue = .*$/m)[0];
function scope(){
 const ctx=vm.createContext({Date,Map,Set,Math,Number,String,Object,Array});
 vm.runInContext(`const pad=n=>String(n).padStart(2,'0');
  const parseYmd=s=>{const [y,m,d]=s.slice(0,10).split('-').map(Number);return new Date(y,m-1,d);};
  const toMin=t=>{const [h,m]=t.split(':').map(Number);return h*60+m;};
  const hoursBetween=(a,b)=>(toMin(b)-toMin(a))/60;
  const monthKey=d=>d.getFullYear()+'-'+pad(d.getMonth()+1);
  const inMonth=(s,k)=>s.slice(0,7)===k;
  const TODAY=new Date(2026,10,9), CUR_MONTH='2026-11';
  var COACHES=[], COACH_ITEMS=[], SESSIONS=[], PAYOUTS={}, TEAMS=[];
  const coachOf=id=>COACHES.find(c=>c.id===id), teamOf=id=>TEAMS.find(t=>t.id===id);
  ${itemValue}`,ctx);
 vm.runInContext(fs.readFileSync('js/payroll.js','utf8'),ctx);
 ctx.TEAMS=[{id:'t1',name:'Equipe Feminino',schedule:[{day:2,start:'18:00',end:'19:30'}]}];
 ctx.COACHES=[{id:'c1',name:'Carolina Corsi',rate:3000,daily:0,pix:''},{id:'c2',name:'Caio Almeida',rate:3000,daily:20000,pix:''}];
 return ctx;
}
const item=(o)=>({id:Math.random().toString(36).slice(2),coach:'c1',teamId:'t1',date:'2026-10-06',type:'treino',hours:1.5,desc:'Treino Equipe Feminino (registrado no app)',status:'pendente',origin:'Manual',...o});

test('trainings from the app enter the review by themselves, without duplicates',()=>{const c=scope();
 c.SESSIONS=[{coach:'c1',teamId:'t1',date:'2026-10-06',hours:0,recorded:true,att:{a:'present'}},{coach:'c1',teamId:'t1',date:'2026-10-06',hours:0},{coach:'c1',teamId:'t1',date:'2026-10-13',hours:1}];
 c.COACH_ITEMS=[item({date:'2026-10-13',status:'reprovado'})];
 const r=c.payCoach('c1','2026-10');
 const app=r.all.filter(i=>i.app);
 assert.equal(app.length,1,'one per coach, team and day; a rejected launch does not come back');
 assert.equal(app[0].hours,1.5,'without duration, uses the team schedule');
 assert.equal(r.state,'review');assert.equal(r.total,4500);});

test('a rejected item stays out of the total and does not block payment',()=>{const c=scope();
 c.COACH_ITEMS=[item({coach:'c2',status:'aprovado',amount:4500}),item({coach:'c2',date:'2026-10-08',status:'reprovado'})];
 const r=c.payCoach('c2','2026-10');
 assert.equal(r.state,'ready');assert.equal(r.total,4500);assert.equal(r.rejected,1);});

test('competition days wait for the daily value; with it, they count',()=>{const c=scope();
 c.COACH_ITEMS=[item({type:'competicao',hours:0,desc:'Copa Apollo',origin:'Técnico'})];
 let r=c.payCoach('c1','2026-10');
 assert.equal(r.waitingDaily.length,1);assert.equal(r.state,'review');assert.equal(r.total,0);
 c.COACHES[0].daily=15000;r=c.payCoach('c1','2026-10');
 assert.equal(r.waitingDaily.length,0);assert.equal(r.total,15000);});

test('paid month: payout amount, and later app trainings are reported, not added',()=>{const c=scope();
 c.COACH_ITEMS=[item({coach:'c2',status:'aprovado',amount:33000})];c.PAYOUTS={'c2|2026-10':{paidAt:'2026-11-08',amount:33000}};
 c.SESSIONS=[{coach:'c2',teamId:'t1',date:'2026-10-20',hours:1}];
 const r=c.payCoach('c2','2026-10');
 assert.equal(r.state,'paid');assert.equal(r.total,33000);assert.equal(r.late,1);assert.equal(r.all.some(i=>i.app),false);});

test('opens on the month to close: previous while someone is unpaid, then the current one',()=>{const c=scope();
 c.COACH_ITEMS=[item({coach:'c2',status:'aprovado',amount:4500})];
 assert.equal(c.payDefaultMonth(),'2026-10');
 c.PAYOUTS={'c2|2026-10':{paidAt:'2026-11-08',amount:4500}};
 assert.equal(c.payDefaultMonth(),'2026-11');});
