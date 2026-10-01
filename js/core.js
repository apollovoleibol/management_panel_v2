/* Apollo · Painel de Gestão v2 — núcleo do protótipo (dados fictícios em memória) */
'use strict';

/* ─── Utilidades ─── */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const moneyK = c => { const v = c / 100; return v >= 1000 ? 'R$ ' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil' : money(c); };
const cents = v => { const n = Number(String(v).trim().replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) : NaN; };
const centsInput = v => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) : NaN; };
const pct = (a, b, d = 0) => b ? (a / b * 100).toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: d }) + '%' : '—';
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const parseLocal = s => { const [a, b = '00:00'] = s.split('T'); const d = parseYmd(a); const [h, mi] = b.split(':').map(Number); d.setHours(h, mi, 0, 0); return d; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
// Semana de domingo a sábado.
const startOfWeek = d => { const x = startOfDay(d); return addDays(x, -x.getDay()); };
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const hoursBetween = (a, b) => (toMin(b) - toMin(a)) / 60;
const fmtDate = d => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const fmtShort = d => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
const fmtDT = s => { const d = parseLocal(s); return `${fmtDate(d)} às ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const digits = s => String(s || '').replace(/\D/g, '');
const fmtPhone = s => { const v = digits(s); if (v.length === 11) return v.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3'); if (v.length === 10) return v.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3'); return s || ''; };
const maskPhone = s => { const v = digits(s).slice(0, 11); if (v.length <= 2) return v; if (v.length <= 6) return `(${v.slice(0, 2)}) ${v.slice(2)}`; if (v.length <= 10) return `(${v.slice(0, 2)}) ${v.slice(2, 6)}-${v.slice(6)}`; return `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`; };
const maskCpf = s => { const v = digits(s).slice(0, 11); return v.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2'); };
const initials = n => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
const uid = p => p + Math.random().toString(36).slice(2, 8);
const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DOW_FULL = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MON = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const NOW = new Date();
const TODAY = startOfDay(NOW);

const ICONS = {
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  calendar: 'M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  layers: 'M12 3 2 8l10 5 10-5z M2 13l10 5 10-5 M2 17.5l10 5 10-5',
  bot: 'M12 4V2 M5 8h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z M9 13h.01 M15 13h.01 M9.5 17h5',
  wallet: 'M3 7a2 2 0 0 1 2-2h13v4 M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z M16 14.5h.01',
  chart: 'M3 3v18h18 M7 15l4-5 3 3 6-7',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  search: 'M21 21l-4.3-4.3 M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z',
  plus: 'M12 5v14 M5 12h14',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  left: 'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
  check: 'M5 12l4 4L19 6',
  x: 'M18 6 6 18 M6 6l12 12',
  info: 'M12 16v-4 M12 8h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z',
  alert: 'M12 9v4 M12 17h.01 M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  edit: 'M12 20h9 M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z',
  lock: 'M5 11h14v10H5z M8 11V7a4 4 0 1 1 8 0v4',
  archive: 'M3 4h18v4H3z M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8 M10 12h4',
  unarchive: 'M3 4h18v4H3z M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8 M12 17v-6 M9.5 13.5 12 11l2.5 2.5',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z',
  whatsapp: 'M3 21l1.7-5A8.5 8.5 0 1 1 8 19.4z M9 8.5c0 3.5 3 6.5 6.5 6.5l1.2-1.6-2-1-1 .8c-1-.4-2.5-1.9-2.9-2.9l.8-1-1-2z',
  trash: 'M3 6h18 M8 6V4h8v2 M6 6l1 14h10l1-14',
  sort: 'M7 4v16 M3 16l4 4 4-4 M17 20V4 M13 8l4-4 4 4',
  upload: 'M12 16V4 M7 9l5-5 5 5 M4 16v4h16v-4',
  download: 'M12 4v12 M7 11l5 5 5-5 M4 20h16',
  refresh: 'M21 12a9 9 0 1 1-2.6-6.4L21 8 M21 3v5h-5',
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
  clock: 'M12 7v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z',
  trend: 'M3 17l6-6 4 4 8-8 M15 7h6v6',
  shield: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z M9 12l2 2 4-4',
  child: 'M12 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M8 22v-6l-3-3 3-4h8l3 4-3 3v6',
  trophy: 'M8 21h8 M12 17v4 M7 4h10v5a5 5 0 0 1-10 0z M17 5h3v2a3 3 0 0 1-3 3 M7 5H4v2a3 3 0 0 0 3 3',
  money: 'M2 6h20v12H2z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 9v.01 M18 15v.01',
  sparkle: 'M12 3v4 M12 17v4 M3 12h4 M17 12h4 M6 6l2 2 M16 16l2 2 M6 18l2-2 M16 8l2-2',
  file: 'M14 3H6v18h12V7z M14 3v4h4 M9 13h6 M9 17h6',
  logout: 'M9 21H5V3h4 M16 17l5-5-5-5 M21 12H9',
  target: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z M18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0z M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0z',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z',
};
const icon = (n, cls = 'i') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[n] || ICONS.info}"/></svg>`;
const kpiIcon = name => {
  const tones = { users: 'blue', child: 'violet', check: 'green', x: 'slate', calendar: 'blue',
    clock: 'amber', trophy: 'violet', alert: 'red', wallet: 'blue', money: 'green',
    trend: 'green', target: 'red', refresh: 'violet', layers: 'blue', pin: 'amber',
    bot: 'violet', chart: 'blue', whatsapp: 'green', star: 'amber' };
  return `<span class="kpi-icon tone-${tones[name] || 'blue'}">${icon(name)}</span>`;
};

/* ─── Dados de demonstração ─── */
const NUCLEI = [
  { id: 'centro', name: 'Centro', venue: 'Ginásio Apollo Centro', address: 'Rua das Palmeiras, 120 — Centro', phone: '1130001000', notes: 'Sede administrativa e quadra principal.' },
  { id: 'sul', name: 'Sul', venue: 'Arena Sul', address: 'Av. das Nações, 845 — Jardim Sul', phone: '1130002000', notes: 'Duas quadras; estacionamento no local.' },
  { id: 'norte', name: 'Norte', venue: 'Centro Esportivo Norte', address: 'Rua Ipê Amarelo, 58 — Vila Norte', phone: '', notes: 'Parceria com escola municipal.' },
];
// Cada núcleo cadastrado recebe uma das 6 cores da paleta, pela ordem de cadastro.
const NCLASS = id => { const i = NUCLEI.findIndex(n => n.id === id); return i < 0 ? 'novo' : 'nc' + (i % 6); };

const COACHES = [
  { id: 'c1', name: 'Rafael Moura', phone: '11990000001', rate: 7000, daily: 30000, pix: 'rafael.moura@exemplo.com' },
  { id: 'c2', name: 'Juliana Prado', phone: '11990000002', rate: 6500, daily: 28000, pix: '(11) 99000-0002' },
  { id: 'c3', name: 'Diego Santana', phone: '11990000003', rate: 6000, daily: 25000, pix: 'CPF 000.000.000-03' },
  { id: 'c4', name: 'Camila Rocha', phone: '11990000004', rate: 5500, daily: 25000, pix: 'camila.rocha@exemplo.com' },
];

let TEAMS = [
  { id: 't1', name: 'Sub-13 Misto', category: 'escolinha', desc: 'Iniciação ao voleibol para crianças de 10 a 13 anos, com foco em fundamentos, coordenação e diversão.', ageMin: 10, ageMax: 13, gender: 'Misto', n: 'centro', coach: 'c2', available: true, active: true, schedule: [{ day: 2, start: '17:00', end: '18:30' }, { day: 4, start: '17:00', end: '18:30' }], blocked: [] },
  { id: 't2', name: 'Sub-15 Feminino', category: 'base', desc: 'Formação competitiva para meninas de 13 a 15 anos. Participa da liga regional.', ageMin: 13, ageMax: 15, gender: 'F', n: 'centro', coach: 'c2', available: true, active: true, schedule: [{ day: 1, start: '18:00', end: '19:30' }, { day: 3, start: '18:00', end: '19:30' }, { day: 5, start: '18:00', end: '19:30' }], blocked: [] },
  { id: 't3', name: 'Sub-17 Feminino', category: 'competitivo', desc: 'Equipe competitiva sub-17, com treinos técnicos e táticos. Seleção por avaliação.', ageMin: 15, ageMax: 17, gender: 'F', n: 'centro', coach: 'c1', available: true, active: true, schedule: [{ day: 1, start: '19:30', end: '21:30' }, { day: 3, start: '19:30', end: '21:30' }, { day: 6, start: '09:00', end: '11:00' }], blocked: [] },
  { id: 't4', name: 'Adulto Misto', category: 'adulto', desc: 'Turma recreativa e de condicionamento para adultos de todos os níveis.', ageMin: 18, ageMax: null, gender: 'Misto', n: 'centro', coach: 'c1', available: true, active: true, schedule: [{ day: 2, start: '20:00', end: '22:00' }, { day: 4, start: '20:00', end: '22:00' }], blocked: [] },
  { id: 't5', name: 'Sub-17 Masculino', category: 'competitivo', desc: 'Equipe competitiva masculina, foco em campeonatos estaduais.', ageMin: 15, ageMax: 17, gender: 'M', n: 'sul', coach: 'c3', available: true, active: true, schedule: [{ day: 1, start: '18:30', end: '20:30' }, { day: 3, start: '18:30', end: '20:30' }, { day: 5, start: '18:30', end: '20:30' }], blocked: [] },
  { id: 't6', name: 'Adulto Feminino', category: 'adulto', desc: 'Voleibol feminino adulto, com opção de participação em torneios amadores.', ageMin: 18, ageMax: null, gender: 'F', n: 'sul', coach: 'c4', available: true, active: true, schedule: [{ day: 2, start: '19:00', end: '21:00' }, { day: 4, start: '19:00', end: '21:00' }, { day: 6, start: '10:00', end: '12:00' }], blocked: [] },
  { id: 't7', name: 'Iniciação Misto', category: 'escolinha', desc: 'Primeiro contato com o voleibol para crianças de 8 a 12 anos.', ageMin: 8, ageMax: 12, gender: 'Misto', n: 'norte', coach: 'c3', available: true, active: true, schedule: [{ day: 2, start: '16:00', end: '17:30' }, { day: 5, start: '16:00', end: '17:30' }], blocked: [] },
  { id: 't8', name: 'Master Misto', category: 'adulto', desc: '', ageMin: 35, ageMax: null, gender: 'Misto', n: 'norte', coach: null, available: false, active: true, schedule: [{ day: 0, start: '09:00', end: '11:00' }], blocked: [] },
];
TEAMS.forEach(team => { team.cancelled = []; });
/* datas indisponíveis de exemplo (relativas à semana atual) */
(() => {
  const ws = startOfWeek(TODAY);
  TEAMS.find(t => t.id === 't6').blocked.push(ymd(addDays(ws, 3)));      // quinta desta semana
  TEAMS.find(t => t.id === 't3').blocked.push(ymd(addDays(ws, 12)));     // sábado da próxima semana
  TEAMS.find(t => t.id === 't7').blocked.push(ymd(addDays(ws, 11)));     // sexta da próxima semana
})();

let PLANS = [
  { id: 1, days: 2, value: 15990, fee: 0, n: 'centro', teams: ['t1', 't2'] },
  { id: 2, days: 3, value: 18990, fee: 7000, n: 'centro', teams: ['t2', 't3'] },
  { id: 3, days: 1, value: 10990, fee: 0, n: 'centro', teams: ['t1', 't4'] },
  { id: 8, days: 2, value: 16990, fee: 0, n: 'centro', teams: ['t4'] },
  { id: 4, days: 2, value: 17690, fee: 7000, n: 'sul', teams: ['t5', 't6'] },
  { id: 5, days: 3, value: 20990, fee: 0, n: 'sul', teams: ['t5', 't6'] },
  { id: 6, days: 1, value: 9890, fee: 0, n: 'norte', teams: ['t7', 't8'] },
  { id: 7, days: 2, value: 13990, fee: 0, n: 'norte', teams: ['t7'] },
];
const planLabel = p => `${p.days}x por semana - ${money(p.value)} - ${p.fee ? 'com taxa de matrícula de ' + money(p.fee) : 'sem taxa de matrícula'}`;
const plansOfTeam = tid => PLANS.filter(p => p.teams.includes(tid));

/* Atletas */
const FIRST = ['Ana', 'Beatriz', 'Carolina', 'Daniela', 'Eduarda', 'Fernanda', 'Gabriela', 'Helena', 'Isabela', 'Júlia', 'Larissa', 'Manuela', 'Natália', 'Olívia', 'Pedro', 'Lucas', 'Gabriel', 'Mateus', 'Rafael', 'Thiago', 'Vinícius', 'Arthur', 'Bruno', 'Caio', 'Diego', 'Enzo', 'Felipe', 'Gustavo', 'Heitor', 'Igor', 'Laura', 'Marina', 'Sofia', 'Valentina', 'Alice', 'Lívia', 'Clara', 'Yasmin', 'Rodrigo', 'Samuel', 'Leonardo', 'Otávio'];
const LAST = ['Almeida', 'Barbosa', 'Cardoso', 'Duarte', 'Esteves', 'Ferreira', 'Gomes', 'Henriques', 'Lima', 'Machado', 'Nogueira', 'Oliveira', 'Pereira', 'Queiroz', 'Ribeiro', 'Santos', 'Teixeira', 'Vieira', 'Xavier', 'Monteiro', 'Pacheco', 'Rezende'];
const PARENT = ['Marcos', 'Patrícia', 'Renata', 'Sérgio', 'Cláudia', 'Fábio', 'Luciana', 'Adriana', 'Paulo', 'Simone', 'André', 'Cristina'];
const BANKS = ['Nubank', 'Itaú', 'Bradesco', 'Banco do Brasil', 'Inter', 'Caixa', 'Santander'];
const teamPoolForGender = g => TEAMS.filter(t => t.gender === 'Misto' || t.gender === g);
let ATHLETES = [];
(() => {
  const females = new Set(['Ana', 'Beatriz', 'Carolina', 'Daniela', 'Eduarda', 'Fernanda', 'Gabriela', 'Helena', 'Isabela', 'Júlia', 'Larissa', 'Manuela', 'Natália', 'Olívia', 'Laura', 'Marina', 'Sofia', 'Valentina', 'Alice', 'Lívia', 'Clara', 'Yasmin']);
  for (let i = 0; i < 184; i++) {
    const first = FIRST[(i * 7) % FIRST.length];
    const last = LAST[(i * 5 + 3 + Math.floor(i / FIRST.length)) % LAST.length];
    const g = females.has(first) ? 'F' : 'M';
    const pool = teamPoolForGender(g).filter(t => t.id !== 't8' || i % 4 === 0);
    const team = pool[(i * 7 + Math.floor(i / 3)) % pool.length];
    const minor = team.ageMin < 18;
    const age = team.ageMax ? team.ageMin + (i % (team.ageMax - team.ageMin + 1)) : 18 + (i * 3) % 30;
    const birth = new Date(TODAY.getFullYear() - age, (i * 5) % 12, 1 + (i * 3) % 27);
    const plans = plansOfTeam(team.id);
    const plan = plans[i % plans.length];
    const parent = PARENT[i % PARENT.length] + ' ' + last;
    ATHLETES.push({
      id: 'a' + (i + 1), name: `${first} ${last}`, birth: ymd(birth), email: `${first.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}.${last.toLowerCase()}${i}@exemplo.com`,
      cpf: `000.${pad(100 + i).slice(-3)}.${pad(200 + i * 3).slice(-3)}-${pad(i % 100)}`, rg: `00.${pad(300 + i).slice(-3)}.${pad(400 + i).slice(-3)}-${i % 9}`,
      phone: minor && i % 3 ? '' : '119' + String(81000000 + i * 1379).slice(0, 8), parentName: minor ? parent : '', parentPhone: minor ? '119' + String(72000000 + i * 911).slice(0, 8) : '',
      teamId: team.id, plan: plan ? planLabel(plan) : '', planId: plan ? plan.id : null, address: `Rua Exemplo, ${10 + i * 7} — Bairro ${NUCLEI.find(n => n.id === team.n).name}`,
      bank: BANKS[i % BANKS.length], active: i % 11 !== 5, since: ymd(addDays(TODAY, -(3 + (i * 37) % 420))),
    });
  }
})();
const athletesOnPlan = pid => ATHLETES.filter(a => a.active && a.planId === pid);

/* Agendamentos (peneiras / aulas experimentais) */
const STATUS = ['Pendente', 'Agendado', 'Em avaliação', 'Em cadastro', 'Tecnofit', 'Ausente', 'Cancelado'];
const stClass = s => 'st-' + String(s || 'pendente').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');
const nextOccurrence = (team, fromOffset, nth = 0) => {
  let d = addDays(TODAY, fromOffset), found = 0;
  for (let k = 0; k < 60; k++) {
    const s = team.schedule.find(x => x.day === d.getDay());
    if (s && !team.blocked.includes(ymd(d))) { if (found === nth) return `${ymd(d)}T${s.start}`; found++; }
    d = addDays(d, fromOffset < 0 ? -1 : 1);
  }
  return `${ymd(TODAY)}T18:00`;
};
let BOOKINGS = [];
(() => {
  const spec = [
    ['Mariana Duarte', 'Helena Duarte', 't1', 1, 0, 'Agendado', 0], ['Lucas Ferreira', '', 't4', 0, 0, 'Agendado', 1], ['Renata Gomes', 'Alice Gomes', 't2', 1, 1, 'Agendado', 0],
    ['Thiago Barbosa', '', 't5', 2, 0, 'Pendente', 0], ['Cláudia Lima', 'Sofia Lima', 't7', 1, 0, 'Agendado', 0], ['Patrícia Nogueira', 'Clara Nogueira', 't3', 3, 0, 'Agendado', 2],
    ['Juliana Santos', '', 't6', 2, 1, 'Agendado', 0], ['André Machado', 'Enzo Machado', 't1', 4, 1, 'Pendente', 0], ['Carla Vieira', '', 't6', 6, 0, 'Agendado', 0],
    ['Paulo Ribeiro', 'Igor Ribeiro', 't5', 7, 0, 'Agendado', 1], ['Fernanda Queiroz', '', 't4', 8, 0, 'Agendado', 0],
    ['Sérgio Teixeira', 'Laura Teixeira', 't2', -2, 0, 'Em avaliação', 0], ['Beatriz Pacheco', '', 't6', -3, 0, 'Em cadastro', 0], ['Luciana Rezende', 'Marina Rezende', 't1', -5, 0, 'Tecnofit', 0],
    ['Gustavo Almeida', '', 't4', -6, 0, 'Ausente', 1], ['Simone Cardoso', 'Yasmin Cardoso', 't3', -8, 0, 'Em cadastro', 0], ['Caio Monteiro', '', 't5', -9, 0, 'Cancelado', 0],
    ['Adriana Esteves', 'Valentina Esteves', 't7', -10, 0, 'Tecnofit', 0], ['Rodrigo Henriques', '', 't4', -13, 0, 'Ausente', 0], ['Cristina Xavier', 'Lívia Xavier', 't2', -15, 0, 'Tecnofit', 1],
    ['Otávio Oliveira', '', 't5', -18, 0, 'Tecnofit', 0], ['Marcos Pereira', 'Heitor Pereira', 't1', -20, 0, 'Cancelado', 0], ['Larissa Gomes', '', 't6', -24, 0, 'Tecnofit', 0],
  ];
  spec.forEach(([nome, menor, tid, off, nth, status, reag], i) => {
    const team = TEAMS.find(t => t.id === tid);
    BOOKINGS.push({ id: 'b' + (i + 1), nome, nomeMenor: menor, whatsapp: '119' + String(60000000 + i * 4211).slice(0, 8), teamId: tid, date: nextOccurrence(team, off, nth), status, reag, archived: status === 'Tecnofit' && off < -14, createdAt: ymd(addDays(TODAY, Math.min(off, 0) - 3 - (i % 4))) });
  });
})();
const teamOf = id => TEAMS.find(t => t.id === id);
const nucleusOf = id => NUCLEI.find(n => n.id === id);
const coachOf = id => COACHES.find(c => c.id === id);
const isMinorTeam = t => !!t && t.ageMin !== null && t.ageMin !== undefined && t.ageMin !== '' && Number(t.ageMin) < 18;
const ageRange = t => t.ageMin == null || t.ageMin === '' ? 'Não definida' : t.ageMax ? `${t.ageMin} a ${t.ageMax} anos` : `${t.ageMin}+ anos`;
const genderLabel = g => ({ F: 'Feminino', M: 'Masculino', Misto: 'Misto' }[g] || 'Não definido');
const schedText = s => `${DOW[s.day]} ${s.start}–${s.end}`;

function chatFor(b) {
  const t = teamOf(b.teamId), d = parseLocal(b.date), who = b.nomeMenor || b.nome;
  const hh = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return [
    ['user', 'Oi! Queria saber sobre as aulas de vôlei 🙂'],
    ['model', `Olá, ${b.nome.split(' ')[0]}! Sou o Assistente Virtual da Apollo Voleibol. ${b.nomeMenor ? 'Qual a idade dele(a)?' : 'O agendamento é para você?'}`],
    ['user', b.nomeMenor ? `É para minha filha/filho, tem ${t.ageMin + 1} anos` : 'Sim, para mim'],
    ['model', `Perfeito! Para esse perfil temos:\n👉 **${t.name}** — ${t.schedule.map(schedText).join(' / ')}\nQual turma você prefere?`],
    ['user', t.name],
    ['model', `Ótimo! As próximas datas disponíveis são:\n👉 ${d.getDate()} de ${MONTHS[d.getMonth()]}, ${hh}\nQual data você escolhe?`],
    ['user', `${d.getDate()} de ${MONTHS[d.getMonth()]}`],
    ['model', `Resumo: ${t.name}, ${fmtDate(d)} às ${hh}, ${who}. Você confirma o agendamento?`],
    ['user', 'Confirmo!'],
    ['model', 'Agendamento confirmado! 🎉 Te esperamos no ' + nucleusOf(t.n).venue + '.'],
  ].map(([role, text], i) => ({ role, text, time: `${b.createdAt.split('-').reverse().join('/')} ${pad(10 + Math.floor(i / 3))}:${pad((i * 7) % 60)}` }));
}

/* Treinos realizados com chamada de presença (como no Manager App) */
let SESSIONS = [];
(() => {
  let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const rate = Object.fromEntries(ATHLETES.map((a, i) => [a.id, i % 9 === 4 ? .45 : i % 5 === 1 ? .7 : .9]));
  for (let d = addDays(TODAY, -35); d <= TODAY; d = addDays(d, 1)) {
    TEAMS.filter(t => t.active && t.coach).forEach(t => t.schedule.filter(s => s.day === d.getDay()).forEach(s => {
      const key = ymd(d);
      if (t.cancelled.includes(key) || (key === ymd(TODAY) && toMin(s.end) > NOW.getHours() * 60 + NOW.getMinutes())) return;
      const recorded = rnd() > .08, att = {};
      if (recorded) ATHLETES.filter(a => a.active && a.teamId === t.id).forEach(a => { const r = rnd(); att[a.id] = r < rate[a.id] ? 'present' : r < rate[a.id] + .06 ? 'excused' : 'absent'; });
      SESSIONS.push({ teamId: t.id, date: key, start: s.start, hours: hoursBetween(s.start, s.end), recorded, att });
    }));
  }
})();
const COMPETITIONS = [
  { id: 'k1', name: 'Copa Regional Sub-17 — semifinal', teamId: 't3', date: ymd(addDays(TODAY, 5)), place: 'Ginásio Municipal' },
  { id: 'k2', name: 'Liga Regional Sub-15 — 4ª rodada', teamId: 't2', date: ymd(addDays(TODAY, 9)), place: 'Ginásio Apollo Centro' },
  { id: 'k3', name: 'Torneio Amador de Outono', teamId: 't4', date: ymd(addDays(TODAY, 16)), place: 'Clube Atlético' },
  { id: 'k4', name: 'Festival de Iniciação', teamId: 't1', date: ymd(addDays(TODAY, 22)), place: 'Arena Sul' },
  { id: 'k5', name: 'Estadual Sub-17 Masculino — 2ª etapa', teamId: 't5', date: ymd(addDays(TODAY, 12)), place: 'Arena Sul' },
];

/* Financeiro */
let LEDGER = [];
let DELINQ = [];
let IMPORTS = [{ file: 'recebimentos_tecnofit_agosto.xlsx', at: ymd(addDays(TODAY, -24)), rows: 142, by: 'Carla Nunes' }];
(() => {
  const exp = ATHLETES.filter(a => a.active).reduce((s, a) => s + (PLANS.find(p => p.id === a.planId)?.value || 0), 0);
  const base = [.84, .86, .88, .9, .92, .94].map(f => Math.round(exp * f));
  for (let k = 5; k >= 0; k--) {
    const m = new Date(TODAY.getFullYear(), TODAY.getMonth() - k, 1);
    const cur = k === 0;
    const factor = cur ? Math.min(1, TODAY.getDate() / 20) : 1;
    const rec = Math.round(base[5 - k] * factor);
    [['centro', .52], ['sul', .33], ['norte', .15]].forEach(([n, f], j) => LEDGER.push({ id: uid('l'), date: ymd(addDays(m, 4 + j)), desc: `Mensalidades recebidas — Núcleo ${nucleusOf(n).name}`, cat: 'Mensalidades', type: 'in', amount: Math.round(rec * f), source: 'Tecnofit', n }));
    LEDGER.push({ id: uid('l'), date: ymd(addDays(m, 9)), desc: 'Taxas de matrícula', cat: 'Matrículas', type: 'in', amount: [210000, 140000, 280000, 350000, 210000, 280000][5 - k], source: 'Tecnofit', n: null });
    if (k % 2 === 0) LEDGER.push({ id: uid('l'), date: ymd(addDays(m, 14)), desc: 'Patrocínio — uniforme de jogo', cat: 'Patrocínios', type: 'in', amount: 450000, source: 'Manual', n: null });
    if (cur && TODAY.getDate() < 6) continue;
    LEDGER.push({ id: uid('l'), date: ymd(addDays(m, 5)), desc: 'Pagamento de técnicos (mês anterior)', cat: 'Folha técnica', type: 'out', amount: [1085000, 1102000, 1098000, 1131000, 1127000, 1146000][5 - k], source: 'Manual', n: null });
    LEDGER.push({ id: uid('l'), date: ymd(addDays(m, 6)), desc: 'Aluguel de quadra — Arena Sul', cat: 'Locação', type: 'out', amount: 680000, source: 'Manual', n: 'sul' });
    LEDGER.push({ id: uid('l'), date: ymd(addDays(m, 6)), desc: 'Cessão de espaço — Centro Esportivo Norte', cat: 'Locação', type: 'out', amount: 180000, source: 'Manual', n: 'norte' });
    LEDGER.push({ id: uid('l'), date: ymd(addDays(m, 11)), desc: 'Sistema Tecnofit + ferramentas', cat: 'Sistemas', type: 'out', amount: 64000, source: 'Manual', n: null });
    if (k % 2 === 1) LEDGER.push({ id: uid('l'), date: ymd(addDays(m, 16)), desc: 'Inscrição em campeonato regional', cat: 'Competições', type: 'out', amount: 120000, source: 'Manual', n: null });
    if (k % 3 === 0) LEDGER.push({ id: uid('l'), date: ymd(addDays(m, 18)), desc: 'Material esportivo (bolas e redes)', cat: 'Material', type: 'out', amount: 235000, source: 'Manual', n: null });
    LEDGER.push({ id: uid('l'), date: ymd(addDays(m, 20)), desc: 'Transporte para competição', cat: 'Competições', type: 'out', amount: k % 2 ? 90000 : 0, source: 'Manual', n: null });
  }
  LEDGER = LEDGER.filter(l => l.amount > 0 && parseYmd(l.date) <= TODAY);
  const late = ATHLETES.filter(a => a.active).filter((_, i) => i % 12 === 2);
  late.forEach((a, i) => {
    const months = i % 4 === 0 ? 2 : 1;
    const plan = PLANS.find(p => p.id === a.planId);
    for (let m = 0; m < months; m++) {
      const due = new Date(TODAY.getFullYear(), TODAY.getMonth() - m, 10);
      if (due >= TODAY) continue;
      DELINQ.push({ id: uid('d'), athleteId: a.id, ref: `${MON[due.getMonth()]}/${due.getFullYear()}`, due: ymd(due), amount: plan ? plan.value : 15990, contacted: i % 3 === 0 ? ymd(addDays(TODAY, -2)) : null, source: 'Tecnofit' });
    }
  });
})();

/* Pagamentos de técnicos */
let COACH_ITEMS = [];
let PAYOUTS = {}; // chave `${coachId}|${yyyy-mm}` → {paidAt}
(() => {
  for (let k = 1; k >= 0; k--) {
    const m0 = new Date(TODAY.getFullYear(), TODAY.getMonth() - k, 1);
    const last = new Date(m0.getFullYear(), m0.getMonth() + 1, 0);
    for (let d = new Date(m0); d <= last && d <= TODAY; d = addDays(d, 1)) {
      TEAMS.filter(t => t.coach).forEach(t => t.schedule.filter(s => s.day === d.getDay()).forEach(s => {
        if (t.cancelled.includes(ymd(d))) return;
        if (ymd(d) === ymd(TODAY) && toMin(s.end) > NOW.getHours() * 60 + NOW.getMinutes()) return;
        COACH_ITEMS.push({ id: uid('p'), coach: t.coach, date: ymd(d), type: 'treino', teamId: t.id, hours: hoursBetween(s.start, s.end), desc: `Treino ${t.name}`, status: k ? 'aprovado' : (parseYmd(ymd(d)) < addDays(TODAY, -3) ? 'aprovado' : 'pendente'), origin: 'Agenda' });
      }));
    }
    const comp = [['c1', 't3', 'Copa Regional Sub-17 (fase de grupos)', 2], ['c3', 't5', 'Estadual Sub-17 Masculino — 1ª etapa', 1], ['c2', 't2', 'Festival Liga Regional Sub-15', 1]];
    comp.forEach(([c, t, desc, days], j) => {
      const date = new Date(m0.getFullYear(), m0.getMonth(), 6 + j * 7 + (k ? 0 : 1));
      if (date > TODAY) return;
      for (let x = 0; x < days; x++) COACH_ITEMS.push({ id: uid('p'), coach: c, date: ymd(addDays(date, x)), type: 'competicao', teamId: t, hours: 0, desc, status: k ? 'aprovado' : 'pendente', origin: 'Manual' });
    });
    if (k) COACHES.forEach(c => { PAYOUTS[`${c.id}|${m0.getFullYear()}-${pad(m0.getMonth() + 1)}`] = { paidAt: ymd(new Date(TODAY.getFullYear(), TODAY.getMonth(), 5)) }; });
  }
  COACH_ITEMS.push({ id: uid('p'), coach: 'c4', date: ymd(addDays(TODAY, -4)), type: 'extra', teamId: 't6', hours: 2, desc: 'Avaliação de novas atletas (peneira)', status: 'pendente', origin: 'Manual', amount: 11000 });
})();
const itemValue = it => { if (it.status === 'aprovado' && it.amount != null) return it.amount; const c = coachOf(it.coach); if (it.type === 'competicao') return c.daily; if (it.type === 'extra') return it.amount ?? Math.round(c.rate * it.hours); return Math.round(c.rate * it.hours); };

/* Usuários e permissões */
const PAGES = [
  { id: 'overview', label: 'Visão geral', icon: 'grid', group: 'OPERAÇÃO' },
  { id: 'bookings', label: 'Agendamentos', icon: 'calendar', group: 'OPERAÇÃO' },
  { id: 'athletes', label: 'Atletas', icon: 'users', group: 'OPERAÇÃO' },
  { id: 'teams', label: 'Equipes e núcleos', icon: 'pin', group: 'OPERAÇÃO' },
  { id: 'packages', label: 'Pacotes e mensalidades', icon: 'layers', group: 'OPERAÇÃO' },
  { id: 'feeder', label: 'Chatbot Feeder', icon: 'bot', group: 'ASSISTENTE' },
  { id: 'payments', label: 'Pagamentos', icon: 'wallet', group: 'FINANÇAS' },
  { id: 'finance', label: 'Financeiro', icon: 'chart', group: 'FINANÇAS' },
  { id: 'settings', label: 'Configurações', icon: 'settings', group: 'SISTEMA' },
];
const P = (...pairs) => Object.fromEntries(PAGES.map((p, i) => [p.id, pairs[i] || 'none']));
const ROLE_PRESETS = {
  'Administrador': P('edit', 'edit', 'edit', 'edit', 'edit', 'edit', 'edit', 'edit', 'edit'),
  'Coordenação técnica': P('view', 'edit', 'edit', 'edit', 'none', 'edit', 'none', 'none', 'none'),
  'Financeiro': P('view', 'none', 'view', 'none', 'edit', 'none', 'edit', 'edit', 'none'),
  'Atendimento': P('view', 'edit', 'view', 'view', 'none', 'view', 'none', 'none', 'none'),
  'Técnico': P('view', 'view', 'view', 'view', 'none', 'none', 'none', 'none', 'none'),
};
let USERS = [];

/* Configuração do assistente (Chatbot Feeder) */
let FEEDER = {
  includeAge: false, includeGender: false, includeCoachPhone: true, datesCount: 3, minHoursAhead: 12, cacheMin: 30,
  lastSync: new Date(NOW.getTime() - 7 * 60000),
  rules: {
    format: [
      'Nunca usar asterisco solto (*) para listas nem cerquilha (#) para títulos.',
      'Listar equipes, datas e opções sempre com o emoji 👉 antes de cada item.',
      'Negrito com **duplo asterisco**, itálico com _underline_, sublinhado com __duplo underline__.',
      'Usar emojis com moderação.',
    ],
    absolute: [
      'O quadro oficial é a única agenda válida. Nunca mandar o usuário ao WhatsApp para verificar horários.',
      'Valores de mensalidade são informados exclusivamente de forma presencial. Nunca falar de preços.',
      'Para crianças/adolescentes, só sugerir equipe depois de saber a idade.',
    ],
    steps: [
      'IDADE — se for para filho(a), perguntar a idade antes de avançar.',
      'EQUIPE — apresentar as turmas adequadas do quadro e pedir que escolha uma.',
      'NOME — turmas de menores exigem nome e sobrenome do aluno antes de mostrar datas.',
      'DATAS — mostrar apenas as datas disponíveis da equipe escolhida.',
      'CONFIRMAÇÃO — resumir equipe, data, horário e nome e perguntar "Você confirma o agendamento?".',
      'TAG FINAL — só após o "sim", confirmar e emitir a marcação [BOOKING] para gravar o agendamento.',
    ],
  },
  history: [
    { at: ymd(addDays(TODAY, -1)), who: 'Bruno Lima', what: 'Descrição da equipe Sub-15 Feminino atualizada' },
    { at: ymd(addDays(TODAY, -6)), who: 'Ana Ribeiro', what: 'Equipe Master Misto ocultada do assistente' },
  ],
};

/* ─── Estado de navegação ─── */
const S = {
  page: 'overview', userId: 'u1', previewRole: '', theme: 'light',
  cal: { cursor: TODAY, nuclei: new Set(NUCLEI.map(n => n.id)), showTests: true },
  bk: { q: '', status: '', team: '', archived: false, sort: { col: 'data', dir: 'asc' }, kpi: '', pending: '', sel: new Set() },
  at: { q: '', status: '', team: '', n: '', pending: '' },
  tm: { n: 'all', q: '' },
  pk: { n: 'all', q: '', freq: 'all' },
  fd: { tab: 'teams', simAge: '', simGender: '', open: new Set(['t1']) },
  pay: { month: `${TODAY.getFullYear()}-${pad(TODAY.getMonth() + 1)}` },
  fin: { tab: 'summary', type: 'all', q: '', alertFilter: '', series: 'receivables', month: `${TODAY.getFullYear()}-${pad(TODAY.getMonth() + 1)}` },
  st: { tab: 'users' },
};
const me = () => {
  if (!S.previewRole) return USERS.find(u => u.id === S.userId);
  const coach = USERS.find(u => u.role === 'Técnico' && u.coachId);
  return { id: 'preview', name: `Prévia · ${S.previewRole}`, role: S.previewRole,
    perms: ROLE_PRESETS[S.previewRole], coachId: S.previewRole === 'Técnico' ? coach?.coachId : null };
};
/* Dados financeiros: somente perfis Administrador e Financeiro, mesmo para visualização */
const FIN_ROLES = ['Administrador', 'Financeiro'];
const FIN_PAGES = ['packages', 'payments', 'finance'];
const seesFinance = (u = me()) => !!u && FIN_ROLES.includes(u.role);
const isCoach = (u = me()) => !!u && u.role === 'Técnico';
const myTeamIds = (u = me()) => isCoach(u)
  ? TEAMS.filter(t => (typeof LIVE !== 'undefined' && LIVE.ready
    ? LIVE.teamCoachIds.get(t.id)?.includes(u.coachId) : t.coach === u.coachId)).map(t => t.id)
  : TEAMS.map(t => t.id);
const perm = (p, u = me()) => (FIN_PAGES.includes(p) && !seesFinance(u)) ? 'none' : (u && u.perms[p]) || 'none';
/* Rótulo do pacote sem valores para quem não vê dados financeiros */
const maskPlan = str => seesFinance() ? str : String(str || '').replace(/\s*-\s*R\$.*$/, '');
const planText = p => seesFinance() ? planLabel(p) : `${p.days}x por semana`;
const canView = p => perm(p) !== 'none';
const canEdit = p => !S.previewRole && perm(p) === 'edit';

const METRIC_HELP = {
  'Fluxo de caixa': 'Total de entradas do relatório Fluxo de Caixa Analítico do Tecnofit, por forma de pagamento. O relatório é agregado: não identifica atletas nem parcelas em atraso.',
  '1ª resposta do assistente': 'Tempo médio da primeira mensagem recebida pelo servidor até a primeira resposta útil preparada pelo assistente. Exclui saudação automática, falhas e o download no aparelho. Amostra: conversas iniciadas nos últimos 30 dias com resposta registrada.',
  'Tempo até agendar': 'Tempo médio entre a primeira mensagem e a gravação confirmada de um novo agendamento na mesma sessão do chatbot. Exclui reagendamentos, agendamentos anteriores e conversas sem agendamento. Mostra o esforço de conversão, não o tempo até o dia do treino.',
  'Retorno humano': 'Tempo médio do pedido explícito de atendimento no chatbot até o atendente registrar no Huddle que enviou a primeira resposta no WhatsApp. É uma medição manual em horas corridas. Abrir o WhatsApp não conta como resposta; pedidos pendentes ficam fora da média e aparecem na contagem.',
  'Satisfação': 'CSAT do assistente: percentual de notas 4 ou 5 entre avaliações opcionais de 1 a 5. Cada sessão aceita uma avaliação após uma resposta útil. A média das notas e o número de respostas aparecem junto ao indicador; sem avaliações, não há percentual.',
  'Recebido bruto': 'Soma dos recebimentos confirmados no relatório Contas a Receber, no mês selecionado. Serve para acompanhar o volume efetivamente recebido.',
  'Taxas': 'Soma das taxas dos recebimentos confirmados no Tecnofit. Ajuda a entender o custo dos meios de pagamento.',
  'Taxas dos recebimentos': 'Soma das taxas registradas em Contas a Receber para recebimentos confirmados.',
  'Recebido líquido': 'Recebido bruto menos as taxas do relatório Contas a Receber; não inclui despesas operacionais.',
  'Mensalidades vencidas': 'Soma das parcelas de mensalidade com vencimento anterior a hoje e saldo positivo em Vendas em Aberto. Depende da última importação.',
  'Em atraso': 'Parcelas de mensalidade vencidas e ainda abertas no último relatório de Vendas em Aberto de Vendas em Aberto.',
  'Em aberto no mês': 'Parcelas abertas com vencimento no mês selecionado, inclusive as ainda dentro do prazo.',
  'A vencer': 'Parcelas abertas com vencimento a partir de hoje no último relatório de Vendas em Aberto de Vendas em Aberto.',
  'Fluxo analítico': 'Total de entradas agregado no Fluxo de Caixa Analítico. Pode divergir de Contas a Receber por competência e composição.',
  'Comparecimento': 'Testes realizados com status posterior a Agendado ou Pendente, divididos pelos testes passados não cancelados.',
  'Reagendamentos': 'Agendamentos com pelo menos uma remarcação, divididos pelo total de agendamentos carregados.',
  'Conversão em matrícula': 'Agendamentos criados nos últimos 30 dias com status Tecnofit, divididos pelos agendamentos desse período.',
  'Aguardando avaliação': 'Testes passados ainda com status Agendado, Pendente ou Em avaliação. O técnico ou atendimento precisa concluir o acompanhamento.',
  'Atletas ativos': 'Atletas marcados como ativos no cadastro do Supabase.',
  'Presença média': 'Presenças registradas divididas pelo total de chamadas com status informado nos últimos 30 dias.',
  'Treinos na semana': 'Horários das equipes ativas nesta semana, excluindo apenas treinos explicitamente cancelados.',
  'Atletas ativos em 90 dias': 'Projeção simples: soma o ritmo médio de crescimento observado nos últimos cinco intervalos mensais aos atletas ativos hoje. Não considera saídas futuras ou sazonalidade.',
  'Novas matrículas por mês (média)': 'Variação média dos atletas ativos nos últimos cinco intervalos mensais. É uma aproximação, não a contagem individual de matrículas.',
  'Testes agendados (30 dias)': 'Agendamentos criados nos últimos 30 dias e disponíveis no Supabase.',
  'Conversão teste → matrícula': 'Agendamentos criados nos últimos 30 dias que chegaram ao status Tecnofit, divididos pelo total criado no período.',
  'Presença média (30 dias)': 'Presenças registradas nos treinos dos últimos 30 dias divididas pelos status de chamada informados.',
  'Horas treinadas': 'Soma da duração dos treinos registrados para as equipes do técnico nos últimos sete dias.',
  'Chamadas registradas': 'Treinos com chamada lançada no Manager App, divididos pelos treinos registrados neste mês.',
  'Testes a avaliar': 'Agendamentos das equipes do técnico cuja data já passou e que permanecem sem conclusão.',
  'Agendados': 'Agendamentos ativos com status Agendado nas equipes visíveis para seu perfil.',
  'Reagendados': 'Agendamentos ativos que tiveram pelo menos uma mudança de data.',
  'Ausentes': 'Agendamentos ativos marcados como Ausente.',
  'Cancelados': 'Agendamentos ativos marcados como Cancelado.'
};
const metricInfo = (label, help = METRIC_HELP[label]) => help ? `<button class="metric-info" type="button" data-act="metric-info" data-label="${esc(label)}" data-info="${esc(help)}" aria-label="Como é calculado: ${esc(label)}">${icon('info')}</button>` : '';

/* ─── Componentes visuais ─── */
function toast(msg, err = false) {
  const t = $('#toast');
  t.innerHTML = (err ? icon('alert') : icon('check')) + `<span>${esc(msg)}</span>`;
  t.className = 'toast' + (err ? ' err' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hide'), 4200);
}
let lastFocus = null;
function openDialog(html, cls = '') {
  const d = $('#dlg');
  if (!d.open) lastFocus = document.activeElement;
  d.className = cls; d.innerHTML = html;
  if (!canEdit(S.page)) d.querySelectorAll('[data-edit]').forEach(b => { b.classList.add('locked'); b.setAttribute('aria-disabled', 'true'); b.title = 'Somente visualização para o seu perfil'; });
  if (!d.open) d.showModal();
  const f = d.querySelector('[autofocus]') || d.querySelector('.d-body input:not([disabled]),.d-body select:not([disabled]),.d-body textarea:not([disabled])');
  if (f) setTimeout(() => f.focus(), 30);
  return d;
}
function closeDialog() { const d = $('#dlg'); if (d.open) d.close(); }
$('#dlg').addEventListener('close', () => { const d = $('#dlg'); if (d.open) return; d.dataset.dirty = '0'; if (lastFocus && lastFocus.isConnected) lastFocus.focus(); });
$('#dlg').addEventListener('cancel', e => { if ($('#dlg').dataset.dirty === '1') { e.preventDefault(); guardClose(); } });
function confirmBox({ title, text, ok = 'Confirmar', cancel = 'Cancelar', danger = false, third = null }) {
  return new Promise(res => {
    const d = $('#dlg2');
    d.innerHTML = `<div class="d-head"><div><h2 id="dlg2Title">${esc(title)}</h2></div></div><div class="d-body"><p style="margin:0" class="muted">${text}</p></div>
      <div class="d-foot">${third ? `<button class="btn left" data-r="third">${esc(third)}</button>` : ''}<button class="btn" data-r="no">${esc(cancel)}</button><button class="btn ${danger ? 'primary' : 'ok'}" data-r="yes" autofocus>${esc(ok)}</button></div>`;
    d.onclick = e => { const b = e.target.closest('[data-r]'); if (!b) return; d.close(); res(b.dataset.r === 'yes' ? true : b.dataset.r === 'third' ? 'third' : false); };
    d.oncancel = () => res(false);
    d.showModal();
  });
}
const dHead = (eyebrow, title, sub = '') => `<div class="d-head"><div><div class="eyebrow">${eyebrow}</div><h2 id="dlgTitle">${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div><button class="x" data-act="close-dialog" aria-label="Fechar">${icon('x')}</button></div>`;
const nucleusLabel = (name, prefix = 'Núcleo ') => prefix && String(name || '').toLocaleLowerCase('pt-BR').startsWith(prefix.trim().toLocaleLowerCase('pt-BR')) ? String(name) : prefix + String(name || '—');
const nTag = (id, prefix = 'Núcleo ') => { const n = nucleusOf(id); return `<span class="tag ${NCLASS(id)}">${esc(nucleusLabel(n?.name, prefix))}</span>`; };
const stTag = s => `<span class="tag ${stClass(s)}">${esc(s || 'Pendente')}</span>`;
// As fontes técnicas (Supabase, Tecnofit, Manager App) ficam na explicação do ícone (i), não na tela.
const srcTag = () => '';
// Nomes vindos de cadastros e do Tecnofit chegam em CAIXA ALTA ou minúsculas: padroniza só a exibição.
const NAME_PARTICLES = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'di', 'du']);
const displayName = raw => {
  const s = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!s || (s !== s.toUpperCase() && s !== s.toLowerCase())) return s;
  return s.toLowerCase().split(' ').map((w, i) => i && NAME_PARTICLES.has(w) ? w
    : w.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('-')).join(' ');
};
// "MENSAL | ADULTO INICIANTE 1X POR SEMANA - Período: 10/09/2026 - 10/10/2026" → "Adulto iniciante 1x por semana · 10/09–10/10"
const tecnofitItem = raw => {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  const sentence = v => { const t = v.trim().toLowerCase().replace(/(\d)x\b/g, '$1x'); return t.charAt(0).toUpperCase() + t.slice(1); };
  const found = [...text.matchAll(/(?:[A-ZÀ-Ú ]+\|\s*)?([^|]+?)\s*-\s*Per[ií]odo:\s*(\d{2}\/\d{2})\/\d{4}\s*-\s*(\d{2}\/\d{2})\/\d{4}/gi)]
    .map(m => `${sentence(m[1])} · ${m[2]}–${m[3]}`);
  return found.length ? [...new Set(found)].join(' + ') : sentence(text.replace(/^[A-ZÀ-Ú ]+\|\s*/, ''));
};
const emptyState = (title, text, action = '') => `<div class="empty">${icon('search')}<h3>${title}</h3><p class="small">${text}</p>${action}</div>`;
const viewBanner = page => canEdit(page) ? '' : `<div class="banner view">${icon('eye')}<div><b>Modo visualização.</b> O perfil <b>${esc(me().name)}</b> pode consultar esta página, mas não alterar dados. Botões de edição ficam bloqueados.</div></div>`;

