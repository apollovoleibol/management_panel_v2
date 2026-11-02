-- 043 · Perfil Marketing: planejamento de social media, estúdio de peças e custo de IA.
--   * papel 'marketing' e as páginas 'marketing' (Planejamento) e 'studio' (Estúdio de peças);
--   * campanhas (opcionais), calendário de posts e peças criadas no estúdio;
--   * aprovação: a peça finalizada vai para "em aprovação", fica bloqueada e os administradores
--     recebem aviso (tabela notifications → push da migração 025). Só o administrador aprova/reprova;
--   * custo de IA: tabela de preços editável pelo administrador e registro de cada chamada.
begin;

alter table public.v2_staff drop constraint if exists v2_staff_role_check;
alter table public.v2_staff add constraint v2_staff_role_check
  check (role in ('admin','finance','coordination','attendance','coach','marketing'));

create or replace function private.v2_can(p_page text, p_mode text default 'view')
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_role text; v_setting text;
begin
  if p_page not in ('overview','bookings','athletes','teams','packages','feeder','payments','finance','marketing','studio','settings')
     or p_mode not in ('view','edit') then return false; end if;
  v_role := private.v2_role();
  if v_role is null then return false; end if;
  if p_page in ('packages','payments','finance') and v_role not in ('admin','finance') then return false; end if;
  if p_page in ('marketing','studio') and v_role not in ('admin','marketing') then return false; end if;
  if v_role = 'admin' then return true; end if;
  select s.permissions->>p_page into v_setting from public.v2_staff s
    where s.user_id = (select auth.uid()) and s.is_active is true;
  if v_setting is null then
    v_setting := case v_role
      when 'finance' then case when p_page in ('overview','athletes') then 'view'
                               when p_page in ('packages','payments','finance') then 'edit' else 'none' end
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
      from unnest(array['overview','bookings','athletes','teams','packages','feeder','payments','finance','marketing','studio','settings']) as pages(page)), '{}'::jsonb),
    'athleteIds', coalesce((select jsonb_agg(a.athlete_id) from public.v2_athlete_access a
      join public.athletes ath on ath.id = a.athlete_id and ath.is_active is true
      where a.user_id = (select auth.uid())), '[]'::jsonb)
  );
$$;

