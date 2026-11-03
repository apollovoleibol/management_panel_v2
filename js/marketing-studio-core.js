/* Estúdio de peças · núcleo: kit da marca, layouts por elementos, duotone, pincéis com pressão, calculadora e exportação em PNG.
   A parte pura (sem DOM) roda em teste com vm. A IA nunca desenha texto, logo ou layout: tudo vem destes layouts. */
'use strict';

const MK_COLORS = { navy: '#0f1332', red: '#ee4036', white: '#ffffff', gray: '#808083', light: '#f4f5f8' };
const MK_COLOR_NAMES = { navy: 'Azul', red: 'Vermelho', white: 'Branco', gray: 'Cinza', light: 'Claro' };
const MK_PALETTE = ['navy', 'red', 'white', 'gray'];
const MK_FORMATS = {
  feed: { label: 'Feed 4:5', w: 1080, h: 1350 },
  story: { label: 'Stories/Reels 9:16', w: 1080, h: 1920 },
  square: { label: 'Quadrado 1:1', w: 1080, h: 1080 },
  carousel: { label: 'Carrossel 4:5', w: 1080, h: 1350 },
};
// cw = largura média do caractere em em (para o texto caber sozinho na caixa)
const MK_FONTS = {
  block: { label: 'Infield Block', family: "'Infield Block','Arial Black',Arial,sans-serif", weight: 400, cw: 0.5 },
  g300: { label: 'Gridnik Light', family: "'Gridnik',Arial,sans-serif", weight: 300, cw: 0.56 },
  g400: { label: 'Gridnik Regular', family: "'Gridnik',Arial,sans-serif", weight: 400, cw: 0.58 },
  g500: { label: 'Gridnik Medium', family: "'Gridnik',Arial,sans-serif", weight: 500, cw: 0.6 },
  g700: { label: 'Gridnik Bold', family: "'Gridnik',Arial,sans-serif", weight: 700, cw: 0.63 },
  g800: { label: 'Gridnik ExtraBold', family: "'Gridnik',Arial,sans-serif", weight: 800, cw: 0.66 },
};
const MK_FONT_FILES = [
  ['Infield Block', 'Infield-Block', 400, 'normal'],
  ['Gridnik', 'Gridnik-Light', 300, 'normal'], ['Gridnik', 'Gridnik-Regular', 400, 'normal'], ['Gridnik', 'Gridnik-Medium', 500, 'normal'],
  ['Gridnik', 'Gridnik-Bold', 700, 'normal'], ['Gridnik', 'Gridnik-ExtraBold', 800, 'normal'],
  ['Gridnik', 'Gridnik-LightItalic', 300, 'italic'], ['Gridnik', 'Gridnik-Italic', 400, 'italic'], ['Gridnik', 'Gridnik-MediumItalic', 500, 'italic'],
  ['Gridnik', 'Gridnik-BoldItalic', 700, 'italic'], ['Gridnik', 'Gridnik-ExtraBoldItalic', 800, 'italic'],
];
// Logos oficiais disponíveis no estúdio (ar = largura/altura)
const MK_LOGOS = {
  'assinatura-azul': { label: 'Assinatura azul', ar: 473 / 259, dark: false },
  'assinatura-branca': { label: 'Assinatura branca', ar: 473 / 259, dark: true },
  'assinatura-vermelha': { label: 'Assinatura vermelha', ar: 473 / 259 },
  'assinatura-cinza': { label: 'Assinatura cinza', ar: 473 / 259 },
  'selo-azul': { label: 'Selo azul', ar: 1 },
  'selo-contorno': { label: 'Selo contorno branco', ar: 1 },
  'selo-contorno-vermelho': { label: 'Selo contorno com foguete vermelho', ar: 1 },
};
const MK_ASSET_FILES = Object.keys(MK_LOGOS);
// Pincéis: pontas extraídas do Apollo Brushes.abr. mode: stroke = carimba ao longo de um caminho com pressão
const MK_BRUSHES = {
  seco: { label: 'Pincelada seca', mode: 'stroke', rot: true, ar: 4.2, tex: 0.55 },
  riscado: { label: 'Riscado', mode: 'stroke', rot: false, ar: 3.2, tex: 0.5 },
  hachura: { label: 'Hachura', mode: 'stroke', rot: false, ar: 3.6, tex: 0.5 },
  respingo: { label: 'Respingo', mode: 'splat', ar: 800 / 662 },
  grao: { label: 'Granulado', mode: 'grain', ar: 1.5 },
};

