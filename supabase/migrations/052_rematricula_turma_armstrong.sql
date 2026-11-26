-- 052 · Rematrícula 2027: turma Armstrong passa a se chamar "Armstrong – adulto iniciante".
-- O rótulo precisa bater com TURMAS_2027 em js/contrato-2027.js (Anexo I do contrato).
update public.reenroll_offers set label = 'Armstrong – adulto iniciante' where key = 'armstrong';
