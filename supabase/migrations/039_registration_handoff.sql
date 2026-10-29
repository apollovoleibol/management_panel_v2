-- TECNOFIT means registration complete, ready for staff to enter manually.
-- It is not evidence that a Tecnofit account or contract already exists.
begin;

drop trigger if exists finance_rows_mark_tecnofit on public.finance_report_rows;
drop trigger if exists tecnofit_links_mark_tecnofit on public.v2_tecnofit_athlete_links;

create or replace function private.tryouts_mark_tecnofit() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.tryouts t set status = 'TECNOFIT', updated_at = now()
  from public.athletes a
  where t.status = 'IN_REGISTRATION' and t.athlete_id = a.id
    and a.terms_accepted is true
    and jsonb_typeof(a.raw_form_data::jsonb) = 'object'
    and a.raw_form_data::jsonb <> '{}'::jsonb;
  get diagnostics n = row_count;
  return n;
end; $$;

-- AFTER preserves the approval event before logging the handoff event.
-- The second update does not recurse: its new status is TECNOFIT.
create or replace function private.tryout_registration_handoff() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.tryouts t set status = 'TECNOFIT', updated_at = now()
  from public.athletes a
  where t.id = new.id and t.status = 'IN_REGISTRATION' and t.athlete_id = a.id
    and a.terms_accepted is true
    and jsonb_typeof(a.raw_form_data::jsonb) = 'object'
    and a.raw_form_data::jsonb <> '{}'::jsonb;
  return null;
end; $$;
create trigger zz_tryouts_registration_handoff
after insert or update of status, athlete_id on public.tryouts
for each row when (new.status = 'IN_REGISTRATION' and new.athlete_id is not null)
execute function private.tryout_registration_handoff();

-- Handles a form completed after its athlete record has already been linked.
create or replace function private.athlete_registration_handoff() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.tryouts set status = 'TECNOFIT', updated_at = now()
  where athlete_id = new.id and status = 'IN_REGISTRATION';
  return null;
end; $$;
create trigger zz_athletes_registration_handoff
after insert or update of terms_accepted, raw_form_data on public.athletes
for each row when (new.terms_accepted is true
  and jsonb_typeof(new.raw_form_data::jsonb) = 'object'
  and new.raw_form_data::jsonb <> '{}'::jsonb)
execute function private.athlete_registration_handoff();

revoke all on function private.tryouts_mark_tecnofit(),
  private.tryout_registration_handoff(),private.athlete_registration_handoff()
  from public;

-- Reconcile only already approved, linked and completed registrations.
select private.tryouts_mark_tecnofit();
commit;
