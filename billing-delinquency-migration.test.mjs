import { PGlite } from './.verification/node_modules/@electric-sql/pglite/dist/index.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite();
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
await db.exec(`create role anon;create role authenticated;create role service_role;
create schema auth;create schema private;grant usage on schema private,auth to authenticated;
create table auth.users(id uuid primary key);
create table public.profiles(id uuid primary key,full_name text,role text,is_active boolean);
create table public.v2_staff(user_id uuid primary key,role text,is_active boolean);
create table public.teams(id uuid primary key,name text);
create table public.team_coaches(team_id uuid,coach_id uuid,is_head boolean);
create table public.athletes(id uuid primary key,full_name text,team_id uuid references public.teams(id));
grant select on public.athletes to authenticated;
create table public.v2_athlete_access(user_id uuid,athlete_id uuid);
create table public.attendance(log_id uuid,athlete_id uuid references public.athletes(id),status text,primary key(log_id,athlete_id));
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function private.v2_can(text,text) returns boolean language sql as $$select false$$;
create function private.v2_portal_link(uuid) returns boolean language sql stable security definer as $$
 select exists(select 1 from public.v2_athlete_access a join public.profiles p on p.id=a.user_id where a.user_id=auth.uid() and a.athlete_id=$1 and p.is_active)$$;
`);
let baseline = readFileSync('supabase/migrations/030_billing_asaas.sql', 'utf8');
baseline = baseline.slice(0, baseline.indexOf('-- Página')) + 'commit;';
await db.exec(baseline);
await db.exec(readFileSync('supabase/migrations/032_billing_delinquency.sql', 'utf8'));
await db.query('insert into teams values($1,$2),($3,$4)', [id(1), 'Equipe A', id(2), 'Equipe B']);
for (const [n,role,active] of [[10,'customer',true],[11,'customer',true],[20,'admin',true],[21,'coach',true],[22,'coach',true],[23,'coach',false],[24,'coach',true],[25,'coach',true]]) {
 await db.query('insert into auth.users values($1)', [id(n)]);
 await db.query('insert into profiles values($1,$2,$3,$4)', [id(n), `Pessoa ${n}`, role, active]);
}
await db.query("insert into v2_staff values($1,'admin',true),($2,'coach',false)", [id(21), id(24)]);
await db.query('insert into team_coaches values($1,$2,true),($1,$3,false),($1,$4,false),($5,$6,true)', [id(1),id(22),id(23),id(24),id(2),id(25)]);
await db.query('insert into athletes values($1,$2,$3),($4,$5,$6)', [id(30),'Atleta A',id(1),id(31),'Atleta B',id(2)]);
await db.query('insert into v2_athlete_access values($1,$2),($3,$4)', [id(10),id(30),id(11),id(31)]);
await db.query("insert into billing_customers(id,env,name,cpf_cnpj) values($1,'sandbox','Teste','000'),($2,'production','Real','111')", [id(40),id(41)]);
for (const [n,env,athlete,customer] of [[50,'sandbox',30,40],[51,'production',30,41],[52,'sandbox',31,40]]) {
 await db.query("insert into billing_subscriptions(id,env,athlete_id,customer_id,method,value_cents,due_day,description,status) values($1,$2,$3,$4,'PIX',20000,10,'Demo','active')", [id(n),env,id(athlete),id(customer)]);
}
const todaySql = "(now() at time zone 'America/Sao_Paulo')::date";
await db.query(`insert into billing_payments(id,asaas_payment_id,env,subscription_id,athlete_id,status,value_cents,due_date)
 values($1,'sandbox-A','sandbox',$2,$3,'PENDING',20000,${todaySql}-1)`, [id(60),id(50),id(30)]);
assert.equal((await db.query('select count(*)::int as n from billing_staff_notices')).rows[0].n, 3, 'current coach + legacy admin + promoted admin only');
await db.exec(`set test.uid='${id(10)}'`);
let state = (await db.query('select billing_delinquency_state() as s')).rows[0].s;
assert.equal(state.length, 2);
assert.ok(state.every(row => row.athlete_id === id(30)));
assert.equal(state.find(row => row.env==='sandbox').overdue_count, 1);
assert.equal(state.find(row => row.env==='sandbox').blocked, false);
assert.equal(state.find(row => row.env==='sandbox').coach_notified, true);
assert.equal(state.find(row => row.env==='sandbox').admin_notified, true);
await db.query('select billing_delinquency_state()');
assert.equal((await db.query('select count(*)::int as n from billing_staff_notices')).rows[0].n, 3, 'no duplicate notifications');
await db.query(`insert into billing_payments(asaas_payment_id,env,subscription_id,athlete_id,status,value_cents,due_date)
 values('due-today','sandbox',$1,$2,'OVERDUE',20000,${todaySql}),('future-due','sandbox',$1,$2,'OVERDUE',20000,${todaySql}+1),
 ('old-paid','sandbox',$1,$2,'RECEIVED',20000,${todaySql}-30)`, [id(50),id(30)]);
