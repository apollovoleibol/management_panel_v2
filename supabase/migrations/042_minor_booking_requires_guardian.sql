-- 042 · Agendamento de menor só existe ligado a um responsável legal maior de idade.
-- Substitui a "confirmação posterior pelo atendimento" (040/041):
--   * turma de menores: exige nome completo do atleta, nome completo do responsável (tryouts.name),
--     WhatsApp do responsável e a relação (pai/mãe ou responsável legal). Com esses dados o
--     agendamento já pode ficar confirmado; sem eles, não é gravado.
--   * se quem agendou foi o próprio atleta (declaredBy = MINOR), o WhatsApp do responsável
--     precisa ser diferente do número que fez o agendamento.
--   * turma adulta: só o nome do próprio atleta.
-- Registrar resultado do teste ou reagendar não exige nada novo. Agendamentos antigos sem os
-- dados do responsável continuam como estão, mas só voltam a "Agendado" depois de completados.
begin;
create or replace function private.booking_adult_consent_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare c jsonb:=coalesce(new.booking_consent,'{}'::jsonb); tm record; minor boolean;
 guardian_name text:=trim(coalesce(new.name,'')); athlete_name text:=nullif(trim(new.minor_name),'');
 gphone text; rel text; who text; old_ok boolean;
begin
 if tg_op='UPDATE' and new.name is not distinct from old.name and new.minor_name is not distinct from old.minor_name
   and new.team_id is not distinct from old.team_id and new.whatsapp_phone is not distinct from old.whatsapp_phone
   and new.booking_consent is not distinct from old.booking_consent then
  old_ok:=old.minor_name is null or coalesce(old.booking_consent->>'guardianPhone','') ~ '^[0-9]{10,13}$';
  if new.status is not distinct from old.status or new.status is distinct from 'CONFIRMED' or old_ok then return new; end if;
 end if;
 select id,category,age_min into tm from public.teams where id=new.team_id;
 if not found then raise exception 'Equipe não identificada.' using errcode='23514'; end if;
 if coalesce(tm.category,'') ~* '^adulto' then minor:=false;
 elsif tm.age_min is not null then minor:=tm.age_min<18;
 elsif coalesce(tm.category,'') ~* 'sub|escolinha|base|infantil|juvenil' then minor:=true;
 else raise exception 'Faixa etária da equipe precisa ser conferida.' using errcode='23514'; end if;
 if array_length(regexp_split_to_array(guardian_name,'\s+'),1)<2 then
  raise exception '%', case when minor then 'Informe o nome completo do responsável.' else 'Informe o nome completo do atleta.' end using errcode='23514'; end if;
 if not minor then
  if athlete_name is not null then raise exception 'Turma adulta utiliza somente o nome do próprio atleta.' using errcode='23514'; end if;
  new.booking_consent:=jsonb_build_object('version','2026-10-31','subjectType','SELF','state','NOT_REQUIRED',
   'source',case when auth.uid() is null then 'chatbot' else 'staff' end,'requestedAt',now());
  return new;
 end if;
 if athlete_name is null or array_length(regexp_split_to_array(athlete_name,'\s+'),1)<2
  or private.norm_name(athlete_name)=private.norm_name(guardian_name) then
  raise exception 'Informe nomes completos e diferentes para o atleta menor e o responsável.' using errcode='23514'; end if;
 gphone:=regexp_replace(coalesce(c->>'guardianPhone',''),'\D','','g');
 rel:=c->>'guardianRelationship';
 if gphone !~ '^[0-9]{10,13}$' or rel is null or rel not in ('PARENT','LEGAL_GUARDIAN') then
  raise exception 'Agendamento de menor exige o nome completo, o WhatsApp e a relação do pai, mãe ou responsável legal.' using errcode='23514'; end if;
 who:=case c->>'declaredBy' when 'MINOR' then 'MINOR' when 'STAFF' then 'STAFF' else 'GUARDIAN' end;
 if who='MINOR' and private.norm_phone(gphone)=private.norm_phone(new.whatsapp_phone) then
  raise exception 'O WhatsApp do responsável deve ser diferente do número do atleta.' using errcode='23514'; end if;
 new.booking_consent:=jsonb_build_object('version','2026-10-31','subjectType','MINOR','state','DECLARED',
  'guardianName',guardian_name,'guardianPhone',gphone,'guardianRelationship',rel,'declaredBy',who,
  'source',case when auth.uid() is null then 'chatbot' else 'staff' end,'recordedBy',auth.uid(),'declaredAt',now());
 return new;
end; $$;
revoke all on function private.booking_adult_consent_guard() from public;
commit;
