/* Apollo · Área do atleta (protótipo com dados fictícios em memória) */
'use strict';

Object.assign(ICONS, {
  home: 'M3 11l9-8 9 8 M5 9.5V21h14V9.5 M10 21v-6h4v6',
  card: 'M2 6h20v12H2z M2 10h20 M6 15h4',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.7 21a2 2 0 0 1-3.4 0',
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z M9 4v14 M15 6v14',
  heart: 'M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 22l8.8-8.6a5.5 5.5 0 0 0 0-7.8z',
  camera: 'M3 7h4l2-3h6l2 3h4v13H3z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  bus: 'M5 17V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v12 M5 17h14 M5 12h14 M7 20v-3 M17 20v-3 M8 14.5h.01 M16 14.5h.01',
  pen: 'M4 20h4L19 9l-4-4L4 16z',
  x2: 'M18 6 6 18 M6 6l12 12',
});

/* ─── Tipos de atleta ─── */
const TYPES = {
  'escolinha': { label: 'Escolinha', minor: true, competitive: false },
  'base': { label: 'Categoria de base', minor: true, competitive: true },
  'adulto-competitivo': { label: 'Adulto · competitivo', minor: false, competitive: true },
  'adulto-iniciante': { label: 'Adulto · iniciante', minor: false, competitive: false },
};
const LEVELS = ['Iniciando', 'Desenvolvendo', 'Bom', 'Consolidado'];
const bday = (age, m, d) => ymd(new Date(TODAY.getFullYear() - age, m, d));
const inDays = n => ymd(addDays(TODAY, n));

/* ─── Atletas ─── */
const ATH = {
  alice: {
    id: 'alice', name: 'Alice Gomes', birth: bday(14, 2, 12), teamId: 't2', type: 'base', planId: 1, since: '2024-02-05', position: 'Ponteira', shirt: 7, rate: .9,
    canLeaveAlone: true, atestado: inDays(140), image: true, whatsapp: true,
    health: { allergies: 'Nenhuma informada', insurance: 'Unimed', emergency: 'Marcos Gomes (pai) · (11) 97777-0002' },
    pickup: [['Renata Gomes', 'mãe'], ['Marcos Gomes', 'pai'], ['Larissa Gomes', 'irmã']],
    scout: { games: 6, points: 34, aces: 8, attack: 38, reception: 58, blocks: 3 },
    matches: [[-13, 'AABB Sub-15', 'Vitória 2×1', 9], [-20, 'Clube Náutico', 'Derrota 0×2', 4], [-27, 'Colégio Atlas', 'Vitória 2×0', 7]],
    feedback: 'Evoluiu muito no ataque pela entrada. Próximo foco: recepção de saque flutuante.',
  },
  enzo: {
    id: 'enzo', name: 'Enzo Gomes', birth: bday(9, 6, 3), teamId: 't7', type: 'escolinha', planId: 6, since: '2025-08-11', rate: .8,
    canLeaveAlone: false, atestado: inDays(12), image: null, whatsapp: true,
    health: { allergies: 'Alergia a amendoim', insurance: 'Unimed', emergency: 'Renata Gomes (mãe) · (11) 97777-0001' },
    pickup: [['Renata Gomes', 'mãe'], ['Marcos Gomes', 'pai'], ['Cláudia Lima', 'avó']],
    skills: [['Toque', 3], ['Manchete', 2], ['Saque por baixo', 2], ['Deslocamento', 3], ['Trabalho em equipe', 4]],
    feedback: 'Enzo é muito participativo e ajuda os colegas! Vamos trabalhar a manchete com mais calma.',
  },
  clara: {
    id: 'clara', name: 'Clara Prado', birth: bday(11, 9, 20), teamId: 't1', type: 'escolinha', planId: 1, since: '2025-03-03', rate: .95,
    canLeaveAlone: false, atestado: inDays(200), image: true, whatsapp: true,
    health: { allergies: 'Nenhuma informada', insurance: 'Bradesco Saúde', emergency: 'Paulo Prado (pai) · (11) 96666-0002' },
    pickup: [['Juliana Prado', 'mãe'], ['Paulo Prado', 'pai']],
    skills: [['Toque', 4], ['Manchete', 3], ['Saque por baixo', 3], ['Saque por cima', 1], ['Posicionamento', 2]],
    feedback: 'Pronta para começar o saque por cima. Excelente atitude nos treinos.',
  },
  larissa: {
    id: 'larissa', name: 'Larissa Gomes', birth: bday(27, 4, 8), teamId: 't6', type: 'adulto-competitivo', planId: 4, since: '2022-03-14', position: 'Levantadora', shirt: 10, rate: .86,
    atestado: inDays(-5), image: true, whatsapp: true,
    health: { allergies: 'Nenhuma informada', insurance: 'SulAmérica', emergency: 'Renata Gomes (mãe) · (11) 97777-0001' },
    scout: { games: 8, points: 21, aces: 11, attack: 31, reception: 49, blocks: 6 },
    matches: [[-9, 'Clube Atlético', 'Vitória 3×1', 5], [-16, 'Vôlei Leste', 'Vitória 3×0', 4], [-30, 'Arena Norte', 'Derrota 1×3', 2]],
    feedback: 'Distribuição de jogo mais rápida pelas pontas. Manter o volume de saque viagem.',
  },
  lucas: {
    id: 'lucas', name: 'Lucas Ferreira', birth: bday(31, 11, 1), teamId: 't4', type: 'adulto-iniciante', planId: 3, since: inDays(-20), rate: .7,
    atestado: null, image: null, whatsapp: true,
    health: { allergies: '', insurance: '', emergency: '' },
    skills: [['Toque', 2], ['Manchete', 2], ['Saque', 1], ['Posicionamento em quadra', 1], ['Regras do jogo', 3]],
    feedback: 'Ótimo começo! Chegar 10 minutos antes ajuda no aquecimento e no saque.',
  },
};

/* ─── Contas (quem faz login) ─── */
const ACCOUNTS = {
  familia: { id: 'familia', name: 'Renata Gomes', email: 'renata.gomes@exemplo.com', phone: '11977770001', address: 'Rua das Acácias, 210 — Centro', kind: 'guardian', relation: 'mãe', dependents: ['alice', 'enzo'], coGuardian: ['Marcos Gomes', 'pai', 'marcos.gomes@exemplo.com', true] },
  larissa: { id: 'larissa', name: 'Larissa Gomes', email: 'larissa.gomes@exemplo.com', phone: '11977770003', address: 'Rua das Acácias, 210 — Centro', kind: 'athlete', dependents: ['larissa'] },
  lucas: { id: 'lucas', name: 'Lucas Ferreira', email: 'lucas.ferreira@exemplo.com', phone: '11960004211', address: '', kind: 'athlete', dependents: ['lucas'] },
  juliana: { id: 'juliana', name: 'Juliana Prado', email: 'juliana.prado@apollo.exemplo', phone: '11990000002', address: 'Rua Ipê, 88 — Centro', kind: 'guardian', relation: 'mãe', dependents: ['clara'], coGuardian: ['Paulo Prado', 'pai', 'paulo.prado@exemplo.com', false], staff: 'u7' },
};
const ACC = ACCOUNTS[new URLSearchParams(location.search).get('conta')] || ACCOUNTS.familia;
const isGuardian = ACC.kind === 'guardian';

