-- Internal notices only: this table deliberately does not use notifications,
-- whose insert trigger dispatches external push messages in the shared project.
begin;

create table private.billing_restriction_config (
 singleton boolean primary key default true check(singleton),
 production_restrictions_enabled boolean not null default false
);
insert into private.billing_restriction_config default values;
alter table private.billing_restriction_config enable row level security;
revoke all on private.billing_restriction_config from public,anon,authenticated;
grant select,update on private.billing_restriction_config to service_role;

create table public.billing_staff_notices (
 id uuid primary key default gen_random_uuid(),
 athlete_id uuid not null references public.athletes(id) on delete cascade,
 team_id uuid references public.teams(id) on delete set null,
 env text not null check(env in ('sandbox','production')),
 recipient_id uuid not null references public.profiles(id) on delete cascade,
 recipient_role text not null check(recipient_role in ('coach','admin')),
 overdue_count integer not null check(overdue_count>=0), earliest_due date,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 read_at timestamptz, resolved_at timestamptz
);
create unique index billing_staff_notice_active_unique on public.billing_staff_notices(athlete_id,env,recipient_id) where resolved_at is null;
create index billing_staff_notice_inbox on public.billing_staff_notices(recipient_id,created_at desc);

-- Match v2 effective roles, including explicit staff deactivation and promoted
-- Huddle administrators whose legacy profile still says coach/customer.
create function private.billing_staff_role(p_user uuid) returns text language sql stable security definer set search_path='' as $$
 select case when p.role='admin' then 'admin'
  when s.user_id is not null then case when s.is_active then s.role else null end
  when p.role='coach' then 'coach' else null end
 from public.profiles p left join public.v2_staff s on s.user_id=p.id
 where p.id=p_user and p.is_active is true;
$$;

create function private.billing_notice_allowed(p_user uuid,p_role text,p_team uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(private.billing_staff_role(p_user)=p_role and
  (p_role='admin' or (p_role='coach' and exists(select 1 from public.team_coaches tc where tc.team_id=p_team and tc.coach_id=p_user))),false);
$$;

alter table public.billing_staff_notices enable row level security;
revoke all on public.billing_staff_notices from anon,authenticated;
grant select on public.billing_staff_notices to authenticated;
grant all on public.billing_staff_notices to service_role;
create policy billing_staff_notice_own on public.billing_staff_notices for select to authenticated using
 (recipient_id=(select auth.uid()) and private.billing_notice_allowed(recipient_id,recipient_role,team_id)
  and exists(select 1 from public.athletes a where a.id=athlete_id and (recipient_role='admin' or a.team_id=team_id)));

create function private.billing_reconcile_delinquency(p_athlete uuid,p_env text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_team uuid; v_count integer; v_due date; v_enabled boolean; v_today date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 if p_env not in ('sandbox','production') then raise exception 'Ambiente inválido'; end if;
 perform pg_advisory_xact_lock(hashtext(p_athlete::text),hashtext('billing-delinquency-'||p_env));
 select a.team_id into v_team from public.athletes a where a.id=p_athlete;
 if not found then return null; end if;
 select count(*)::integer,min(p.due_date) into v_count,v_due
 from public.billing_payments p join public.billing_subscriptions s on s.id=p.subscription_id and s.env=p.env
 where s.athlete_id=p_athlete and p.env=p_env and p.status in ('PENDING','OVERDUE') and p.due_date<v_today;
 select c.production_restrictions_enabled into v_enabled from private.billing_restriction_config c where c.singleton;
 -- Resolve paid debts and notices belonging to an inactive/former team member.
 update public.billing_staff_notices n set resolved_at=now(),updated_at=now(),overdue_count=0,earliest_due=null
 where n.athlete_id=p_athlete and n.env=p_env and n.resolved_at is null and
  (v_count=0 or n.team_id is distinct from v_team or not private.billing_notice_allowed(n.recipient_id,n.recipient_role,v_team));
 if v_count>0 then
  insert into public.billing_staff_notices(athlete_id,team_id,env,recipient_id,recipient_role,overdue_count,earliest_due)
  select p_athlete,v_team,p_env,p.id,r.role,v_count,v_due from public.profiles p
  cross join lateral (select private.billing_staff_role(p.id) as role) r
  where r.role in ('admin','coach') and private.billing_notice_allowed(p.id,r.role,v_team)
  on conflict(athlete_id,env,recipient_id) where resolved_at is null do update
  set overdue_count=excluded.overdue_count,earliest_due=excluded.earliest_due,updated_at=now();
 end if;
 return jsonb_build_object('athlete_id',p_athlete,'env',p_env,'overdue_count',v_count,'earliest_due',v_due,
  'blocked',v_count>0 and p_env='production' and coalesce(v_enabled,false),
  'simulation',p_env='sandbox','restriction_enabled',p_env='production' and coalesce(v_enabled,false),
  'coach_notified',exists(select 1 from public.billing_staff_notices n where n.athlete_id=p_athlete and n.env=p_env and n.resolved_at is null
   and n.recipient_role='coach' and n.team_id is not distinct from v_team and private.billing_notice_allowed(n.recipient_id,n.recipient_role,v_team)),
  'admin_notified',exists(select 1 from public.billing_staff_notices n where n.athlete_id=p_athlete and n.env=p_env and n.resolved_at is null
   and n.recipient_role='admin' and private.billing_notice_allowed(n.recipient_id,n.recipient_role,v_team)));
end; $$;

create function public.billing_delinquency_state() returns jsonb language plpgsql security definer set search_path='' as $$
declare a record; result jsonb:='[]'::jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_active is true) then raise exception 'Sessão ativa necessária' using errcode='42501'; end if;
 for a in select id from public.athletes where private.v2_portal_link(id) order by id loop
  result:=result||jsonb_build_array(private.billing_reconcile_delinquency(a.id,'production'),private.billing_reconcile_delinquency(a.id,'sandbox'));
 end loop;
 return result;
end; $$;

create function public.billing_staff_notices() returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_role text:=private.billing_staff_role(auth.uid()); v_athlete record; v_enabled boolean;
begin
 if v_user is null or v_role is null or v_role not in ('coach','admin') then raise exception 'Acesso negado' using errcode='42501'; end if;
 for v_athlete in select id from public.athletes where v_role='admin' or exists(select 1 from public.team_coaches tc where tc.team_id=athletes.team_id and tc.coach_id=v_user) order by id loop
  perform private.billing_reconcile_delinquency(v_athlete.id,'production');
  perform private.billing_reconcile_delinquency(v_athlete.id,'sandbox');
 end loop;
 select production_restrictions_enabled into v_enabled from private.billing_restriction_config where singleton;
 return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from
  (select n.id,n.athlete_id,a.full_name as athlete_name,t.name as team_name,n.env,
   n.env='sandbox' as simulation,n.resolved_at is null and n.env='production' and coalesce(v_enabled,false) as blocked,
   n.overdue_count,n.earliest_due,n.created_at,n.read_at,n.resolved_at
   from public.billing_staff_notices n join public.athletes a on a.id=n.athlete_id left join public.teams t on t.id=a.team_id
   where n.recipient_id=v_user and private.billing_notice_allowed(v_user,n.recipient_role,a.team_id)
   order by n.created_at desc limit 50) x),'[]'::jsonb);
