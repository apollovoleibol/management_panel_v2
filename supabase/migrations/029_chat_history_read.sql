-- 029 · Histórico de conversa do chatbot no Huddle.
-- 1. v2_chat_history(p_phone): conversa gravada pelo assistente (tabela chatlogs) para o
--    telefone do agendamento. Atendimento, coordenação e administração veem qualquer
--    agendamento; técnico só os das suas equipes.
-- 2. A leitura direta de chatlogs deixa de valer para qualquer usuário logado (incluía
--    responsáveis e atletas da Área do atleta): fica restrita à administração e à equipe
--    interna. O assistente grava com a chave de serviço e não é afetado.
begin;

create or replace function public.v2_chat_history(p_phone text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_digits text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 11);
        v_role text := private.v2_role();
begin
  if length(v_digits) < 10 then return null; end if;
  if not coalesce(private.v2_can('bookings', 'view'), false) then
    raise exception 'Acesso aos agendamentos requerido' using errcode = '42501';
  end if;
  if v_role = 'coach' and not exists (
    select 1 from public.tryouts t
    where right(regexp_replace(coalesce(t.whatsapp_phone, t.phone, ''), '\D', '', 'g'), 11) = v_digits
      and private.v2_tryout_team_scope(t.team_id, t.target_team)) then
    raise exception 'Agendamento fora das suas equipes' using errcode = '42501';
  end if;
  return (select jsonb_build_object('nome', c.nome, 'fase', c.fase, 'history', c.history,
                                    'created_at', c.created_at, 'updated_at', c.updated_at)
          from public.chatlogs c
          where right(regexp_replace(coalesce(c.whatsapp, ''), '\D', '', 'g'), 11) = v_digits
          order by c.updated_at desc nulls last limit 1);
end;
$$;
revoke all on function public.v2_chat_history(text) from public, anon;
grant execute on function public.v2_chat_history(text) to authenticated;

drop policy if exists "Painel admin pode ler os chats" on public.chatlogs;
create policy chatlogs_staff_read on public.chatlogs for select to authenticated
  using (public.is_admin() or coalesce(private.v2_role() in ('admin', 'attendance', 'coordination'), false));

commit;
