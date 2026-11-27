/* Apollo · Rematrícula 2027 — formulário público (rematricula.html)
   Toda leitura e gravação passa pelas funções reenroll_* do Supabase (migração 049).
   Nada é guardado no aparelho além do token da sessão (sessionStorage, some ao fechar a aba). */
'use strict';

const SB_URL = 'https://hrakdydodcmllwnkmrkg.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyYWtkeWRvZGNtbGx3bmttcmtnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MDEwNTAsImV4cCI6MjA5MTA3NzA1MH0.LFDcJNf2_uWzmj6zRyc7xUSww7G7mIpgta-1ro4oPFc';
const SESSION_KEY = 'apollo-rematricula-2027';

const STEPS = [
  { id: 'cadastro', title: 'Dados cadastrais' },
  { id: 'endereco', title: 'Endereço' },
  { id: 'saude', title: 'Saúde (anamnese)' },
  { id: 'equipe', title: 'Turma em 2027' },
  { id: 'termos', title: 'Contrato e autorizações' },
  { id: 'pagamento', title: 'Taxa de rematrícula' },
  { id: 'revisao', title: 'Revisão e conclusão' },
];
const REQUIRED = ['cadastro', 'endereco', 'saude', 'equipe', 'termos', 'pagamento'];
const MISSING_LABEL = { cadastro: 'dados cadastrais', endereco: 'endereço', saude: 'anamnese', equipe: 'turma 2027', termos: 'contrato', pagamento: 'comprovante do Pix' };
const MAX_UPLOAD = 15 * 1024 * 1024;
const RELATIONS = ['Mãe', 'Pai', 'Responsável legal', 'Avó', 'Avô', 'Irmã', 'Irmão', 'Tia', 'Tio', 'Cônjuge', 'Companheiro(a)', 'Filha', 'Filho', 'Amigo(a)', 'Outro parente'];
const DECLINE_REASONS = ['Mudança de cidade', 'Horários ou dias de treino', 'Valor da mensalidade', 'Vai praticar outro esporte ou atividade', 'Saúde ou lesão', 'Insatisfação com o projeto', 'Outro motivo'];

const ST = { token: '', ident: '', data: null, others: 0, athleteId: '', step: 0, drafts: {}, screen: 'ident' };
let sb = null;

