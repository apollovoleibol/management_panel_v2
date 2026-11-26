-- 051 · Rematrícula 2027: contrato, turmas 2027, taxa por Pix e dados padronizados
--   * Turmas de 2027 (public.reenroll_offers), ligadas às equipes atuais pelo nome. A escolha da turma
--     define a equipe de 2027 e a mensalidade que entra no contrato. Os dados batem com o Anexo I de
--     js/contrato-2027.js (TURMAS_2027); o teste confere.
--   * Termos: o Regulamento passa a integrar o Contrato de Prestação de Serviços (contrato-2027-v1).
--     O aceite guarda a versão, os dados que preencheram o contrato (congelados) e o código SHA-256
--     do texto aceito. O uso de imagem vira escolha: autorizar ou não autorizar.
--   * Taxa de rematrícula (R$ 40, Pix): comprovante anexado no formulário (bucket privado). Só a
--     administração e o financeiro abrem e validam. A rematrícula só fica "confirmada" depois da validação.
--   * Cadastro padronizado: nomes completos em "Nome Sobrenome", telefone (XX) XXXXXXXXX,
--     endereço com logradouro, número (ou S/N) e bairro, contato de emergência com nome, parentesco
--     e telefone. Atleta menor de idade pode não ter CPF nem RG: vale o documento do responsável.
begin;

-- ─── Turmas 2027 ───────────────────────────────────────────────────────────
create table if not exists public.reenroll_offers (
  key text primary key,
  season smallint not null default 2027,
  team_id uuid references public.teams(id) on delete set null,
  label text not null,
  location text not null,
  days text not null,
  time_label text not null,
  freq text not null,
  fee_cents integer not null check (fee_cents > 0),
  note text,
  sort smallint not null default 0,
  is_active boolean not null default true
);
alter table public.reenroll_offers enable row level security;
revoke all on public.reenroll_offers from anon, authenticated;

insert into public.reenroll_offers (key, team_id, label, location, days, time_label, freq, fee_cents, sort)
select o.key, (select t.id from public.teams t where t.name = o.team_name order by t.is_active desc limit 1),
  o.label, o.location, o.days, o.time_label, o.freq, o.fee_cents, o.sort
from (values
  ('escolinha-b', 'Escolinha B', 'Escolinha B', 'Núcleo Apollo – Uberaba', 'Sábado', '13h30–14h30', '1x por semana', 11090, 1),
  ('escolinha-c', 'Escolinha C', 'Escolinha C', 'Núcleo Apollo – Uberaba', 'Terça e sexta', '18h–19h', '2x por semana', 17990, 2),
  ('pre-equipe', 'Pré-equipe', 'Pré-equipe', 'Núcleo Apollo – Uberaba', 'Sábado', '12h30–13h30', '1x por semana', 11090, 3),
  ('sub-17-18-m', 'Equipe Masculino', 'Sub-17/18 masculino', 'Núcleo Apollo – Uberaba', 'Terça e quinta', '16h30–18h', '2x por semana', 15990, 4),
  ('sub-16-17-f', 'Equipe Feminino', 'Sub-16/17 feminino', 'Núcleo Apollo – Uberaba', 'Terça e quinta', '15h–16h30', '2x por semana', 19490, 5),
  ('johnson', 'Equipe Johnson', 'Johnson – adulto feminino', 'Núcleo Apollo – Uberaba', 'Sábado', '10h30–12h30', '1x por semana', 10390, 6),
  ('escolinha-d', 'Escolinha D', 'Escolinha D', 'Núcleo Funcel – São Francisco / Bom Retiro', 'Terça e sexta', '17h–18h', '2x por semana', 17990, 7),
  ('pre-equipe-b', 'Pré-equipe B (Núcleo Funcel)', 'Pré-equipe B', 'Núcleo Funcel – São Francisco / Bom Retiro', 'Terça e sexta', '16h–17h', '2x por semana', 17990, 8),
  ('sub-15-16-f', 'Sub-15/16/17 Feminino', 'Sub-15/16 feminino', 'Núcleo Funcel – São Francisco / Bom Retiro', 'Segunda e quarta', '14h–15h30', '2x por semana', 10000, 9),
  ('aldrin', 'Equipe Aldrin', 'Aldrin – adulto masculino', 'Núcleo PUC – Prado Velho', 'Sábado', '10h–12h', '1x por semana', 10390, 10),
  ('borman', 'Equipe Borman', 'Borman – adulto masculino', 'Núcleo PUC – Prado Velho', 'Sábado', '12h–14h', '1x por semana', 10390, 11),
  ('collins', 'Equipe Collins', 'Collins – adulto masculino', 'Núcleo PUC – Prado Velho', 'Sexta', '20h–22h', '1x por semana', 10390, 12),
  ('hopper', 'Equipe Hopper', 'Hopper – adulto feminino', 'Núcleo PUC – Prado Velho', 'Quarta', '20h–22h', '1x por semana', 10390, 13),
  ('armstrong', 'Equipe Armstrong', 'Armstrong – Adulto Start', 'Núcleo PUC – Prado Velho', 'Segunda, quarta e sábado', '19h–20h (seg. e qua.); 9h–10h15 (sáb.)', '3x por semana', 19000, 14)
) as o(key, team_name, label, location, days, time_label, freq, fee_cents, sort)
on conflict (key) do update set team_id = excluded.team_id, label = excluded.label, location = excluded.location, days = excluded.days,
  time_label = excluded.time_label, freq = excluded.freq, fee_cents = excluded.fee_cents, sort = excluded.sort;

