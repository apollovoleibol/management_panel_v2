-- 047 · Correções encontradas na varredura de 09/11/2026.
-- 1. A 043 (Marketing) recriou private.v2_can e public.v2_my_access a partir de uma versão anterior
--    à 030 e tirou a página 'billing' (Mensalidades): o menu sumiu para todos e o banco passou a negar
--    mensalidades, cobranças e regras de cobrança. Volta 'billing' (admin e financeiro), mantendo
--    'marketing' e 'studio'. Os atletas da Área do atleta voltam a seguir private.v2_portal_link
--    (adulto com a própria conta, menor pelo responsável), como na 030.
-- 2. Nomes com espaços sobrando (" Giovanna ...", "Amanda Pereira ") quebravam a ordem alfabética
--    e a comparação de nomes. Novos cadastros e agendamentos chegam normalizados; os atletas atuais
--    são corrigidos. Agendamentos existentes não são regravados (a trava de consentimento revalidaria).
begin;

create or replace function private.v2_can(p_page text, p_mode text default 'view')
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_role text; v_setting text;
begin
  if p_page not in ('overview','bookings','athletes','teams','packages','feeder','payments','billing','finance','marketing','studio','settings')
     or p_mode not in ('view','edit') then return false; end if;
  v_role := private.v2_role();
  if v_role is null then return false; end if;
  if p_page in ('packages','payments','billing','finance') and v_role not in ('admin','finance') then return false; end if;
  if p_page in ('marketing','studio') and v_role not in ('admin','marketing') then return false; end if;
  if v_role = 'admin' then return true; end if;
  select s.permissions->>p_page into v_setting from public.v2_staff s
    where s.user_id = (select auth.uid()) and s.is_active is true;
  if v_setting is null then
    v_setting := case v_role
      when 'finance' then case when p_page in ('overview','athletes') then 'view'
                               when p_page in ('packages','payments','billing','finance') then 'edit' else 'none' end
      when 'coordination' then case when p_page in ('overview') then 'view'
                                    when p_page in ('bookings','athletes','teams','feeder') then 'edit' else 'none' end
      when 'attendance' then case when p_page in ('overview','athletes','teams','feeder') then 'view'
                                  when p_page = 'bookings' then 'edit' else 'none' end
      when 'coach' then case when p_page in ('overview','bookings','athletes','teams') then 'view' else 'none' end
      when 'marketing' then case when p_page in ('marketing','studio') then 'edit' else 'none' end
      else 'none' end;
  end if;
  return v_setting = 'edit' or (p_mode = 'view' and v_setting = 'view');
end;
$$;

create or replace function public.v2_my_access()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'role', private.v2_role(),
    'pages', coalesce((select jsonb_object_agg(page, jsonb_build_object(
      'view', private.v2_can(page, 'view'), 'edit', private.v2_can(page, 'edit')))
      from unnest(array['overview','bookings','athletes','teams','packages','feeder','payments','billing','finance','marketing','studio','settings']) as pages(page)), '{}'::jsonb),
    'athleteIds', coalesce((select jsonb_agg(a.athlete_id) from public.v2_athlete_access a
      where a.user_id = (select auth.uid()) and private.v2_portal_link(a.athlete_id)), '[]'::jsonb)
  );
$$;

-- Espaços: sem espaço no começo/fim e nunca dois seguidos
create or replace function private.normalize_person_names()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'athletes' then
    new.full_name := btrim(regexp_replace(new.full_name, '\s+', ' ', 'g'));
    new.parent_name := btrim(regexp_replace(new.parent_name, '\s+', ' ', 'g'));
  else
    new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
    new.minor_name := btrim(regexp_replace(new.minor_name, '\s+', ' ', 'g'));
  end if;
  return new;
end;
$$;
drop trigger if exists a_normalize_names on public.athletes;
create trigger a_normalize_names before insert or update of full_name, parent_name on public.athletes
  for each row execute function private.normalize_person_names();
-- Em agendamentos só na criação: roda antes da trava de consentimento (ordem alfabética dos gatilhos)
drop trigger if exists a_normalize_names on public.tryouts;
create trigger a_normalize_names before insert on public.tryouts
  for each row execute function private.normalize_person_names();

update public.athletes set full_name = full_name, parent_name = parent_name
  where full_name is distinct from btrim(regexp_replace(full_name, '\s+', ' ', 'g'))
     or parent_name is distinct from btrim(regexp_replace(parent_name, '\s+', ' ', 'g'));

commit;