/* ─── Dados derivados por atleta ─── */
let seed = 11; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
Object.values(ATH).forEach(a => {
  const t = teamOf(a.teamId);
  a.att = [];
  for (let d = addDays(TODAY, -55); d <= TODAY; d = addDays(d, 1)) {
    const s = t.schedule.find(x => x.day === d.getDay());
    if (!s || t.blocked.includes(ymd(d)) || parseYmd(ymd(d)) < parseYmd(a.since)) continue;
    const at = new Date(d); const [h, m] = s.start.split(':').map(Number); at.setHours(h, m);
    if (at > NOW) continue;
    const r = rnd(); a.att.push({ date: ymd(d), st: r < a.rate ? 'p' : r < a.rate + .06 ? 'e' : 'a' });
  }
  a.notified = new Map();   // data → motivo (ausência avisada)
  // Mensalidades (espelho do Tecnofit)
  const plan = PLANS.find(p => p.id === a.planId);
  a.invoices = [];
  for (let k = -5; k <= 1; k++) {
    const due = new Date(TODAY.getFullYear(), TODAY.getMonth() + k, 10);
    if (due < addDays(parseYmd(a.since), -10)) continue;
    let st = due > TODAY ? 'aberto' : 'pago';
    if (a.id === 'enzo' && k === 0) st = 'vencido';
    a.invoices.push({ id: uid('f'), ref: `${MON[due.getMonth()]}/${due.getFullYear()}`, due: ymd(due), value: plan.value, st, paidAt: st === 'pago' ? ymd(addDays(due, -2)) : null, method: st === 'pago' ? (k % 2 ? 'Pix' : 'Cartão') : null });
  }
});
const EVENTS = [
  { id: 'e1', ath: 'alice', kind: 'comp', name: 'Liga Regional Sub-15 — 4ª rodada', date: inDays(9), time: '08:30', place: 'Ginásio Apollo Centro', meet: '07:45 no ginásio', transport: 'Jogo em casa — sem transporte', items: 'Uniforme de jogo nº 7, joelheiras e garrafa de água', needsAuth: true, status: 'pendente' },
  { id: 'e2', ath: 'enzo', kind: 'comp', name: 'Festival Norte de Iniciação', date: inDays(15), time: '09:00', place: 'Centro Esportivo Norte', meet: '08:30 na quadra', transport: 'Responsáveis levam', items: 'Camiseta da Apollo, tênis e lanche', needsAuth: true, status: 'pendente' },
  { id: 'e3', ath: 'clara', kind: 'comp', name: 'Festival de Iniciação', date: inDays(22), time: '09:00', place: 'Arena Sul', meet: '08:00 no Ginásio Centro', transport: 'Van da Apollo (ida e volta)', items: 'Camiseta da Apollo, tênis e lanche', needsAuth: true, status: 'autorizado' },
  { id: 'e4', ath: 'larissa', kind: 'comp', name: 'Copa Primavera — Torneio Amador Feminino', date: inDays(12), time: '14:00', place: 'Clube Atlético', meet: '13:15 no local', transport: 'Carona combinada pelo grupo', items: 'Uniforme de jogo nº 10', needsAuth: false, status: 'pendente' },
  { id: 'e5', ath: 'lucas', kind: 'event', name: 'Jogo recreativo de integração', date: inDays(10), time: '20:00', place: 'Ginásio Apollo Centro', meet: '19:45', transport: '—', items: 'Roupa de treino', needsAuth: false, status: 'pendente', optional: true },
  { id: 'e6', ath: 'alice', kind: 'event', name: 'Reunião de pais — categorias de base', date: inDays(7), time: '19:30', place: 'Ginásio Apollo Centro', meet: '—', transport: '—', items: '—', needsAuth: false, status: 'pendente', parents: true, optional: true },
];
const NEWS = [
  { id: 'n1', team: null, from: 'Coordenação Apollo', title: 'Novo uniforme de treino disponível', text: 'As encomendas vão até 10/10 pela secretaria. Tamanhos infantis e adultos.', date: inDays(-1), unread: true },
  { id: 'n2', team: 't2', from: 'Juliana Prado · técnica Sub-15', title: 'Convocação para a Liga Regional', text: 'Lista de convocadas publicada. Responsáveis, confirmem a autorização até quinta-feira.', date: inDays(-2), unread: true },
  { id: 'n3', team: 't7', from: 'Diego Santana · Iniciação Misto', title: 'Garrafinha identificada', text: 'Pedimos que as crianças tragam garrafinha de água com o nome. Obrigado!', date: inDays(-4), unread: false },
  { id: 'n4', team: 't6', from: 'Camila Rocha · Adulto Feminino', title: 'Copa Primavera', text: 'Inscrição confirmada. Quem vai jogar, confirme presença na área do atleta.', date: inDays(-3), unread: true },
  { id: 'n5', team: 't4', from: 'Rafael Moura · Adulto Misto', title: 'Bem-vindos, novatos!', text: 'Nesta fase, o foco é fundamentos. Qualquer dúvida, falem comigo no treino.', date: inDays(-6), unread: false },
  { id: 'n6', team: 't1', from: 'Juliana Prado · Sub-13 Misto', title: 'Festival de Iniciação', text: 'Van sai às 8h do Ginásio Centro. Autorizações pela área do atleta.', date: inDays(-5), unread: false },
];

/* ─── Estado ─── */
const V = { tab: 'home', dep: ACC.dependents[0], agScope: 'one' };
const cur = () => ATH[V.dep];
const deps = () => ACC.dependents.map(id => ATH[id]);
const ageOf = a => { const b = parseYmd(a.birth); let n = TODAY.getFullYear() - b.getFullYear(); if (TODAY < new Date(TODAY.getFullYear(), b.getMonth(), b.getDate())) n--; return n; };
const first = n => n.split(' ')[0];
const typeOf = a => TYPES[a.type];
const newsFor = list => NEWS.filter(n => !n.team || list.some(a => a.teamId === n.team)).sort((a, b) => b.date.localeCompare(a.date));
const hd = t => t.replace(':00', 'h').replace(':', 'h');
const whenTxt = (date, time) => { const d = parseYmd(date), diff = Math.round((d - TODAY) / 864e5); const rel = diff === 0 ? 'Hoje' : diff === 1 ? 'Amanhã' : `${DOW_FULL[d.getDay()]}`; return `${rel}, ${d.getDate()} de ${MONTHS[d.getMonth()]}${time ? ' · ' + time : ''}`; };