-- ─── Novas colunas da rematrícula ──────────────────────────────────────────
alter table public.reenrollments
  add column if not exists offer_key text references public.reenroll_offers(key),
  add column if not exists contract_version text,
  add column if not exists contract_hash text,
  add column if not exists contract_data jsonb,
  add column if not exists image_consent boolean,
  add column if not exists fee_status text not null default 'pendente',
  add column if not exists fee_path text,
  add column if not exists fee_name text,
  add column if not exists fee_mime text,
  add column if not exists fee_size integer,
  add column if not exists fee_uploaded_at timestamptz,
  add column if not exists fee_reviewed_at timestamptz,
  add column if not exists fee_reviewed_by text,
  add column if not exists fee_note text;
alter table public.reenrollments drop constraint if exists reenrollments_fee_status_check;
alter table public.reenrollments add constraint reenrollments_fee_status_check check (fee_status in ('pendente','enviado','aprovado','recusado'));

-- ─── Utilitários de formato ────────────────────────────────────────────────
create or replace function private.reenroll_contract() returns text
language sql immutable set search_path = '' as $$ select 'contrato-2027-v1'::text $$;

create or replace function private.reenroll_regulation() returns text
language sql immutable set search_path = '' as $$ select 'regulamento-atleta-2027-v1'::text $$;

-- Telefone sempre (XX) XXXXXXXXX
create or replace function private.reenroll_fmt_phone(p text) returns text
language sql immutable set search_path = '' as $$
  select case when d is not null then '(' || substr(d, 1, 2) || ') ' || substr(d, 3) else nullif(btrim(p), '') end
  from (select private.reenroll_phone(p) d) x $$;