function sparkline(values, color, w = 96, h = 30) {
  const max = Math.max(...values, 1), step = w / (values.length - 1);
  const pts = values.map((v, i) => [i * step, h - 3 - (v / max) * (h - 8)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d} L${w} ${h} L0 ${h}Z" fill="${color}" opacity=".12"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${pts.at(-1)[0]}" cy="${pts.at(-1)[1]}" r="2.8" fill="${color}"/></svg>`;
}
function lineChart({ labels, series, height = 230, fmt = v => v, yMax }) {
  const W = 640, H = height, L = 56, R = 14, T = 14, B = 28, iw = W - L - R, ih = H - T - B;
  const all = series.flatMap(s => s.values.filter(v => v != null));
  const max = yMax || Math.max(...all) * 1.12 || 1, min = 0;
  const x = i => L + (labels.length === 1 ? iw / 2 : i * iw / (labels.length - 1)), y = v => T + ih - (v - min) / (max - min) * ih;
  let g = '';
  for (let k = 0; k <= 4; k++) { const v = min + (max - min) * k / 4; g += `<line class="grid-l" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`; }
  labels.forEach((l, i) => { g += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${l}</text>`; });
  series.forEach(s => {
    const pts = s.values.map((v, i) => v == null ? null : [x(i), y(v)]);
    const segments = [];
    pts.forEach((point, index) => {
      if (!point) return;
      if (!segments.length || pts[index - 1] === null) segments.push([]);
      segments.at(-1).push(point);
    });
    segments.forEach(seg => {
      if (s.area) g += `<path d="M${seg[0][0]} ${y(0)} ${seg.map(p => 'L' + p[0] + ' ' + p[1]).join(' ')} L${seg.at(-1)[0]} ${y(0)}Z" fill="${s.color}" opacity=".1"/>`;
      g += `<path d="${seg.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ')}" fill="none" stroke="${s.color}" stroke-width="2.4" ${s.dash ? 'stroke-dasharray="6 5"' : ''} stroke-linecap="round" stroke-linejoin="round"/>`;
      seg.forEach(p => { g += `<circle cx="${p[0]}" cy="${p[1]}" r="3.2" fill="var(--surface)" stroke="${s.color}" stroke-width="2"/>`; });
    });
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
}
function barChart({ labels, series, height = 230, fmt = v => v }) {
  const W = 640, H = height, L = 56, R = 10, T = 14, B = 28, iw = W - L - R, ih = H - T - B;
  const max = Math.max(...series.flatMap(s => s.values)) * 1.12 || 1;
  const y = v => T + ih - v / max * ih, gw = iw / labels.length, bw = Math.min(22, (gw - 14) / series.length);
  let g = '';
  for (let k = 0; k <= 4; k++) { const v = max * k / 4; g += `<line class="grid-l" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`; }
  labels.forEach((l, i) => {
    const cx = L + gw * i + gw / 2;
    series.forEach((s, j) => { const bx = cx - (series.length * bw) / 2 + j * bw + 1, v = s.values[i]; g += `<rect x="${bx}" y="${y(v)}" width="${bw - 3}" height="${Math.max(0, T + ih - y(v))}" rx="3" fill="${s.color}"><title>${s.name}: ${fmt(v)}</title></rect>`; });
    g += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${l}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
}

/* Mini calendário mensal reutilizável */
function miniCal({ month, isEnabled = () => true, cls = () => '', selected = null, id }) {
  const y = month.getFullYear(), m = month.getMonth(), first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
  let cells = DOW.map(d => `<div class="dn">${d}</div>`).join('') + '<div></div>'.repeat(first);
  for (let i = 1; i <= days; i++) {
    const d = new Date(y, m, i), key = ymd(d), en = isEnabled(d);
    cells += `<button type="button" data-day="${key}" class="${cls(d)} ${selected === key ? 'sel' : ''} ${key === ymd(TODAY) ? 'today' : ''}" ${en ? '' : 'disabled'} aria-label="${i} de ${MONTHS[m]}">${i}</button>`;
  }
  return `<div class="mcal" id="${id}"><div class="mcal-head"><button type="button" class="btn ghost sq" data-mcal="-1" aria-label="Mês anterior">${icon('left')}</button><span>${MONTHS[m][0].toUpperCase() + MONTHS[m].slice(1)} ${y}</span><button type="button" class="btn ghost sq" data-mcal="1" aria-label="Próximo mês">${icon('right')}</button></div><div class="mcal-grid">${cells}</div></div>`;
}

function download(name, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob(['\ufeff' + text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 500);
}
const csv = rows => rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