/* ─── Texto: caber na caixa ─── */
function mkLines(text, boxW, fs, cw) {
  const per = Math.max(1, Math.floor(boxW / (fs * cw)));
  let lines = 0;
  for (const para of String(text || '').split('\n')) {
    let cur = 0, n = 1;
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const len = word.length;
      if (cur === 0) { cur = len; n += Math.floor((len - 1) / per); cur = len % per || per; }
      else if (cur + 1 + len <= per) cur += 1 + len;
      else { n++; cur = len; if (len > per) { n += Math.floor((len - 1) / per); cur = len % per || per; } }
    }
    lines += n;
  }
  return lines;
}
function mkFitSize(text, fs, boxW, maxLines, cw) {
  let s = fs;
  while (s > fs * 0.4 && mkLines(text, boxW, s, cw) > maxLines) s -= fs * 0.03;
  return Math.round(s * 10) / 10;
}

/* ─── Utilidades ─── */
const mkEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mkClone = o => JSON.parse(JSON.stringify(o));
const mkCol = k => MK_COLORS[k] || k || '#ffffff';
const mkRgb = k => { const h = mkCol(k).replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
const mkLum = k => { const [r, g, b] = mkRgb(k); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
let mkSeq = 0;
const mkUid = () => 'e' + Date.now().toString(36) + (mkSeq++).toString(36);
const r1 = n => Math.round(n * 10) / 10;

/* ─── Geometria: x/w em u (1u = 1% da largura). Vertical: t|b em u, tp|bp em % da altura. Altura: h (u), hp (%) ou ar (largura/altura) ─── */
const mkHu = f => f.h / f.w * 100;
function mkPos(el, f, arOverride) {
  const u = f.w / 100, ar = arOverride || el.ar;
  let s = `left:${el.x * u}px;`;
  s += el.inl ? `max-width:${el.w * u}px;` : `width:${el.w * u}px;`;
  if (el.t != null) s += `top:${el.t * u}px;`;
  else if (el.tp != null) s += `top:${el.tp / 100 * f.h}px;`;
  else if (el.b != null) s += `bottom:${el.b * u}px;`;
  else if (el.bp != null) s += `bottom:${el.bp / 100 * f.h}px;`;
  else s += 'top:0;';
  if (el.h != null) s += `height:${el.h * u}px;`;
  else if (el.hp != null) s += `height:${el.hp / 100 * f.h}px;`;
  else if (ar) s += `height:${el.w * u / ar}px;`;
  return s;
}
function mkRectU(el, f, hDom, arOverride) {
  const Hu = mkHu(f), ar = arOverride || el.ar;
  const h = el.h != null ? el.h : el.hp != null ? el.hp / 100 * Hu : ar ? el.w / ar : (hDom || 0);
  let y = 0;
  if (el.t != null) y = el.t; else if (el.tp != null) y = el.tp / 100 * Hu;
  else if (el.b != null) y = Hu - el.b - h; else if (el.bp != null) y = Hu - el.bp / 100 * Hu - h;
  return { x: el.x, y, w: el.w, h };
}
function mkSetRectU(el, f, r) {
  const Hu = mkHu(f);
  el.x = r1(r.x); el.w = Math.max(2, r1(r.w));
  if (el.h != null) el.h = Math.max(1, r1(r.h)); else if (el.hp != null) el.hp = Math.max(1, r1(r.h / Hu * 100));
  if (el.t != null) el.t = r1(r.y); else if (el.tp != null) el.tp = r1(r.y / Hu * 100);
  else if (el.b != null) el.b = r1(Hu - r.y - r.h); else if (el.bp != null) el.bp = r1((Hu - r.y - r.h) / Hu * 100);
  return el;
}

/* ─── Pressão e carimbos (pincéis) ─── */
function mkRng(seed) { let a = (seed | 0) + 0x6D2B79F5; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// Pressão simulada de 0 a 1 ao longo do traço (t de 0 a 1): entra, oscila e levanta no fim. tex 0 = sólido, 1 = muita textura.
function mkPressureAt(t, seed, tex) {
  const rnd = mkRng(seed), n = 7, ctrl = [];
  for (let i = 0; i < n; i++) ctrl.push(rnd());
  const x = Math.min(Math.max(t, 0), 1) * (n - 1), i0 = Math.floor(x), i1 = Math.min(n - 1, i0 + 1), k = x - i0, s = k * k * (3 - 2 * k);
  const noise = ctrl[i0] * (1 - s) + ctrl[i1] * s;
  const strength = Math.max(0.25, tex);
  let p = Math.min(1, Math.max(0.05, 1 - 0.5 * tex + (noise - 0.5) * tex));
  p *= 1 - strength * (1 - Math.min(1, 0.5 + 5 * t) * 1);
  p *= 1 - strength * 0.55 * (1 - Math.min(1, (1 - t) / 0.16));
  return Math.min(1, Math.max(0.04, p));
}
// Opacidade de cada carimbo conforme a pressão: pressão baixa deixa a textura da ponta aparecer
const mkStampAlpha = (p, base, gamma) => base * (0.08 + 0.92 * Math.pow(Math.min(1, Math.max(0, p)), gamma || 1.35));
// Suaviza e resume pontos de caneta (x, y, pressão) para guardar no layout
function mkSimplify(pts, minDist) {
  const out = []; let last = null;
  for (const p of pts) { if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= minDist) { out.push(p); last = p; } }
  if (pts.length && out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
  return out;
}

/* ─── Duotone (cores só da paleta) ─── */
function mkDuotonePixels(px, a, b, amount, contrast, bright, duo) {
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], bl = px[i + 2];
    const lum = (0.299 * r + 0.587 * g + 0.114 * bl) / 255;
    if (duo) {
      const l = Math.min(1, Math.max(0, (lum - 0.5) * contrast + 0.5 + bright));
      px[i] = r * (1 - amount) + (a[0] + (b[0] - a[0]) * l) * amount;
      px[i + 1] = g * (1 - amount) + (a[1] + (b[1] - a[1]) * l) * amount;
      px[i + 2] = bl * (1 - amount) + (a[2] + (b[2] - a[2]) * l) * amount;
    } else {
      px[i] = Math.min(255, Math.max(0, (r / 255 - 0.5) * contrast * 255 + 127.5 + bright * 255));
      px[i + 1] = Math.min(255, Math.max(0, (g / 255 - 0.5) * contrast * 255 + 127.5 + bright * 255));
      px[i + 2] = Math.min(255, Math.max(0, (bl / 255 - 0.5) * contrast * 255 + 127.5 + bright * 255));
    }
  }
  return px;
}
const mkTreatDefault = () => ({ fit: 'cover', duo: false, a: 'navy', b: 'white', amt: 1, con: 1, bri: 0, scrim: 0, scrimC: 'navy', z: 1, fx: 50, fy: 50 });
const mkTreatSig = t => t ? [t.duo ? 1 : 0, t.a, t.b, t.amt, t.con, t.bri].join('|') : 'none';

/* ─── Renderização dos elementos (XHTML válido para virar imagem sem perda) ─── */
const MK_BMP = new Map();   // bitmaps prontos: pinceladas, fotos tratadas, desenhos
const mkImgKey = (el, ref) => `i|${ref}|${mkTreatSig(el.treat)}`;
const mkQ = n => Math.max(16, Math.round(n / 16) * 16);
const mkBrushKey = (el, f) => { const u = f.w / 100; return `b|${el.brush}|${mkQ(el.w * u)}|${mkQ((el.h != null ? el.h : el.w / (MK_BRUSHES[el.brush]?.ar || 2)) * u)}|${el.color}|${el.seed || 1}|${el.tex ?? 0.55}`; };
const mkPaintKey = (el, f) => `p|${el.id}|${el.pts ? el.pts.length : 0}|${el.color}|${el.size}|${el.tex ?? 0.6}|${mkQ(el.w * f.w / 100)}|${mkQ(el.h * f.w / 100)}`;

function mkTextHtml(el, v, f) {
  if (el.hid) return '';
  const val = v[el.slot] !== undefined ? v[el.slot] : (el.def || '');
  if (!String(val).trim()) return '';
  const u = f.w / 100, s = el.st || {}, font = MK_FONTS[s.font] || MK_FONTS.g400;
  const padX = (s.pad || 0) * u, padY = (s.pad || 0) * u * 0.55;
  let fs = (s.fs || 4) * u;
  if (el.lines) fs = Math.min(fs, mkFitSize(val, fs, el.w * u - 2 * padX, el.lines, font.cw));
  const css = `position:absolute;${mkPos(el, f)}box-sizing:border-box;margin:0;white-space:pre-wrap;font-family:${font.family};font-weight:${font.weight};font-style:${s.italic ? 'italic' : 'normal'};`
    + `font-size:${fs}px;line-height:${s.lh || 1.15};text-align:${s.align || 'left'};${s.caps ? 'text-transform:uppercase;' : ''}`
    + (s.outline ? `color:transparent;-webkit-text-stroke:${Math.max(1, (s.sw || 0.22) * u)}px ${mkCol(s.color || 'white')};` : `color:${mkCol(s.color || 'white')};`)
    + `${s.shadow ? `text-shadow:0 ${0.3 * u}px ${1.4 * u}px rgba(15,19,50,.45);` : ''}`
    + `${s.ls ? `letter-spacing:${s.ls * u / 10}px;` : ''}${s.bgc ? `background:${mkCol(s.bgc)};padding:${padY}px ${padX}px;` : ''}${s.op != null && s.op < 1 ? `opacity:${s.op};` : ''}${el.rot ? `transform:rotate(${el.rot}deg);` : ''}`;
  return `<div data-el="${el.id}" style="${css}">${mkEsc(val)}</div>`;
}
// Foto ainda vazia: no editor (ctx.ph) aparece um espaço reservado; na exportação não aparece nada
function mkPhotoPlaceholder(el, f, pos) {
  const u = f.w / 100, small = !el.full && el.w < 30;
  return `<div data-el="${el.id}" style="position:absolute;${pos}${el.round ? 'border-radius:50%;' : ''}box-sizing:border-box;overflow:hidden;background:repeating-linear-gradient(135deg,rgba(255,255,255,.07) 0 ${1.2 * u}px,rgba(255,255,255,0) ${1.2 * u}px ${2.4 * u}px),#2b3050;`
    + `border:${0.35 * u}px dashed rgba(255,255,255,.35);display:flex;align-items:center;justify-content:center;text-align:center;color:rgba(255,255,255,.7);font-family:${MK_FONTS.g500.family};font-weight:500;font-size:${(small ? 2.2 : 3.2) * u}px;line-height:1.3;padding:${2 * u}px">${small ? 'Foto' : 'Arraste uma foto aqui'}</div>`;
}
function mkImageHtml(el, v, f, ctx = {}) {
  if (el.hid) return '';
  const pos = el.full ? 'left:0;top:0;width:100%;height:100%;' : mkPos(el, f);
  const ref = v[el.slot]; if (!ref) return ctx.ph ? mkPhotoPlaceholder(el, f, pos) : '';
  const src = MK_BMP.get(mkImgKey(el, ref)); if (!src) return ctx.ph ? mkPhotoPlaceholder(el, f, pos) : '';
  const t = { ...mkTreatDefault(), ...(el.treat || {}) };
  const scrim = t.scrim > 0 ? `<div style="position:absolute;left:0;top:0;width:100%;height:100%;background:${mkCol(t.scrimC)};opacity:${t.scrim}"></div>` : '';
  return `<div data-el="${el.id}" style="position:absolute;overflow:hidden;${pos}${el.round ? 'border-radius:50%;' : el.r ? `border-radius:${el.r * f.w / 100}px;` : ''}${el.rot ? `transform:rotate(${el.rot}deg);` : ''}${el.op != null && el.op < 1 ? `opacity:${el.op};` : ''}">`
    + `<img src="${src}" alt="" style="display:block;width:100%;height:100%;object-fit:${t.fit === 'contain' ? 'contain' : 'cover'};object-position:${t.fx}% ${t.fy}%;transform:scale(${t.z});transform-origin:${t.fx}% ${t.fy}%"/>${scrim}</div>`;
}
function mkLogoHtml(el, ctx, f) {
  if (el.hid) return '';
  const variant = !el.variant || el.variant === 'auto' ? (ctx.dark ? 'assinatura-branca' : 'assinatura-azul') : el.variant;
  const src = ctx.assets && ctx.assets[variant]; if (!src) return '';
  return `<img data-el="${el.id}" src="${src}" alt="Apollo Voleibol" style="position:absolute;display:block;${mkPos(el, f, MK_LOGOS[variant].ar)}${el.rot ? `transform:rotate(${el.rot}deg);` : ''}${el.op != null && el.op < 1 ? `opacity:${el.op};` : ''}"/>`;
}
function mkShapeHtml(el, f) {
  if (el.hid) return '';
  const u = f.w / 100, [fr, fg, fb] = el.fill ? mkRgb(el.fill) : [0, 0, 0];
  // fade: a cor sólida de um lado some até transparente do outro (sem misturar cores: é a mesma cor da paleta)
  const dir = { up: 'to top', down: 'to bottom', left: 'to left', right: 'to right' }[el.fade];
  const fill = !el.fill ? 'transparent' : dir ? `linear-gradient(${dir},rgba(${fr},${fg},${fb},1) 0%,rgba(${fr},${fg},${fb},1) ${el.solid ?? 15}%,rgba(${fr},${fg},${fb},0) 100%)` : mkCol(el.fill);
  const border = el.stroke ? `border:${(el.sw || 0.3) * u}px solid ${mkCol(el.stroke)};` : '';
  const radius = el.shape === 'ellipse' ? 'border-radius:50%;' : el.r ? `border-radius:${el.r * u}px;` : '';
  return `<div data-el="${el.id}" style="position:absolute;box-sizing:border-box;${mkPos(el, f)}background:${fill};${border}${radius}${el.rot ? `transform:rotate(${el.rot}deg);` : ''}${el.op != null && el.op < 1 ? `opacity:${el.op};` : ''}"></div>`;
}
function mkBitmapHtml(el, f, key) {
  if (el.hid) return '';
  const src = MK_BMP.get(key); if (!src) return `<div data-el="${el.id}" style="position:absolute;${mkPos(el, f)}"></div>`;
  return `<img data-el="${el.id}" src="${src}" alt="" style="position:absolute;display:block;${mkPos(el, f)}${el.h == null && el.hp == null ? '' : ''}transform:${el.rot ? `rotate(${el.rot}deg) ` : ''}${el.flip ? 'scaleX(-1)' : 'none'};${el.op != null && el.op < 1 ? `opacity:${el.op};` : ''}"/>`;
}
function mkElHtml(el, ctx, f, v) {
  switch (el.type) {
    case 'text': return mkTextHtml(el, v, f);
    case 'image': return mkImageHtml(el, v, f, ctx);
    case 'logo': return mkLogoHtml(el, ctx, f);
    case 'shape': return mkShapeHtml(el, f);
    case 'brush': return mkBitmapHtml(el, f, mkBrushKey(el, f));
    case 'paint': return mkBitmapHtml(el, f, mkPaintKey(el, f));
  }
  return '';
}
// Fundo escuro? (para a logo automática: assinatura branca em fundo escuro, azul em fundo claro)
function mkIsDark(slide) {
  const bg = slide.bg?.c || 'navy';
  const fullPhoto = (slide.e || []).some(e => e.type === 'image' && e.full && !e.hid && slide.v && slide.v[e.slot]);
  return fullPhoto || mkLum(bg) < 0.62;
}
// i = posição da lâmina, n = total, strip = elementos contínuos do carrossel (coordenadas em u de toda a faixa)
function mkSlideHtml(slide, fmtKey, ctx, i = 0, n = 1, strip = [], sv = {}) {
  const f = MK_FORMATS[fmtKey] || MK_FORMATS.feed, dctx = { ...ctx, dark: mkIsDark(slide) };
  // contínuos ficam atrás das lâminas, ou na frente de tudo quando marcados com front
  const shifted = strip.map(e => ({ ...e, x: e.x - 100 * i })), layer = front => shifted.filter(e => !!e.front === front).map(e => mkElHtml(e, dctx, f, sv)).join('');
  const body = layer(false) + (slide.e || []).map(e => mkElHtml(e, dctx, f, slide.v || {})).join('') + layer(true);
  return `<div style="position:relative;overflow:hidden;width:${f.w}px;height:${f.h}px;background:${mkCol(slide.bg?.c || 'navy')};font-family:${MK_FONTS.g400.family};color:#ffffff">${body}</div>`;
}

/* ─── Slides ─── */
const mkTextEls = els => els.filter(e => e.type === 'text' && e.slot);
const mkSlotEls = els => els.filter(e => (e.type === 'text' || e.type === 'image') && e.slot);
function mkDefaults(els) { const v = {}; for (const e of mkTextEls(els)) v[e.slot] = e.def || ''; return v; }
function mkNewSlide(layout) { return { l: layout.id, bg: { c: layout.bg || 'navy' }, e: mkClone(layout.els), v: mkDefaults(layout.els) }; }
// Troca o layout mantendo o que o usuário já escreveu nos campos de mesmo nome.
// Valores sem campo no novo layout continuam guardados: voltar para um layout com foto traz a foto de volta.
function mkApplyLayout(slide, layout) {
  const keep = slide.v || {}, base = mkDefaults(layout.els), v = { ...keep };
  for (const k of Object.keys(base)) if (keep[k] === undefined || keep[k] === '') v[k] = base[k];
  return { l: layout.id, bg: { c: layout.bg || 'navy' }, e: mkClone(layout.els), v };
}
function mkValidate(slide) {
  const out = [];
  for (const e of slide.e || []) {
    if (e.hid) continue;
    const val = (slide.v || {})[e.slot];
    if (e.type === 'text' && e.max && String(val ?? '').length > e.max) out.push(`${e.label || e.slot}: ${String(val).length} caracteres (máximo ${e.max}).`);
    if (e.type === 'image' && e.req && !val) out.push(`${e.label || e.slot}: sem imagem.`);
  }
  return out;
}

/* ─── Calculadora de custo ─── */
const mkTok = chars => Math.ceil(Number(chars || 0) / 3.2);
function mkEstimate(plan, pricing, usdBrl) {
  const lines = [];
  const t = pricing.text || { input: 0, output: 0 };
  const textUsd = (i, o) => (i * (t.input || 0) + o * (t.output || 0)) / 1e6;
  const add = (label, qty, min, max, tokens) => lines.push({ label, qty, usdMin: min, usdMax: max, brlMin: min * usdBrl, brlMax: max * usdBrl, tokens: tokens || null });
  const copies = plan.copies || [];
  if (copies.length) {
    let inT = 0, outMin = 0;
    for (const c of copies) { inT += 220 + mkTok(c.briefChars) + 45 * c.slots.length; outMin += c.slots.reduce((n, m) => n + mkTok(m) + 20, 0); }
    const outMax = Math.ceil(outMin * 1.3) + 100 * copies.length;
    add('Textos (Gemini)', `${copies.length} geração(ões)`, textUsd(inT, outMin), textUsd(inT, outMax), { input: inT, outputMin: outMin, outputMax: outMax });
  }
  if (plan.reviews) {
    const inT = plan.reviews * 1320, outMin = plan.reviews * 150, outMax = plan.reviews * 500;
    add('Revisão da arte (Gemini visão)', `${plan.reviews} revisão(ões)`, textUsd(inT, outMin), textUsd(inT, outMax), { input: inT, outputMin: outMin, outputMax: outMax });
  }
  if (plan.images) { const c = plan.images * ((pricing.image || {}).unit || 0); add('Imagens (Gemini)', `${plan.images} imagem(ns)`, c, c); }
  if (plan.videoSeconds) { const c = plan.videoSeconds * ((pricing.video || {}).unit || 0); add('Vídeo (Veo)', `${plan.videoSeconds} s de vídeo`, c, c); }
  const sum = k => lines.reduce((n, l) => n + l[k], 0);
  return { lines, usdMin: sum('usdMin'), usdMax: sum('usdMax'), brlMin: sum('brlMin'), brlMax: sum('brlMax'), usdBrl };
}
function mkBrl(n) {
  if (!n) return 'R$ 0,00';
  if (n < 0.01) return '< R$ 0,01';
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const mkRange = (min, max) => (Math.abs(max - min) < 0.005 || mkBrl(min) === mkBrl(max)) ? mkBrl(max) : `${mkBrl(min)} a ${mkBrl(max)}`;

/* ═══════════ Navegador: marca, pincéis, tratamento de fotos, exportação ═══════════ */
const MK_CACHE = { assets: null, fontCss: null, loading: null, tips: null };
const mkBlobToDataUrl = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
async function mkFetchDataUrl(url) { const r = await fetch(url); if (!r.ok) throw new Error('Arquivo da marca indisponível: ' + url); return mkBlobToDataUrl(await r.blob()); }
const mkLoadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Imagem inválida.')); i.src = src; });
async function mkLoadBrand() {
  if (MK_CACHE.assets && MK_CACHE.fontCss && MK_CACHE.tips) return;
  if (!MK_CACHE.loading) MK_CACHE.loading = (async () => {
    const assets = {};
    await Promise.all(MK_ASSET_FILES.map(async n => { assets[n] = await mkFetchDataUrl(`assets/brand/img/${n}.png`); }));
    const faces = await Promise.all(MK_FONT_FILES.map(async ([fam, file, w, st]) =>
      `@font-face{font-family:'${fam}';font-weight:${w};font-style:${st};src:url(${await mkFetchDataUrl(`assets/brand/fonts/${file}.woff2`)}) format('woff2');}`));
    const tips = {};
    await Promise.all(['seco', 'riscado', 'hachura', 'respingo', 'grao'].map(async n => { tips[n] = await mkTipCanvas(`assets/brand/brushes/${n}.png`, MK_BRUSHES[n].rot); }));
    MK_CACHE.assets = assets; MK_CACHE.fontCss = faces.join(''); MK_CACHE.tips = tips;
  })().finally(() => { MK_CACHE.loading = null; });
  await MK_CACHE.loading;
}
// Ponta do pincel: o cinza vira o canal alfa (tinta branca); 'rot' gira 90° para as cerdas ficarem na horizontal
async function mkTipCanvas(url, rot) {
  const img = await mkLoadImg(url), c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) { d.data[i + 3] = d.data[i]; d.data[i] = d.data[i + 1] = d.data[i + 2] = 255; }
  x.putImageData(d, 0, 0);
  if (!rot) return c;
  const r = document.createElement('canvas'); r.width = c.height; r.height = c.width;
  const rx = r.getContext('2d'); rx.translate(r.width / 2, r.height / 2); rx.rotate(-Math.PI / 2); rx.drawImage(c, -c.width / 2, -c.height / 2);
  return r;
}
// Carimba a ponta ao longo de um caminho; a pressão controla opacidade e tamanho de cada carimbo.
// path: [{x, y, p}] em px · th: espessura do traço em px · o: { alpha, gamma, seed, follow }
function mkStampPath(ctx, tip, path, th, o) {
  const tw = th * tip.width / tip.height, rnd = mkRng(o.seed || 1), spacing = Math.max(1.2, tw * (o.space || 0.1));
  ctx.save();
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1], d = Math.hypot(b.x - a.x, b.y - a.y), ang = o.follow ? Math.atan2(b.y - a.y, b.x - a.x) : 0;
    const steps = Math.max(1, Math.ceil(d / spacing));
    for (let s = 0; s < steps; s++) {
      const k = s / steps, p = a.p + (b.p - a.p) * k, x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k;
      const sz = th * (0.82 + 0.18 * p) * (0.97 + rnd() * 0.06), jy = (rnd() - 0.5) * th * 0.05, jr = (rnd() - 0.5) * 0.04;
      ctx.globalAlpha = mkStampAlpha(p, o.alpha || 0.4, o.gamma);
      ctx.save(); ctx.translate(x, y + jy); ctx.rotate(ang + jr);
      ctx.drawImage(tip, -sz * tip.width / tip.height / 2, -sz / 2, sz * tip.width / tip.height, sz); ctx.restore();
    }
  }
  ctx.restore();
}
// Curva de contraste no alfa acumulado: borda áspera de pincel seco, textura das cerdas visível e miolo cheio com pressão forte
function mkCrisp(ink, lo, hi) {
  const x = ink.getContext('2d'), d = x.getImageData(0, 0, ink.width, ink.height), px = d.data;
  for (let i = 3; i < px.length; i += 4) { const a = px[i] / 255, t = Math.min(1, Math.max(0, (a - lo) / (hi - lo))); px[i] = Math.round(255 * t * t * (3 - 2 * t)); }
  x.putImageData(d, 0, 0); return ink;
}
function mkTint(ink, color) {
  const c = document.createElement('canvas'); c.width = ink.width; c.height = ink.height;
  const x = c.getContext('2d'); x.fillStyle = mkCol(color); x.fillRect(0, 0, c.width, c.height);
  x.globalCompositeOperation = 'destination-in'; x.drawImage(ink, 0, 0); return c;
}
function mkBrushCanvas(el, wpx, hpx) {
  const b = MK_BRUSHES[el.brush] || MK_BRUSHES.seco, tip = MK_CACHE.tips[el.brush], ink = document.createElement('canvas');
  ink.width = wpx; ink.height = hpx; const x = ink.getContext('2d'), seed = el.seed || 1, tex = el.tex ?? b.tex ?? 0.55, rnd = mkRng(seed);
  if (b.mode === 'stroke') {
    const tw = hpx * tip.width / tip.height, pad = Math.min(tw / 2, wpx / 2), n = 40, path = [];
    for (let i = 0; i <= n; i++) path.push({ x: pad + (wpx - 2 * pad) * i / n, y: hpx / 2, p: mkPressureAt(i / n, seed, tex) });
    mkStampPath(x, tip, path, hpx, { alpha: 0.26, gamma: 1.35, seed, follow: false });
    mkCrisp(ink, 0.2, 0.72);
  } else if (b.mode === 'splat') {
    x.save(); x.translate(wpx / 2, hpx / 2); x.rotate(Math.floor(rnd() * 4) * Math.PI / 2 * 0 + (rnd() - 0.5) * 0.3); x.scale(rnd() > 0.5 ? 1 : -1, 1);
    x.globalAlpha = 0.55 + 0.45 * (1 - tex); x.drawImage(tip, -wpx / 2, -hpx / 2, wpx, hpx);
    x.globalAlpha = 0.5; x.drawImage(tip, -wpx * 0.5, -hpx * 0.5, wpx, hpx); x.restore();
  } else {
    const count = Math.round(wpx * hpx / 9000 * (0.6 + tex));
    for (let i = 0; i < count; i++) {
      const s = 14 + rnd() * 34, px = rnd() * wpx, py = rnd() * hpx;
      x.globalAlpha = 0.25 + rnd() * 0.5; x.save(); x.translate(px, py); x.rotate(rnd() * 6.28); x.drawImage(tip, -s / 2, -s / 2, s, s); x.restore();
    }
  }
  return mkTint(ink, el.color || 'red');
}
// Desenho livre com caneta: pts normalizados (0-1) dentro da caixa do elemento + pressão real da mesa
function mkPaintCanvas(el, wpx, hpx, f) {
  const tip = MK_CACHE.tips[el.brush || 'seco'], ink = document.createElement('canvas'); ink.width = wpx; ink.height = hpx;
  const x = ink.getContext('2d'), th = el.size * f.w / 100 * (wpx / (el.w * f.w / 100));
  const path = (el.pts || []).map(p => ({ x: p[0] * wpx, y: p[1] * hpx, p: p[2] }));
  if (path.length === 1) path.push({ ...path[0], x: path[0].x + 0.5 });
  mkStampPath(x, tip, path, th, { alpha: 0.26, gamma: 1.35, seed: el.seed || 1, follow: true });
  mkCrisp(ink, 0.2, 0.72);
  return mkTint(ink, el.color || 'red');
}
// Fotos: carrega, aplica duotone/contraste e devolve data URL (preview e PNG usam o mesmo resultado)
async function mkTreatImage(rawUrl, treat) {
  const t = treat ? { ...mkTreatDefault(), ...treat } : null;
  if (!t || (!t.duo && t.con === 1 && t.bri === 0)) return rawUrl;
  const img = await mkLoadImg(rawUrl), k = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  const x = c.getContext('2d'); x.drawImage(img, 0, 0, c.width, c.height);
  const d = x.getImageData(0, 0, c.width, c.height);
  mkDuotonePixels(d.data, mkRgb(t.a), mkRgb(t.b), t.amt, t.con, t.bri, t.duo); x.putImageData(d, 0, 0);
  return c.toDataURL('image/jpeg', 0.92);
}
// Tudo que a arte precisa antes de desenhar: fotos tratadas, pinceladas e desenhos (resolve(ref) busca a foto original)
async function mkEnsure(slides, strip, sv, fmtKey, resolve) {
  await mkLoadBrand();
  const f = MK_FORMATS[fmtKey] || MK_FORMATS.feed, jobs = new Map();
  const visit = (els, v) => {
    for (const e of els) {
      if (e.hid) continue;
      if (e.type === 'image' && v[e.slot]) { const k = mkImgKey(e, v[e.slot]); if (!MK_BMP.has(k)) jobs.set(k, async () => mkTreatImage(await resolve(v[e.slot]), e.treat)); }
      else if (e.type === 'brush') { const k = mkBrushKey(e, f); if (!MK_BMP.has(k)) jobs.set(k, async () => { const [, , qw, qh] = k.split('|'); return mkBrushCanvas(e, +qw, +qh).toDataURL('image/png'); }); }
      else if (e.type === 'paint' && e.pts && e.pts.length) { const k = mkPaintKey(e, f); if (!MK_BMP.has(k)) jobs.set(k, async () => { const [, , , , , , qw, qh] = k.split('|'); return mkPaintCanvas(e, +qw, +qh, f).toDataURL('image/png'); }); }
    }
  };
  visit(strip || [], sv || {});
  for (const s of slides) visit(s.e || [], s.v || {});
  await Promise.all([...jobs].map(async ([k, make]) => { try { MK_BMP.set(k, await make()); } catch { MK_BMP.set(k, ''); } }));
  return jobs.size;
}
const mkCtx = () => ({ assets: MK_CACHE.assets || {} });
// HTML da arte → PNG (sem bibliotecas): SVG com foreignObject e fontes embutidas em base64.
async function mkRasterize(artHtml, w, h) {
  await mkLoadBrand();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><foreignObject x="0" y="0" width="${w}" height="${h}">`
    + `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;overflow:hidden"><style>${MK_CACHE.fontCss}</style>${artHtml}</div></foreignObject></svg>`;
  const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('Não foi possível gerar a imagem.')), 'image/png'));
}
async function mkDownscaleBase64(blob, max = 1024) {
  const bmp = await createImageBitmap(blob), k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/png').split(',')[1];
}
async function mkPrepareUpload(file, max = 1600) {
  const bmp = await createImageBitmap(file), k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('Imagem inválida.')), 'image/jpeg', 0.9));
}

if (typeof module !== 'undefined') module.exports = { MK_FORMATS, MK_FONTS, MK_LOGOS, MK_BRUSHES, MK_COLORS, mkEstimate, mkBrl, mkRange, mkTok, mkLines, mkFitSize, mkSlideHtml, mkValidate, mkNewSlide, mkApplyLayout, mkDefaults,
  mkPos, mkRectU, mkSetRectU, mkPressureAt, mkStampAlpha, mkSimplify, mkDuotonePixels, mkRgb, mkLum, mkIsDark, mkClone, mkImgKey, mkBrushKey, mkTreatDefault, MK_BMP };
