-- 044 · Estúdio de peças: layouts próprios (derivados dos layouts-base) e dados do carrossel.
--   * marketing_pieces.meta: fundo contínuo do carrossel (elementos e fotos que atravessam as lâminas);
--   * marketing_layouts: o usuário parte de um layout sugerido, altera os elementos e salva a variação;
--   * a trava de edição da peça em aprovação/aprovada passa a incluir meta.
begin;

alter table public.marketing_pieces add column if not exists meta jsonb not null default '{}'::jsonb
  check (jsonb_typeof(meta) = 'object');

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
        or new.meta is distinct from old.meta
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

create table if not exists public.marketing_layouts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 80),
  base_id text check (length(base_id) <= 60),
  bg text not null default 'navy' check (length(bg) <= 20),
  els jsonb not null check (jsonb_typeof(els) = 'array' and jsonb_array_length(els) <= 60),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.marketing_layouts enable row level security;
revoke all on public.marketing_layouts from public, anon, authenticated;
grant select, insert, update, delete on public.marketing_layouts to authenticated;
drop policy if exists marketing_layouts_select on public.marketing_layouts;
create policy marketing_layouts_select on public.marketing_layouts for select to authenticated
  using (private.v2_can('studio','view') or private.v2_can('marketing','view'));
drop policy if exists marketing_layouts_insert on public.marketing_layouts;
create policy marketing_layouts_insert on public.marketing_layouts for insert to authenticated
  with check (private.v2_can('studio','edit') or private.v2_can('marketing','edit'));
drop policy if exists marketing_layouts_update on public.marketing_layouts;
create policy marketing_layouts_update on public.marketing_layouts for update to authenticated
  using ((private.v2_can('studio','edit') or private.v2_can('marketing','edit')) and (created_by = (select auth.uid()) or private.v2_role() = 'admin'))
  with check (private.v2_can('studio','edit') or private.v2_can('marketing','edit'));
drop policy if exists marketing_layouts_delete on public.marketing_layouts;
create policy marketing_layouts_delete on public.marketing_layouts for delete to authenticated
  using ((private.v2_can('studio','edit') or private.v2_can('marketing','edit')) and (created_by = (select auth.uid()) or private.v2_role() = 'admin'));

revoke all on function private.marketing_piece_guard() from public, anon;
commit;
