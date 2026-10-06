// call-reminder — lembrete push de chamada pendente.
//
// Chamada pelo pg_cron a cada 10 minutos (migração 023). Para cada treino de hoje
// (grade das equipes ativas, horário de São Paulo) que terminou há 30 minutos ou
// mais, não foi cancelado no Huddle e ainda não tem chamada, avisa os técnicos da
// equipe uma única vez (tabela v2_call_reminders).
//
// Também transforma chamada esquecida há 24 h em tarefa da administração (ver
// missedCallTasks). Sem dados sensíveis na resposta e idempotente; por isso roda sem JWT:
//   supabase functions deploy call-reminder --no-verify-jwt --project-ref hrakdydodcmllwnkmrkg

import { createClient } from 'npm:@supabase/supabase-js@2';

const DELAY_MIN = 30;        // minutos após o fim do treino
const WINDOW_MIN = 180;      // depois disso, não lembra mais (evita aviso de madrugada)

function spNow() {
  // "Agora" em São Paulo como data, dia da semana e minutos desde 00:00
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short'
  }).formatToParts(new Date()).map(p => [p.type, p.value]));
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, dow, minutes: Number(parts.hour) % 24 * 60 + Number(parts.minute) };
}
const toMin = (hhmm: string) => { const [h, m] = String(hhmm).slice(0, 5).split(':').map(Number); return h * 60 + m; };


// ─── Chamada esquecida há 24 h vira tarefa da administração (migração 024) ───
// Só olha treinos que terminaram entre 24 h e 48 h atrás: cada treino passa por
// essa janela uma vez (sem gerar tarefas para semanas antigas).
type Slot = { day: number; start?: string; end?: string };
type Team = { id: string; name: string; training_schedule: Slot[] | null };
const DAY = 24 * 3600 * 1000;
const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

