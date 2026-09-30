-- Transactional synthetic checks. Rollback removes all diagnostic rows.
begin;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$
declare s jsonb; sid uuid; token text; req uuid:=gen_random_uuid(); first_at timestamptz; rejected boolean:=false;
begin
  s:=public.v2_chat_begin('00000000000','Verificação Huddle',true);
  sid:=(s->>'id')::uuid; token:=s->>'token';
  perform public.v2_chat_event(sid,token,'message',req,null,null,'00000000000');
  select first_message_at into first_at from public.v2_chat_sessions where id=sid;
  perform public.v2_chat_event(sid,token,'message',req,null,null,'00000000000');
  if (select count(*) from public.v2_chat_requests where session_id=sid)<>1
     or (select first_message_at from public.v2_chat_sessions where id=sid)<>first_at then raise exception 'Duplicate request changed first-message measurement'; end if;
  begin
    perform public.v2_chat_event(sid,'wrong-token','handoff');
  exception when others then rejected:=true;
  end;
  if not rejected then raise exception 'Wrong capability accepted'; end if;
  perform public.v2_chat_event(sid,token,'failure',req);
  if (select first_response_at from public.v2_chat_sessions where id=sid) is not null then raise exception 'Failure counted as response'; end if;
  perform public.v2_chat_event(sid,token,'response',req);
  perform public.v2_chat_event(sid,token,'score',null,null,4);
  perform public.v2_chat_event(sid,token,'score',null,null,1);
  if (select score from public.v2_chat_sessions where id=sid)<>4 then raise exception 'Rating overwritten'; end if;
  perform public.v2_chat_event(sid,token,'handoff');
  if exists(select 1 from public.v2_chat_sessions where id=sid and (not is_test or first_response_at<first_message_at or handoff_at is null)) then raise exception 'Invalid event sequence'; end if;
end; $$;
select '022 synthetic checks passed; all diagnostic rows rolled back' as verification;
rollback;

select
  (select bool_and(relrowsecurity) from pg_class where oid in ('public.v2_chat_sessions'::regclass,'public.v2_chat_requests'::regclass)) as rls_enabled,
  has_table_privilege('anon','public.v2_chat_sessions','SELECT') as anonymous_table_read,
  has_table_privilege('authenticated','public.v2_chat_sessions','SELECT') as authenticated_raw_read,
  has_function_privilege('anon','public.v2_chat_begin(text,text,boolean)','EXECUTE') as anonymous_ingestion,
  has_function_privilege('authenticated','public.v2_chat_event(uuid,text,text,uuid,uuid,integer,text)','EXECUTE') as browser_ingestion,
  has_function_privilege('service_role','public.v2_chat_event(uuid,text,text,uuid,uuid,integer,text)','EXECUTE') as server_ingestion;
