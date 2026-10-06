/* Maps the existing Manager App data into the v2 presentation model. */
'use strict';

const LIVE = { ready: false, loading: false, error: '', teamCoachIds: new Map() };
let PORTAL_ACCESS = [];
async function liveReload() {
  await liveLoadPanel();
  if (seesFinance()) await financeManualRefresh();
  render();
}
async function liveWrite(table, payload, id = null) {
  const query = id ? financeDbClient().from(table).update(payload).eq('id', id)
    : financeDbClient().from(table).insert(payload);
  const { data, error } = await query.select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('Nenhum registro foi gravado. Confira suas permissões.');
  return data[0];
}
async function liveDelete(table, id) {
  const { data, error } = await financeDbClient().from(table).delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('Nenhum registro foi excluído. Confira suas permissões.');
}
async function liveAll(table, columns = '*') {
  const out = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await financeDbClient().from(table).select(columns).range(start, start + 499);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
    if (data.length < 500) return out;
  }
}

function liveTeamSchedule(raw) {
  if (Array.isArray(raw)) return raw.filter(s => s && Number.isInteger(Number(s.day)))
    .map(s => ({ day: Number(s.day), start: s.start || '', end: s.end || '' }))
    .filter(s => s.start && s.end);
  if (raw && typeof raw === 'object') return Object.entries(raw)
    .map(([day, s]) => ({ day: Number(day), start: s?.start || '', end: s?.end || '' }))
    .filter(s => Number.isInteger(s.day) && s.start && s.end);
  return [];
}

function livePlan(raw, nucleusId, teamId, index) {
  const label = String(raw || '');
  const days = Number((label.match(/(\d+)\s*x\s*por\s*semana/i) || [])[1]) || 0;
  const amount = (label.match(/R\$\s*([\d.]+,\d{2})/) || [])[1];
  const fee = (label.match(/taxa de matr[ií]cula de\s*R\$\s*([\d.]+,\d{2})/i) || [])[1];
  const cents = str => str ? Math.round(Number(str.replace(/\./g, '').replace(',', '.')) * 100) : 0;
  return { id: index, days, value: cents(amount), fee: cents(fee), n: nucleusId, teams: [teamId], sourceLabel: label };
}

