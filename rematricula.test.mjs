// Rematrícula 2027 — migrações 049, 050 e 051 em PostgreSQL descartável (PGlite).
// Uso: instalar @electric-sql/pglite em .verification e rodar `node rematricula.test.mjs`.
const { PGlite } = await import(process.env.PGLITE_MODULE || './.verification/node_modules/@electric-sql/pglite/dist/index.js');
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { TURMAS_2027, CONTRATO_VERSION } = createRequire(import.meta.url)('./js/contrato-2027.js');

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
// Equipes que existem antes da 051 (a ligação das turmas 2027 é pelo nome)
await db.exec(`insert into public.teams(id, name, category) values ('11111111-1111-4111-8111-111111111111', 'Equipe Collins', 'Adulto'), ('22222222-2222-4222-8222-222222222222', 'Escolinha B', 'Escolinha');`);
await db.exec(readFileSync('supabase/migrations/051_rematricula_contrato_pix.sql', 'utf8'));
await db.exec(readFileSync('supabase/migrations/052_rematricula_turma_armstrong.sql', 'utf8'));

const T1 = '11111111-1111-4111-8111-111111111111', T2 = '22222222-2222-4222-8222-222222222222';
const ADULT = 'aaaaaaaa-0000-4000-8000-000000000001', KID = 'aaaaaaaa-0000-4000-8000-000000000002', SIB = 'aaaaaaaa-0000-4000-8000-000000000003', OLD = 'aaaaaaaa-0000-4000-8000-000000000004';
const ADMIN = 'bbbbbbbb-0000-4000-8000-000000000001', COACH = 'bbbbbbbb-0000-4000-8000-000000000002', MKT = 'bbbbbbbb-0000-4000-8000-000000000003';
const kidBirth = new Date(new Date().getFullYear() - 12, 4, 10).toISOString().slice(0, 10);
const sibBirth = new Date(new Date().getFullYear() - 9, 1, 3).toISOString().slice(0, 10);
await db.exec(`
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
assert.ok(data.teams.length === 2, 'active teams are listed');
assert.equal(data.contract, CONTRATO_VERSION, 'server and contract text agree on the version');
// Turmas do banco = Anexo I do contrato
assert.deepEqual(data.offers.map(o => [o.key, o.fee_cents, o.label, o.days, o.time]), TURMAS_2027.map(t => [t.key, t.fee_cents, t.label, t.days, t.time]), 'offers match contract annex I');
assert.equal(data.offers.find(o => o.key === 'escolinha-b').team_id, T2, 'offer linked to existing team by name');
assert.equal(data.offers.find(o => o.key === 'collins').team_id, T1);
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

// ─── Padrões de nome ───
const nameOk = async n => (await q(`select private.reenroll_name_ok($1) as ok`, [n]))[0].ok;
for (const n of ['João Ávila', 'Ana-Luíza D’Ângelo', 'Maria da Silva', 'Lia Ng']) assert.equal(await nameOk(n), true, `${n} accepted`);
for (const n of ['João', 'João da', 'João 2 Silva', 'João_Silva', 'João S']) assert.equal(await nameOk(n), false, `${n} rejected`);
assert.equal((await q(`select private.reenroll_title('maria DE lourdes d''avila') as t`))[0].t, "Maria de Lourdes d'Avila");

// ─── Cadastro ───
const EMERG = { emergency_name: 'maria souza', emergency_relation: 'Mãe', emergency_phone: '41988880000' };
const adultFields = { ...adult.data, ...EMERG };
const allKeys = Object.keys(adult.data);
await fails(call('reenroll_save', adultToken, ADULT, 'cadastro', { fields: adultFields, confirmed: [] }), /Confirme que está correto: CPF/, 'unconfirmed prefilled data is rejected');
await fails(call('reenroll_save', adultToken, ADULT, 'cadastro', { fields: { ...adultFields, cpf: '529.982.247-24' }, confirmed: allKeys }), /CPF do\(a\) atleta inválido/, 'invalid CPF rejected');
await fails(call('reenroll_save', adultToken, ADULT, 'cadastro', { fields: { ...adultFields, birth_date: 'xx' }, confirmed: allKeys }), /Data de nascimento inválida/, 'bad date handled');
await fails(call('reenroll_save', adultToken, ADULT, 'cadastro', { fields: { ...adultFields, full_name: 'Carla' }, confirmed: allKeys }), /nome e sobrenome completos/, 'first name alone is rejected');
await fails(call('reenroll_save', adultToken, ADULT, 'cadastro', { fields: { ...adultFields, full_name: 'Carla Souza 2' }, confirmed: allKeys }), /nome e sobrenome completos/, 'digits in the name are rejected');
await fails(call('reenroll_save', adultToken, ADULT, 'cadastro', { fields: { ...adultFields, emergency_phone: '123' }, confirmed: allKeys }), /contato de emergência inválido/, 'emergency phone validated');
await fails(call('reenroll_save', adultToken, ADULT, 'cadastro', { fields: { ...adultFields, emergency_relation: '' }, confirmed: allKeys }), /nome, parentesco e telefone/, 'emergency relation required');
r = await call('reenroll_save', adultToken, ADULT, 'cadastro', { fields: { ...adultFields, full_name: 'CARLA  SOUZA', email: 'Nova@Exemplo.com', phone: '(41) 99999-0000' }, confirmed: ['full_name', 'cpf', 'rg', 'birth_date', 'phone'] });
assert.deepEqual(r.missing, ['endereco', 'saude', 'equipe', 'termos', 'pagamento']);
let saved = (await q(`select submitted from public.reenrollments where athlete_id = $1`, [ADULT]))[0].submitted.cadastro;
assert.equal(saved.full_name, 'Carla Souza', 'all caps name is saved as Nome Sobrenome and counts as the same name');
assert.equal(saved.phone, '(41) 999990000', 'phone saved as (XX) XXXXXXXXX');
assert.equal(saved.email, 'nova@exemplo.com');
assert.equal(saved.emergency_contact, 'Maria Souza (mãe) - (41) 988880000', 'emergency contact composed in one standard');
await call('reenroll_save', adultToken, ADULT, 'cadastro', { fields: { ...adultFields, full_name: 'ana maria DA silva', email: 'nova@exemplo.com' }, confirmed: allKeys });
saved = (await q(`select submitted from public.reenrollments where athlete_id = $1`, [ADULT]))[0].submitted.cadastro;
assert.equal(saved.full_name, 'Ana Maria da Silva', 'particles stay lowercase');
await call('reenroll_save', adultToken, ADULT, 'cadastro', { fields: { ...adultFields, email: 'nova@exemplo.com', phone: '(41) 99999-0000' }, confirmed: ['full_name', 'cpf', 'rg', 'birth_date', 'phone'] });
let row = (await q(`select * from public.reenrollments where athlete_id = $1`, [ADULT]))[0];
assert.deepEqual(row.changed_fields, ['email'], 'changed field recorded');
assert.ok(row.confirmed_fields.includes('phone'), 'formatting difference counts as confirmation');
assert.equal(row.respondent_relation, 'atleta');
const adultAgain = await call('reenroll_get', adultToken);
assert.equal(adultAgain.athletes[0].reenrollment.cadastro.email, 'nova@exemplo.com', 'reviewed identification comes back for editing');
assert.ok(adultAgain.athletes[0].reenrollment.confirmed.includes('cpf'));

// Menor: responsável obrigatório; o(a) atleta pode não ter CPF nem RG
const kid = data.athletes.find(a => a.id === KID);
const kidFields = { ...kid.data, ...EMERG };
await fails(call('reenroll_save', famToken, KID, 'cadastro', { fields: { ...kidFields, parent_cpf: '' }, confirmed: Object.keys(kid.data) }), /Preencha: CPF do\(a\) responsável/, 'minor requires guardian CPF');
await fails(call('reenroll_save', famToken, KID, 'cadastro', { fields: { ...kidFields, cpf: kid.data.parent_cpf }, confirmed: Object.keys(kid.data) }), /não podem ser iguais/, 'athlete and guardian CPF must differ');
await call('reenroll_save', famToken, KID, 'cadastro', { fields: { ...kidFields, cpf: '', rg: '' }, confirmed: Object.keys(kid.data) });
assert.equal((await q(`select respondent_relation, respondent_name from public.reenrollments where athlete_id = $1`, [KID]))[0].respondent_name, 'Paula Lima', 'minor without CPF or RG is accepted');

// ─── Endereço, saúde, equipe, termos ───
await fails(call('reenroll_save', adultToken, ADULT, 'endereco', { cep: '123' }), /CEP inválido/);
await fails(call('reenroll_save', adultToken, ADULT, 'endereco', { cep: '80000-000', rua: 'Rua Nova', numero: '', bairro: 'Centro', cidade: 'Curitiba', uf: 'PR' }), /S\/N/, 'number or S/N required');
await fails(call('reenroll_save', adultToken, ADULT, 'endereco', { cep: '80000-000', rua: 'Rua Nova', numero: 'casa 3', bairro: 'Centro', cidade: 'Curitiba', uf: 'PR' }), /Número inválido/, 'number field takes only the number');
await call('reenroll_save', adultToken, ADULT, 'endereco', { cep: '80000000', rua: 'rua das flores', numero: 's/n', bairro: 'CENTRO', cidade: 'curitiba', uf: 'pr' });
assert.deepEqual((await q(`select submitted from public.reenrollments where athlete_id = $1`, [ADULT]))[0].submitted.endereco,
  { cep: '80000-000', rua: 'Rua das Flores', numero: 'S/N', complemento: '', bairro: 'Centro', cidade: 'Curitiba', uf: 'PR' }, 'address saved in one standard, s/n accepted');
await call('reenroll_save', adultToken, ADULT, 'endereco', { cep: '80000-000', rua: 'Rua Nova', numero: '10', complemento: 'Ap 2', bairro: 'Centro', cidade: 'Curitiba', uf: 'pr' });
const health = { estatura: '171', peso: '68,5', q3: 'Não', q4: ['Não'], q9: 'Regular', q9_1: '4', q10: ['Sedentarismo'], q12: ['Asma', 'Diabetes'], q13: ['Mãe'], q15: '' };
for (const n of [1, 2, 5, 6, 7, 8, 11, 14]) health['q' + n + '_yn'] = 'Não';
health.q14_yn = 'Sim';
await fails(call('reenroll_save', adultToken, ADULT, 'saude', health), /Detalhe a resposta da pergunta 14/, 'yes answers need detail');
health.q14_text = 'Insulina';
await call('reenroll_save', adultToken, ADULT, 'saude', health);
await fails(call('reenroll_save', adultToken, ADULT, 'equipe', { offer_key: 'x' }), /Escolha a turma/i);
await fails(call('reenroll_contract_preview', adultToken, ADULT, true), /antes do contrato/, 'contract needs the chosen class');
await call('reenroll_save', adultToken, ADULT, 'equipe', { offer_key: 'escolinha-b', note: 'Quero treinar à noite' });
const preview = await call('reenroll_contract_preview', adultToken, ADULT, false);
assert.equal(preview.version, CONTRATO_VERSION);
assert.equal(preview.data.minor, false);
assert.equal(preview.data.contratante.name, 'Carla Souza');
assert.equal(preview.data.contratante.phone, '(41) 999990000');
assert.equal(preview.data.turma.fee_cents, 11090, 'contract carries the class fee');
assert.equal(preview.data.endereco, 'Rua Nova, 10 - Ap 2 - Centro - Curitiba/PR - CEP 80000-000');
const HASH = 'a'.repeat(64), TERMS = { contrato: true, dados: true, declaracao: true, imagem: false, hash: HASH, version: CONTRATO_VERSION, ua: 'Teste' };
await fails(call('reenroll_save', adultToken, ADULT, 'termos', { ...TERMS, contrato: false }), /contrato/);
await fails(call('reenroll_save', adultToken, ADULT, 'termos', { ...TERMS, imagem: null }), /uso de imagem/, 'image choice is required (yes or no)');
await fails(call('reenroll_save', adultToken, ADULT, 'termos', { ...TERMS, version: 'contrato-antigo' }), /atualizado/, 'old contract version is refused');
r = await call('reenroll_save', adultToken, ADULT, 'termos', TERMS);
assert.deepEqual(r.missing, ['pagamento'], 'Pix receipt is still missing');
row = (await q(`select * from public.reenrollments where athlete_id = $1`, [ADULT]))[0];
assert.equal(row.image_consent, false, 'refusing image use does not block');
assert.equal(row.contract_hash, HASH);
assert.deepEqual(row.contract_data, preview.data, 'accepted data equals the preview the family read');
await fails(call('reenroll_finish', adultToken, ADULT), /pagamento/, 'cannot finish without the Pix receipt');

// Alterar dados depois do aceite exige aceitar de novo
await call('reenroll_save', adultToken, ADULT, 'equipe', { offer_key: 'collins' });
r = await call('reenroll_save', adultToken, ADULT, 'equipe', { offer_key: 'escolinha-b' });
assert.ok(r.missing.includes('termos'), 'changing the class voids the previous acceptance');
await call('reenroll_save', adultToken, ADULT, 'termos', TERMS);

// Comprovante do Pix
await fails(call('reenroll_upload_slot', adultToken, ADULT, 'exe'), /PDF ou imagem/);
const slot = await call('reenroll_upload_slot', adultToken, ADULT, 'jpg');
assert.match(slot.path, /^2027\/pix\//);
await fails(call('reenroll_attach_fee', adultToken, ADULT, slot.path, 'pix.jpg', 'image/jpeg', 1000), /Não recebemos/, 'file must exist in storage');
await q(`insert into storage.objects(bucket_id, name) values ('rematricula', $1)`, [slot.path]);
r = await call('reenroll_attach_fee', adultToken, ADULT, slot.path, 'pix.jpg', 'image/jpeg', 1000);
assert.deepEqual(r.missing, [], 'everything done');
await fails(call('reenroll_attach_fee', adultToken, ADULT, slot.path, 'pix.jpg', 'image/jpeg', 1000), /Não recebemos/, 'slot is single use');

// ─── Conclusão ───
r = await call('reenroll_finish', adultToken, ADULT);
assert.equal(r.ok, true);
const a = (await q(`select * from public.athletes where id = $1`, [ADULT]))[0];
assert.equal(a.email, 'nova@exemplo.com');
assert.equal(a.phone, '(41) 999990000');
assert.equal(a.emergency_contact, 'Maria Souza (mãe) - (41) 988880000');
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
assert.equal(row.regulation_version, 'regulamento-atleta-2027-v1');
assert.equal(row.contract_version, CONTRATO_VERSION);
assert.equal(row.fee_status, 'enviado', 'receipt waits for validation');
data = await call('reenroll_get', adultToken);
assert.equal(data.athletes[0].reenrollment.fee.status, 'enviado');
await fails(call('reenroll_upload_slot', adultToken, ADULT, 'jpg'), /não aceita novo comprovante/, 'no new receipt while waiting');
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
assert.deepEqual(byId[KID].missing, ['endereco', 'saude', 'equipe', 'termos', 'pagamento']);
assert.equal(byId[KID].contact_phone, '(41) 977771111');
assert.equal(byId[ADULT].fee_status, 'enviado');
assert.equal(byId[ADULT].fee_path, slot.path, 'admin sees the receipt');
assert.equal(byId[ADULT].offer_label, 'Escolinha B');
assert.equal(byId[ADULT].image_consent, false);
const ct = await call('reenroll_staff_contract', ADULT);
assert.equal(ct.hash, HASH);
assert.equal(ct.data.turma.key, 'escolinha-b');
await fails(call('reenroll_staff_fee', ADULT, 'reject', ''), /motivo/, 'rejection needs a reason');
await call('reenroll_staff_fee', ADULT, 'reject', 'Valor diferente de R$ 40');
await as(null);
data = await call('reenroll_start', '52998224725', '1990-05-20');
const adultToken2 = data.token;
data = await call('reenroll_get', adultToken2);
assert.equal(data.athletes[0].reenrollment.fee.status, 'recusado');
assert.equal(data.athletes[0].reenrollment.fee.note, 'Valor diferente de R$ 40', 'family sees the reason');
const slot2 = await call('reenroll_upload_slot', adultToken2, ADULT, 'pdf');
await q(`insert into storage.objects(bucket_id, name) values ('rematricula', $1)`, [slot2.path]);
await call('reenroll_attach_fee', adultToken2, ADULT, slot2.path, 'pix.pdf', 'application/pdf', 900);
await as(ADMIN);
await call('reenroll_staff_fee', ADULT, 'approve');
panel = await call('reenroll_panel', 2027);
assert.equal(panel.find(p => p.id === ADULT).fee_status, 'aprovado', 'confirmed after validation');
assert.equal(panel.find(p => p.id === ADULT).fee_reviewed_by, 'Admin');
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
assert.equal(panel.find(p => p.id === ADULT).fee_path, null, 'coach does not see the receipt');
await fails(call('reenroll_staff_fee', ADULT, 'reset'), /administração e o financeiro/, 'coach cannot validate receipts');
await fails(call('reenroll_staff_contract', ADULT), /Sem permissão/, 'coach cannot open the contract with personal data');

// Permissões de execução
const grants = await q(`select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'reenroll_%'`);
const anonGrant = Object.fromEntries(grants.map(g => [g.proname, g.anon]));
assert.equal(anonGrant.reenroll_panel, false, 'panel is not available to anonymous users');
assert.equal(anonGrant.reenroll_staff_set, false);
assert.equal(anonGrant.reenroll_start, true);
assert.equal(anonGrant.reenroll_attach, false, 'medical certificate upload stays closed');
for (const fn of ['reenroll_upload_slot', 'reenroll_upload_allowed', 'reenroll_attach_fee', 'reenroll_contract_preview']) assert.equal(anonGrant[fn], true, `${fn} open for the Pix receipt`);
for (const fn of ['reenroll_staff_fee', 'reenroll_staff_contract']) assert.equal(anonGrant[fn], false, `${fn} is staff only`);
assert.equal((await q(`select count(*)::int as n from pg_policies where policyname = 'rematricula_upload'`))[0].n, 1, 'single-use upload rule is back for receipts');
assert.equal((await q(`select has_table_privilege('anon', 'public.reenroll_offers', 'select') as s`))[0].s, false, 'offers table is not readable directly');
assert.equal((await q(`select has_table_privilege('anon', 'public.reenrollments', 'select') as s`))[0].s, false, 'table is not readable directly');

await db.close();
console.log('Rematrícula 2027: identificação, sessão, dados padronizados, turmas 2027, contrato, comprovante Pix, validação, recusa e painel do Huddle passaram.');
