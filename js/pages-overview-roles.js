/* Visão geral por perfil: operacional (sem dados financeiros) e técnico */
'use strict';

const coachScopeBanner = () => isCoach() ? `<div class="banner note">${icon('users')}<span>Mostrando apenas as suas equipes: <b>${myTeamIds().map(id => esc(teamOf(id).name)).join(', ') || 'nenhuma equipe vinculada'}</b>.</span></div>` : '';
const presencePct = list => { let p = 0, t = 0; list.forEach(s => Object.values(s.att).forEach(v => { t++; if (v === 'present') p++; })); return t ? Math.round(p / t * 100) : null; };
const kpiCard = ([l, v, f, s, i, extra = '']) => `<div class="kpi"><div class="kpi-label">${l}${icon(i)}</div><div class="kpi-value">${v}</div><div class="kpi-foot">${f}</div>${s ? `<div class="kpi-foot" style="margin-top:6px">${srcTag(s)}</div>` : ''}${extra}</div>`;

/* Perfis sem acesso financeiro (coordenação, atendimento): indicadores operacionais */
function opsKpisHTML() {
  const active = ATHLETES.filter(a => a.active), m0 = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
  const next7 = BOOKINGS.filter(b => !b.archived && b.status !== 'Cancelado' && parseLocal(b.date) >= NOW && parseLocal(b.date) <= addDays(TODAY, 8)).length;
  const toEval = BOOKINGS.filter(b => !b.archived && parseLocal(b.date) < NOW && ['Agendado', 'Pendente', 'Em avaliação'].includes(b.status)).length;
  const l30 = SESSIONS.filter(s => parseYmd(s.date) >= addDays(TODAY, -29)), ws = startOfWeek(TODAY);
  const weekTrainings = TEAMS.filter(t => t.active).reduce((n, t) => n + t.schedule.filter(s => !t.blocked.includes(ymd(addDays(ws, (s.day + 6) % 7)))).length, 0);
  const recorded = l30.filter(s => s.recorded).length;
  return `<div class="section-title" style="margin-top:0"><h2>Operação</h2></div>
  <div class="grid g5">${[
    ['Atletas ativos', active.length, `${active.filter(a => parseYmd(a.since) >= m0).length} novos neste mês`, 'Supabase', 'users'],
    ['Testes nos próximos 7 dias', next7, 'aulas experimentais agendadas', 'Supabase', 'calendar'],
    ['Aguardando avaliação', toEval, 'testes já realizados sem decisão', 'Manager App', 'target'],
    ['Presença média', (presencePct(l30) ?? '—') + '%', 'últimos 30 dias, todas as equipes', 'Manager App', 'check'],
    ['Treinos na semana', weekTrainings, `${pct(recorded, l30.length)} com chamada registrada (30 dias)`, 'Manager App', 'clock'],
  ].map(kpiCard).join('')}</div>`;
}

function athletesProjectionHTML() {
  const months = lastMonths(6), future = [1, 2, 3].map(k => new Date(TODAY.getFullYear(), TODAY.getMonth() + k, 1));
  const countAt = m => ATHLETES.filter(a => a.active && parseYmd(a.since) <= new Date(m.getFullYear(), m.getMonth() + 1, 0)).length;
  const real = months.map(countAt), growth = Math.max(1, (real.at(-1) - real[0]) / 5);
  const proj = [...real.map((v, i) => i === real.length - 1 ? v : null), ...future.map((_, k) => Math.round(real.at(-1) + growth * (k + 1)))];
  const l30 = SESSIONS.filter(s => parseYmd(s.date) >= addDays(TODAY, -29));
  const lines = [['Atletas ativos em 90 dias', `${proj.at(-1)} <span class="delta up">+${proj.at(-1) - real.at(-1)}</span>`], ['Novas matrículas por mês (média)', Math.round(growth)], ['Testes previstos (30 dias)', 100], ['Conversão teste → matrícula', pct(31, 71)], ['Presença média projetada', (presencePct(l30) ?? 0) + '%']];
  return `<div class="split-wide">
    <section class="panel"><div class="panel-head"><div><h2>Atletas ativos: realizado e projeção</h2><div class="sub">Pela data de entrada dos atletas ativos; projeção pelo ritmo médio de matrículas</div></div>
      <div class="legend"><span><i style="background:var(--ok)"></i>Atletas ativos</span><span><i class="dash" style="border-color:var(--info)"></i>Projeção</span></div></div>
      <div class="panel-pad">${lineChart({ labels: [...months, ...future].map(m => MON[m.getMonth()]), series: [{ values: [...real, null, null, null], color: 'var(--ok)', area: true }, { values: proj, color: 'var(--info)', dash: true }], fmt: v => Math.round(v) })}</div></section>
    <section class="panel"><div class="panel-head"><div><h2>Próximos 90 dias</h2><div class="sub">Cenário base · sem dados financeiros</div></div></div>
      <div class="panel-pad">${lines.map(([k, v]) => `<div class="stat-line"><span class="muted">${k}</span><b>${v}</b></div>`).join('')}
      <div class="banner note mt" style="margin-bottom:0">${icon('shield')}<span class="small">Receitas e demais indicadores financeiros ficam disponíveis apenas para os perfis Administrador e Financeiro.</span></div></div></section>
  </div>`;
}

