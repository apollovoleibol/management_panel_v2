// call-reminder — lembrete push de chamada pendente.
//
// Chamada pelo pg_cron a cada 10 minutos (migração 023). Para cada treino de hoje
// (grade das equipes ativas, horário de São Paulo) que terminou há 30 minutos ou
// mais, não foi cancelado no Huddle e ainda não tem chamada, avisa os técnicos da
// equipe uma única vez (tabela v2_call_reminders).
//
// Sem dados sensíveis na resposta e idempotente; por isso roda sem JWT:
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

Deno.serve(async () => {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = spNow();

  const { data: teams, error } = await admin.from('teams')
    .select('id, name, training_schedule').eq('is_active', true);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  // Treinos de hoje cuja janela de lembrete está aberta
  const due = (teams || []).flatMap(t => (Array.isArray(t.training_schedule) ? t.training_schedule : [])
    .filter((s: { day: number; start?: string; end?: string }) => Number(s.day) === now.dow && s.start && s.end)
    .filter((s: { end: string }) => {
      const since = now.minutes - (toMin(s.end) + DELAY_MIN);
      return since >= 0 && since < WINDOW_MIN;
    })
    .map((s: { start: string }) => ({ team: t, start: String(s.start).slice(0, 5) })));
  if (!due.length) return new Response(JSON.stringify({ checked: 0, sent: 0 }));

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
  return new Response(JSON.stringify({ checked: due.length, sent }));
});