// deno-lint-ignore no-explicit-any
async function missedCallTasks(admin: any, teams: Team[], today: string) {
  const nowAbs = Date.now();
  const byKey = new Map<string, { team: Team; date: string; start: string; dow: number }>();
  for (const back of [1, 2]) {
    const ref = new Date(`${today}T12:00:00-03:00`);
    ref.setUTCDate(ref.getUTCDate() - back);
    const date = ref.toISOString().slice(0, 10);
    const dow = ref.getUTCDay();
    for (const t of teams) {
      for (const s of (Array.isArray(t.training_schedule) ? t.training_schedule : [])) {
        if (Number(s.day) !== dow || !s.start || !s.end) continue;
        const age = nowAbs - new Date(`${date}T${String(s.end).slice(0, 5)}:00-03:00`).getTime();
        if (age >= DAY && age < 2 * DAY && !byKey.has(`${t.id}|${date}`)) {
          byKey.set(`${t.id}|${date}`, { team: t, date, start: String(s.start).slice(0, 5), dow });
        }
      }
    }
  }

  let created = 0, completed = 0;
  const candidates = [...byKey.values()];
  if (candidates.length) {
    const ids = [...new Set(candidates.map(c => c.team.id))];
    const dates = [...new Set(candidates.map(c => c.date))].sort();
    const [cancelRes, logsRes, doneRes, coachesRes, authorRes] = await Promise.all([
      admin.from('v2_training_cancellations').select('team_id, training_date').in('team_id', ids).in('training_date', dates),
      admin.from('training_logs').select('team_id, started_at, attendance(count)').in('team_id', ids)
        .gte('started_at', `${dates[0]}T00:00:00-03:00`).lte('started_at', `${today}T00:00:00-03:00`),
      admin.from('v2_call_tasks').select('team_id, training_date, coach_id').in('team_id', ids).in('training_date', dates),
      admin.from('team_coaches').select('team_id, coach_id, profiles!inner(is_active)').in('team_id', ids),
      admin.from('profiles').select('id, email').eq('role', 'admin').eq('is_active', true)
    ]);
    const authors = authorRes.data || [];
    const author = (authors.find((a: { email: string }) => a.email === 'apollovoleibol@gmail.com') || authors[0])?.id;
    if (author) {
      const cancelled = new Set((cancelRes.data || []).map((r: { team_id: string; training_date: string }) => `${r.team_id}|${r.training_date}`));
      const spDate = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
      const called = new Set((logsRes.data || [])
        .filter((l: { attendance: { count: number }[] }) => (l.attendance?.[0]?.count || 0) > 0)
        .map((l: { team_id: string; started_at: string }) => `${l.team_id}|${spDate(l.started_at)}`));
      const done = new Set((doneRes.data || []).map((r: { team_id: string; training_date: string; coach_id: string }) => `${r.team_id}|${r.training_date}|${r.coach_id}`));

      for (const c of candidates) {
        const key = `${c.team.id}|${c.date}`;
        if (cancelled.has(key) || called.has(key)) continue;
        const coaches = (coachesRes.data || []).filter((x: { team_id: string; profiles: { is_active: boolean } }) =>
          x.team_id === c.team.id && x.profiles?.is_active !== false);
        const label = `${c.date.slice(8, 10)}/${c.date.slice(5, 7)}`;
        for (const coach of coaches) {
          if (done.has(`${key}|${coach.coach_id}`)) continue;
          // Marca antes de criar: execuções concorrentes não duplicam a tarefa
          const { error: markError } = await admin.from('v2_call_tasks')
            .insert({ team_id: c.team.id, training_date: c.date, coach_id: coach.coach_id });
          if (markError) continue;
          const { data: task } = await admin.from('tasks').insert({
            title: `Chamada pendente: ${c.team.name} (${label})`,
            description: `O treino de ${WEEKDAYS[c.dow]}, ${label}, às ${c.start}, ficou sem chamada. ` +
              'Registre a presença em Equipe → escolha a equipe → ajuste a data do treino. ' +
              'Esta tarefa é concluída automaticamente quando a chamada for salva.',
            assigned_to: coach.coach_id, assigned_by: author, created_by: author,
            team_id: c.team.id, due_date: today, priority: 'high', is_private: false
          }).select('id').single();
          if (!task) continue;
          await admin.from('v2_call_tasks').update({ task_id: task.id })
            .eq('team_id', c.team.id).eq('training_date', c.date).eq('coach_id', coach.coach_id);
          await admin.functions.invoke('send-push-notification', {
            body: { user_id: coach.coach_id, type: 'task_assigned', title: 'Nova tarefa atribuída',
              body: `Chamada pendente: ${c.team.name} (${label})`, url: '/#/tarefas', data: { task_id: task.id } }
          });
          created++;
        }
      }
    }
  }

  // Conclui as tarefas quando a chamada atrasada for feita
  const since = new Date(`${today}T12:00:00-03:00`);
  since.setUTCDate(since.getUTCDate() - 14);
  const { data: open } = await admin.from('v2_call_tasks')
    .select('team_id, training_date, task_id, tasks!inner(status)')
    .not('task_id', 'is', null).gte('training_date', since.toISOString().slice(0, 10))
    .neq('tasks.status', 'completed');
  for (const o of open || []) {
    const { data: logs } = await admin.from('training_logs').select('id, attendance(count)')
      .eq('team_id', o.team_id)
      .gte('started_at', `${o.training_date}T00:00:00-03:00`).lte('started_at', `${o.training_date}T23:59:59-03:00`);
    if ((logs || []).some((l: { attendance: { count: number }[] }) => (l.attendance?.[0]?.count || 0) > 0)) {
      const stamp = new Date().toISOString();
      await admin.from('tasks').update({ status: 'completed', completed_at: stamp, updated_at: stamp }).eq('id', o.task_id);
      completed++;
    }
  }
  return { created, completed };
}


// ─── Fechamento da folha: faltando 3 dias para o fim do mês, às 9h ───
// Uma notificação por técnico ativo por mês (confere se já foi enviada).
const PAYROLL_TITLE = 'Revise suas horas do mês';
const PAYROLL_BODY = 'Faltam 3 dias para o fechamento mensal da sua folha. Revise o registro de suas horas de treino e diárias de competições.';