function trainings(a, days = 28) {
  const t = teamOf(a.teamId), out = [];
  for (let k = 0; k < days; k++) {
    const d = addDays(TODAY, k), s = t.schedule.find(x => x.day === d.getDay()); if (!s) continue;
    const at = new Date(d); const [h, m] = s.start.split(':').map(Number); at.setHours(h, m);
    if (k === 0 && toMin(s.end) <= NOW.getHours() * 60 + NOW.getMinutes()) continue;
    out.push({ kind: 'train', ath: a.id, date: ymd(d), start: s.start, end: s.end, off: t.blocked.includes(ymd(d)), at });
  }
  return out;
}
const nextTraining = a => trainings(a, 21).find(x => !x.off);
function pendencias() {
  const out = [];
  deps().forEach(a => {
    const tag = isGuardian ? `<span class="who-tag">${esc(first(a.name))}</span>` : '';
    EVENTS.filter(e => e.ath === a.id && e.status === 'pendente' && !e.optional).forEach(e => out.push({ ic: 'trophy', cls: 'red', title: `${tag}${e.needsAuth ? 'Autorize a participação' : 'Confirme sua presença'}`, sub: `${e.name} · ${fmtShort(parseYmd(e.date))}`, act: 'event', id: e.id, label: e.needsAuth ? 'Autorizar' : 'Responder' }));
    a.invoices.filter(i => i.st === 'vencido').forEach(i => out.push({ ic: 'card', cls: 'red', title: `${tag}Mensalidade de ${i.ref} vencida`, sub: `${money(i.value)} · venceu em ${fmtShort(parseYmd(i.due))}`, act: 'pay', id: i.id, ath: a.id, label: 'Pagar' }));
    a.invoices.filter(i => i.st === 'aberto' && (parseYmd(i.due) - TODAY) / 864e5 <= 15).forEach(i => out.push({ ic: 'card', cls: 'amber', title: `${tag}Mensalidade de ${i.ref}`, sub: `${money(i.value)} · vence em ${fmtShort(parseYmd(i.due))}`, act: 'pay', id: i.id, ath: a.id, label: 'Pagar' }));
    if (!a.atestado) out.push({ ic: 'file', cls: 'amber', title: `${tag}Envie o atestado médico`, sub: 'Obrigatório para treinar e competir', act: 'atestado', ath: a.id, label: 'Enviar' });
    else { const dd = Math.round((parseYmd(a.atestado) - TODAY) / 864e5); if (dd < 30) out.push({ ic: 'file', cls: dd < 0 ? 'red' : 'amber', title: `${tag}Atestado médico ${dd < 0 ? 'vencido' : 'vence em ' + dd + ' dias'}`, sub: `Validade: ${fmtDate(parseYmd(a.atestado))}`, act: 'atestado', ath: a.id, label: 'Enviar novo' }); }
    if (a.image === null) out.push({ ic: 'camera', cls: 'blue', title: `${tag}Autorização de uso de imagem`, sub: 'Fotos e vídeos em redes sociais da Apollo', act: 'image', ath: a.id, label: 'Responder' });
    if (!typeOf(a).minor && !a.health.emergency) out.push({ ic: 'heart', cls: 'blue', title: 'Informe um contato de emergência', sub: 'Complete seu cadastro', act: 'health', ath: a.id, label: 'Completar' });
  });
  return out;
}

/* ─── Cabeçalho ─── */
function renderHeader() {
  const unread = newsFor(deps()).filter(n => n.unread).length, pend = pendencias().length;
  $('#topRight').innerHTML = `${ACC.staff ? `<a class="btn sm" style="background:#ffffff12;border-color:#ffffff33;color:#fff" href="index.html?como=${ACC.staff}">${icon('grid')} Painel de Gestão</a>` : ''}
    <button class="icon-btn bell" data-a="news" aria-label="Comunicados${unread ? `, ${unread} não lidos` : ''}">${icon('bell')}${unread ? '<i></i>' : ''}</button>
    <a class="icon-btn" href="login.html" title="Sair" aria-label="Sair">${icon('logout')}</a>`;
  $('#hello').innerHTML = isGuardian
    ? `<div class="eyebrow">Responsável · ${deps().length} atleta${deps().length > 1 ? 's' : ''}</div><h1>Olá, ${esc(first(ACC.name))}</h1><p>Acompanhe ${deps().map(a => esc(first(a.name))).join(' e ')}: treinos, presença, autorizações e mensalidades.</p>`
    : `<div class="eyebrow">${esc(typeOf(cur()).label)} · ${esc(teamOf(cur().teamId).name)}</div><h1>Olá, ${esc(first(ACC.name))}</h1><p>Seus treinos, presença, competições e mensalidades.</p>`;
  $('#deps').innerHTML = isGuardian ? deps().map(a => `<button class="dep ${V.dep === a.id ? 'on' : ''}" data-dep="${a.id}" aria-pressed="${V.dep === a.id}"><span class="avatar">${initials(a.name)}</span><span><strong>${esc(first(a.name))}, ${ageOf(a)} anos</strong><small>${esc(teamOf(a.teamId).name)} · ${esc(typeOf(a).label)}</small></span></button>`).join('') : '';
  $('#deps').classList.toggle('hide', !isGuardian);
  const tabs = [['home', 'Início', 'home', pend], ['agenda', 'Agenda', 'calendar'], ['evo', 'Evolução', 'trend'], ['pay', 'Mensalidades', 'card'], ['cad', 'Cadastro', 'user']];
  $('#tabs').innerHTML = tabs.map(([k, l, i, n]) => `<button class="${V.tab === k ? 'on' : ''}" data-tab="${k}" ${V.tab === k ? 'aria-current="page"' : ''}>${icon(i)}<span>${l}</span>${n ? `<span class="dot">${n}</span>` : ''}</button>`).join('');
}