create or replace function public.v2_admin_set_staff(
  p_user uuid, p_role text, p_permissions jsonb, p_active boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_legacy_role text;
begin
  if private.v2_role() <> 'admin' or not private.v2_can('settings','edit') then
    raise exception 'Administrator required' using errcode = '42501';
  end if;
  if p_user is null or p_role is null
    or p_role not in ('admin','finance','coordination','attendance','coach','marketing')
    or p_active is null or jsonb_typeof(p_permissions) is distinct from 'object' then
    raise exception 'Invalid staff access';
  end if;
  if exists (select 1 from jsonb_each_text(p_permissions) setting
             where setting.key not in ('overview','bookings','athletes','teams','packages','feeder','payments','finance','marketing','studio','settings')
                or setting.value not in ('none','view','edit')) then
    raise exception 'Invalid page permission';
  end if;
  if p_role not in ('admin','finance') and exists (
    select 1 from jsonb_each_text(p_permissions) setting
    where setting.key in ('packages','payments','finance') and setting.value <> 'none'
  ) then
    raise exception 'Financial pages require admin or finance role';
  end if;
  if p_role not in ('admin','marketing') and exists (
    select 1 from jsonb_each_text(p_permissions) setting
    where setting.key in ('marketing','studio') and setting.value <> 'none'
  ) then
    raise exception 'Marketing pages require admin or marketing role';
  end if;
  select p.role into v_legacy_role from public.profiles p
    where p.id = p_user and p.is_active is true;
  if v_legacy_role is null then raise exception 'Active profile required'; end if;
  if p_role = 'admin' and v_legacy_role <> 'admin'
    and not exists (select 1 from public.v2_staff s where s.user_id = p_user)
    and v_legacy_role <> 'coach' then
    raise exception 'Promote an existing staff account, not an athlete or guardian account';
  end if;
  if v_legacy_role = 'admin' and p_role <> 'admin' then
    raise exception 'Legacy administrators cannot be demoted from Huddle';
  end if;
  if p_user = (select auth.uid()) and (p_role <> 'admin' or not p_active) then
    raise exception 'An administrator cannot remove their own access';
  end if;
  if p_role = 'coach' and v_legacy_role <> 'coach' then
    raise exception 'Coach role requires a coach profile';
  end if;
  if v_legacy_role = 'admin' and not p_active then
    raise exception 'Legacy administrators must remain active in both systems';
  end if;
  insert into public.v2_staff(user_id,role,permissions,is_active)
    values (p_user,p_role,p_permissions,p_active)
    on conflict (user_id) do update set role = excluded.role,
      permissions = excluded.permissions, is_active = excluded.is_active;
  if p_role in ('admin','finance') and p_active then
    insert into public.finance_access(user_id,can_view,can_import,is_active)
      values (p_user,true,true,true)
      on conflict (user_id) do update set can_view = true, can_import = true, is_active = true;
  else
    update public.finance_access set can_view = false, can_import = false, is_active = false
      where user_id = p_user;
  end if;
end;
$$;

-- ─── Campanhas, calendário e peças ───
create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  goal text check (length(goal) <= 600),
  starts_on date, ends_on date,
  ai_budget_brl numeric(10,2) not null default 0 check (ai_budget_brl >= 0),
  status text not null default 'planejada' check (status in ('planejada','ativa','encerrada')),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create table if not exists public.marketing_pieces (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  title text not null check (length(trim(title)) between 2 and 140),
  template_id text not null check (length(template_id) <= 60),
  format text not null check (format in ('feed','story','square','carousel')),
  slides jsonb not null default '[]'::jsonb check (jsonb_typeof(slides) = 'array' and jsonb_array_length(slides) <= 10),
  export_paths text[] not null default '{}',
  approval_status text not null default 'rascunho' check (approval_status in ('rascunho','em_aprovacao','aprovada','reprovada')),
  review_note text check (length(review_note) <= 600),
  submitted_at timestamptz, decided_by uuid references auth.users(id) on delete set null, decided_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists marketing_pieces_campaign_idx on public.marketing_pieces(campaign_id);
create index if not exists marketing_pieces_status_idx on public.marketing_pieces(approval_status);

create table if not exists public.marketing_posts (
  id uuid primary key default gen_random_uuid(),
  post_date date not null,
  network text not null default 'instagram' check (network in ('instagram','facebook','tiktok','youtube','linkedin','outro')),
  objective text check (length(objective) <= 300),
  caption text check (length(caption) <= 2200),
  status text not null default 'ideia' check (status in ('ideia','em_criacao','pronto','publicado')),
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  piece_id uuid references public.marketing_pieces(id) on delete set null,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists marketing_posts_date_idx on public.marketing_posts(post_date);

create or replace function private.marketing_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;
drop trigger if exists marketing_campaigns_touch on public.marketing_campaigns;
create trigger marketing_campaigns_touch before update on public.marketing_campaigns
  for each row execute function private.marketing_touch();
drop trigger if exists marketing_posts_touch on public.marketing_posts;
create trigger marketing_posts_touch before update on public.marketing_posts
  for each row execute function private.marketing_touch();

-- Aprovação: o marketing envia; só o administrador decide.
create or replace function private.marketing_piece_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_role text := private.v2_role();
begin
  if tg_op = 'INSERT' then
    new.approval_status := 'rascunho'; new.review_note := null;
    new.submitted_at := null; new.decided_by := null; new.decided_at := null;
    new.created_by := coalesce((select auth.uid()), new.created_by);
    return new;
  end if;
  new.updated_at := now();
  if new.approval_status is not distinct from old.approval_status then
    if old.approval_status in ('em_aprovacao','aprovada') and (
        new.title is distinct from old.title or new.template_id is distinct from old.template_id
        or new.format is distinct from old.format or new.slides is distinct from old.slides
        or new.campaign_id is distinct from old.campaign_id or new.export_paths is distinct from old.export_paths) then
      raise exception 'Peça em aprovação ou aprovada não pode ser editada. Crie uma nova versão.' using errcode = '23514';
    end if;
    new.review_note := old.review_note; new.submitted_at := old.submitted_at;
    new.decided_by := old.decided_by; new.decided_at := old.decided_at;
    return new;
  end if;
  if old.approval_status in ('rascunho','reprovada') and new.approval_status = 'em_aprovacao' then
    if v_role not in ('admin','marketing') then raise exception 'Sem permissão para enviar peças.' using errcode = '42501'; end if;
    if coalesce(array_length(new.export_paths, 1), 0) = 0 then
      raise exception 'Exporte as imagens da peça antes de enviar para aprovação.' using errcode = '23514'; end if;
    new.submitted_at := now(); new.review_note := null; new.decided_by := null; new.decided_at := null;
    insert into public.notifications (user_id, type, title, body, data)
    select a.id, 'marketing_review', 'Peça de marketing para aprovar',
           left(new.title, 100), jsonb_build_object('url', '/#/dashboard')
    from public.profiles a where a.role = 'admin' and a.is_active is true;
    return new;
  end if;
  if old.approval_status = 'em_aprovacao' and new.approval_status in ('aprovada','reprovada') then
    if v_role <> 'admin' then raise exception 'Somente administradores aprovam ou reprovam peças.' using errcode = '42501'; end if;
    if new.approval_status = 'reprovada' and length(trim(coalesce(new.review_note, ''))) < 3 then
      raise exception 'Informe o motivo da reprovação.' using errcode = '23514'; end if;
    new.decided_by := (select auth.uid()); new.decided_at := now();
    return new;
  end if;
  raise exception 'Mudança de status da peça não permitida (% → %).', old.approval_status, new.approval_status using errcode = '23514';
end; $$;
drop trigger if exists marketing_pieces_guard on public.marketing_pieces;
create trigger marketing_pieces_guard before insert or update on public.marketing_pieces
  for each row execute function private.marketing_piece_guard();

-- Post "pronto"/"publicado" exige peça aprovada (quando há peça ligada).
create or replace function private.marketing_post_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('pronto','publicado') and new.piece_id is not null
     and not exists (select 1 from public.marketing_pieces p where p.id = new.piece_id and p.approval_status = 'aprovada') then
    raise exception 'A peça ligada ao post ainda não foi aprovada.' using errcode = '23514';
  end if;
  return new;
end; $$;
drop trigger if exists marketing_posts_guard on public.marketing_posts;
create trigger marketing_posts_guard before insert or update on public.marketing_posts
  for each row execute function private.marketing_post_guard();

-- ─── Custo de IA ───
create table if not exists public.ai_pricing (
  model text primary key,
  kind text not null check (kind in ('text','image','video')),
  input_usd_per_mtok numeric(12,4) check (input_usd_per_mtok >= 0),
  output_usd_per_mtok numeric(12,4) check (output_usd_per_mtok >= 0),
  usd_per_unit numeric(12,4) check (usd_per_unit >= 0),
  note text,
  updated_at timestamptz not null default now()
);
create table if not exists public.ai_settings (
  id boolean primary key default true check (id),
  usd_brl numeric(8,4) not null default 5.5 check (usd_brl > 0),
  video_confirm_brl numeric(8,2) not null default 20 check (video_confirm_brl >= 0),
  updated_at timestamptz not null default now()
);
insert into public.ai_settings (id) values (true) on conflict (id) do nothing;
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  action text not null check (action in ('copy','image','review','video')),
  kind text not null check (kind in ('text','image','video')),
  model text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  units numeric(10,2) not null default 0 check (units >= 0),
  cost_usd numeric(12,6) not null default 0,
  cost_brl numeric(12,4) not null default 0,
  piece_id uuid references public.marketing_pieces(id) on delete set null,
  campaign_id uuid references public.marketing_campaigns(id) on delete set null
);
create index if not exists ai_usage_campaign_idx on public.ai_usage(campaign_id);
create index if not exists ai_usage_piece_idx on public.ai_usage(piece_id);

-- ─── Acesso (RLS) ───
alter table public.marketing_campaigns enable row level security;
alter table public.marketing_pieces enable row level security;
alter table public.marketing_posts enable row level security;
alter table public.ai_pricing enable row level security;
alter table public.ai_settings enable row level security;
alter table public.ai_usage enable row level security;
revoke all on public.marketing_campaigns, public.marketing_pieces, public.marketing_posts,
  public.ai_pricing, public.ai_settings, public.ai_usage from public, anon, authenticated;
grant select, insert, update, delete on public.marketing_campaigns, public.marketing_pieces, public.marketing_posts to authenticated;
grant select on public.ai_pricing, public.ai_settings, public.ai_usage to authenticated;
grant insert, update on public.ai_pricing to authenticated;
grant update on public.ai_settings to authenticated;

do $$ declare t text; begin
  foreach t in array array['marketing_campaigns','marketing_pieces','marketing_posts'] loop
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format('drop policy if exists %1$s_insert on public.%1$s', t);
    execute format('drop policy if exists %1$s_update on public.%1$s', t);
    execute format('drop policy if exists %1$s_delete on public.%1$s', t);
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (private.v2_can(''marketing'',''view'') or private.v2_can(''studio'',''view''))', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (private.v2_can(''marketing'',''edit'') or private.v2_can(''studio'',''edit''))', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (private.v2_can(''marketing'',''edit'') or private.v2_can(''studio'',''edit'')) with check (private.v2_can(''marketing'',''edit'') or private.v2_can(''studio'',''edit''))', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (private.v2_can(''marketing'',''edit'') or private.v2_can(''studio'',''edit''))', t);
  end loop;
end $$;
-- Peça em aprovação ou aprovada só sai do banco pela administração
drop policy if exists marketing_pieces_delete on public.marketing_pieces;
create policy marketing_pieces_delete on public.marketing_pieces for delete to authenticated
  using ((private.v2_can('studio','edit') or private.v2_can('marketing','edit'))
         and (approval_status in ('rascunho','reprovada') or private.v2_role() = 'admin'));

drop policy if exists ai_pricing_select on public.ai_pricing;
create policy ai_pricing_select on public.ai_pricing for select to authenticated
  using (private.v2_can('studio','view') or private.v2_can('marketing','view'));
drop policy if exists ai_pricing_admin on public.ai_pricing;
create policy ai_pricing_admin on public.ai_pricing for insert to authenticated with check (private.v2_role() = 'admin');
drop policy if exists ai_pricing_admin_update on public.ai_pricing;
create policy ai_pricing_admin_update on public.ai_pricing for update to authenticated
  using (private.v2_role() = 'admin') with check (private.v2_role() = 'admin');
drop policy if exists ai_settings_select on public.ai_settings;
create policy ai_settings_select on public.ai_settings for select to authenticated
  using (private.v2_can('studio','view') or private.v2_can('marketing','view'));
drop policy if exists ai_settings_admin on public.ai_settings;
create policy ai_settings_admin on public.ai_settings for update to authenticated
  using (private.v2_role() = 'admin') with check (private.v2_role() = 'admin');
-- Uso de IA: leitura pelo marketing/admin; gravação apenas pela Edge Function (service role)
drop policy if exists ai_usage_select on public.ai_usage;
create policy ai_usage_select on public.ai_usage for select to authenticated
  using (private.v2_can('studio','view') or private.v2_can('marketing','view'));

-- ─── Arquivos das peças (PNG exportados) ───
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marketing', 'marketing', false, 15728640, array['image/png','image/jpeg','image/webp','video/mp4'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists marketing_files_read on storage.objects;
create policy marketing_files_read on storage.objects for select to authenticated
  using (bucket_id = 'marketing' and (private.v2_can('studio','view') or private.v2_can('marketing','view')));
drop policy if exists marketing_files_write on storage.objects;
create policy marketing_files_write on storage.objects for insert to authenticated
  with check (bucket_id = 'marketing' and (private.v2_can('studio','edit') or private.v2_can('marketing','edit')));
drop policy if exists marketing_files_update on storage.objects;
create policy marketing_files_update on storage.objects for update to authenticated
  using (bucket_id = 'marketing' and (private.v2_can('studio','edit') or private.v2_can('marketing','edit')))
  with check (bucket_id = 'marketing');
drop policy if exists marketing_files_delete on storage.objects;
create policy marketing_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'marketing' and (private.v2_can('studio','edit') or private.v2_can('marketing','edit')));

-- Preços iniciais (USD). Conferir em ai.google.dev/gemini-api/docs/pricing e ajustar em Estúdio de peças → Calculadora (administração).
insert into public.ai_pricing (model, kind, input_usd_per_mtok, output_usd_per_mtok, usd_per_unit, note) values
  ('gemini-2.5-flash', 'text', 0.30, 2.50, null, 'Textos e revisão. Por 1 milhão de tokens.'),
  ('gemini-2.5-flash-image', 'image', null, null, 0.039, 'Imagens. Por imagem gerada.'),
  ('veo-3.1-fast-generate-preview', 'video', null, null, 0.15, 'Vídeo. Por segundo gerado. Valor a conferir.')
on conflict (model) do nothing;

revoke all on function private.marketing_piece_guard(), private.marketing_post_guard(), private.marketing_touch() from public, anon;
commit;
