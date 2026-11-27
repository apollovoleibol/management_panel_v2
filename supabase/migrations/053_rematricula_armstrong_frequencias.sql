-- 053 · Rematrícula 2027: adulto iniciante (Armstrong) com 1, 2 ou 3 treinos por semana, cada um com seu valor.
-- A chave 'armstrong' continua sendo a opção de 3x; entram 'armstrong-1x' e 'armstrong-2x', ligadas à mesma equipe.
-- Os rótulos, dias e horários precisam bater com TURMAS_2027 em js/contrato-2027.js (o teste confere).
update public.reenroll_offers
   set label = 'Armstrong – adulto iniciante (3x por semana)', days = 'Segunda, quarta e sábado', freq = '3x por semana',
       fee_cents = 19000, sort = 16
 where key = 'armstrong';

insert into public.reenroll_offers (key, team_id, label, location, days, time_label, freq, fee_cents, sort)
select o.key, (select team_id from public.reenroll_offers where key = 'armstrong'), o.label, 'Núcleo PUC – Prado Velho',
  o.days, '19h–20h (seg. e qua.); 9h–10h15 (sáb.)', o.freq, o.fee_cents, o.sort
from (values
  ('armstrong-1x', 'Armstrong – adulto iniciante (1x por semana)', '1 dia à escolha: segunda, quarta ou sábado', '1x por semana', 10990, 14),
  ('armstrong-2x', 'Armstrong – adulto iniciante (2x por semana)', '2 dias à escolha: segunda, quarta ou sábado', '2x por semana', 15990, 15)
) as o(key, label, days, freq, fee_cents, sort)
on conflict (key) do update set team_id = excluded.team_id, label = excluded.label, location = excluded.location, days = excluded.days,
  time_label = excluded.time_label, freq = excluded.freq, fee_cents = excluded.fee_cents, sort = excluded.sort, is_active = true;
