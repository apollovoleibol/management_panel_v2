// Rematrícula 2027 — migrações 049 e 050 em PostgreSQL descartável (PGlite).
// Uso: instalar @electric-sql/pglite em .verification e rodar `node rematricula.test.mjs`.
const { PGlite } = await import(process.env.PGLITE_MODULE || './.verification/node_modules/@electric-sql/pglite/dist/index.js');
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite();
// Estrutura mínima do Supabase usada pela migração
await db.exec(`
create role anon; create role authenticated;
create schema private; create schema auth; create schema extensions; create schema storage;
create table public.app_user(uid uuid); insert into public.app_user values (null);
create function auth.uid() returns uuid language sql stable as $$ select uid from public.app_user $$;
create function extensions.digest(p text, alg text) returns bytea language sql immutable as $$ select sha256(convert_to(p, 'UTF8')) $$;
create function extensions.gen_random_bytes(n int) returns bytea language sql volatile as $$
  select substring(decode(md5(random()::text) || md5(random()::text) || md5(random()::text), 'hex') from 1 for n) $$;
create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create table public.training_locations(id uuid primary key default gen_random_uuid(), name text);
create table public.teams(id uuid primary key default gen_random_uuid(), name text, category text, gender text, age_min int, age_max int, location_id uuid, is_active boolean default true);
create table public.profiles(id uuid primary key, full_name text, email text, role text, is_active boolean default true);
create table public.team_coaches(team_id uuid, coach_id uuid);
create table public.athletes(id uuid primary key default gen_random_uuid(), team_id uuid not null, full_name text not null, birth_date date,
  phone text, parent_phone text, parent_email text, is_active boolean default true, cpf text, rg text, email text, address text,
  emergency_contact text, parent_name text, parent_cpf text, parent_rg text, height text, weight text, terms_accepted boolean, raw_form_data jsonb,
  anamnesis_restrictions text, anamnesis_pain text, anamnesis_fainting text, anamnesis_posture text, anamnesis_lesion text, anamnesis_surgery text,
  anamnesis_deficiency text, anamnesis_other_activities text, anamnesis_eating_habits text, anamnesis_meals_per_day text,
  anamnesis_personal_history text, anamnesis_continuous_illness text, anamnesis_diagnostics text, anamnesis_family_history text,
  anamnesis_medications text, anamnesis_observations text);
create table public.v2_staff_stub(uid uuid primary key, role text, can_edit boolean);
create function private.v2_role() returns text language sql stable as $$
  select s.role from public.v2_staff_stub s where s.uid = auth.uid() $$;
create function private.v2_can(p_page text, p_mode text default 'view') returns boolean language sql stable as $$
  select coalesce((select p_mode = 'view' or s.can_edit from public.v2_staff_stub s where s.uid = auth.uid()), false) $$;
create function private.v2_team_scope(p_team uuid) returns boolean language sql stable as $$
  select private.v2_role() <> 'coach' or exists (select 1 from public.team_coaches tc where tc.team_id = p_team and tc.coach_id = auth.uid()) $$;
`);
await db.exec(readFileSync('supabase/migrations/049_rematricula_2027.sql', 'utf8'));
await db.exec(readFileSync('supabase/migrations/050_rematricula_sem_atestado.sql', 'utf8'));

