/* Marketing: dados, Planejamento (calendário e campanhas), lista do Estúdio, calculadora de custo e ciclo de vida da peça.
   O editor visual fica em marketing-editor.js. Depende de marketing-studio-core.js e marketing-layouts.js.
   Permissões e aprovação são impostas pelo banco (migrações 043 e 044). */
'use strict';

const MK = { loaded: false, loading: false, error: '', campaigns: [], posts: [], pieces: [], layouts: [], pricing: [], settings: { usd_brl: 5.5, video_confirm_brl: 20 }, usage: [],
  tab: 'calendar', month: ymd(TODAY).slice(0, 7), filter: 'all', ed: null, edSlide: 0, sel: '', tool: null, busy: '', review: null, video: null,
  comps: [], showComps: true,
  ui: { rail: 'layouts', cat: 'Todos', q: '', zoom: 0, scrollTo: null }, hist: [], fut: [], histCur: '', editing: '', clip: null,
  np: { fmt: 'feed', cat: 'Todos', q: '', campaign: '', post: '' },
  paint: { brush: 'seco', color: 'red', size: 7, tex: 0.6 }, calc: { copies: 1, images: 1, reviews: 1, video: 0, brief: 300 }, thumbs: new Set() };
const MK_NET = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', linkedin: 'LinkedIn', outro: 'Outra rede' };
const MK_POST = { ideia: ['Ideia', 'st-info'], em_criacao: ['Em criação', 'st-warn'], pronto: ['Pronto', 'st-ok'], publicado: ['Publicado', 'st-agendado'] };
const MK_APPR = { rascunho: ['Rascunho', 'st-pendente'], em_aprovacao: ['Em aprovação', 'st-warn'], aprovada: ['Aprovada', 'st-ok'], reprovada: ['Reprovada', 'st-bad'] };
const mkDb = () => financeDbClient();
const mkTag = ([l, c]) => `<span class="tag nodot ${c}">${esc(l)}</span>`;
const mkIsAdmin = () => !S.previewRole && APOLLO_AUTH.access?.role === 'admin';
const mkCan = page => canEdit(page);
const mkMonthLabel = ym => { const [y, m] = ym.split('-').map(Number); return `${MONTHS[m - 1][0].toUpperCase()}${MONTHS[m - 1].slice(1)} de ${y}`; };
const mkCampaign = id => MK.campaigns.find(c => c.id === id);
const mkPiece = id => MK.pieces.find(p => p.id === id);
const mkSpent = id => MK.usage.filter(u => u.campaign_id === id).reduce((n, u) => n + Number(u.cost_brl), 0);
const mkLocked = () => !!MK.ed && ['em_aprovacao', 'aprovada'].includes(MK.ed.approval_status);
const mkWhen = iso => { const d = new Date(iso); return `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const mkErr = e => (e && (e.message || e.error_description)) || 'Não foi possível concluir.';
const mkDialogErr = (id, msg) => { const el = $('#' + id); if (el) { el.hidden = false; el.innerHTML = `${icon('alert')}<span>${esc(msg)}</span>`; } };
// Layouts disponíveis: os sugeridos e os que o usuário salvou (derivados)
const mkAllLayouts = () => [...MK_LAYOUTS, ...MK.layouts.map(l => ({ id: 'u:' + l.id, name: l.name, hint: 'Layout próprio' + (l.base_id ? ` · derivado de ${mkBaseLayout(l.base_id).name}` : ''), formats: Object.keys(MK_FORMATS), bg: l.bg, els: l.els, user: true, dbId: l.id, base: l.base_id }))];
const mkLayoutById = id => mkAllLayouts().find(l => l.id === id) || mkBaseLayout(id);

async function mkLoad(force = false) {
  if (MK.loading || (MK.loaded && !force)) return;
  MK.loading = true; MK.error = '';
  try {
    const db = mkDb();
    const [c, p, pc, pr, st, us, ly, cp] = await Promise.all([
      db.from('marketing_campaigns').select('*').order('created_at', { ascending: false }),
      db.from('marketing_posts').select('*').order('post_date', { ascending: true }),
      db.from('marketing_pieces').select('*').order('updated_at', { ascending: false }),
      db.from('ai_pricing').select('*'),
      db.from('ai_settings').select('*').maybeSingle(),
      db.from('ai_usage').select('id,created_at,action,kind,model,input_tokens,output_tokens,units,cost_brl,piece_id,campaign_id').order('created_at', { ascending: false }).limit(1000),
      db.from('marketing_layouts').select('*').order('created_at', { ascending: false }),
      db.rpc('v2_marketing_competitions'),
    ]);
    const bad = [c, p, pc, pr, st, us].find(x => x.error);
    if (bad) throw bad.error;
    Object.assign(MK, { campaigns: c.data, posts: p.data, pieces: pc.data, pricing: pr.data, usage: us.data, layouts: ly.error ? [] : ly.data, comps: cp.error ? [] : (cp.data || []).map(mkCompRow), loaded: true });
    if (st.data) MK.settings = st.data;
  } catch (e) { MK.error = mkErr(e); }
  MK.loading = false;
  if (['marketing', 'studio'].includes(S.page)) render();
}
function mkPricing() {
  const latest = kind => MK.pricing.filter(r => r.kind === kind).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0] || {};
  const t = latest('text'), i = latest('image'), v = latest('video');
  return { text: { input: Number(t.input_usd_per_mtok || 0), output: Number(t.output_usd_per_mtok || 0) }, image: { unit: Number(i.usd_per_unit || 0) }, video: { unit: Number(v.usd_per_unit || 0) } };
}
const mkEst = plan => mkEstimate(plan, mkPricing(), Number(MK.settings.usd_brl) || 5.5);
const mkMonthSpend = () => { const ym = ymd(TODAY).slice(0, 7); return MK.usage.filter(u => String(u.created_at).startsWith(ym)).reduce((n, u) => n + Number(u.cost_brl), 0); };

/* ═══════════ Planejamento ═══════════ */
function renderMarketing() {
  if (!MK.loaded && !MK.loading) mkLoad();
  const ym = MK.month, monthPosts = MK.posts.filter(p => String(p.post_date).startsWith(ym));
  const pend = MK.pieces.filter(p => p.approval_status === 'em_aprovacao').length;
  const kpis = [['Posts no mês', monthPosts.length, `${monthPosts.filter(p => p.status === 'publicado').length} publicado(s)`],
    ['Prontos para publicar', monthPosts.filter(p => p.status === 'pronto').length, 'peça aprovada e legenda definida'],
    ['Peças em aprovação', pend, pend ? 'aguardando a administração' : 'nada pendente'],
    ['IA no mês', mkBrl(mkMonthSpend()), 'custo real registrado']];
  const body = !MK.loaded ? '<div class="panel-pad muted">Carregando o planejamento…</div>' : MK.tab === 'calendar' ? mkCalendar() : mkCampaignList();
  return `${viewBanner('marketing')}
  <div class="page-head"><div><div class="eyebrow">Marketing · social media</div><h1>Planejamento</h1><p>Calendário de posts e campanhas. Cada post pode ter uma peça criada no Estúdio; só peças aprovadas ficam prontas para publicar.</p></div>
    <div class="head-actions"><button class="btn" data-mk="campaign-new" data-edit>${icon('target')} Nova campanha</button><button class="btn primary" data-mk="post-new" data-edit>${icon('plus')} Novo post</button></div></div>
  ${MK.error ? `<div class="banner warn">${icon('alert')}<span>${esc(MK.error)}</span></div>` : ''}
  <div class="grid g4 mb">${kpis.map(([l, v, f]) => `<div class="kpi"><div class="kpi-label">${l}</div><div class="kpi-value">${v}</div><div class="kpi-foot">${f}</div></div>`).join('')}</div>
  <section class="panel"><div class="panel-head"><div class="seg" role="tablist">${[['calendar', 'Calendário'], ['campaigns', `Campanhas (${MK.campaigns.length})`]].map(([id, l]) => `<button class="${MK.tab === id ? 'on' : ''}" data-mk="tab" data-v="${id}" role="tab" aria-selected="${MK.tab === id}">${l}</button>`).join('')}</div>
    ${MK.tab === 'calendar' ? `<div class="mk-month"><button class="btn sm ghost sq" data-mk="month" data-dir="-1" aria-label="Mês anterior">${icon('left')}</button><b>${mkMonthLabel(ym)}</b><button class="btn sm ghost sq" data-mk="month" data-dir="1" aria-label="Próximo mês">${icon('right')}</button>
      <label class="chip mk-compchk"><input type="checkbox" data-mkf="comps" ${MK.showComps ? 'checked' : ''}> ${icon('trophy')} Competições${MK.comps.length ? ` (${MK.comps.filter(k => k.date.startsWith(ym)).length})` : ''}</label></div>` : ''}</div>
  ${body}</section>`;
}
// Competições previstas (função v2_marketing_competitions, migração 045): data e hora no fuso local
const MK_COMP_TYPE = { game: 'Jogo', tournament: 'Torneio', friendly: 'Amistoso', championship: 'Campeonato' };
function mkCompRow(c) { const d = new Date(c.scheduled_at); return { id: c.id, name: c.name, team: c.team_name || '', date: ymd(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, place: c.venue_name || '', opponent: c.opponent || '', round: c.round || '', type: c.competition_type || 'game', status: c.status || 'upcoming' }; }
const mkCompTitle = k => `${k.name}${k.opponent ? ' x ' + k.opponent : ''}`;
function mkCompDialog(id) {
  const k = MK.comps.find(x => x.id === id); if (!k) return;
  const d = parseYmd(k.date), dd = Math.round((d - TODAY) / 864e5);
  const rows = [['Equipe', k.team], ['Data', `${fmtDate(d)} às ${k.time} · ${dd < 0 ? 'já aconteceu' : dd === 0 ? 'hoje' : dd === 1 ? 'amanhã' : `em ${dd} dias`}`], ['Tipo', MK_COMP_TYPE[k.type]], ['Adversário', k.opponent], ['Fase / rodada', k.round], ['Local', k.place], ['Situação', k.status === 'postponed' ? 'Adiada' : k.status === 'completed' ? 'Realizada' : 'Prevista']].filter(([, v]) => v);
  const can = mkCan('marketing'), before = ymd(addDays(d, -3));
  openDialog(dHead('Competição', esc(mkCompTitle(k)), 'Planeje a divulgação antes do jogo e o resultado depois.') + `<div class="d-body">${rows.map(([l, v]) => `<div class="stat-line"><span class="muted">${l}</span><b>${esc(v)}</b></div>`).join('')}</div>
    <div class="d-foot"><button class="btn" data-act="close-dialog">Fechar</button>${can ? `<button class="btn" data-mk="comp-post" data-id="${esc(k.id)}" data-date="${dd > 3 ? before : ymd(TODAY) > k.date ? k.date : ymd(TODAY)}" data-kind="pre">${icon('calendar')} Post de divulgação</button><button class="btn" data-mk="comp-post" data-id="${esc(k.id)}" data-date="${ymd(addDays(d, 1))}" data-kind="pos">${icon('trophy')} Post de resultado</button>` : ''}${mkCan('studio') ? `<button class="btn primary" data-mk="comp-piece" data-id="${esc(k.id)}">${icon('sparkle')} Criar peça “Dia de jogo”</button>` : ''}</div>`);
}
// Peça "Dia de jogo" já com confronto, data, hora e local da competição
async function mkCompPiece(id) {
  const k = MK.comps.find(x => x.id === id); if (!k) return;
  closeDialog();
  try { await mkLoadBrand(); } catch (e) { return toast(mkErr(e), true); }
  Object.assign(MK.np, { fmt: 'feed', post: '' }); mkCreatePiece('dia-de-jogo');
  const d = parseYmd(k.date), s = MK.ed.slides[0];
  Object.assign(s.v, { match: (k.opponent ? `Apollo x ${k.opponent}` : k.name).slice(0, 40), date: `${DOW[d.getDay()]} · ${pad(d.getDate())}/${pad(d.getMonth() + 1)} · ${k.time.replace(':00', 'h')}`.slice(0, 30), place: (k.place || '').slice(0, 52) });
  MK.ed.title = `Dia de jogo · ${k.name}`.slice(0, 140); MK.histCur = ''; render();
}
function mkCalendar() {
  const [y, m] = MK.month.split('-').map(Number), first = new Date(y, m - 1, 1), start = startOfWeek(first), cells = [];
  for (let i = 0; i < 42; i++) { const d = addDays(start, i); if (i >= 35 && d.getMonth() !== m - 1) break; cells.push(d); }
  const head = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => `<div class="mk-dow">${d}</div>`).join('');
  return `<div class="mk-cal">${head}${cells.map(d => {
    const key = ymd(d), items = MK.posts.filter(p => p.post_date === key), out = d.getMonth() !== m - 1;
    const comps = MK.showComps ? MK.comps.filter(k => k.date === key) : [];
    return `<div class="mk-day ${out ? 'out' : ''} ${key === ymd(TODAY) ? 'today' : ''}"><div class="mk-dn"><span>${d.getDate()}</span><button class="mk-add" data-mk="post-new" data-date="${key}" data-edit title="Novo post em ${fmtDate(d)}" aria-label="Novo post em ${fmtDate(d)}">${icon('plus')}</button></div>
      ${comps.map(k => `<button class="mk-chip comp" data-mk="comp-view" data-id="${esc(k.id)}" title="${esc(`${mkCompTitle(k)} · ${k.team} · ${k.time}${k.place ? ' · ' + k.place : ''}`)}">${icon('trophy')}<b>${esc(k.time)}</b> ${esc(mkCompTitle(k))}</button>`).join('')}
      ${items.map(p => `<button class="mk-chip ${p.status}" data-mk="post-edit" data-id="${p.id}" title="${esc(p.objective || '')}"><b>${esc(MK_NET[p.network] || p.network)}</b> ${esc(p.objective || p.caption || 'Sem objetivo')}</button>`).join('')}</div>`;
  }).join('')}</div>${!MK.posts.length ? '<div class="panel-pad muted small">Nenhum post planejado. Clique em um dia ou em “Novo post”.</div>' : ''}`;
}
function mkCampaignList() {
  if (!MK.campaigns.length) return emptyState('Nenhuma campanha', 'Crie uma campanha para agrupar posts, peças e o orçamento de IA. Peças e posts também funcionam sem campanha.', `<button class="btn primary sm" data-mk="campaign-new" data-edit>${icon('plus')} Nova campanha</button>`);
  return `<div class="mk-cards">${MK.campaigns.map(c => {
    const spent = mkSpent(c.id), budget = Number(c.ai_budget_brl), pct = budget > 0 ? Math.min(100, spent / budget * 100) : 0;
    const posts = MK.posts.filter(p => p.campaign_id === c.id), pieces = MK.pieces.filter(p => p.campaign_id === c.id);
    return `<article class="mk-card"><div class="mk-card-h"><div><b>${esc(c.name)}</b><div class="hint">${c.starts_on ? `${fmtDate(parseLocal(c.starts_on))}${c.ends_on ? ' a ' + fmtDate(parseLocal(c.ends_on)) : ''}` : 'Sem período'}</div></div><span class="tag nodot ${c.status === 'ativa' ? 'st-ok' : c.status === 'encerrada' ? 'st-cancelado' : 'st-info'}">${esc(c.status)}</span></div>
      ${c.goal ? `<p class="small muted">${esc(c.goal)}</p>` : ''}
      <div class="mk-budget"><div class="hint">Orçamento de IA: ${budget > 0 ? `${mkBrl(spent)} de ${mkBrl(budget)}` : `${mkBrl(spent)} usados · sem limite`}</div>${budget > 0 ? `<div class="mk-bar ${pct >= 90 ? 'hot' : ''}"><i style="width:${pct}%"></i></div>` : ''}</div>
      <div class="mk-card-f"><span class="hint">${posts.length} post(s) · ${pieces.length} peça(s)</span><span><button class="btn sm" data-mk="campaign-edit" data-id="${c.id}" data-edit>${icon('edit')} Editar</button> <button class="btn sm primary" data-mk="piece-new" data-campaign="${c.id}" data-edit>${icon('sparkle')} Criar peça</button></span></div></article>`;
  }).join('')}</div>`;
}
function mkPostForm(id, date, pieceId, preset = {}) {
  const p = id ? MK.posts.find(x => x.id === id) : { post_date: date || ymd(TODAY), network: 'instagram', status: 'ideia', campaign_id: '', piece_id: pieceId || '', objective: preset.objective || '', caption: '' };
  if (!p) return;
  const piece = mkPiece(p.piece_id), approved = piece?.approval_status === 'aprovada';
  openDialog(dHead(id ? 'Post' : 'Novo post', id ? 'Editar post' : 'Planejar post', 'Cada post pode ter uma peça criada no Estúdio.') + `<form class="d-body" novalidate>
    <div class="row2"><div class="field"><label for="mkpDate">Data *</label><input class="input" type="date" id="mkpDate" value="${esc(p.post_date)}"></div>
      <div class="field"><label for="mkpNet">Rede</label><select class="select" id="mkpNet">${Object.entries(MK_NET).map(([k, l]) => `<option value="${k}" ${p.network === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
    <div class="field"><label for="mkpObj">Objetivo</label><input class="input" id="mkpObj" maxlength="300" value="${esc(p.objective || '')}" placeholder="Ex.: lotar a peneira de sábado"></div>
    <div class="field"><label for="mkpCap">Legenda</label><textarea class="input" id="mkpCap" maxlength="2200" rows="5">${esc(p.caption || '')}</textarea><span class="hint">Até 2.200 caracteres.</span></div>
    <div class="row2"><div class="field"><label for="mkpCamp">Campanha</label><select class="select" id="mkpCamp"><option value="">Sem campanha</option>${MK.campaigns.map(c => `<option value="${c.id}" ${p.campaign_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="mkpSt">Status</label><select class="select" id="mkpSt">${Object.entries(MK_POST).map(([k, [l]]) => `<option value="${k}" ${p.status === k ? 'selected' : ''} ${['pronto', 'publicado'].includes(k) && piece && !approved ? 'disabled' : ''}>${l}</option>`).join('')}</select>
      ${piece && !approved ? '<span class="hint">“Pronto” só depois que a peça for aprovada.</span>' : ''}</div></div>
    <div class="field"><label for="mkpPiece">Peça do Estúdio</label><select class="select" id="mkpPiece"><option value="">Sem peça</option>${MK.pieces.map(x => `<option value="${x.id}" ${p.piece_id === x.id ? 'selected' : ''}>${esc(x.title)} · ${esc(MK_APPR[x.approval_status][0])}</option>`).join('')}</select></div>
    <div class="banner warn" id="mkpErr" hidden></div></form>
  <div class="d-foot">${id ? `<button class="btn danger left" data-mk="post-del" data-id="${id}">${icon('trash')} Excluir</button>` : ''}${id && !p.piece_id ? `<button class="btn" data-mk="piece-new" data-post="${id}" data-campaign="${esc(p.campaign_id || '')}">${icon('sparkle')} Criar peça</button>` : ''}<button class="btn" data-act="close-dialog">Cancelar</button><button class="btn primary" data-mk="post-save" data-id="${id || ''}">Salvar</button></div>`);
}
async function mkSavePost(id) {
  const g = x => $('#' + x).value;
  const row = { post_date: g('mkpDate'), network: g('mkpNet'), objective: g('mkpObj').trim() || null, caption: g('mkpCap').trim() || null, campaign_id: g('mkpCamp') || null, status: g('mkpSt'), piece_id: g('mkpPiece') || null };
  if (!row.post_date) return mkDialogErr('mkpErr', 'Informe a data do post.');
  const { error } = await (id ? mkDb().from('marketing_posts').update(row).eq('id', id) : mkDb().from('marketing_posts').insert(row));
  if (error) return mkDialogErr('mkpErr', mkErr(error));
  closeDialog(); toast('Post salvo.'); await mkLoad(true);
}
function mkCampaignForm(id) {
  const c = id ? mkCampaign(id) : { name: '', goal: '', starts_on: '', ends_on: '', ai_budget_brl: 0, status: 'planejada' };
  openDialog(dHead(id ? 'Campanha' : 'Nova campanha', id ? 'Editar campanha' : 'Criar campanha', 'Agrupa posts e peças e limita o gasto com IA.') + `<form class="d-body" novalidate>
    <div class="field"><label for="mkcName">Nome *</label><input class="input" id="mkcName" maxlength="120" value="${esc(c.name)}" placeholder="Ex.: Peneira de novembro"></div>
    <div class="field"><label for="mkcGoal">Meta</label><textarea class="input" id="mkcGoal" maxlength="600" rows="3" placeholder="Ex.: 40 inscritos na peneira">${esc(c.goal || '')}</textarea></div>
    <div class="row2"><div class="field"><label for="mkcStart">Início</label><input class="input" type="date" id="mkcStart" value="${esc(c.starts_on || '')}"></div><div class="field"><label for="mkcEnd">Fim</label><input class="input" type="date" id="mkcEnd" value="${esc(c.ends_on || '')}"></div></div>
    <div class="row2"><div class="field"><label for="mkcBudget">Orçamento de IA (R$)</label><input class="input" type="number" min="0" step="0.5" id="mkcBudget" value="${Number(c.ai_budget_brl) || 0}"><span class="hint">0 = sem limite. Ao esgotar, a geração por IA é recusada.</span></div>
      <div class="field"><label for="mkcSt">Situação</label><select class="select" id="mkcSt">${['planejada', 'ativa', 'encerrada'].map(s => `<option ${c.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div></div>
    <div class="banner warn" id="mkcErr" hidden></div></form>
  <div class="d-foot">${id ? `<button class="btn danger left" data-mk="campaign-del" data-id="${id}">${icon('trash')} Excluir</button>` : ''}<button class="btn" data-act="close-dialog">Cancelar</button><button class="btn primary" data-mk="campaign-save" data-id="${id || ''}">Salvar</button></div>`);
}
async function mkSaveCampaign(id) {
  const row = { name: $('#mkcName').value.trim(), goal: $('#mkcGoal').value.trim() || null, starts_on: $('#mkcStart').value || null, ends_on: $('#mkcEnd').value || null,
    ai_budget_brl: Math.max(0, Number($('#mkcBudget').value) || 0), status: $('#mkcSt').value };
  if (row.name.length < 2) return mkDialogErr('mkcErr', 'Informe o nome da campanha.');
  if (row.starts_on && row.ends_on && row.ends_on < row.starts_on) return mkDialogErr('mkcErr', 'O fim não pode ser antes do início.');
  const { error } = await (id ? mkDb().from('marketing_campaigns').update(row).eq('id', id) : mkDb().from('marketing_campaigns').insert(row));
  if (error) return mkDialogErr('mkcErr', mkErr(error));
  closeDialog(); toast('Campanha salva.'); await mkLoad(true);
}

/* ═══════════ Estúdio: arquivos e lista de peças ═══════════ */
async function mkSignedBlob(path) {
  const { data, error } = await mkDb().storage.from('marketing').createSignedUrl(path, 600);
  if (error) throw error;
  const r = await fetch(data.signedUrl); if (!r.ok) throw new Error('Arquivo indisponível.');
  return r.blob();
}
const MK_RAW = new Map();
async function mkResolveImage(ref) {
  if (!ref) return '';
  if (ref.startsWith('data:')) return ref;
  const path = ref.replace(/^storage:/, '');
  if (MK_RAW.has(path)) return MK_RAW.get(path);
  const url = await mkBlobToDataUrl(await mkSignedBlob(path)); MK_RAW.set(path, url); return url;
}
const mkPieceStrip = p => (p.meta && p.meta.strip) || [];
const mkPieceSv = p => (p.meta && p.meta.sv) || {};
function renderStudio() {
  if (!MK.loaded && !MK.loading) mkLoad();
  if (!MK_CACHE.assets) mkLoadBrand().then(() => { if (S.page === 'studio') render(); }).catch(e => { MK.error = mkErr(e); });
  document.documentElement.classList.toggle('st-open', !!MK.ed);
  if (MK.ed) return mkEditorPage();
  const admin = mkIsAdmin(), pend = MK.pieces.filter(p => p.approval_status === 'em_aprovacao');
  const list = MK.pieces.filter(p => MK.filter === 'all' || p.approval_status === MK.filter);
  const tabs = [['all', 'Todas'], ['rascunho', 'Rascunhos'], ['em_aprovacao', 'Em aprovação'], ['aprovada', 'Aprovadas'], ['reprovada', 'Reprovadas']];
  const cards = list.map(p => {
    const f = MK_FORMATS[p.format] || MK_FORMATS.feed, slide = (p.slides || [])[0], camp = mkCampaign(p.campaign_id);
    let thumb = '<span class="muted small">carregando…</span>';
    if (MK_CACHE.assets && slide && slide.e) {
      const key = p.id + '|' + p.updated_at;
      if (!MK.thumbs.has(key)) { MK.thumbs.add(key); mkEnsure([slide], mkPieceStrip(p), mkPieceSv(p), p.format, mkResolveImage).then(n => { if (n && S.page === 'studio' && !MK.ed) render(); }); }
      thumb = mkScaled(mkSlideHtml(slide, p.format, mkCtx(), 0, (p.slides || []).length, mkPieceStrip(p), mkPieceSv(p)), f, 210, 260);
    }
    return `<article class="mk-piece"><button class="mk-thumb" data-mk="piece-open" data-id="${p.id}" aria-label="Abrir ${esc(p.title)}">${thumb}</button>
      <div class="mk-piece-b"><b>${esc(p.title)}</b><div class="hint">${esc(f.label)}${(p.slides?.length || 1) > 1 ? ` · ${p.slides.length} lâminas` : ''}${camp ? ` · ${esc(camp.name)}` : ''}</div>${mkTag(MK_APPR[p.approval_status])}${p.review_note && p.approval_status === 'reprovada' ? `<div class="hint" style="color:var(--brand-ink)">${esc(p.review_note)}</div>` : ''}</div></article>`;
  }).join('');
  // Atalhos: os tipos de post mais usados abrem o editor com um clique
  const quick = MK_CACHE.assets ? MK_QUICK.map(([id, fmt]) => { const l = mkBaseLayout(id), f = MK_FORMATS[fmt]; return `<button class="mk-quick" data-mk="piece-quick" data-layout="${id}" data-fmt="${fmt}" data-edit>${mkScaled(mkSlideHtml(mkNewSlide(l), fmt, { ...mkCtx(), ph: true }), f, 104, 130)}<b>${esc(l.name)}</b><small>${esc(f.label)}</small></button>`; }).join('') : '';
  if (MK_CACHE.assets && !MK.quickReady) { MK.quickReady = true; mkEnsure(MK_QUICK.map(([id]) => mkNewSlide(mkBaseLayout(id))), [], {}, 'feed', mkResolveImage).then(n => { if (n && S.page === 'studio' && !MK.ed) render(); }); }
  return `${viewBanner('studio')}
  <div class="page-head"><div><div class="eyebrow">Marketing · criação</div><h1>Estúdio de peças</h1><p>Crie artes a partir de layouts editáveis com a marca da Apollo. A IA ajuda nos textos, nas imagens e na revisão; o custo aparece antes de cada geração.</p></div>
    <div class="head-actions"><button class="btn primary" data-mk="piece-new" data-edit>${icon('plus')} Nova peça</button></div></div>
  ${MK.error ? `<div class="banner warn">${icon('alert')}<span>${esc(MK.error)}</span></div>` : ''}
  ${quick ? `<section class="panel mb"><div class="panel-head"><div><h2 style="margin:0;font-size:15px">Comece rápido</h2><div class="sub">Os tipos de post mais usados por equipes de vôlei. Um clique abre o editor.</div></div><button class="btn sm" data-mk="piece-new" data-edit>${icon('layers')} Ver todos os layouts</button></div><div class="mk-quicks">${quick}</div></section>` : ''}
  ${admin && pend.length ? `<div class="banner note">${icon('shield')}<span><b>${pend.length} peça(s) aguardando sua aprovação.</b> <button class="btn sm" data-mk="filter" data-v="em_aprovacao">Ver agora</button></span></div>` : ''}
  <section class="panel mb"><div class="panel-head"><div class="seg" role="tablist">${tabs.map(([id, l]) => `<button class="${MK.filter === id ? 'on' : ''}" data-mk="filter" data-v="${id}">${l}${id !== 'all' ? ` <span class="bl-count">${MK.pieces.filter(p => p.approval_status === id).length}</span>` : ''}</button>`).join('')}</div></div>
    ${!MK.loaded ? '<div class="panel-pad muted">Carregando…</div>' : list.length ? `<div class="mk-pieces">${cards}</div>` : emptyState('Nenhuma peça aqui', 'Crie a primeira peça escolhendo um layout.', `<button class="btn primary sm" data-mk="piece-new" data-edit>${icon('plus')} Nova peça</button>`)}</section>
  ${mkCalculatorPanel()}`;
}
function mkScaled(html, f, maxW, maxH) {
  const k = Math.min(maxW / f.w, maxH / f.h);
  return `<div class="mk-scaled" style="width:${Math.round(f.w * k)}px;height:${Math.round(f.h * k)}px"><div style="width:${f.w}px;height:${f.h}px;transform:scale(${k});transform-origin:0 0">${html}</div></div>`;
}

/* ─── Calculadora de custo e consumo ─── */
const MK_QUICK = [['destaque', 'feed'], ['dia-de-jogo', 'feed'], ['resultado-foto', 'feed'], ['card-atleta', 'feed'], ['aniversario', 'feed'], ['capa-carrossel', 'carousel'], ['conquista', 'story']];
function mkCalculatorPanel() {
  const c = MK.calc, slotsMax = [28, 42, 110, 30, 52, 34];
  const est = mkEst({ copies: Array.from({ length: c.copies }, () => ({ briefChars: c.brief, slots: slotsMax })), images: c.images, reviews: c.reviews, videoSeconds: c.video });
  const monthTotal = mkMonthSpend(), admin = mkIsAdmin();
  const byCamp = MK.campaigns.map(x => [x, mkSpent(x.id)]).filter(([x, n]) => n > 0 || Number(x.ai_budget_brl) > 0);
  const num = (k, label, min = 0, max = 99, step = 1) => `<div class="field"><label>${label}</label><input class="input" type="number" min="${min}" max="${max}" step="${step}" data-mkf="calc" data-k="${k}" value="${c[k]}"></div>`;
  return `<details class="panel mb mk-calcbox" ${MK.calcOpen ? 'open' : ''}><summary class="panel-head"><div><h2 style="margin:0;font-size:15px">Custos de IA</h2><div class="sub">Calculadora de previsão, consumo do mês ${mkBrl(monthTotal)} e preços. O custo real de cada geração é registrado.</div></div><span class="btn sm ghost">Abrir</span></summary>
    <div class="panel-pad"><div class="mk-calc">
      <div>${num('copies', 'Gerações de texto')}${num('brief', 'Tamanho do briefing (caracteres)', 0, 1500, 50)}${num('images', 'Imagens por IA')}${num('reviews', 'Revisões da arte por IA')}${num('video', 'Segundos de vídeo (4 a 8 por vídeo)', 0, 120)}</div>
      <div class="mk-calc-out"><table class="mk-tbl"><thead><tr><th>Item</th><th>Quantidade</th><th class="num">Custo estimado</th></tr></thead><tbody>
        ${est.lines.map(l => `<tr><td>${esc(l.label)}${l.tokens ? `<div class="hint">≈ ${l.tokens.input.toLocaleString('pt-BR')} tokens de entrada · ${l.tokens.outputMin.toLocaleString('pt-BR')} a ${l.tokens.outputMax.toLocaleString('pt-BR')} de saída</div>` : ''}</td><td>${esc(l.qty)}</td><td class="num">${mkRange(l.brlMin, l.brlMax)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Informe as quantidades.</td></tr>'}
        </tbody><tfoot><tr><td colspan="2"><b>Total previsto</b></td><td class="num"><b>${mkRange(est.brlMin, est.brlMax)}</b></td></tr></tfoot></table>
        <p class="hint">Cotação usada: US$ 1 = R$ ${Number(MK.settings.usd_brl).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. Texto: estimativa por caracteres (1 token ≈ 3,2 caracteres). Imagem e vídeo têm preço fixo por unidade. Pincéis, duotone e layouts são locais e não custam nada.</p></div></div></div>
    <div class="panel-pad" style="border-top:1px solid var(--line-2)"><div class="mk-two">
      <div><h3 class="mk-h3">Consumo</h3><div class="kpi" style="margin-bottom:10px"><div class="kpi-label">Gasto com IA neste mês</div><div class="kpi-value">${mkBrl(monthTotal)}</div><div class="kpi-foot">${MK.usage.length} chamada(s) registradas</div></div>
        ${byCamp.length ? `<table class="mk-tbl"><thead><tr><th>Campanha</th><th class="num">Usado</th><th class="num">Orçamento</th></tr></thead><tbody>${byCamp.map(([x, n]) => `<tr><td>${esc(x.name)}</td><td class="num">${mkBrl(n)}</td><td class="num">${Number(x.ai_budget_brl) > 0 ? mkBrl(Number(x.ai_budget_brl)) : 'sem limite'}</td></tr>`).join('')}</tbody></table>` : '<p class="hint">Nenhum uso ligado a campanhas ainda.</p>'}</div>
      <div><h3 class="mk-h3">Últimas gerações</h3>${MK.usage.length ? `<table class="mk-tbl"><thead><tr><th>Quando</th><th>Ação</th><th class="num">Custo</th></tr></thead><tbody>${MK.usage.slice(0, 8).map(u => `<tr><td>${mkWhen(u.created_at)}</td><td>${({ copy: 'Textos', image: 'Imagem', review: 'Revisão', video: 'Vídeo' })[u.action] || u.action}</td><td class="num">${mkBrl(Number(u.cost_brl))}</td></tr>`).join('')}</tbody></table>` : '<p class="hint">Sem gerações registradas.</p>'}</div></div></div>
    ${admin ? `<div class="panel-pad" style="border-top:1px solid var(--line-2)"><h3 class="mk-h3">Preços (administração)</h3><p class="hint">Valores em dólar, conforme a tabela do Gemini. Confira em ai.google.dev/gemini-api/docs/pricing antes de usar para orçamento.</p>
      <table class="mk-tbl"><thead><tr><th>Modelo</th><th>Tipo</th><th>Entrada / 1M tokens</th><th>Saída / 1M tokens</th><th>Por unidade</th></tr></thead><tbody>${MK.pricing.map(r => `<tr><td><code>${esc(r.model)}</code><div class="hint">${esc(r.note || '')}</div></td><td>${esc(r.kind)}</td>
        <td>${r.kind === 'text' ? `<input class="input mk-num" type="number" step="0.01" min="0" data-mkf="price" data-model="${esc(r.model)}" data-k="input_usd_per_mtok" value="${r.input_usd_per_mtok ?? 0}">` : '—'}</td>
        <td>${r.kind === 'text' ? `<input class="input mk-num" type="number" step="0.01" min="0" data-mkf="price" data-model="${esc(r.model)}" data-k="output_usd_per_mtok" value="${r.output_usd_per_mtok ?? 0}">` : '—'}</td>
        <td>${r.kind !== 'text' ? `<input class="input mk-num" type="number" step="0.001" min="0" data-mkf="price" data-model="${esc(r.model)}" data-k="usd_per_unit" value="${r.usd_per_unit ?? 0}"> <span class="hint">${r.kind === 'image' ? 'por imagem' : 'por segundo'}</span>` : '—'}</td></tr>`).join('')}</tbody></table>
      <div class="row2" style="margin-top:12px"><div class="field"><label>Cotação (R$ por US$ 1)</label><input class="input" type="number" step="0.01" min="0.01" id="mkUsd" value="${MK.settings.usd_brl}"></div>
        <div class="field"><label>Pedir confirmação de vídeo acima de (R$)</label><input class="input" type="number" step="1" min="0" id="mkVidLimit" value="${MK.settings.video_confirm_brl}"></div></div>
      <button class="btn primary sm" data-mk="prices-save">Salvar preços</button></div>` : ''}</details>`;
}
async function mkSavePrices() {
  try {
    const db = mkDb();
    for (const r of MK.pricing) {
      const patch = { updated_at: new Date().toISOString() };
      $$(`[data-mkf="price"][data-model="${CSS.escape(r.model)}"]`).forEach(i => { patch[i.dataset.k] = Math.max(0, Number(i.value) || 0); });
      const { error } = await db.from('ai_pricing').update(patch).eq('model', r.model); if (error) throw error;
    }
    const { error } = await db.from('ai_settings').update({ usd_brl: Math.max(0.01, Number($('#mkUsd').value) || 5.5), video_confirm_brl: Math.max(0, Number($('#mkVidLimit').value) || 0), updated_at: new Date().toISOString() }).eq('id', true);
    if (error) throw error;
    toast('Preços salvos.'); await mkLoad(true);
  } catch (e) { toast(mkErr(e), true); }
}

/* ─── Nova peça ─── */
// Galeria de layouts: escolhe o formato, filtra por tipo de publicação e um clique já abre o editor
async function mkNewPiece({ campaign = '', post = '' } = {}) {
  if (!mkCan('studio')) return toast('Seu perfil não pode criar peças.', true);
  try { await mkLoadBrand(); } catch (e) { return toast(mkErr(e), true); }
  Object.assign(MK.np, { campaign, post, q: '' });
  openDialog(`<div class="d-head"><div><div class="eyebrow">Nova peça</div><h2 id="dlgTitle">Escolha um ponto de partida</h2><p>Tudo é editável depois: textos, fotos, cores, posições e pincéis.</p></div><button class="x" data-act="close-dialog" aria-label="Fechar">${icon('x')}</button></div>
    <div class="d-body np"><div class="np-bar"><div class="seg" role="tablist" id="npFmt">${mkNpFmts()}</div>
      <input class="input np-q" id="npQ" type="search" placeholder="Buscar (ex.: resultado, aniversário)" aria-label="Buscar layout">
      <select class="select np-camp" id="npCamp" aria-label="Campanha"><option value="">Sem campanha</option>${MK.campaigns.map(c => `<option value="${c.id}" ${campaign === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
    <div class="st-chips" id="npCats">${mkNpCats()}</div><div class="np-grid" id="npGrid">${mkNpGrid()}</div></div>`, 'mk-wide');
  mkNpThumbs();
}
const mkNpFmts = () => Object.entries(MK_FORMATS).map(([k, f]) => `<button class="${MK.np.fmt === k ? 'on' : ''}" data-mk="np-fmt" data-v="${k}" role="tab" aria-selected="${MK.np.fmt === k}">${esc(f.label)}</button>`).join('');
const mkNpCats = () => ['Todos', ...mkCats, ...(MK.layouts.length ? ['Meus layouts'] : [])].map(c => `<button class="${MK.np.cat === c ? 'on' : ''}" data-mk="np-cat" data-v="${esc(c)}">${esc(c)}</button>`).join('');
function mkNpList() {
  const { fmt, cat, q } = MK.np, s = q.trim().toLowerCase();
  return [MK_BLANK, ...mkAllLayouts()].filter(l => l.formats.includes(fmt) && (l.id === 'branco' || cat === 'Todos' || (cat === 'Meus layouts' ? l.user : l.cat === cat)) && (!s || `${l.name} ${l.hint || ''} ${l.cat || ''}`.toLowerCase().includes(s)));
}
function mkNpGrid() {
  const f = MK_FORMATS[MK.np.fmt], list = mkNpList();
  return list.map(l => `<button class="np-card" data-mk="piece-create" data-layout="${esc(l.id)}">${mkScaled(mkSlideHtml(mkNewSlide(l), MK.np.fmt, { ...mkCtx(), ph: true }), f, 168, 210)}<b>${esc(l.name)}</b><small>${esc(l.user ? 'Meu layout' : l.hint || '')}</small></button>`).join('') || '<p class="hint">Nenhum layout encontrado.</p>';
}
function mkNpThumbs() {
  const fmt = MK.np.fmt;
  mkEnsure(mkNpList().map(l => mkNewSlide(l)), [], {}, fmt, mkResolveImage).then(n => { const g = $('#npGrid'); if (n && g && MK.np.fmt === fmt) g.innerHTML = mkNpGrid(); }).catch(() => {});
}
function mkNpRefresh() { const a = $('#npFmt'), b = $('#npCats'), g = $('#npGrid'); if (a) a.innerHTML = mkNpFmts(); if (b) b.innerHTML = mkNpCats(); if (g) g.innerHTML = mkNpGrid(); mkNpThumbs(); }
function mkStartEditor(ed, newPiece) {
  MK.ed = ed;
  const photo = ed.slides[0]?.e.some(e => e.type === 'image');
  Object.assign(MK, { edSlide: 0, sel: '', tool: null, review: null, video: null, histCur: '', hist: [], fut: [], editing: '', ui: { ...MK.ui, zoom: 0, rail: newPiece ? (photo ? 'photos' : 'text') : MK.ui.rail || 'layouts', q: '', scrollTo: null } });
}
function mkCreatePiece(layoutId) {
  const lay = mkLayoutById(layoutId), fmt = lay.formats.includes(MK.np.fmt) ? MK.np.fmt : lay.formats[0], d = new Date();
  const title = `${lay.id === 'branco' ? 'Nova peça' : lay.name} · ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  const campaign = $('#npCamp')?.value || '';
  closeDialog();
  mkStartEditor({ id: null, title, format: fmt, campaignId: campaign, postId: MK.np.post || '', slides: [mkNewSlide(lay)], strip: [], sv: {}, gallery: [], approval_status: 'rascunho', review_note: '', export_paths: [], dirty: true }, true);
  go('studio');
}
function mkOpenPiece(id) {
  const p = mkPiece(id); if (!p) return;
  const slides = mkClone(p.slides || []).filter(s => s && s.e);
  mkStartEditor({ id: p.id, title: p.title, format: p.format, campaignId: p.campaign_id || '', postId: '', slides: slides.length ? slides : [mkNewSlide(MK_LAYOUTS[0])], strip: mkClone(mkPieceStrip(p)), sv: mkClone(mkPieceSv(p)), gallery: mkClone((p.meta && p.meta.gallery) || []),
    approval_status: p.approval_status, review_note: p.review_note || '', export_paths: p.export_paths || [], dirty: false }, false);
  render();
}

/* ─── Salvar, exportar, aprovar ─── */
// Toda alteração marca a peça como não salva e entra no histórico de desfazer (agrupado em ~0,3 s)
const mkTouch = () => { MK.ed.dirty = true; if (typeof edQueueCommit === 'function') edQueueCommit(); };
async function mkUploadBlob(path, blob, contentType) {
  const { error } = await mkDb().storage.from('marketing').upload(path, blob, { contentType, upsert: true });
  if (error) throw error;
}
async function mkSavePiece(silent) {
  const ed = MK.ed, row = { title: ed.title.trim(), template_id: ed.slides[0]?.l || 'destaque', format: ed.format, slides: ed.slides, meta: { strip: ed.strip, sv: ed.sv, gallery: (ed.gallery || []).slice(-40) }, campaign_id: ed.campaignId || null };
  if (row.title.length < 2) { toast('Dê um nome à peça.', true); return false; }
  const db = mkDb();
  if (ed.id) { const { error } = await db.from('marketing_pieces').update(row).eq('id', ed.id); if (error) { toast(mkErr(error), true); return false; } }
  else {
    const { data, error } = await db.from('marketing_pieces').insert(row).select('id').single();
    if (error) { toast(mkErr(error), true); return false; }
    ed.id = data.id;
    if (ed.postId) { const r = await db.from('marketing_posts').update({ piece_id: ed.id, status: 'em_criacao', campaign_id: ed.campaignId || null }).eq('id', ed.postId); if (r.error) toast(mkErr(r.error), true); ed.postId = ''; }
  }
  ed.dirty = false; await mkLoad(true); if (!silent) toast('Peça salva.'); return true;
}
async function mkExportBlobs() {
  const ed = MK.ed, f = MK_FORMATS[ed.format], out = [];
  await mkEnsure(ed.slides, ed.strip, ed.sv, ed.format, mkResolveImage);
  for (let i = 0; i < ed.slides.length; i++) out.push(await mkRasterize(mkSlideHtml(ed.slides[i], ed.format, mkCtx(), i, ed.slides.length, ed.strip, ed.sv), f.w, f.h));
  return out;
}
function mkSaveAs(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
const mkSlug = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'peca';
async function mkDownload() {
  MK.busy = 'export'; render();
  try {
    const blobs = await mkExportBlobs(), base = `apollo-${mkSlug(MK.ed.title)}`;
    if (blobs.length === 1) mkSaveAs(blobs[0], `${base}.png`);
    else { const zip = new JSZip(); blobs.forEach((b, i) => zip.file(`${base}-${i + 1}.png`, b)); mkSaveAs(await zip.generateAsync({ type: 'blob' }), `${base}.zip`); }
  } catch (e) { toast('Não foi possível exportar: ' + mkErr(e), true); }
  MK.busy = ''; render();
}
async function mkSubmit() {
  const ed = MK.ed, problems = [];
  ed.slides.forEach((s, i) => mkValidate(s).forEach(m => problems.push(`${ed.slides.length > 1 ? `Lâmina ${i + 1} · ` : ''}${m}`)));
  if (problems.length) return toast(problems[0], true);
  const sample = ed.slides.some(s => (s.e || []).some(e => e.type === 'text' && e.def && !e.hid && (s.v || {})[e.slot] === e.def));
  if (sample && !await confirmBox({ title: 'Há textos de exemplo', text: 'Alguns textos ainda são os de exemplo do layout. Enviar assim para aprovação?', ok: 'Enviar mesmo assim', cancel: 'Voltar' })) return;
  if (!await confirmBox({ title: 'Finalizar a peça?', text: 'Ela será exportada, ficará bloqueada para edição e os administradores serão avisados para aprovar.', ok: 'Enviar para aprovação' })) return;
  MK.busy = 'export'; render();
  try {
    if (!await mkSavePiece(true)) throw new Error('Salve a peça antes de enviar.');
    const blobs = await mkExportBlobs(), stamp = Date.now(), paths = [];
    for (let i = 0; i < blobs.length; i++) { const p = `pieces/${ed.id}/${stamp}-${i + 1}.png`; await mkUploadBlob(p, blobs[i], 'image/png'); paths.push(p); }
    const { error } = await mkDb().from('marketing_pieces').update({ approval_status: 'em_aprovacao', export_paths: paths }).eq('id', ed.id);
    if (error) throw error;
    if (ed.export_paths?.length) mkDb().storage.from('marketing').remove(ed.export_paths.filter(p => p.startsWith('pieces/')));
    toast('Peça enviada. Os administradores foram avisados.'); await mkLoad(true); mkOpenPiece(ed.id);
  } catch (e) { toast(mkErr(e), true); }
  MK.busy = ''; render();
}
async function mkDecide(approved) {
  const ed = MK.ed; let note = '';
  if (!approved) {
    note = await new Promise(res => {
      const d = $('#dlg2'); d.innerHTML = `<div class="d-head"><div><h2 id="dlg2Title">Reprovar a peça</h2></div></div><div class="d-body"><div class="field"><label for="mkRejN">Motivo (o marketing verá isto)</label><textarea class="input" id="mkRejN" rows="4" maxlength="600" autofocus></textarea></div></div><div class="d-foot"><button class="btn" data-r="no">Cancelar</button><button class="btn primary" data-r="yes">Reprovar</button></div>`;
      d.onclick = e => { const b = e.target.closest('[data-r]'); if (!b) return; const v = $('#mkRejN').value.trim(); if (b.dataset.r === 'yes' && v.length < 3) return $('#mkRejN').focus(); d.close(); res(b.dataset.r === 'yes' ? v : null); };
      d.oncancel = () => res(null); d.showModal();
    });
    if (note === null) return;
  } else if (!await confirmBox({ title: 'Aprovar a peça?', text: 'Depois de aprovada, a peça fica liberada para publicar.', ok: 'Aprovar' })) return;
  const { error } = await mkDb().from('marketing_pieces').update({ approval_status: approved ? 'aprovada' : 'reprovada', review_note: approved ? null : note }).eq('id', ed.id);
  if (error) return toast(mkErr(error), true);
  toast(approved ? 'Peça aprovada.' : 'Peça reprovada.'); await mkLoad(true); mkOpenPiece(ed.id);
}
function mkNewVersion() {
  const ed = MK.ed;
  MK.ed = { ...mkClone(ed), id: null, title: `${ed.title} (v2)`, approval_status: 'rascunho', review_note: '', export_paths: [], dirty: true, postId: '' };
  render(); toast('Nova versão criada. Salve para guardar.');
}
async function mkDeletePiece() {
  const ed = MK.ed;
  if (!await confirmBox({ title: 'Excluir a peça?', text: `“${esc(ed.title)}” e seus arquivos serão removidos. Posts ligados continuam, sem peça.`, ok: 'Excluir', danger: true })) return;
  const { error } = await mkDb().from('marketing_pieces').delete().eq('id', ed.id);
  if (error) return toast(mkErr(error), true);
  if (ed.export_paths?.length) mkDb().storage.from('marketing').remove(ed.export_paths);
  MK.ed = null; toast('Peça excluída.'); await mkLoad(true); render();
}

/* ═══════════ Eventos (planejamento e lista) ═══════════ */
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-mk]'); if (!el) return;
  const a = el.dataset.mk, id = el.dataset.id;
  if (el.hasAttribute('data-edit') && !mkCan(S.page)) { e.preventDefault(); return toast('Seu perfil não pode alterar esta página.', true); }
  if (['campaign-save', 'campaign-del', 'post-save', 'post-del'].includes(a) && !mkCan('marketing')) return toast('Seu perfil não pode alterar o planejamento.', true);
  switch (a) {
    case 'tab': MK.tab = el.dataset.v; return render();
    case 'month': { const [y, m] = MK.month.split('-').map(Number), d = new Date(y, m - 1 + Number(el.dataset.dir), 1); MK.month = ymd(d).slice(0, 7); return render(); }
    case 'post-new': return mkPostForm(null, el.dataset.date);
    case 'post-edit': return mkPostForm(id);
    case 'post-save': return mkSavePost(id || null);
    case 'post-del': if (await confirmBox({ title: 'Excluir o post?', text: 'O post sai do calendário. A peça ligada não é excluída.', ok: 'Excluir', danger: true })) { const { error } = await mkDb().from('marketing_posts').delete().eq('id', id); if (error) return toast(mkErr(error), true); closeDialog(); await mkLoad(true); } return;
    case 'campaign-new': return mkCampaignForm(null);
    case 'campaign-edit': return mkCampaignForm(id);
    case 'campaign-save': return mkSaveCampaign(id || null);
    case 'campaign-del': if (await confirmBox({ title: 'Excluir a campanha?', text: 'Posts e peças ficam sem campanha. O histórico de custo de IA também perde o vínculo.', ok: 'Excluir', danger: true })) { const { error } = await mkDb().from('marketing_campaigns').delete().eq('id', id); if (error) return toast(mkErr(error), true); closeDialog(); await mkLoad(true); } return;
    case 'piece-new': closeDialog(); if (S.page !== 'studio') { S.page = 'studio'; MK.ed = null; render(); } return mkNewPiece({ campaign: el.dataset.campaign || '', post: el.dataset.post || '' });
    case 'piece-create': return mkCreatePiece(el.dataset.layout);
    case 'piece-quick': if (!mkCan('studio')) return; Object.assign(MK.np, { fmt: el.dataset.fmt, post: '' }); return mkCreatePiece(el.dataset.layout);
    case 'np-fmt': MK.np.fmt = el.dataset.v; return mkNpRefresh();
    case 'comp-view': return mkCompDialog(id);
    case 'comp-post': { const k = MK.comps.find(x => x.id === id); if (!k) return; closeDialog(); return mkPostForm(null, el.dataset.date, '', { objective: `${el.dataset.kind === 'pos' ? 'Resultado' : 'Divulgar'}: ${mkCompTitle(k)} (${k.team}, ${fmtDate(parseYmd(k.date))})`.slice(0, 300) }); }
    case 'comp-piece': return mkCompPiece(id);
    case 'np-cat': MK.np.cat = el.dataset.v; return mkNpRefresh();
    case 'piece-open': return mkOpenPiece(id);
    case 'filter': MK.filter = el.dataset.v; return render();
    case 'prices-save': return mkSavePrices();
    case 'back': if (MK.ed.dirty && !await confirmBox({ title: 'Sair sem salvar?', text: 'As alterações desta peça serão perdidas.', ok: 'Sair sem salvar', cancel: 'Continuar editando', danger: true })) return; MK.ed = null; MK.tool = null; return render();
    case 'piece-save': return mkSavePiece(false).then(ok => ok && render());
    case 'download': return mkDownload();
    case 'submit': return mkSubmit();
    case 'approve': return mkDecide(true);
    case 'reject': return mkDecide(false);
    case 'new-version': return mkNewVersion();
    case 'piece-del': return mkDeletePiece();
  }
});
let mkNpT;
document.addEventListener('input', e => { if (e.target.id === 'npQ') { MK.np.q = e.target.value; clearTimeout(mkNpT); mkNpT = setTimeout(() => { const g = $('#npGrid'); if (g) g.innerHTML = mkNpGrid(); mkNpThumbs(); }, 150); } });
document.addEventListener('input', e => { const el = e.target.closest('[data-mkf="calc"]'); if (el) MK.calc[el.dataset.k] = Math.max(0, Number(el.value) || 0); });
document.addEventListener('change', e => { if (e.target.matches?.('[data-mkf="comps"]')) { MK.showComps = e.target.checked; render(); } });
document.addEventListener('toggle', e => { if (e.target.classList?.contains('mk-calcbox')) MK.calcOpen = e.target.open; }, true);
document.addEventListener('change', e => { const el = e.target.closest('[data-mkf="calc"]'); if (el) { MK.calc[el.dataset.k] = Math.max(0, Number(el.value) || 0); render(); } });
