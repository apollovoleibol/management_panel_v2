-- 049 · Rematrícula 2027
-- Formulário público (rematricula.html) em que o atleta adulto, ou o responsável pelo menor,
-- revisa o cadastro, reescreve endereço e anamnese, escolhe a equipe de 2027, aceita os termos
-- e envia o atestado de aptidão física. Também permite declinar da continuidade.
--
-- Segurança
--   * O navegador nunca lê tabelas: tudo passa por funções SECURITY DEFINER.
--   * Identificação: CPF (do atleta ou do responsável) ou WhatsApp + data de nascimento do atleta.
--     Erros não dizem qual dado está errado. Limite: 5 erros por identificador e 30 por IP em 30 min.
--   * A sessão é um token aleatório de 2 horas. O banco guarda apenas o hash (sha256).
--   * Endereço e anamnese atuais nunca são devolvidos ao formulário: precisam ser reescritos.
--   * Atestado: bucket privado. O upload anônimo só é aceito num caminho de uso único,
--     criado pela sessão e válido por 20 min. Somente a equipe autorizada lê os arquivos.
begin;

-- ─── Tabelas ───────────────────────────────────────────────────────────────
create table if not exists public.reenrollments (
  id uuid primary key default gen_random_uuid(),
  season smallint not null default 2027,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  status text not null default 'em_andamento' check (status in ('em_andamento','concluida','declinada')),
  steps jsonb not null default '{}'::jsonb,            -- {cadastro, endereco, saude, equipe, termos, atestado}: data/hora de cada etapa
  submitted jsonb not null default '{}'::jsonb,        -- o que foi enviado nesta rematrícula, por etapa
  confirmed_fields text[] not null default '{}',       -- dados pré-preenchidos marcados como corretos
  changed_fields text[] not null default '{}',         -- dados pré-preenchidos alterados
  previous_data jsonb,                                 -- cadastro anterior, guardado ao concluir
  team_2027_id uuid references public.teams(id) on delete set null,
  team_note text,
  regulation_version text,
  consents jsonb not null default '{}'::jsonb,         -- {dados, regulamento, imagem, declaracao: data/hora}
  consent_meta jsonb,                                  -- IP e navegador no aceite
  respondent_relation text check (respondent_relation in ('atleta','responsavel')),
  respondent_name text,
  atestado_path text,
  atestado_name text,
  atestado_mime text,
  atestado_size integer,
  atestado_uploaded_at timestamptz,
  decline_reason text,
  decline_note text,
  delete_data_requested boolean not null default false,
  declined_at timestamptz,
  declined_by text,                                    -- 'familia' ou nome de quem registrou na equipe
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season, athlete_id)
);
create index if not exists reenrollments_season_status on public.reenrollments(season, status);
alter table public.reenrollments enable row level security;
revoke all on public.reenrollments from anon, authenticated;