const T1 = '11111111-1111-4111-8111-111111111111', T2 = '22222222-2222-4222-8222-222222222222';
const ADULT = 'aaaaaaaa-0000-4000-8000-000000000001', KID = 'aaaaaaaa-0000-4000-8000-000000000002', SIB = 'aaaaaaaa-0000-4000-8000-000000000003', OLD = 'aaaaaaaa-0000-4000-8000-000000000004';
const ADMIN = 'bbbbbbbb-0000-4000-8000-000000000001', COACH = 'bbbbbbbb-0000-4000-8000-000000000002', MKT = 'bbbbbbbb-0000-4000-8000-000000000003';
const kidBirth = new Date(new Date().getFullYear() - 12, 4, 10).toISOString().slice(0, 10);
const sibBirth = new Date(new Date().getFullYear() - 9, 1, 3).toISOString().slice(0, 10);
await db.exec(`
insert into public.teams(id, name, category) values ('${T1}', 'Equipe Collins', 'Adulto'), ('${T2}', 'Escolinha B', 'Escolinha');
insert into public.athletes(id, team_id, full_name, birth_date, cpf, rg, email, phone, emergency_contact, address, anamnesis_restrictions, height)
  values ('${ADULT}', '${T1}', 'Carla Souza', '1990-05-20', '529.982.247-25', '12.345.678-9', 'carla@exemplo.com', '41999990000', 'Mãe - 41 98888-0000', 'Rua Antiga, 1', 'Sim: joelho', '170');
insert into public.athletes(id, team_id, full_name, birth_date, cpf, phone, parent_name, parent_cpf, parent_phone, email, emergency_contact)
  values ('${KID}', '${T2}', 'Lucas Lima', '${kidBirth}', '11144477735', '(41) 97777-1111', 'Paula Lima', '935.411.347-80', '41977771111', 'paula@exemplo.com', 'Paula - 41 97777-1111'),
         ('${SIB}', '${T2}', 'Bia Lima', '${sibBirth}', '07068093868', '(41) 97777-1111', 'Paula Lima', '935.411.347-80', '41977771111', 'paula@exemplo.com', 'Paula');
insert into public.athletes(id, team_id, full_name, birth_date, cpf, is_active) values ('${OLD}', '${T1}', 'Inativo', '1990-05-20', '529.982.247-25', false);
insert into public.profiles(id, full_name, email, role) values ('${ADMIN}', 'Admin', 'a@x', 'admin'), ('${COACH}', 'Coach', 'c@x', 'coach'), ('${MKT}', 'Mkt', 'm@x', 'customer');
insert into public.v2_staff_stub values ('${ADMIN}', 'admin', true), ('${COACH}', 'coach', false), ('${MKT}', 'marketing', false);
insert into public.team_coaches values ('${T1}', '${COACH}');
`);

const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const call = async (fn, ...args) => (await q(`select public.${fn}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as r`, args))[0].r;
const fails = async (promise, pattern, msg) => { await assert.rejects(promise, e => pattern.test(e.message), msg); };
const as = uid => db.query('update public.app_user set uid = $1', [uid]);

// ─── Identificação ───
let r = await call('reenroll_start', '529.982.247-25', '1990-05-21');
assert.equal(r.ok, false, 'wrong birth date fails');
assert.match(r.error, /Não encontramos/, 'error does not reveal which field is wrong');
r = await call('reenroll_start', '52998224725', '1990-05-20');
assert.equal(r.ok, true, 'athlete CPF + birth date opens session');
const adultToken = r.token;
assert.equal(r.others, 0, 'inactive athlete with same CPF is not counted');
let data = await call('reenroll_get', adultToken);
assert.equal(data.athletes.length, 1, 'inactive athlete with same CPF is excluded');
const adult = data.athletes[0];
assert.equal(adult.minor, false);
assert.equal(adult.data.cpf, '529.982.247-25');
assert.equal(adult.data.address, undefined, 'address is never returned');
assert.equal(JSON.stringify(adult).includes('joelho'), false, 'anamnesis is never returned');
assert.equal(JSON.stringify(adult).includes('170'), false, 'height is never returned');
assert.ok(data.teams.length === 2, 'active teams are listed for 2027 choice');
await fails(call('reenroll_get', 'token-invalido'), /sessão expirou/, 'invalid token is rejected');

// Responsável por WhatsApp (formato antigo, sem o 9) e irmão na mesma sessão
r = await call('reenroll_start', '+55 (41) 7777-1111', kidBirth);
assert.equal(r.ok, true, 'guardian phone (old 8-digit format) + child birth date opens session');
assert.equal(r.others, 1, 'sibling linked to same phone is announced only after verification');
const famToken = r.token;
data = await call('reenroll_get', famToken);
assert.deepEqual(data.athletes.map(a => a.id), [KID], 'session covers only the verified child');
r = await call('reenroll_start', '41977771111', sibBirth, famToken);
assert.equal(r.token, famToken, 'adding a sibling keeps the same session');
data = await call('reenroll_get', famToken);
assert.equal(data.athletes.length, 2, 'session now covers both children');
r = await call('reenroll_start', '935.411.347-80', kidBirth);
assert.equal(r.ok, true, 'guardian CPF also identifies');
await fails(call('reenroll_save', famToken, ADULT, 'endereco', {}), /sessão expirou/, 'a session cannot touch another family athlete');

// Limite de tentativas
for (let i = 0; i < 5; i++) await call('reenroll_start', '111.444.777-35', '2000-01-01');
r = await call('reenroll_start', '111.444.777-35', kidBirth);
assert.equal(r.ok, false, 'identifier is locked after 5 failures, even with correct data');
assert.match(r.error, /Muitas tentativas/);

