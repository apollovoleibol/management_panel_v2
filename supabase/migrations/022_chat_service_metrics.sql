-- Server timestamps only. No message bodies are copied into telemetry.
begin;
create table public.v2_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null,
  contact_name text not null,
  phone text not null,
  created_at timestamptz not null default clock_timestamp(),
  first_message_at timestamptz,
  first_response_at timestamptz,
  booked_at timestamptz,
  tryout_id uuid references public.tryouts(id) on delete set null,
  handoff_at timestamptz,
  human_reply_at timestamptz,
  human_reply_by uuid references auth.users(id),
  score smallint check (score between 1 and 5),
  scored_at timestamptz,
  is_test boolean not null default false
);
create table public.v2_chat_requests (
  session_id uuid not null references public.v2_chat_sessions(id) on delete cascade,
  request_id uuid not null,
  received_at timestamptz not null default clock_timestamp(),
  answered_at timestamptz,
  failed_at timestamptz,
  primary key(session_id,request_id)
);
create index v2_chat_sessions_cohort on public.v2_chat_sessions(first_message_at);
create index v2_chat_sessions_queue on public.v2_chat_sessions(handoff_at) where human_reply_at is null;
alter table public.v2_chat_sessions enable row level security;
alter table public.v2_chat_requests enable row level security;
revoke all on public.v2_chat_sessions,public.v2_chat_requests from public,anon,authenticated;

create function public.v2_chat_begin(p_phone text,p_name text,p_test boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_token text := gen_random_uuid()::text; v_phone text;
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  v_phone := regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
  v_phone := regexp_replace(v_phone,'^55([0-9]{10,11})$','\1');
  if v_phone !~ '^[0-9]{10,13}$' or length(trim(coalesce(p_name,''))) not between 2 and 160 then raise exception 'Invalid contact'; end if;
  -- Bound abuse and accidental reload loops; the existing frontend secret is not authentication.
  if (select count(*) from public.v2_chat_sessions where phone=v_phone and created_at>clock_timestamp()-interval '24 hours') >= 40 then raise exception 'Session limit'; end if;
  insert into public.v2_chat_sessions(token_hash,phone,contact_name,is_test)
    values(encode(sha256(convert_to(v_token,'UTF8')),'hex'),v_phone,trim(p_name),coalesce(p_test,false)) returning id into v_id;
  return jsonb_build_object('id',v_id,'token',v_token);
end; $$;

create function public.v2_chat_event(p_session uuid,p_token text,p_kind text,
  p_request uuid default null,p_tryout uuid default null,p_score integer default null,p_phone text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_session public.v2_chat_sessions; v_now timestamptz := clock_timestamp();
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  select * into v_session from public.v2_chat_sessions where id=p_session
    and token_hash=encode(sha256(convert_to(coalesce(p_token,''),'UTF8')),'hex')
    and created_at > v_now-interval '24 hours' for update;
  if not found then raise exception 'Expired or invalid session'; end if;
  if p_kind='message' then
    if regexp_replace(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'),'^55([0-9]{10,11})$','\1') <> v_session.phone then raise exception 'Contact mismatch'; end if;
    if p_request is null then raise exception 'Request required'; end if;
    if (select count(*) from public.v2_chat_requests where session_id=p_session)>=50 then raise exception 'Request limit'; end if;
    insert into public.v2_chat_requests(session_id,request_id,received_at) values(p_session,p_request,v_now) on conflict do nothing;
    update public.v2_chat_sessions set first_message_at=coalesce(first_message_at,v_now) where id=p_session;
  elsif p_kind in ('response','failure') then
    if not exists(select 1 from public.v2_chat_requests where session_id=p_session and request_id=p_request) then raise exception 'Unknown request'; end if;
    if p_kind='response' then
      update public.v2_chat_requests set answered_at=coalesce(answered_at,v_now) where session_id=p_session and request_id=p_request;
      update public.v2_chat_sessions set first_response_at=coalesce(first_response_at,v_now) where id=p_session;
    else
      update public.v2_chat_requests set failed_at=coalesce(failed_at,v_now) where session_id=p_session and request_id=p_request and answered_at is null;
    end if;
  elsif p_kind='booking' then
    if v_session.first_message_at is null or not exists(select 1 from public.tryouts t where t.id=p_tryout and t.created_at>=v_session.first_message_at
      and regexp_replace(regexp_replace(t.whatsapp_phone,'[^0-9]','','g'),'^55([0-9]{10,11})$','\1')=v_session.phone) then raise exception 'New booking for this contact required'; end if;
    update public.v2_chat_sessions set booked_at=coalesce(booked_at,v_now),tryout_id=coalesce(tryout_id,p_tryout) where id=p_session;
  elsif p_kind='handoff' then
    update public.v2_chat_sessions set handoff_at=coalesce(handoff_at,v_now) where id=p_session;
  elsif p_kind='score' then
    if p_score is null or p_score not between 1 and 5 or v_session.first_response_at is null then raise exception 'Reply and score 1 to 5 required'; end if;
    update public.v2_chat_sessions set score=coalesce(score,p_score),scored_at=coalesce(scored_at,v_now) where id=p_session;
  else raise exception 'Unknown event'; end if;
  return jsonb_build_object('recorded',true);
end; $$;

create function public.v2_service_metrics()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  if not coalesce(private.v2_can('overview','view'),false) or private.v2_role() not in ('admin','attendance','coordination','finance') then raise exception 'Operational viewer required' using errcode='42501'; end if;
  select jsonb_build_object(
    'since',current_timestamp-interval '30 days',
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
    where not is_test and coalesce(first_message_at,handoff_at,created_at)>=current_timestamp-interval '30 days';
  return v_result;
end; $$;

create function public.v2_service_queue()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if private.v2_role() not in ('admin','attendance','coordination') or not coalesce(private.v2_can('bookings','view'),false) then raise exception 'Attendance viewer required' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(q) order by q.handoff_at),'[]'::jsonb) from
    (select id,contact_name,phone,handoff_at,human_reply_at from public.v2_chat_sessions where not is_test
      and handoff_at is not null and (human_reply_at is null or human_reply_at>current_timestamp-interval '7 days')
      order by human_reply_at nulls first,handoff_at limit 200) q);
end; $$;

create function public.v2_service_record_reply(p_session uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if private.v2_role() not in ('admin','attendance','coordination') or not coalesce(private.v2_can('bookings','edit'),false) then raise exception 'Attendance editor required' using errcode='42501'; end if;
  update public.v2_chat_sessions set human_reply_at=clock_timestamp(),human_reply_by=(select auth.uid())
    where id=p_session and handoff_at is not null and human_reply_at is null and not is_test;
  if not found then raise exception 'Request already answered or not found'; end if;
end; $$;
revoke all on function public.v2_chat_begin(text,text,boolean),public.v2_chat_event(uuid,text,text,uuid,uuid,integer,text),public.v2_service_metrics(),public.v2_service_queue(),public.v2_service_record_reply(uuid) from public,anon,authenticated;
grant execute on function public.v2_chat_begin(text,text,boolean),public.v2_chat_event(uuid,text,text,uuid,uuid,integer,text) to service_role;
grant execute on function public.v2_service_metrics(),public.v2_service_queue(),public.v2_service_record_reply(uuid) to authenticated;
commit;