assert.equal((await db.query('select billing_delinquency_state() as s')).rows[0].s.find(row=>row.env==='sandbox').overdue_count, 1, 'actual due dates and OPEN statuses decide lateness');
await db.query("insert into attendance values($1,$2,'present')", [id(70),id(30)]);
await db.exec('update private.billing_restriction_config set production_restrictions_enabled=true');
await db.query("insert into attendance values($1,$2,'present')", [id(71),id(30)]);
await db.query(`insert into billing_payments(id,asaas_payment_id,env,subscription_id,athlete_id,status,value_cents,due_date)
 values($1,'production-A','production',$2,$3,'OVERDUE',20000,${todaySql}-1)`, [id(61),id(51),id(30)]);
state = (await db.query('select billing_delinquency_state() as s')).rows[0].s;
assert.equal(state.find(row => row.env==='production').blocked, true);
await assert.rejects(db.query("insert into attendance values($1,$2,'present')", [id(72),id(30)]), /Presença restrita/);
await db.query("insert into attendance values($1,$2,'absent')", [id(72),id(30)]);
await assert.rejects(db.query("update attendance set status='present' where log_id=$1", [id(72)]), /Presença restrita/);
await assert.rejects(db.query('update attendance set log_id=$1 where log_id=$2', [id(73),id(70)]), /Presença restrita/, 'moving a historical presence cannot bypass the guard');
await db.exec('update private.billing_restriction_config set production_restrictions_enabled=false');
await db.query("update attendance set status='present' where log_id=$1", [id(72)]);
await db.exec(`set test.uid='${id(11)}'`);
state = (await db.query('select billing_delinquency_state() as s')).rows[0].s;
assert.ok(state.every(row => row.athlete_id === id(31)));
assert.ok(state.every(row => !row.coach_notified && !row.admin_notified));
await assert.rejects(db.query('select billing_staff_notices()'), /Acesso negado/);
await db.exec(`set test.uid='${id(22)}'`);
let notices = (await db.query('select billing_staff_notices() as n')).rows[0].n;
assert.equal(notices.length, 2);
assert.ok(notices.every(row => row.athlete_id===id(30)));
assert.ok(notices.every(row => !('recipient_id' in row) && !('cpf_cnpj' in row)));
await db.query('select billing_staff_notice_read($1)', [notices[0].id]);
assert.ok((await db.query('select billing_staff_notices() as n')).rows[0].n.find(row => row.id===notices[0].id).read_at);
await db.exec(`set test.uid='${id(25)}'`);
assert.equal((await db.query('select billing_staff_notices() as n')).rows[0].n.length, 0);
await assert.rejects(db.query('select billing_staff_notice_read($1)', [notices[0].id]), /Aviso não encontrado/);
await db.exec(`set test.uid='${id(24)}'`);
await assert.rejects(db.query('select billing_staff_notices()'), /Acesso negado/);
await db.query("update billing_payments set status='RECEIVED' where id=$1", [id(61)]);
await db.exec(`set test.uid='${id(10)}'`);
state = (await db.query('select billing_delinquency_state() as s')).rows[0].s;
assert.equal(state.find(row=>row.env==='production').overdue_count, 0);
assert.equal(state.find(row=>row.env==='production').admin_notified, false);
await db.query('update athletes set team_id=$1 where id=$2', [id(2),id(30)]);
await db.exec(`set test.uid='${id(22)}'`);
assert.equal((await db.query('select billing_staff_notices() as n')).rows[0].n.length, 0);
await db.exec(`set test.uid='${id(25)}'`);
notices = (await db.query('select billing_staff_notices() as n')).rows[0].n;
assert.ok(notices.some(row=>row.athlete_id===id(30) && !row.resolved_at));
await db.query("update billing_payments set status='DELETED' where id=$1", [id(60)]);
assert.equal((await db.query('select billing_staff_notices() as n')).rows[0].n.filter(row=>!row.resolved_at).length, 0);
await db.exec(`set test.uid='${id(10)}';set role authenticated`);
assert.ok((await db.query('select billing_delinquency_state() as s')).rows[0].s.every(row=>row.athlete_id===id(30)));
await assert.rejects(db.query('select * from private.billing_restriction_config'), /permission denied/);
await assert.rejects(db.query("insert into billing_staff_notices(athlete_id,env,recipient_id,recipient_role,overdue_count) values($1,'production',$2,'admin',1)", [id(30),id(20)]), /permission denied/);
assert.equal((await db.query('select * from billing_staff_notices')).rows.length, 0);
await db.exec('reset role');
await db.close();
console.log('Delinquency SQL checks passed: family/staff scope, durable deduplication, real internal recipients, sandbox isolation, default-disabled and explicit production guard, payment resolution, team reassignment and permissions.');