// ─── Cadastro ───
const adultFields = { ...adult.data };
await fails(call('reenroll_save', adultToken, ADULT, 'cadastro', { fields: adultFields, confirmed: [] }), /Confirme que está correto: CPF/, 'unconfirmed prefilled data is rejected');
await fails(call('reenroll_save', adultToken, ADULT, 'cadastro', { fields: { ...adultFields, cpf: '529.982.247-24' }, confirmed: Object.keys(adultFields) }), /CPF do\(a\) atleta inválido/, 'invalid CPF rejected');
await fails(call('reenroll_save', adultToken, ADULT, 'cadastro', { fields: { ...adultFields, birth_date: 'xx' }, confirmed: Object.keys(adultFields) }), /Data de nascimento inválida/, 'bad date handled');
r = await call('reenroll_save', adultToken, ADULT, 'cadastro', { fields: { ...adultFields, email: 'nova@exemplo.com', phone: '(41) 99999-0000' }, confirmed: ['full_name', 'cpf', 'rg', 'birth_date', 'phone', 'emergency_contact'] });
assert.deepEqual(r.missing, ['endereco', 'saude', 'equipe', 'termos']);
let row = (await q(`select * from public.reenrollments where athlete_id = $1`, [ADULT]))[0];
assert.deepEqual(row.changed_fields, ['email'], 'changed field recorded');
assert.ok(row.confirmed_fields.includes('phone'), 'formatting difference counts as confirmation');
assert.equal(row.respondent_relation, 'atleta');
const adultAgain = await call('reenroll_get', adultToken);
assert.equal(adultAgain.athletes[0].reenrollment.cadastro.email, 'nova@exemplo.com', 'reviewed identification comes back for editing');
assert.ok(adultAgain.athletes[0].reenrollment.confirmed.includes('cpf'));

// Menor: responsável obrigatório
const kid = data.athletes.find(a => a.id === KID);
await fails(call('reenroll_save', famToken, KID, 'cadastro', { fields: { ...kid.data, parent_cpf: '' }, confirmed: Object.keys(kid.data) }), /Preencha: CPF do\(a\) responsável/, 'minor requires guardian CPF');
await fails(call('reenroll_save', famToken, KID, 'cadastro', { fields: { ...kid.data, cpf: kid.data.parent_cpf }, confirmed: Object.keys(kid.data) }), /não podem ser iguais/, 'athlete and guardian CPF must differ');
await call('reenroll_save', famToken, KID, 'cadastro', { fields: kid.data, confirmed: Object.keys(kid.data) });
assert.equal((await q(`select respondent_relation, respondent_name from public.reenrollments where athlete_id = $1`, [KID]))[0].respondent_name, 'Paula Lima');

// ─── Endereço, saúde, equipe, termos ───
await fails(call('reenroll_save', adultToken, ADULT, 'endereco', { cep: '123' }), /CEP inválido/);
await call('reenroll_save', adultToken, ADULT, 'endereco', { cep: '80000-000', rua: 'Rua Nova', numero: '10', complemento: 'Ap 2', bairro: 'Centro', cidade: 'Curitiba', uf: 'pr' });
const health = { estatura: '171', peso: '68,5', q3: 'Não', q4: ['Não'], q9: 'Regular', q9_1: '4', q10: ['Sedentarismo'], q12: ['Asma', 'Diabetes'], q13: ['Mãe'], q15: '' };
for (const n of [1, 2, 5, 6, 7, 8, 11, 14]) health['q' + n + '_yn'] = 'Não';
health.q14_yn = 'Sim';
await fails(call('reenroll_save', adultToken, ADULT, 'saude', health), /Detalhe a resposta da pergunta 14/, 'yes answers need detail');
health.q14_text = 'Insulina';
await call('reenroll_save', adultToken, ADULT, 'saude', health);
await fails(call('reenroll_save', adultToken, ADULT, 'equipe', { team_id: 'x' }), /invalid input|Escolha a equipe/i);
await call('reenroll_save', adultToken, ADULT, 'equipe', { team_id: T2, note: 'Quero treinar à noite' });
await fails(call('reenroll_save', adultToken, ADULT, 'termos', { dados: true, regulamento: false, imagem: true, declaracao: true }), /regulamento/);
r = await call('reenroll_save', adultToken, ADULT, 'termos', { dados: true, regulamento: true, imagem: true, declaracao: true, ua: 'Teste' });
assert.deepEqual(r.missing, [], 'no medical certificate is required to finish');

