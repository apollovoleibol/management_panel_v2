/* Busca global (Ctrl+K ou /): atletas, responsáveis, agendamentos, equipes, páginas e ações */
'use strict';

const CMDK = { items: [], active: 0 };
const cmdkNorm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

function cmdkSources() {
  const mine = myTeamIds(), out = [];
  PAGES.filter(p => canView(p.id)).forEach(p => out.push({ group: 'Páginas', icon: p.icon, title: p.label, sub: 'Abrir página', text: p.label, run: () => go(p.id) }));
  if (canEdit('bookings')) out.push({ group: 'Ações', icon: 'plus', title: 'Novo agendamento', sub: 'Agendar teste ou aula experimental', text: 'novo agendamento teste aula', run: () => { go('bookings'); bookingForm(null, {}); } });
  if (canEdit('athletes')) out.push({ group: 'Ações', icon: 'plus', title: 'Novo atleta', sub: 'Cadastrar atleta', text: 'novo atleta cadastro', run: () => { go('athletes'); athleteForm(null); } });
  if (canView('athletes')) ATHLETES.filter(a => mine.includes(a.teamId)).forEach(a => out.push({ group: 'Atletas', icon: 'users', title: displayName(a.name),
    sub: `${teamOf(a.teamId)?.name || 'Sem equipe'}${a.parentName ? ' · resp. ' + displayName(a.parentName) : ''}${a.active ? '' : ' · inativo'}`,
    text: `${a.name} ${a.parentName}`, digits: [a.phone, a.parentPhone, a.cpf].map(digits).join(' '), rank: a.active ? 0 : 1, run: () => { go('athletes'); athleteForm(a.id); } }));
  if (canView('bookings')) BOOKINGS.filter(b => mine.includes(b.teamId)).forEach(b => out.push({ group: 'Agendamentos', icon: 'calendar', title: bookingName(b),
    sub: `${fmtDT(b.date)} · ${teamOf(b.teamId)?.name || ''} · ${b.status}${b.archived ? ' · arquivado' : ''}`,
    text: `${b.nome} ${b.nomeMenor}`, digits: digits(b.whatsapp), rank: b.archived ? 1 : 0, run: () => { go('bookings'); openBooking(b.id); } }));
  if (canView('teams')) TEAMS.filter(t => mine.includes(t.id)).forEach(t => out.push({ group: 'Equipes', icon: 'pin', title: t.name,
    sub: `${nucleusLabel(nucleusOf(t.n)?.name)}${t.active ? '' : ' · inativa'}`, text: `${t.name} ${t.category || ''}`, rank: t.active ? 0 : 1, run: () => { go('teams'); teamEditor(t.id); } }));
  return out;
}
function cmdkSearch(q) {
  const all = cmdkSources(), n = cmdkNorm(q), d = digits(q), words = n.split(' ').filter(Boolean);
  if (!n) return all.filter(x => x.group === 'Ações' || x.group === 'Páginas').slice(0, 14);
  const score = x => {
    const t = cmdkNorm(x.text), title = cmdkNorm(x.title);
    if (d.length >= 4 && x.digits && x.digits.includes(d)) return 1;
    if (!words.every(w => t.includes(w))) return -1;
    return title.startsWith(n) ? 3 : title.split(' ').some(p => p.startsWith(words[0])) ? 2 : 1;
  };
  const order = ['Ações', 'Páginas', 'Atletas', 'Agendamentos', 'Equipes'];
  const hits = all.map(x => ({ x, s: score(x) })).filter(h => h.s > 0)
    .sort((a, b) => order.indexOf(a.x.group) - order.indexOf(b.x.group) || b.s - a.s || (a.x.rank || 0) - (b.x.rank || 0) || a.x.title.localeCompare(b.x.title, 'pt-BR'));
  const per = {};
  return hits.filter(h => (per[h.x.group] = (per[h.x.group] || 0) + 1) <= (h.x.group === 'Páginas' ? 4 : 6)).map(h => h.x);
}
function cmdkDraw() {
  const list = $('#cmdkList'), q = $('#cmdkInput').value;
  CMDK.items = cmdkSearch(q); CMDK.active = Math.min(CMDK.active, Math.max(0, CMDK.items.length - 1));
  let group = '';
  list.innerHTML = CMDK.items.map((x, i) => {
    const head = x.group !== group ? `<li class="cmdk-group" role="presentation">${(group = x.group)}</li>` : '';
    return `${head}<li role="option" id="cmdk-${i}" class="cmdk-item ${i === CMDK.active ? 'on' : ''}" aria-selected="${i === CMDK.active}" data-i="${i}">${icon(x.icon)}<span><b>${esc(x.title)}</b><small>${esc(x.sub)}</small></span>${i === CMDK.active ? '<kbd>Enter</kbd>' : ''}</li>`;
  }).join('') || `<li class="cmdk-empty">Nada encontrado para “${esc(q)}”. Tente parte do nome, do responsável ou do telefone.</li>`;
  $('#cmdkInput').setAttribute('aria-activedescendant', CMDK.items.length ? `cmdk-${CMDK.active}` : '');
  list.querySelector('.cmdk-item.on')?.scrollIntoView({ block: 'nearest' });
}
function cmdkRun(i) {
  const x = CMDK.items[i]; if (!x) return;
  $('#cmdk').close(); x.run();
}
function cmdkOpen() {
  if (!LIVE.ready) return;
  let d = $('#cmdk');
  if (!d) {
    document.body.insertAdjacentHTML('beforeend', `<dialog id="cmdk" class="cmdk" aria-label="Buscar no Huddle"><div class="cmdk-box">
      <div class="cmdk-search">${icon('search')}<input id="cmdkInput" type="search" autocomplete="off" spellcheck="false" placeholder="Buscar atleta, responsável, telefone, agendamento ou equipe" role="combobox" aria-expanded="true" aria-controls="cmdkList" aria-autocomplete="list"><kbd>Esc</kbd></div>
      <ul id="cmdkList" class="cmdk-list" role="listbox" aria-label="Resultados"></ul>
      <div class="cmdk-foot"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Ctrl</kbd><kbd>K</kbd> de qualquer tela</span></div></div></dialog>`);
    d = $('#cmdk');
    $('#cmdkInput').addEventListener('input', () => { CMDK.active = 0; cmdkDraw(); });
    $('#cmdkInput').addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = CMDK.items.length; if (n) { CMDK.active = (CMDK.active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n; cmdkDraw(); } }
      if (e.key === 'Enter') { e.preventDefault(); cmdkRun(CMDK.active); }
    });
    $('#cmdkList').addEventListener('click', e => { const li = e.target.closest('[data-i]'); if (li) cmdkRun(Number(li.dataset.i)); });
    $('#cmdkList').addEventListener('mousemove', e => { const li = e.target.closest('[data-i]'); if (li && Number(li.dataset.i) !== CMDK.active) { CMDK.active = Number(li.dataset.i); cmdkDraw(); } });
    d.addEventListener('click', e => { if (e.target === d) d.close(); });
  }
  if (d.open) return;
  $('#cmdkInput').value = ''; CMDK.active = 0; cmdkDraw();
  d.showModal(); $('#cmdkInput').focus();
}
document.addEventListener('keydown', e => {
  const typing = e.target.closest?.('input, textarea, select, [contenteditable="true"]');
  if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing && !document.querySelector('dialog[open]'))) {
    if (!document.body.classList.contains('app-ready')) return;
    e.preventDefault(); cmdkOpen();
  }
});
// Botão na barra superior, em todas as páginas
(() => {
  const top = $('.topbar .top-right');
  if (top && !top.querySelector('.cmdk-trigger')) top.insertAdjacentHTML('afterbegin', `<button class="btn sm cmdk-trigger" type="button" data-act="cmdk" aria-label="Buscar no Huddle (Ctrl K)">${icon('search')}<span>Buscar</span><kbd>Ctrl K</kbd></button>`);
})();
