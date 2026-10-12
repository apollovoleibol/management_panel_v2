-- 028 · Indicadores de atendimento por período (mês atual ou anterior na Visão geral).
-- Mantém v2_service_metrics() (últimos 30 dias, usado pelo Manager App) e adiciona
-- a versão com início e fim do período.
begin;

create or replace function public.v2_service_metrics(p_start timestamptz, p_end timestamptz)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  if not coalesce(private.v2_can('overview','view'),false) or private.v2_role() not in ('admin','attendance','coordination','finance') then raise exception 'Operational viewer required' using errcode='42501'; end if;
  if p_start is null or p_end is null or p_end <= p_start then raise exception 'Período inválido'; end if;
  select jsonb_build_object(
    'since',p_start,'until',p_end,
    'started',count(*) filter(where first_message_at is not null),
    'firstResponseCount',count(first_response_at),
    'firstResponseSeconds',avg(extract(epoch from first_response_at-first_message_at)),
    'bookingCount',count(booked_at),
    'bookingSeconds',avg(extract(epoch from booked_at-first_message_at)),
    'handoffCount',count(handoff_at),
    'humanReplyCount',count(human_reply_at),
    'humanReplySeconds',avg(extract(epoch from human_reply_at-handoff_at)),
    'pendingHandoffs',count(*) filter(where handoff_at is not null and human_reply_at is null),
    'ratingCount',count(score),'ratingAverage',avg(score),
    'csatPercent',100.0*count(*) filter(where score>=4)/nullif(count(score),0),
    'instrumentedAt',(select min(created_at) from public.v2_chat_sessions where not is_test)
  ) into v_result from public.v2_chat_sessions
    where not is_test and coalesce(first_message_at,handoff_at,created_at)>=p_start
      and coalesce(first_message_at,handoff_at,created_at)<p_end;
  return v_result;
end; $$;
revoke all on function public.v2_service_metrics(timestamptz,timestamptz) from public,anon;
grant execute on function public.v2_service_metrics(timestamptz,timestamptz) to authenticated;

commit;
