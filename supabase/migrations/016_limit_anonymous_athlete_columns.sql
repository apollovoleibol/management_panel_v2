-- The deployed chatbot reads only id and phone from athletes to match a
-- WhatsApp contact. The existing anon SELECT policy allowed every column,
-- including CPF, financial plan and medical history, to be queried publicly.
-- Column privileges close that exposure while preserving the chatbot lookup.
begin;
revoke select on table public.athletes from anon;
grant select (id, phone) on table public.athletes to anon;
commit;