end; $$;

create function public.billing_staff_notice_read(p_notice_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.billing_staff_notices n set read_at=coalesce(n.read_at,now())
 where n.id=p_notice_id and n.recipient_id=auth.uid() and private.billing_notice_allowed(auth.uid(),n.recipient_role,n.team_id)
  and exists(select 1 from public.athletes a where a.id=n.athlete_id and (n.recipient_role='admin' or a.team_id=n.team_id));
 if not found then raise exception 'Aviso não encontrado' using errcode='42501'; end if;
end; $$;

create function private.billing_payment_delinquency_trigger() returns trigger language plpgsql security definer set search_path='' as $$
declare v_old uuid; v_new uuid;
begin
 if tg_op<>'INSERT' then
  select athlete_id into v_old from public.billing_subscriptions where id=old.subscription_id;
  v_old:=coalesce(v_old,old.athlete_id);
  if v_old is not null then perform private.billing_reconcile_delinquency(v_old,old.env); end if;
 end if;
 if tg_op<>'DELETE' then
  select athlete_id into v_new from public.billing_subscriptions where id=new.subscription_id;
  if v_new is not null and (tg_op='INSERT' or v_new is distinct from v_old or new.env is distinct from old.env) then
   perform private.billing_reconcile_delinquency(v_new,new.env);
  end if;
 end if;
 return null;
end; $$;
create trigger billing_payment_delinquency after insert or update or delete on public.billing_payments for each row execute function private.billing_payment_delinquency_trigger();

create function private.billing_athlete_team_delinquency_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.team_id is distinct from new.team_id then
  perform private.billing_reconcile_delinquency(new.id,'production');perform private.billing_reconcile_delinquency(new.id,'sandbox');
 end if;
 return new;
end; $$;
create trigger billing_athlete_team_delinquency after update of team_id on public.athletes for each row execute function private.billing_athlete_team_delinquency_trigger();

-- Enforcement is disabled by default and never considers sandbox payments.
-- Previously recorded attendance remains intact; only new present markings
-- (including a transition from absent) are guarded after explicit activation.
create function private.billing_attendance_delinquency_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status<>'present' or (tg_op='UPDATE' and old.status='present' and old.athlete_id=new.athlete_id and old.log_id=new.log_id) then return new; end if;
 if exists(select 1 from private.billing_restriction_config where singleton and production_restrictions_enabled)
 and exists(select 1 from public.billing_payments p join public.billing_subscriptions s on s.id=p.subscription_id and s.env=p.env
  where s.athlete_id=new.athlete_id and p.env='production' and p.status in ('PENDING','OVERDUE')
   and p.due_date<(now() at time zone 'America/Sao_Paulo')::date) then
  raise exception 'Presença restrita: regularize a mensalidade vencida ou procure a administração.' using errcode='23514';
 end if;
 return new;
end; $$;
create trigger billing_attendance_delinquency before insert or update of status,athlete_id,log_id on public.attendance for each row execute function private.billing_attendance_delinquency_guard();

revoke all on function private.billing_staff_role(uuid),private.billing_notice_allowed(uuid,text,uuid),private.billing_reconcile_delinquency(uuid,text),
 private.billing_payment_delinquency_trigger(),private.billing_athlete_team_delinquency_trigger(),private.billing_attendance_delinquency_guard() from public,anon,authenticated;
-- RLS requires these read-only caller/recipient eligibility helpers.
grant execute on function private.billing_staff_role(uuid),private.billing_notice_allowed(uuid,text,uuid) to authenticated;
grant execute on function private.billing_reconcile_delinquency(uuid,text) to service_role;
revoke all on function public.billing_delinquency_state(),public.billing_staff_notices(),public.billing_staff_notice_read(uuid) from public,anon;
grant execute on function public.billing_delinquency_state(),public.billing_staff_notices(),public.billing_staff_notice_read(uuid) to authenticated;
commit;