create table if not exists private.reenroll_sessions (
  token_hash bytea primary key,
  athlete_ids uuid[] not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create table if not exists private.reenroll_attempts (
  id bigserial primary key,
  ident text not null,
  ip text,
  ok boolean not null,
  at timestamptz not null default now()
);
create index if not exists reenroll_attempts_ident on private.reenroll_attempts(ident, at);
create index if not exists reenroll_attempts_ip on private.reenroll_attempts(ip, at);
create table if not exists private.reenroll_upload_slots (
  path text primary key,
  athlete_id uuid not null,
  token_hash bytea not null,
  expires_at timestamptz not null,
  used_at timestamptz
);

-- ─── Utilitários ───────────────────────────────────────────────────────────
create or replace function private.reenroll_season() returns smallint
language sql immutable set search_path = '' as $$ select 2027::smallint $$;

create or replace function private.reenroll_regulation() returns text
language sql immutable set search_path = '' as $$ select 'regulamento-atleta-2027-preliminar-1'::text $$;

create or replace function private.reenroll_digits(p text) returns text
language sql immutable set search_path = '' as $$ select regexp_replace(coalesce(p, ''), '\D', '', 'g') $$;

-- Telefone em 11 dígitos (DDD + 9 + número). Aceita +55 e números antigos sem o 9.
create or replace function private.reenroll_phone(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare d text := private.reenroll_digits(p);
begin
  if length(d) in (12, 13) and left(d, 2) = '55' then d := substr(d, 3); end if;
  if length(d) = 10 and substr(d, 3, 1) in ('6','7','8','9') then d := left(d, 2) || '9' || substr(d, 3); end if;
  return case when length(d) = 11 and substr(d, 3, 1) = '9' then d end;
end $$;

create or replace function private.reenroll_cpf_ok(p text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare d text := private.reenroll_digits(p); s int; r int; i int;
begin
  if length(d) <> 11 or d ~ '^(\d)\1{10}$' then return false; end if;
  s := 0; for i in 1..9 loop s := s + substr(d, i, 1)::int * (11 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  if r <> substr(d, 10, 1)::int then return false; end if;
  s := 0; for i in 1..10 loop s := s + substr(d, i, 1)::int * (12 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  return r = substr(d, 11, 1)::int;
end $$;

create or replace function private.reenroll_fmt_cpf(p text) returns text
language sql immutable set search_path = '' as $$
  select case when length(d) = 11 then substr(d,1,3)||'.'||substr(d,4,3)||'.'||substr(d,7,3)||'-'||substr(d,10,2) else nullif(btrim(p), '') end
  from (select private.reenroll_digits(p) d) x $$;

create or replace function private.reenroll_fmt_phone(p text) returns text
language sql immutable set search_path = '' as $$
  select case when d is not null then '('||substr(d,1,2)||') '||substr(d,3,5)||'-'||substr(d,8,4) else nullif(btrim(p), '') end
  from (select private.reenroll_phone(p) d) x $$;

create or replace function private.reenroll_txt(p jsonb, k text) returns text
language sql immutable set search_path = '' as $$ select nullif(btrim(p ->> k), '') $$;

-- Comparação de um campo do cadastro: ignora pontuação em CPF/telefone e espaços em textos
create or replace function private.reenroll_same(k text, a text, b text) returns boolean
language sql immutable set search_path = '' as $$
  select case
    when k in ('cpf','parent_cpf') then private.reenroll_digits(a) = private.reenroll_digits(b)
    when k in ('phone','parent_phone') then coalesce(private.reenroll_phone(a), private.reenroll_digits(a)) = coalesce(private.reenroll_phone(b), private.reenroll_digits(b))
    when k in ('email','parent_email') then lower(btrim(coalesce(a,''))) = lower(btrim(coalesce(b,'')))
    else regexp_replace(btrim(coalesce(a,'')), '\s+', ' ', 'g') = regexp_replace(btrim(coalesce(b,'')), '\s+', ' ', 'g')
  end $$;

create or replace function private.reenroll_is_minor(p_birth date) returns boolean
language sql stable set search_path = '' as $$ select p_birth is not null and p_birth > (current_date - interval '18 years')::date $$;

create or replace function private.reenroll_hash(p_token text) returns bytea
language sql immutable set search_path = '' as $$ select extensions.digest(coalesce(p_token, ''), 'sha256') $$;

-- Atletas da sessão (vazio se o token não existe ou expirou)
create or replace function private.reenroll_session_ids(p_token text) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.athlete_ids from private.reenroll_sessions s
    where s.token_hash = private.reenroll_hash(p_token) and s.expires_at > now()), '{}'::uuid[]) $$;

create or replace function private.reenroll_require(p_token text, p_athlete uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_athlete is null or not (p_athlete = any (private.reenroll_session_ids(p_token))) then
    raise exception 'Sua sessão expirou. Identifique-se novamente para continuar.' using errcode = 'P0001', hint = 'session';
  end if;
end $$;

create or replace function private.reenroll_row(p_athlete uuid) returns public.reenrollments
language plpgsql security definer set search_path = '' as $$
declare r public.reenrollments;
begin
  insert into public.reenrollments(season, athlete_id) values (private.reenroll_season(), p_athlete)
    on conflict (season, athlete_id) do nothing;
  select * into r from public.reenrollments where season = private.reenroll_season() and athlete_id = p_athlete for update;
  return r;
end $$;

-- Itens que faltam para concluir
create or replace function private.reenroll_missing(r public.reenrollments) returns text[]
language sql stable set search_path = '' as $$
  select array_remove(array[
    case when r.id is null or not (r.steps ? 'cadastro') then 'cadastro' end,
    case when r.id is null or not (r.steps ? 'endereco') then 'endereco' end,
    case when r.id is null or not (r.steps ? 'saude') then 'saude' end,
    case when r.id is null or not (r.steps ? 'equipe') then 'equipe' end,
    case when r.id is null or not (r.steps ? 'termos') then 'termos' end,
    case when r.id is null or r.atestado_path is null then 'atestado' end
  ], null) $$;

create or replace function private.reenroll_client_ip() returns text
language sql stable set search_path = '' as $$
  select nullif(btrim(split_part(coalesce(
    nullif(current_setting('request.headers', true), '')::json ->> 'cf-connecting-ip',
    nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ''), ',', 1)), '') $$;

-- ─── 1. Identificação ──────────────────────────────────────────────────────
create or replace function public.reenroll_start(p_identifier text, p_birth date, p_session text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_d text := private.reenroll_digits(p_identifier);
  v_phone text := private.reenroll_phone(p_identifier);
  v_ident text := encode(extensions.digest(coalesce(nullif(v_d, ''), lower(btrim(coalesce(p_identifier,'')))), 'sha256'), 'hex');
  v_ip text := private.reenroll_client_ip();
  v_ids uuid[]; v_others int; v_token text; v_prev uuid[];
  v_generic constant text := 'Não encontramos uma matrícula ativa com esses dados. Confira o CPF ou WhatsApp e a data de nascimento do(a) atleta.';
begin
  delete from private.reenroll_attempts where at < now() - interval '1 day';
  delete from private.reenroll_sessions where expires_at < now() - interval '1 day';
  if (select count(*) from private.reenroll_attempts a where a.ident = v_ident and not a.ok and a.at > now() - interval '30 minutes') >= 5
     or (v_ip is not null and (select count(*) from private.reenroll_attempts a where a.ip = v_ip and not a.ok and a.at > now() - interval '30 minutes') >= 30) then
    return jsonb_build_object('ok', false, 'error', 'Muitas tentativas sem sucesso. Aguarde 30 minutos e tente de novo, ou fale com a secretaria da Apollo.');
  end if;
  if p_birth is null or (length(v_d) <> 11 and v_phone is null) then
    insert into private.reenroll_attempts(ident, ip, ok) values (v_ident, v_ip, false);
    return jsonb_build_object('ok', false, 'error', v_generic);
  end if;

  select array_agg(a.id order by a.full_name) into v_ids from public.athletes a
  where a.is_active is true and a.birth_date = p_birth and (
    (length(v_d) = 11 and (private.reenroll_digits(a.cpf) = v_d or private.reenroll_digits(a.parent_cpf) = v_d))
    or (v_phone is not null and (private.reenroll_phone(a.phone) = v_phone or private.reenroll_phone(a.parent_phone) = v_phone)));

  insert into private.reenroll_attempts(ident, ip, ok) values (v_ident, v_ip, v_ids is not null);
  if v_ids is null then return jsonb_build_object('ok', false, 'error', v_generic); end if;

  -- Outro atleta ligado ao mesmo contato (irmãos): só informa a quantidade, depois de verificado
  select count(*) into v_others from public.athletes a
  where a.is_active is true and not (a.id = any (v_ids)) and (
    (length(v_d) = 11 and (private.reenroll_digits(a.cpf) = v_d or private.reenroll_digits(a.parent_cpf) = v_d))
    or (v_phone is not null and (private.reenroll_phone(a.phone) = v_phone or private.reenroll_phone(a.parent_phone) = v_phone)));

  v_prev := private.reenroll_session_ids(p_session);
  if cardinality(v_prev) > 0 then
    update private.reenroll_sessions set athlete_ids = (select array_agg(distinct x) from unnest(v_prev || v_ids) x),
      expires_at = greatest(expires_at, now() + interval '2 hours')
      where token_hash = private.reenroll_hash(p_session);
    v_token := p_session;
  else
    v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
    insert into private.reenroll_sessions(token_hash, athlete_ids, expires_at)
      values (private.reenroll_hash(v_token), v_ids, now() + interval '2 hours');
  end if;
  return jsonb_build_object('ok', true, 'token', v_token, 'others', v_others);
end $$;

-- ─── 2. Dados para revisão ─────────────────────────────────────────────────
create or replace function public.reenroll_get(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_ids uuid[] := private.reenroll_session_ids(p_token);
begin
  if cardinality(v_ids) = 0 then
    raise exception 'Sua sessão expirou. Identifique-se novamente para continuar.' using errcode = 'P0001', hint = 'session';
  end if;
  return jsonb_build_object(
    'season', private.reenroll_season(),
    'regulation', private.reenroll_regulation(),
    'expires_at', (select s.expires_at from private.reenroll_sessions s where s.token_hash = private.reenroll_hash(p_token)),
    'athletes', (select jsonb_agg(jsonb_build_object(
      'id', a.id,
      'minor', private.reenroll_is_minor(a.birth_date),
      'team', jsonb_build_object('id', t.id, 'name', t.name),
      -- Somente identificação e contatos. Endereço, anamnese, peso e altura não voltam ao navegador.
      'data', jsonb_build_object('full_name', a.full_name, 'cpf', private.reenroll_fmt_cpf(a.cpf), 'rg', a.rg,
        'birth_date', a.birth_date, 'email', a.email, 'phone', private.reenroll_fmt_phone(a.phone),
        'emergency_contact', a.emergency_contact, 'parent_name', a.parent_name,
        'parent_cpf', private.reenroll_fmt_cpf(a.parent_cpf), 'parent_rg', a.parent_rg,
        'parent_phone', private.reenroll_fmt_phone(a.parent_phone), 'parent_email', a.parent_email),
      'reenrollment', case when r.id is null then null else jsonb_build_object(
        'status', r.status, 'steps', r.steps, 'team_2027_id', r.team_2027_id, 'team_note', r.team_note,
        -- Identificação já revisada nesta rematrícula (sem endereço e sem saúde)
        'cadastro', r.submitted -> 'cadastro', 'confirmed', to_jsonb(r.confirmed_fields),
        'atestado', case when r.atestado_path is null then null else jsonb_build_object('name', r.atestado_name, 'uploaded_at', r.atestado_uploaded_at) end,
        'completed_at', r.completed_at, 'declined_at', r.declined_at, 'decline_reason', r.decline_reason) end
    ) order by a.full_name)
      from public.athletes a
      left join public.teams t on t.id = a.team_id
      left join public.reenrollments r on r.athlete_id = a.id and r.season = private.reenroll_season()
      where a.id = any (v_ids)),
    'teams', (select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'category', t.category,
        'gender', t.gender, 'age_min', t.age_min, 'age_max', t.age_max, 'location', l.name) order by t.name)
      from public.teams t left join public.training_locations l on l.id = t.location_id where t.is_active is true)
  );
end $$;

-- ─── 3. Gravação de cada etapa ─────────────────────────────────────────────
create or replace function public.reenroll_save(p_token text, p_athlete uuid, p_step text, p_data jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  a public.athletes; r public.reenrollments; v_minor boolean; f jsonb; k text; v text; cur text;
  v_conf text[] := '{}'; v_changed text[] := '{}'; v_req text[]; v_err text[] := '{}';
  v_labels constant jsonb := '{"full_name":"Nome do(a) atleta","cpf":"CPF do(a) atleta","rg":"RG do(a) atleta","birth_date":"Data de nascimento","email":"E-mail","phone":"WhatsApp do(a) atleta","emergency_contact":"Contato de emergência","parent_name":"Nome do(a) responsável","parent_cpf":"CPF do(a) responsável","parent_rg":"RG do(a) responsável","parent_phone":"WhatsApp do(a) responsável","parent_email":"E-mail do(a) responsável"}';
  v_keys constant text[] := array['full_name','cpf','rg','birth_date','email','phone','emergency_contact','parent_name','parent_cpf','parent_rg','parent_phone','parent_email'];
  q int; yn text; arr jsonb; n numeric; v_birth date;
begin
  perform private.reenroll_require(p_token, p_athlete);
  select * into a from public.athletes where id = p_athlete;
  r := private.reenroll_row(p_athlete);
  if r.status = 'concluida' then raise exception 'Esta rematrícula já foi concluída. Para alterar algum dado, fale com a secretaria.' using errcode = 'P0001'; end if;
  if r.status = 'declinada' then raise exception 'Você informou que não vai continuar em 2027. Reabra a rematrícula para continuar.' using errcode = 'P0001'; end if;
  p_data := coalesce(p_data, '{}'::jsonb);

  if p_step = 'cadastro' then
    f := coalesce(p_data -> 'fields', '{}'::jsonb);
    begin
      v_birth := nullif(f ->> 'birth_date', '')::date;
    exception when others then v_birth := null; v_err := v_err || 'Data de nascimento inválida'::text;
    end;
    if v_birth is not null and v_birth not between '1930-01-01'::date and current_date - 3 * 365 then
      v_err := v_err || 'Data de nascimento inválida'::text;
    end if;
    v_minor := private.reenroll_is_minor(coalesce(v_birth, a.birth_date));
    v_req := case when v_minor
      then array['full_name','cpf','birth_date','email','emergency_contact','parent_name','parent_cpf','parent_phone']
      else array['full_name','cpf','rg','birth_date','email','phone','emergency_contact'] end;
    foreach k in array v_keys loop
      v := private.reenroll_txt(f, k);
      cur := case k when 'full_name' then a.full_name when 'cpf' then a.cpf when 'rg' then a.rg
        when 'birth_date' then a.birth_date::text when 'email' then a.email when 'phone' then a.phone
        when 'emergency_contact' then a.emergency_contact when 'parent_name' then a.parent_name
        when 'parent_cpf' then a.parent_cpf when 'parent_rg' then a.parent_rg
        when 'parent_phone' then a.parent_phone when 'parent_email' then a.parent_email end;
      if v is null and k = any (v_req) then v_err := v_err || ('Preencha: ' || (v_labels ->> k)); continue; end if;
      if nullif(btrim(coalesce(cur, '')), '') is not null and v is not null then
        if private.reenroll_same(k, v, cur) then
          if not coalesce((p_data -> 'confirmed') ? k, false) then v_err := v_err || ('Confirme que está correto: ' || (v_labels ->> k)); end if;
          v_conf := v_conf || k;
        else v_changed := v_changed || k; end if;
      end if;
    end loop;
    if private.reenroll_txt(f, 'cpf') is not null and not private.reenroll_cpf_ok(f ->> 'cpf') then v_err := v_err || 'CPF do(a) atleta inválido'::text; end if;
    if private.reenroll_txt(f, 'parent_cpf') is not null and not private.reenroll_cpf_ok(f ->> 'parent_cpf') then v_err := v_err || 'CPF do(a) responsável inválido'::text; end if;
    if v_minor and private.reenroll_txt(f, 'cpf') is not null and private.reenroll_digits(f ->> 'cpf') = private.reenroll_digits(f ->> 'parent_cpf') then
      v_err := v_err || 'O CPF do(a) atleta e o do(a) responsável não podem ser iguais'::text; end if;
    foreach k in array array['phone','parent_phone'] loop
      if private.reenroll_txt(f, k) is not null and private.reenroll_phone(f ->> k) is null then v_err := v_err || ((v_labels ->> k) || ' inválido: use DDD + número'); end if;
    end loop;
    foreach k in array array['email','parent_email'] loop
      if private.reenroll_txt(f, k) is not null and (f ->> k) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then v_err := v_err || ((v_labels ->> k) || ' inválido'); end if;
    end loop;
    if cardinality(v_err) > 0 then raise exception '%', array_to_string(v_err, E'\n') using errcode = 'P0001', hint = 'validation'; end if;
    update public.reenrollments set submitted = submitted || jsonb_build_object('cadastro', f),
      confirmed_fields = v_conf, changed_fields = v_changed,
      respondent_relation = case when v_minor then 'responsavel' else 'atleta' end,
      respondent_name = case when v_minor then private.reenroll_txt(f, 'parent_name') else private.reenroll_txt(f, 'full_name') end,
      steps = steps || jsonb_build_object('cadastro', now()), updated_at = now() where id = r.id;

  elsif p_step = 'endereco' then
    foreach k in array array['cep','rua','numero','bairro','cidade','uf'] loop
      if private.reenroll_txt(p_data, k) is null then v_err := v_err || ('Preencha o endereço: ' || k); end if;
    end loop;
    if length(private.reenroll_digits(p_data ->> 'cep')) <> 8 then v_err := v_err || 'CEP inválido'::text; end if;
    if cardinality(v_err) > 0 then raise exception '%', array_to_string(v_err, E'\n') using errcode = 'P0001', hint = 'validation'; end if;
    update public.reenrollments set submitted = submitted || jsonb_build_object('endereco', p_data),
      steps = steps || jsonb_build_object('endereco', now()), updated_at = now() where id = r.id;

  elsif p_step = 'saude' then
    n := case when (p_data ->> 'estatura') ~ '^\d{2,3}$' then (p_data ->> 'estatura')::numeric end;
    if n is null or n not between 50 and 250 then v_err := v_err || 'Estatura inválida (em centímetros)'::text; end if;
    n := case when (p_data ->> 'peso') ~ '^\d{1,3}([.,]\d)?$' then replace(p_data ->> 'peso', ',', '.')::numeric end;
    if n is null or n not between 10 and 250 then v_err := v_err || 'Peso inválido (em quilos)'::text; end if;
    foreach q in array array[1,2,5,6,7,8,11,14] loop
      yn := p_data ->> ('q' || q || '_yn');
      if yn is null or yn not in ('Sim','Não') then v_err := v_err || ('Responda a pergunta ' || q);
      elsif yn = 'Sim' and private.reenroll_txt(p_data, 'q' || q || '_text') is null then v_err := v_err || ('Detalhe a resposta da pergunta ' || q); end if;
    end loop;
    if coalesce(p_data ->> 'q3', '') not in ('Sim','Não') then v_err := v_err || 'Responda a pergunta 3'::text; end if;
    foreach q in array array[4,10,12,13] loop
      arr := p_data -> ('q' || q);
      if jsonb_typeof(arr) is distinct from 'array' or jsonb_array_length(arr) = 0 then v_err := v_err || ('Responda a pergunta ' || q); end if;
    end loop;
    if coalesce(p_data ->> 'q9', '') not in ('Adequada','Regular','Inadequada') then v_err := v_err || 'Responda a pergunta 9'::text; end if;
    if private.reenroll_txt(p_data, 'q9_1') is null then v_err := v_err || 'Responda a pergunta 9.1'::text; end if;
    if cardinality(v_err) > 0 then raise exception '%', array_to_string(v_err, E'\n') using errcode = 'P0001', hint = 'validation'; end if;
    update public.reenrollments set submitted = submitted || jsonb_build_object('saude', p_data),
      steps = steps || jsonb_build_object('saude', now()), updated_at = now() where id = r.id;

  elsif p_step = 'equipe' then
    if not exists (select 1 from public.teams t where t.id = nullif(p_data ->> 'team_id', '')::uuid and t.is_active is true) then
      raise exception 'Escolha a equipe para 2027.' using errcode = 'P0001', hint = 'validation';
    end if;
    update public.reenrollments set team_2027_id = (p_data ->> 'team_id')::uuid,
      team_note = left(private.reenroll_txt(p_data, 'note'), 500),
      steps = steps || jsonb_build_object('equipe', now()), updated_at = now() where id = r.id;

  elsif p_step = 'termos' then
    foreach k in array array['dados','regulamento','imagem','declaracao'] loop
      if coalesce((p_data ->> k)::boolean, false) is not true then v_err := v_err || ('Aceite necessário: ' || k); end if;
    end loop;
    if cardinality(v_err) > 0 then raise exception '%', array_to_string(v_err, E'\n') using errcode = 'P0001', hint = 'validation'; end if;
    update public.reenrollments set regulation_version = private.reenroll_regulation(),
      consents = jsonb_build_object('dados', now(), 'regulamento', now(), 'imagem', now(), 'declaracao', now()),
      consent_meta = jsonb_build_object('ip', private.reenroll_client_ip(), 'ua', left(p_data ->> 'ua', 300)),
      steps = steps || jsonb_build_object('termos', now()), updated_at = now() where id = r.id;
  else
    raise exception 'Etapa desconhecida.' using errcode = 'P0001';
  end if;

  select * into r from public.reenrollments where id = r.id;
  return jsonb_build_object('ok', true, 'steps', r.steps, 'missing', to_jsonb(private.reenroll_missing(r)));
end $$;

-- ─── 4. Atestado de aptidão física ─────────────────────────────────────────
create or replace function public.reenroll_upload_slot(p_token text, p_athlete uuid, p_ext text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_ext text := lower(regexp_replace(coalesce(p_ext, ''), '[^a-zA-Z0-9]', '', 'g')); v_path text; r public.reenrollments;
begin
  perform private.reenroll_require(p_token, p_athlete);
  r := private.reenroll_row(p_athlete);
  if r.status <> 'em_andamento' then raise exception 'Esta rematrícula não aceita novos arquivos.' using errcode = 'P0001'; end if;
  if v_ext not in ('pdf','jpg','jpeg','png','webp','heic','heif') then
    raise exception 'Envie o atestado em PDF ou foto (JPG, PNG, HEIC).' using errcode = 'P0001', hint = 'validation';
  end if;
  delete from private.reenroll_upload_slots where expires_at < now() - interval '1 day';
  v_path := private.reenroll_season() || '/' || p_athlete || '/' ||
    translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/=', '-_') || '.' || v_ext;
  insert into private.reenroll_upload_slots(path, athlete_id, token_hash, expires_at)
    values (v_path, p_athlete, private.reenroll_hash(p_token), now() + interval '20 minutes');
  return jsonb_build_object('bucket', 'rematricula', 'path', v_path);
end $$;

-- Usada pela regra do Storage: o caminho foi criado por uma sessão válida e ainda não foi usado
create or replace function public.reenroll_upload_allowed(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.reenroll_upload_slots s
    where s.path = p_name and s.used_at is null and s.expires_at > now()) $$;

create or replace function public.reenroll_attach(p_token text, p_athlete uuid, p_path text, p_name text, p_mime text, p_size integer)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare r public.reenrollments;
begin
  perform private.reenroll_require(p_token, p_athlete);
  if not exists (select 1 from private.reenroll_upload_slots s where s.path = p_path and s.athlete_id = p_athlete
       and s.token_hash = private.reenroll_hash(p_token) and s.used_at is null and s.expires_at > now())
     or not exists (select 1 from storage.objects o where o.bucket_id = 'rematricula' and o.name = p_path) then
    raise exception 'Não recebemos o arquivo. Tente enviar de novo.' using errcode = 'P0001';
  end if;
  update private.reenroll_upload_slots set used_at = now() where path = p_path;
  r := private.reenroll_row(p_athlete);
  update public.reenrollments set atestado_path = p_path, atestado_name = left(p_name, 200), atestado_mime = left(p_mime, 100),
    atestado_size = p_size, atestado_uploaded_at = now(), steps = steps || jsonb_build_object('atestado', now()), updated_at = now()
    where id = r.id returning * into r;
  return jsonb_build_object('ok', true, 'steps', r.steps, 'missing', to_jsonb(private.reenroll_missing(r)));
end $$;

-- ─── 5. Conclusão: grava o cadastro revisado na ficha do atleta ────────────
create or replace function public.reenroll_finish(p_token text, p_athlete uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare r public.reenrollments; a public.athletes; c jsonb; e jsonb; h jsonb; v_missing text[]; v_addr text;
begin
  perform private.reenroll_require(p_token, p_athlete);
  r := private.reenroll_row(p_athlete);
  if r.status = 'concluida' then return jsonb_build_object('ok', true, 'completed_at', r.completed_at); end if;
  if r.status = 'declinada' then raise exception 'Reabra a rematrícula para concluir.' using errcode = 'P0001'; end if;
  v_missing := private.reenroll_missing(r);
  if cardinality(v_missing) > 0 then
    raise exception 'Ainda falta: %', array_to_string(v_missing, ', ') using errcode = 'P0001', hint = 'missing';
  end if;
  select * into a from public.athletes where id = p_athlete;
  c := r.submitted -> 'cadastro'; e := r.submitted -> 'endereco'; h := r.submitted -> 'saude';
  v_addr := concat_ws(' - ',
    (e ->> 'rua') || ', ' || (e ->> 'numero'), private.reenroll_txt(e, 'complemento'), e ->> 'bairro',
    (e ->> 'cidade') || '/' || upper(e ->> 'uf'),
    'CEP ' || substr(private.reenroll_digits(e ->> 'cep'), 1, 5) || '-' || substr(private.reenroll_digits(e ->> 'cep'), 6, 3));

  update public.reenrollments set previous_data = jsonb_build_object(
      'full_name', a.full_name, 'cpf', a.cpf, 'rg', a.rg, 'birth_date', a.birth_date, 'email', a.email, 'phone', a.phone,
      'emergency_contact', a.emergency_contact, 'parent_name', a.parent_name, 'parent_cpf', a.parent_cpf, 'parent_rg', a.parent_rg,
      'parent_phone', a.parent_phone, 'parent_email', a.parent_email, 'address', a.address, 'height', a.height, 'weight', a.weight,
      'anamnesis', jsonb_build_object('restrictions', a.anamnesis_restrictions, 'pain', a.anamnesis_pain, 'fainting', a.anamnesis_fainting,
        'posture', a.anamnesis_posture, 'lesion', a.anamnesis_lesion, 'surgery', a.anamnesis_surgery, 'deficiency', a.anamnesis_deficiency,
        'other_activities', a.anamnesis_other_activities, 'eating_habits', a.anamnesis_eating_habits, 'meals_per_day', a.anamnesis_meals_per_day,
        'personal_history', a.anamnesis_personal_history, 'continuous_illness', a.anamnesis_continuous_illness,
        'diagnostics', a.anamnesis_diagnostics, 'family_history', a.anamnesis_family_history,
        'medications', a.anamnesis_medications, 'observations', a.anamnesis_observations))
    where id = r.id;

  update public.athletes set
    full_name = coalesce(private.reenroll_txt(c, 'full_name'), full_name),
    cpf = private.reenroll_fmt_cpf(c ->> 'cpf'),
    rg = private.reenroll_txt(c, 'rg'),
    birth_date = coalesce(nullif(c ->> 'birth_date', '')::date, birth_date),
    email = lower(private.reenroll_txt(c, 'email')),
    phone = private.reenroll_fmt_phone(c ->> 'phone'),
    emergency_contact = private.reenroll_txt(c, 'emergency_contact'),
    parent_name = private.reenroll_txt(c, 'parent_name'),
    parent_cpf = private.reenroll_fmt_cpf(c ->> 'parent_cpf'),
    parent_rg = private.reenroll_txt(c, 'parent_rg'),
    parent_phone = private.reenroll_fmt_phone(c ->> 'parent_phone'),
    parent_email = lower(private.reenroll_txt(c, 'parent_email')),
    address = v_addr,
    height = h ->> 'estatura',
    weight = replace(h ->> 'peso', ',', '.'),
    anamnesis_restrictions = (h ->> 'q1_yn') || case when h ->> 'q1_yn' = 'Sim' then ': ' || (h ->> 'q1_text') else '' end,
    anamnesis_pain = (h ->> 'q2_yn') || case when h ->> 'q2_yn' = 'Sim' then ': ' || (h ->> 'q2_text') else '' end,
    anamnesis_fainting = h ->> 'q3',
    anamnesis_posture = (select string_agg(x, '|') from jsonb_array_elements_text(h -> 'q4') x),
    anamnesis_lesion = (h ->> 'q5_yn') || case when h ->> 'q5_yn' = 'Sim' then ': ' || (h ->> 'q5_text') else '' end,
    anamnesis_surgery = (h ->> 'q6_yn') || case when h ->> 'q6_yn' = 'Sim' then ': ' || (h ->> 'q6_text') else '' end,
    anamnesis_deficiency = (h ->> 'q7_yn') || case when h ->> 'q7_yn' = 'Sim' then ': ' || (h ->> 'q7_text') else '' end,
    anamnesis_other_activities = (h ->> 'q8_yn') || case when h ->> 'q8_yn' = 'Sim' then ': ' || (h ->> 'q8_text') else '' end,
    anamnesis_eating_habits = h ->> 'q9',
    anamnesis_meals_per_day = h ->> 'q9_1',
    anamnesis_personal_history = (select string_agg(x, '|') from jsonb_array_elements_text(h -> 'q10') x),
    anamnesis_continuous_illness = (h ->> 'q11_yn') || case when h ->> 'q11_yn' = 'Sim' then ': ' || (h ->> 'q11_text') else '' end,
    anamnesis_diagnostics = (select string_agg(x, '|') from jsonb_array_elements_text(h -> 'q12') x),
    anamnesis_family_history = (select string_agg(x, '|') from jsonb_array_elements_text(h -> 'q13') x),
    anamnesis_medications = (h ->> 'q14_yn') || case when h ->> 'q14_yn' = 'Sim' then ': ' || (h ->> 'q14_text') else '' end,
    anamnesis_observations = private.reenroll_txt(h, 'q15')
  where id = p_athlete;

  update public.reenrollments set status = 'concluida', completed_at = now(), updated_at = now() where id = r.id returning * into r;
  return jsonb_build_object('ok', true, 'completed_at', r.completed_at);
end $$;

-- ─── 6. Não continuar em 2027 / mudar de ideia ─────────────────────────────
create or replace function public.reenroll_decline(p_token text, p_athlete uuid, p_reason text, p_note text, p_delete boolean)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare r public.reenrollments;
begin
  perform private.reenroll_require(p_token, p_athlete);
  r := private.reenroll_row(p_athlete);
  if r.status = 'concluida' then raise exception 'A rematrícula já foi concluída. Para cancelar, fale com a secretaria.' using errcode = 'P0001'; end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'Conte o motivo para nos ajudar a melhorar.' using errcode = 'P0001', hint = 'validation'; end if;
  update public.reenrollments set status = 'declinada', decline_reason = left(p_reason, 120), decline_note = left(nullif(btrim(p_note), ''), 1000),
    delete_data_requested = coalesce(p_delete, false), declined_at = now(), declined_by = 'familia', updated_at = now()
    where id = r.id returning * into r;
  return jsonb_build_object('ok', true, 'declined_at', r.declined_at);
end $$;

create or replace function public.reenroll_reopen(p_token text, p_athlete uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r public.reenrollments;
begin
  perform private.reenroll_require(p_token, p_athlete);
  r := private.reenroll_row(p_athlete);
  if r.status = 'declinada' then
    update public.reenrollments set status = 'em_andamento', declined_at = null, decline_reason = null, decline_note = null,
      delete_data_requested = false, declined_by = null, updated_at = now() where id = r.id;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ─── 7. Huddle: acompanhamento pela equipe ─────────────────────────────────
create or replace function private.reenroll_staff_role() returns text
language sql stable security definer set search_path = '' as $$
  select case when private.v2_role() in ('admin','finance','coordination','attendance','coach') then private.v2_role() end $$;

create or replace function public.reenroll_panel(p_season smallint default 2027) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_role text := private.reenroll_staff_role();
begin
  if v_role is null then raise exception 'Sem permissão para acompanhar rematrículas.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', a.id, 'name', a.full_name, 'birth_date', a.birth_date, 'minor', private.reenroll_is_minor(a.birth_date),
      'team_id', a.team_id, 'team_2027_id', r.team_2027_id, 'team_note', r.team_note,
      'contact_name', case when private.reenroll_is_minor(a.birth_date) then coalesce(a.parent_name, 'Responsável') else a.full_name end,
      'contact_phone', private.reenroll_fmt_phone(coalesce(case when private.reenroll_is_minor(a.birth_date) then a.parent_phone end, a.phone, a.parent_phone)),
      'status', coalesce(r.status, 'pendente'),
      'missing', to_jsonb(private.reenroll_missing(r)),
      'steps', coalesce(r.steps, '{}'::jsonb),
      'changed_fields', to_jsonb(coalesce(r.changed_fields, '{}')),
      'respondent', r.respondent_name,
      'atestado_path', case when v_role <> 'finance' then r.atestado_path end,
      'atestado_name', r.atestado_name, 'atestado_at', r.atestado_uploaded_at,
      'decline_reason', r.decline_reason, 'decline_note', r.decline_note, 'delete_requested', coalesce(r.delete_data_requested, false),
      'declined_at', r.declined_at, 'declined_by', r.declined_by, 'completed_at', r.completed_at, 'updated_at', r.updated_at
    ) order by a.full_name)
    from public.athletes a
    left join public.reenrollments r on r.athlete_id = a.id and r.season = p_season
    where a.is_active is true
      and (private.v2_team_scope(a.team_id) or (r.team_2027_id is not null and private.v2_team_scope(r.team_2027_id)))), '[]'::jsonb);
end $$;

-- Registro feito pela equipe (família avisou por telefone ou presencialmente)
create or replace function public.reenroll_staff_set(p_athlete uuid, p_action text, p_reason text default null, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare a public.athletes; r public.reenrollments; v_who text;
begin
  select * into a from public.athletes where id = p_athlete;
  if a.id is null or not private.v2_can('athletes', 'edit') or not private.v2_team_scope(a.team_id) then
    raise exception 'Sem permissão para alterar esta rematrícula.' using errcode = '42501';
  end if;
  select coalesce(p.full_name, p.email) into v_who from public.profiles p where p.id = (select auth.uid());
  r := private.reenroll_row(p_athlete);
  if p_action = 'decline' then
    if r.status = 'concluida' then raise exception 'Rematrícula concluída. Reabra antes de registrar a saída.' using errcode = 'P0001'; end if;
    if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'Informe o motivo.' using errcode = 'P0001'; end if;
    update public.reenrollments set status = 'declinada', decline_reason = left(p_reason, 120), decline_note = left(nullif(btrim(p_note), ''), 1000),
      declined_at = now(), declined_by = coalesce(v_who, 'Equipe Apollo'), updated_at = now() where id = r.id;
  elsif p_action = 'reopen' then
    update public.reenrollments set status = 'em_andamento', declined_at = null, decline_reason = null, decline_note = null,
      delete_data_requested = false, declined_by = null, completed_at = null, updated_at = now() where id = r.id;
  else
    raise exception 'Ação desconhecida.' using errcode = 'P0001';
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Leitura do atestado: administração, coordenação, atendimento e técnicos da equipe
create or replace function private.reenroll_staff_can_read(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.reenroll_staff_role() in ('admin','coordination','attendance','coach')
    and exists (select 1 from public.reenrollments r join public.athletes a on a.id = r.athlete_id
      where r.atestado_path = p_name
        and (private.v2_team_scope(a.team_id) or (r.team_2027_id is not null and private.v2_team_scope(r.team_2027_id)))) $$;

-- ─── Storage ───────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rematricula', 'rematricula', false, 15728640,
  array['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists rematricula_upload on storage.objects;
create policy rematricula_upload on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'rematricula' and public.reenroll_upload_allowed(name));
drop policy if exists rematricula_staff_read on storage.objects;
create policy rematricula_staff_read on storage.objects for select to authenticated
  using (bucket_id = 'rematricula' and private.reenroll_staff_can_read(name));

-- ─── Permissões ────────────────────────────────────────────────────────────
revoke execute on function
  public.reenroll_start(text, date, text), public.reenroll_get(text), public.reenroll_save(text, uuid, text, jsonb),
  public.reenroll_upload_slot(text, uuid, text), public.reenroll_upload_allowed(text),
  public.reenroll_attach(text, uuid, text, text, text, integer), public.reenroll_finish(text, uuid),
  public.reenroll_decline(text, uuid, text, text, boolean), public.reenroll_reopen(text, uuid),
  public.reenroll_panel(smallint), public.reenroll_staff_set(uuid, text, text, text)
  from public;
grant execute on function
  public.reenroll_start(text, date, text), public.reenroll_get(text), public.reenroll_save(text, uuid, text, jsonb),
  public.reenroll_upload_slot(text, uuid, text), public.reenroll_upload_allowed(text),
  public.reenroll_attach(text, uuid, text, text, text, integer), public.reenroll_finish(text, uuid),
  public.reenroll_decline(text, uuid, text, text, boolean), public.reenroll_reopen(text, uuid)
  to anon, authenticated;
-- O Supabase concede EXECUTE a anon por padrão nas funções novas do schema public: o painel é só da equipe
revoke execute on function public.reenroll_panel(smallint), public.reenroll_staff_set(uuid, text, text, text) from anon;
grant execute on function public.reenroll_panel(smallint), public.reenroll_staff_set(uuid, text, text, text) to authenticated;
-- Funções internas com privilégio do dono: só as funções acima as chamam
revoke execute on function private.reenroll_session_ids(text), private.reenroll_require(text, uuid), private.reenroll_row(uuid),
  private.reenroll_staff_role(), private.reenroll_staff_can_read(text) from public;
grant execute on function private.reenroll_staff_can_read(text) to authenticated;

commit;