-- "joão DA silva" → "João da Silva". Partículas (da, de, do, das, dos, e) em minúsculas, exceto no início.
create or replace function private.reenroll_title(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare w text; out text := ''; i int := 0; part text; parts text[]; j int;
begin
  foreach w in array regexp_split_to_array(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g'), ' ') loop
    i := i + 1;
    if w = '' then continue; end if;
    if i > 1 and lower(w) in ('da','de','do','das','dos','e','di','du','del','la') then out := out || ' ' || lower(w); continue; end if;
    parts := string_to_array(w, '-'); j := 0;
    foreach part in array parts loop
      j := j + 1;
      parts[j] := case
        when part ~* '^d''' and length(part) > 2 then 'd''' || upper(substr(part, 3, 1)) || lower(substr(part, 4))
        else upper(left(part, 1)) || lower(substr(part, 2)) end;
    end loop;
    out := out || case when out = '' then '' else ' ' end || array_to_string(parts, '-');
  end loop;
  return nullif(out, '');
end $$;

-- Nome completo: só letras (com acento), espaço, hífen e apóstrofo; ao menos nome e sobrenome
create or replace function private.reenroll_name_ok(p text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(btrim(p), '') ~ '^[A-Za-zÀ-ÖØ-öø-ÿ''’-]+( [A-Za-zÀ-ÖØ-öø-ÿ''’-]+)+$'
    and coalesce(btrim(p), '') !~ '[0-9_]'
    and (select count(*) from regexp_split_to_table(btrim(p), '\s+') w where length(w) >= 2 and lower(w) not in ('da','de','do','das','dos','e')) >= 2 $$;

create or replace function private.reenroll_birth_br(p text) returns text
language sql immutable set search_path = '' as $$
  select case when p ~ '^\d{4}-\d{2}-\d{2}' then substr(p, 9, 2) || '/' || substr(p, 6, 2) || '/' || substr(p, 1, 4) end $$;

-- Endereço por extenso a partir do que foi enviado nesta rematrícula
create or replace function private.reenroll_addr(e jsonb) returns text
language sql immutable set search_path = '' as $$
  select case when e is null then null else concat_ws(' - ',
    (e ->> 'rua') || ', ' || (e ->> 'numero'), private.reenroll_txt(e, 'complemento'), e ->> 'bairro',
    (e ->> 'cidade') || '/' || upper(e ->> 'uf'),
    'CEP ' || substr(private.reenroll_digits(e ->> 'cep'), 1, 5) || '-' || substr(private.reenroll_digits(e ->> 'cep'), 6, 3)) end $$;

-- Itens que faltam: o aceite precisa ser da versão atual do contrato e o comprovante precisa estar anexado
create or replace function private.reenroll_missing(r public.reenrollments) returns text[]
language sql stable set search_path = '' as $$
  select array_remove(array[
    case when r.id is null or not (r.steps ? 'cadastro') then 'cadastro' end,
    case when r.id is null or not (r.steps ? 'endereco') then 'endereco' end,
    case when r.id is null or not (r.steps ? 'saude') then 'saude' end,
    case when r.id is null or not (r.steps ? 'equipe') or r.offer_key is null then 'equipe' end,
    case when r.id is null or not (r.steps ? 'termos') or r.contract_version is distinct from private.reenroll_contract() then 'termos' end,
    case when r.id is null or r.fee_path is null then 'pagamento' end
  ], null) $$;

-- Dados que preenchem o contrato. Montados só no servidor, a partir do que foi salvo nesta rematrícula.
create or replace function private.reenroll_contract_data(r public.reenrollments, p_image boolean) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a public.athletes; c jsonb := r.submitted -> 'cadastro'; o public.reenroll_offers; v_minor boolean;
begin
  select * into a from public.athletes where id = r.athlete_id;
  select * into o from public.reenroll_offers where key = r.offer_key;
  v_minor := private.reenroll_is_minor(coalesce(nullif(c ->> 'birth_date', '')::date, a.birth_date));
  return jsonb_build_object(
    'minor', v_minor,
    'atleta', jsonb_strip_nulls(jsonb_build_object('name', private.reenroll_txt(c, 'full_name'), 'cpf', private.reenroll_fmt_cpf(nullif(c ->> 'cpf', '')),
      'rg', private.reenroll_txt(c, 'rg'), 'birth', private.reenroll_birth_br(c ->> 'birth_date'))),
    'contratante', jsonb_strip_nulls(case when v_minor
      then jsonb_build_object('name', private.reenroll_txt(c, 'parent_name'), 'cpf', private.reenroll_fmt_cpf(c ->> 'parent_cpf'), 'rg', private.reenroll_txt(c, 'parent_rg'),
        'email', lower(coalesce(private.reenroll_txt(c, 'parent_email'), private.reenroll_txt(c, 'email'))), 'phone', private.reenroll_fmt_phone(c ->> 'parent_phone'))
      else jsonb_build_object('name', private.reenroll_txt(c, 'full_name'), 'cpf', private.reenroll_fmt_cpf(c ->> 'cpf'), 'rg', private.reenroll_txt(c, 'rg'),
        'email', lower(private.reenroll_txt(c, 'email')), 'phone', private.reenroll_fmt_phone(c ->> 'phone')) end),
    'endereco', private.reenroll_addr(r.submitted -> 'endereco'),
    'turma', case when o.key is null then null else jsonb_build_object('key', o.key, 'label', o.label, 'location', o.location, 'days', o.days,
      'time', o.time_label, 'freq', o.freq, 'fee_cents', o.fee_cents) end,
    'imagem', p_image);
end $$;

-- ─── Leitura para o formulário ─────────────────────────────────────────────
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
    'contract', private.reenroll_contract(),
    'expires_at', (select s.expires_at from private.reenroll_sessions s where s.token_hash = private.reenroll_hash(p_token)),
    'athletes', (select jsonb_agg(jsonb_build_object(
      'id', a.id,
      'minor', private.reenroll_is_minor(a.birth_date),
      'team', jsonb_build_object('id', t.id, 'name', t.name),
      'data', jsonb_build_object('full_name', a.full_name, 'cpf', private.reenroll_fmt_cpf(a.cpf), 'rg', a.rg,
        'birth_date', a.birth_date, 'email', a.email, 'phone', private.reenroll_fmt_phone(a.phone),
        'emergency_contact', a.emergency_contact, 'parent_name', a.parent_name,
        'parent_cpf', private.reenroll_fmt_cpf(a.parent_cpf), 'parent_rg', a.parent_rg,
        'parent_phone', private.reenroll_fmt_phone(a.parent_phone), 'parent_email', a.parent_email),
      'reenrollment', case when r.id is null then null else jsonb_build_object(
        'status', r.status, 'steps', r.steps, 'team_2027_id', r.team_2027_id, 'team_note', r.team_note, 'offer_key', r.offer_key,
        'cadastro', r.submitted -> 'cadastro', 'confirmed', to_jsonb(r.confirmed_fields),
        -- Endereço digitado NESTA rematrícula (o antigo, da ficha, nunca volta ao navegador)
        'endereco', private.reenroll_addr(r.submitted -> 'endereco'),
        'contract_version', r.contract_version, 'contract_hash', r.contract_hash, 'image_consent', r.image_consent,
        'contract_at', r.consents ->> 'contrato',
        'fee', jsonb_build_object('status', r.fee_status, 'name', r.fee_name, 'uploaded_at', r.fee_uploaded_at, 'note', r.fee_note, 'reviewed_at', r.fee_reviewed_at),
        'completed_at', r.completed_at, 'declined_at', r.declined_at, 'decline_reason', r.decline_reason) end
    ) order by a.full_name)
      from public.athletes a
      left join public.teams t on t.id = a.team_id
      left join public.reenrollments r on r.athlete_id = a.id and r.season = private.reenroll_season()
      where a.id = any (v_ids)),
    'teams', (select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) order by t.name) from public.teams t where t.is_active is true),
    'offers', (select jsonb_agg(jsonb_build_object('key', o.key, 'team_id', o.team_id, 'label', o.label, 'location', o.location, 'days', o.days,
        'time', o.time_label, 'freq', o.freq, 'fee_cents', o.fee_cents, 'note', o.note) order by o.sort)
      from public.reenroll_offers o where o.is_active and o.season = private.reenroll_season())
  );
