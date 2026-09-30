-- Separate training cancellations from dates unavailable for trial bookings.
-- Contact queue exposes only linked names and phone numbers to attendance.
begin;

create table if not exists public.v2_training_cancellations (
  team_id uuid not null references public.teams(id) on delete cascade,
  training_date date not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (team_id, training_date)
);
alter table public.v2_training_cancellations enable row level security;
revoke all on public.v2_training_cancellations from public, anon, authenticated;
grant select(team_id, training_date) on public.v2_training_cancellations to authenticated;
drop policy if exists v2_training_cancellations_read on public.v2_training_cancellations;
create policy v2_training_cancellations_read on public.v2_training_cancellations
  for select to authenticated using (
    private.v2_role() is not null or exists (
      select 1 from public.v2_athlete_access link
      join public.athletes athlete on athlete.id = link.athlete_id
      where link.user_id = (select auth.uid())
        and athlete.team_id = v2_training_cancellations.team_id
    )
  );

create or replace function public.v2_set_training_cancellation(
  p_team uuid, p_date date, p_cancel boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare v_role text;
begin
  v_role := private.v2_role();
  if p_team is null or p_date is null or p_cancel is null or p_date < current_date then
    raise exception 'Invalid future training date';
  end if;
  if not exists (select 1 from public.teams t where t.id = p_team and t.is_active is true) then
    raise exception 'Active team required';
  end if;
  if not (
    (v_role in ('admin','coordination') and private.v2_can('teams','edit'))
    or (v_role = 'coach' and exists (
      select 1 from public.team_coaches c
      where c.team_id = p_team and c.coach_id = (select auth.uid())
    ))
  ) then
    raise exception 'Team coach or editor required' using errcode = '42501';
  end if;
  if p_cancel then
    insert into public.v2_training_cancellations(team_id,training_date,created_by)
      values (p_team,p_date,(select auth.uid()))
      on conflict (team_id,training_date) do nothing;
  else
    delete from public.v2_training_cancellations
      where team_id = p_team and training_date = p_date;
  end if;
end;
$$;

-- Only overdue monthly installments in the most recent open-sales snapshot.
-- No amount, other finance rows, or unlinked client is returned.
create or replace function public.v2_payment_contact_queue()
returns jsonb language sql stable security definer set search_path = '' as $$
  with late as (
    select r.data->>'clientId' as client_id,
      min((part.value->>'date')::date) as first_due
    from public.finance_report_rows r
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(r.data->'installments') = 'array'
        then r.data->'installments' else '[]'::jsonb end
    ) part
    where r.report_type = 'open'
      and lower(coalesce(r.data->>'item','')) like 'mensal%'
      and coalesce(r.data->>'needsReview','false') = 'false'
      and part.value->>'date' ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
      and part.value->>'amount' ~ '^[0-9]+(\.[0-9]+)?$'
      and (part.value->>'date')::date < current_date
      and (part.value->>'amount')::numeric > 0
    group by r.data->>'clientId'
  )
  select case when private.v2_role() in ('admin','finance','attendance')
    then coalesce(jsonb_agg(jsonb_build_object(
      'clientId', late.client_id,
      'athleteId', athlete.id,
      'athleteName', athlete.full_name,
      'contactName', case when minor.is_minor then athlete.parent_name else athlete.full_name end,
      'phone', case when minor.is_minor then athlete.parent_phone else athlete.phone end,
      'isGuardian', minor.is_minor,
      'firstDue', late.first_due
    ) order by late.first_due, athlete.full_name), '[]'::jsonb)
    else '[]'::jsonb end
  from late
  join public.v2_tecnofit_athlete_links link on link.client_id = late.client_id
  join public.athletes athlete on athlete.id = link.athlete_id and athlete.is_active is true
  left join public.teams team on team.id = athlete.team_id
  cross join lateral (select
    (athlete.birth_date is not null and athlete.birth_date > current_date - interval '18 years')
    or (athlete.birth_date is null and team.age_min < 18) as is_minor
  ) minor;
$$;

revoke all on function public.v2_set_training_cancellation(uuid,date,boolean) from public,anon;
revoke all on function public.v2_payment_contact_queue() from public,anon;
grant execute on function public.v2_set_training_cancellation(uuid,date,boolean),
  public.v2_payment_contact_queue() to authenticated;
commit;