// deno-lint-ignore no-explicit-any
async function payrollReminder(admin: any, now: { date: string; minutes: number }) {
  const [y, m, d] = now.date.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (lastDay - d !== 3 || now.minutes < 9 * 60) return 0;
  const monthStart = `${now.date.slice(0, 8)}01T00:00:00-03:00`;
  const [{ data: coaches }, { data: sent }] = await Promise.all([
    admin.from('profiles').select('id').eq('role', 'coach').eq('is_active', true),
    admin.from('notifications').select('user_id').eq('type', 'payroll_review').gte('sent_at', monthStart)
  ]);
  const already = new Set((sent || []).map((r: { user_id: string }) => r.user_id));
  const rows = (coaches || []).filter((c: { id: string }) => !already.has(c.id)).map((c: { id: string }) => ({
    user_id: c.id, type: 'payroll_review', title: PAYROLL_TITLE, body: PAYROLL_BODY, data: { url: '/#/treinos' }
  }));
  // O envio ao celular é feito pelo gatilho de notifications (migração 025)
  if (rows.length) await admin.from('notifications').insert(rows);
  return rows.length;
}

Deno.serve(async () => {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = spNow();

  const { data: teams, error } = await admin.from('teams')
    .select('id, name, training_schedule').eq('is_active', true);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const tasks = await missedCallTasks(admin, (teams || []) as Team[], now.date);
  const payroll = await payrollReminder(admin, now);

  // Treinos de hoje cuja janela de lembrete está aberta
  const due = (teams || []).flatMap(t => (Array.isArray(t.training_schedule) ? t.training_schedule : [])
    .filter((s: { day: number; start?: string; end?: string }) => Number(s.day) === now.dow && s.start && s.end)
    .filter((s: { end: string }) => {
      const since = now.minutes - (toMin(s.end) + DELAY_MIN);
      return since >= 0 && since < WINDOW_MIN;
    })
    .map((s: { start: string }) => ({ team: t, start: String(s.start).slice(0, 5) })));
  if (!due.length) return new Response(JSON.stringify({ checked: 0, sent: 0, tasks, payroll }));

  const ids = [...new Set(due.map(d => d.team.id))];
  const [cancelRes, logsRes, sentRes, coachesRes] = await Promise.all([
    admin.from('v2_training_cancellations').select('team_id').in('team_id', ids).eq('training_date', now.date),
    admin.from('training_logs').select('team_id, attendance(count)').in('team_id', ids)
      .gte('started_at', `${now.date}T00:00:00-03:00`).lte('started_at', `${now.date}T23:59:59-03:00`),
    admin.from('v2_call_reminders').select('team_id').in('team_id', ids).eq('training_date', now.date),
    admin.from('team_coaches').select('team_id, coach_id, profiles!inner(is_active)').in('team_id', ids)
  ]);
  const cancelled = new Set((cancelRes.data || []).map(r => r.team_id));
  const called = new Set((logsRes.data || []).filter(l => (l.attendance?.[0]?.count || 0) > 0).map(l => l.team_id));
  const already = new Set((sentRes.data || []).map(r => r.team_id));

  let sent = 0;
  for (const d of due) {
    const id = d.team.id;
    if (cancelled.has(id) || called.has(id) || already.has(id)) continue;
    // Marca antes de enviar: se outra execução concorrer, o insert falha e não duplica
    const { error: markError } = await admin.from('v2_call_reminders').insert({ team_id: id, training_date: now.date });
    if (markError) continue;
    already.add(id);
    const coaches = (coachesRes.data || []).filter(c => c.team_id === id && (c as { profiles: { is_active: boolean } }).profiles?.is_active !== false);
    for (const c of coaches) {
      await admin.functions.invoke('send-push-notification', {
        body: {
          user_id: c.coach_id, type: 'call_reminder',
          title: 'Chamada pendente',
          body: `${d.team.name} · treino das ${d.start} ainda sem chamada`,
          url: '/#/equipe'
        }
      });
      sent++;
    }
  }
  return new Response(JSON.stringify({ checked: due.length, sent, tasks, payroll }));
});
