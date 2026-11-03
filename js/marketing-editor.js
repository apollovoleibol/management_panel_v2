/* Estúdio de peças · editor em tela cheia: biblioteca (esquerda), arte (centro), propriedades do que está selecionado (direita) e lâminas (rodapé).
   Edição direta na arte: clicar seleciona, arrastar move, alças redimensionam e giram, dois cliques editam o texto. Desfazer/refazer em tudo.
   Depende de marketing.js, marketing-studio-core.js e marketing-layouts.js. */
'use strict';

/* ═══════════ Ícones próprios do editor ═══════════ */
const ED_IC = {
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11', redo: 'M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  text: 'M4 7V4h16v3M9 20h6M12 4v16', image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15 9.5h.01',
  shapes: 'M3 3h8v8H3zM17 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM7 14l4 7H3z', brush: 'M18 3l3 3-9 9-3-3zM9 12c-3 0-5 2-5 5 0 1.5-1 2.5-2 3 3 1 7 .5 8.5-1.5 1-1.3 1.2-2.8.5-4',
  stack: 'M12 3 2 8l10 5 10-5zM2 13l10 5 10-5M2 17.5l10 5 10-5', zin: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5M8 11h6M11 8v6', zout: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5M8 11h6',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5', front: 'M9 9h11v11H9zM5 15H4V4h11v1', back: 'M4 4h11v11H4zM19 9h1v11H9v-1',
  unlock: 'M7 11V7a5 5 0 0 1 9.6-2M5 11h14v10H5z', al: 'M4 3v18M8 7h12v4H8zM8 14h7v4H8z', ac: 'M12 3v18M6 7h12v4H6zM8.5 14h7v4h-7z', ar: 'M20 3v18M4 7h12v4H4zM9 14h7v4H9z',
  at: 'M3 4h18M7 8h4v12H7zM14 8h4v7h-4z', am: 'M3 12h18M7 6h4v12H7zM14 8.5h4v7h-4z', ab: 'M3 20h18M7 4h4v12H7zM14 9h4v7h-4z',
  drag: 'M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01', talign_l: 'M4 6h16M4 10h10M4 14h16M4 18h10', talign_c: 'M4 6h16M7 10h10M4 14h16M7 18h10', talign_r: 'M4 6h16M10 10h10M4 14h16M10 18h10',
  caps: 'M3 18 7 6l4 12M4.5 14h5M14 18V6h4a3 3 0 0 1 0 6h-4 5a3 3 0 0 1 0 6z', italic: 'M10 4h8M6 20h8M14 4l-4 16', outline: 'M5 20 12 4l7 16M8 14h8', mouse: 'M12 3a6 6 0 0 0-6 6v6a6 6 0 0 0 12 0V9a6 6 0 0 0-6-6zM12 7v4',
};
const edIc = n => ED_IC[n] ? `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="${ED_IC[n]}"/></svg>` : icon(n);
const RAIL = [['layouts', 'layers', 'Layouts'], ['text', 'text', 'Texto'], ['photos', 'image', 'Fotos'], ['brand', 'star', 'Marca'], ['elements', 'shapes', 'Elementos'], ['draw', 'brush', 'Pincel'], ['ai', 'sparkle', 'IA'], ['layers', 'stack', 'Camadas']];

/* ═══════════ Acesso ao estado ═══════════ */
const edF = () => MK_FORMATS[MK.ed.format];
const edSl = () => MK.ed.slides[MK.edSlide] || MK.ed.slides[0];
const edU = f => f.w / 100;
const edCtx = () => ({ ...mkCtx(), ph: true });
const edLogoAr = el => (MK_LOGOS[el.variant && el.variant !== 'auto' ? el.variant : 'assinatura-azul'] || MK_LOGOS['assinatura-azul']).ar;
// Logos brancas ou de contorno aparecem sobre fundo azul nas miniaturas
const edLogoDark = k => !!MK_LOGOS[k]?.dark || String(k).startsWith('selo-contorno');
const edAr = el => el.type === 'logo' ? edLogoAr(el) : undefined;
function edFind(id) {
  const ed = MK.ed, sl = edSl();
  let el = sl.e.find(e => e.id === id); if (el) return { el, strip: false };
  el = ed.strip.find(e => e.id === id); return el ? { el, strip: true } : null;
}
const edSel = () => (MK.sel ? edFind(MK.sel) : null);
const ED_TYPE = { text: ['text', 'Texto'], image: ['image', 'Foto'], logo: ['star', 'Logo'], shape: ['shapes', 'Forma'], brush: ['brush', 'Pincelada'], paint: ['brush', 'Desenho'] };
const edElName = el => el.label || (el.type === 'brush' ? MK_BRUSHES[el.brush]?.label : ED_TYPE[el.type]?.[1]) || el.id;
function edSetPath(obj, path, value) {
  const keys = path.split('.'); let o = obj;
  for (let i = 0; i < keys.length - 1; i++) { if (o[keys[i]] == null || typeof o[keys[i]] !== 'object') o[keys[i]] = {}; o = o[keys[i]]; }
  if (value === undefined) delete o[keys[keys.length - 1]]; else o[keys[keys.length - 1]] = value;
}
const edGetPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const edSlotVals = strip => (strip ? MK.ed.sv : edSl().v);
const edDark = () => mkIsDark(edSl());

/* ═══════════ Desfazer e refazer ═══════════ */
const edSnapshot = () => JSON.stringify({ s: MK.ed.slides, st: MK.ed.strip, sv: MK.ed.sv });
function edHistReset() { MK.hist = []; MK.fut = []; MK.histCur = edSnapshot(); }
let edCT;
function edQueueCommit() { clearTimeout(edCT); edCT = setTimeout(edCommit, 320); }
function edCommit() {
  clearTimeout(edCT); if (!MK.ed) return;
  const s = edSnapshot(); if (s === MK.histCur) return;
  MK.hist.push(MK.histCur); if (MK.hist.length > 80) MK.hist.shift();
  MK.histCur = s; MK.fut = []; edRefreshTop(); edRefreshPages();
}
function edUndoRedo(redo) {
  if (mkLocked()) return; edCommit();
  const from = redo ? MK.fut : MK.hist, to = redo ? MK.hist : MK.fut; if (!from.length) return;
  to.push(MK.histCur); MK.histCur = from.pop();
  const d = JSON.parse(MK.histCur); Object.assign(MK.ed, { slides: d.s, strip: d.st, sv: d.sv, dirty: true });
  MK.edSlide = Math.min(MK.edSlide, MK.ed.slides.length - 1); if (MK.sel && !edFind(MK.sel)) MK.sel = '';
  edRefreshAll(true); edRefreshInsp(); edRefreshTop(); edRefreshPages(); edRefreshDrawer();
}

/* ═══════════ Página do editor ═══════════ */
function mkEditorPage() {
  if (!MK.histCur) edHistReset();
  setTimeout(edAfterRender, 0);
  return `<div class="st-app" id="stApp">
    <header class="st-top" id="stTop">${edTopHtml()}</header>${edBanner()}
    <div class="st-body"><nav class="st-rail" aria-label="Biblioteca">${RAIL.map(([id, ic, l]) => `<button class="${MK.ui.rail === id ? 'on' : ''}" data-ed="rail" data-v="${id}" aria-pressed="${MK.ui.rail === id}">${edIc(ic)}<span>${l}</span></button>`).join('')}</nav>
      <aside class="st-drawer" id="stDrawer">${edDrawer()}</aside>
      <main class="st-canvas" id="stCanvas"><div class="st-viewport" id="stViewport"><div class="st-stagewrap" id="mkStageWrap"></div></div><div class="st-hint" id="stHint">${edHint()}</div></main>
      <aside class="st-insp" id="stInsp">${edInspector()}</aside></div>
    <footer class="st-pages" id="stPages">${edPagesHtml()}</footer></div>`;
}
function edBanner() {
  const ed = MK.ed;
  return ed.approval_status === 'em_aprovacao' ? `<div class="st-banner note">${icon('shield')}<span><b>Em aprovação.</b> A peça fica bloqueada até a administração decidir.</span></div>`
    : ed.approval_status === 'aprovada' ? `<div class="st-banner ok">${icon('check')}<span><b>Aprovada.</b> Para alterar, crie uma nova versão.</span></div>`
    : ed.approval_status === 'reprovada' ? `<div class="st-banner warn">${icon('alert')}<span><b>Reprovada:</b> ${esc(ed.review_note || 'sem motivo informado')}. Ajuste e envie de novo.</span></div>` : '';
}
function edTopHtml() {
  const ed = MK.ed, locked = mkLocked(), admin = mkIsAdmin(), busy = MK.busy ? 'disabled' : '';
  return `<div class="st-top-l"><button class="st-ib" data-mk="back" title="Voltar para as peças" aria-label="Voltar para as peças">${icon('left')}</button>
      <div class="st-tbox"><input class="st-title" id="stTitle" maxlength="140" value="${esc(ed.title)}" data-edf="meta" data-k="title" aria-label="Nome da peça" ${locked ? 'disabled' : ''}><div class="st-state" id="stState">${edStateHtml()}</div></div></div>
    <div class="st-top-c"><span class="st-grp" id="stUndo">${edUndoHtml()}</span>
      <select class="st-sel" data-edf="meta" data-k="format" aria-label="Formato" ${locked ? 'disabled' : ''}>${Object.entries(MK_FORMATS).map(([k, f]) => `<option value="${k}" ${k === ed.format ? 'selected' : ''}>${f.label}</option>`).join('')}</select>
      <span class="st-grp" id="stZoom">${edZoomHtml()}</span></div>
    <div class="st-top-r">${ed.approval_status === 'em_aprovacao' && admin ? `<button class="btn sm ok" data-mk="approve">${icon('check')} Aprovar</button><button class="btn sm danger" data-mk="reject">${icon('x')} Reprovar</button>` : ''}
      <button class="btn sm" data-mk="download" ${busy}>${icon('download')} Baixar</button>
      ${!locked ? `<button class="btn sm" data-mk="piece-save" ${busy} title="Ctrl+S">${icon('check')} Salvar</button>` : ''}
      ${['rascunho', 'reprovada'].includes(ed.approval_status) ? `<button class="btn sm primary" data-mk="submit" ${busy}>${icon('shield')} Enviar para aprovação</button>` : ed.approval_status === 'aprovada' ? `<button class="btn sm" data-mk="new-version">${icon('copy')} Nova versão</button>` : ''}</div>`;
}
const edStateHtml = () => `${mkTag(MK_APPR[MK.ed.approval_status])}<span class="st-saved">${MK.busy === 'export' ? 'Gerando imagens…' : MK.ed.dirty ? 'Alterações não salvas' : MK.ed.id ? 'Tudo salvo' : 'Ainda não salva'}</span>`;
const edUndoHtml = () => `<button class="st-ib" data-ed="undo" title="Desfazer (Ctrl+Z)" aria-label="Desfazer" ${MK.hist.length && !mkLocked() ? '' : 'disabled'}>${edIc('undo')}</button><button class="st-ib" data-ed="redo" title="Refazer (Ctrl+Shift+Z)" aria-label="Refazer" ${MK.fut.length && !mkLocked() ? '' : 'disabled'}>${edIc('redo')}</button>`;
const edZoomHtml = () => `<button class="st-ib" data-ed="zoom-out" title="Diminuir zoom" aria-label="Diminuir zoom">${edIc('zout')}</button><button class="st-zoom" data-ed="zoom-fit" title="Ajustar à tela">${Math.round((MK.scale || 0.4) * 100)}%</button><button class="st-ib" data-ed="zoom-in" title="Aumentar zoom" aria-label="Aumentar zoom">${edIc('zin')}</button>`;
function edHint() {
  if (mkLocked()) return 'Peça bloqueada: só leitura.';
  if (MK.tool === 'paint') return `${edIc('brush')} Pincel ativo: desenhe sobre a arte. Com caneta, a pressão controla a textura. <b>Esc</b> para sair.`;
  const f = edSel();
  if (!f) return 'Clique em um elemento para editar · arraste fotos do computador direto na arte · <b>Ctrl+Z</b> desfaz';
  if (f.el.type === 'text') return '<b>Dois cliques</b> para escrever na arte · cantos mudam o tamanho da letra · <b>Alt</b> solta o encaixe · <b>Shift</b> trava o eixo';
  return 'Arraste para mover · alças redimensionam · bolinha de cima gira · <b>Shift</b> mantém a proporção · <b>Alt</b> solta o encaixe';
}

/* ═══════════ Atualizações parciais ═══════════ */
function edAfterRender() {
  if (!MK.ed || S.page !== 'studio') return;
  document.documentElement.classList.add('st-open');
  edDrawStage(); edEnsureDraw(); edDrawerAfter();
}
function edRefreshAll(ensure = true) { if (!MK.ed) return; edDrawStage(); if (ensure) edEnsureDraw(); }
function edRefreshInsp() { const s = $('#stInsp'); if (s) s.innerHTML = edInspector(); const h = $('#stHint'); if (h) h.innerHTML = edHint(); }
function edRefreshDrawer() { const s = $('#stDrawer'); if (s) { const top = s.scrollTop; s.innerHTML = edDrawer(); s.scrollTop = top; edDrawerAfter(); } $$('.st-rail button').forEach(b => { b.classList.toggle('on', b.dataset.v === MK.ui.rail); b.setAttribute('aria-pressed', b.dataset.v === MK.ui.rail); }); }
function edRefreshTop() { if (!MK.ed) return; const a = $('#stState'), b = $('#stUndo'), c = $('#stZoom'); if (a) a.innerHTML = edStateHtml(); if (b) b.innerHTML = edUndoHtml(); if (c) c.innerHTML = edZoomHtml(); }
let edPT; function edRefreshPages(now) { clearTimeout(edPT); const go = () => { const s = $('#stPages'); if (s && MK.ed) s.innerHTML = edPagesHtml(); }; if (now) go(); else edPT = setTimeout(go, 250); }
function edSelect(id) { MK.sel = id || ''; if (MK.editing) return; edOverlay(); edRefreshInsp(); if (MK.ui.rail === 'layers') edRefreshDrawer(); }