/* ─── Início ─── */
function pageHome() {
  const a = cur(), t = teamOf(a.teamId), n = nucleusOf(t.n), c = coachOf(t.coach), nx = nextTraining(a), pend = pendencias();
  const last30 = a.att.filter(x => parseYmd(x.date) >= addDays(TODAY, -29)), pres = last30.length ? Math.round(last30.filter(x => x.st === 'p').length / last30.length * 100) : null;
  const nextEv = EVENTS.filter(e => e.ath === a.id && e.date >= ymd(TODAY)).sort((x, y) => x.date.localeCompare(y.date))[0];
  const notified = nx && a.notified.has(nx.date);
  return `<div class="agrid"><div class="stack">
    ${nx ? `<section class="hero"><div class="eyebrow">Próximo treino${isGuardian ? ' de ' + esc(first(a.name)) : ''}</div><h2>${esc(t.name)}</h2><div class="when">${whenTxt(nx.date)} · ${nx.start} às ${nx.end}</div>
      ${notified ? `<span class="flag">${icon('check')} Ausência avisada ao técnico</span>` : ''}
      <div class="meta"><span>${icon('pin')} ${esc(n.venue)} — ${esc(n.address)}</span><span>${icon('user')} ${c ? esc(c.name) : 'Técnico a definir'}</span></div>
      <div class="actions"><a class="btn sm" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(n.address)}" target="_blank" rel="noopener">${icon('map')} Como chegar</a>${notified ? `<button class="btn sm" data-a="unnotify" data-date="${nx.date}">Desfazer aviso</button>` : `<button class="btn sm primary" data-a="absence" data-date="${nx.date}">Avisar ausência</button>`}${c ? `<a class="btn sm" href="https://wa.me/55${c.phone}" target="_blank" rel="noopener">${icon('whatsapp')} Falar com ${esc(first(c.name))}</a>` : ''}</div></section>` : ''}
    <section class="panel"><div class="panel-head"><div><h2>O que precisa da sua atenção</h2><div class="sub">${isGuardian ? 'Pendências de todos os seus filhos' : 'Pendências do seu cadastro'}</div></div>${pend.length ? `<span class="tag st-bad nodot">${pend.length}</span>` : ''}</div>
      ${pend.length ? pend.map(p => `<div class="todo"><span class="ic ${p.cls}">${icon(p.ic)}</span><div style="min-width:0"><strong>${p.title}</strong><small>${esc(p.sub)}</small></div><button class="btn sm ${p.cls === 'red' ? 'primary' : ''}" data-a="${p.act}" data-id="${p.id || ''}" data-ath="${p.ath || ''}">${p.label}</button></div>`).join('') : `<div class="panel-pad muted small">${icon('check')} Tudo em dia. Bom treino!</div>`}</section>
    ${nextEv ? `<section class="panel panel-pad"><div class="eyebrow">${nextEv.kind === 'comp' ? 'Próxima competição' : 'Próximo evento'}</div><h2 style="margin:6px 0 2px">${esc(nextEv.name)}</h2><p class="muted small" style="margin:0 0 10px">${whenTxt(nextEv.date, nextEv.time)} · ${esc(nextEv.place)}</p>${eventStatusTag(nextEv)} <button class="btn sm" data-a="event" data-id="${nextEv.id}" style="margin-left:6px">Ver detalhes</button></section>` : ''}
  </div><div class="stack">
    <section class="panel"><div class="panel-head"><div><h2>Presença${isGuardian ? ' de ' + esc(first(a.name)) : ''}</h2><div class="sub">Últimos 30 dias · registrada pelo técnico no Manager App</div></div></div>
      <div class="mini-stats"><div><b>${pres ?? '—'}%</b><small>presença</small></div><div><b>${last30.filter(x => x.st === 'p').length}</b><small>treinos</small></div><div><b>${last30.filter(x => x.st === 'a').length}</b><small>faltas</small></div></div>
      <div class="panel-foot"><span>${last30.filter(x => x.st === 'e').length} ausência(s) justificada(s)</span><button class="btn sm ghost" data-tab="evo">Ver evolução ${icon('arrow')}</button></div></section>
    <section class="panel"><div class="panel-head"><h2>Comunicados</h2><button class="btn sm ghost" data-a="news">Ver todos</button></div>
      ${newsFor([a]).slice(0, 3).map(newsItem).join('')}</section>
  </div></div>`;
}
const newsItem = nw => `<div class="news ${nw.unread ? 'unread' : ''}"><div class="top"><span>${esc(nw.from)}</span><span>${fmtShort(parseYmd(nw.date))}</span></div><strong>${esc(nw.title)}</strong><p>${esc(nw.text)}</p></div>`;
const eventStatusTag = e => e.status === 'autorizado' ? '<span class="tag st-ok nodot">Autorizado</span>' : e.status === 'confirmado' ? '<span class="tag st-ok nodot">Presença confirmada</span>' : e.status === 'recusado' ? '<span class="tag nodot">Não vai participar</span>' : e.needsAuth ? '<span class="tag st-warn nodot">Aguardando autorização</span>' : '<span class="tag st-warn nodot">Aguardando resposta</span>';

/* ─── Agenda ─── */
function pageAgenda() {
  const list = (isGuardian && V.agScope === 'all') ? deps() : [cur()];
  const items = [...list.flatMap(a => trainings(a, 35)), ...EVENTS.filter(e => list.some(a => a.id === e.ath) && e.date >= ymd(TODAY)).map(e => ({ ...e, kind: e.kind, isEvent: true }))]
    .sort((x, y) => (x.date + (x.start || x.time)).localeCompare(y.date + (y.start || y.time)));
  const weeks = {};
  items.forEach(it => { const w = ymd(startOfWeek(parseYmd(it.date))); (weeks[w] = weeks[w] || []).push(it); });
  const row = it => {
    const d = parseYmd(it.date), a = ATH[it.ath], t = teamOf(a.teamId), who = list.length > 1 ? `<span class="who-tag">${esc(first(a.name))}</span>` : '';
    if (it.isEvent) return `<div class="ag-item"><span class="ag-kind ${it.kind === 'comp' ? 'comp' : 'event'}"></span><div class="ag-date"><small>${DOW[d.getDay()]}</small><b>${d.getDate()}</b></div><div style="min-width:0"><strong>${who}${esc(it.name)}</strong><small>${it.time} · ${esc(it.place)}</small></div><div class="right">${eventStatusTag(it)}<button class="btn sm" data-a="event" data-id="${it.id}">Detalhes</button></div></div>`;
    const notified = a.notified.has(it.date);
    return `<div class="ag-item ${it.off ? 'off' : ''} ${it.date === ymd(TODAY) ? 'today' : ''}"><span class="ag-kind ${it.off ? 'off' : ''}" style="${it.off ? '' : `background:var(--n-${NCLASS(t.n)})`}"></span><div class="ag-date"><small>${DOW[d.getDay()]}</small><b>${d.getDate()}</b></div><div style="min-width:0"><strong>${who}Treino · ${esc(t.name)}</strong><small>${it.off ? 'Sem treino nesta data' : `${it.start}–${it.end} · ${esc(nucleusOf(t.n).venue)}`}</small></div>
      <div class="right">${it.off ? '<span class="tag nodot">Cancelado</span>' : notified ? `<span class="tag st-info nodot">Ausência avisada</span><button class="btn sm ghost" data-a="unnotify" data-date="${it.date}" data-ath="${a.id}">Desfazer</button>` : `<button class="btn sm" data-a="absence" data-date="${it.date}" data-ath="${a.id}">Avisar ausência</button>`}</div></div>`;
  };
  return `<section class="panel"><div class="panel-head"><div><h2>Agenda</h2><div class="sub">Próximas 5 semanas · treinos, competições e eventos</div></div>
    <div class="head-actions">${isGuardian && deps().length > 1 ? `<div class="seg"><button class="${V.agScope === 'one' ? 'on' : ''}" data-scope="one">${esc(first(cur().name))}</button><button class="${V.agScope === 'all' ? 'on' : ''}" data-scope="all">Toda a família</button></div>` : ''}<button class="btn sm" data-a="ics">${icon('download')} Adicionar ao meu calendário</button></div></div>
    ${Object.entries(weeks).map(([w, its]) => { const ws = parseYmd(w), we = addDays(ws, 6); return `<div class="ag-week"><h3>${ws.getDate()} ${MON[ws.getMonth()].toLowerCase()} – ${we.getDate()} ${MON[we.getMonth()].toLowerCase()}</h3>${its.map(row).join('')}</div>`; }).join('')}
    <div class="panel-foot"><span>Avisar ausência com antecedência ajuda o técnico a planejar o treino e conta como falta justificada.</span></div></section>`;
}

/* ─── Evolução ─── */
function pageEvo() {
  const a = cur(), ty = typeOf(a), t = teamOf(a.teamId), c = coachOf(t.coach);
  const ws0 = startOfWeek(addDays(TODAY, -49)), perWeek = Math.max(1, t.schedule.length);
  const cols = [...Array(8)].map((_, w) => { const s = addDays(ws0, w * 7), e = addDays(s, 7); const l = a.att.filter(x => parseYmd(x.date) >= s && parseYmd(x.date) < e); return [...Array(perWeek)].map((_, i) => l[i] ? l[i].st : 'f'); });
  const all = a.att, pres = all.length ? Math.round(all.filter(x => x.st === 'p').length / all.length * 100) : 0;
  let streak = 0; for (let i = all.length - 1; i >= 0 && all[i].st === 'p'; i--) streak++;
  const freq = `<section class="panel"><div class="panel-head"><div><h2>Frequência</h2><div class="sub">Últimas 8 semanas · ${t.schedule.length} treino(s) por semana</div></div><span class="tag nodot ${pres >= 80 ? 'st-ok' : pres >= 65 ? 'st-warn' : 'st-bad'}">${pres}% de presença</span></div>
    <div class="panel-pad"><div class="heat">${cols.map(col => `<div class="heat-col">${col.map(s => `<i class="${s}" title="${{ p: 'Presente', e: 'Ausência justificada', a: 'Falta', f: 'Sem registro' }[s]}"></i>`).join('')}</div>`).join('')}</div>
    <div class="legend mt"><span><i style="background:var(--ok)"></i>Presente</span><span><i style="background:var(--warn)"></i>Justificada</span><span><i style="background:var(--brand)"></i>Falta</span></div>
    <div class="grid g3 mt"><div class="preview"><small>Sequência atual</small><strong style="font-size:18px">${streak} treino${streak === 1 ? '' : 's'}</strong></div><div class="preview"><small>Presenças</small><strong style="font-size:18px">${all.filter(x => x.st === 'p').length}</strong></div><div class="preview"><small>Faltas sem aviso</small><strong style="font-size:18px">${all.filter(x => x.st === 'a').length}</strong></div></div></div></section>`;
  const fb = `<div class="quote">“${esc(a.feedback)}”<b>${c ? esc(c.name) : 'Técnico'} · ${esc(t.name)}</b></div>`;
  let perf;
  if (ty.competitive) {
    const s = a.scout;
    perf = `<section class="panel"><div class="panel-head"><div><h2>Desempenho em jogos</h2><div class="sub">Scout registrado pelo técnico no Manager App · temporada atual${a.position ? ' · ' + esc(a.position) + ' nº ' + a.shirt : ''}</div></div></div>
      <div class="panel-pad"><div class="stat-big">${[['Partidas', s.games], ['Pontos', s.points], ['Aces', s.aces], ['Eficiência de ataque', s.attack + '%'], ['Recepção positiva', s.reception + '%'], ['Bloqueios', s.blocks]].map(([l, v]) => `<div><b>${v}</b><small>${l}</small></div>`).join('')}</div>
      <h3 class="mt2">Últimas partidas</h3><ul class="list" style="margin:6px -20px 0">${a.matches.map(([d, opp, res, pts]) => `<li><span class="time-pill">${fmtShort(addDays(TODAY, d))}</span><div style="flex:1"><strong>vs ${esc(opp)}</strong><div class="hint">${pts} ponto${pts === 1 ? '' : 's'}</div></div><span class="tag nodot ${res.startsWith('Vit') ? 'st-ok' : 'st-bad'}">${res}</span></li>`).join('')}</ul>
      <h3 class="mt">Recado do técnico</h3>${fb}</div></section>`;
  } else {
    perf = `<section class="panel"><div class="panel-head"><div><h2>Fundamentos</h2><div class="sub">Avaliação do técnico · atualizada a cada bimestre</div></div></div><div class="panel-pad">
      ${a.skills.map(([k, v]) => `<div class="skill"><div class="top"><strong>${esc(k)}</strong><span class="tag nodot ${v >= 4 ? 'st-ok' : v >= 3 ? 'st-info' : ''}">${LEVELS[v - 1]}</span></div><div class="lvl">${[1, 2, 3, 4].map(i => `<i class="${i <= v ? 'on' : ''}"></i>`).join('')}</div></div>`).join('')}
      <h3 class="mt">Recado do técnico</h3>${fb}
      ${a.type === 'adulto-iniciante' ? `<div class="banner note mt" style="margin-bottom:0">${icon('trend')}<span class="small">Quando os fundamentos chegarem a “Bom”, o técnico pode indicar a turma competitiva do seu núcleo.</span></div>` : ''}</div></section>`;
  }
  return `<div class="agrid"><div class="stack">${perf}</div><div class="stack">${freq}</div></div>`;
}

/* ─── Mensalidades ─── */
function pagePay() {
  const a = cur(), plan = PLANS.find(p => p.id === a.planId), payer = isGuardian ? ACC.name : a.name;
  const open = a.invoices.filter(i => i.st !== 'pago');
  const famTotal = isGuardian && deps().length > 1 ? deps().reduce((s, d) => s + PLANS.find(p => p.id === d.planId).value, 0) : null;
  return `<div class="agrid"><div class="stack">
    <section class="panel panel-pad"><div class="pay-head"><div><div class="eyebrow">Plano ${isGuardian ? 'de ' + esc(first(a.name)) : 'atual'}</div><h2 style="font-size:20px;margin:6px 0 2px">${plan.days}x por semana · ${esc(teamOf(a.teamId).name)}</h2><p class="muted small" style="margin:0">Núcleo ${esc(nucleusOf(plan.n).name)} · responsável financeiro: ${esc(payer)}</p></div>
      <div style="text-align:right"><div style="font-size:26px;font-weight:700;letter-spacing:-.8px">${money(plan.value)}</div><div class="hint">por mês · vencimento dia 10</div></div></div>
      ${famTotal ? `<div class="banner note mt" style="margin-bottom:0">${icon('users')}<span class="small">Total da família: <b>${money(famTotal)}/mês</b> (${deps().map(d => esc(first(d.name))).join(' + ')})</span></div>` : ''}</section>
    <section class="panel"><div class="panel-head"><div><h2>Mensalidades</h2><div class="sub">Espelho das cobranças do Tecnofit</div></div>${open.length ? `<span class="tag nodot ${open.some(i => i.st === 'vencido') ? 'st-bad' : 'st-warn'}">${open.length} em aberto</span>` : ''}</div>
      <div class="table-wrap"><table><thead><tr><th>Referência</th><th>Vencimento</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead><tbody>${[...a.invoices].reverse().map(i => `<tr><td><strong>${i.ref}</strong></td><td>${fmtDate(parseYmd(i.due))}</td><td class="num">${money(i.value)}</td>
        <td>${i.st === 'pago' ? `<span class="tag st-ok">Pago</span><div class="hint">${i.method} · ${fmtShort(parseYmd(i.paidAt))}</div>` : i.st === 'vencido' ? '<span class="tag st-bad">Vencido</span>' : '<span class="tag st-warn">Em aberto</span>'}</td>
        <td style="text-align:right">${i.st === 'pago' ? `<button class="btn sm ghost" data-a="receipt" data-id="${i.id}">${icon('download')} Recibo</button>` : `<button class="btn sm ${i.st === 'vencido' ? 'primary' : ''}" data-a="pay" data-id="${i.id}" data-ath="${a.id}">Pagar</button>`}</td></tr>`).join('')}</tbody></table></div>
      <div class="panel-foot"><span>Pagamentos feitos fora do app aparecem aqui após a baixa no Tecnofit.</span></div></section>
  </div><div class="stack">
    <section class="panel panel-pad"><h3>${icon('info')} Como funciona</h3><ul class="small muted" style="padding-left:18px;margin:8px 0 0;line-height:1.7"><li>A cobrança é gerada pelo Tecnofit todo mês.</li><li>Pague por Pix ou cartão pelo link seguro do Tecnofit.</li><li>Mudança de plano ou turma: fale com a secretaria.</li><li>Reajustes são avisados com antecedência.</li></ul></section>
    <section class="panel panel-pad"><h3>Precisa de ajuda?</h3><p class="small muted">Dúvidas sobre cobrança, desconto para irmãos ou segunda via.</p><a class="btn wa" href="https://wa.me/551130001000" target="_blank" rel="noopener">${icon('whatsapp')} Falar com a secretaria</a></section>
  </div></div>`;
}

/* ─── Cadastro ─── */
function pageCad() {
  const a = cur(), ty = typeOf(a), t = teamOf(a.teamId), dd = a.atestado ? Math.round((parseYmd(a.atestado) - TODAY) / 864e5) : null;
  const guardians = isGuardian ? [[ACC.name, ACC.relation, ACC.email, true, true], [ACC.coGuardian[0], ACC.coGuardian[1], ACC.coGuardian[2], ACC.coGuardian[3], false]] : [];
  return `<div class="agrid"><div class="stack">
    <section class="panel"><div class="panel-head"><div><h2>Dados ${isGuardian ? 'de ' + esc(first(a.name)) : 'do atleta'}</h2><div class="sub">Alterações em nome, CPF ou data de nascimento são feitas pela secretaria</div></div><button class="btn sm" data-a="request">Solicitar alteração</button></div>
      <div class="panel-pad"><div class="kv2">${[['Nome', a.name], ['Nascimento', `${fmtDate(parseYmd(a.birth))} · ${ageOf(a)} anos`], ['Equipe', t.name], ['Categoria', ty.label], ['Núcleo', `${nucleusOf(t.n).name} · ${nucleusOf(t.n).venue}`], ['Técnico', coachOf(t.coach)?.name || '—'], ['Horários', t.schedule.map(schedText).join(' · ')], ['Atleta desde', fmtDate(parseYmd(a.since))]].map(([k, v]) => `<div><small>${k}</small><strong>${esc(v)}</strong></div>`).join('')}</div></div></section>
    ${ty.minor ? `<section class="panel"><div class="panel-head"><div><h2>Responsáveis</h2><div class="sub">Cada responsável pode ter o próprio acesso</div></div></div><div class="panel-pad" style="padding-top:4px;padding-bottom:4px">
      ${guardians.map(([n, rel, em, hasAcc, fin]) => `<div class="person-row"><span class="avatar">${initials(n)}</span><div><strong>${esc(n)} <span class="muted small">(${esc(rel)})</span></strong><small>${esc(em)}${fin ? ' · responsável financeiro' : ''}</small></div><div class="right">${hasAcc ? '<span class="tag st-ok nodot">Tem acesso</span>' : `<button class="btn sm" data-a="invite">Convidar</button>`}</div></div>`).join('')}</div></section>
    <section class="panel"><div class="panel-head"><div><h2>Retirada após o treino</h2><div class="sub">O técnico confere esta lista na saída</div></div><button class="btn sm" data-a="pickup-add">${icon('plus')} Adicionar</button></div><div class="panel-pad" style="padding-top:4px;padding-bottom:4px">
      ${ageOf(a) >= 12 ? `<div class="consent"><div><strong>Pode sair sozinho(a) após o treino</strong><small>Autorização do responsável para atletas a partir de 12 anos</small></div><label class="toggle"><input type="checkbox" data-a="alone" ${a.canLeaveAlone ? 'checked' : ''}><span></span></label></div>` : ''}
      ${a.pickup.map(([n, rel], i) => `<div class="person-row"><span class="avatar">${initials(n)}</span><div><strong>${esc(n)}</strong><small>${esc(rel)}</small></div><div class="right"><button class="btn sm ghost sq" data-a="pickup-del" data-i="${i}" aria-label="Remover ${esc(n)}">${icon('trash')}</button></div></div>`).join('')}</div></section>` : `
    <section class="panel"><div class="panel-head"><h2>Contato</h2><button class="btn sm" data-a="contact">${icon('edit')} Editar</button></div><div class="panel-pad"><div class="kv2"><div><small>E-mail</small><strong>${esc(ACC.email)}</strong></div><div><small>WhatsApp</small><strong>${fmtPhone(ACC.phone)}</strong></div><div><small>Endereço</small><strong>${esc(ACC.address || 'Não informado')}</strong></div></div></div></section>`}
  </div><div class="stack">
    <section class="panel"><div class="panel-head"><div><h2>Saúde e emergência</h2><div class="sub">Visível apenas para técnicos e coordenação</div></div><button class="btn sm" data-a="health" data-ath="${a.id}">${icon('edit')} Editar</button></div><div class="panel-pad">
      <div class="kv2"><div><small>Contato de emergência</small><strong>${esc(a.health.emergency || 'Não informado')}</strong></div><div><small>Alergias / observações</small><strong>${esc(a.health.allergies || 'Não informado')}</strong></div><div><small>Plano de saúde</small><strong>${esc(a.health.insurance || 'Não informado')}</strong></div>
      <div><small>Atestado médico</small><strong>${a.atestado ? `Válido até ${fmtDate(parseYmd(a.atestado))}` : 'Não enviado'}</strong> ${!a.atestado || dd < 30 ? `<span class="tag nodot ${!a.atestado || dd < 0 ? 'st-bad' : 'st-warn'}">${!a.atestado ? 'pendente' : dd < 0 ? 'vencido' : 'vence em ' + dd + ' dias'}</span>` : ''}</div></div>
      <button class="btn sm mt" data-a="atestado" data-ath="${a.id}">${icon('upload')} Enviar atestado</button></div></section>
    <section class="panel"><div class="panel-head"><div><h2>Autorizações</h2><div class="sub">${ty.minor ? 'Dadas pelo responsável legal' : 'Suas preferências'} · podem ser alteradas a qualquer momento</div></div></div><div class="panel-pad" style="padding-top:4px;padding-bottom:4px">
      <div class="consent"><div><strong>Uso de imagem</strong><small>Fotos e vídeos em redes e materiais da Apollo${a.image === null ? ' · <b style="color:var(--warn)">ainda sem resposta</b>' : ''}</small></div><label class="toggle"><input type="checkbox" data-a="img-toggle" ${a.image ? 'checked' : ''}><span></span></label></div>
      <div class="consent"><div><strong>Avisos por WhatsApp</strong><small>Lembretes de treino, convocações e cobranças</small></div><label class="toggle"><input type="checkbox" data-a="wa-toggle" ${a.whatsapp ? 'checked' : ''}><span></span></label></div>
      ${ty.minor ? '<div class="consent"><div><strong>Competições e viagens</strong><small>Autorizadas uma a uma, a cada convocação, com local, horário e transporte</small></div><span class="tag nodot st-info" style="margin-left:auto">por evento</span></div>' : ''}
      <div class="consent"><div><strong>Termo de uso e privacidade (LGPD)</strong><small>Aceito em ${fmtDate(parseYmd(a.since))}</small></div><button class="btn sm ghost" style="margin-left:auto" data-a="terms">Ler</button></div></div></section>
  </div></div>`;
}

/* ─── Render ─── */
const PAGES_A = { home: pageHome, agenda: pageAgenda, evo: pageEvo, pay: pagePay, cad: pageCad };
function renderA() { renderHeader(); $('#main').innerHTML = PAGES_A[V.tab](); }

/* ─── Ações ─── */
function absenceDialog(athId, date) {
  const a = ATH[athId], d = parseYmd(date);
  openDialog(dHead('Avisar ausência', `${esc(first(a.name))} não vai ao treino`, `${DOW_FULL[d.getDay()]}, ${fmtDate(d)} · ${esc(teamOf(a.teamId).name)}`) + `<div class="d-body">
    <div class="field"><label>Motivo</label><div class="chips" id="absWhy">${['Doença', 'Compromisso escolar', 'Viagem', 'Lesão', 'Outro'].map((m, i) => `<button type="button" class="chip ${i ? '' : 'on'}" data-why="${m}" style="${i ? '' : 'border-color:var(--brand);color:var(--brand-ink)'}">${m}</button>`).join('')}</div></div>
    <div class="field"><label for="absNote">Observação para o técnico (opcional)</label><textarea class="input" id="absNote" rows="3" placeholder="Ex.: volta na próxima semana"></textarea></div>
    <p class="hint">O técnico vê o aviso na chamada do Manager App e a ausência conta como justificada.</p></div>
    <div class="d-foot"><button class="btn" data-a="close">Cancelar</button><button class="btn primary" data-a="absence-save" data-ath="${athId}" data-date="${date}">Enviar aviso</button></div>`);
  $('#absWhy').addEventListener('click', e => { const b = e.target.closest('[data-why]'); if (!b) return; $$('#absWhy .chip').forEach(x => { x.classList.remove('on'); x.style.cssText = ''; }); b.classList.add('on'); b.style.cssText = 'border-color:var(--brand);color:var(--brand-ink)'; });
}
function eventDialog(id) {
  const e = EVENTS.find(x => x.id === id), a = ATH[e.ath], minor = typeOf(a).minor;
  const done = e.status !== 'pendente';
  openDialog(dHead(e.kind === 'comp' ? (minor ? 'Convocação' : 'Competição') : 'Evento', esc(e.name), `${whenTxt(e.date, e.time)}`) + `<div class="d-body">
    ${isGuardian ? `<p style="margin-top:0"><span class="who-tag">${esc(first(a.name))}</span> ${esc(teamOf(a.teamId).name)}</p>` : ''}
    <div class="kv2 mb">${[['Local', e.place], ['Apresentação', e.meet], ['Transporte', e.transport], ['Levar', e.items]].map(([k, v]) => `<div><small>${k}</small><strong>${esc(v)}</strong></div>`).join('')}</div>
    <div style="margin-bottom:14px">${eventStatusTag(e)}</div>
    ${!done && e.needsAuth ? `<div class="banner warn">${icon('shield')}<span class="small">Como ${esc(first(a.name))} é menor de idade, a participação depende da autorização de um responsável legal.</span></div>
      <label class="check"><input type="checkbox" id="evAck"> Autorizo ${esc(a.name)} a participar deste evento, incluindo o deslocamento indicado, e declaro que os dados de saúde estão atualizados.</label>` : ''}
    ${!done && !e.needsAuth ? `<p class="small muted">Sua resposta ajuda o técnico a fechar a equipe e a logística.</p>` : ''}
  </div><div class="d-foot">${done ? `<button class="btn left" data-a="event-reset" data-id="${id}">Mudar resposta</button><button class="btn primary" data-a="close">Fechar</button>` :
      `<button class="btn" data-a="event-no" data-id="${id}">${e.needsAuth ? 'Não autorizo' : 'Não vou'}</button><button class="btn primary" data-a="event-yes" data-id="${id}" ${e.needsAuth ? 'id="evGo" disabled' : ''}>${e.needsAuth ? 'Autorizar participação' : 'Confirmar presença'}</button>`}</div>`);
  const ack = $('#evAck'); if (ack) ack.addEventListener('change', () => { $('#evGo').disabled = !ack.checked; });
}
function payDialog(athId, invId) {
  const a = ATH[athId], inv = a.invoices.find(i => i.id === invId);
  const code = `00020126580014BR.GOV.BCB.PIX0136apollo-voleibol-${inv.id}520400005303986540${(inv.value / 100).toFixed(2)}5802BR5913APOLLO VOLEI6009SAO PAULO`;
  openDialog(dHead('Pagamento', `Mensalidade ${inv.ref}`, `${esc(a.name)} · ${money(inv.value)} · vencimento ${fmtDate(parseYmd(inv.due))}`) + `<div class="d-body" style="text-align:center">
    <div class="qr" aria-label="QR Code Pix ilustrativo"></div><p class="small muted" style="margin:0 0 10px">Escaneie o QR Code no app do seu banco ou copie o código Pix</p>
    <div class="pix" id="pixCode">${code}</div>
    <div class="banner note mt" style="text-align:left;margin-bottom:0">${icon('info')}<span class="small">Protótipo: o código e o link seriam gerados pelo Tecnofit para esta cobrança. A baixa aparece aqui automaticamente depois de confirmada.</span></div></div>
    <div class="d-foot"><a class="btn left" href="#" data-a="tecnofit">${icon('card')} Pagar com cartão (Tecnofit)</a><button class="btn primary" data-a="pix-copy">${icon('copy')} Copiar código Pix</button></div>`);
}
function formDialog(title, sub, fields, act, extra = '') {
  openDialog(dHead(title, sub) + `<div class="d-body">${fields.map(([id, l, v = '', ph = '', type = 'text']) => `<div class="field"><label for="${id}">${l}</label>${type === 'area' ? `<textarea class="input" id="${id}" rows="3" placeholder="${ph}">${esc(v)}</textarea>` : `<input class="input" id="${id}" type="${type}" value="${esc(v)}" placeholder="${ph}">`}</div>`).join('')}${extra}<div class="err" id="fErr" role="alert"></div></div>
    <div class="d-foot"><button class="btn" data-a="close">Cancelar</button><button class="btn primary" data-a="${act}">Salvar</button></div>`);
}
function ics() {
  const list = (isGuardian && V.agScope === 'all') ? deps() : [cur()];
  const stamp = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ev = [];
  list.forEach(a => {
    const t = teamOf(a.teamId), n = nucleusOf(t.n);
    trainings(a, 30).filter(x => !x.off).forEach(x => { const s = new Date(x.at), e = new Date(x.at); const [h, m] = x.end.split(':').map(Number); e.setHours(h, m); ev.push([`Treino ${t.name}${isGuardian ? ' (' + first(a.name) + ')' : ''}`, s, e, n.address]); });
    EVENTS.filter(e => e.ath === a.id && e.date >= ymd(TODAY)).forEach(e => { const s = parseLocal(`${e.date}T${e.time}`); ev.push([e.name, s, new Date(s.getTime() + 3 * 36e5), e.place]); });
  });
  const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Apollo Voleibol//Area do Atleta//PT', ...ev.flatMap(([sum, s, e, loc], i) => ['BEGIN:VEVENT', `UID:apollo-${i}-${stamp(s)}@apollo`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(s)}`, `DTEND:${stamp(e)}`, `SUMMARY:${sum}`, `LOCATION:${loc}`, 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');
  download('apollo-agenda.ics', body, 'text/calendar;charset=utf-8');
  toast(`${ev.length} compromissos exportados. Abra o arquivo para adicionar ao Google Agenda ou ao calendário do celular.`);
}

