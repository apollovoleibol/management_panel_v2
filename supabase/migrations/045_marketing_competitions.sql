-- 045 · Competições previstas no calendário do Planejamento (marketing).
--   O perfil Marketing não lê equipes nem competições diretamente (RLS por equipe).
--   Esta função devolve só o necessário para planejar posts: competição, equipe, data, local e adversário,
--   sem resultados, endereço ou atletas. Competições canceladas ficam de fora.
begin;

create or replace function public.v2_marketing_competitions(p_from date default (current_date - 31), p_to date default (current_date + 400))
returns table (id uuid, name text, team_name text, scheduled_at timestamptz, venue_name text, opponent text, round text, competition_type text, status text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, t.name, c.scheduled_at, c.venue_name, c.opponent, c.round, c.competition_type, c.status
  from public.competitions c
  join public.teams t on t.id = c.team_id
  where (private.v2_can('marketing', 'view') or private.v2_can('studio', 'view'))
    and coalesce(c.status, 'upcoming') <> 'cancelled'
    and c.scheduled_at >= p_from::timestamptz
    and c.scheduled_at < (p_to + 1)::timestamptz
  order by c.scheduled_at
  limit 500;
$$;
revoke all on function public.v2_marketing_competitions(date, date) from public, anon;
grant execute on function public.v2_marketing_competitions(date, date) to authenticated;
commit;