/* ─── Utilitários ─── */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const digits = v => String(v || '').replace(/\D/g, '');
const firstName = n => String(n || '').trim().split(/\s+/)[0] || '';
// "joão DA silva" → "João da Silva" (mesma regra de private.reenroll_title no banco)
const PARTICLES = ['da', 'de', 'do', 'das', 'dos', 'e', 'di', 'du', 'del', 'la'];
const titleName = n => String(n || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean).map((w, i) => {
  if (i > 0 && PARTICLES.includes(w.toLowerCase())) return w.toLowerCase();
  return w.split('-').map(p => /^d['’]./i.test(p) ? 'd' + p[1] + p.charAt(2).toUpperCase() + p.slice(3).toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('-');
}).join(' ');
// Nome completo: só letras, ao menos nome e sobrenome (mesma regra de private.reenroll_name_ok)
const nameOk = n => { const v = String(n || '').trim().replace(/\s+/g, ' '); return /^[A-Za-zÀ-ÖØ-öø-ÿ'’-]+( [A-Za-zÀ-ÖØ-öø-ÿ'’-]+)+$/.test(v) && v.split(' ').filter(w => w.length >= 2 && !['da', 'de', 'do', 'das', 'dos', 'e'].includes(w.toLowerCase())).length >= 2; };
const initials = n => String(n || '').trim().split(/\s+/).filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase();
const isoToBr = iso => /^\d{4}-\d{2}-\d{2}/.test(iso || '') ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '';
const brToIso = br => { const m = String(br || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (!m) return ''; const d = new Date(+m[3], +m[2] - 1, +m[1]); return d.getFullYear() === +m[3] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[1] ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
const fmtDate = ts => ts ? new Date(ts).toLocaleDateString('pt-BR') : '';
const icon = name => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${{
  check: '<path d="M20 6L9 17l-5-5"/>', arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>', back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>', alert: '<path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>', doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>', heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>', clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>', x: '<path d="M18 6L6 18M6 6l12 12"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>', ball: '<circle cx="12" cy="12" r="10"/><path d="M12 2a15 15 0 0 1 4 10M2.5 9.5a15 15 0 0 1 13.5 2.5M5 19a15 15 0 0 1 7-7M21.5 14.5A15 15 0 0 1 8 12"/>',
}[name] || ''}</svg>`;

function cpfOk(v) {
  const d = digits(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = n => { let s = 0; for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return calc(9) === +d[9] && calc(10) === +d[10];
}
function phoneNorm(v) {
  let d = digits(v);
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if (d.length === 10 && /[6-9]/.test(d[2])) d = d.slice(0, 2) + '9' + d.slice(2);
  return d.length === 11 && d[2] === '9' ? d : '';
}
const fmtCpf = v => { const d = digits(v).slice(0, 11); return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'); };
// Telefone sempre (XX) XXXXXXXXX
const fmtPhone = v => { const d = digits(v).slice(0, 11); return d.length <= 2 ? d : `(${d.slice(0, 2)}) ${d.slice(2)}`; };
const fmtDateMask = v => { const d = digits(v).slice(0, 8); return d.replace(/(\d{2})(\d)/, '$1/$2').replace(/(\d{2})\/(\d{2})(\d)/, '$1/$2/$3'); };
const fmtCep = v => { const d = digits(v).slice(0, 8); return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; };
const emailOk = v => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v || '').trim());
const MASKS = { cpf: fmtCpf, phone: fmtPhone, date: fmtDateMask, cep: fmtCep };
// Igualdade usada para saber se o valor pré-preenchido foi alterado
function same(kind, a, b) {
  if (kind === 'cpf' || kind === 'date') return digits(a) === digits(b);
  if (kind === 'phone') return (phoneNorm(a) || digits(a)) === (phoneNorm(b) || digits(b));
  if (kind === 'email' || kind === 'name') return String(a || '').trim().replace(/\s+/g, ' ').toLowerCase() === String(b || '').trim().replace(/\s+/g, ' ').toLowerCase();
  return String(a || '').trim().replace(/\s+/g, ' ') === String(b || '').trim().replace(/\s+/g, ' ');
}

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 3200);
}
function setBusy(btn, busy) { if (btn) { btn.classList.toggle('busy', busy); btn.disabled = busy; } }
function showAlert(msg, where = '#formAlert') {
  const el = $(where) || $('#app .alert-slot');
  if (!el) return toast(msg);
  el.innerHTML = msg ? `<div class="alert" role="alert">${icon('alert')}<div>${esc(msg)}</div></div>` : '';
  if (msg) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function friendlyError(e) {
  const m = String(e?.message || e || '');
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sem conexão com a internet. Confira o sinal e tente de novo. O que já foi salvo continua salvo.';
  return m || 'Algo deu errado. Tente de novo em instantes.';
}
function saveSession() { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: ST.token, ident: ST.ident })); } catch (e) { /* modo privado */ } }
function clearSession() {
  ST.token = ''; ST.data = null; ST.ident = ''; ST.drafts = {}; ST.athleteId = ''; ST.others = 0;
  try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* modo privado */ }
}

async function rpc(fn, args) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) {
    if (error.hint === 'session') { clearSession(); renderIdent('Sua sessão expirou por segurança. Identifique-se de novo: o que já foi salvo continua salvo.'); throw Object.assign(new Error('session'), { handled: true }); }
    throw new Error(error.message);
  }
  return data;
}
async function reload() { ST.data = await rpc('reenroll_get', { p_token: ST.token }); return ST.data; }
const athlete = () => ST.data?.athletes.find(a => a.id === ST.athleteId);
const reen = a => a?.reenrollment || {};
const stepsDone = a => reen(a).steps || {};
// O aceite precisa ser da versão atual do contrato (mesma regra de private.reenroll_missing)
const missingOf = a => REQUIRED.filter(s => !stepsDone(a)[s] || (s === 'termos' && reen(a).contract_version !== ST.data?.contract) || (s === 'equipe' && !reen(a).offer_key));
const teamName = id => ST.data?.teams.find(t => t.id === id)?.name || '';
const respondentName = () => { const a = ST.data?.athletes[0]; return a ? (a.minor ? a.data.parent_name : a.data.full_name) : ''; };

/* ─── Estrutura de tela ─── */
function setScreen(name, { progress = null, actions = '', exit = true, push = true } = {}) {
  ST.screen = name;
  $('#exitBtn').hidden = !exit || !ST.token;
  const p = $('#progress');
  if (progress) {
    p.hidden = false;
    $('#progressTitle').textContent = progress.title;
    $('#progressCount').textContent = progress.count;
    $('#progressBar i').style.width = progress.pct + '%';
    $('#progressBar').setAttribute('aria-valuenow', String(Math.round(progress.pct)));
  } else p.hidden = true;
  $('#actions').hidden = !actions;
  $('#actionsIn').innerHTML = actions;
  if (push) history.pushState({ screen: name, athleteId: ST.athleteId, step: ST.step }, '');
  window.scrollTo(0, 0);
  $('#app').focus({ preventScroll: true });
}
window.addEventListener('popstate', e => {
  const s = e.state;
  if (!ST.token || !ST.data) return renderIdent('', false);
  if (!s || s.screen === 'ident' || s.screen === 'hub') return renderHub(false);
  if (s.screen === 'step' && s.athleteId) { ST.athleteId = s.athleteId; ST.step = s.step; return renderStep(false); }
  renderHub(false);
});

/* ─── 1. Identificação ─── */
function renderIdent(message = '', push = true) {
  $('#app').innerHTML = `<section class="screen">
    <div class="eyebrow">Temporada 2027</div>
    <h1>Vamos renovar a matrícula?</h1>
    <p class="lead">Revise o cadastro, responda a anamnese, escolha a turma, aceite o contrato e pague a taxa por Pix. Leva cerca de 10 minutos.</p>
    <div class="alert-slot" id="formAlert">${message ? `<div class="alert" role="alert">${icon('alert')}<div>${esc(message)}</div></div>` : ''}</div>
    <div class="card">
      <h3>Tenha em mãos</h3>
      <ul class="checklist">
        <li>${icon('pin')}<span><b>Endereço com CEP</b>: ele precisa ser preenchido de novo</span></li>
        <li>${icon('heart')}<span><b>Informações de saúde</b>: a anamnese é respondida a cada ano</span></li>
        <li>${icon('file')}<span><b>Pix de R$ 40,00</b> da taxa de rematrícula e o comprovante (foto ou print)</span></li>
      </ul>
    </div>
    <form class="card" id="identForm" novalidate>
      <div class="card-head"><div><h2>Identificação</h2><p>Se o(a) atleta for menor de idade, use os dados do(a) responsável.</p></div></div>
      <div class="fld" data-f="ident">
        <label for="ident">CPF ou WhatsApp</label>
        <input class="in" id="ident" name="ident" inputmode="numeric" autocomplete="off" placeholder="Somente números" value="${esc(ST.ident)}" required>
        <span class="hint">Do(a) atleta ou do(a) responsável cadastrado(a).</span>
        <span class="err">Informe um CPF ou WhatsApp com DDD.</span>
      </div>
      <div class="fld" data-f="birth">
        <label for="birth">Data de nascimento do(a) atleta</label>
        <input class="in" id="birth" name="birth" inputmode="numeric" autocomplete="off" placeholder="DD/MM/AAAA" maxlength="10" data-mask="date" required>
        <span class="err">Informe a data no formato DD/MM/AAAA.</span>
      </div>
      <button type="submit" class="sr" tabindex="-1">Continuar</button>
    </form>
    <p class="lock-note">${icon('lock')} Conexão protegida. Usamos esses dados só para confirmar sua identidade.</p>
    <p class="foot">Dúvidas? Fale com a secretaria pelo WhatsApp oficial da Apollo.<br><a href="contrato-2027.html" target="_blank" rel="noopener">Contrato 2027</a> · <a href="regulamento-2027.html" target="_blank" rel="noopener">Regulamento do Atleta 2027</a></p>
  </section>`;
  setScreen('ident', { exit: false, push, actions: `<button class="btn primary block" type="button" id="identGo">Continuar ${icon('arrow')}</button>` });
  bindMasks();
  const ident = $('#ident');
  ident.addEventListener('blur', () => { const d = digits(ident.value); if (d.length === 11 && cpfOk(d)) ident.value = fmtCpf(d); else if (phoneNorm(d)) ident.value = fmtPhone(phoneNorm(d)); });
  const go = () => submitIdent($('#identGo'));
  $('#identGo').onclick = go;
  $('#identForm').onsubmit = e => { e.preventDefault(); go(); };
}
async function submitIdent(btn) {
  const ident = $('#ident').value, birthIso = brToIso($('#birth').value);
  const d = digits(ident);
  const identOk = (d.length === 11 && cpfOk(d)) || !!phoneNorm(d);
  markErr('ident', !identOk); markErr('birth', !birthIso);
  if (!identOk || !birthIso) return focusFirstError();
  setBusy(btn, true); showAlert('');
  try {
    const r = await rpc('reenroll_start', { p_identifier: ident, p_birth: birthIso, p_session: ST.token || null });
    if (!r.ok) return showAlert(r.error);
    ST.token = r.token; ST.ident = ident; ST.others = r.others || 0; saveSession();
    await reload();
    renderHub();
  } catch (e) { if (!e.handled) showAlert(friendlyError(e)); }
  finally { setBusy(btn, false); }
}

/* ─── 2. Atletas da sessão ─── */
function renderHub(push = true) {
  const ath = ST.data.athletes;
  const who = firstName(titleName(respondentName()));
  $('#app').innerHTML = `<section class="screen">
    <div class="eyebrow">Rematrícula 2027</div>
    <h1>Olá${who ? ', ' + esc(who) : ''}!</h1>
    <p class="lead">${ath.length > 1 ? 'Escolha o(a) atleta para continuar.' : 'Confirme se vocês vão seguir com a Apollo em 2027.'}</p>
    <div class="alert-slot" id="formAlert"></div>
    ${ath.map(hubCard).join('')}
    ${ST.others > 0 ? `<form class="card" id="sibForm" novalidate>
      <div class="card-head">${icon('users')}<div><h2>Mais um(a) atleta?</h2><p>Encontramos ${ST.others === 1 ? 'outro(a) atleta' : ST.others + ' atletas'} com este contato. Informe a data de nascimento para incluir.</p></div></div>
      <div class="fld" data-f="sibBirth"><label for="sibBirth">Data de nascimento</label>
        <input class="in" id="sibBirth" inputmode="numeric" placeholder="DD/MM/AAAA" maxlength="10" data-mask="date">
        <span class="err">Informe a data no formato DD/MM/AAAA.</span></div>
      <button class="btn dark block" type="submit" id="sibGo">Incluir atleta</button>
    </form>` : ''}
    <p class="foot">Dúvidas? Fale com a secretaria pelo WhatsApp oficial da Apollo.<br><a href="contrato-2027.html" target="_blank" rel="noopener">Contrato 2027</a> · <a href="regulamento-2027.html" target="_blank" rel="noopener">Regulamento do Atleta 2027</a></p>
  </section>`;
  setScreen('hub', { push });
  bindMasks();
  $$('[data-go]').forEach(b => b.onclick = () => { ST.athleteId = b.dataset.id; ST.step = firstOpenStep(athlete()); renderStep(); });
  $$('[data-decline]').forEach(b => b.onclick = () => { ST.athleteId = b.dataset.id; renderDecline(); });
  $$('[data-fee]').forEach(b => b.onclick = () => { ST.athleteId = b.dataset.id; ST.step = STEPS.findIndex(s => s.id === 'pagamento'); renderStep(); });
  $$('[data-reopen]').forEach(b => b.onclick = async () => {
    setBusy(b, true);
    try { await rpc('reenroll_reopen', { p_token: ST.token, p_athlete: b.dataset.id }); await reload(); renderHub(); toast('Rematrícula reaberta.'); }
    catch (e) { if (!e.handled) showAlert(friendlyError(e)); } finally { setBusy(b, false); }
  });
  const sib = $('#sibForm');
  if (sib) sib.onsubmit = async e => {
    e.preventDefault();
    const iso = brToIso($('#sibBirth').value); markErr('sibBirth', !iso); if (!iso) return;
    const btn = $('#sibGo'); setBusy(btn, true);
    try {
      const r = await rpc('reenroll_start', { p_identifier: ST.ident, p_birth: iso, p_session: ST.token });
      if (!r.ok) return showAlert(r.error);
      ST.token = r.token; ST.others = r.others || 0; saveSession(); await reload(); renderHub(); toast('Atleta incluído(a).');
    } catch (err) { if (!err.handled) showAlert(friendlyError(err)); } finally { setBusy(btn, false); }
  };
}
function hubCard(a) {
  const r = reen(a), done = stepsDone(a), miss = missingOf(a);
  const nDone = REQUIRED.length - miss.length;
  const name = titleName(a.data.full_name);
  let body;
  const fee = r.fee || {}, o = offerOf(r.offer_key);
  const turma = `Turma 2027: <b>${esc(o?.label || teamName(r.team_2027_id))}</b>${r.team_2027_id && r.team_2027_id !== a.team?.id ? ' (mudança em análise pela coordenação)' : ''}`;
  if (r.status === 'concluida' && fee.status === 'recusado') body = `<div class="state no">${icon('alert')}<div><b>Comprovante do Pix recusado</b>${fee.note ? `: ${esc(fee.note)}` : ''}.<br>Envie um novo comprovante para confirmar.</div></div>
    <div class="ath-actions"><button class="btn primary block" type="button" data-fee data-id="${a.id}">Enviar novo comprovante ${icon('arrow')}</button></div>`;
  else if (r.status === 'concluida' && fee.status === 'aprovado') body = `<div class="state ok">${icon('check')}<div><b>Rematrícula confirmada</b>.<br>${turma}</div></div>`;
  else if (r.status === 'concluida') body = `<div class="state ok">${icon('clock')}<div><b>Rematrícula enviada</b> em ${fmtDate(r.completed_at)}. Aguardando a validação do comprovante do Pix.<br>${turma}</div></div>`;
  else if (r.status === 'declinada') body = `<div class="state no">${icon('info')}<div>Vocês informaram em ${fmtDate(r.declined_at)} que <b>não vão continuar em 2027</b>.</div></div>
    <div class="ath-actions"><button class="btn block" type="button" data-reopen data-id="${a.id}">Mudei de ideia, quero rematricular</button></div>`;
  else body = `<div class="steps-mini" aria-hidden="true">${REQUIRED.map(s => `<i class="${done[s] ? 'on' : ''}"></i>`).join('')}</div>
    <p class="small muted" style="margin:0 0 12px">${nDone ? `${nDone} de ${REQUIRED.length} etapas concluídas. Falta: ${miss.map(m => MISSING_LABEL[m]).join(', ')}.` : 'Nenhuma etapa preenchida ainda.'}</p>
    <div class="ath-actions">
      <button class="btn primary block" type="button" data-go data-id="${a.id}">${nDone ? 'Continuar rematrícula' : 'Sim, vamos continuar'} ${icon('arrow')}</button>
      <button class="btn block" type="button" data-decline data-id="${a.id}">Não vamos continuar em 2027</button>
    </div>`;
  return `<article class="ath"><div class="ath-head"><span class="avatar" aria-hidden="true">${esc(initials(name))}</span><div><b>${esc(name)}</b><small>${esc(a.team?.name || 'Sem equipe')}${a.minor ? ' · menor de idade' : ''}</small></div></div>${body}</article>`;
}
function firstOpenStep(a) {
  const miss = missingOf(a);
  if (!miss.length) return STEPS.length - 1;
  return STEPS.findIndex(s => s.id === miss[0]);
}

/* ─── 3. Etapas ─── */
function draft(step) { const k = ST.athleteId; ST.drafts[k] = ST.drafts[k] || {}; return ST.drafts[k][step] || null; }
function setDraft(step, val) { const k = ST.athleteId; ST.drafts[k] = ST.drafts[k] || {}; ST.drafts[k][step] = val; }

function renderStep(push = true) {
  const a = athlete(); if (!a) return renderHub();
  const s = STEPS[ST.step];
  // Concluída: só volta à etapa do Pix quando o comprovante foi recusado
  const feeRetry = reen(a).status === 'concluida' && reen(a).fee?.status === 'recusado' && s.id === 'pagamento';
  if (reen(a).status === 'concluida' && !feeRetry) return renderDone();
  if (reen(a).status === 'declinada') return renderHub();
  const saved = stepsDone(a)[s.id];
  const body = { cadastro: stepCadastro, endereco: stepEndereco, saude: stepSaude, equipe: stepEquipe, termos: stepTermos, pagamento: stepPagamento, revisao: stepRevisao }[s.id](a);
  const savedNote = saved && !['cadastro', 'equipe', 'termos', 'pagamento', 'revisao'].includes(s.id) && !draft(s.id)
    ? `<div class="section-note">${icon('check')}<div>Esta etapa já foi salva em ${fmtDate(saved)}. Por segurança, as respostas não são exibidas de novo. Preencha novamente só se quiser corrigir, ou toque em <b>Manter e continuar</b>.</div></div>` : '';
  $('#app').innerHTML = `<section class="screen">
    <div class="eyebrow">${esc(titleName(a.data.full_name))}</div>
    <h1>${esc(s.title)}</h1>
    <div id="formAlert"></div>
    ${savedNote}
    <form id="stepForm" novalidate>${body}</form>
  </section>`;
  const isLast = s.id === 'revisao';
  const keep = savedNote ? `<button class="btn" type="button" id="keepGo">Manter e continuar</button>` : '';
  const primary = isLast
    ? `<button class="btn primary" type="button" id="stepGo" ${missingOf(a).length ? 'disabled' : ''}>Concluir rematrícula</button>`
    : s.id === 'pagamento' ? `<button class="btn primary" type="button" id="stepGo">${feeRetry ? 'Voltar' : 'Continuar'} ${icon('arrow')}</button>`
    : s.id === 'termos' ? `<button class="btn primary" type="button" id="stepGo">Aceitar e continuar ${icon('arrow')}</button>`
    : keep ? `<button class="btn primary" type="button" id="stepGo">Salvar</button>` : `<button class="btn primary" type="button" id="stepGo">Salvar e continuar ${icon('arrow')}</button>`;
  setScreen('step', {
    push,
    progress: { title: s.title, count: `Etapa ${ST.step + 1} de ${STEPS.length}`, pct: ((ST.step + 1) / STEPS.length) * 100 },
    actions: `<button class="btn back" type="button" id="stepBack" aria-label="Voltar">${icon('back')}</button>${keep}${primary}`,
  });
  bindMasks();
  ({ cadastro: bindCadastro, endereco: bindEndereco, saude: bindSaude, equipe: bindEquipe, termos: bindTermos, pagamento: bindPagamento, revisao: bindRevisao }[s.id])(a);
  $('#stepBack').onclick = () => { stashDraft(); if (ST.step === 0 || feeRetry) renderHub(); else { ST.step--; renderStep(); } };
  if ($('#keepGo')) $('#keepGo').onclick = () => { ST.step++; renderStep(); };
  $('#stepGo').onclick = () => submitStep($('#stepGo'));
  $('#stepForm').onsubmit = e => { e.preventDefault(); submitStep($('#stepGo')); };
}
function stashDraft() {
  const s = STEPS[ST.step].id;
  if (['endereco', 'saude', 'cadastro'].includes(s) && $('#stepForm')) setDraft(s, formSnapshot());
}
function formSnapshot() {
  const out = {};
  $$('#stepForm input, #stepForm textarea, #stepForm select').forEach(el => {
    if (!el.name) return;
    if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
    else if (el.type === 'checkbox') { out[el.name] = out[el.name] || []; if (el.checked) out[el.name].push(el.value); }
    else out[el.name] = el.value;
  });
  return out;
}
async function submitStep(btn) {
  const a = athlete(), s = STEPS[ST.step].id;
  showAlert('');
  if (s === 'revisao') return finish(btn);
  if (s === 'pagamento') {
    if (reen(a).status === 'concluida') return renderDone();
    if (!reen(a).fee?.name || reen(a).fee?.status === 'recusado') return showAlert('Anexe o comprovante do Pix para continuar.');
    ST.step++; return renderStep();
  }
  setBusy(btn, true);
  const payload = await { cadastro: collectCadastro, endereco: collectEndereco, saude: collectSaude, equipe: collectEquipe, termos: collectTermos }[s](a);
  if (!payload) { setBusy(btn, false); return focusFirstError(); }
  try {
    await rpc('reenroll_save', { p_token: ST.token, p_athlete: a.id, p_step: s, p_data: payload });
    setDraft(s, null);
    await reload();
    ST.step++;
    renderStep();
  } catch (e) { if (!e.handled) showAlert(friendlyError(e)); }
  finally { setBusy(btn, false); }
}

/* Campos */
function markErr(name, bad, msg) {
  const box = document.querySelector(`[data-f="${name}"]`);
  if (!box) return;
  box.classList.toggle('has-err', !!bad);
  const input = box.querySelector('input, textarea, select');
  if (input) input.setAttribute('aria-invalid', bad ? 'true' : 'false');
  if (msg && box.querySelector('.err')) box.querySelector('.err').textContent = msg;
}
function focusFirstError() {
  const box = $('.has-err');
  if (!box) return;
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const el = box.querySelector('input:not([type=checkbox]):not([type=radio]), textarea, select') || box.querySelector('input');
  setTimeout(() => el?.focus({ preventScroll: true }), 250);
}
function bindMasks() {
  $$('[data-mask]').forEach(el => {
    const fmt = MASKS[el.dataset.mask];
    el.addEventListener('input', () => { const end = el.selectionStart === el.value.length; el.value = fmt(el.value); if (end) el.setSelectionRange(el.value.length, el.value.length); });
  });
}
const yes = () => icon('check');
// Ao mexer num campo com erro, o aviso some (a validação roda de novo ao salvar)
function clearFieldError(e) {
  const box = e.target.closest?.('[data-f]');
  if (!box || !box.classList.contains('has-err')) return;
  if (box.classList.contains('pf') && !box.classList.contains('is-changed') && !box.querySelector('input[name="__ok"]')?.checked) return;
  box.classList.remove('has-err');
  box.querySelectorAll('[aria-invalid]').forEach(el => el.setAttribute('aria-invalid', 'false'));
}
document.addEventListener('input', clearFieldError);
document.addEventListener('change', clearFieldError);

/* Dados cadastrais */
function cadastroFields(a) {
  const d = a.data, m = a.minor;
  // Menores: o WhatsApp cadastrado pelo chatbot costuma ser do responsável
  const parentPhone = d.parent_phone || (m ? d.phone : '');
  const atleta = [
    { k: 'full_name', label: 'Nome completo do(a) atleta', v: titleName(d.full_name), req: true, ac: 'name', kind: 'name', hint: 'Nome e sobrenome, sem abreviar. Ex.: Ana Maria da Silva' },
    { k: 'cpf', label: 'CPF do(a) atleta', v: d.cpf, req: !m, kind: 'cpf', mask: 'cpf', im: 'numeric', hint: m ? 'Se a criança ainda não tem CPF, deixe em branco: vale o do(a) responsável.' : '' },
    { k: 'rg', label: 'RG do(a) atleta', v: d.rg, req: !m, kind: 'rg', hint: m ? 'Se ainda não tem RG, deixe em branco.' : '' },
    { k: 'birth_date', label: 'Data de nascimento', v: isoToBr(d.birth_date), req: true, kind: 'date', mask: 'date', im: 'numeric', ph: 'DD/MM/AAAA' },
    { k: 'phone', label: m ? 'WhatsApp do(a) atleta' : 'WhatsApp', v: m && d.phone && same('phone', d.phone, parentPhone) && !d.parent_phone ? '' : d.phone, req: !m, kind: 'phone', mask: 'phone', im: 'tel', ac: 'tel' },
    { k: 'email', label: m ? 'E-mail para contato' : 'E-mail', v: d.email, req: true, kind: 'email', im: 'email', ac: 'email', type: 'email' },
  ];
  const resp = m ? [
    { k: 'parent_name', label: 'Nome completo do(a) responsável', v: titleName(d.parent_name), req: true, kind: 'name', hint: 'Quem assina o contrato. Nome e sobrenome, sem abreviar.' },
    { k: 'parent_cpf', label: 'CPF do(a) responsável', v: d.parent_cpf, req: true, kind: 'cpf', mask: 'cpf', im: 'numeric' },
    { k: 'parent_rg', label: 'RG do(a) responsável', v: d.parent_rg, req: false, kind: 'rg' },
    { k: 'parent_phone', label: 'WhatsApp do(a) responsável', v: parentPhone, req: true, kind: 'phone', mask: 'phone', im: 'tel', ac: 'tel', ph: '(41) 999999999' },
    { k: 'parent_email', label: 'E-mail do(a) responsável', v: d.parent_email, req: false, kind: 'email', im: 'email', type: 'email' },
  ] : [];
  // Contato de emergência em três campos: o banco grava "Nome Sobrenome (parentesco) - (41) 999999999"
  const emerg = [
    { k: 'emergency_name', label: 'Nome do contato', req: true, kind: 'ename', ac: 'off' },
    { k: 'emergency_relation', label: 'Parentesco ou relação', req: true, kind: 'select', opts: RELATIONS },
    { k: 'emergency_phone', label: 'Telefone do contato', req: true, kind: 'phone', mask: 'phone', im: 'tel', ph: '(41) 999999999' },
  ];
  return { atleta, resp, emerg };
}
// Campo de nome: ao sair, ajusta para "Nome Sobrenome"
function bindNames() {
  $$('[data-kind="name"] .in, [data-f="emergency_name"] .in').forEach(el => el.addEventListener('blur', () => {
    const t = titleName(el.value); if (t !== el.value) { el.value = t; el.dispatchEvent(new Event('input', { bubbles: true })); }
  }));
}
function fieldHtml(f, dr) {
  if (f.kind === 'select') {
    const val = dr?.[f.k] || '';
    return `<div class="fld" data-f="${f.k}"><label for="f_${f.k}">${esc(f.label)}</label>
      <select class="in" id="f_${f.k}" name="${f.k}"><option value="">Escolha</option>${f.opts.map(o => `<option ${o.toLowerCase() === String(val).toLowerCase() ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>
      <span class="err">Escolha uma opção.</span></div>`;
  }
  const val = dr && dr[f.k] !== undefined ? dr[f.k] : f.v || '';
  const attrs = `id="f_${f.k}" name="${f.k}" ${f.im ? `inputmode="${f.im}"` : ''} ${f.ac ? `autocomplete="${f.ac}"` : 'autocomplete="off"'} ${f.mask ? `data-mask="${f.mask}"` : ''} ${f.ph ? `placeholder="${f.ph}"` : ''} type="${f.type || 'text'}"`;
  const req = f.req ? '' : ' <span class="opt">(opcional)</span>';
  if (f.v) {
    const changed = !same(f.kind, val, f.v);
    const ok = !changed && dr && (dr.__ok || []).includes(f.k);
    return `<div class="pf ${changed ? 'is-changed' : ok ? 'is-ok' : ''}" data-f="${f.k}" data-orig="${esc(f.v)}" data-kind="${f.kind || 'text'}">
      <label class="lbl" for="f_${f.k}">${esc(f.label)}${req}</label>
      <input class="in" ${attrs} value="${esc(val)}">
      ${f.hint ? `<span class="hint small muted">${esc(f.hint)}</span>` : ''}
      <div class="pf-foot">
        <label class="confirm"><input type="checkbox" name="__ok" value="${f.k}" ${ok ? 'checked' : ''}><span class="box">${yes()}</span><span>Está correto</span></label>
        <span class="changed">${icon('edit')} Alterado</span>
        <button class="undo" type="button" data-undo="${f.k}" ${changed ? '' : 'hidden'}>Desfazer</button>
      </div>
      <span class="err">Confirme que está correto ou corrija o dado.</span>
    </div>`;
  }
  return `<div class="fld" data-f="${f.k}" data-kind="${f.kind || 'text'}"><label for="f_${f.k}">${esc(f.label)}${req}</label>
    <input class="in" ${attrs} value="${esc(val)}">
    ${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ''}
    <span class="err">Preencha este campo.</span></div>`;
}
function stepCadastro(a) {
  const { atleta, resp, emerg } = cadastroFields(a);
  // Volta à etapa: mostra o que foi revisado nesta visita ou já salvo nesta rematrícula
  const sv = reen(a).cadastro;
  const dr = draft('cadastro') || (sv ? { ...sv, birth_date: isoToBr(sv.birth_date), __ok: reen(a).confirmed || [] } : null);
  const oldEm = a.data.emergency_contact && !sv ? `<p class="small muted" style="margin:-4px 0 12px">No cadastro anterior: <b>${esc(a.data.emergency_contact)}</b></p>` : '';
  return `<p class="lead">Confira cada dado. Se estiver certo, marque <b>Está correto</b>. Se algo mudou, é só corrigir no próprio campo.</p>
    <div class="card"><div class="card-head"><div><h2>Atleta</h2></div></div>${atleta.map(f => fieldHtml(f, dr)).join('')}</div>
    ${resp.length ? `<div class="card"><div class="card-head"><div><h2>Responsável legal</h2><p>Quem responde pelo(a) atleta menor de idade e assina o contrato.</p></div></div>${resp.map(f => fieldHtml(f, dr)).join('')}</div>` : ''}
    <div class="card"><div class="card-head"><div><h2>Contato de emergência</h2><p>Quem avisamos se algo acontecer durante o treino${a.minor ? '' : ' (outra pessoa, não você)'}.</p></div></div>${oldEm}${emerg.map(f => fieldHtml(f, dr)).join('')}</div>`;
}
function bindCadastro() {
  $$('.pf').forEach(pf => {
    const input = pf.querySelector('.in'), box = pf.querySelector('input[name="__ok"]'), undo = pf.querySelector('[data-undo]');
    const sync = () => {
      const changed = !same(pf.dataset.kind, input.value, pf.dataset.orig);
      pf.classList.toggle('is-changed', changed);
      pf.classList.toggle('is-ok', !changed && box.checked);
      undo.hidden = !changed;
      if (changed) box.checked = false;
    };
    input.addEventListener('input', sync);
    box.addEventListener('change', sync);
    undo.onclick = () => { input.value = pf.dataset.orig; sync(); input.focus(); };
  });
  $$('#stepForm .fld .in').forEach(el => el.addEventListener('input', () => el.closest('.fld').classList.remove('has-err')));
  $$('#stepForm select.in').forEach(el => el.addEventListener('change', () => el.closest('.fld').classList.remove('has-err')));
  bindNames();
}
function collectCadastro(a) {
  const { atleta, resp, emerg } = cadastroFields(a);
  const all = [...atleta, ...resp, ...emerg];
  const fields = {}, confirmed = [];
  let bad = 0;
  for (const f of all) {
    const el = $(`#f_${f.k}`), box = el.closest('[data-f]');
    if (f.kind === 'name' || f.kind === 'ename') el.value = titleName(el.value);
    if (f.kind === 'phone' && phoneNorm(el.value)) el.value = fmtPhone(phoneNorm(el.value));
    const v = el.value.trim();
    let msg = '';
    if (!v && f.req) msg = f.kind === 'select' ? 'Escolha uma opção.' : 'Preencha este campo.';
    else if (v && f.kind === 'name' && !nameOk(v)) msg = 'Escreva nome e sobrenome completos, só com letras (sem números ou símbolos).';
    else if (v && f.kind === 'ename' && !/^[A-Za-zÀ-ÖØ-öø-ÿ'’ -]+$/.test(v)) msg = 'Use só letras no nome.';
    else if (v && f.kind === 'cpf' && !cpfOk(v)) msg = 'CPF inválido. Confira os números.';
    else if (v && f.kind === 'phone' && !phoneNorm(v)) msg = 'Informe o celular com DDD e 9 dígitos. Ex.: (41) 999999999';
    else if (v && f.kind === 'email' && !emailOk(v)) msg = 'E-mail inválido.';
    else if (v && f.kind === 'date' && !brToIso(v)) msg = 'Data inválida. Use DD/MM/AAAA.';
    else if (f.v && v && same(f.kind, v, f.v) && !box.querySelector('input[name="__ok"]')?.checked) msg = 'Marque “Está correto” ou corrija o dado.';
    if (!msg && f.k === 'cpf' && a.minor && v && digits(v) === digits($('#f_parent_cpf')?.value)) msg = 'O CPF do(a) atleta não pode ser igual ao do(a) responsável.';
    markErr(f.k, !!msg, msg || undefined);
    if (msg) { bad++; continue; }
    fields[f.k] = f.kind === 'date' ? brToIso(v) : v;
    if (f.v && box.querySelector('input[name="__ok"]')?.checked) confirmed.push(f.k);
  }
  if (bad) { showAlert(bad === 1 ? 'Falta 1 item para revisar.' : `Faltam ${bad} itens para revisar.`); return null; }
  return { fields, confirmed };
}

/* Endereço */
function stepEndereco() {
  const d = draft('endereco') || {};
  const f = (k, label, extra = '', req = true) => `<div class="fld" data-f="${k}"><label for="a_${k}">${label}${req ? '' : ' <span class="opt">(opcional)</span>'}</label><input class="in" id="a_${k}" name="${k}" value="${esc(d[k] || '')}" ${extra}><span class="err">Preencha este campo.</span></div>`;
  return `<div class="section-note">${icon('info')}<div>Por segurança, o endereço precisa ser escrito de novo, mesmo que não tenha mudado.</div></div>
    <div class="card">
      ${f('cep', 'CEP', 'inputmode="numeric" autocomplete="postal-code" data-mask="cep" placeholder="00000-000" maxlength="9" style="max-width:200px"')}
      <p class="small muted" id="cepState" aria-live="polite" style="margin:-8px 0 12px">Digite o CEP para preencher rua, bairro e cidade.</p>
      ${f('rua', 'Logradouro (rua, avenida, travessa…)', 'autocomplete="address-line1" placeholder="Ex.: Rua das Flores"')}
      <div class="row2">
        <div class="fld" data-f="numero"><label for="a_numero">Número</label><input class="in" id="a_numero" name="numero" value="${esc(d.numero || '')}" placeholder="Ex.: 120" maxlength="7" autocomplete="off">
          <label class="sn"><input type="checkbox" id="a_sn" ${String(d.numero || '').toUpperCase() === 'S/N' ? 'checked' : ''}> Sem número (S/N)</label>
          <span class="err">Informe o número ou marque “Sem número”.</span></div>
        ${f('complemento', 'Complemento', 'placeholder="Apto, bloco, casa" maxlength="60"', false)}
      </div>
      ${f('bairro', 'Bairro')}
      <div class="row2">${f('cidade', 'Cidade', 'autocomplete="address-level2"')}${f('uf', 'Estado (UF)', 'maxlength="2" autocomplete="address-level1" style="text-transform:uppercase"')}</div>
    </div>`;
}
// "120", "120A" ou "S/N" (mesma regra do banco)
const numeroNorm = v => { const s = String(v || '').toUpperCase().replace(/\s+/g, ''); return ['SN', 'S/N', 'S.N', 'S.N.'].includes(s) ? 'S/N' : s; };
function bindEndereco() {
  const cep = $('#a_cep'), state = $('#cepState');
  let last = '';
  cep.addEventListener('input', async () => {
    const d = digits(cep.value);
    if (d.length !== 8 || d === last) return;
    last = d; state.textContent = 'Buscando o endereço…';
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`).then(x => x.json());
      if (r.erro) { state.textContent = 'CEP não encontrado. Preencha o endereço abaixo.'; return; }
      const set = (k, v) => { if (v && !$('#a_' + k).value) $('#a_' + k).value = v; };
      set('rua', r.logradouro); set('bairro', r.bairro); set('cidade', r.localidade); set('uf', r.uf);
      state.textContent = 'Endereço encontrado. Confira e informe o número.';
      $(r.logradouro ? '#a_numero' : '#a_rua').focus();
    } catch (e) { state.textContent = 'Não foi possível buscar o CEP. Preencha o endereço abaixo.'; }
  });
  $$('#stepForm .in').forEach(el => el.addEventListener('input', () => el.closest('.fld').classList.remove('has-err')));
  const num = $('#a_numero'), sn = $('#a_sn');
  const syncSn = () => { if (sn.checked) num.value = 'S/N'; else if (num.value === 'S/N') num.value = ''; num.readOnly = sn.checked; num.closest('.fld').classList.remove('has-err'); };
  sn.addEventListener('change', () => { syncSn(); if (!sn.checked) num.focus(); });
  if (sn.checked) syncSn();
  num.addEventListener('blur', () => { num.value = numeroNorm(num.value); if (num.value === 'S/N') { sn.checked = true; syncSn(); } });
  ['rua', 'bairro', 'cidade'].forEach(k => $('#a_' + k).addEventListener('blur', e => { e.target.value = titleName(e.target.value); }));
}
function collectEndereco() {
  ['rua', 'bairro', 'cidade'].forEach(k => { $('#a_' + k).value = titleName($('#a_' + k).value); });
  $('#a_numero').value = numeroNorm($('#a_numero').value);
  const v = k => $('#a_' + k).value.trim();
  let bad = 0;
  for (const k of ['cep', 'rua', 'numero', 'bairro', 'cidade', 'uf']) {
    const wrong = !v(k) || (k === 'cep' && digits(v(k)).length !== 8) || (k === 'uf' && !/^[A-Za-z]{2}$/.test(v(k)))
      || (k === 'numero' && v(k) !== 'S/N' && !/^\d{1,6}[A-Z]?$/.test(v(k)));
    markErr(k, wrong, k === 'cep' && v(k) ? 'CEP inválido.' : k === 'uf' && v(k) ? 'Use a sigla do estado. Ex.: PR'
      : k === 'numero' && v(k) ? 'Só o número (ex.: 120 ou 120A). Apto e bloco vão no complemento.' : undefined);
    if (wrong) bad++;
  }
  if (bad) { showAlert('Complete o endereço.'); return null; }
  return { cep: fmtCep(v('cep')), rua: v('rua'), numero: v('numero'), complemento: v('complemento'), bairro: v('bairro'), cidade: v('cidade'), uf: v('uf').toUpperCase() };
}

/* Saúde */
const QUESTIONS = [
  { id: 'q1', t: 'Possui alguma restrição à prática de atividade física?', type: 'yn', cond: 'Descreva a restrição' },
  { id: 'q2', t: 'Atualmente sente dor em alguma região do corpo?', type: 'yn', cond: 'Informe o local' },
  { id: 'q3', t: 'Já perdeu a consciência ou teve desequilíbrio por tontura ou desmaio?', type: 'yn0' },
  { id: 'q4', t: 'Possui algum tipo de desvio postural?', type: 'multi', excl: 'Não', opts: ['Não', 'Lordose cervical', 'Escoliose', 'Cifose dorsal', 'Lordose lombar'] },
  { id: 'q5', t: 'Possui alguma lesão óssea, articular ou muscular?', type: 'yn', cond: 'Descreva a lesão' },
  { id: 'q6', t: 'Já fez algum tipo de cirurgia?', type: 'yn', cond: 'Qual e quando?' },
  { id: 'q7', t: 'Possui alguma deficiência ou limitação física?', type: 'yn', cond: 'Descreva' },
  { id: 'q8', t: 'Pratica outra atividade física além dos treinos da Apollo?', type: 'yn', cond: 'Qual ou quais?' },
  { id: 'q9', t: 'Como considera a alimentação?', type: 'one', opts: ['Adequada', 'Regular', 'Inadequada'] },
  { id: 'q9_1', t: 'Quantas refeições faz por dia, em média?', type: 'num' },
  { id: 'q10', t: 'Tem histórico de algum destes quadros?', type: 'multi', excl: 'Não tenho histórico', opts: ['Sedentarismo', 'Doenças cardíacas', 'Não tenho histórico'] },
  { id: 'q11', t: 'Possui alguma doença de tratamento contínuo?', type: 'yn', cond: 'Qual ou quais?' },
  { id: 'q12', t: 'Já foi diagnosticado(a) ou tratado(a) por algum destes problemas?', type: 'multi', excl: 'Nunca tive nenhum desses problemas', opts: ['Doenças cardiovasculares', 'Hipertensão (pressão alta)', 'Colesterol ou triglicerídeos alto', 'Alteração na tireoide', 'Alteração circulatória ou vascular', 'Dores no peito', 'Diabetes', 'Epilepsia', 'Artrite/artrose', 'Hérnia de disco', 'Enfarto', 'Obesidade', 'Depressão', 'Ciatalgia', 'Fibromialgia', 'AVC', 'Câncer', 'Asma', 'Lombalgia', 'Varizes', 'Nunca tive nenhum desses problemas'] },
  { id: 'q13', t: 'Há histórico familiar de doenças coronarianas ou hipertensão?', type: 'multi', excl: 'Não tenho histórico familiar', opts: ['Pai', 'Mãe', 'Avô/avó', 'Irmão/irmã', 'Não tenho histórico familiar'] },
  { id: 'q14', t: 'Faz uso de medicamentos contínuos?', type: 'yn', cond: 'Qual ou quais medicamentos?' },
  { id: 'q15', t: 'Há alguma informação importante que não foi mencionada?', type: 'text', opt: true },
];
function stepSaude(a) {
  const d = draft('saude') || {};
  const who = a.minor ? 'do(a) atleta' : 'sua';
  const q = (x, i) => {
    const n = x.id === 'q9_1' ? '9.1' : x.id.slice(1);
    const label = `<span class="lbl" id="lbl_${x.id}">${n}. ${esc(x.t)}${x.opt ? ' <span class="opt">(opcional)</span>' : ''}</span>`;
    let input = '';
    if (x.type === 'yn' || x.type === 'yn0') {
      const name = x.type === 'yn' ? x.id + '_yn' : x.id;
      input = `<div class="seg" role="radiogroup" aria-labelledby="lbl_${x.id}">${['Sim', 'Não'].map(o => `<label class="choice"><input type="radio" name="${name}" value="${o}" ${d[name] === o ? 'checked' : ''}>${o}</label>`).join('')}</div>`;
      if (x.type === 'yn') input += `<div class="cond" ${d[name] === 'Sim' ? '' : 'hidden'}><input class="in" name="${x.id}_text" aria-label="${esc(x.cond)}" placeholder="${esc(x.cond)}" value="${esc(d[x.id + '_text'] || '')}"></div>`;
    } else if (x.type === 'one') {
      input = `<div class="seg three" role="radiogroup" aria-labelledby="lbl_${x.id}">${x.opts.map(o => `<label class="choice"><input type="radio" name="${x.id}" value="${o}" ${d[x.id] === o ? 'checked' : ''}>${o}</label>`).join('')}</div>`;
    } else if (x.type === 'multi') {
      const sel = d[x.id] || [];
      input = `<div class="chips" role="group" aria-labelledby="lbl_${x.id}" data-excl="${esc(x.excl)}">${x.opts.map(o => `<label class="choice"><input type="checkbox" name="${x.id}" value="${esc(o)}" ${sel.includes(o) ? 'checked' : ''}>${esc(o)}</label>`).join('')}</div>`;
    } else if (x.type === 'num') {
      input = `<input class="in" name="${x.id}" inputmode="numeric" placeholder="Ex.: 4" value="${esc(d[x.id] || '')}" aria-labelledby="lbl_${x.id}" style="max-width:160px">`;
    } else {
      input = `<textarea class="in" name="${x.id}" aria-labelledby="lbl_${x.id}" placeholder="Escreva aqui, se houver">${esc(d[x.id] || '')}</textarea>`;
    }
    return `<div class="q fld" data-f="${x.id}">${label}${input}<span class="err">Responda esta pergunta.</span></div>`;
  };
  return `<div class="section-note">${icon('shield')}<div>A anamnese é respondida de novo a cada ano, porque a saúde muda. As respostas ficam restritas à comissão técnica e à administração.</div></div>
    <div class="card"><div class="card-head"><div><h2>Medidas</h2><p>Informe a estatura e o peso ${who === 'sua' ? 'atuais' : 'atuais do(a) atleta'}.</p></div></div>
      <div class="row2">
        <div class="fld" data-f="estatura"><label for="h_estatura">Altura (em centímetros)</label><input class="in" id="h_estatura" name="estatura" inputmode="decimal" placeholder="Ex.: 165" value="${esc(d.estatura || '')}" maxlength="6"><span class="err">Em centímetros, só números. Ex.: 165</span></div>
        <div class="fld" data-f="peso"><label for="h_peso">Peso (kg)</label><input class="in" id="h_peso" name="peso" inputmode="decimal" placeholder="Ex.: 58" value="${esc(d.peso || '')}" maxlength="5"><span class="err">Em quilos. Ex.: 58</span></div>
      </div></div>
    <div class="card"><div class="card-head"><div><h2>Questionário de saúde</h2><p>Responda pensando na saúde ${who}.</p></div></div>${QUESTIONS.slice(0, 10).map(q).join('')}</div>
    <div class="card"><div class="card-head"><div><h2>Histórico</h2></div></div>${QUESTIONS.slice(10).map(q).join('')}</div>`;
}
function bindSaude() {
  $$('#stepForm input[type=radio][name$="_yn"]').forEach(r => r.addEventListener('change', () => {
    const cond = r.closest('.q').querySelector('.cond');
    cond.hidden = r.value !== 'Sim' || !r.checked;
    if (!cond.hidden) cond.querySelector('input').focus();
  }));
  $$('.chips[data-excl]').forEach(group => group.addEventListener('change', e => {
    const excl = group.dataset.excl;
    if (e.target.value === excl && e.target.checked) $$('input', group).forEach(i => { if (i !== e.target) i.checked = false; });
    else if (e.target.checked) $$('input', group).forEach(i => { if (i.value === excl) i.checked = false; });
  }));
  $$('#stepForm input, #stepForm textarea').forEach(el => el.addEventListener('input', () => el.closest('.fld')?.classList.remove('has-err')));
  $$('#stepForm input[type=radio], #stepForm input[type=checkbox]').forEach(el => el.addEventListener('change', () => el.closest('.fld')?.classList.remove('has-err')));
}
function collectSaude() {
  const f = formSnapshot(), out = {};
  let bad = 0;
  // Altura sempre em centímetros: "1,65" ou "1.65 m" viram 165
  let est = String(f.estatura || '').trim().toLowerCase().replace(/\s*(cm|m)$/, '');
  if (/^[12][.,]\d{1,2}$/.test(est)) est = String(Math.round(parseFloat(est.replace(',', '.')) * 100));
  const peso = String(f.peso || '').trim().toLowerCase().replace(/\s*kg$/, '').replace(',', '.');
  if ($('#h_estatura')) $('#h_estatura').value = est;
  const estOk = /^\d{2,3}$/.test(est) && +est >= 50 && +est <= 250, pesoOk = /^\d{1,3}(\.\d)?$/.test(peso) && +peso >= 10 && +peso <= 250;
  markErr('estatura', !estOk); markErr('peso', !pesoOk);
  if (!estOk) bad++; if (!pesoOk) bad++;
  out.estatura = est; out.peso = peso;
  for (const x of QUESTIONS) {
    let wrong = false;
    if (x.type === 'yn') {
      const yn = f[x.id + '_yn'], txt = String(f[x.id + '_text'] || '').trim();
      wrong = !yn || (yn === 'Sim' && !txt);
      out[x.id + '_yn'] = yn; if (yn === 'Sim') out[x.id + '_text'] = txt;
      markErr(x.id, wrong, yn === 'Sim' && !txt ? 'Descreva a resposta.' : 'Responda esta pergunta.');
    } else if (x.type === 'yn0' || x.type === 'one') { wrong = !f[x.id]; out[x.id] = f[x.id]; markErr(x.id, wrong); }
    else if (x.type === 'multi') { const v = f[x.id] || []; wrong = !v.length; out[x.id] = v; markErr(x.id, wrong, 'Marque ao menos uma opção.'); }
    else if (x.type === 'num') { const v = String(f[x.id] || '').trim(); wrong = !/^\d{1,2}$/.test(v); out[x.id] = v; markErr(x.id, wrong, 'Informe um número. Ex.: 4'); }
    else out[x.id] = String(f[x.id] || '').trim();
    if (wrong) bad++;
  }
  if (bad) { showAlert(bad === 1 ? 'Falta 1 resposta.' : `Faltam ${bad} respostas.`); return null; }
  return out;
}

/* Turma 2027 */
const offerOf = key => ST.data?.offers?.find(o => o.key === key);
// Opções de 2027 da turma atual. Pode haver mais de uma (ex.: adulto iniciante com 1x, 2x ou 3x por semana)
const currentOffers = a => (ST.data?.offers || []).filter(o => o.team_id && o.team_id === a.team?.id);
// Só pré-seleciona quando a turma atual tem uma única opção; com várias, a pessoa escolhe a frequência
const defaultOffer = a => { const cur = currentOffers(a); return reen(a).offer_key || (cur.length === 1 ? cur[0].key : ''); };
function offerCard(o, checked, current) {
  return `<label class="team"><input type="radio" name="offer" value="${esc(o.key)}" ${checked ? 'checked' : ''}><span class="radio" aria-hidden="true"></span>
    <span><b>${esc(o.label)}${current ? '<span class="tag ok">Turma atual</span>' : ''}</b>
    <small>${esc(o.days)} · ${esc(o.time)}</small><small>${esc(o.freq)}</small></span></label>`;
}
// O valor aparece só para a turma escolhida (a lista não expõe o preço das demais)
function offerPrice(key) {
  const o = offerOf(key);
  if (!o) return '';
  return `<div class="pix-amount" style="margin-top:14px"><span>Mensalidade de ${esc(o.label)}</span><b>${ctMoney(o.fee_cents)}</b>
    <small>pagando até o dia ${TEMPORADA.vencimento} (desconto de pontualidade). Após o vencimento: ${ctMoney(ctCheia(o.fee_cents))}.${o.note ? ` ${esc(o.note)}.` : ''}</small></div>`;
}
function stepEquipe(a) {
  const r = reen(a), offers = ST.data.offers || [];
  const cur = currentOffers(a), curKeys = cur.map(o => o.key);
  const chosen = defaultOffer(a);
  const groups = [...new Set(offers.map(o => o.location))];
  const showAll = !cur.length || (chosen && !curKeys.includes(chosen));
  const lead = !cur.length ? 'Escolha a turma de 2027.'
    : cur.length > 1 ? `${a.minor ? 'O(a) atleta pode seguir' : 'Você pode seguir'} na mesma turma. Em 2027 ela tem opções de frequência, cada uma com seu valor: escolha quantas vezes por semana ${a.minor ? 'o(a) atleta vai' : 'você vai'} treinar.`
    : `Por padrão, ${a.minor ? 'o(a) atleta segue' : 'você segue'} na mesma turma. Confira dias e horário de 2027; o valor aparece abaixo da turma escolhida.`;
  return `<p class="lead">${lead}</p>
    ${cur.length ? cur.map(o => offerCard(o, chosen === o.key, true)).join('') : `<div class="section-note warn">${icon('info')}<div>A turma atual (${esc(a.team?.name || 'sem turma')}) não terá continuidade em 2027 com esse nome. Escolha a turma para 2027.</div></div>`}
    <button class="disclose" type="button" id="otherTeams" aria-expanded="${showAll}" ${cur.length ? '' : 'hidden'}><span>Quero mudar de turma</span>${icon('arrow')}</button>
    <div id="otherList" ${showAll ? '' : 'hidden'} style="margin-top:10px">${groups.map(g => `<p class="group-title">${esc(g)}</p>${offers.filter(o => o.location === g && !curKeys.includes(o.key)).map(o => offerCard(o, o.key === chosen, false)).join('')}`).join('')}</div>
    <div id="offerPrice" aria-live="polite">${offerPrice(chosen)}</div>
    <div class="fld" style="margin-top:16px"><label for="teamNote">Observação para a coordenação <span class="opt">(opcional)</span></label>
      <textarea class="in" id="teamNote" name="note" maxlength="500" placeholder="Ex.: prefiro treinar à noite">${esc(r.team_note || '')}</textarea></div>
    <div class="section-note">${icon('info')}<div>A mudança de turma depende de vaga e da avaliação da comissão técnica. A coordenação confirma com vocês. O valor da turma escolhida vai para o contrato.</div></div>`;
}
function bindEquipe() {
  const btn = $('#otherTeams');
  if (btn) btn.onclick = () => { const list = $('#otherList'); list.hidden = !list.hidden; btn.setAttribute('aria-expanded', String(!list.hidden)); };
  $$('input[name=offer]').forEach(i => { i.onchange = () => { $('#offerPrice').innerHTML = offerPrice(i.value); }; });
}
function collectEquipe() {
  const t = $('input[name=offer]:checked');
  if (!t) { showAlert('Escolha a turma para 2027.'); return null; }
  return { offer_key: t.value, note: $('#teamNote').value.trim() };
}

/* Contrato e autorizações */
const DECLARACAO = 'Declaro que as informações de saúde prestadas nesta anamnese são verdadeiras, completas e atuais, e me comprometo a informar à Apollo, antes do treino seguinte, qualquer mudança de saúde, lesão, medicação ou restrição. Estou ciente de que a omissão ou a falsidade dessas informações pode colocar em risco a integridade do(a) atleta e afasta a responsabilidade da Apollo pelas consequências que delas decorram, sem prejuízo das responsabilidades que a lei atribui à Apollo.';
const LGPD = `<p>Em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018), consinto, de forma específica e destacada, que o <b>GAV – Grupo Apollo de Voleibol</b> (CNPJ 53.617.328/0001-18) trate os <b>dados de saúde</b> informados nesta rematrícula (anamnese, altura e peso) para zelar pela segurança do(a) atleta na prática esportiva e agir em caso de emergência.</p>
<p>Os demais dados (identificação, contato, endereço, dados do(a) responsável e contato de emergência) são tratados para executar o contrato, cumprir obrigações legais e inscrever o(a) atleta em competições, conforme a Cláusula 12 do contrato.</p>
<p><b>Acesso:</b> dados de saúde ficam restritos à comissão técnica e à administração. <b>Compartilhamento:</b> organizadores de competições e federações, plataforma de cobrança, provedores de tecnologia (inclusive com servidores fora do Brasil) e autoridades, quando a lei exigir. A Apollo não vende dados.</p>
<p><b>Por quanto tempo:</b> até 3 (três) anos depois do fim do vínculo; depois, os dados são eliminados ou anonimizados, salvo os que a lei obriga a guardar por mais tempo.</p>
<p><b>Seus direitos:</b> acesso, correção, portabilidade, eliminação, informação sobre compartilhamento e revogação deste consentimento, pelo e-mail <b>apollovoleibol@gmail.com</b> (canal do encarregado). Sem os dados de saúde, o(a) atleta não pode participar das atividades físicas, por segurança.</p>
<p>Quando o(a) atleta é menor de idade, este consentimento é dado pelo(a) responsável legal, no melhor interesse da criança ou do adolescente (art. 14 da LGPD).</p>`;
const IMAGEM = `<p>Uso gratuito da imagem, da voz e do nome do(a) atleta, em fotos e vídeos de treinos, jogos e eventos, exclusivamente para fins institucionais, esportivos e de comunicação da Apollo (redes sociais, site, materiais impressos e vídeos institucionais), vedado uso ofensivo, vexatório ou alheio a essas finalidades e sem venda a terceiros.</p>
<p>A autorização vale enquanto não for revogada. Pode ser revogada a qualquer momento, por escrito, pelos canais oficiais: novas publicações param e o que estiver nos canais da Apollo é retirado em até 15 dias, quando tecnicamente possível. <b>Não autorizar não prejudica a matrícula nem a participação nas atividades.</b></p>`;
let CT = { data: null, html: '' };
const ctData = imagem => ({ ...CT.data.data, imagem });
const imageChoice = () => { const v = $('input[name=imagem]:checked')?.value; return v === 'sim' ? true : v === 'nao' ? false : null; };
function stepTermos(a) {
  const r = reen(a), who = a.minor ? `Como responsável legal por ${esc(titleName(a.data.full_name))}, ` : '';
  const prevImg = r.contract_version === ST.data.contract ? r.image_consent : null;
  const accepted = r.contract_version === ST.data.contract && stepsDone(a).termos;
  const term = (k, title, text, doc) => `<div class="term">
    <label class="term-check"><input type="checkbox" name="${k}" value="1" ${accepted ? 'checked' : ''}><span class="box">${yes()}</span><span><b>${title}</b><span class="t">${who}${text}</span></span></label>
    ${doc ? `<details><summary>Ler o texto completo</summary><div class="doc">${doc}</div></details>` : ''}</div>`;
  return `<p class="lead">Leia o contrato, já preenchido com os dados ${a.minor ? 'do(a) responsável e do(a) atleta' : 'informados'}, a turma e o valor de 2027.</p>
    ${accepted ? `<div class="section-note">${icon('check')}<div>Contrato aceito em ${fmtDate(r.contract_at)}. Se mudar algum dado, a turma ou a escolha de imagem, será preciso aceitar de novo.</div></div>` : ''}
    <div class="contract-wrap"><div class="contract" id="ctBox" tabindex="0" aria-label="Texto do contrato"><p class="muted">Carregando o contrato…</p></div>
      <div class="contract-tools"><button class="btn" type="button" id="ctPrint">${icon('file')} Baixar em PDF</button>
      <a class="btn" href="regulamento-2027.html" target="_blank" rel="noopener">Regulamento do Atleta</a></div></div>
    <div class="card fld" data-f="imagem"><span class="lbl" id="lblImg"><b>Uso de imagem, voz e nome</b></span>
      <div class="doc small">${IMAGEM}</div>
      <div class="seg" role="radiogroup" aria-labelledby="lblImg">
        <label class="choice"><input type="radio" name="imagem" value="sim" ${prevImg === true ? 'checked' : ''}>Autorizo</label>
        <label class="choice"><input type="radio" name="imagem" value="nao" ${prevImg === false ? 'checked' : ''}>Não autorizo</label></div>
      <span class="err">Escolha uma das opções.</span></div>
    ${term('contrato', 'Contrato de Prestação de Serviços 2027', 'li e aceito o contrato acima, que inclui o Regulamento do Atleta 2027, e reconheço este aceite eletrônico como minha assinatura.')}
    ${term('dados', 'Dados de saúde (LGPD)', 'autorizo o tratamento dos dados de saúde para as finalidades descritas.', LGPD)}
    ${term('declaracao', 'Declaração de saúde', 'declaro que as informações de saúde são verdadeiras e completas.', `<p>${DECLARACAO}</p>`)}`;
}
function renderContract() {
  if (!CT.data) return;
  CT.html = contratoHtml(ctData(imageChoice()));
  $('#ctBox').innerHTML = CT.html;
}
async function bindTermos(a) {
  CT = { data: null, html: '' };
  $$('input[name=imagem]').forEach(el => el.addEventListener('change', () => { markErr('imagem', false); renderContract(); }));
  $('#ctPrint').onclick = () => CT.html && printContract(CT.html, `Contrato 2027 – ${titleName(a.data.full_name)}`);
  try {
    CT.data = await rpc('reenroll_contract_preview', { p_token: ST.token, p_athlete: a.id, p_image: null });
    if (CT.data.version !== CONTRATO_VERSION) return showAlert('O contrato foi atualizado. Recarregue a página para ler a versão nova.');
    renderContract();
  } catch (e) { if (!e.handled) { $('#ctBox').innerHTML = ''; showAlert(friendlyError(e)); } }
}
function printContract(html, title) {
  const w = window.open('', '_blank');
  if (!w) return toast('Permita a abertura de nova janela para baixar o PDF.');
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title>
    <link rel="stylesheet" href="${new URL('rematricula.css?v=3', location.href)}"></head><body class="ct-print">${html}
    <script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
  w.document.close();
}
async function collectTermos() {
  const img = imageChoice();
  markErr('imagem', img === null);
  const keys = ['contrato', 'dados', 'declaracao'];
  const miss = keys.filter(k => !$(`input[name=${k}]`).checked);
  $$('.term').forEach(t => t.style.borderColor = '');
  miss.forEach(k => { $(`input[name=${k}]`).closest('.term').style.borderColor = 'var(--red)'; });
  if (img === null) { showAlert('Escolha se autoriza ou não o uso de imagem.'); return null; }
  if (miss.length) { showAlert(miss.length === 1 ? 'Falta marcar 1 item.' : `Faltam marcar ${miss.length} itens.`); return null; }
  if (!CT.data) { showAlert('O contrato ainda não carregou. Aguarde um instante.'); return null; }
  const hash = await contratoHash(contratoHtml(ctData(img)));
  return { contrato: true, dados: true, declaracao: true, imagem: img, hash, version: CT.data.version, ua: navigator.userAgent };
}

/* Taxa de rematrícula (Pix) */
const PIX = { key: 'apollovoleibol@gmail.com', amount: '40.00', name: 'APOLLO VOLEIBOL', city: 'CURITIBA' };
// Pix copia e cola estático (padrão EMV do Banco Central), com valor fixo
function pixCode() {
  const f = (id, v) => id + String(v.length).padStart(2, '0') + v;
  const body = f('00', '01') + f('26', f('00', 'br.gov.bcb.pix') + f('01', PIX.key)) + f('52', '0000') + f('53', '986') + f('54', PIX.amount)
    + f('58', 'BR') + f('59', PIX.name) + f('60', PIX.city) + f('62', f('05', 'REMATRICULA2027')) + '6304';
  let crc = 0xFFFF;
  for (const ch of body) { crc ^= ch.charCodeAt(0) << 8; for (let i = 0; i < 8; i++) crc = (crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1) & 0xFFFF; }
  return body + crc.toString(16).toUpperCase().padStart(4, '0');
}
const feeOf = a => reen(a).fee || { status: 'pendente' };
function stepPagamento(a) {
  const fee = feeOf(a), has = fee.status !== 'pendente' && fee.name;
  const code = pixCode();
  return `<p class="lead">Pague a taxa de rematrícula por Pix e anexe o comprovante. A rematrícula é confirmada depois que a administração validar o pagamento.</p>
    ${fee.status === 'recusado' ? `<div class="alert" role="alert">${icon('alert')}<div><b>O comprovante enviado foi recusado.</b>${fee.note ? `<br>Motivo: ${esc(fee.note)}` : ''}<br>Envie um novo comprovante abaixo.</div></div>` : ''}
    <div class="card pix">
      <div class="pix-amount"><span>Valor</span><b>R$ 40,00</b><small>antecipação da mensalidade de janeiro: é descontado dela</small></div>
      <div class="pix-row"><span>Chave Pix (e-mail)</span><b>${PIX.key}</b><button class="btn sm" type="button" data-copy="${PIX.key}">Copiar chave</button></div>
      <div class="pix-row"><span>Pix copia e cola</span><code class="pix-code">${code}</code><button class="btn sm primary" type="button" data-copy="${code}">Copiar código</button></div>
      <p class="small muted" style="margin:8px 0 0">No app do banco, escolha <b>Pix copia e cola</b> e cole o código, ou pague para a chave acima. Confira o favorecido: <b>Apollo Voleibol</b>.</p>
    </div>
    <div id="fileBox">${has ? fileCard(fee) : ''}</div>
    <div class="drop" id="drop">${dropButtons(has)}</div>
    <div id="upState" style="margin-top:14px"></div>
    <p class="small muted" style="margin-top:14px">PDF ou imagem, até 15 MB. O arquivo fica em armazenamento privado: só a administração e o financeiro podem abri-lo.</p>
    <div class="section-note">${icon('info')}<div>Os R$ 40,00 são parte da mensalidade de janeiro paga antecipadamente: em janeiro você paga só o saldo. Em caso de desistência antes de janeiro, o valor não é devolvido, exceto nos 7 dias seguintes à confirmação (direito de arrependimento) ou se a Apollo não oferecer vaga na turma (Cláusula 2 do contrato).</div></div>`;
}
function dropButtons(has) {
  return `<label class="upload-btn${has ? '' : ' primary'}">${icon('camera')}<span>${has ? 'Enviar outra foto' : 'Tirar foto do comprovante'}</span><input type="file" accept="image/*" capture="environment" data-file></label>
    <label class="upload-btn">${icon('file')}<span>${has ? 'Trocar por outro arquivo' : 'Escolher PDF ou print da tela'}</span><input type="file" accept="application/pdf,image/*" data-file></label>`;
}
function fileCard(fee, preview = '') {
  const label = { enviado: 'Enviado · aguardando validação', aprovado: 'Validado pela administração', recusado: 'Recusado' }[fee.status] || 'Enviado';
  return `<div class="file-card ${fee.status === 'recusado' ? 'bad' : ''}"><span class="thumb">${preview ? `<img src="${preview}" alt="">` : icon('doc')}</span>
    <span><b>${esc(fee.name || 'Comprovante')}</b><small>${fee.status === 'recusado' ? icon('x') : icon('check')} ${label}${fee.uploaded_at ? ' · ' + fmtDate(fee.uploaded_at) : ''}</small></span></div>`;
}
function bindPagamento(a) {
  $$('[data-copy]').forEach(b => b.onclick = async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); toast('Copiado!'); } catch (e) { toast('Não foi possível copiar. Selecione e copie manualmente.'); }
  });
  $$('[data-file]').forEach(inp => inp.addEventListener('change', () => { const f = inp.files?.[0]; inp.value = ''; if (f) uploadReceipt(a, f); }));
}
async function shrinkImage(file) {
  // Fotos de celular passam de 5 MB: reduz para até 2000 px em JPEG. Se o navegador não ler o formato (ex.: HEIC), envia o original.
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) || file.size < 900 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.84));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch (e) { return file; }
}
async function uploadReceipt(a, original) {
  const state = $('#upState'), btns = $$('#drop .upload-btn');
  showAlert('');
  const extOf = f => (f.type === 'application/pdf' ? 'pdf' : (f.type.split('/')[1] || f.name.split('.').pop() || '').toLowerCase().replace('jpeg', 'jpg'));
  if (!/^(application\/pdf|image\/)/.test(original.type) && !/\.(pdf|heic|heif|jpe?g|png|webp)$/i.test(original.name)) return showAlert('Envie um PDF ou uma imagem do comprovante.');
  btns.forEach(b => b.style.pointerEvents = 'none');
  state.innerHTML = `<p class="small" style="margin:0 0 8px">Enviando comprovante…</p><div class="uploading"><i></i></div>`;
  try {
    const file = await shrinkImage(original);
    if (file.size > MAX_UPLOAD) throw new Error('O arquivo passa de 15 MB. Envie um print da tela ou um PDF menor.');
    const ext = extOf(file) || 'jpg';
    const type = file.type || (ext === 'pdf' ? 'application/pdf' : 'image/' + (ext === 'jpg' ? 'jpeg' : ext));
    const slot = await rpc('reenroll_upload_slot', { p_token: ST.token, p_athlete: a.id, p_ext: ext });
    const { error } = await sb.storage.from(slot.bucket).upload(slot.path, file, { contentType: type, upsert: false });
    if (error) throw new Error(/mime|type/i.test(error.message) ? 'Formato não aceito. Envie PDF, JPG, PNG ou HEIC.' : /size|large/i.test(error.message) ? 'Arquivo grande demais (máximo 15 MB).' : 'Não foi possível enviar o arquivo. Tente de novo.');
    await rpc('reenroll_attach_fee', { p_token: ST.token, p_athlete: a.id, p_path: slot.path, p_name: original.name || 'comprovante.' + ext, p_mime: type, p_size: file.size });
    await reload();
    if (reen(athlete()).status === 'concluida') return renderDone();
    const preview = type.startsWith('image/') && !/hei[cf]/.test(type) ? URL.createObjectURL(file) : '';
    $('#fileBox').innerHTML = fileCard({ ...feeOf(athlete()), name: original.name }, preview);
    $('#drop').innerHTML = dropButtons(true); bindPagamento(a);
    state.innerHTML = '';
    toast('Comprovante recebido!');
  } catch (e) { state.innerHTML = ''; if (!e.handled) showAlert(friendlyError(e)); }
  finally { btns.forEach(b => b.style.pointerEvents = ''); }
}

/* Revisão */
function stepRevisao(a) {
  const done = stepsDone(a), r = reen(a), o = offerOf(r.offer_key), miss = missingOf(a);
  const items = [['cadastro', 'Dados cadastrais revisados'], ['endereco', 'Endereço preenchido'], ['saude', 'Anamnese respondida'],
    ['equipe', `Turma 2027: ${o ? `${o.label} · ${ctMoney(ctCheia(o.fee_cents))}/mês (${ctMoney(o.fee_cents)} até o vencimento)` : '—'}`], ['termos', `Contrato aceito${r.image_consent === false ? ' (sem uso de imagem)' : ''}`],
    ['pagamento', 'Comprovante do Pix enviado']];
  const ok = k => !miss.includes(k) && !!done[k];
  return `<p class="lead">${miss.length ? 'Quase lá! Complete os itens pendentes para concluir.' : 'Tudo pronto. Confira o resumo e conclua a rematrícula.'}</p>
    <div class="card"><ul class="summary">${items.map(([k, t]) => `<li class="${ok(k) ? '' : 'miss'}">${ok(k) ? icon('check') : icon('x')}<span>${esc(t)}</span>
      <button class="go" type="button" data-edit-step="${k}">${ok(k) ? 'Editar' : 'Preencher'}</button></li>`).join('')}</ul></div>
    <p class="small muted">Ao concluir, o cadastro do(a) atleta é atualizado. A rematrícula fica <b>confirmada</b> quando a administração validar o comprovante do Pix; vocês recebem o aviso pelos canais oficiais.</p>`;
}
function bindRevisao() {
  $$('[data-edit-step]').forEach(b => b.onclick = () => { ST.step = STEPS.findIndex(s => s.id === b.dataset.editStep); renderStep(); });
}
async function finish(btn) {
  const a = athlete();
  setBusy(btn, true);
  try {
    await rpc('reenroll_finish', { p_token: ST.token, p_athlete: a.id });
    await reload();
    renderDone();
  } catch (e) { if (!e.handled) showAlert(friendlyError(e)); }
  finally { setBusy(btn, false); }
}
function renderDone() {
  const a = athlete(), r = reen(a), o = offerOf(r.offer_key), fee = feeOf(a);
  const pending = ST.data.athletes.filter(x => !['concluida', 'declinada'].includes(reen(x).status) && x.id !== a.id);
  const moved = r.team_2027_id && r.team_2027_id !== a.team?.id;
  const title = fee.status === 'aprovado' ? 'Rematrícula confirmada!' : fee.status === 'recusado' ? 'Comprovante recusado' : 'Rematrícula enviada!';
  const msg = fee.status === 'aprovado' ? `<b>${esc(titleName(a.data.full_name))}</b> está com a matrícula renovada para 2027${o ? ` na turma <b>${esc(o.label)}</b>` : ''}.`
    : fee.status === 'recusado' ? `A administração não conseguiu validar o comprovante${fee.note ? `: <b>${esc(fee.note)}</b>` : ''}. Envie um novo comprovante para confirmar a rematrícula.`
    : `Recebemos a rematrícula de <b>${esc(titleName(a.data.full_name))}</b>${o ? ` para a turma <b>${esc(o.label)}</b>` : ''}. Ela fica confirmada assim que a administração validar o comprovante do Pix.${moved ? ' O pedido de mudança de turma também passa pela coordenação, que confirma com vocês.' : ''}`;
  $('#app').innerHTML = `<section class="screen done">
    <div class="seal ${fee.status === 'recusado' ? 'bad' : ''}">${fee.status === 'recusado' ? icon('alert') : icon('check')}</div>
    <div class="eyebrow">Rematrícula 2027</div>
    <h1>${title}</h1>
    <p class="lead">${msg} Os avisos sobre o início dos treinos chegam pelos canais oficiais da Apollo.</p>
    ${r.contract_version ? `<p><button class="btn" type="button" id="doneContract">${icon('file')} Baixar o contrato em PDF</button></p>` : ''}
    <p class="small muted">Para corrigir algum dado depois de concluir, fale com a secretaria.</p>
  </section>`;
  const actions = fee.status === 'recusado' ? `<button class="btn primary block" type="button" id="doneFee">Enviar novo comprovante ${icon('arrow')}</button>`
    : pending.length ? `<button class="btn primary block" type="button" id="doneNext">Rematricular ${esc(firstName(titleName(pending[0].data.full_name)))} ${icon('arrow')}</button>`
    : ST.data.athletes.length > 1 || ST.others ? `<button class="btn dark block" type="button" id="doneHub">Voltar ao início</button>` : `<button class="btn block" type="button" id="doneExit">Sair</button>`;
  setScreen('done', { actions });
  if ($('#doneFee')) $('#doneFee').onclick = () => { ST.step = STEPS.findIndex(s => s.id === 'pagamento'); renderStep(); };
  if ($('#doneNext')) $('#doneNext').onclick = () => { ST.athleteId = pending[0].id; ST.step = firstOpenStep(pending[0]); renderStep(); };
  if ($('#doneHub')) $('#doneHub').onclick = () => renderHub();
  if ($('#doneExit')) $('#doneExit').onclick = exit;
  if ($('#doneContract')) $('#doneContract').onclick = async () => {
    try {
      const p = await rpc('reenroll_contract_preview', { p_token: ST.token, p_athlete: a.id, p_image: r.image_consent });
      printContract(contratoHtml({ ...p.data, assinatura: { name: titleName(p.data.contratante?.name), at: new Date(r.contract_at).toLocaleString('pt-BR'), hash: r.contract_hash } }), `Contrato 2027 – ${titleName(a.data.full_name)}`);
    } catch (e) { if (!e.handled) toast(friendlyError(e)); }
  };
}

/* ─── 4. Não continuar ─── */
function renderDecline() {
  const a = athlete();
  $('#app').innerHTML = `<section class="screen">
    <div class="eyebrow">${esc(titleName(a.data.full_name))}</div>
    <h1>Não vão continuar em 2027?</h1>
    <p class="lead">Sentiremos falta! Conte o motivo: isso ajuda a Apollo a melhorar.</p>
    <div id="formAlert"></div>
    <form id="declineForm" novalidate>
      <div class="card fld" data-f="reason"><span class="lbl" id="lblReason">Motivo principal</span>
        <div class="chips" role="radiogroup" aria-labelledby="lblReason" style="flex-direction:column">${DECLINE_REASONS.map(o => `<label class="choice"><input type="radio" name="reason" value="${esc(o)}">${esc(o)}</label>`).join('')}</div>
        <span class="err">Escolha um motivo.</span></div>
      <div class="card"><div class="fld"><label for="declineNote">Quer deixar uma mensagem? <span class="opt">(opcional)</span></label>
        <textarea class="in" id="declineNote" maxlength="1000" placeholder="Escreva aqui"></textarea></div>
        <label class="term-check" style="padding:4px 0 0"><input type="checkbox" id="deleteData"><span class="box">${yes()}</span><span><b>Solicito a exclusão dos dados do(a) atleta</b><span class="t">A Apollo apaga os dados pessoais da base, exceto os que a lei obriga a guardar (por exemplo, registros financeiros).</span></span></label>
      </div>
    </form>
  </section>`;
  setScreen('decline', { actions: `<button class="btn back" type="button" id="declineBack" aria-label="Voltar">${icon('back')}</button><button class="btn dark" type="button" id="declineGo">Confirmar que não vamos</button>` });
  $$('input[name=reason]').forEach(r => r.addEventListener('change', () => markErr('reason', false)));
  $('#declineBack').onclick = () => renderHub();
  $('#declineGo').onclick = async () => {
    const reason = $('input[name=reason]:checked')?.value;
    markErr('reason', !reason);
    if (!reason) return focusFirstError();
    const btn = $('#declineGo'); setBusy(btn, true);
    try {
      const del = $('#deleteData').checked;
      await rpc('reenroll_decline', { p_token: ST.token, p_athlete: a.id, p_reason: reason, p_note: $('#declineNote').value.trim(), p_delete: del });
      await reload();
      renderDeclined(del);
    } catch (e) { if (!e.handled) showAlert(friendlyError(e)); } finally { setBusy(btn, false); }
  };
}
function renderDeclined(deleteRequested = false) {
  const a = athlete();
  const first = esc(firstName(titleName(a.data.full_name)));
  $('#app').innerHTML = `<section class="screen done">
    <div class="seal no">${icon('ball')}</div>
    <h1>Decisão registrada</h1>
    <p class="lead">${a.minor ? `Obrigado por fazerem parte da Apollo! As portas continuam abertas para ${first}.` : `Obrigado por fazer parte da Apollo, ${first}! As portas continuam abertas.`} Se mudarem de ideia, é só voltar aqui.</p>
    ${deleteRequested ? '<p class="small muted">Recebemos o pedido de exclusão dos dados. A secretaria faz a exclusão e confirma pelo WhatsApp.</p>' : ''}
  </section>`;
  setScreen('declined', { actions: `<button class="btn block" type="button" id="changeMind">Mudei de ideia</button><button class="btn dark block" type="button" id="declHub">Início</button>` });
  $('#changeMind').onclick = async () => {
    const btn = $('#changeMind'); setBusy(btn, true);
    try { await rpc('reenroll_reopen', { p_token: ST.token, p_athlete: a.id }); await reload(); ST.step = firstOpenStep(athlete()); renderStep(); }
    catch (e) { if (!e.handled) toast(friendlyError(e)); } finally { setBusy(btn, false); }
  };
  $('#declHub').onclick = () => renderHub();
}

function exit() { clearSession(); renderIdent(); toast('Você saiu. Até logo!'); }

/* ─── Início ─── */
(async function init() {
  $('#exitBtn').onclick = exit;
  if (!window.supabase?.createClient) {
    $('#app').innerHTML = `<div class="alert" role="alert">${icon('alert')}<div>Não foi possível carregar a página. Confira a internet e recarregue.</div></div>`;
    return;
  }
  sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { saved = null; }
  history.replaceState({ screen: 'ident' }, '');
  if (saved?.token) {
    ST.token = saved.token; ST.ident = saved.ident || '';
    $('#app').innerHTML = `<p class="muted" style="text-align:center;padding:40px 0">Carregando…</p>`;
    try { await reload(); return renderHub(); } catch (e) { if (e.handled) return; clearSession(); }
  }
  renderIdent('', false);
})();
