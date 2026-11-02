/* Marketing: Planejamento (calendário e campanhas) e Estúdio de peças (templates HTML, IA, aprovação, custo).
   Depende de marketing-studio-core.js. Os dados ficam no Supabase; as permissões são impostas pelo banco (migração 043). */
'use strict';

const MK = { loaded: false, loading: false, error: '', campaigns: [], posts: [], pieces: [], pricing: [], settings: { usd_brl: 5.5, video_confirm_brl: 20 }, usage: [],
  tab: 'calendar', month: ymd(TODAY).slice(0, 7), filter: 'all', ed: null, edSlide: 0, edSlot: '', edTab: 'content', busy: '', review: null, video: null,
  imgCache: new Map(), calc: { copies: 1, images: 1, reviews: 1, video: 0, brief: 300 } };
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

async function mkLoad(force = false) {
  if (MK.loading || (MK.loaded && !force)) return;
  MK.loading = true; MK.error = '';
  try {
    const db = mkDb();
    const [c, p, pc, pr, st, us] = await Promise.all([
      db.from('marketing_campaigns').select('*').order('created_at', { ascending: false }),
      db.from('marketing_posts').select('*').order('post_date', { ascending: true }),
      db.from('marketing_pieces').select('*').order('updated_at', { ascending: false }),
      db.from('ai_pricing').select('*'),
      db.from('ai_settings').select('*').maybeSingle(),
      db.from('ai_usage').select('id,created_at,action,kind,model,input_tokens,output_tokens,units,cost_brl,piece_id,campaign_id').order('created_at', { ascending: false }).limit(1000),
    ]);
    const bad = [c, p, pc, pr, st, us].find(x => x.error);
    if (bad) throw bad.error;
    Object.assign(MK, { campaigns: c.data, posts: p.data, pieces: pc.data, pricing: pr.data, usage: us.data, loaded: true });
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
  let body;
  if (!MK.loaded) body = '<div class="panel-pad muted">Carregando o planejamento…</div>';
  else body = MK.tab === 'calendar' ? mkCalendar() : mkCampaignList();
  return `${viewBanner('marketing')}
  <div class="page-head"><div><div class="eyebrow">Marketing · social media</div><h1>Planejamento</h1><p>Calendário de posts e campanhas. Cada post pode ter uma peça criada no Estúdio; só peças aprovadas ficam prontas para publicar.</p></div>
    <div class="head-actions"><button class="btn" data-mk="campaign-new" data-edit>${icon('target')} Nova campanha</button><button class="btn primary" data-mk="post-new" data-edit>${icon('plus')} Novo post</button></div></div>
  ${MK.error ? `<div class="banner warn">${icon('alert')}<span>${esc(MK.error)}</span></div>` : ''}
  <div class="grid g4 mb">${kpis.map(([l, v, f]) => `<div class="kpi"><div class="kpi-label">${l}</div><div class="kpi-value">${v}</div><div class="kpi-foot">${f}</div></div>`).join('')}</div>
  <section class="panel"><div class="panel-head"><div class="seg" role="tablist">${[['calendar', 'Calendário'], ['campaigns', `Campanhas (${MK.campaigns.length})`]].map(([id, l]) => `<button class="${MK.tab === id ? 'on' : ''}" data-mk="tab" data-v="${id}" role="tab" aria-selected="${MK.tab === id}">${l}</button>`).join('')}</div>
    ${MK.tab === 'calendar' ? `<div class="mk-month"><button class="btn sm ghost sq" data-mk="month" data-dir="-1" aria-label="Mês anterior">${icon('left')}</button><b>${mkMonthLabel(ym)}</b><button class="btn sm ghost sq" data-mk="month" data-dir="1" aria-label="Próximo mês">${icon('right')}</button></div>` : ''}</div>
  ${body}</section>`;
}
function mkCalendar() {
  const [y, m] = MK.month.split('-').map(Number), first = new Date(y, m - 1, 1), start = startOfWeek(first), cells = [];
  for (let i = 0; i < 42; i++) { const d = addDays(start, i); if (i >= 35 && d.getMonth() !== m - 1) break; cells.push(d); }
  const head = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => `<div class="mk-dow">${d}</div>`).join('');
  return `<div class="mk-cal">${head}${cells.map(d => {
    const key = ymd(d), items = MK.posts.filter(p => p.post_date === key), out = d.getMonth() !== m - 1;
    return `<div class="mk-day ${out ? 'out' : ''} ${key === ymd(TODAY) ? 'today' : ''}"><div class="mk-dn"><span>${d.getDate()}</span><button class="mk-add" data-mk="post-new" data-date="${key}" data-edit title="Novo post em ${fmtDate(d)}" aria-label="Novo post em ${fmtDate(d)}">${icon('plus')}</button></div>
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

function mkPostForm(id, date, pieceId) {
  const p = id ? MK.posts.find(x => x.id === id) : { post_date: date || ymd(TODAY), network: 'instagram', status: 'ideia', campaign_id: '', piece_id: pieceId || '', objective: '', caption: '' };
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
  const q = id ? mkDb().from('marketing_posts').update(row).eq('id', id) : mkDb().from('marketing_posts').insert(row);
  const { error } = await q;
  if (error) return mkDialogErr('mkpErr', mkErr(error));
  closeDialog(); toast('Post salvo.'); await mkLoad(true);
}
const mkDialogErr = (id, msg) => { const el = $('#' + id); if (el) { el.hidden = false; el.innerHTML = `${icon('alert')}<span>${esc(msg)}</span>`; } };

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

/* ═══════════ Estúdio: imagens, editor ═══════════ */
async function mkSignedBlob(path) {
  const { data, error } = await mkDb().storage.from('marketing').createSignedUrl(path, 600);
  if (error) throw error;
  const r = await fetch(data.signedUrl); if (!r.ok) throw new Error('Arquivo indisponível.');
  return r.blob();
}
async function mkResolveImage(ref) {
  if (!ref) return '';
  if (ref.startsWith('data:')) return ref;
  const path = ref.replace(/^storage:/, '');
  if (MK.imgCache.has(path)) return MK.imgCache.get(path);
  try { const url = await mkBlobToDataUrl(await mkSignedBlob(path)); MK.imgCache.set(path, url); return url; } catch { MK.imgCache.set(path, ''); return ''; }
}
// Imagens já resolvidas; as que faltam são buscadas e a arte é redesenhada quando chegam.
function mkImagesFor(tpl, slide) {
  const out = {}; let missing = false;
  for (const [k, s] of Object.entries(tpl.slots)) {
    if (s.type !== 'image' || !slide[k]) continue;
    const path = String(slide[k]).replace(/^storage:/, '');
    if (String(slide[k]).startsWith('data:')) out[k] = slide[k];
    else if (MK.imgCache.has(path)) out[k] = MK.imgCache.get(path);
    else { missing = true; mkResolveImage(slide[k]).then(mkRefresh); }
  }
  return { images: out, missing };
}
let mkRefreshTimer;
const mkRefresh = () => { clearTimeout(mkRefreshTimer); mkRefreshTimer = setTimeout(() => { if (MK.ed) mkDrawStage(); else if (S.page === 'studio') render(); }, 120); };
const mkCtx = (tpl, slide) => ({ assets: MK_CACHE.assets || {}, images: mkImagesFor(tpl, slide).images });
const mkArt = (tpl, slide, fmt) => mkRenderArt(tpl, slide, fmt, mkCtx(tpl, slide));
function mkScaled(html, f, maxW, maxH) {
  const k = Math.min(maxW / f.w, maxH / f.h);
  return `<div class="mk-scaled" style="width:${Math.round(f.w * k)}px;height:${Math.round(f.h * k)}px"><div style="width:${f.w}px;height:${f.h}px;transform:scale(${k});transform-origin:0 0">${html}</div></div>`;
}

function renderStudio() {
  if (!MK.loaded && !MK.loading) mkLoad();
  if (!MK_CACHE.assets) mkLoadBrand().then(() => { if (S.page === 'studio') render(); }).catch(e => { MK.error = mkErr(e); });
  if (MK.ed) return mkEditorPage();
  const admin = mkIsAdmin(), pend = MK.pieces.filter(p => p.approval_status === 'em_aprovacao');
  const list = MK.pieces.filter(p => MK.filter === 'all' || p.approval_status === MK.filter);
  const tabs = [['all', 'Todas'], ['rascunho', 'Rascunhos'], ['em_aprovacao', 'Em aprovação'], ['aprovada', 'Aprovadas'], ['reprovada', 'Reprovadas']];
  const cards = list.map(p => {
    const tpl = mkTemplate(p.template_id), f = MK_FORMATS[p.format] || MK_FORMATS.feed, slide = p.slides?.[0] || mkEmptySlide(tpl), camp = mkCampaign(p.campaign_id);
    return `<article class="mk-piece"><button class="mk-thumb" data-mk="piece-open" data-id="${p.id}" aria-label="Abrir ${esc(p.title)}">${MK_CACHE.assets ? mkScaled(mkArt(tpl, slide, p.format), f, 210, 260) : '<span class="muted small">carregando…</span>'}</button>
      <div class="mk-piece-b"><b>${esc(p.title)}</b><div class="hint">${esc(f.label)}${(p.slides?.length || 1) > 1 ? ` · ${p.slides.length} lâminas` : ''}${camp ? ` · ${esc(camp.name)}` : ''}</div>${mkTag(MK_APPR[p.approval_status])}${p.review_note && p.approval_status === 'reprovada' ? `<div class="hint" style="color:var(--brand-ink)">${esc(p.review_note)}</div>` : ''}</div></article>`;
  }).join('');
  return `${viewBanner('studio')}
  <div class="page-head"><div><div class="eyebrow">Marketing · criação</div><h1>Estúdio de peças</h1><p>Crie artes a partir de templates HTML com a marca da Apollo. A IA ajuda nos textos, nas imagens e na revisão; o custo aparece antes de cada geração.</p></div>
    <div class="head-actions"><button class="btn primary" data-mk="piece-new" data-edit>${icon('plus')} Nova peça</button></div></div>
  ${MK.error ? `<div class="banner warn">${icon('alert')}<span>${esc(MK.error)}</span></div>` : ''}
  ${admin && pend.length ? `<div class="banner note">${icon('shield')}<span><b>${pend.length} peça(s) aguardando sua aprovação.</b> <button class="btn sm" data-mk="filter" data-v="em_aprovacao">Ver agora</button></span></div>` : ''}
  <section class="panel mb"><div class="panel-head"><div class="seg" role="tablist">${tabs.map(([id, l]) => `<button class="${MK.filter === id ? 'on' : ''}" data-mk="filter" data-v="${id}">${l}${id !== 'all' ? ` <span class="bl-count">${MK.pieces.filter(p => p.approval_status === id).length}</span>` : ''}</button>`).join('')}</div></div>
    ${!MK.loaded ? '<div class="panel-pad muted">Carregando…</div>' : list.length ? `<div class="mk-pieces">${cards}</div>` : emptyState('Nenhuma peça aqui', 'Crie a primeira peça escolhendo um template.', `<button class="btn primary sm" data-mk="piece-new" data-edit>${icon('plus')} Nova peça</button>`)}</section>
  ${mkCalculatorPanel()}`;
}

/* ─── Calculadora de custo e consumo ─── */
function mkCalculatorPanel() {
  const c = MK.calc, p = mkPricing();
  const slotsMax = mkTemplate('destaque') && Object.values(mkTemplate('destaque').slots).filter(s => s.max).map(s => s.max);
  const est = mkEst({ copies: Array.from({ length: c.copies }, () => ({ briefChars: c.brief, slots: slotsMax })), images: c.images, reviews: c.reviews, videoSeconds: c.video });
  const monthTotal = mkMonthSpend(), admin = mkIsAdmin();
  const byCamp = MK.campaigns.map(x => [x, mkSpent(x.id)]).filter(([x, n]) => n > 0 || Number(x.ai_budget_brl) > 0);
  const num = (k, label, min = 0, max = 99, step = 1) => `<div class="field"><label>${label}</label><input class="input" type="number" min="${min}" max="${max}" step="${step}" data-mkf="calc" data-k="${k}" value="${c[k]}"></div>`;
  return `<section class="panel mb"><div class="panel-head"><div><h2 style="margin:0;font-size:15px">Calculadora de custo de IA</h2><div class="sub">Previsão antes de gerar. O custo real de cada geração é registrado e somado abaixo.</div></div></div>
    <div class="panel-pad"><div class="mk-calc">
      <div>${num('copies', 'Gerações de texto')}${num('brief', 'Tamanho do briefing (caracteres)', 0, 1500, 50)}${num('images', 'Imagens por IA')}${num('reviews', 'Revisões da arte por IA')}${num('video', 'Segundos de vídeo (4 a 8 por vídeo)', 0, 120)}</div>
      <div class="mk-calc-out"><table class="mk-tbl"><thead><tr><th>Item</th><th>Quantidade</th><th class="num">Custo estimado</th></tr></thead><tbody>
        ${est.lines.map(l => `<tr><td>${esc(l.label)}${l.tokens ? `<div class="hint">≈ ${l.tokens.input.toLocaleString('pt-BR')} tokens de entrada · ${l.tokens.outputMin.toLocaleString('pt-BR')} a ${l.tokens.outputMax.toLocaleString('pt-BR')} de saída</div>` : ''}</td><td>${esc(l.qty)}</td><td class="num">${mkRange(l.brlMin, l.brlMax)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Informe as quantidades.</td></tr>'}
        </tbody><tfoot><tr><td colspan="2"><b>Total previsto</b></td><td class="num"><b>${mkRange(est.brlMin, est.brlMax)}</b></td></tr></tfoot></table>
        <p class="hint">Cotação usada: US$ 1 = R$ ${Number(MK.settings.usd_brl).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. Texto: estimativa por caracteres (1 token ≈ 3,2 caracteres). Imagem e vídeo têm preço fixo por unidade.</p></div></div></div>
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
      <button class="btn primary sm" data-mk="prices-save">Salvar preços</button></div>` : ''}</section>`;
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
async function mkNewPiece({ campaign = '', post = '' } = {}) {
  if (!mkCan('studio')) return toast('Seu perfil não pode criar peças.', true);
  try { await mkLoadBrand(); } catch (e) { return toast(mkErr(e), true); }
  const tplCards = MK_TEMPLATES.map((t, i) => {
    const f = MK_FORMATS[t.formats[0]], slide = mkEmptySlide(t);
    return `<label class="mk-tpl"><input type="radio" name="mkTpl" value="${t.id}" ${i === 0 ? 'checked' : ''}><span class="mk-tpl-in">${mkScaled(mkArt(t, slide, t.formats[0]), f, 130, 160)}<b>${esc(t.name)}</b><small>${esc(t.hint)}</small></span></label>`;
  }).join('');
  openDialog(dHead('Nova peça', 'Escolha um template', 'Você edita cada elemento depois. Todos os formatos estão disponíveis.') + `<form class="d-body" novalidate>
    <div class="mk-tpls">${tplCards}</div>
    <div class="row2"><div class="field"><label for="mknFmt">Formato</label><select class="select" id="mknFmt">${Object.entries(MK_FORMATS).map(([k, f]) => `<option value="${k}">${f.label}</option>`).join('')}</select></div>
      <div class="field"><label for="mknCamp">Campanha</label><select class="select" id="mknCamp"><option value="">Sem campanha</option>${MK.campaigns.map(c => `<option value="${c.id}" ${campaign === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div></div>
    <div class="field"><label for="mknTitle">Nome da peça *</label><input class="input" id="mknTitle" maxlength="140" placeholder="Ex.: Peneira de sábado · feed"></div>
    <div class="banner warn" id="mknErr" hidden></div></form>
  <div class="d-foot"><button class="btn" data-act="close-dialog">Cancelar</button><button class="btn primary" data-mk="piece-create" data-post="${esc(post)}">Criar e editar</button></div>`);
  const sync = () => {
    const t = mkTemplate(document.querySelector('input[name=mkTpl]:checked')?.value), sel = $('#mknFmt'), cur = sel.value;
    [...sel.options].forEach(o => { o.disabled = !t.formats.includes(o.value); });
    if (!t.formats.includes(cur)) sel.value = t.formats[0];
  };
  $('#dlg').querySelectorAll('input[name=mkTpl]').forEach(r => r.addEventListener('change', sync)); sync();
}
function mkCreatePiece(postId) {
  const tpl = mkTemplate(document.querySelector('input[name=mkTpl]:checked')?.value), title = $('#mknTitle').value.trim();
  if (title.length < 2) return mkDialogErr('mknErr', 'Dê um nome à peça.');
  closeDialog();
  MK.ed = { id: null, title, templateId: tpl.id, format: $('#mknFmt').value, campaignId: $('#mknCamp').value || '', postId: postId || '', slides: [mkEmptySlide(tpl)], approval_status: 'rascunho', review_note: '', export_paths: [], dirty: true };
  Object.assign(MK, { edSlide: 0, edSlot: '', edTab: 'content', review: null, video: null }); go('studio');
}
function mkOpenPiece(id) {
  const p = mkPiece(id); if (!p) return;
  MK.ed = { id: p.id, title: p.title, templateId: p.template_id, format: p.format, campaignId: p.campaign_id || '', postId: '', slides: JSON.parse(JSON.stringify(p.slides?.length ? p.slides : [mkEmptySlide(mkTemplate(p.template_id))])),
    approval_status: p.approval_status, review_note: p.review_note || '', export_paths: p.export_paths || [], dirty: false };
  Object.assign(MK, { edSlide: 0, edSlot: '', edTab: 'content', review: null, video: null }); render();
}

/* ─── Editor ─── */
function mkEditorPage() {
  const ed = MK.ed, tpl = mkTemplate(ed.templateId), f = MK_FORMATS[ed.format], locked = mkLocked(), slide = ed.slides[MK.edSlide] || ed.slides[0];
  const banner = ed.approval_status === 'em_aprovacao' ? `<div class="banner note">${icon('shield')}<span><b>Em aprovação.</b> A peça está bloqueada para edição até a administração decidir.</span></div>`
    : ed.approval_status === 'aprovada' ? `<div class="banner view">${icon('check')}<span><b>Aprovada.</b> Para alterar, crie uma nova versão.</span></div>`
    : ed.approval_status === 'reprovada' ? `<div class="banner warn">${icon('alert')}<span><b>Reprovada:</b> ${esc(ed.review_note || 'sem motivo informado')}. Ajuste e envie de novo.</span></div>` : '';
  const strip = ed.format === 'carousel' ? `<div class="mk-strip">${ed.slides.map((s, i) => `<button class="${i === MK.edSlide ? 'on' : ''}" data-mk="slide" data-i="${i}">${i + 1}</button>`).join('')}${!locked && ed.slides.length < 10 ? `<button data-mk="slide-add" title="Adicionar lâmina" aria-label="Adicionar lâmina">${icon('plus')}</button>` : ''}${!locked && ed.slides.length > 1 ? `<button data-mk="slide-del" title="Remover esta lâmina" aria-label="Remover esta lâmina">${icon('trash')}</button>` : ''}</div>` : '';
  const tabs = [['content', 'Conteúdo'], ['ai', 'IA'], ['piece', 'Peça']];
  return `<div class="page-head"><div><div class="eyebrow">Estúdio de peças</div><h1>${esc(ed.title)}</h1><p>${esc(tpl.name)} · ${esc(f.label)} ${mkTag(MK_APPR[ed.approval_status])}${ed.dirty ? ' <span class="hint">alterações não salvas</span>' : ''}</p></div>
    <div class="head-actions"><button class="btn" data-mk="back">${icon('left')} Voltar</button><button class="btn" data-mk="download" ${MK.busy ? 'disabled' : ''}>${icon('download')} Baixar PNG</button>${!locked ? `<button class="btn primary" data-mk="piece-save" ${MK.busy ? 'disabled' : ''}>${icon('check')} Salvar</button>` : ''}</div></div>
  ${banner}
  <div class="mk-editor"><section class="panel mk-stage-panel"><div class="mk-stage" id="mkStage">${mkStageInner()}</div>${strip}<div class="mk-stage-note hint">Clique em um elemento da arte para editá-lo. Textos longos diminuem sozinhos para caber.</div></section>
  <section class="panel mk-side"><div class="tabs">${tabs.map(([id, l]) => `<button class="${MK.edTab === id ? 'on' : ''}" data-mk="edtab" data-v="${id}">${l}</button>`).join('')}</div>
    <div class="panel-pad" id="mkSide">${MK.edTab === 'content' ? mkContentTab(tpl, slide, locked) : MK.edTab === 'ai' ? mkAiTab(tpl, slide, locked) : mkPieceTab(tpl, locked)}</div></section></div>`;
}
function mkStageInner() {
  const ed = MK.ed, tpl = mkTemplate(ed.templateId), f = MK_FORMATS[ed.format], slide = ed.slides[MK.edSlide] || ed.slides[0];
  if (!MK_CACHE.assets) return '<div class="muted small" style="padding:40px">Carregando a marca…</div>';
  return mkScaled(mkArt(tpl, slide, ed.format), f, 440, 620);
}
function mkDrawStage() {
  const el = $('#mkStage'); if (!el || !MK.ed) return;
  el.innerHTML = mkStageInner();
  if (MK.edSlot) el.querySelector(`[data-slot="${CSS.escape(MK.edSlot)}"]`)?.classList.add('mk-sel');
}
function mkContentTab(tpl, slide, locked) {
  const dis = locked ? 'disabled' : '';
  return Object.entries(tpl.slots).map(([k, s]) => {
    const ov = slide._s?.[k] || {}, cur = slide[k] || '', sel = MK.edSlot === k ? 'sel' : '';
    if (s.type === 'text' || s.type === 'long') {
      const over = String(cur).length > s.max;
      return `<div class="field mk-slot ${sel}" data-slotbox="${k}"><label for="mks_${k}">${esc(s.label)} <span class="hint ${over ? 'mk-over' : ''}" id="mkc_${k}">${String(cur).length}/${s.max}</span></label>
        ${s.type === 'long' ? `<textarea class="input" id="mks_${k}" rows="3" data-mkf="slot" data-k="${k}" ${dis}>${esc(cur)}</textarea>` : `<input class="input" id="mks_${k}" data-mkf="slot" data-k="${k}" value="${esc(cur)}" ${dis}>`}
        ${mkStyleRow(k, ov, dis)}</div>`;
    }
    if (s.type === 'image') {
      return `<div class="field mk-slot ${sel}" data-slotbox="${k}"><label>${esc(s.label)}</label>
        <div class="mk-imgrow">${cur ? `<span class="tag nodot st-ok">Imagem definida</span>` : '<span class="hint">Sem imagem</span>'}<label class="btn sm ${locked ? 'locked' : ''}" for="mkf_${k}">${icon('upload')} Enviar foto</label><input type="file" id="mkf_${k}" accept="image/*" hidden data-mkf="file" data-k="${k}" ${dis}>
          ${cur ? `<button class="btn sm ghost" data-mk="img-clear" data-k="${k}" ${dis}>${icon('x')} Remover</button>` : ''}</div>
        <span class="hint">Foto de atleta menor de idade só com autorização do responsável. Ou gere a imagem na aba IA.</span></div>`;
    }
    return `<div class="field mk-slot ${sel}" data-slotbox="${k}"><label class="mk-check"><input type="checkbox" data-mkf="hide" data-k="${k}" ${ov.hidden ? '' : 'checked'} ${dis}> ${esc(s.label)}</label></div>`;
  }).join('') + `<div class="hint" style="margin-top:6px">Validação: ${mkValidate(tpl, slide).map(esc).join(' ') || 'tudo dentro dos limites.'}</div>`;
}
function mkStyleRow(k, ov, dis) {
  return `<div class="mk-style"><span class="mk-dots">${Object.entries(MK_COLORS).map(([c, hex]) => `<button type="button" class="mk-dot ${ov.color === c ? 'on' : ''}" style="background:${hex}" title="${MK_COLOR_NAMES[c]}" aria-label="Cor ${MK_COLOR_NAMES[c]}" data-mk="color" data-k="${k}" data-c="${c}" ${dis}></button>`).join('')}<button type="button" class="mk-dot auto ${ov.color ? '' : 'on'}" title="Cor padrão do template" aria-label="Cor padrão" data-mk="color" data-k="${k}" data-c="" ${dis}>A</button></span>
    <input type="range" min="0.6" max="1.4" step="0.05" value="${ov.scale || 1}" data-mkf="scale" data-k="${k}" aria-label="Tamanho" ${dis}><label class="mk-check"><input type="checkbox" data-mkf="hide" data-k="${k}" ${ov.hidden ? '' : 'checked'} ${dis}> mostrar</label></div>`;
}

/* ─── Aba IA ─── */
function mkEstLine(plan, label) {
  const e = mkEst(plan), camp = mkCampaign(MK.ed.campaignId);
  let extra = '';
  if (camp && Number(camp.ai_budget_brl) > 0) extra = ` · Campanha: ${mkBrl(mkSpent(camp.id))} de ${mkBrl(Number(camp.ai_budget_brl))}`;
  return `<div class="mk-cost">${icon('money')}<span>${esc(label)}: <b>${mkRange(e.brlMin, e.brlMax)}</b>${extra}</span></div>`;
}
function mkAiTab(tpl, slide, locked) {
  const dis = locked || MK.busy ? 'disabled' : '', imgSlots = Object.entries(tpl.slots).filter(([, s]) => s.type === 'image');
  const textSlots = Object.values(tpl.slots).filter(s => s.max).map(s => s.max);
  const brief = MK.ed.brief || '', iprompt = MK.ed.imgPrompt || '', vprompt = MK.ed.vidPrompt || '', secs = MK.ed.vidSecs || 6;
  const busy = k => MK.busy === k ? ' · gerando…' : '';
  return `<div class="mk-ai"><h3 class="mk-h3">Textos</h3><div class="field"><label for="mkBrief">Briefing</label><textarea class="input" id="mkBrief" rows="3" maxlength="1500" data-mkf="brief" placeholder="Ex.: peneira aberta sábado 08/11 às 15h, ginásio Apollo, para meninas de 12 a 15 anos" ${dis}>${esc(brief)}</textarea></div>
    ${mkEstLine({ copies: [{ briefChars: brief.length || 200, slots: textSlots }] }, 'Custo estimado dos textos')}
    <button class="btn primary sm" data-mk="ai-copy" ${dis}>${icon('sparkle')} Gerar textos${busy('copy')}</button>
    ${imgSlots.length ? `<h3 class="mk-h3">Imagem</h3><div class="field"><label for="mkImgP">Descreva a imagem</label><textarea class="input" id="mkImgP" rows="3" maxlength="1200" data-mkf="imgprompt" placeholder="Ex.: jogadora de vôlei em quadra fazendo um saque, luz de ginásio, estilo fotográfico" ${dis}>${esc(iprompt)}</textarea></div>
      ${imgSlots.length > 1 ? `<div class="field"><label for="mkImgS">Aplicar em</label><select class="select" id="mkImgS" data-mkf="imgslot">${imgSlots.map(([k, s]) => `<option value="${k}">${esc(s.label)}</option>`).join('')}</select></div>` : ''}
      ${mkEstLine({ images: 1 }, 'Custo da imagem')}<button class="btn primary sm" data-mk="ai-image" ${dis}>${icon('sparkle')} Gerar imagem${busy('image')}</button>` : ''}
    <h3 class="mk-h3">Revisão da arte</h3><p class="hint" style="margin:0 0 8px">A IA confere texto cortado, contraste, respiro do logo, cores da marca e erros de português.</p>
    ${mkEstLine({ reviews: 1 }, 'Custo da revisão')}<button class="btn sm" data-mk="ai-review" ${dis}>${icon('eye')} Revisar esta lâmina${busy('review')}</button>
    ${MK.review ? `<div class="mk-review ${MK.review.approved ? 'ok' : 'bad'}"><b>${MK.review.approved ? 'Sem problemas graves.' : 'Pontos de atenção'}</b><p class="small">${esc(MK.review.summary || '')}</p>${(MK.review.issues || []).map(i => `<div class="small">• <b>${esc(i.severity)}</b>: ${esc(i.text)}</div>`).join('')}</div>` : ''}
    <h3 class="mk-h3">Vídeo curto</h3><div class="field"><label for="mkVidP">Descreva o vídeo</label><textarea class="input" id="mkVidP" rows="3" maxlength="1200" data-mkf="vidprompt" placeholder="Ex.: câmera lenta de uma bola de vôlei subindo para a cortada, ginásio iluminado" ${dis}>${esc(vprompt)}</textarea></div>
    <div class="field"><label for="mkVidS">Duração</label><select class="select" id="mkVidS" data-mkf="vidsecs" ${dis}>${[4, 6, 8].map(n => `<option value="${n}" ${secs === n ? 'selected' : ''}>${n} segundos</option>`).join('')}</select></div>
    ${mkEstLine({ videoSeconds: secs }, 'Custo do vídeo')}<button class="btn primary sm" data-mk="ai-video" ${dis}>${icon('sparkle')} Gerar vídeo${busy('video')}</button>
    ${MK.video ? `<div class="mk-vid"><video src="${esc(MK.video.url)}" controls playsinline></video><a class="btn sm" href="${esc(MK.video.url)}" download="apollo-video.mp4">${icon('download')} Baixar vídeo</a></div>` : ''}</div>`;
}
function mkPieceTab(tpl, locked) {
  const ed = MK.ed, dis = locked ? 'disabled' : '', admin = mkIsAdmin();
  const approveBox = ed.approval_status === 'em_aprovacao' && admin ? `<div class="banner note">${icon('shield')}<span><b>Decisão da administração.</b></span></div><div style="display:flex;gap:8px;margin-bottom:14px"><button class="btn ok" data-mk="approve">${icon('check')} Aprovar</button><button class="btn danger" data-mk="reject">${icon('x')} Reprovar</button></div>` : '';
  const actions = ['rascunho', 'reprovada'].includes(ed.approval_status) ? `<button class="btn primary" data-mk="submit" ${MK.busy ? 'disabled' : ''}>${icon('shield')} Finalizar e enviar para aprovação</button><p class="hint">A peça é exportada em PNG e fica bloqueada até a administração aprovar ou reprovar. Os administradores são avisados.</p>`
    : ed.approval_status === 'aprovada' ? `<button class="btn" data-mk="new-version">${icon('copy')} Criar nova versão</button>` : '';
  return `${approveBox}<div class="field"><label for="mkTitle">Nome da peça</label><input class="input" id="mkTitle" maxlength="140" value="${esc(ed.title)}" data-mkf="meta" data-k="title" ${dis}></div>
    <div class="row2"><div class="field"><label for="mkTpl">Template</label><select class="select" id="mkTpl" data-mkf="meta" data-k="templateId" ${dis}>${MK_TEMPLATES.map(t => `<option value="${t.id}" ${t.id === ed.templateId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="mkFmt">Formato</label><select class="select" id="mkFmt" data-mkf="meta" data-k="format" ${dis}>${tpl.formats.map(k => `<option value="${k}" ${k === ed.format ? 'selected' : ''}>${MK_FORMATS[k].label}</option>`).join('')}</select></div></div>
    <div class="field"><label for="mkCampSel">Campanha</label><select class="select" id="mkCampSel" data-mkf="meta" data-k="campaignId" ${dis}><option value="">Sem campanha</option>${MK.campaigns.map(c => `<option value="${c.id}" ${c.id === ed.campaignId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
    ${actions}${ed.id ? `<div style="margin-top:18px"><button class="btn danger sm" data-mk="piece-del" ${['em_aprovacao', 'aprovada'].includes(ed.approval_status) && !admin ? 'disabled' : ''}>${icon('trash')} Excluir peça</button></div>` : ''}`;
}

/* ─── Ações do editor ─── */
const mkSlide = () => MK.ed.slides[MK.edSlide];
const mkTouch = () => { MK.ed.dirty = true; };
function mkSetStyle(k, patch) { const s = mkSlide(); s._s = s._s || {}; s._s[k] = { ...(s._s[k] || {}), ...patch }; mkTouch(); }
async function mkUploadBlob(path, blob, contentType) {
  const { error } = await mkDb().storage.from('marketing').upload(path, blob, { contentType, upsert: true });
  if (error) throw error;
}
async function mkSavePiece(silent) {
  const ed = MK.ed, row = { title: ed.title.trim(), template_id: ed.templateId, format: ed.format, slides: ed.slides, campaign_id: ed.campaignId || null };
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
  const ed = MK.ed, tpl = mkTemplate(ed.templateId), f = MK_FORMATS[ed.format];
  await mkLoadBrand();
  const out = [];
  for (const slide of ed.slides) {
    const imgs = {};
    for (const [k, s] of Object.entries(tpl.slots)) if (s.type === 'image' && slide[k]) imgs[k] = await mkResolveImage(slide[k]);
    out.push(await mkRasterize(mkRenderArt(tpl, slide, ed.format, { assets: MK_CACHE.assets, images: imgs }), f.w, f.h));
  }
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
  const ed = MK.ed, tpl = mkTemplate(ed.templateId), problems = [];
  ed.slides.forEach((s, i) => { mkValidate(tpl, s).forEach(m => problems.push(`${ed.slides.length > 1 ? `Lâmina ${i + 1} · ` : ''}${m}`)); });
  if (problems.length) return toast(problems[0], true);
  const sample = ed.slides.some(s => Object.entries(tpl.slots).some(([k, d]) => d.def && s[k] === d.def && !s._s?.[k]?.hidden));
  if (sample && !await confirmBox({ title: 'Há textos de exemplo', text: 'Alguns textos ainda são os de exemplo do template. Enviar assim para aprovação?', ok: 'Enviar mesmo assim', cancel: 'Voltar' })) return;
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
async function mkNewVersion() {
  const ed = MK.ed;
  MK.ed = { ...JSON.parse(JSON.stringify(ed)), id: null, title: `${ed.title} (v2)`, approval_status: 'rascunho', review_note: '', export_paths: [], dirty: true, postId: '' };
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

/* ─── IA ─── */
async function mkAi(payload) {
  const { data, error } = await mkDb().functions.invoke('marketing-ai', { body: { ...payload, pieceId: MK.ed.id || undefined, campaignId: MK.ed.campaignId || undefined } });
  if (error) { let r = null; try { r = await error.context.json(); } catch { } throw new Error(r?.error || error.message); }
  return data;
}
async function mkRun(kind, fn) {
  if (!mkCan('studio')) return toast('Seu perfil não pode usar a IA.', true);
  if (!MK.ed.id && !await mkSavePiece(true)) return;
  MK.busy = kind; render();
  try { await fn(); await mkLoad(true); }
  catch (e) { toast(mkErr(e), true); }
  MK.busy = ''; render();
}
const mkCost = d => d?.usage ? `Custo real: ${mkBrl(d.usage.costBrl)}` : '';
function mkAiCopy() {
  const ed = MK.ed, tpl = mkTemplate(ed.templateId), slots = Object.fromEntries(Object.entries(tpl.slots).filter(([, s]) => s.max).map(([k, s]) => [k, { label: s.label, max: s.max }]));
  if (!(ed.brief || '').trim()) return toast('Escreva o briefing antes de gerar os textos.', true);
  return mkRun('copy', async () => {
    const d = await mkAi({ action: 'copy', brief: ed.brief, slots });
    Object.assign(mkSlide(), d.slots); mkTouch(); toast(`Textos gerados. ${mkCost(d)}`);
  });
}
function mkAiImage() {
  const ed = MK.ed, tpl = mkTemplate(ed.templateId), slot = $('#mkImgS')?.value || Object.keys(tpl.slots).find(k => tpl.slots[k].type === 'image');
  if (!(ed.imgPrompt || '').trim()) return toast('Descreva a imagem que você quer.', true);
  return mkRun('image', async () => {
    const d = await mkAi({ action: 'image', prompt: ed.imgPrompt, format: ed.format });
    mkSlide()[slot] = 'storage:' + d.path; mkTouch(); toast(`Imagem gerada. ${mkCost(d)}`);
  });
}
function mkAiReview() {
  return mkRun('review', async () => {
    const ed = MK.ed, tpl = mkTemplate(ed.templateId), slide = mkSlide(), f = MK_FORMATS[ed.format], imgs = {};
    for (const [k, s] of Object.entries(tpl.slots)) if (s.type === 'image' && slide[k]) imgs[k] = await mkResolveImage(slide[k]);
    await mkLoadBrand();
    const png = await mkRasterize(mkRenderArt(tpl, slide, ed.format, { assets: MK_CACHE.assets, images: imgs }), f.w, f.h);
    const d = await mkAi({ action: 'review', imageBase64: await mkDownscaleBase64(png) });
    MK.review = d.review; toast(`Revisão concluída. ${mkCost(d)}`);
  });
}
async function mkAiVideo() {
  const ed = MK.ed, secs = ed.vidSecs || 6;
  if (!(ed.vidPrompt || '').trim()) return toast('Descreva o vídeo que você quer.', true);
  const est = mkEst({ videoSeconds: secs });
  if (est.brlMax >= Number(MK.settings.video_confirm_brl) && !await confirmBox({ title: 'Gerar vídeo?', text: `O custo estimado é de <b>${mkBrl(est.brlMax)}</b> (${secs} s). Deseja continuar?`, ok: 'Gerar vídeo' })) return;
  return mkRun('video', async () => {
    const start = await mkAi({ action: 'video_start', prompt: ed.vidPrompt, format: ed.format, seconds: secs });
    for (let i = 0; i < 45; i++) {
      await new Promise(r => setTimeout(r, 8000));
      const d = await mkAi({ action: 'video_poll', operation: start.operation, seconds: start.seconds });
      if (d.done) { MK.video = { url: URL.createObjectURL(await mkSignedBlob(d.path)), path: d.path }; toast(`Vídeo gerado. ${mkCost(d)}`); return; }
    }
    throw new Error('O vídeo demorou demais para ficar pronto. Tente de novo em instantes.');
  });
}

/* ═══════════ Eventos ═══════════ */
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-mk]');
  if (el) {
    const a = el.dataset.mk, id = el.dataset.id;
    const editsPlan = ['campaign-new', 'campaign-edit', 'campaign-save', 'campaign-del', 'post-new', 'post-edit', 'post-save', 'post-del'].includes(a);
    if (el.hasAttribute('data-edit') && !mkCan(S.page)) return toast('Seu perfil não pode alterar esta página.', true);
    if (editsPlan && ['campaign-save', 'campaign-del', 'post-save', 'post-del'].includes(a) && !mkCan('marketing')) return toast('Seu perfil não pode alterar o planejamento.', true);
    e.preventDefault();
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
      case 'piece-create': return mkCreatePiece(el.dataset.post);
      case 'piece-open': return mkOpenPiece(id);
      case 'filter': MK.filter = el.dataset.v; return render();
      case 'prices-save': return mkSavePrices();
      case 'back': if (MK.ed.dirty && !await confirmBox({ title: 'Sair sem salvar?', text: 'As alterações desta peça serão perdidas.', ok: 'Sair sem salvar', cancel: 'Continuar editando', danger: true })) return; MK.ed = null; return render();
      case 'edtab': MK.edTab = el.dataset.v; return render();
      case 'slide': MK.edSlide = Number(el.dataset.i); MK.edSlot = ''; return render();
      case 'slide-add': { const s = JSON.parse(JSON.stringify(mkSlide())); MK.ed.slides.push(s); MK.edSlide = MK.ed.slides.length - 1; mkTouch(); return render(); }
      case 'slide-del': MK.ed.slides.splice(MK.edSlide, 1); MK.edSlide = Math.max(0, MK.edSlide - 1); mkTouch(); return render();
      case 'color': mkSetStyle(el.dataset.k, { color: el.dataset.c || undefined }); return render();
      case 'img-clear': delete mkSlide()[el.dataset.k]; mkTouch(); return render();
      case 'piece-save': return mkSavePiece(false).then(ok => ok && render());
      case 'download': return mkDownload();
      case 'submit': return mkSubmit();
      case 'approve': return mkDecide(true);
      case 'reject': return mkDecide(false);
      case 'new-version': return mkNewVersion();
      case 'piece-del': return mkDeletePiece();
      case 'ai-copy': return mkAiCopy();
      case 'ai-image': return mkAiImage();
      case 'ai-review': return mkAiReview();
      case 'ai-video': return mkAiVideo();
    }
    return;
  }
  const art = e.target.closest('#mkStage [data-slot]');
  if (art && MK.ed) { MK.edSlot = art.dataset.slot; MK.edTab = 'content'; render(); const box = document.querySelector(`[data-slotbox="${CSS.escape(MK.edSlot)}"]`); box?.scrollIntoView({ block: 'center', behavior: 'smooth' }); box?.querySelector('input,textarea')?.focus({ preventScroll: true }); }
});
function mkField(e) {
  const el = e.target.closest('[data-mkf]'); if (!el || !MK.ed && el.dataset.mkf !== 'calc' && el.dataset.mkf !== 'price') return;
  const kind = el.dataset.mkf, k = el.dataset.k;
  if (kind === 'calc') { MK.calc[k] = Math.max(0, Number(el.value) || 0); if (e.type === 'change') render(); return; }
  if (kind === 'price') return;
  if (mkLocked()) return;
  if (kind === 'slot') { mkSlide()[k] = el.value; mkTouch(); const c = $('#mkc_' + k), max = mkTemplate(MK.ed.templateId).slots[k].max; if (c) { c.textContent = `${el.value.length}/${max}`; c.classList.toggle('mk-over', el.value.length > max); } mkDrawStage(); return; }
  if (kind === 'scale') { mkSetStyle(k, { scale: Number(el.value) }); mkDrawStage(); return; }
  if (kind === 'hide' && e.type === 'change') { mkSetStyle(k, { hidden: !el.checked }); mkDrawStage(); return; }
  if (kind === 'brief') { MK.ed.brief = el.value; if (e.type === 'change') render(); return; }
  if (kind === 'imgprompt') { MK.ed.imgPrompt = el.value; return; }
  if (kind === 'vidprompt') { MK.ed.vidPrompt = el.value; return; }
  if (kind === 'vidsecs' && e.type === 'change') { MK.ed.vidSecs = Number(el.value); render(); return; }
  if (kind === 'file' && e.type === 'change') return mkUploadPhoto(el);
  if (kind === 'meta' && e.type === 'change') return mkMeta(k, el.value);
}
document.addEventListener('input', mkField);
document.addEventListener('change', mkField);
async function mkUploadPhoto(el) {
  const file = el.files[0]; if (!file) return;
  if (!/^image\//.test(file.type)) return toast('Envie um arquivo de imagem.', true);
  try {
    const blob = await mkPrepareUpload(file), path = `uploads/${crypto.randomUUID()}.jpg`;
    await mkUploadBlob(path, blob, 'image/jpeg');
    MK.imgCache.set(path, await mkBlobToDataUrl(blob)); mkSlide()[el.dataset.k] = 'storage:' + path; mkTouch(); render();
  } catch (e) { toast('Não foi possível enviar a foto: ' + mkErr(e), true); }
}
async function mkMeta(k, v) {
  const ed = MK.ed; mkTouch();
  if (k === 'title') { ed.title = v; return; }
  if (k === 'campaignId') { ed.campaignId = v; return render(); }
  if (k === 'templateId') {
    const tpl = mkTemplate(v);
    ed.slides = ed.slides.map(s => { const n = mkEmptySlide(tpl); for (const key of Object.keys(tpl.slots)) if (s[key] !== undefined && key in s) n[key] = s[key]; n._s = s._s; return n; });
    ed.templateId = v; if (!tpl.formats.includes(ed.format)) ed.format = tpl.formats[0]; MK.edSlot = ''; return render();
  }
  if (k === 'format') {
    if (ed.slides.length > 1 && v !== 'carousel' && !await confirmBox({ title: 'Trocar o formato?', text: 'Só a primeira lâmina será mantida.', ok: 'Trocar' })) return render();
    if (v !== 'carousel') ed.slides = ed.slides.slice(0, 1);
    ed.format = v; MK.edSlide = 0; return render();
  }
}
