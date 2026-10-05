-- 024 · Chamada esquecida vira tarefa da administração.
-- A Edge Function call-reminder (pg_cron, a cada 10 min) cria uma tarefa de
-- prioridade alta para cada técnico da equipe quando o treino terminou há 24 h
-- sem chamada e sem cancelamento, e conclui a tarefa quando a chamada é feita.
-- Esta tabela evita duplicar a tarefa e liga a tarefa ao treino.
begin;

create table if not exists public.v2_call_tasks (
  team_id uuid not null references public.teams(id) on delete cascade,
  training_date date not null,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (team_id, training_date, coach_id)
);
alter table public.v2_call_tasks enable row level security;
revoke all on public.v2_call_tasks from public, anon, authenticated;

commit;