/* ═══════════ Palco ═══════════ */
function edScale() {
  if (MK.ui.zoom) return MK.ui.zoom;
  const vp = $('#stViewport'), f = edF(); if (!vp) return 0.4;
  return Math.max(0.08, Math.min((vp.clientHeight - 56) / f.h, (vp.clientWidth - 56) / f.w));
}
function edStageHtml() {
  const ed = MK.ed, f = edF(), n = ed.slides.length;
  if (!MK_CACHE.assets) return '<div class="st-loading">Carregando a marca…</div>';
  const k = edScale(); MK.scale = k;
  return `<div class="mk-stage ${MK.tool === 'paint' ? 'painting' : ''}" id="mkStage" style="width:${Math.round(n * f.w * k)}px;height:${Math.round(f.h * k)}px"><div class="mk-row" style="width:${n * f.w}px;height:${f.h}px;transform:scale(${k})">`
    + ed.slides.map((s, i) => `<div class="mk-slide" data-i="${i}" style="width:${f.w}px;height:${f.h}px">${mkSlideHtml(s, ed.format, edCtx(), i, n, ed.strip, ed.sv)}</div>`).join('')
    + `</div><div class="mk-ov" id="mkOv"></div></div>`;
}
function edDrawStage() {
  const w = $('#mkStageWrap'); if (!w || !MK.ed) return;
  w.innerHTML = edStageHtml(); edOverlay(); edRefreshTop();
  if (MK.ui.scrollTo != null) { const vp = $('#stViewport'), f = edF(), k = MK.scale; if (vp && MK.ed.slides.length > 1) vp.scrollLeft = Math.max(0, MK.ui.scrollTo * f.w * k + 28 - (vp.clientWidth - f.w * k) / 2); MK.ui.scrollTo = null; }
}
async function edEnsureDraw() {
  if (!MK.ed) return;
  try { const n = await mkEnsure(MK.ed.slides, MK.ed.strip, MK.ed.sv, MK.ed.format, mkResolveImage); if ((n || !$('#mkStage')) && !MK.editing && !DR) { edDrawStage(); edRefreshPages(); } } catch (e) { toast(mkErr(e), true); }
}
let edT; const edLater = (fn, ms = 70) => { clearTimeout(edT); edT = setTimeout(fn, ms); };

/* Caixas de seleção, alças e barra rápida sobre a arte */
function edOverlay() {
  const ov = $('#mkOv'), st = $('#mkStage'); if (!ov || !st || !MK.ed) return;
  const ed = MK.ed, f = edF(), k = MK.scale, n = ed.slides.length, sr = st.getBoundingClientRect(), locked = mkLocked();
  let h = '';
  for (let i = 0; i < n; i++) h += `<div class="mk-frame ${i === MK.edSlide && n > 1 ? 'cur' : ''}" data-i="${i}" style="left:${i * f.w * k}px;width:${f.w * k}px;height:${f.h * k}px"></div>`;
  const add = (el, strip) => {
    const slideIdx = strip ? MK.edSlide : MK.edSlide, node = st.querySelector(`.mk-slide[data-i="${slideIdx}"] [data-el="${CSS.escape(el.id)}"]`); if (!node) return;
    const r = node.getBoundingClientRect(), sel = el.id === MK.sel, edit = sel && !locked && !MK.tool && !el.lock;
    const hs = el.type === 'text' ? ['e', 'w', 'ne', 'nw', 'se', 'sw'] : el.type === 'logo' ? ['ne', 'nw', 'se', 'sw'] : ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
    h += `<div class="mk-box ${sel ? 'sel' : ''} ${strip ? 'strip' : ''} ${el.lock ? 'locked' : ''}" data-id="${esc(el.id)}" data-i="${slideIdx}" data-strip="${strip ? 1 : 0}" style="left:${r.left - sr.left}px;top:${r.top - sr.top}px;width:${Math.max(6, r.width)}px;height:${Math.max(6, r.height)}px">`
      + (sel ? `<span class="mk-tag">${el.lock ? edIc('lock') + ' ' : ''}${esc(edElName(el))}${strip ? ' · contínuo' : ''}</span>` : '')
      + (edit ? hs.map(d => `<i class="h ${d}" data-h="${d}"></i>`).join('') + (el.full ? '' : '<i class="h rot" data-h="rot" title="Girar"></i>') : '') + '</div>';
  };
  for (const el of ed.strip) if (!el.front) add(el, true);
  for (const el of edSl().e) add(el, false);
  for (const el of ed.strip) if (el.front) add(el, true);
  const found = edSel();
  if (found && !locked && !MK.tool) {
    const node = st.querySelector(`.mk-slide[data-i="${MK.edSlide}"] [data-el="${CSS.escape(found.el.id)}"]`);
    if (node) {
      const r = node.getBoundingClientRect(), x = Math.min(Math.max(4, r.left - sr.left + r.width / 2), sr.width - 4), top = r.top - sr.top < 52 ? r.bottom - sr.top + 50 : r.top - sr.top - 44;
      const el = found.el;
      h += `<div class="st-float" style="left:${x}px;top:${top}px">${el.type === 'text' ? `<button data-ed="inline-edit" data-id="${esc(el.id)}" title="Editar texto (Enter)">${edIc('edit')}</button>` : ''}`
        + `<button data-ed="dup" data-id="${esc(el.id)}" title="Duplicar (Ctrl+D)">${icon('copy')}</button><button data-ed="front" data-id="${esc(el.id)}" title="Trazer para frente (])">${edIc('front')}</button><button data-ed="back" data-id="${esc(el.id)}" title="Enviar para trás ([)">${edIc('back')}</button>`
        + `<button data-ed="ellock" data-id="${esc(el.id)}" title="${el.lock ? 'Destravar' : 'Travar posição'}">${edIc(el.lock ? 'lock' : 'unlock')}</button><button class="danger" data-ed="del" data-id="${esc(el.id)}" title="Excluir (Delete)">${icon('trash')}</button></div>`;
    }
  }
  if (MK.tool === 'paint') h += '<canvas class="mk-paint" id="mkPaint"></canvas>';
  ov.innerHTML = h;
  const pc = $('#mkPaint'); if (pc) { pc.width = Math.round(sr.width); pc.height = Math.round(sr.height); }
}

/* ═══════════ Arrastar, redimensionar, girar ═══════════ */
let DR = null;
function edNodes(id, strip) {
  const st = $('#mkStage'); if (!st) return [];
  return strip ? $$(`.mk-slide [data-el="${CSS.escape(id)}"]`, st).map(n => ({ n, i: +n.closest('.mk-slide').dataset.i })) : $$(`.mk-slide[data-i="${MK.edSlide}"] [data-el="${CSS.escape(id)}"]`, st).map(n => ({ n, i: MK.edSlide }));
}
function edApplyNode(node, el, f) {
  node.style.top = node.style.bottom = node.style.height = ''; node.style.maxWidth = '';
  mkPos(el, f, edAr(el)).split(';').filter(Boolean).forEach(d => { const i = d.indexOf(':'); node.style.setProperty(d.slice(0, i).trim(), d.slice(i + 1).trim()); });
}
// Redesenha só o elemento arrastado (texto muda de tamanho de letra; os demais só mudam de posição)
function edLive(el, strip) {
  const f = edF(), out = [];
  for (const { n, i } of edNodes(el.id, strip)) {
    const e = strip ? { ...el, x: el.x - 100 * i } : el;
    if (el.type === 'text') { const tmp = document.createElement('div'); tmp.innerHTML = mkTextHtml(e, edSlotVals(strip), f); const nn = tmp.firstElementChild; if (nn) { n.replaceWith(nn); out.push(nn); } else out.push(n); }
    else { edApplyNode(n, e, f); n.style.transform = `${el.rot ? `rotate(${el.rot}deg)` : ''}${(el.type === 'brush' || el.type === 'paint') && el.flip ? ' scaleX(-1)' : ''}`.trim() || 'none'; out.push(n); }
  }
  return out;
}
function edRectsOf(slideIdx, exceptId) {
  const st = $('#mkStage'), f = edF(), k = MK.scale, u1 = edU(f), slide = st.querySelector(`.mk-slide[data-i="${slideIdx}"]`); if (!slide) return [];
  const s = slide.getBoundingClientRect();
  return $$('[data-el]', slide).filter(n => n.dataset.el !== exceptId).map(n => { const r = n.getBoundingClientRect(); return { x: (r.left - s.left) / k / u1, y: (r.top - s.top) / k / u1, w: r.width / k / u1, h: r.height / k / u1 }; })
    .filter(r => r.w < 99 || r.h < mkHu(f) - 1);
}
function edSnapRect(r, f, others, axes = 'xy') {
  const Hu = mkHu(f), thr = 6 / (MK.scale * edU(f)), g = {};
  const xs = [0, 6, 50, 94, 100], ys = [0, 6, Hu / 2, Hu - 6, Hu];
  for (const o of others) { xs.push(o.x, o.x + o.w / 2, o.x + o.w); ys.push(o.y, o.y + o.h / 2, o.y + o.h); }
  const pick = (pos, size, list) => { let best = null; for (const [off, v] of [[0, pos], [size / 2, pos + size / 2], [size, pos + size]]) for (const c of list) { const d = Math.abs(v - c); if (d < thr && (!best || d < best.d)) best = { d, p: c - off, line: c }; } return best; };
  if (axes.includes('x')) { const b = pick(r.x, r.w, xs); if (b) { r.x = b.p; g.x = b.line; } }
  if (axes.includes('y')) { const b = pick(r.y, r.h, ys); if (b) { r.y = b.p; g.y = b.line; } }
  return g;
}
function edGuides(g, slideIdx) {
  $$('.mk-guide').forEach(x => x.remove());
  const ov = $('#mkOv'), f = edF(), u1 = edU(f), k = MK.scale; if (!ov) return;
  if (g.x != null) ov.insertAdjacentHTML('beforeend', `<i class="mk-guide v" style="left:${(slideIdx * 100 + g.x) * u1 * k}px"></i>`);
  if (g.y != null) ov.insertAdjacentHTML('beforeend', `<i class="mk-guide h" style="top:${g.y * u1 * k}px"></i>`);
}
document.addEventListener('pointerdown', e => {
  if (!MK.ed || S.page !== 'studio' || e.button > 0) return;
  if (e.target.closest('.st-inline,.st-float')) return;
  const pc = e.target.closest('#mkPaint'); if (pc) return edPaintStart(e, pc);
  const inCanvas = e.target.closest('#stViewport'); if (!inCanvas) return;
  if (MK.editing) return;
  const box = e.target.closest('.mk-box'), frame = e.target.closest('.mk-frame');
  if (!box) {
    if (frame) { const i = +frame.dataset.i; if (i !== MK.edSlide) { MK.edSlide = i; MK.sel = ''; edDrawStage(); edRefreshInsp(); edRefreshPages(true); return; } }
    if (MK.sel) edSelect('');
    return;
  }
  const id = box.dataset.id, strip = box.dataset.strip === '1';
  const changed = MK.sel !== id; MK.sel = id;
  if (changed) { edOverlay(); edRefreshInsp(); if (MK.ui.rail === 'layers') edRefreshDrawer(); }
  const found = edFind(id); if (!found || mkLocked() || found.el.lock) { e.preventDefault(); return; }
  const f = edF(), k = MK.scale, u1 = edU(f), el = found.el, nb = $(`.mk-box[data-id="${CSS.escape(id)}"]`) || box, hDom = (nb.getBoundingClientRect().height / k) / u1;
  const mode = e.target.dataset.h || 'move';
  DR = { mode, el, strip, id, sx: e.clientX, sy: e.clientY, r0: mkRectU(el, f, hDom, edAr(el)), fs0: el.st?.fs || 4, moved: false, box: nb, others: edRectsOf(MK.edSlide, id), rot0: el.rot || 0 };
  if (mode === 'rot') { const r = nb.getBoundingClientRect(); DR.cx = r.left + r.width / 2; DR.cy = r.top + r.height / 2; }
  nb.setPointerCapture(e.pointerId); e.preventDefault();
});
document.addEventListener('pointermove', e => {
  if (!DR) return;
  if (!DR.moved && Math.hypot(e.clientX - DR.sx, e.clientY - DR.sy) < 3) return;
  const f = edF(), k = MK.scale, u1 = edU(f), el = DR.el, r0 = DR.r0;
  let dx = (e.clientX - DR.sx) / k / u1, dy = (e.clientY - DR.sy) / k / u1;
  if (!DR.moved && el.full) { el.full = false; }
  DR.moved = true;
  let g = {};
  if (DR.mode === 'rot') {
    // a alça fica embaixo do elemento: apontar para baixo = 0°
    let a = Math.atan2(e.clientY - DR.cy, e.clientX - DR.cx) * 180 / Math.PI - 90; if (a < -180) a += 360;
    a = e.shiftKey ? Math.round(a / 15) * 15 : Math.round(a); for (const s of [0, 90, -90, 180, -180]) if (Math.abs(a - s) < 4) a = s;
    el.rot = a || undefined; if (!el.rot) delete el.rot;
    $$('.mk-tag', DR.box).forEach(t => { t.textContent = `${a}°`; });
  } else {
    const r = { ...r0 }, m = DR.mode;
    if (m === 'move') {
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      r.x += dx; r.y += dy;
      if (!e.altKey) g = edSnapRect(r, f, DR.others);
    } else if (el.type === 'text' && m.length === 2) {
      // canto do texto: escala a letra junto com a caixa
      const s = Math.max(0.15, (r0.w + (m.includes('e') ? dx : -dx)) / r0.w);
      r.w = r0.w * s; el.st = { ...(el.st || {}), fs: Math.round(DR.fs0 * s * 10) / 10 };
      if (m.includes('w')) r.x = r0.x + r0.w - r.w; r.h = r0.h * s; if (m.includes('n')) r.y = r0.y + r0.h - r.h;
    } else {
      const lockAr = el.type === 'logo' || !!el.ar || (e.shiftKey && m.length === 2);
      if (m.includes('e')) r.w = r0.w + dx; if (m.includes('w')) { r.x = r0.x + dx; r.w = r0.w - dx; }
      if (el.type !== 'text') { if (m.includes('s')) r.h = r0.h + dy; if (m.includes('n')) { r.y = r0.y + dy; r.h = r0.h - dy; } }
      if (lockAr && m.length === 2) { const ar = r0.w / (r0.h || 1); r.h = r.w / ar; if (m.includes('n')) r.y = r0.y + r0.h - r.h; }
      if (r.w < 2) { if (m.includes('w')) r.x -= 2 - r.w; r.w = 2; } if (r.h < 1) r.h = 1;
    }
    mkSetRectU(el, f, r);
  }
  const nodes = edLive(el, DR.strip), cur = nodes.find(x => +x.closest('.mk-slide').dataset.i === MK.edSlide) || nodes[0];
  if (cur) { const sr = $('#mkStage').getBoundingClientRect(), nr = cur.getBoundingClientRect(); Object.assign(DR.box.style, { left: nr.left - sr.left + 'px', top: nr.top - sr.top + 'px', width: nr.width + 'px', height: nr.height + 'px' }); }
  $$('.st-float').forEach(x => x.remove());
  edGuides(g, MK.edSlide);
});
document.addEventListener('pointerup', () => {
  if (!DR) return;
  const moved = DR.moved; DR = null; $$('.mk-guide').forEach(x => x.remove());
  if (moved) { mkTouch(); edRefreshAll(true); edRefreshInsp(); }
});

