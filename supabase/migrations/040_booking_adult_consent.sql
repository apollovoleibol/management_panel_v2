-- Team determines booking fields. Minor requests require staff confirmation.
begin;
alter table public.tryouts add column booking_consent jsonb;
comment on column public.tryouts.booking_consent is 'MINOR requests are pending until staff confirms adult guardian authorization; adult classes use SELF. No documentary identity verification. Historical consent is never inferred.';

-- Preserve future requests, but remove an authorization that was never recorded.
with minor_teams as (
 select id from public.teams where not (coalesce(category,'') ~* '^adulto')
 and (age_min<18 or (age_min is null and coalesce(category,'') ~* 'sub|escolinha|base|infantil|juvenil'))
)
update public.tryouts t set status='PENDING',booking_consent=jsonb_build_object(
 'version','2026-10-29','subjectType','MINOR','state','PENDING_GUARDIAN',
 'guardianConsent',false,'adultConfirmed',false,'source','legacy','requestedAt',now())
where team_id in(select id from minor_teams) and scheduled_at>=now() and status='CONFIRMED';

create function private.booking_adult_consent_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare c jsonb:=coalesce(new.booking_consent,'{}'::jsonb); tm record; minor boolean;
 guardian_name text:=trim(coalesce(new.name,'')); athlete_name text:=nullif(trim(new.minor_name),'');
 confirmed boolean:=false; previous_confirmation boolean:=false;
begin
 if tg_op='UPDATE' then
  -- Cancellation and legacy registration completion do not create new consent.
  if new.name is not distinct from old.name and new.minor_name is not distinct from old.minor_name
   and new.scheduled_at is not distinct from old.scheduled_at and new.team_id is not distinct from old.team_id
   and new.whatsapp_phone is not distinct from old.whatsapp_phone
   and new.booking_consent is not distinct from old.booking_consent
   and (new.status is not distinct from old.status or new.status in ('CANCELLED','CANCELED','MISSED')
    or (old.status='IN_REGISTRATION' and new.status='TECNOFIT')) then return new; end if;
  previous_confirmation:=old.booking_consent->>'state'='CONFIRMED'
   and old.booking_consent is not distinct from new.booking_consent
   and new.name is not distinct from old.name and new.minor_name is not distinct from old.minor_name;
 end if;
 select id,category,age_min into tm from public.teams where id=new.team_id;
 if not found then raise exception 'Equipe não identificada.' using errcode='23514'; end if;
 if coalesce(tm.category,'') ~* '^adulto' then minor:=false;
 elsif tm.age_min is not null then minor:=tm.age_min<18;
 elsif coalesce(tm.category,'') ~* 'sub|escolinha|base|infantil|juvenil' then minor:=true;
 else raise exception 'Faixa etária da equipe precisa ser conferida.' using errcode='23514'; end if;
 if array_length(regexp_split_to_array(guardian_name,'\s+'),1)<2 then raise exception 'Informe o nome completo do contato.' using errcode='23514'; end if;
 if not minor then
  if athlete_name is not null then raise exception 'Turma adulta utiliza somente o nome do próprio atleta.' using errcode='23514'; end if;
  new.booking_consent:=jsonb_build_object('version','2026-10-29','subjectType','SELF','state','NOT_REQUIRED','source',case when auth.uid() is null then 'chatbot' else 'staff' end,'requestedAt',now());return new;
 end if;
 if athlete_name is null or array_length(regexp_split_to_array(athlete_name,'\s+'),1)<2
  or private.norm_name(athlete_name)=private.norm_name(guardian_name) then
  raise exception 'Informe nomes completos e diferentes para o atleta menor e o responsável.' using errcode='23514'; end if;
 confirmed:=coalesce(previous_confirmation,false) or (auth.uid() is not null
  and coalesce(private.v2_can('bookings','edit'),false) and c->>'version'='2026-10-29'
  and c->>'state'='CONFIRMED' and c->'guardianConsent'='true'::jsonb and c->'adultConfirmed'='true'::jsonb
  and c->>'guardianRelationship' in ('PARENT','LEGAL_GUARDIAN')
  and coalesce(c->>'guardianPhone','') ~ '^[0-9]{10,13}$');
 if new.status is distinct from 'PENDING' and not coalesce(confirmed,false) then
  raise exception 'Confirme com o responsável adulto e registre sua autorização antes de autorizar a participação. Use Editar no Huddle.' using errcode='23514'; end if;
 if confirmed then
  if coalesce(previous_confirmation,false) then return new; end if;
  new.booking_consent:=jsonb_build_object('version','2026-10-29','subjectType','MINOR','state','CONFIRMED',
   'guardianName',guardian_name,'guardianPhone',c->>'guardianPhone','guardianConsent',true,'adultConfirmed',true,'guardianRelationship',c->>'guardianRelationship',
   'source','staff','recordedBy',auth.uid(),'confirmedAt',now());
 else
  new.booking_consent:=jsonb_build_object('version','2026-10-29','subjectType','MINOR','state','PENDING_GUARDIAN',
   'guardianConsent',false,'adultConfirmed',false,'source',case when auth.uid() is null then 'chatbot' else 'staff' end,'requestedAt',now());
 end if;
 return new;
end; $$;
revoke all on function private.booking_adult_consent_guard() from public;
create trigger tryouts_adult_consent before insert or update of name,minor_name,scheduled_at,team_id,whatsapp_phone,booking_consent,status on public.tryouts
for each row execute function private.booking_adult_consent_guard();
commit;