// ─── Conclusão ───
r = await call('reenroll_finish', adultToken, ADULT);
assert.equal(r.ok, true);
const a = (await q(`select * from public.athletes where id = $1`, [ADULT]))[0];
assert.equal(a.email, 'nova@exemplo.com');
assert.equal(a.phone, '(41) 99999-0000');
assert.equal(a.address, 'Rua Nova, 10 - Ap 2 - Centro - Curitiba/PR - CEP 80000-000');
assert.equal(a.anamnesis_restrictions, 'Não');
assert.equal(a.anamnesis_medications, 'Sim: Insulina');
assert.equal(a.anamnesis_diagnostics, 'Asma|Diabetes');
assert.equal(a.weight, '68.5');
assert.equal(a.team_id, T1, 'current team stays until 2027');
row = (await q(`select * from public.reenrollments where athlete_id = $1`, [ADULT]))[0];
assert.equal(row.status, 'concluida');
assert.equal(row.previous_data.address, 'Rua Antiga, 1', 'previous record is kept');
assert.equal(row.team_2027_id, T2);
assert.equal(row.regulation_version, 'regulamento-atleta-2027-preliminar-2');
await fails(call('reenroll_save', adultToken, ADULT, 'endereco', {}), /já foi concluída/, 'completed reenrollment is locked');

// ─── Não continuar ───
await fails(call('reenroll_decline', famToken, SIB, '', null, false), /motivo/);
await call('reenroll_decline', famToken, SIB, 'Mudança de cidade', 'Obrigado!', true);
await fails(call('reenroll_save', famToken, SIB, 'endereco', {}), /não vai continuar/);
await call('reenroll_reopen', famToken, SIB);
assert.equal((await q(`select status from public.reenrollments where athlete_id = $1`, [SIB]))[0].status, 'em_andamento');
await call('reenroll_decline', famToken, SIB, 'Mudança de cidade', null, true);

// ─── Sessão expirada ───
await q(`update private.reenroll_sessions set expires_at = now() - interval '1 minute'`);
await fails(call('reenroll_get', famToken), /sessão expirou/, 'expired session rejected');

// ─── Huddle ───
await as(null);
await fails(call('reenroll_panel', 2027), /Sem permissão/, 'anonymous cannot read the panel');
await as(MKT);
await fails(call('reenroll_panel', 2027), /Sem permissão/, 'marketing cannot read the panel');
await as(ADMIN);
let panel = await call('reenroll_panel', 2027);
assert.equal(panel.length, 3, 'admin sees every active athlete');
const byId = Object.fromEntries(panel.map(p => [p.id, p]));
assert.equal(byId[ADULT].status, 'concluida');
assert.equal(byId[KID].status, 'em_andamento');
assert.deepEqual(byId[KID].missing, ['endereco', 'saude', 'equipe', 'termos']);
assert.equal(byId[KID].contact_phone, '(41) 97777-1111');
assert.equal(byId[SIB].status, 'declinada');
assert.equal(byId[SIB].delete_requested, true);
await call('reenroll_staff_set', SIB, 'reopen');
await call('reenroll_staff_set', KID, 'decline', 'Informou por telefone', null);
panel = await call('reenroll_panel', 2027);
assert.equal(panel.find(p => p.id === KID).declined_by, 'Admin');
assert.equal(panel.find(p => p.id === SIB).status, 'em_andamento');
await as(COACH);
panel = await call('reenroll_panel', 2027);
assert.deepEqual(panel.map(p => p.id).sort(), [ADULT], 'coach sees athletes of own teams');
await fails(call('reenroll_staff_set', ADULT, 'reopen'), /Sem permissão/, 'coach without edit permission cannot change status');

// Permissões de execução
const grants = await q(`select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'reenroll_%'`);
const anonGrant = Object.fromEntries(grants.map(g => [g.proname, g.anon]));
assert.equal(anonGrant.reenroll_panel, false, 'panel is not available to anonymous users');
assert.equal(anonGrant.reenroll_staff_set, false);
assert.equal(anonGrant.reenroll_start, true);
for (const fn of ['reenroll_upload_slot', 'reenroll_upload_allowed', 'reenroll_attach']) assert.equal(anonGrant[fn], false, `${fn} is closed (no certificate upload)`);
assert.equal((await q(`select count(*)::int as n from pg_policies where policyname = 'rematricula_upload'`))[0].n, 0, 'anonymous upload rule removed');
assert.equal((await q(`select has_table_privilege('anon', 'public.reenrollments', 'select') as s`))[0].s, false, 'table is not readable directly');

await db.close();
console.log('Rematrícula 2027: identificação, limite de tentativas, sessão, validações, conclusão sem atestado, recusa e painel do Huddle passaram.');