/* Escrever direto na arte */
function edInlineEdit(id) {
  const found = edFind(id); if (!found || found.el.type !== 'text' || mkLocked() || MK.tool) return;
  const st = $('#mkStage'), node = st && st.querySelector(`.mk-slide[data-i="${MK.edSlide}"] [data-el="${CSS.escape(id)}"]`); if (!node) return;
  const sr = st.getBoundingClientRect(), r = node.getBoundingClientRect(), cs = getComputedStyle(node), k = MK.scale, el = found.el;
  const vals = edSlotVals(found.strip), px = v => (parseFloat(v) || 0) * k + 'px';
  const box = document.createElement('div');
  box.className = 'st-inline'; box.setAttribute('contenteditable', 'plaintext-only'); if (box.contentEditable !== 'plaintext-only') box.setAttribute('contenteditable', 'true');
  box.setAttribute('role', 'textbox'); box.setAttribute('aria-label', edElName(el)); box.spellcheck = true;
  const outline = el.st?.outline;
  Object.assign(box.style, { left: r.left - sr.left + 'px', top: r.top - sr.top + 'px', width: Math.max(r.width, 40) + 'px', minHeight: r.height + 'px', fontFamily: cs.fontFamily, fontWeight: cs.fontWeight, fontStyle: cs.fontStyle, fontSize: px(cs.fontSize),
    lineHeight: cs.lineHeight === 'normal' ? 'normal' : px(cs.lineHeight), letterSpacing: cs.letterSpacing === 'normal' ? 'normal' : px(cs.letterSpacing), color: outline ? mkCol(el.st.color || 'white') : cs.color, textAlign: cs.textAlign, textTransform: cs.textTransform,
    background: cs.backgroundColor, padding: `${px(cs.paddingTop)} ${px(cs.paddingRight)} ${px(cs.paddingBottom)} ${px(cs.paddingLeft)}` });
  box.textContent = vals[el.slot] ?? el.def ?? '';
  node.style.visibility = 'hidden'; $$('.st-float').forEach(x => x.remove());
  $('#mkOv').appendChild(box); MK.editing = id;
  box.focus(); const range = document.createRange(); range.selectNodeContents(box); const s = getSelection(); s.removeAllRanges(); s.addRange(range);
  // innerText respeita a caixa alta do CSS: lê sem a transformação para guardar o que a pessoa digitou
  const readText = () => { const tt = box.style.textTransform; box.style.textTransform = 'none'; const t = box.innerText.replace(/\n$/, ''); box.style.textTransform = tt; return t; };
  box.addEventListener('input', () => { vals[el.slot] = readText(); mkTouch(); const ta = $(`#sti_${CSS.escape(id)}`); if (ta) ta.value = vals[el.slot]; edCounter(id, vals[el.slot]); });
  box.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Escape' || (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey))) { ev.preventDefault(); box.blur(); } });
  box.addEventListener('blur', () => { MK.editing = ''; edRefreshAll(false); edRefreshInsp(); edRefreshPages(); }, { once: true });
}
function edCounter(id, val) {
  const found = edFind(id), c = $('#stc_' + CSS.escape(id)); if (!c || !found) return;
  c.textContent = `${String(val).length}${found.el.max ? ' / ' + found.el.max : ''}`; c.classList.toggle('mk-over', !!found.el.max && String(val).length > found.el.max);
}