/* Técnico: indicadores das próprias equipes (os mesmos explorados no Manager App) */
function renderCoachOverview() {
  const u = me(), c = coachOf(u.coachId), ids = myTeamIds(), first = u.name.split(' ')[0];
  const head = `<div class="page-head"><div><div class="eyebrow">Minhas equipes · ${MONTHS[TODAY.getMonth()]} de ${TODAY.getFullYear()}</div><h1>Olá, ${esc(first)}</h1><p>Presença, treinos, avaliações e agenda das suas equipes — os mesmos indicadores do Manager App.</p></div>
    <div class="chips">${ids.map(id => { const t = teamOf(id); return `<span class="chip"><span class="dot" style="background:var(--n-${NCLASS(t.n)})"></span>${esc(t.name)}</span>`; }).join('')}</div></div>`;
  if (!c || !ids.length) return head + `<div class="banner warn">${icon('alert')}<span>Nenhuma equipe vinculada a este técnico. Peça a um administrador para vincular suas equipes em Equipes e núcleos.</span></div>`;

  const ses = SESSIONS.filter(s => ids.includes(s.teamId)).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const from = d => ses.filter(s => parseYmd(s.date) >= d), rec = l => l.filter(s => s.recorded);
  const d7 = from(addDays(TODAY, -6)), mo = from(new Date(TODAY.getFullYear(), TODAY.getMonth(), 1)), l30 = from(addDays(TODAY, -29));
  const hours = l => l.reduce((n, s) => n + s.hours, 0).toLocaleString('pt-BR');
  const trend = rec(ses).slice(-8).map(s => presencePct([s]));
  let streak = 0; for (let i = ses.length - 1; i >= 0 && ses[i].recorded; i--) streak++;
  const athletes = ATHLETES.filter(a => a.active && ids.includes(a.teamId));
  const mine = BOOKINGS.filter(b => ids.includes(b.teamId) && !b.archived);
  const toEval = mine.filter(b => parseLocal(b.date) < NOW && ['Agendado', 'Pendente', 'Em avaliação'].includes(b.status)).sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = mine.filter(b => parseLocal(b.date) >= NOW && parseLocal(b.date) <= addDays(TODAY, 8) && b.status !== 'Cancelado').sort((a, b) => a.date.localeCompare(b.date));
  const comps = COMPETITIONS.filter(k => ids.includes(k.teamId)).sort((a, b) => a.date.localeCompare(b.date));
  const low = athletes.map(a => {
    const l = rec(l30).filter(s => s.att[a.id]), p = l.filter(s => s.att[a.id] === 'present').length;
    return { a, n: l.length, pct: l.length ? Math.round(p / l.length * 100) : 100, abs: l.filter(s => s.att[a.id] === 'absent').length };
  }).filter(x => x.n >= 3 && x.pct < 65).sort((a, b) => a.pct - b.pct).slice(0, 6);

  let next = null;
  for (let k = 0; k < 14 && !next; k++) {
    const d = addDays(TODAY, k);
    ids.map(teamOf).forEach(t => t.schedule.filter(s => s.day === d.getDay()).forEach(s => {
      const at = new Date(d); const [h, m] = s.start.split(':').map(Number); at.setHours(h, m);
      if (at > NOW && !t.blocked.includes(ymd(d)) && (!next || at < next.at)) next = { at, t, s };
    }));
  }

  const pw = presencePct(rec(d7)), pm = presencePct(rec(mo));
  const kpis = [
    ['Presença média', (pw ?? '—') + '%', `últimos 7 dias · no mês: ${pm ?? '—'}%`, 'Manager App', 'check', `<div style="margin-top:8px">${sparkline(trend.length > 1 ? trend : [0, 0], 'var(--ok)', 140, 30)}</div><div class="hint">últimos ${trend.length} treinos com chamada</div>`],
    ['Horas treinadas', hours(d7) + ' h', `últimos 7 dias · no mês: ${hours(mo)} h`, 'Manager App', 'clock'],
    ['Treinos', d7.length, `últimos 7 dias · no mês: ${mo.length}`, 'Manager App', 'calendar'],
    ['Chamadas registradas', `${rec(mo).length}/${mo.length}`, `no mês · sequência atual: ${streak} treino${streak === 1 ? '' : 's'} seguido${streak === 1 ? '' : 's'}`, 'Manager App', 'shield'],
    ['Atletas ativos', athletes.length, `em ${ids.length} equipe${ids.length > 1 ? 's' : ''}`, 'Supabase', 'users'],
    ['Testes a avaliar', toEval.length, `${upcoming.length} aula${upcoming.length === 1 ? '' : 's'} experimenta${upcoming.length === 1 ? 'l' : 'is'} nos próximos 7 dias`, 'Supabase', 'target'],
  ];
  const teamBars = ids.map(id => {
    const t = teamOf(id), v = presencePct(rec(l30).filter(s => s.teamId === id)) ?? 0;
    return `<div style="margin-bottom:12px"><div class="stat-line" style="border:0;padding:0 0 5px"><span>${esc(t.name)} ${nTag(t.n, '')}</span><b>${v}%</b></div><div class="bar"><span style="width:${v}%;background:${v >= 80 ? 'var(--ok)' : v >= 65 ? 'var(--warn)' : 'var(--brand)'}"></span></div></div>`;
  }).join('');
  const bk = b => `<li><span class="time-pill">${fmtShort(parseLocal(b.date))}</span><div style="flex:1;min-width:0"><strong>${esc(b.nomeMenor || b.nome)}</strong><div class="hint">${esc(teamOf(b.teamId).name)} · ${b.date.slice(11)}</div></div>${stTag(b.status)}</li>`;
  const compLi = k => { const dd = Math.round((parseYmd(k.date) - TODAY) / 864e5); return `<li>${icon('trophy')}<div style="flex:1;min-width:0"><strong>${esc(k.name)}</strong><div class="hint">${esc(teamOf(k.teamId).name)} · ${fmtDate(parseYmd(k.date))} · ${esc(k.place)}</div></div><span class="tag nodot ${dd <= 7 ? 'st-bad' : 'st-info'}">${dd === 0 ? 'hoje' : dd === 1 ? 'amanhã' : 'em ' + dd + ' dias'}</span></li>`; };

  return `${head}
  ${next ? `<div class="banner note">${icon('clock')}<span><b>Próximo treino:</b> ${esc(next.t.name)} · ${DOW_FULL[next.at.getDay()].toLowerCase()}, ${fmtShort(next.at)} às ${next.s.start} · ${esc(nucleusOf(next.t.n).venue)}</span></div>` : ''}
  <div class="grid g3">${kpis.map(kpiCard).join('')}</div>
  <div class="section-title"><h2>Minha agenda da semana</h2></div>
  ${weekCalendarHTML()}
  <div class="section-title"><h2>Minhas equipes</h2></div>
  <div class="split-wide">
    <div class="grid" style="gap:16px">
      <section class="panel"><div class="panel-head"><div><h2>Presença por equipe</h2><div class="sub">Últimos 30 dias · treinos com chamada registrada</div></div></div><div class="panel-pad">${teamBars}</div></section>
      <section class="panel"><div class="panel-head"><div><h2>Atenção à presença</h2><div class="sub">Atletas abaixo de 65% nos últimos 30 dias</div></div></div>
        ${low.length ? `<ul class="list">${low.map(x => `<li><span class="avatar">${initials(x.a.name)}</span><div style="flex:1;min-width:0"><strong>${esc(x.a.name)}</strong><div class="hint">${esc(teamOf(x.a.teamId).name)} · ${x.abs} falta${x.abs === 1 ? '' : 's'} em ${x.n} treinos</div></div><span class="tag nodot ${x.pct < 50 ? 'st-bad' : 'st-warn'}">${x.pct}%</span></li>`).join('')}</ul>` : '<div class="panel-pad muted small">Nenhum atleta abaixo de 65%.</div>'}</section>
    </div>
    <div class="grid" style="gap:16px">
      <section class="panel"><div class="panel-head"><div><h2>Aulas experimentais</h2><div class="sub">A avaliação é feita pelo Manager App após o treino</div></div></div>
        ${toEval.length ? `<div class="panel-pad" style="padding-bottom:0"><span class="eyebrow">Aguardando sua avaliação</span></div><ul class="list">${toEval.map(bk).join('')}</ul>` : ''}
        <div class="panel-pad" style="padding-bottom:0"><span class="eyebrow">Próximos 7 dias</span></div>${upcoming.length ? `<ul class="list">${upcoming.map(bk).join('')}</ul>` : '<div class="panel-pad muted small" style="padding-top:6px">Nenhum teste agendado.</div>'}</section>
      <section class="panel"><div class="panel-head"><h2>Próximas competições</h2></div>
        ${comps.length ? `<ul class="list">${comps.map(compLi).join('')}</ul>` : '<div class="panel-pad muted small">Nenhuma competição agendada.</div>'}</section>
    </div>
  </div>`;
}