async function liveLoadPanel() {
  if (LIVE.loading) return;
  LIVE.loading = true; LIVE.error = '';
  try {
    const access = APOLLO_AUTH.access;
    const role = access.role;
    const isAdmin = role === 'admin';
    const finance = role === 'admin' || role === 'finance';
    const athleteColumns = finance ? '*' : role === 'coach'
      ? 'id,team_id,full_name,birth_date,phone,parent_phone,parent_email,is_active,joined_at,left_at,created_at,position,jersey_number'
      : 'id,team_id,full_name,birth_date,email,cpf,rg,phone,parent_name,parent_phone,parent_email,address,is_active,joined_at,left_at,created_at,position,jersey_number';
    const teamColumns = finance ? '*' : 'id,name,category,gender,training_days,training_time,gym_location,is_active,training_schedule,location_id,description,age_min,age_max,available_for_booking';
    const [locations, teams, links, athletes, tryouts, coaches, unavailable, cancellations, logs, attendance, competitions, staff, portalLinks] = await Promise.all([
      liveAll('training_locations', 'id,name,venue,address,phone,notes,is_active'),
      liveAll('teams', teamColumns),
      liveAll('team_coaches', 'team_id,coach_id,is_head'),
      liveAll('athletes', athleteColumns),
      liveAll('tryouts', 'id,name,minor_name,whatsapp_phone,scheduled_at,target_team,team_id,status,reschedule_count,archived_at,created_at'),
      isAdmin ? liveAll('profiles', 'id,full_name,email,phone,role,is_active') : liveAll('profiles', 'id,full_name,email,phone,role,is_active'),
      liveAll('team_unavailable_dates', 'team_id,date'),
      liveAll('v2_training_cancellations', 'team_id,training_date'),
      liveAll('training_logs', 'id,team_id,coach_id,conducted_by,started_at,ended_at,duration_minutes'),
      liveAll('attendance', 'log_id,athlete_id,status'),
      liveAll('competitions', 'id,team_id,name,scheduled_at,venue_name,status'),
      isAdmin ? liveAll('v2_staff', 'user_id,role,permissions,is_active') : Promise.resolve([]),
      isAdmin ? liveAll('v2_athlete_access', 'user_id,athlete_id,relation') : Promise.resolve([])
    ]);
    const user = APOLLO_AUTH.user;
    LIVE.teamCoachIds = new Map();
    for (const link of links) LIVE.teamCoachIds.set(link.team_id,
      [...(LIVE.teamCoachIds.get(link.team_id) || []), link.coach_id]);
    const ownProfile = coaches.find(p => p.id === user.id);
    const roleNames = { admin: 'Administrador', finance: 'Financeiro', coordination: 'Coordenação técnica', attendance: 'Atendimento', coach: 'Técnico' };
    const staffById = new Map(staff.map(s => [s.user_id, s]));
    USERS = (isAdmin ? coaches : [ownProfile].filter(Boolean)).map(p => {
      const row = staffById.get(p.id);
      const systemRole = p.id === user.id ? role : row?.role || (p.role === 'admin' ? 'admin' : p.role === 'coach' ? 'coach' : null);
      const uiRole = roleNames[systemRole] || 'Atendimento';
      const defaults = ROLE_PRESETS[uiRole] || ROLE_PRESETS['Atendimento'];
      const perms = Object.fromEntries(PAGES.map(page => [page.id,
        p.id === user.id ? (access.pages?.[page.id]?.edit ? 'edit' : access.pages?.[page.id]?.view ? 'view' : 'none')
          : (row?.permissions?.[page.id] || defaults[page.id] || 'none')]));
      return { id: p.id, name: p.full_name || p.email, email: p.email,
        role: uiRole, legacyRole: p.role, unassigned: p.role === 'customer' && !row,
        coachId: systemRole === 'coach' ? p.id : null,
        active: p.is_active !== false && row?.is_active !== false && !(p.role === 'customer' && !row),
        last: p.id === user.id ? 'Agora' : '—', perms };
    });
    if (!USERS.some(p => p.id === user.id)) USERS.unshift({ id: user.id,
      name: ownProfile?.full_name || user.user_metadata?.full_name || user.email,
      email: user.email, role: roleNames[role], coachId: role === 'coach' ? user.id : null,
      active: true, last: 'Agora', perms: Object.fromEntries(PAGES.map(p => [p.id,
        access.pages?.[p.id]?.edit ? 'edit' : access.pages?.[p.id]?.view ? 'view' : 'none'])) });
    S.userId = user.id;

    NUCLEI.splice(0, NUCLEI.length, ...locations.map(n => ({
      id: n.id, name: n.name, venue: n.venue || n.name, address: n.address || '', phone: n.phone || '', notes: n.notes || ''
    })));
    COACHES.splice(0, COACHES.length, ...coaches.filter(p => p.role === 'coach' && p.is_active !== false)
      .map(c => ({ id: c.id, name: c.full_name, phone: c.phone || '', rate: 0, daily: 0, pix: '' })));
    const blocked = new Map();
    unavailable.forEach(u => blocked.set(u.team_id, [...(blocked.get(u.team_id) || []), u.date]));
    const cancelled = new Map();
    cancellations.forEach(u => cancelled.set(u.team_id, [...(cancelled.get(u.team_id) || []), u.training_date]));
    TEAMS = teams.map(t => ({
      id: t.id, name: t.name, category: t.category || '', desc: t.description || '',
      ageMin: t.age_min ?? '', ageMax: t.age_max ?? null, gender: t.gender || 'Misto',
      n: t.location_id || locations.find(n => n.name === t.gym_location)?.id || null,
      coach: links.find(x => x.team_id === t.id && x.is_head)?.coach_id || links.find(x => x.team_id === t.id)?.coach_id || null,
      available: t.available_for_booking !== false, active: t.is_active !== false,
      schedule: liveTeamSchedule(t.training_schedule), blocked: blocked.get(t.id) || [], cancelled: cancelled.get(t.id) || []
    }));
    const planMap = new Map();
    let planNumber = 1;
    if (finance) teams.forEach(t => (t.available_payment_plans || []).forEach(raw => {
      const key = `${t.location_id}|${raw}`;
      if (planMap.has(key)) { planMap.get(key).teams.push(t.id); return; }
      planMap.set(key, livePlan(raw, t.location_id, t.id, planNumber++));
    }));
    PLANS = [...planMap.values()];
    ATHLETES = athletes.map(a => ({
      id: a.id, teamId: a.team_id, name: a.full_name, birth: a.birth_date || '',
      email: a.email || '', cpf: a.cpf || '', rg: a.rg || '', phone: a.phone || '',
      parentName: a.parent_name || '', parentPhone: a.parent_phone || '',
      address: a.address || '', bank: finance ? (a.payment_bank || '') : '',
      plan: finance ? (a.payment_plan || '') : '',
      planId: finance ? PLANS.find(p => p.sourceLabel === a.payment_plan && p.teams.includes(a.team_id))?.id : null,
      since: a.joined_at || (a.created_at || '').slice(0, 10) || ymd(TODAY), active: a.is_active !== false
    }));
    PORTAL_ACCESS = portalLinks.map(link => ({ ...link,
      userName: coaches.find(p => p.id === link.user_id)?.full_name || 'Conta sem perfil',
      userEmail: coaches.find(p => p.id === link.user_id)?.email || '',
      athleteName: athletes.find(a => a.id === link.athlete_id)?.full_name || 'Atleta não encontrado'
    }));
    const statuses = { PENDING: 'Pendente', CONFIRMED: 'Agendado', CANCELED: 'Cancelado', CANCELLED: 'Cancelado',
      IN_EVALUATION: 'Em avaliação', IN_REGISTRATION: 'Em cadastro', TECNOFIT: 'Tecnofit', MISSED: 'Ausente' };
    BOOKINGS = tryouts.map(b => ({
      id: b.id, nome: b.name || '', nomeMenor: b.minor_name || '', whatsapp: b.whatsapp_phone || '',
      teamId: b.team_id || TEAMS.find(t => b.target_team === t.name)?.id
        || TEAMS.find(t => String(b.target_team || '').startsWith(`${t.name} - `))?.id || null,
      date: b.scheduled_at ? b.scheduled_at.slice(0, 16) : '', status: statuses[String(b.status || '').toUpperCase()] || 'Pendente',
      reag: b.reschedule_count || 0, archived: !!b.archived_at, createdAt: (b.created_at || '').slice(0, 10)
    })).filter(b => b.teamId && b.date);
    const attendanceByLog = new Map();
    attendance.forEach(a => { if (!attendanceByLog.has(a.log_id)) attendanceByLog.set(a.log_id, {});
      attendanceByLog.get(a.log_id)[a.athlete_id] = a.status; });
    // Horas de quem conduziu o treino (substituto) ou, sem registro, de quem confirmou
    SESSIONS = logs.map(l => ({ teamId: l.team_id, coach: l.conducted_by || l.coach_id, date: l.started_at.slice(0, 10),
      start: l.started_at.slice(11, 16), hours: (l.duration_minutes || 0) / 60,
      recorded: attendanceByLog.has(l.id), att: attendanceByLog.get(l.id) || {} }));
    COMPETITIONS.splice(0, COMPETITIONS.length, ...competitions.map(c => ({
      id: c.id, teamId: c.team_id, name: c.name, date: c.scheduled_at.slice(0, 10), place: c.venue_name || ''
    })));
    LEDGER = []; DELINQ = []; IMPORTS = []; COACH_ITEMS = []; PAYOUTS = {};
    if (finance) {
      const [rates, items, payouts, tecnofitLinks] = await Promise.all([
        liveAll('v2_coach_rates', 'coach_id,hourly_cents,daily_cents,pix_key'),
        liveAll('v2_coach_items', 'id,coach_id,team_id,item_date,kind,description,hours,amount_cents,status,created_by'),
        liveAll('v2_coach_payouts', 'coach_id,month,amount_cents,paid_at'),
        liveAll('v2_tecnofit_athlete_links', 'athlete_id,client_id')
      ]);
      const clientByAthlete = new Map(tecnofitLinks.map(link => [link.athlete_id, link.client_id]));
      ATHLETES.forEach(athlete => { athlete.tecnofitClientId = clientByAthlete.get(athlete.id) || ''; });
      for (const r of rates) {
        const coach = COACHES.find(c => c.id === r.coach_id);
        if (coach) Object.assign(coach, { rate: r.hourly_cents, daily: r.daily_cents, pix: r.pix_key || '' });
      }
      COACH_ITEMS = items.map(i => ({ id: i.id, coach: i.coach_id, teamId: i.team_id,
        date: i.item_date, type: ({ training: 'treino', competition: 'competicao', extra: 'extra' })[i.kind],
        desc: i.description, hours: Number(i.hours), amount: i.amount_cents,
        status: ({ approved: 'aprovado', rejected: 'reprovado' })[i.status] || 'pendente',
        origin: i.created_by === i.coach_id ? 'Técnico' : 'Manual' }));
      PAYOUTS = Object.fromEntries(payouts.map(p => [`${p.coach_id}|${p.month.slice(0, 7)}`,
        { paidAt: p.paid_at.slice(0, 10), amount: p.amount_cents }]));
    }
    FIN_MANUAL.splice(0);
    FEEDER.history = [];
    S.cal.nuclei = new Set(NUCLEI.map(n => n.id));
    await serviceMetricsLoad();
    LIVE.ready = true;
  } catch (error) { LIVE.error = error.message; throw error; }
  finally { LIVE.loading = false; }
}