/* Teclado */
document.addEventListener('keydown', e => {
  if (!MK.ed || S.page !== 'studio' || document.querySelector('dialog[open]') || MK.editing) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
  if (mod && key === 's') { e.preventDefault(); if (!mkLocked()) mkSavePiece(false).then(ok => ok && edRefreshTop()); return; }
  if (typing) return;
  if (mod && key === 'z') { e.preventDefault(); return edUndoRedo(e.shiftKey); }
  if (mod && key === 'y') { e.preventDefault(); return edUndoRedo(true); }
  if (e.key === 'Escape') { if (MK.tool) { MK.tool = null; edDrawStage(); edRefreshDrawer(); edRefreshInsp(); } else if (MK.sel) edSelect(''); return; }
  if (mkLocked()) return;
  if (mod && key === 'v' && MK.clip) { e.preventDefault(); return edPaste(); }
  const found = edSel(); if (!found) return;
  if (mod && key === 'c') { MK.clip = { el: mkClone(found.el), val: edSlotVals(found.strip)[found.el.slot] }; toast('Elemento copiado. Ctrl+V cola em qualquer lâmina.'); return; }
  if (mod && key === 'd') { e.preventDefault(); return edDup(found.el.id); }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); return edDelete(); }
  if (e.key === 'Enter' && found.el.type === 'text') { e.preventDefault(); return edInlineEdit(found.el.id); }
  if (e.key === ']' || e.key === '[') return edOrder(found.el.id, e.key === ']' ? 1 : -1);
  const step = e.shiftKey ? 2 : 0.5, d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]; if (!d || found.el.lock) return;
  e.preventDefault();
  const f = edF(), el = found.el, r = mkRectU(el, f, 0, edAr(el)); el.full = false; r.x += d[0]; r.y += d[1]; mkSetRectU(el, f, r); mkTouch(); edRefreshAll(false); edLater(edRefreshInsp, 200);
});
// Ctrl + roda do mouse = zoom; janela redimensionada = reajusta
document.addEventListener('wheel', e => { if (!MK.ed || !(e.ctrlKey || e.metaKey) || !e.target.closest('#stViewport')) return; e.preventDefault(); edZoom(e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
window.addEventListener('resize', () => { if (MK.ed && !MK.ui.zoom) edLater(edDrawStage, 120); });
function edZoom(mult) { MK.ui.zoom = Math.min(3, Math.max(0.08, (MK.scale || 0.4) * mult)); edDrawStage(); }

/* ═══════════ Pincel livre (mesa digitalizadora) ═══════════ */
let PT = null;
function edPaintStart(e, canvas) {
  if (mkLocked() || !MK_CACHE.tips) return;
  const sr = canvas.getBoundingClientRect(), f = edF();
  PT = { canvas, ctx: canvas.getContext('2d'), sr, pts: [], mouse: e.pointerType === 'mouse', seed: Math.floor(Math.random() * 1e6) + 1, tip: MK_CACHE.tips[MK.paint.brush], th: MK.paint.size * edU(f) * MK.scale };
  PT.ctx.globalCompositeOperation = 'source-over'; PT.ctx.filter = 'none';
  canvas.setPointerCapture(e.pointerId); e.preventDefault();
  edPaintAdd(e);
}
function edPaintAdd(e) {
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of (evs.length ? evs : [e])) {
    const p = PT.mouse ? 0.5 : Math.max(0.05, ev.pressure || 0.5), pt = { x: ev.clientX - PT.sr.left, y: ev.clientY - PT.sr.top, p }, prev = PT.pts[PT.pts.length - 1];
    PT.pts.push(pt);
    if (prev && Math.hypot(pt.x - prev.x, pt.y - prev.y) > 0.5) mkStampPath(PT.ctx, PT.tip, [prev, pt], PT.th, { alpha: 0.26, gamma: 1.35, seed: PT.seed + PT.pts.length, follow: true });
  }
}
document.addEventListener('pointermove', e => { if (PT) edPaintAdd(e); });
document.addEventListener('pointerup', () => { if (PT) edPaintEnd(); });
function edPaintEnd() {
  const P = PT; PT = null;
  const f = edF(), k = MK.scale, u1 = edU(f), ed = MK.ed;
  const raw = mkSimplify(P.pts.map(p => [p.x, p.y, p.p]), 1.2);
  if (raw.length < 2) return edDrawStage();
  const xs = raw.map(p => p[0]), ys = raw.map(p => p[1]), toU = px => px / k / u1;
  const pad = MK.paint.size * 0.9, minX = toU(Math.min(...xs)) - pad, maxX = toU(Math.max(...xs)) + pad, minY = toU(Math.min(...ys)) - pad, maxY = toU(Math.max(...ys)) + pad;
  const bw = Math.max(2, maxX - minX), bh = Math.max(2, maxY - minY);
  const i0 = Math.max(0, Math.floor(minX / 100)), i1 = Math.min(ed.slides.length - 1, Math.floor(maxX / 100));
  const strip = ed.format === 'carousel' && i1 > i0, base = strip ? 0 : i0 * 100, n = raw.length;
  const pts = raw.map((p, i) => [r1(((toU(p[0]) - minX) / bw) * 1000) / 1000, r1(((toU(p[1]) - minY) / bh) * 1000) / 1000, P.mouse ? Math.round((0.35 + 0.65 * mkPressureAt(i / (n - 1), P.seed, 0.5)) * 100) / 100 : Math.round(p[2] * 100) / 100]);
  const el = { id: mkUid(), type: 'paint', brush: MK.paint.brush, color: MK.paint.color, size: MK.paint.size, tex: MK.paint.tex, seed: P.seed, x: r1(minX - base), w: r1(bw), t: r1(minY), h: r1(bh), pts };
  if (strip) ed.strip.push(el); else { MK.edSlide = i0; ed.slides[i0].e.push(el); }
  mkTouch(); edRefreshAll(true); edRefreshPages();
}

/* ═══════════ Biblioteca (gaveta da esquerda) ═══════════ */
function edDrawer() {
  const locked = mkLocked(), r = MK.ui.rail;
  const body = r === 'layouts' ? edDrawLayouts(locked) : r === 'text' ? edDrawText(locked) : r === 'photos' ? edDrawPhotos(locked) : r === 'brand' ? edDrawBrand(locked)
    : r === 'elements' ? edDrawElements(locked) : r === 'draw' ? edDrawPaint(locked) : r === 'ai' ? edAiTab(locked) : edDrawLayers(locked);
  return `<div class="st-dh">${esc(RAIL.find(x => x[0] === r)[2])}</div><div class="st-dbody">${body}</div>`;
}
// Miniaturas precisam das pinceladas prontas; quando ficam prontas a gaveta é redesenhada
let edThumbFmt = '';
function edDrawerAfter() {
  if (!MK.ed || MK.ui.rail !== 'layouts' || edThumbFmt === MK.ed.format + MK.layouts.length) return;
  edThumbFmt = MK.ed.format + MK.layouts.length;
  const fmt = MK.ed.format, slides = mkAllLayouts().filter(l => l.formats.includes(fmt)).map(l => mkNewSlide(l));
  mkEnsure(slides, [], {}, fmt, mkResolveImage).then(n => { if (n && MK.ed && MK.ui.rail === 'layouts') edRefreshDrawer(); }).catch(() => {});
}
function edDrawLayouts(locked) {
  const fmt = MK.ed.format, f = edF(), cats = ['Todos', ...mkCats, 'Meus layouts'], cat = MK.ui.cat || 'Todos', q = (MK.ui.q || '').trim().toLowerCase();
  const list = [MK_BLANK, ...mkAllLayouts()].filter(l => l.formats.includes(fmt) && (cat === 'Todos' || (cat === 'Meus layouts' ? l.user : l.cat === cat)) && (!q || `${l.name} ${l.hint || ''} ${l.cat || ''}`.toLowerCase().includes(q)));
  const cur = edSl().l;
  return `<div class="st-actions"><button class="btn sm" data-ed="layout-save" ${locked ? 'disabled' : ''}>${icon('archive')} Salvar esta lâmina como layout</button></div>
    <input class="input st-search" type="search" placeholder="Buscar layout (ex.: resultado, peneira)" value="${esc(MK.ui.q || '')}" data-edf="layout-q" aria-label="Buscar layout">
    <div class="st-chips">${cats.map(c => `<button class="${c === cat ? 'on' : ''}" data-ed="layout-cat" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <div class="st-lgrid">${list.map(l => `<div class="st-lcard ${cur === l.id ? 'on' : ''}"><button data-ed="layout-apply" data-id="${esc(l.id)}" ${locked ? 'disabled' : ''} title="${esc(l.hint || '')}">${mkScaled(mkSlideHtml(mkNewSlide(l), fmt, edCtx()), f, 108, 136)}<b>${esc(l.name)}</b></button>${l.user ? `<button class="st-ldel" data-ed="layout-del" data-id="${esc(l.dbId)}" title="Excluir este layout" aria-label="Excluir layout">${icon('trash')}</button>` : ''}</div>`).join('') || '<p class="hint">Nenhum layout encontrado.</p>'}</div>
    <p class="hint">Trocar o layout mantém os textos e as fotos nos campos de mesmo nome. Ctrl+Z desfaz.</p>`;
}
function edDrawText(locked) {
  const dis = locked ? 'disabled' : '';
  return `<p class="hint st-lead">Clique para adicionar na lâmina. Depois arraste, redimensione e dê dois cliques para escrever.</p>
    <div class="st-tpresets">${MK_TEXT_PRESETS.map(p => { const fo = MK_FONTS[p.el.st.font] || MK_FONTS.g400;
      return `<button class="st-tp ${p.k}" data-ed="add-text" data-k="${p.k}" ${dis}><span style="font-family:${fo.family};font-weight:${fo.weight};${p.el.st.italic ? 'font-style:italic;' : ''}${p.el.st.caps ? 'text-transform:uppercase;' : ''}${p.el.st.outline ? '-webkit-text-stroke:1px #fff;color:transparent;' : ''}${p.el.st.bgc ? `background:${mkCol(p.el.st.bgc)};padding:3px 8px;` : ''}">${esc(p.def)}</span><small>${esc(p.label)}</small></button>`; }).join('')}</div>
    <div class="st-dsec">Textos desta lâmina</div><div class="st-tlist">${edSl().e.filter(e => e.type === 'text').map(e => `<button class="${MK.sel === e.id ? 'on' : ''}" data-ed="select" data-id="${esc(e.id)}"><b>${esc(edElName(e))}</b><span>${esc(String(edSl().v[e.slot] ?? e.def ?? '').slice(0, 60)) || '—'}</span></button>`).join('') || '<p class="hint">Nenhum texto.</p>'}</div>`;
}
function edGallery() {
  const set = new Set(MK.ed.gallery || []);
  const add = (v, els) => { for (const e of els) if (e.type === 'image' && v[e.slot]) set.add(v[e.slot]); };
  for (const s of MK.ed.slides) add(s.v || {}, s.e || []); add(MK.ed.sv || {}, MK.ed.strip || []);
  return [...set];
}
function edThumbSrc(ref) {
  if (ref.startsWith('data:')) return ref;
  const path = ref.replace(/^storage:/, '');
  if (MK_RAW.has(path)) return MK_RAW.get(path);
  mkResolveImage(ref).then(() => { if (MK.ui.rail === 'photos') edLater(edRefreshDrawer, 150); }).catch(() => {});
  return '';
}
function edDrawPhotos(locked) {
  const dis = locked ? 'disabled' : '', refs = edGallery();
  return `<label class="st-drop ${locked ? 'locked' : ''}" for="stFiles" id="stDrop">${edIc('image')}<b>Enviar fotos</b><span>Clique ou arraste do computador. Também dá para soltar a foto direto em cima da arte.</span></label><input type="file" id="stFiles" accept="image/*" multiple hidden data-edf="files" ${dis}>
    <div class="st-dsec">Fotos desta peça</div>
    ${refs.length ? `<div class="st-gal">${refs.map(r => { const src = edThumbSrc(r); return `<button draggable="true" data-ed="apply-ref" data-ref="${esc(r)}" title="Clique para usar na foto selecionada ou arraste para a arte" ${dis}>${src ? `<img src="${src}" alt="">` : '<span class="hint">…</span>'}</button>`; }).join('')}</div>` : '<p class="hint">As fotos enviadas ficam aqui para reaproveitar nas outras lâminas.</p>'}
    <p class="hint">Foto de atleta menor de idade só com autorização do responsável. Imagens geradas por IA ficam na aba IA.</p>`;
}
function edDrawBrand(locked) {
  const dis = locked ? 'disabled' : '', found = edSel(), a = MK_CACHE.assets || {};
  const tile = (k, label, dark) => `<button class="st-logo ${dark ? 'dark' : ''}" data-ed="add-logo" data-v="${k}" ${dis} title="${esc(label)}">${k === 'auto' ? `<span class="st-auto"><img src="${a['assinatura-azul'] || ''}" alt=""><img src="${a['assinatura-branca'] || ''}" alt=""></span>` : `<img src="${a[k] || ''}" alt="">`}<small>${esc(label)}</small></button>`;
  return `<p class="hint st-lead">${found?.el.type === 'logo' ? 'Clique para trocar a versão da logo selecionada.' : 'Clique para adicionar a logo na lâmina.'}</p>
    <div class="st-logos">${tile('auto', 'Automática (azul ou branca)', false)}${Object.entries(MK_LOGOS).map(([k, l]) => tile(k, l.label, edLogoDark(k))).join('')}</div>
    <div class="st-dsec">Cores da marca</div><p class="hint">Aplica na seleção (texto, forma, pincel) ou no fundo da lâmina.</p>
    <div class="st-pal">${['navy', 'red', 'white', 'gray', 'light'].map(c => `<button data-ed="brand-color" data-v="${c}" ${dis}><i style="background:${MK_COLORS[c]}"></i><b>${MK_COLOR_NAMES[c]}</b><small>${MK_COLORS[c]}</small></button>`).join('')}</div>
    <div class="st-dsec">Fontes</div><div class="st-fontlist">${Object.entries(MK_FONTS).map(([k, ft]) => `<button data-ed="brand-font" data-v="${k}" ${dis} style="font-family:${ft.family};font-weight:${ft.weight}">${esc(ft.label)}</button>`).join('')}</div>`;
}
let edBrushPrev = {};
function edBrushThumb(k) {
  if (edBrushPrev[k]) return edBrushPrev[k];
  if (!MK_CACHE.tips) return '';
  try { const b = MK_BRUSHES[k], w = 240, h = Math.round(w / (b.ar || 2)); edBrushPrev[k] = mkBrushCanvas({ brush: k, color: 'red', seed: 7, tex: b.tex ?? 0.6 }, w, h).toDataURL('image/png'); } catch { edBrushPrev[k] = ''; }
  return edBrushPrev[k];
}
function edDrawElements(locked) {
  const dis = locked ? 'disabled' : '', carousel = MK.ed.format === 'carousel';
  const shapes = [['rect', 'Retângulo', '<i class="s-rect"></i>'], ['circle', 'Círculo', '<i class="s-circle"></i>'], ['line', 'Linha', '<i class="s-line"></i>'], ['band', 'Faixa', '<i class="s-band"></i>'], ['fade', 'Degradê sobre foto', '<i class="s-fade"></i>'], ['frame', 'Moldura', '<i class="s-frame"></i>'], ['photo', 'Espaço para foto', '<i class="s-photo"></i>'], ['round', 'Foto redonda', '<i class="s-round"></i>']];
  return `<div class="st-dsec first">Formas</div><div class="st-shapes">${shapes.map(([k, l, ic]) => `<button data-ed="add-shape" data-k="${k}" ${dis}>${ic}<small>${l}</small></button>`).join('')}</div>
    <div class="st-dsec">Pinceladas da Apollo</div><p class="hint">Texturas extraídas dos pincéis oficiais. Use “Variar pincelada” para outro traço.</p>
    <div class="st-brushes">${Object.entries(MK_BRUSHES).map(([k, b]) => `<button data-ed="add-brush" data-k="${k}" ${dis}><span>${edBrushThumb(k) ? `<img src="${edBrushThumb(k)}" alt="">` : ''}</span><small>${esc(b.label)}</small></button>`).join('')}</div>
    <div class="st-dsec">Fundo contínuo do carrossel</div>${carousel ? `<p class="hint">Atravessa todas as lâminas e dá continuidade ao arrastar.</p><div class="st-chiprow">${Object.entries(MK_STRIP_PRESETS).map(([k, p]) => `<button class="btn sm" data-ed="strip-add" data-k="${k}" ${dis}>${icon('plus')} ${esc(p.label)}</button>`).join('')}</div>` : `<p class="hint">Disponível no formato carrossel. <button class="btn sm ghost" data-ed="to-carousel" ${dis}>Transformar em carrossel</button></p>`}`;
}
function edDrawPaint(locked) {
  const dis = locked ? 'disabled' : '', on = MK.tool === 'paint';
  return `<button class="btn ${on ? 'primary' : ''} st-big" data-ed="paint-toggle" ${dis}>${edIc('brush')} ${on ? 'Parar de desenhar (Esc)' : 'Desenhar na arte'}</button>
    <div class="st-dsec">Pincel</div><div class="st-brushes">${['seco', 'riscado', 'hachura'].map(k => `<button class="${MK.paint.brush === k ? 'on' : ''}" data-ed="paint-brush" data-v="${k}"><span>${edBrushThumb(k) ? `<img src="${edBrushThumb(k)}" alt="">` : ''}</span><small>${esc(MK_BRUSHES[k].label)}</small></button>`).join('')}</div>
    <div class="st-dsec">Cor</div>${edSw('paint.color', MK.paint.color, 'paint', { palette: MK_PALETTE })}
    ${edRange('Tamanho', 'size', 'paint', MK.paint.size, 2, 26, 0.5, 'paintprop')}${edRange('Textura', 'tex', 'paint', MK.paint.tex, 0, 1, 0.05, 'paintprop')}
    <div class="st-note">${edIc('brush')}<span><b>Mesa digitalizadora:</b> a pressão da caneta controla a opacidade e a espessura de cada toque; pressão leve revela as cerdas. Com mouse, a pressão é simulada.</span></div>
    <p class="hint">No carrossel, um traço que cruza lâminas vira fundo contínuo.</p>`;
}
function edDrawLayers(locked) {
  const sl = edSl(), dis = locked ? 'disabled' : '';
  const row = (el, strip) => `<div class="st-layer ${MK.sel === el.id ? 'on' : ''} ${el.hid ? 'off' : ''}" draggable="${!locked}" data-layer="${esc(el.id)}" data-strip="${strip ? 1 : 0}">
    <span class="st-grip" aria-hidden="true">${edIc('drag')}</span><button class="st-lname" data-ed="select" data-id="${esc(el.id)}">${edIc(ED_TYPE[el.type]?.[0] || 'file')}<span>${esc(edElName(el))}</span></button>
    <button class="st-ib sm" data-ed="ellock" data-id="${esc(el.id)}" title="${el.lock ? 'Destravar' : 'Travar'}" ${dis}>${edIc(el.lock ? 'lock' : 'unlock')}</button>
    <button class="st-ib sm" data-ed="eltoggle" data-id="${esc(el.id)}" title="${el.hid ? 'Mostrar' : 'Ocultar'}" ${dis}>${icon(el.hid ? 'x' : 'eye')}</button></div>`;
  return `<p class="hint st-lead">De cima para baixo: o primeiro fica na frente. Arraste para reordenar.</p><div class="st-layers" data-list="slide">${[...sl.e].reverse().map(e => row(e, false)).join('')}</div>
    ${MK.ed.strip.length ? `<div class="st-dsec">Fundo contínuo (todas as lâminas)</div><div class="st-layers" data-list="strip">${[...MK.ed.strip].reverse().map(e => row(e, true)).join('')}</div>` : ''}`;
}

/* ═══════════ Propriedades (direita) ═══════════ */
const edSw = (path, cur, id, opts = {}) => `<div class="st-sw">${(opts.palette || ['navy', 'red', 'white', 'gray', 'light']).map(c => `<button type="button" class="${cur === c ? 'on' : ''}" style="background:${MK_COLORS[c]}" title="${MK_COLOR_NAMES[c]}" aria-label="${MK_COLOR_NAMES[c]}" data-ed="${id === 'paint' ? 'paintcolor' : 'prop'}" data-id="${esc(id)}" data-p="${path}" data-v="${c}" ${opts.dis || ''}></button>`).join('')}${opts.none ? `<button type="button" class="none ${cur ? '' : 'on'}" title="${opts.noneLabel || 'Nenhuma'}" aria-label="${opts.noneLabel || 'Nenhuma'}" data-ed="prop" data-id="${esc(id)}" data-p="${path}" data-v="" ${opts.dis || ''}></button>` : ''}</div>`;
const edRange = (label, path, id, val, min, max, step, kind = 'prop', dis = '') => `<label class="st-rng"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-edf="${kind}" data-id="${esc(id)}" data-p="${path}" data-num="1" ${dis}><input type="number" min="${min}" max="${max}" step="${step}" value="${val}" data-edf="${kind}" data-id="${esc(id)}" data-p="${path}" data-num="1" aria-label="${label}" ${dis}></label>`;
const edTog = (label, path, id, on, ic, dis = '', val) => `<button type="button" class="st-tog ${on ? 'on' : ''}" data-ed="toggle" data-id="${esc(id)}" data-p="${path}" ${val ? `data-v="${val}"` : ''} aria-pressed="${!!on}" title="${label}" ${dis}>${ic ? edIc(ic) : ''}<span>${label}</span></button>`;
const edSec = (title, body, open = true) => `<details class="st-sec" ${open ? 'open' : ''}><summary>${title}</summary><div class="st-secb">${body}</div></details>`;

function edInspector() {
  const found = edSel(), locked = mkLocked();
  return found ? edInspEl(found.el, found.strip, locked) : edInspSlide(locked);
}
function edInspSlide(locked) {
  const ed = MK.ed, sl = edSl(), dis = locked ? 'disabled' : '', lay = mkLayoutById(sl.l), n = ed.slides.length, admin = mkIsAdmin();
  const issues = mkValidate(sl), samples = sl.e.filter(e => e.type === 'text' && !e.hid && e.def && sl.v[e.slot] === e.def);
  const empties = sl.e.filter(e => e.type === 'image' && !e.hid && !sl.v[e.slot]);
  return `<div class="st-ih"><div><div class="st-eyebrow">Lâmina ${MK.edSlide + 1}${n > 1 ? ` de ${n}` : ''}</div><b>${esc(lay.name)}</b></div></div>
    ${edSec('Fundo', edSw('bg', sl.bg?.c, 'slide', { dis }))}
    ${edSec('Layout', `<p class="hint" style="margin:0 0 8px">${esc(lay.hint || '')}</p><div class="st-row"><button class="btn sm" data-ed="rail" data-v="layouts">${icon('layers')} Trocar layout</button><button class="btn sm ghost" data-ed="layout-reset" ${dis}>${icon('refresh')} Restaurar</button></div><button class="btn sm ghost st-mt" data-ed="layout-save" ${dis}>${icon('archive')} Salvar como meu layout</button>`)}
    ${edSec('Checagem', `${issues.length || samples.length || empties.length ? '' : `<div class="st-ok">${icon('check')} Tudo certo nesta lâmina.</div>`}
      ${issues.map(i => `<div class="st-issue bad">${icon('alert')}<span>${esc(i)}</span></div>`).join('')}
      ${samples.length ? `<div class="st-issue">${icon('edit')}<span>${samples.length} texto(s) ainda com o exemplo do layout: ${samples.map(e => `<button class="st-link" data-ed="select" data-id="${esc(e.id)}">${esc(edElName(e))}</button>`).join(', ')}</span></div>` : ''}
      ${empties.length ? `<div class="st-issue">${edIc('image')}<span>Sem foto: ${empties.map(e => `<button class="st-link" data-ed="select" data-id="${esc(e.id)}">${esc(edElName(e))}</button>`).join(', ')}. Vazia, ela não aparece no PNG.</span></div>` : ''}`)}
    ${edSec('Peça', `<div class="field"><label for="stCamp">Campanha</label><select class="select" id="stCamp" data-edf="meta" data-k="campaignId" ${dis}><option value="">Sem campanha</option>${MK.campaigns.map(c => `<option value="${c.id}" ${c.id === ed.campaignId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      ${['rascunho', 'reprovada'].includes(ed.approval_status) ? '<p class="hint">Ao enviar para aprovação, a peça é exportada em PNG e fica bloqueada até a administração decidir.</p>' : ''}
      ${ed.id ? `<button class="btn sm danger" data-mk="piece-del" ${['em_aprovacao', 'aprovada'].includes(ed.approval_status) && !admin ? 'disabled' : ''}>${icon('trash')} Excluir peça</button>` : ''}`, false)}
    ${edSec('Atalhos', `<dl class="st-keys"><dt>Dois cliques / Enter</dt><dd>escrever no texto</dd><dt>Ctrl+Z · Ctrl+Shift+Z</dt><dd>desfazer · refazer</dd><dt>Ctrl+D · Ctrl+C · Ctrl+V</dt><dd>duplicar · copiar · colar</dd><dt>Setas (Shift)</dt><dd>mover 0,5 (2)</dd><dt>[ · ]</dt><dd>trás · frente</dd><dt>Delete · Esc</dt><dd>excluir · soltar seleção</dd><dt>Ctrl + roda</dt><dd>zoom</dd><dt>Ctrl+S</dt><dd>salvar</dd></dl>`, false)}`;
}
function edInspEl(el, strip, locked) {
  const f = edF(), dis = locked ? 'disabled' : '', id = el.id, r = mkRectU(el, f, 0, edAr(el));
  let body = '';
  if (el.type === 'text') body = edInspText(el, strip, dis);
  else if (el.type === 'image') body = edInspImage(el, strip, dis);
  else if (el.type === 'logo') body = edSec('Versão da logo', `<div class="st-logos sm">${['auto', ...Object.keys(MK_LOGOS)].map(k => { const a = MK_CACHE.assets || {}, cur = (el.variant || 'auto') === k; return `<button class="st-logo ${edLogoDark(k) ? 'dark' : ''} ${cur ? 'on' : ''}" data-ed="prop" data-id="${esc(id)}" data-p="variant" data-v="${k}" ${dis} title="${esc(k === 'auto' ? 'Automática' : MK_LOGOS[k].label)}">${k === 'auto' ? `<span class="st-auto"><img src="${a['assinatura-azul'] || ''}" alt=""><img src="${a['assinatura-branca'] || ''}" alt=""></span>` : `<img src="${a[k] || ''}" alt="">`}<small>${esc(k === 'auto' ? 'Automática' : MK_LOGOS[k].label)}</small></button>`; }).join('')}</div><p class="hint">Automática: assinatura branca em fundo escuro, azul em fundo claro.</p>`)
    + edSec('Aparência', edRange('Opacidade', 'op', id, el.op ?? 1, 0.1, 1, 0.05, 'prop', dis) + edRange('Rotação', 'rot', id, el.rot || 0, -180, 180, 1, 'prop', dis));
  else if (el.type === 'shape') body = edSec('Preenchimento', `${edSw('fill', el.fill, id, { none: true, dis })}<div class="st-lbl">Degradê (some até ficar transparente)</div><div class="st-seg">${[['', 'Nenhum'], ['up', '↑'], ['down', '↓'], ['left', '←'], ['right', '→']].map(([v, l]) => `<button class="${(el.fade || '') === v ? 'on' : ''}" data-ed="prop" data-id="${esc(id)}" data-p="fade" data-v="${v}" ${dis} title="${v ? 'Some para ' + l : 'Sem degradê'}">${l}</button>`).join('')}</div>${el.fade ? edRange('Parte sólida', 'solid', id, el.solid ?? 15, 0, 90, 1, 'prop', dis) : ''}`)
    + edSec('Contorno e forma', `<div class="st-seg">${[['rect', 'Retângulo'], ['ellipse', 'Elipse']].map(([v, l]) => `<button class="${(el.shape || 'rect') === v ? 'on' : ''}" data-ed="prop" data-id="${esc(id)}" data-p="shape" data-v="${v}" ${dis}>${l}</button>`).join('')}</div><div class="st-lbl">Contorno</div>${edSw('stroke', el.stroke, id, { none: true, dis })}${el.stroke ? edRange('Espessura', 'sw', id, el.sw || 0.3, 0.1, 3, 0.05, 'prop', dis) : ''}${el.shape !== 'ellipse' ? edRange('Cantos', 'r', id, el.r || 0, 0, 20, 0.5, 'prop', dis) : ''}`)
    + edSec('Aparência', edRange('Opacidade', 'op', id, el.op ?? 1, 0.05, 1, 0.05, 'prop', dis) + edRange('Rotação', 'rot', id, el.rot || 0, -180, 180, 1, 'prop', dis));
  else if (el.type === 'brush' || el.type === 'paint') body = edSec('Pincel', `${el.type === 'brush' ? `<div class="st-brushes sm">${Object.entries(MK_BRUSHES).map(([k, b]) => `<button class="${el.brush === k ? 'on' : ''}" data-ed="prop" data-id="${esc(id)}" data-p="brush" data-v="${k}" ${dis}><span>${edBrushThumb(k) ? `<img src="${edBrushThumb(k)}" alt="">` : ''}</span><small>${esc(b.label)}</small></button>`).join('')}</div>` : ''}
      <div class="st-lbl">Cor</div>${edSw('color', el.color, id, { palette: MK_PALETTE, dis })}${edRange('Textura (pressão)', 'tex', id, el.tex ?? 0.55, 0, 1, 0.05, 'prop', dis)}${el.type === 'paint' ? edRange('Espessura', 'size', id, el.size, 2, 26, 0.5, 'prop', dis) : ''}
      ${el.type === 'brush' ? `<div class="st-row"><button class="btn sm" data-ed="reseed" data-id="${esc(id)}" ${dis}>${icon('refresh')} Variar pincelada</button>${edTog('Espelhar', 'flip', id, el.flip, '', dis)}</div>` : ''}`)
    + edSec('Aparência', edRange('Opacidade', 'op', id, el.op ?? 1, 0.05, 1, 0.05, 'prop', dis) + edRange('Rotação', 'rot', id, el.rot || 0, -180, 180, 1, 'prop', dis));
  const num = (label, key, val) => `<label class="st-num"><span>${label}</span><input type="number" step="0.5" value="${r1(val)}" data-edf="rect" data-id="${esc(id)}" data-k="${key}" ${dis}></label>`;
  const hasH = el.h != null || el.hp != null || el.full;
  const pos = `<div class="st-nums">${num('X', 'x', r.x)}${num('Y', 'y', r.y)}${num('Largura', 'w', r.w)}${hasH ? num('Altura', 'h', r.h) : ''}</div>
    <div class="st-lbl">Alinhar na lâmina</div><div class="st-seg icons">${[['l', 'al', 'À esquerda'], ['c', 'ac', 'Centro'], ['r', 'ar', 'À direita'], ['t', 'at', 'Topo'], ['m', 'am', 'Meio'], ['b', 'ab', 'Base']].map(([v, ic, t]) => `<button data-ed="align" data-id="${esc(id)}" data-v="${v}" title="${t}" aria-label="${t}" ${dis || (el.lock ? 'disabled' : '')}>${edIc(ic)}</button>`).join('')}</div>`;
  return `<div class="st-ih"><div><div class="st-eyebrow">${edIc(ED_TYPE[el.type]?.[0] || 'file')} ${esc(ED_TYPE[el.type]?.[1] || 'Elemento')}${strip ? ' · fundo contínuo' : ''}</div><input class="st-rename" value="${esc(edElName(el))}" data-edf="rename" data-id="${esc(id)}" aria-label="Nome do elemento" ${dis}></div><button class="st-ib" data-ed="deselect" title="Soltar seleção (Esc)" aria-label="Soltar seleção">${icon('x')}</button></div>
    <div class="st-quick"><button data-ed="dup" data-id="${esc(id)}" ${dis}>${icon('copy')}<span>Duplicar</span></button><button data-ed="front" data-id="${esc(id)}" ${dis}>${edIc('front')}<span>Frente</span></button><button data-ed="back" data-id="${esc(id)}" ${dis}>${edIc('back')}<span>Trás</span></button><button data-ed="ellock" data-id="${esc(id)}" ${dis}>${edIc(el.lock ? 'lock' : 'unlock')}<span>${el.lock ? 'Travado' : 'Travar'}</span></button><button class="danger" data-ed="del" data-id="${esc(id)}" ${dis}>${icon('trash')}<span>Excluir</span></button></div>
    ${strip ? edSec('Fundo contínuo', `<p class="hint" style="margin:0 0 6px">Este elemento atravessa todas as lâminas do carrossel.</p>${edTog('Na frente dos elementos das lâminas', 'front', id, el.front, '', dis)}`) : ''}
    ${body}${edSec('Posição e tamanho', pos, false)}`;
}
function edInspText(el, strip, dis) {
  const id = el.id, s = el.st || {}, vals = edSlotVals(strip), val = vals[el.slot] ?? el.def ?? '', over = el.max && String(val).length > el.max;
  const rows = Math.min(8, Math.max(2, String(val).split('\n').length + Math.floor(String(val).length / 34)));
  return edSec('Texto', `<div class="st-lbl">Conteúdo <span class="st-count ${over ? 'mk-over' : ''}" id="stc_${esc(id)}">${String(val).length}${el.max ? ' / ' + el.max : ''}</span></div>
      <textarea class="input st-ta" id="sti_${esc(id)}" rows="${rows}" data-edf="slot" data-slot="${esc(el.slot)}" data-id="${esc(id)}" data-strip="${strip ? 1 : 0}" ${dis}>${esc(val)}</textarea>
      <p class="hint" style="margin:4px 0 0">Ou dê dois cliques no texto da arte. O tamanho se ajusta para caber em até ${el.lines || '—'} linha(s).</p>`)
    + edSec('Fonte', `<div class="st-fonts">${Object.entries(MK_FONTS).map(([k, ft]) => `<button class="${(s.font || 'g400') === k ? 'on' : ''}" data-ed="prop" data-id="${esc(id)}" data-p="st.font" data-v="${k}" style="font-family:${ft.family};font-weight:${ft.weight}" ${dis}>${esc(ft.label.replace('Gridnik ', ''))}</button>`).join('')}</div>
      ${edRange('Tamanho', 'st.fs', id, s.fs || 4, 1, 60, 0.1, 'prop', dis)}
      <div class="st-row st-tools"><span class="st-seg icons">${['left', 'center', 'right'].map(a => `<button class="${(s.align || 'left') === a ? 'on' : ''}" data-ed="prop" data-id="${esc(id)}" data-p="st.align" data-v="${a}" title="Alinhar ${{ left: 'à esquerda', center: 'ao centro', right: 'à direita' }[a]}" ${dis}>${edIc('talign_' + a[0])}</button>`).join('')}</span>
        ${edTog('Caixa alta', 'st.caps', id, s.caps, 'caps', dis)}${edTog('Itálico', 'st.italic', id, s.italic, 'italic', dis)}${edTog('Vazado', 'st.outline', id, s.outline, 'outline', dis)}</div>
      <div class="st-lbl">Cor</div>${edSw('st.color', s.color || 'white', id, { dis })}
      ${edRange('Entrelinha', 'st.lh', id, s.lh || 1.15, 0.7, 2.4, 0.02, 'prop', dis)}${edRange('Espaço entre letras', 'st.ls', id, s.ls || 0, 0, 30, 0.5, 'prop', dis)}${edRange('Linhas máximas', 'lines', id, el.lines || 3, 1, 16, 1, 'prop', dis)}`)
    + edSec('Destaque', `<div class="st-lbl">Etiqueta (fundo atrás do texto)</div>${edSw('st.bgc', s.bgc, id, { none: true, dis })}${s.bgc ? edRange('Margem interna', 'st.pad', id, s.pad || 2, 0.5, 6, 0.1, 'prop', dis) + edTog('Largura do texto', 'inl', id, el.inl, '', dis) : ''}
      ${edTog('Sombra suave (texto sobre foto)', 'st.shadow', id, s.shadow, '', dis)}${s.outline ? edRange('Espessura do contorno', 'st.sw', id, s.sw || 0.22, 0.05, 1, 0.01, 'prop', dis) : ''}
      ${edRange('Opacidade', 'st.op', id, s.op ?? 1, 0.05, 1, 0.05, 'prop', dis)}${edRange('Rotação', 'rot', id, el.rot || 0, -180, 180, 1, 'prop', dis)}`, false);
}
function edInspImage(el, strip, dis) {
  const id = el.id, vals = edSlotVals(strip), ref = vals[el.slot], t = { ...mkTreatDefault(), ...(el.treat || {}) }, src = ref ? edThumbSrc(ref) : '';
  const presets = [['Natural', '', '', false], ['Azul Apollo', 'navy', 'white', true], ['Vermelho', 'red', 'white', true], ['Azul e vermelho', 'navy', 'red', true], ['Azul e cinza', 'navy', 'gray', true], ['Cinza', 'gray', 'white', true]];
  return edSec('Foto', `<div class="st-photo">${src ? `<img src="${src}" alt="">` : `<span>${edIc('image')} Sem foto</span>`}</div>
      <div class="st-row"><label class="btn sm ${dis ? 'locked' : ''}" for="stf_${esc(id)}">${icon('upload')} ${ref ? 'Trocar foto' : 'Enviar foto'}</label><input type="file" id="stf_${esc(id)}" accept="image/*" hidden data-edf="file" data-slot="${esc(el.slot)}" data-strip="${strip ? 1 : 0}" ${dis}>
        ${ref ? `<button class="btn sm ghost" data-ed="img-clear" data-slot="${esc(el.slot)}" data-strip="${strip ? 1 : 0}" ${dis}>${icon('x')} Remover</button>` : ''}</div>
      <p class="hint" style="margin:6px 0 0">Também dá para arrastar uma foto do computador direto em cima dela. Atleta menor de idade só com autorização do responsável.</p>`)
    + edSec('Enquadramento', `<div class="st-seg">${[['cover', 'Preencher'], ['contain', 'Sem cortar']].map(([v, l]) => `<button class="${t.fit === v ? 'on' : ''}" data-ed="prop" data-id="${esc(id)}" data-p="treat.fit" data-v="${v}" ${dis}>${l}</button>`).join('')}</div>
      ${edTog('Ocupar a lâmina inteira', 'full', id, el.full, '', dis)}${edRange('Zoom', 'treat.z', id, t.z, 1, 3, 0.05, 'prop', dis)}${edRange('Foco ←→', 'treat.fx', id, t.fx, 0, 100, 1, 'prop', dis)}${edRange('Foco ↑↓', 'treat.fy', id, t.fy, 0, 100, 1, 'prop', dis)}
      ${edTog('Redonda', 'round', id, el.round, '', dis)}${el.round ? '' : edRange('Cantos', 'r', id, el.r || 0, 0, 20, 0.5, 'prop', dis)}`)
    + edSec('Tratamento (cores da marca)', `<div class="st-duo">${presets.map(([n, a, b, duo]) => `<button class="${duo ? (t.duo && t.a === a && t.b === b ? 'on' : '') : (!t.duo ? 'on' : '')}" data-ed="${duo ? 'treat-preset' : 'treat-off'}" data-id="${esc(id)}" data-a="${a}" data-b="${b}" ${dis}><i>${duo ? `<em style="background:${MK_COLORS[a]}"></em><em style="background:${MK_COLORS[b]}"></em>` : '<em class="nat"></em>'}</i><small>${n}</small></button>`).join('')}</div>
      ${t.duo ? `<div class="st-lbl">Sombras</div>${edSw('treat.a', t.a, id, { palette: MK_PALETTE, dis })}<div class="st-lbl">Luzes</div>${edSw('treat.b', t.b, id, { palette: MK_PALETTE, dis })}${edRange('Intensidade', 'treat.amt', id, t.amt, 0, 1, 0.05, 'prop', dis)}` : ''}
      ${edRange('Contraste', 'treat.con', id, t.con, 0.5, 1.8, 0.05, 'prop', dis)}${edRange('Brilho', 'treat.bri', id, t.bri, -0.3, 0.3, 0.02, 'prop', dis)}
      <div class="st-lbl">Escurecer com cor</div>${edSw('treat.scrimC', t.scrimC, id, { palette: MK_PALETTE, dis })}${edRange('Quanto', 'treat.scrim', id, t.scrim, 0, 0.85, 0.05, 'prop', dis)}`)
    + edSec('Aparência', edRange('Opacidade', 'op', id, el.op ?? 1, 0.05, 1, 0.05, 'prop', dis) + edRange('Rotação', 'rot', id, el.rot || 0, -180, 180, 1, 'prop', dis), false);
}

/* ═══════════ Lâminas (rodapé) ═══════════ */
function edPagesHtml() {
  const ed = MK.ed, f = edF(), n = ed.slides.length, carousel = ed.format === 'carousel', locked = mkLocked();
  if (!MK_CACHE.assets) return '';
  const th = ed.slides.map((s, i) => `<div class="st-page ${i === MK.edSlide ? 'on' : ''}" draggable="${carousel && !locked}" data-page="${i}"><button class="st-pbtn" data-ed="slide" data-i="${i}" aria-label="Lâmina ${i + 1}">${mkScaled(mkSlideHtml(s, ed.format, edCtx(), i, n, ed.strip, ed.sv), f, 96, 78)}</button><span class="st-pn">${i + 1}</span>`
    + (carousel && !locked ? `<span class="st-pact"><button data-ed="slide-dup" data-i="${i}" title="Duplicar lâmina" aria-label="Duplicar lâmina ${i + 1}">${icon('copy')}</button>${n > 1 ? `<button data-ed="slide-del" data-i="${i}" title="Excluir lâmina" aria-label="Excluir lâmina ${i + 1}">${icon('trash')}</button>` : ''}</span>` : '') + '</div>').join('');
  return `<div class="st-pages-in">${th}${carousel ? (!locked && n < 10 ? `<button class="st-padd" data-ed="slide-add" title="Nova lâmina com o mesmo layout">${icon('plus')}<span>Lâmina</span></button>` : '') : `<div class="st-pnote">Este formato tem uma lâmina. ${!locked ? '<button class="btn sm ghost" data-ed="to-carousel">Transformar em carrossel</button>' : ''}</div>`}</div>`;
}

/* ═══════════ Ações ═══════════ */
function edPlace(el) { const sl = edSl(); sl.e.push(el); MK.sel = el.id; mkTouch(); edRefreshAll(true); edRefreshInsp(); if (MK.ui.rail === 'layers' || MK.ui.rail === 'text') edRefreshDrawer(); }
function edCenter(el, w, h) { const f = edF(), Hu = mkHu(f); el.x = r1(50 - w / 2); el.t = r1(Math.max(4, Hu / 2 - h / 2)); return el; }
function edAddText(k) {
  const p = MK_TEXT_PRESETS.find(x => x.k === k) || MK_TEXT_PRESETS[0], id = mkUid(), slot = 't_' + id, light = !edDark();
  const st = mkClone(p.el.st); if (light && st.color === 'white' && !st.bgc) st.color = 'navy';
  const el = edCenter({ id, type: 'text', slot, label: p.label, def: '', max: p.el.max, lines: p.el.lines, inl: p.el.inl || undefined, w: p.el.w, st }, p.el.w, st.fs * 1.2);
  edSl().v[slot] = p.def; edPlace(el);
}
function edAddShape(k) {
  const id = mkUid(), light = !edDark(), f = edF(), Hu = mkHu(f);
  const base = { id, type: 'shape', shape: 'rect' };
  const el = k === 'rect' ? edCenter({ ...base, fill: 'red', w: 40, h: 14 }, 40, 14)
    : k === 'circle' ? edCenter({ ...base, shape: 'ellipse', fill: 'red', w: 24, h: 24 }, 24, 24)
    : k === 'line' ? edCenter({ ...base, fill: light ? 'navy' : 'white', w: 60, h: 0.4, label: 'Linha' }, 60, 0.4)
    : k === 'band' ? { ...base, fill: 'red', x: 0, w: 100, h: 14, t: r1(Hu / 2 - 7), label: 'Faixa' }
    : k === 'fade' ? { ...base, fill: 'navy', fade: 'up', solid: 18, x: 0, w: 100, bp: 0, hp: 60, label: 'Degradê' }
    : k === 'frame' ? edCenter({ ...base, stroke: light ? 'navy' : 'white', sw: 0.5, w: 70, h: 60, label: 'Moldura' }, 70, 60)
    : null;
  if (el) return edPlace(el);
  const slot = 'i_' + id, round = k === 'round';
  edPlace(edCenter({ id, type: 'image', slot, label: round ? 'Foto redonda' : 'Foto', w: round ? 44 : 60, h: round ? 44 : 50, round: round || undefined, treat: mkTreatDefault() }, round ? 44 : 60, round ? 44 : 50));
}
function edAddBrush(k) {
  const b = MK_BRUSHES[k], id = mkUid(), w = b.mode === 'stroke' ? 80 : 60, h = Math.round(w / b.ar * 10) / 10;
  edPlace(edCenter({ id, type: 'brush', brush: k, color: 'red', seed: Math.floor(Math.random() * 999) + 1, tex: b.tex ?? 0.6, w, h, rot: b.mode === 'stroke' ? -3 : undefined }, w, h));
}
function edAddLogo(v) {
  const found = edSel();
  if (found?.el.type === 'logo') { found.el.variant = v; mkTouch(); edRefreshAll(false); edRefreshInsp(); return; }
  const ar = MK_LOGOS[v === 'auto' ? 'assinatura-azul' : v].ar, w = ar > 1.2 ? 24 : 18;
  edPlace(edCenter({ id: mkUid(), type: 'logo', variant: v, w }, w, w / ar));
}
function edDelete(id) {
  const found = id ? edFind(id) : edSel(); if (!found || mkLocked()) return;
  const list = found.strip ? MK.ed.strip : edSl().e, i = list.indexOf(found.el); if (i >= 0) list.splice(i, 1);
  MK.sel = ''; mkTouch(); edRefreshAll(false); edRefreshInsp(); edRefreshDrawer();
}
function edDup(id) {
  const f = edFind(id); if (!f) return;
  const c = mkClone(f.el); c.id = mkUid(); delete c.lock;
  if (c.slot) { const vals = edSlotVals(f.strip), ns = c.slot.replace(/_[a-z0-9]{3,}$/, '') + '_' + c.id.slice(-4); vals[ns] = vals[c.slot]; c.slot = ns; }
  c.full = false; const r = mkRectU(c, edF(), 0, edAr(c)); r.x += 3; r.y += 3; mkSetRectU(c, edF(), r);
  (f.strip ? MK.ed.strip : edSl().e).push(c); MK.sel = c.id; mkTouch(); edRefreshAll(true); edRefreshInsp(); edRefreshDrawer();
}
function edPaste() {
  const { el, val } = MK.clip, c = mkClone(el); c.id = mkUid(); delete c.lock;
  if (c.slot) { c.slot = (c.type === 'image' ? 'i_' : 't_') + c.id; if (val !== undefined) edSl().v[c.slot] = val; }
  edPlace(c);
}
function edOrder(id, dir) {
  const f = edFind(id); if (!f) return;
  const list = f.strip ? MK.ed.strip : edSl().e, i = list.indexOf(f.el), j = Math.min(list.length - 1, Math.max(0, i + dir)); if (i === j) return;
  list.splice(i, 1); list.splice(j, 0, f.el); mkTouch(); edRefreshAll(false); edOverlay(); if (MK.ui.rail === 'layers') edRefreshDrawer();
}
function edAlign(id, v) {
  const found = edFind(id); if (!found) return;
  const f = edF(), Hu = mkHu(f), el = found.el, node = edNodes(id, false)[0]?.n, k = MK.scale, u1 = edU(f);
  const r = mkRectU(el, f, node ? node.getBoundingClientRect().height / k / u1 : 0, edAr(el)); el.full = false;
  if (v === 'l') r.x = 6; if (v === 'c') r.x = 50 - r.w / 2; if (v === 'r') r.x = 94 - r.w; if (v === 't') r.y = 6; if (v === 'm') r.y = Hu / 2 - r.h / 2; if (v === 'b') r.y = Hu - 6 - r.h;
  mkSetRectU(el, f, r); mkTouch(); edRefreshAll(false); edRefreshInsp();
}
function edProp(id, path, value) {
  const found = id === 'slide' ? { el: edSl() } : edFind(id); if (!found) return;
  const el = found.el;
  if (path === 'bg') edSetPath(el, 'bg.c', value); else edSetPath(el, path, value);
  if (path.startsWith('treat.') && el.type === 'image') el.treat = { ...mkTreatDefault(), ...el.treat };
  if (path === 'st.bgc' && value && !el.st.pad) el.st.pad = 2;
  if (path === 'full' && !value) { el.x = el.x ?? 0; }
  mkTouch();
}
// Cor da marca: vai para a seleção ou para o fundo da lâmina
function edBrandColor(c) {
  const found = edSel();
  if (!found) edProp('slide', 'bg', c);
  else { const el = found.el, path = el.type === 'text' ? 'st.color' : el.type === 'shape' ? 'fill' : el.type === 'brush' || el.type === 'paint' ? 'color' : el.type === 'image' ? 'treat.scrimC' : null; if (!path) return toast('A logo usa as versões oficiais: escolha a versão em Marca.', true); edProp(el.id, path, c); }
  edRefreshAll(true); edRefreshInsp();
}
function edApplyLayout(id) {
  if (mkLocked()) return;
  MK.ed.slides[MK.edSlide] = mkApplyLayout(edSl(), mkLayoutById(id)); MK.sel = '';
  mkTouch(); edRefreshAll(true); edRefreshInsp(); edRefreshDrawer(); toast('Layout aplicado. Ctrl+Z desfaz.');
}
function edApplyRef(ref, targetId) {
  let found = targetId ? edFind(targetId) : edSel();
  if (!found || found.el.type !== 'image') { const empty = edSl().e.find(e => e.type === 'image' && !e.hid && !edSl().v[e.slot]); found = empty ? { el: empty, strip: false } : null; }
  if (!found) { const id = mkUid(), slot = 'i_' + id, el = edCenter({ id, type: 'image', slot, label: 'Foto', w: 60, h: 50, treat: mkTreatDefault() }, 60, 50); edSl().v[slot] = ref; return edPlace(el); }
  edSlotVals(found.strip)[found.el.slot] = ref; MK.sel = found.el.id; mkTouch(); edRefreshAll(true); edRefreshInsp();
}
async function edUploadFiles(files, targetId) {
  const imgs = [...files].filter(f => /^image\//.test(f.type)); if (!imgs.length) return toast('Envie arquivos de imagem.', true);
  MK.ed.gallery = MK.ed.gallery || []; let first = '';
  for (const file of imgs) {
    try {
      const blob = await mkPrepareUpload(file), path = `uploads/${crypto.randomUUID()}.jpg`;
      await mkUploadBlob(path, blob, 'image/jpeg'); MK_RAW.set(path, await mkBlobToDataUrl(blob));
      const ref = 'storage:' + path; MK.ed.gallery.push(ref); if (!first) first = ref;
    } catch (e) { toast('Não foi possível enviar a foto: ' + mkErr(e), true); }
  }
  if (first) edApplyRef(first, targetId);
  if (MK.ui.rail === 'photos') edRefreshDrawer();
}
async function edSlideOp(a, i) {
  const ed = MK.ed; i = Number.isFinite(i) ? i : MK.edSlide;
  if (a === 'slide-add') { const lay = mkLayoutById(edSl().l), s = mkNewSlide(lay); s.bg = mkClone(edSl().bg); ed.slides.splice(MK.edSlide + 1, 0, s); MK.edSlide++; }
  if (a === 'slide-dup') { ed.slides.splice(i + 1, 0, mkClone(ed.slides[i])); MK.edSlide = i + 1; }
  if (a === 'slide-del') { if (ed.slides.length < 2) return; if (!await confirmBox({ title: `Excluir a lâmina ${i + 1}?`, text: 'Ctrl+Z traz de volta.', ok: 'Excluir', danger: true })) return; ed.slides.splice(i, 1); MK.edSlide = Math.max(0, Math.min(MK.edSlide, ed.slides.length - 1)); }
  MK.sel = ''; MK.ui.scrollTo = MK.edSlide; mkTouch(); edRefreshAll(true); edRefreshInsp(); edRefreshPages(true);
}

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-ed]'); if (!el || !MK.ed) return;
  const a = el.dataset.ed, id = el.dataset.id, locked = mkLocked();
  if (locked && !['rail', 'slide', 'select', 'deselect', 'layout-cat', 'zoom-in', 'zoom-out', 'zoom-fit'].includes(a)) return;
  switch (a) {
    case 'rail': MK.ui.rail = el.dataset.v; if (MK.ui.rail !== 'draw' && MK.tool) { MK.tool = null; edDrawStage(); } return edRefreshDrawer();
    case 'undo': return edUndoRedo(false);
    case 'redo': return edUndoRedo(true);
    case 'zoom-in': return edZoom(1.2);
    case 'zoom-out': return edZoom(1 / 1.2);
    case 'zoom-fit': MK.ui.zoom = 0; return edDrawStage();
    case 'slide': MK.edSlide = +el.dataset.i; MK.sel = ''; MK.ui.scrollTo = MK.edSlide; edDrawStage(); edRefreshInsp(); edRefreshPages(true); if (MK.ui.rail === 'layers' || MK.ui.rail === 'text') edRefreshDrawer(); return;
    case 'slide-add': case 'slide-dup': case 'slide-del': return edSlideOp(a, el.dataset.i != null ? +el.dataset.i : undefined);
    case 'to-carousel': return edMeta('format', 'carousel');
    case 'select': MK.sel = id; edOverlay(); edRefreshInsp(); if (MK.ui.rail === 'layers' || MK.ui.rail === 'text') edRefreshDrawer(); return;
    case 'deselect': return edSelect('');
    case 'inline-edit': return edInlineEdit(id);
    case 'eltoggle': { const f = edFind(id); if (f) { f.el.hid = !f.el.hid || undefined; if (!f.el.hid) delete f.el.hid; mkTouch(); edRefreshAll(false); edRefreshDrawer(); } return; }
    case 'ellock': { const f = edFind(id); if (f) { f.el.lock = !f.el.lock || undefined; if (!f.el.lock) delete f.el.lock; mkTouch(); edOverlay(); edRefreshInsp(); if (MK.ui.rail === 'layers') edRefreshDrawer(); } return; }
    case 'prop': { const v = el.dataset.v, p = el.dataset.p; edProp(id, p, v === '' ? undefined : v); edRefreshAll(p.startsWith('treat') || ['color', 'brush'].includes(p)); edRefreshInsp(); return; }
    case 'toggle': { const f = edFind(id); if (!f) return; const p = el.dataset.p, cur = edGetPath(f.el, p); edProp(id, p, cur ? undefined : (el.dataset.v || true)); if (p === 'full' && !f.el.full) Object.assign(f.el, { x: 0, w: 100, tp: 0, hp: 100 }); edRefreshAll(p === 'flip'); edRefreshInsp(); return; }
    case 'paintcolor': MK.paint.color = el.dataset.v; return edRefreshDrawer();
    case 'paint-brush': MK.paint.brush = el.dataset.v; return edRefreshDrawer();
    case 'treat-preset': { const f = edFind(id); if (f) { f.el.treat = { ...mkTreatDefault(), ...f.el.treat, duo: true, a: el.dataset.a, b: el.dataset.b }; mkTouch(); edRefreshAll(true); edRefreshInsp(); } return; }
    case 'treat-off': { const f = edFind(id); if (f) { f.el.treat = { ...mkTreatDefault(), ...f.el.treat, duo: false }; mkTouch(); edRefreshAll(true); edRefreshInsp(); } return; }
    case 'add-text': return edAddText(el.dataset.k);
    case 'add-shape': return edAddShape(el.dataset.k);
    case 'add-brush': return edAddBrush(el.dataset.k);
    case 'add-logo': return edAddLogo(el.dataset.v);
    case 'brand-color': return edBrandColor(el.dataset.v);
    case 'brand-font': { const f = edSel(); if (f?.el.type !== 'text') return toast('Selecione um texto na arte para trocar a fonte.', true); edProp(f.el.id, 'st.font', el.dataset.v); edRefreshAll(false); edRefreshInsp(); return; }
    case 'apply-ref': return edApplyRef(el.dataset.ref);
    case 'strip-add': { const n = MK.ed.slides.length, els = MK_STRIP_PRESETS[el.dataset.k].build(n).map(x => ({ ...mkClone(x), id: mkUid() })); MK.ed.strip.push(...els); MK.sel = els[0].id; mkTouch(); edRefreshAll(true); edRefreshInsp(); return; }
    case 'front': return edOrder(id, 1);
    case 'back': return edOrder(id, -1);
    case 'dup': return edDup(id);
    case 'del': return edDelete(id);
    case 'align': return edAlign(id, el.dataset.v);
    case 'reseed': { const f = edFind(id); if (f) { f.el.seed = Math.floor(Math.random() * 9999) + 1; mkTouch(); edRefreshAll(true); } return; }
    case 'paint-toggle': MK.tool = MK.tool === 'paint' ? null : 'paint'; MK.sel = ''; edDrawStage(); edRefreshDrawer(); edRefreshInsp(); return;
    case 'img-clear': { const strip = el.dataset.strip === '1'; delete (strip ? MK.ed.sv : edSl().v)[el.dataset.slot]; mkTouch(); edRefreshAll(false); edRefreshInsp(); return; }
    case 'layout-cat': MK.ui.cat = el.dataset.v; return edRefreshDrawer();
    case 'layout-apply': return edApplyLayout(id);
    case 'layout-save': return edSaveLayoutDialog();
    case 'layout-save-go': return edSaveLayout();
    case 'layout-del': return edDeleteLayout(id);
    case 'layout-reset': { const lay = mkLayoutById(edSl().l); MK.ed.slides[MK.edSlide] = mkApplyLayout(edSl(), lay); MK.sel = ''; mkTouch(); edRefreshAll(true); edRefreshInsp(); toast(`Elementos de “${lay.name}” restaurados. Ctrl+Z desfaz.`); return; }
    case 'ai-copy': return edAiCopy();
    case 'ai-image': return edAiImage();
    case 'ai-review': return edAiReview();
    case 'ai-video': return edAiVideo();
  }
});
document.addEventListener('dblclick', e => { if (!MK.ed || S.page !== 'studio') return; const box = e.target.closest('.mk-box'); if (!box) return; const f = edFind(box.dataset.id); if (f?.el.type === 'text') edInlineEdit(f.el.id); else if (f?.el.type === 'image') $(`#stf_${CSS.escape(f.el.id)}`)?.click(); });

function edField(e) {
  const el = e.target.closest('[data-edf]'); if (!el || !MK.ed) return;
  const kind = el.dataset.edf, final = e.type === 'change';
  if (kind === 'layout-q') { MK.ui.q = el.value; return edLater(() => { edRefreshDrawer(); const q = $('#stDrawer .st-search'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 160); }
  if (mkLocked() && !['brief', 'imgprompt', 'vidprompt'].includes(kind)) return;
  if (kind === 'slot') {
    const vals = edSlotVals(el.dataset.strip === '1'); vals[el.dataset.slot] = el.value; mkTouch(); edCounter(el.dataset.id, el.value);
    edLater(() => edRefreshAll(false), 60); return;
  }
  if (kind === 'prop') {
    const id = el.dataset.id, p = el.dataset.p; let v = el.value;
    if (el.dataset.num) { v = Number(v); if (!Number.isFinite(v)) return; el.closest('.st-rng')?.querySelectorAll('input').forEach(i => { if (i !== el) i.value = v; }); }
    edProp(id, p, v);
    const heavy = p.startsWith('treat') || p === 'tex' || p === 'size';
    if (el.type === 'range' || (el.type === 'number' && !final)) edLater(() => edRefreshAll(heavy), heavy ? 140 : 40); else edRefreshAll(heavy);
    return;
  }
  if (kind === 'rect' && final) {
    const found = edFind(el.dataset.id); if (!found) return; const f = edF(), r = mkRectU(found.el, f, 0, edAr(found.el)); r[el.dataset.k] = Number(el.value) || 0; found.el.full = false; mkSetRectU(found.el, f, r); mkTouch(); edRefreshAll(true); return;
  }
  if (kind === 'rename') { const f = edFind(el.dataset.id); if (f) { f.el.label = el.value.trim() || undefined; mkTouch(); if (final) { edOverlay(); if (MK.ui.rail === 'layers') edRefreshDrawer(); } } return; }
  if (kind === 'paintprop') { const v = Number(el.value); MK.paint[el.dataset.p] = v; el.closest('.st-rng')?.querySelectorAll('input').forEach(i => { if (i !== el) i.value = v; }); return; }
  if (kind === 'brief') { MK.ed.brief = el.value; if (final) edRefreshDrawer(); return; }
  if (kind === 'imgprompt') { MK.ed.imgPrompt = el.value; return; }
  if (kind === 'vidprompt') { MK.ed.vidPrompt = el.value; return; }
  if (kind === 'vidsecs' && final) { MK.ed.vidSecs = Number(el.value); edRefreshDrawer(); return; }
  if (kind === 'file' && final) { const strip = el.dataset.strip === '1', found = [...(strip ? MK.ed.strip : edSl().e)].find(x => x.slot === el.dataset.slot); return edUploadFiles(el.files, found?.id); }
  if (kind === 'files' && final) return edUploadFiles(el.files);
  if (kind === 'meta' && final) return edMeta(el.dataset.k, el.value);
  if (kind === 'meta' && el.dataset.k === 'title') { MK.ed.title = el.value; MK.ed.dirty = true; const s = $('#stState'); if (s) s.innerHTML = edStateHtml(); }
}
document.addEventListener('input', edField);
document.addEventListener('change', edField);
async function edMeta(k, v) {
  const ed = MK.ed; ed.dirty = true;
  if (k === 'title') { ed.title = v; return edRefreshTop(); }
  if (k === 'campaignId') { ed.campaignId = v; return; }
  if (k === 'format') {
    if (ed.slides.length > 1 && v !== 'carousel' && !await confirmBox({ title: 'Trocar o formato?', text: 'Só a lâmina atual será mantida.', ok: 'Trocar' })) return render();
    if (v !== 'carousel') { ed.slides = [edSl()]; ed.strip = []; MK.edSlide = 0; }
    ed.format = v; MK.sel = ''; MK.ui.zoom = 0; edThumbFmt = ''; mkTouch(); render();
  }
}

/* Arrastar e soltar: fotos do computador e da galeria na arte, camadas e lâminas */
document.addEventListener('dragstart', e => {
  if (!MK.ed) return;
  const g = e.target.closest?.('[data-ed="apply-ref"]'); if (g) { e.dataTransfer.setData('text/mk-ref', g.dataset.ref); e.dataTransfer.effectAllowed = 'copy'; return; }
  const l = e.target.closest?.('[data-layer]'); if (l) { e.dataTransfer.setData('text/mk-layer', l.dataset.layer); e.dataTransfer.effectAllowed = 'move'; return; }
  const p = e.target.closest?.('[data-page]'); if (p) { e.dataTransfer.setData('text/mk-page', p.dataset.page); e.dataTransfer.effectAllowed = 'move'; }
});
const edDropBox = e => { const n = document.elementsFromPoint(e.clientX, e.clientY).find(x => x.classList?.contains('mk-box')); const f = n && edFind(n.dataset.id); return f?.el.type === 'image' ? f.el.id : ''; };
document.addEventListener('dragover', e => {
  if (!MK.ed || mkLocked()) return;
  const types = [...(e.dataTransfer?.types || [])];
  if (e.target.closest('#stViewport') && (types.includes('Files') || types.includes('text/mk-ref'))) {
    e.preventDefault(); const id = edDropBox(e); $$('.mk-box.drop').forEach(x => x.classList.toggle('drop', x.dataset.id === id)); if (id) $(`.mk-box[data-id="${CSS.escape(id)}"]`)?.classList.add('drop');
    $('#stViewport').classList.add('dropping'); return;
  }
  if (e.target.closest('#stDrop') && types.includes('Files')) { e.preventDefault(); return; }
  if ((types.includes('text/mk-layer') && e.target.closest('[data-layer]')) || (types.includes('text/mk-page') && e.target.closest('[data-page]'))) e.preventDefault();
});
document.addEventListener('dragleave', e => { if (e.target.id === 'stViewport') { $('#stViewport')?.classList.remove('dropping'); $$('.mk-box.drop').forEach(x => x.classList.remove('drop')); } });
document.addEventListener('drop', e => {
  if (!MK.ed || mkLocked()) return;
  const dt = e.dataTransfer; $('#stViewport')?.classList.remove('dropping'); $$('.mk-box.drop').forEach(x => x.classList.remove('drop'));
  if (e.target.closest('#stViewport')) {
    e.preventDefault(); const target = edDropBox(e);
    if (dt.files?.length) return edUploadFiles(dt.files, target);
    const ref = dt.getData('text/mk-ref'); if (ref) return edApplyRef(ref, target);
    return;
  }
  if (e.target.closest('#stDrop') && dt.files?.length) { e.preventDefault(); return edUploadFiles(dt.files); }
  const lid = dt.getData('text/mk-layer'), lt = e.target.closest('[data-layer]');
  if (lid && lt && lid !== lt.dataset.layer) {
    e.preventDefault(); const a = edFind(lid), b = edFind(lt.dataset.layer); if (!a || !b || a.strip !== b.strip) return;
    const list = a.strip ? MK.ed.strip : edSl().e; list.splice(list.indexOf(a.el), 1); list.splice(list.indexOf(b.el) + 1, 0, a.el);
    mkTouch(); edRefreshAll(false); edRefreshDrawer(); return;
  }
  const pid = dt.getData('text/mk-page'), pt = e.target.closest('[data-page]');
  if (pid !== '' && pt && pid !== pt.dataset.page) {
    e.preventDefault(); const s = MK.ed.slides, from = +pid, to = +pt.dataset.page, [sl] = s.splice(from, 1); s.splice(to, 0, sl); MK.edSlide = to;
    mkTouch(); edRefreshAll(false); edRefreshPages(true); edRefreshInsp();
  }
});

/* ═══════════ Layouts próprios ═══════════ */
function edSaveLayoutDialog() {
  const lay = mkLayoutById(edSl().l);
  openDialog(dHead('Layout próprio', 'Salvar como layout', `Guarda posição, tamanho, fontes, cores e pincéis desta lâmina como uma variação de “${esc(lay.name)}”.`) + `<form class="d-body" novalidate><div class="field"><label for="lyName">Nome do layout *</label><input class="input" id="lyName" maxlength="80" placeholder="Ex.: Destaque com pincelada à esquerda" value="${esc(lay.user ? lay.name : lay.name + ' (variação)')}"></div><div class="banner warn" id="lyErr" hidden></div></form><div class="d-foot"><button class="btn" data-act="close-dialog">Cancelar</button><button class="btn primary" data-ed="layout-save-go">Salvar layout</button></div>`);
}
async function edSaveLayout() {
  const name = $('#lyName').value.trim(); if (name.length < 2) return mkDialogErr('lyErr', 'Dê um nome ao layout.');
  const sl = edSl(), cur = mkLayoutById(sl.l), els = mkClone(sl.e).filter(e => e.type !== 'paint' || (e.pts && e.pts.length));
  els.forEach(e => { if (e.type === 'text' && e.slot && sl.v[e.slot] !== undefined) e.def = sl.v[e.slot]; delete e.lock; });
  const { error } = await mkDb().from('marketing_layouts').insert({ name, base_id: cur.user ? cur.base : cur.id, bg: sl.bg?.c || 'navy', els });
  if (error) return mkDialogErr('lyErr', mkErr(error));
  closeDialog(); toast('Layout salvo em “Meus layouts”.'); MK.ui.cat = 'Meus layouts'; MK.ui.rail = 'layouts'; await mkLoad(true);
}
async function edDeleteLayout(dbId) {
  if (!await confirmBox({ title: 'Excluir o layout?', text: 'Peças que já usam esse layout continuam como estão.', ok: 'Excluir', danger: true })) return;
  const { error } = await mkDb().from('marketing_layouts').delete().eq('id', dbId);
  if (error) return toast(mkErr(error), true);
  toast('Layout excluído.'); await mkLoad(true);
}

/* ═══════════ IA ═══════════ */
function edEstLine(plan, label) {
  const e = mkEst(plan), camp = mkCampaign(MK.ed.campaignId);
  const extra = camp && Number(camp.ai_budget_brl) > 0 ? ` · Campanha: ${mkBrl(mkSpent(camp.id))} de ${mkBrl(Number(camp.ai_budget_brl))}` : '';
  return `<div class="mk-cost">${icon('money')}<span>${esc(label)}: <b>${mkRange(e.brlMin, e.brlMax)}</b>${extra}</span></div>`;
}
function edAiTab(locked) {
  const sl = edSl(), dis = locked || MK.busy ? 'disabled' : '', ed = MK.ed;
  const imgs = sl.e.filter(e => e.type === 'image' && e.slot), textMax = sl.e.filter(e => e.type === 'text' && e.max && !e.hid).map(e => e.max);
  const brief = ed.brief || '', iprompt = ed.imgPrompt || '', vprompt = ed.vidPrompt || '', secs = ed.vidSecs || 6, busy = k => MK.busy === k ? ' · gerando…' : '';
  return `<div class="st-dsec first">Textos da lâmina</div><div class="field"><label for="mkBrief">Briefing</label><textarea class="input" id="mkBrief" rows="4" maxlength="1500" data-edf="brief" placeholder="Ex.: peneira sábado 08/11 às 15h, ginásio Apollo, meninas de 12 a 15 anos" ${dis}>${esc(brief)}</textarea></div>
    ${edEstLine({ copies: [{ briefChars: brief.length || 200, slots: textMax }] }, 'Custo estimado')}<button class="btn primary sm" data-ed="ai-copy" ${dis}>${icon('sparkle')} Escrever os textos${busy('copy')}</button>
    <div class="st-dsec">Imagem</div><div class="field"><label for="mkImgP">Descreva a imagem</label><textarea class="input" id="mkImgP" rows="3" maxlength="1200" data-edf="imgprompt" placeholder="Ex.: jogadora de vôlei sacando, luz de ginásio, estilo fotográfico" ${dis}>${esc(iprompt)}</textarea></div>
    ${imgs.length > 1 ? `<div class="field"><label for="mkImgS">Aplicar em</label><select class="select" id="mkImgS">${imgs.map(e => `<option value="${esc(e.id)}">${esc(edElName(e))}</option>`).join('')}</select></div>` : ''}
    ${edEstLine({ images: 1 }, 'Custo da imagem')}<button class="btn primary sm" data-ed="ai-image" ${dis}>${icon('sparkle')} Gerar imagem${busy('image')}</button>
    <div class="st-dsec">Revisão da arte</div><p class="hint">Confere texto cortado, contraste, respiro da logo, cores da marca e português.</p>
    ${edEstLine({ reviews: 1 }, 'Custo da revisão')}<button class="btn sm" data-ed="ai-review" ${dis}>${icon('eye')} Revisar esta lâmina${busy('review')}</button>
    ${MK.review ? `<div class="mk-review ${MK.review.approved ? 'ok' : 'bad'}"><b>${MK.review.approved ? 'Sem problemas graves.' : 'Pontos de atenção'}</b><p class="small">${esc(MK.review.summary || '')}</p>${(MK.review.issues || []).map(i => `<div class="small">• <b>${esc(i.severity)}</b>: ${esc(i.text)}</div>`).join('')}</div>` : ''}
    <div class="st-dsec">Vídeo curto</div><div class="field"><label for="mkVidP">Descreva o vídeo</label><textarea class="input" id="mkVidP" rows="3" maxlength="1200" data-edf="vidprompt" placeholder="Ex.: câmera lenta de uma bola subindo para a cortada" ${dis}>${esc(vprompt)}</textarea></div>
    <div class="field"><label for="mkVidS">Duração</label><select class="select" id="mkVidS" data-edf="vidsecs" ${dis}>${[4, 6, 8].map(n => `<option value="${n}" ${secs === n ? 'selected' : ''}>${n} segundos</option>`).join('')}</select></div>
    ${edEstLine({ videoSeconds: secs }, 'Custo do vídeo')}<button class="btn primary sm" data-ed="ai-video" ${dis}>${icon('sparkle')} Gerar vídeo${busy('video')}</button>
    ${MK.video ? `<div class="mk-vid"><video src="${esc(MK.video.url)}" controls playsinline></video><a class="btn sm" href="${esc(MK.video.url)}" download="apollo-video.mp4">${icon('download')} Baixar vídeo</a></div>` : ''}`;
}
async function edAi(payload) {
  const { data, error } = await mkDb().functions.invoke('marketing-ai', { body: { ...payload, pieceId: MK.ed.id || undefined, campaignId: MK.ed.campaignId || undefined } });
  if (error) { let r = null; try { r = await error.context.json(); } catch { } throw new Error(r?.error || error.message); }
  return data;
}
async function edRun(kind, fn) {
  if (!mkCan('studio')) return toast('Seu perfil não pode usar a IA.', true);
  if (!MK.ed.id && !await mkSavePiece(true)) return;
  MK.busy = kind; edRefreshDrawer();
  try { await fn(); await mkLoad(true); } catch (e) { toast(mkErr(e), true); }
  MK.busy = ''; edRefreshDrawer();
}
const edCost = d => d?.usage ? `Custo real: ${mkBrl(d.usage.costBrl)}` : '';
function edAiCopy() {
  const ed = MK.ed, sl = edSl(), els = sl.e.filter(e => e.type === 'text' && e.max && !e.hid && e.slot);
  if (!(ed.brief || '').trim()) return toast('Escreva o briefing antes de gerar os textos.', true);
  const slots = Object.fromEntries(els.map(e => [e.slot, { label: edElName(e), max: e.max }]));
  return edRun('copy', async () => { const d = await edAi({ action: 'copy', brief: ed.brief, slots }); Object.assign(sl.v, d.slots); mkTouch(); edRefreshAll(false); edRefreshInsp(); toast(`Textos gerados. ${edCost(d)}`); });
}
function edAiImage() {
  const ed = MK.ed, target = $('#mkImgS')?.value || '';
  if (!(ed.imgPrompt || '').trim()) return toast('Descreva a imagem que você quer.', true);
  return edRun('image', async () => { const d = await edAi({ action: 'image', prompt: ed.imgPrompt, format: ed.format }); const ref = 'storage:' + d.path; ed.gallery = [...(ed.gallery || []), ref]; edApplyRef(ref, target); toast(`Imagem gerada. ${edCost(d)}`); });
}
function edAiReview() {
  return edRun('review', async () => {
    const ed = MK.ed, f = MK_FORMATS[ed.format];
    await mkEnsure(ed.slides, ed.strip, ed.sv, ed.format, mkResolveImage);
    const png = await mkRasterize(mkSlideHtml(edSl(), ed.format, mkCtx(), MK.edSlide, ed.slides.length, ed.strip, ed.sv), f.w, f.h);
    const d = await edAi({ action: 'review', imageBase64: await mkDownscaleBase64(png) });
    MK.review = d.review; toast(`Revisão concluída. ${edCost(d)}`);
  });
}
async function edAiVideo() {
  const ed = MK.ed, secs = ed.vidSecs || 6;
  if (!(ed.vidPrompt || '').trim()) return toast('Descreva o vídeo que você quer.', true);
  const est = mkEst({ videoSeconds: secs });
  if (est.brlMax >= Number(MK.settings.video_confirm_brl) && !await confirmBox({ title: 'Gerar vídeo?', text: `O custo estimado é de <b>${mkBrl(est.brlMax)}</b> (${secs} s). Deseja continuar?`, ok: 'Gerar vídeo' })) return;
  return edRun('video', async () => {
    const start = await edAi({ action: 'video_start', prompt: ed.vidPrompt, format: ed.format, seconds: secs });
    for (let i = 0; i < 45; i++) {
      await new Promise(r => setTimeout(r, 8000));
      const d = await edAi({ action: 'video_poll', operation: start.operation, seconds: start.seconds });
      if (d.done) { MK.video = { url: URL.createObjectURL(await mkSignedBlob(d.path)), path: d.path }; toast(`Vídeo gerado. ${edCost(d)}`); return; }
    }
    throw new Error('O vídeo demorou demais para ficar pronto. Tente de novo em instantes.');
  });
}
