-- 037 · Agendamento ligado à ficha do atleta e passagem automática para "Tecnofit".
-- 1. tryouts.athlete_id: a ficha criada pelo cadastro do chatbot (ou pela administração).
--    Preenchida automaticamente quando a ficha é criada (mesmo telefone do agendamento,
--    no campo do atleta ou do responsável, ou o mesmo nome) e no histórico existente.
-- 2. Quem está "Em cadastro" e já aparece nos relatórios do Tecnofit importados no Huddle
--    (ou foi vinculado a um cliente do Tecnofit) passa para "Tecnofit" sozinho.
begin;

alter table public.tryouts add column if not exists athlete_id uuid references public.athletes(id) on delete set null;
create index if not exists tryouts_athlete_idx on public.tryouts(athlete_id);

-- Nome comparável: maiúsculas, sem acentos e com espaços simples
create or replace function private.norm_name(p text) returns text language sql immutable set search_path = '' as $$
  select nullif(regexp_replace(upper(translate(trim(coalesce(p, '')),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')), '\s+', ' ', 'g'), '');
$$;
create or replace function private.norm_phone(p text) returns text language sql immutable set search_path = '' as $$
  select nullif(right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 11), '');
$$;

-- Ficha nova → agendamento aprovado mais recente do mesmo telefone ou nome
create or replace function private.tryout_link_new_athlete() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.tryouts t set athlete_id = new.id
  where t.id = (
    select t2.id from public.tryouts t2
    where t2.athlete_id is null and t2.status in ('IN_REGISTRATION', 'IN_EVALUATION', 'TECNOFIT')
      and (private.norm_phone(t2.whatsapp_phone) in (private.norm_phone(new.phone), private.norm_phone(new.parent_phone))
           or private.norm_name(coalesce(nullif(trim(t2.minor_name), ''), t2.name)) = private.norm_name(new.full_name))
    order by (t2.team_id = new.team_id) desc, t2.created_at desc limit 1);
  return new;
end; $$;
drop trigger if exists athletes_link_tryout on public.athletes;
create trigger athletes_link_tryout after insert on public.athletes for each row execute function private.tryout_link_new_athlete();

-- "Em cadastro" que já está no Tecnofit → "Tecnofit"
create or replace function private.tryouts_mark_tecnofit() returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  with billed as (
    select distinct private.norm_name(r.data->>'name') nm from public.finance_report_rows r where r.data ? 'name'
  ), linked as (
    select l.athlete_id from public.v2_tecnofit_athlete_links l
  )
  update public.tryouts t set status = 'TECNOFIT', updated_at = now()
  where t.status = 'IN_REGISTRATION'
    and (t.athlete_id in (select athlete_id from linked)
      or exists (select 1 from billed b where b.nm = private.norm_name(coalesce(nullif(trim(t.minor_name), ''), t.name)))
      or exists (select 1 from public.athletes a join billed b on b.nm = private.norm_name(a.full_name) where a.id = t.athlete_id));
  get diagnostics n = row_count;
  return n;
end; $$;
create or replace function private.tryouts_mark_tecnofit_trigger() returns trigger language plpgsql security definer set search_path = '' as $$
begin perform private.tryouts_mark_tecnofit(); return null; end; $$;
drop trigger if exists finance_rows_mark_tecnofit on public.finance_report_rows;
create trigger finance_rows_mark_tecnofit after insert or update on public.finance_report_rows for each statement execute function private.tryouts_mark_tecnofit_trigger();
drop trigger if exists tecnofit_links_mark_tecnofit on public.v2_tecnofit_athlete_links;
create trigger tecnofit_links_mark_tecnofit after insert or update on public.v2_tecnofit_athlete_links for each statement execute function private.tryouts_mark_tecnofit_trigger();

-- Histórico: liga as fichas já existentes (telefone primeiro, depois nome) e atualiza os status
update public.tryouts t set athlete_id = m.athlete_id
from (
  select distinct on (t2.id) t2.id tryout_id, a.id athlete_id
  from public.tryouts t2 join public.athletes a
    on private.norm_phone(t2.whatsapp_phone) in (private.norm_phone(a.phone), private.norm_phone(a.parent_phone))
    or private.norm_name(coalesce(nullif(trim(t2.minor_name), ''), t2.name)) = private.norm_name(a.full_name)
  where t2.athlete_id is null and t2.status in ('IN_REGISTRATION', 'IN_EVALUATION', 'TECNOFIT')
  order by t2.id, (private.norm_name(coalesce(nullif(trim(t2.minor_name), ''), t2.name)) = private.norm_name(a.full_name)) desc,
    (a.team_id = t2.team_id) desc, a.created_at desc
) m where t.id = m.tryout_id;
select private.tryouts_mark_tecnofit();

commit;