document.addEventListener('click', async e => {
  const tab = e.target.closest('[data-tab]'); if (tab) { V.tab = tab.dataset.tab; renderA(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  const dep = e.target.closest('[data-dep]'); if (dep) { V.dep = dep.dataset.dep; renderA(); return; }
  const sc = e.target.closest('[data-scope]'); if (sc) { V.agScope = sc.dataset.scope; renderA(); return; }
  const b = e.target.closest('[data-a]'); if (!b) return;
  const a = ATH[b.dataset.ath] || cur(), id = b.dataset.id;
  switch (b.dataset.a) {
    case 'close': return closeDialog();
    case 'news': openDialog(dHead('Comunicados', 'Recados da Apollo') + `<div class="d-body" style="padding:0">${newsFor(deps()).map(newsItem).join('')}</div>`, 'drawer'); NEWS.forEach(n => { n.unread = false; }); renderHeader(); return;
    case 'absence': return absenceDialog(a.id, b.dataset.date);
    case 'absence-save': { const why = $('#absWhy .on')?.dataset.why || 'Outro'; a.notified.set(b.dataset.date, why); closeDialog(); renderA(); return toast(`Aviso enviado ao técnico: ${why.toLowerCase()}.`); }
    case 'unnotify': a.notified.delete(b.dataset.date); renderA(); return toast('Aviso de ausência desfeito.');
    case 'event': return eventDialog(id);
    case 'event-yes': { const ev = EVENTS.find(x => x.id === id); ev.status = ev.needsAuth ? 'autorizado' : 'confirmado'; closeDialog(); renderA(); return toast(ev.needsAuth ? 'Participação autorizada. O técnico foi avisado.' : 'Presença confirmada!'); }
    case 'event-no': { const ev = EVENTS.find(x => x.id === id); ev.status = 'recusado'; closeDialog(); renderA(); return toast('Resposta registrada. O técnico foi avisado.'); }
    case 'event-reset': EVENTS.find(x => x.id === id).status = 'pendente'; return eventDialog(id);
    case 'pay': return payDialog(a.id, id);
    case 'pix-copy': navigator.clipboard?.writeText($('#pixCode').textContent).catch(() => { }); return toast('Código Pix copiado. Cole no app do seu banco.');
    case 'tecnofit': e.preventDefault(); return toast('Abriria o checkout seguro do Tecnofit para esta cobrança.');
    case 'receipt': { const inv = a.invoices.find(i => i.id === id); return download(`recibo-${inv.ref.replace('/', '-')}.txt`, `APOLLO VOLEIBOL — RECIBO\n\nAtleta: ${a.name}\nReferência: ${inv.ref}\nValor: ${money(inv.value)}\nPago em: ${fmtDate(parseYmd(inv.paidAt))} (${inv.method})\n\nDocumento ilustrativo do protótipo.`, 'text/plain;charset=utf-8'); }
    case 'atestado': openDialog(dHead('Atestado médico', `Enviar atestado de ${esc(first(a.name))}`) + `<div class="d-body"><label class="dropzone" style="display:block;cursor:pointer">${icon('upload')}<h3 style="margin:8px 0 4px">Foto ou PDF do atestado</h3><p class="muted small" style="margin:0">Tire uma foto pelo celular ou escolha o arquivo</p><input type="file" id="atFile" accept="image/*,.pdf" class="sr"></label><div class="field mt"><label for="atDate">Válido até</label><input class="input" type="date" id="atDate" value="${ymd(addDays(TODAY, 365))}"></div><p class="hint">A coordenação confere o documento. Até lá, ele aparece como “em análise”.</p></div><div class="d-foot"><button class="btn" data-a="close">Cancelar</button><button class="btn primary" data-a="atestado-save" data-ath="${a.id}">Enviar</button></div>`); return;
    case 'atestado-save': a.atestado = $('#atDate').value || ymd(addDays(TODAY, 365)); closeDialog(); renderA(); return toast('Atestado enviado para análise da coordenação.');
    case 'image': V.tab = 'cad'; V.dep = a.id; renderA(); return toast('Responda a autorização de uso de imagem em Autorizações.');
    case 'img-toggle': a.image = b.checked; renderA(); return toast(a.image ? 'Uso de imagem autorizado.' : 'Uso de imagem não autorizado. A Apollo não publicará fotos.');
    case 'wa-toggle': a.whatsapp = b.checked; return toast(b.checked ? 'Avisos por WhatsApp ativados.' : 'Avisos por WhatsApp desativados.');
    case 'alone': a.canLeaveAlone = b.checked; return toast(b.checked ? 'Autorizado a sair sozinho(a).' : 'Saída somente com as pessoas da lista.');
    case 'pickup-add': return formDialog('Retirada após o treino', 'Adicionar pessoa autorizada', [['pkName', 'Nome completo *'], ['pkRel', 'Parentesco / relação *', '', 'Ex.: tia, vizinha, motorista'], ['pkDoc', 'Documento (RG) *', '', 'Conferido pelo técnico na saída']], 'pickup-save');
    case 'pickup-save': { const n = $('#pkName').value.trim(), r = $('#pkRel').value.trim(); if (!n || !r || !$('#pkDoc').value.trim()) { $('#fErr').textContent = 'Preencha nome, relação e documento.'; return; } a.pickup.push([n, r]); closeDialog(); renderA(); return toast(`${n} pode retirar ${first(a.name)} após o treino.`); }
    case 'pickup-del': { const i = Number(b.dataset.i), [n] = a.pickup[i]; if (!(await confirmBox({ title: 'Remover autorização?', text: `${esc(n)} não poderá mais retirar ${esc(first(a.name))} após o treino.`, ok: 'Remover', danger: true }))) return; a.pickup.splice(i, 1); renderA(); return; }
    case 'health': return formDialog('Saúde e emergência', esc(a.name), [['hEm', 'Contato de emergência *', a.health.emergency, 'Nome · telefone'], ['hAl', 'Alergias, medicamentos ou observações', a.health.allergies, '', 'area'], ['hIn', 'Plano de saúde', a.health.insurance]], 'health-save', `<input type="hidden" id="hAth" value="${a.id}">`);
    case 'health-save': { const t = ATH[$('#hAth').value]; if (!$('#hEm').value.trim()) { $('#fErr').textContent = 'Informe um contato de emergência.'; return; } Object.assign(t.health, { emergency: $('#hEm').value.trim(), allergies: $('#hAl').value.trim(), insurance: $('#hIn').value.trim() }); closeDialog(); renderA(); return toast('Informações de saúde atualizadas.'); }
    case 'contact': formDialog('Contato', 'Seus dados de contato', [['cEm', 'E-mail', ACC.email, '', 'email'], ['cPh', 'WhatsApp', fmtPhone(ACC.phone)], ['cAd', 'Endereço', ACC.address, 'Rua, número, bairro']], 'contact-save'); $('#cPh').addEventListener('input', x => { x.target.value = maskPhone(x.target.value); }); return;
    case 'contact-save': Object.assign(ACC, { email: $('#cEm').value.trim(), phone: digits($('#cPh').value), address: $('#cAd').value.trim() }); closeDialog(); renderA(); return toast('Contato atualizado.');
    case 'request': return formDialog('Solicitar alteração', `Dados de ${esc(first(a.name))}`, [['rqTxt', 'O que precisa ser alterado?', '', 'Ex.: corrigir a data de nascimento', 'area']], 'request-save');
    case 'request-save': closeDialog(); return toast('Solicitação enviada à secretaria. Retornaremos pelo WhatsApp.');
    case 'invite': return toast(`Convite enviado para ${ACC.coGuardian[0]} criar o próprio acesso.`);
    case 'terms': return openDialog(dHead('Privacidade', 'Termo de uso e privacidade') + `<div class="d-body small"><p style="margin-top:0">Resumo do termo (texto final a definir com o jurídico):</p><ul style="padding-left:18px;line-height:1.7"><li>Os dados são usados para matrícula, treinos, competições e cobrança.</li><li>Dados de saúde são vistos apenas por técnicos e coordenação.</li><li>Dados de menores são geridos pelos responsáveis legais.</li><li>Você pode pedir cópia ou exclusão dos dados pela secretaria.</li></ul></div><div class="d-foot"><button class="btn primary" data-a="close">Fechar</button></div>`);
    case 'ics': return ics();
  }
});

renderA();