end $$;

-- Prévia do contrato com os dados desta rematrícula (o formulário mostra e calcula o código de integridade)
create or replace function public.reenroll_contract_preview(p_token text, p_athlete uuid, p_image boolean)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare r public.reenrollments;
begin
  perform private.reenroll_require(p_token, p_athlete);
  r := private.reenroll_row(p_athlete);
  if not (r.steps ? 'cadastro') or not (r.steps ? 'endereco') or r.offer_key is null then
    raise exception 'Complete os dados cadastrais, o endereço e a turma antes do contrato.' using errcode = 'P0001', hint = 'validation';
  end if;
  return jsonb_build_object('version', private.reenroll_contract(), 'data', private.reenroll_contract_data(r, p_image));
end $$;

-- ─── Gravação de cada etapa ────────────────────────────────────────────────
create or replace function public.reenroll_save(p_token text, p_athlete uuid, p_step text, p_data jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  a public.athletes; r public.reenrollments; v_minor boolean; f jsonb; k text; v text; cur text;
  v_conf text[] := '{}'; v_changed text[] := '{}'; v_req text[]; v_err text[] := '{}';
  v_labels constant jsonb := '{"full_name":"Nome do(a) atleta","cpf":"CPF do(a) atleta","rg":"RG do(a) atleta","birth_date":"Data de nascimento","email":"E-mail","phone":"WhatsApp do(a) atleta","emergency_contact":"Contato de emergência","parent_name":"Nome do(a) responsável","parent_cpf":"CPF do(a) responsável","parent_rg":"RG do(a) responsável","parent_phone":"WhatsApp do(a) responsável","parent_email":"E-mail do(a) responsável"}';
  v_keys constant text[] := array['full_name','cpf','rg','birth_date','email','phone','parent_name','parent_cpf','parent_rg','parent_phone','parent_email'];
  q int; yn text; arr jsonb; n numeric; v_birth date; e jsonb; o public.reenroll_offers; v_em text; v_num text;
begin
  perform private.reenroll_require(p_token, p_athlete);
  select * into a from public.athletes where id = p_athlete;
  r := private.reenroll_row(p_athlete);
  if r.status = 'concluida' then raise exception 'Esta rematrícula já foi concluída. Para alterar algum dado, fale com a secretaria.' using errcode = 'P0001'; end if;
  if r.status = 'declinada' then raise exception 'Você informou que não vai continuar em 2027. Reabra a rematrícula para continuar.' using errcode = 'P0001'; end if;
  p_data := coalesce(p_data, '{}'::jsonb);

  if p_step = 'cadastro' then
    f := coalesce(p_data -> 'fields', '{}'::jsonb);
    -- Padroniza antes de comparar e validar
    foreach k in array array['full_name','parent_name','emergency_name'] loop
      if private.reenroll_txt(f, k) is not null then f := f || jsonb_build_object(k, private.reenroll_title(f ->> k)); end if;
    end loop;
    foreach k in array array['cpf','parent_cpf'] loop
      if private.reenroll_txt(f, k) is not null then f := f || jsonb_build_object(k, private.reenroll_fmt_cpf(f ->> k)); end if;
    end loop;
    foreach k in array array['phone','parent_phone','emergency_phone'] loop
      if private.reenroll_txt(f, k) is not null and private.reenroll_phone(f ->> k) is not null then f := f || jsonb_build_object(k, private.reenroll_fmt_phone(f ->> k)); end if;
    end loop;
    foreach k in array array['rg','parent_rg'] loop
      if private.reenroll_txt(f, k) is not null then f := f || jsonb_build_object(k, upper(regexp_replace(btrim(f ->> k), '\s+', '', 'g'))); end if;
    end loop;
    foreach k in array array['email','parent_email'] loop
      if private.reenroll_txt(f, k) is not null then f := f || jsonb_build_object(k, lower(btrim(f ->> k))); end if;
    end loop;
    begin
      v_birth := nullif(f ->> 'birth_date', '')::date;
    exception when others then v_birth := null; v_err := v_err || 'Data de nascimento inválida'::text;
    end;
    if v_birth is not null and v_birth not between '1930-01-01'::date and current_date - 3 * 365 then
      v_err := v_err || 'Data de nascimento inválida'::text;
    end if;
    v_minor := private.reenroll_is_minor(coalesce(v_birth, a.birth_date));
    -- Menor de idade pode não ter CPF nem RG: os documentos do responsável identificam o contrato
    v_req := case when v_minor
      then array['full_name','birth_date','email','parent_name','parent_cpf','parent_phone']
      else array['full_name','cpf','rg','birth_date','email','phone'] end;
    foreach k in array v_keys loop
      v := private.reenroll_txt(f, k);
      cur := case k when 'full_name' then a.full_name when 'cpf' then a.cpf when 'rg' then a.rg
        when 'birth_date' then a.birth_date::text when 'email' then a.email when 'phone' then a.phone
        when 'parent_name' then a.parent_name when 'parent_cpf' then a.parent_cpf when 'parent_rg' then a.parent_rg
        when 'parent_phone' then a.parent_phone when 'parent_email' then a.parent_email end;
      if v is null and k = any (v_req) then v_err := v_err || ('Preencha: ' || (v_labels ->> k)); continue; end if;
      if nullif(btrim(coalesce(cur, '')), '') is not null and v is not null then
        if private.reenroll_same(k, v, cur) or (k in ('full_name','parent_name') and lower(v) = lower(regexp_replace(btrim(cur), '\s+', ' ', 'g'))) then
          if not coalesce((p_data -> 'confirmed') ? k, false) then v_err := v_err || ('Confirme que está correto: ' || (v_labels ->> k)); end if;
          v_conf := v_conf || k;
        else v_changed := v_changed || k; end if;
      end if;
    end loop;
    if private.reenroll_txt(f, 'full_name') is not null and not private.reenroll_name_ok(f ->> 'full_name') then
      v_err := v_err || 'Nome do(a) atleta: informe nome e sobrenome completos, só com letras'::text; end if;
    if private.reenroll_txt(f, 'parent_name') is not null and not private.reenroll_name_ok(f ->> 'parent_name') then
      v_err := v_err || 'Nome do(a) responsável: informe nome e sobrenome completos, só com letras'::text; end if;
    if private.reenroll_txt(f, 'cpf') is not null and not private.reenroll_cpf_ok(f ->> 'cpf') then v_err := v_err || 'CPF do(a) atleta inválido'::text; end if;
    if private.reenroll_txt(f, 'parent_cpf') is not null and not private.reenroll_cpf_ok(f ->> 'parent_cpf') then v_err := v_err || 'CPF do(a) responsável inválido'::text; end if;
    if v_minor and private.reenroll_txt(f, 'cpf') is not null and private.reenroll_digits(f ->> 'cpf') = private.reenroll_digits(f ->> 'parent_cpf') then
      v_err := v_err || 'O CPF do(a) atleta e o do(a) responsável não podem ser iguais'::text; end if;
    foreach k in array array['phone','parent_phone'] loop
      if private.reenroll_txt(f, k) is not null and private.reenroll_phone(f ->> k) is null then v_err := v_err || ((v_labels ->> k) || ' inválido: use DDD + celular com 9 dígitos'); end if;
    end loop;
    foreach k in array array['email','parent_email'] loop
      if private.reenroll_txt(f, k) is not null and (f ->> k) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then v_err := v_err || ((v_labels ->> k) || ' inválido'); end if;
    end loop;
    -- Contato de emergência: nome, parentesco e telefone
    if private.reenroll_txt(f, 'emergency_name') is null or private.reenroll_txt(f, 'emergency_relation') is null or private.reenroll_txt(f, 'emergency_phone') is null then
      v_err := v_err || 'Contato de emergência: informe nome, parentesco e telefone'::text;
    elsif private.reenroll_phone(f ->> 'emergency_phone') is null then
      v_err := v_err || 'Telefone do contato de emergência inválido: use DDD + celular com 9 dígitos'::text;
    elsif (f ->> 'emergency_name') !~ '^[A-Za-zÀ-ÖØ-öø-ÿ''’ -]+$' then
      v_err := v_err || 'Nome do contato de emergência: use só letras'::text;
    else
      v_em := (f ->> 'emergency_name') || ' (' || lower(btrim(f ->> 'emergency_relation')) || ') - ' || private.reenroll_fmt_phone(f ->> 'emergency_phone');
      f := f || jsonb_build_object('emergency_contact', v_em);
    end if;
    if cardinality(v_err) > 0 then raise exception '%', array_to_string(v_err, E'\n') using errcode = 'P0001', hint = 'validation'; end if;
    update public.reenrollments set submitted = submitted || jsonb_build_object('cadastro', f),
      confirmed_fields = v_conf, changed_fields = v_changed,
      respondent_relation = case when v_minor then 'responsavel' else 'atleta' end,
      respondent_name = case when v_minor then private.reenroll_txt(f, 'parent_name') else private.reenroll_txt(f, 'full_name') end,
      steps = (steps - 'termos') || jsonb_build_object('cadastro', now()), contract_version = null, updated_at = now() where id = r.id;

  elsif p_step = 'endereco' then
    e := p_data;
    v_num := upper(regexp_replace(coalesce(e ->> 'numero', ''), '\s+', '', 'g'));
    if v_num in ('SN', 'S/N', 'S.N', 'S.N.', 'SEMNUMERO', 'SEMNÚMERO') then v_num := 'S/N'; end if;
    foreach k in array array['cep','rua','bairro','cidade','uf'] loop
      if private.reenroll_txt(e, k) is null then v_err := v_err || ('Preencha o endereço: ' || k); end if;
    end loop;
    if v_num = '' then v_err := v_err || 'Preencha o número (ou S/N se não houver)'::text;
    elsif v_num <> 'S/N' and v_num !~ '^\d{1,6}[A-Z]?$' then v_err := v_err || 'Número inválido: use só o número (ex.: 120 ou 120A) ou S/N'::text; end if;
    if length(private.reenroll_digits(e ->> 'cep')) <> 8 then v_err := v_err || 'CEP inválido'::text; end if;
    if coalesce(e ->> 'uf', '') !~* '^[a-z]{2}$' then v_err := v_err || 'UF inválida'::text; end if;
    if cardinality(v_err) > 0 then raise exception '%', array_to_string(v_err, E'\n') using errcode = 'P0001', hint = 'validation'; end if;
    e := jsonb_build_object('cep', substr(private.reenroll_digits(e ->> 'cep'), 1, 5) || '-' || substr(private.reenroll_digits(e ->> 'cep'), 6, 3),
      'rua', private.reenroll_title(e ->> 'rua'), 'numero', v_num, 'complemento', coalesce(btrim(e ->> 'complemento'), ''),
      'bairro', private.reenroll_title(e ->> 'bairro'), 'cidade', private.reenroll_title(e ->> 'cidade'), 'uf', upper(e ->> 'uf'));
    update public.reenrollments set submitted = submitted || jsonb_build_object('endereco', e),
      steps = (steps - 'termos') || jsonb_build_object('endereco', now()), contract_version = null, updated_at = now() where id = r.id;

  elsif p_step = 'saude' then
    n := case when (p_data ->> 'estatura') ~ '^\d{2,3}$' then (p_data ->> 'estatura')::numeric end;
    if n is null or n not between 50 and 250 then v_err := v_err || 'Estatura inválida (em centímetros, só números)'::text; end if;
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
    update public.reenrollments set submitted = submitted || jsonb_build_object('saude', p_data || jsonb_build_object('peso', replace(p_data ->> 'peso', ',', '.'))),
      steps = steps || jsonb_build_object('saude', now()), updated_at = now() where id = r.id;

  elsif p_step = 'equipe' then
    select * into o from public.reenroll_offers where key = p_data ->> 'offer_key' and is_active and season = private.reenroll_season();
    if o.key is null then raise exception 'Escolha a turma para 2027.' using errcode = 'P0001', hint = 'validation'; end if;
    update public.reenrollments set offer_key = o.key, team_2027_id = o.team_id,
      team_note = left(private.reenroll_txt(p_data, 'note'), 500),
      steps = (steps - 'termos') || jsonb_build_object('equipe', now()), contract_version = null, updated_at = now() where id = r.id;

  elsif p_step = 'termos' then
    foreach k in array array['contrato','dados','declaracao'] loop
      if coalesce((p_data ->> k)::boolean, false) is not true then v_err := v_err || ('Aceite necessário: ' || k); end if;
    end loop;
    if jsonb_typeof(p_data -> 'imagem') is distinct from 'boolean' then v_err := v_err || 'Escolha se autoriza ou não o uso de imagem'::text; end if;
    if coalesce(p_data ->> 'hash', '') !~ '^[0-9a-f]{64}$' then v_err := v_err || 'Abra o contrato antes de aceitar'::text; end if;
    if p_data ->> 'version' is distinct from private.reenroll_contract() then v_err := v_err || 'O contrato foi atualizado. Recarregue a página e leia a nova versão'::text; end if;
    if not (r.steps ? 'cadastro') or not (r.steps ? 'endereco') or r.offer_key is null then v_err := v_err || 'Complete os dados cadastrais, o endereço e a turma antes do contrato'::text; end if;
    if cardinality(v_err) > 0 then raise exception '%', array_to_string(v_err, E'\n') using errcode = 'P0001', hint = 'validation'; end if;
    update public.reenrollments set regulation_version = private.reenroll_regulation(), contract_version = private.reenroll_contract(),
      contract_hash = p_data ->> 'hash', image_consent = (p_data ->> 'imagem')::boolean,
      contract_data = private.reenroll_contract_data(r, (p_data ->> 'imagem')::boolean),
      consents = jsonb_build_object('contrato', now(), 'regulamento', now(), 'dados', now(), 'declaracao', now(),
        'imagem', jsonb_build_object('autoriza', (p_data ->> 'imagem')::boolean, 'em', now())),
      consent_meta = jsonb_build_object('ip', private.reenroll_client_ip(), 'ua', left(p_data ->> 'ua', 300)),
      steps = steps || jsonb_build_object('termos', now()), updated_at = now() where id = r.id;
  else
    raise exception 'Etapa desconhecida.' using errcode = 'P0001';
  end if;

  select * into r from public.reenrollments where id = r.id;
  return jsonb_build_object('ok', true, 'steps', r.steps, 'missing', to_jsonb(private.reenroll_missing(r)));
end $$;

-- ─── Comprovante do Pix da taxa ────────────────────────────────────────────
-- Aceito durante o preenchimento ou, depois de concluída, quando a administração recusou o comprovante
create or replace function public.reenroll_upload_slot(p_token text, p_athlete uuid, p_ext text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_ext text := lower(regexp_replace(coalesce(p_ext, ''), '[^a-zA-Z0-9]', '', 'g')); v_path text; r public.reenrollments;
begin
  perform private.reenroll_require(p_token, p_athlete);
  r := private.reenroll_row(p_athlete);
  if not (r.status = 'em_andamento' or (r.status = 'concluida' and r.fee_status = 'recusado')) or r.fee_status = 'aprovado' then
    raise exception 'Esta rematrícula não aceita novo comprovante.' using errcode = 'P0001';
  end if;
  if v_ext not in ('pdf','jpg','jpeg','png','webp','heic','heif') then
    raise exception 'Envie o comprovante em PDF ou imagem (JPG, PNG, HEIC).' using errcode = 'P0001', hint = 'validation';
  end if;
  delete from private.reenroll_upload_slots where expires_at < now() - interval '1 day';
  v_path := private.reenroll_season() || '/pix/' || p_athlete || '/' ||
    translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/=', '-_') || '.' || v_ext;
  insert into private.reenroll_upload_slots(path, athlete_id, token_hash, expires_at)
    values (v_path, p_athlete, private.reenroll_hash(p_token), now() + interval '20 minutes');
  return jsonb_build_object('bucket', 'rematricula', 'path', v_path);
end $$;

create or replace function public.reenroll_attach_fee(p_token text, p_athlete uuid, p_path text, p_name text, p_mime text, p_size integer)
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
  update public.reenrollments set fee_path = p_path, fee_name = left(p_name, 200), fee_mime = left(p_mime, 100), fee_size = p_size,
    fee_uploaded_at = now(), fee_status = 'enviado', fee_note = null, fee_reviewed_at = null, fee_reviewed_by = null,
    steps = steps || jsonb_build_object('pagamento', now()), updated_at = now()
    where id = r.id returning * into r;
  return jsonb_build_object('ok', true, 'steps', r.steps, 'missing', to_jsonb(private.reenroll_missing(r)));
end $$;

-- ─── Conclusão ─────────────────────────────────────────────────────────────
create or replace function public.reenroll_finish(p_token text, p_athlete uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare r public.reenrollments; a public.athletes; c jsonb; h jsonb; v_missing text[];
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
  c := r.submitted -> 'cadastro'; h := r.submitted -> 'saude';

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
    cpf = private.reenroll_fmt_cpf(nullif(c ->> 'cpf', '')),
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
    address = private.reenroll_addr(r.submitted -> 'endereco'),
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

-- ─── Huddle ────────────────────────────────────────────────────────────────
create or replace function public.reenroll_panel(p_season smallint default 2027) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_role text := private.reenroll_staff_role(); v_money boolean := private.reenroll_staff_role() in ('admin','finance');
begin
  if v_role is null then raise exception 'Sem permissão para acompanhar rematrículas.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', a.id, 'name', a.full_name, 'birth_date', a.birth_date, 'minor', private.reenroll_is_minor(a.birth_date),
      'team_id', a.team_id, 'team_2027_id', r.team_2027_id, 'team_note', r.team_note,
      'offer_key', r.offer_key, 'offer_label', o.label,
      'contact_name', case when private.reenroll_is_minor(a.birth_date) then coalesce(a.parent_name, 'Responsável') else a.full_name end,
      'contact_phone', private.reenroll_fmt_phone(coalesce(case when private.reenroll_is_minor(a.birth_date) then a.parent_phone end, a.phone, a.parent_phone)),
      'status', coalesce(r.status, 'pendente'),
      'missing', to_jsonb(private.reenroll_missing(r)),
      'steps', coalesce(r.steps, '{}'::jsonb),
      'changed_fields', to_jsonb(coalesce(r.changed_fields, '{}')),
      'respondent', r.respondent_name,
      'image_consent', r.image_consent,
      'contract_version', r.contract_version, 'contract_at', r.consents ->> 'contrato',
      'fee_status', coalesce(r.fee_status, 'pendente'), 'fee_note', r.fee_note, 'fee_at', r.fee_uploaded_at,
      'fee_reviewed_at', r.fee_reviewed_at, 'fee_reviewed_by', r.fee_reviewed_by,
      'fee_path', case when v_money then r.fee_path end, 'fee_name', case when v_money then r.fee_name end,
      'atestado_path', case when v_role <> 'finance' then r.atestado_path end,
      'decline_reason', r.decline_reason, 'decline_note', r.decline_note, 'delete_requested', coalesce(r.delete_data_requested, false),
      'declined_at', r.declined_at, 'declined_by', r.declined_by, 'completed_at', r.completed_at, 'updated_at', r.updated_at
    ) order by a.full_name)
    from public.athletes a
    left join public.reenrollments r on r.athlete_id = a.id and r.season = p_season
    left join public.reenroll_offers o on o.key = r.offer_key
    where a.is_active is true
      and (private.v2_team_scope(a.team_id) or (r.team_2027_id is not null and private.v2_team_scope(r.team_2027_id)))), '[]'::jsonb);
end $$;

-- Contrato aceito (dados congelados e registro do aceite): administração, financeiro, coordenação e atendimento
create or replace function public.reenroll_staff_contract(p_athlete uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r public.reenrollments;
begin
  if private.reenroll_staff_role() not in ('admin','finance','coordination','attendance') then
    raise exception 'Sem permissão para ver o contrato.' using errcode = '42501';
  end if;
  select * into r from public.reenrollments where athlete_id = p_athlete and season = private.reenroll_season();
  if r.contract_data is null then raise exception 'O contrato ainda não foi aceito.' using errcode = 'P0001'; end if;
  return jsonb_build_object('version', r.contract_version, 'hash', r.contract_hash, 'data', r.contract_data,
    'accepted_at', r.consents ->> 'contrato', 'ip', r.consent_meta ->> 'ip', 'ua', r.consent_meta ->> 'ua', 'name', r.respondent_name);
end $$;

-- Validação do comprovante: administração e financeiro
create or replace function public.reenroll_staff_fee(p_athlete uuid, p_action text, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare r public.reenrollments; v_who text;
begin
  if private.reenroll_staff_role() not in ('admin','finance') then
    raise exception 'Somente a administração e o financeiro validam o comprovante.' using errcode = '42501';
  end if;
  select * into r from public.reenrollments where athlete_id = p_athlete and season = private.reenroll_season() for update;
  if r.fee_path is null then raise exception 'Nenhum comprovante foi enviado.' using errcode = 'P0001'; end if;
  select coalesce(p.full_name, p.email) into v_who from public.profiles p where p.id = (select auth.uid());
  if p_action = 'approve' then
    update public.reenrollments set fee_status = 'aprovado', fee_note = null, fee_reviewed_at = now(), fee_reviewed_by = coalesce(v_who, 'Equipe Apollo'), updated_at = now() where id = r.id;
  elsif p_action = 'reject' then
    if nullif(btrim(coalesce(p_note, '')), '') is null then raise exception 'Informe o motivo da recusa: ele aparece para a família.' using errcode = 'P0001'; end if;
    update public.reenrollments set fee_status = 'recusado', fee_note = left(btrim(p_note), 300), fee_reviewed_at = now(), fee_reviewed_by = coalesce(v_who, 'Equipe Apollo'), updated_at = now() where id = r.id;
  elsif p_action = 'reset' then
    update public.reenrollments set fee_status = 'enviado', fee_note = null, fee_reviewed_at = null, fee_reviewed_by = null, updated_at = now() where id = r.id;
  else
    raise exception 'Ação desconhecida.' using errcode = 'P0001';
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Leitura de arquivos: atestado (legado) como antes; comprovante só administração e financeiro
create or replace function private.reenroll_staff_can_read(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.reenrollments r join public.athletes a on a.id = r.athlete_id
      where r.atestado_path = p_name and private.reenroll_staff_role() in ('admin','coordination','attendance','coach')
        and (private.v2_team_scope(a.team_id) or (r.team_2027_id is not null and private.v2_team_scope(r.team_2027_id))))
    or exists (select 1 from public.reenrollments r where r.fee_path = p_name and private.reenroll_staff_role() in ('admin','finance')) $$;

-- ─── Storage: envio anônimo volta a valer, só para o comprovante ───────────
drop policy if exists rematricula_upload on storage.objects;
create policy rematricula_upload on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'rematricula' and public.reenroll_upload_allowed(name));

-- ─── Permissões ────────────────────────────────────────────────────────────
revoke execute on function public.reenroll_contract_preview(text, uuid, boolean), public.reenroll_attach_fee(text, uuid, text, text, text, integer),
  public.reenroll_staff_contract(uuid), public.reenroll_staff_fee(uuid, text, text) from public;
grant execute on function public.reenroll_upload_slot(text, uuid, text), public.reenroll_upload_allowed(text),
  public.reenroll_contract_preview(text, uuid, boolean), public.reenroll_attach_fee(text, uuid, text, text, text, integer) to anon, authenticated;
revoke execute on function public.reenroll_staff_contract(uuid), public.reenroll_staff_fee(uuid, text, text) from anon;
grant execute on function public.reenroll_staff_contract(uuid), public.reenroll_staff_fee(uuid, text, text) to authenticated;
-- O atestado continua fechado
revoke execute on function public.reenroll_attach(text, uuid, text, text, text, integer) from public, anon, authenticated;
revoke execute on function private.reenroll_contract_data(public.reenrollments, boolean) from public;

commit;
