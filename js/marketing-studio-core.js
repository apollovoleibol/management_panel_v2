/* Estúdio de peças · núcleo: kit da marca, formatos, templates HTML, calculadora de custo e exportação em PNG.
   Sem dependência do painel (funciona em teste com vm). A IA nunca desenha texto, logo ou layout:
   tudo isso vem destes templates; a IA só preenche textos e gera imagens de fundo. */
'use strict';

const MK_COLORS = { navy: '#0f1332', red: '#ee4036', white: '#ffffff', gray: '#808083' };
const MK_COLOR_NAMES = { navy: 'Azul', red: 'Vermelho', white: 'Branco', gray: 'Cinza' };
const MK_FORMATS = {
  feed: { label: 'Feed 4:5', w: 1080, h: 1350 },
  story: { label: 'Stories/Reels 9:16', w: 1080, h: 1920 },
  square: { label: 'Quadrado 1:1', w: 1080, h: 1080 },
  carousel: { label: 'Carrossel 4:5', w: 1080, h: 1350 },
};
const MK_FONTS = {
  block: "'Infield Block','Arial Black',Arial,sans-serif",
  text: "'Gridnik','Arial',sans-serif",
};
const MK_FONT_FILES = [
  ['Infield Block', 'Infield-Block', 400], ['Gridnik', 'Gridnik-Light', 300], ['Gridnik', 'Gridnik-Regular', 400],
  ['Gridnik', 'Gridnik-Medium', 500], ['Gridnik', 'Gridnik-Bold', 700], ['Gridnik', 'Gridnik-ExtraBold', 800],
];
const MK_ASSET_FILES = ['logo-azul', 'logo-branco', 'logo-vermelho', 'selo-azul', 'selo-branco', 'selo-vermelho', 'selo-contorno',
  'assinatura-azul', 'assinatura-branca', 'assinatura-vermelha'];

/* ─── Texto: quebra de linha estimada para o texto sempre caber na caixa ─── */
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

/* ─── Elementos dos templates (XHTML válido, para virar imagem sem perda) ─── */
const mkEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mkBr = s => mkEsc(s).replace(/\n/g, '<br/>');
const mkOv = (v, slot) => (v && v._s && v._s[slot]) || {};
const mkAsset = (v, name) => (v && v._a && v._a[name]) || '';
const mkImg = (v, slot) => (v && v._i && v._i[slot]) || '';

// Texto editável. o: fs (px), font, w (peso), color, lh, ls, tt, align, fit {w, lines, cw}, style
function mkT(v, slot, o, text) {
  const ov = mkOv(v, slot);
  if (ov.hidden || !String(text ?? '').trim()) return '';
  const color = MK_COLORS[ov.color] || MK_COLORS[o.color] || o.color || '#ffffff';
  let fs = o.fs * (ov.scale || 1);
  if (o.fit) fs = Math.min(fs, mkFitSize(text, fs, o.fit.w, o.fit.lines, o.fit.cw || 0.56));
  const css = `margin:0;font-family:${MK_FONTS[o.font || 'text']};font-weight:${o.w || 400};font-size:${fs}px;line-height:${o.lh || 1.15};`
    + `color:${color};${o.ls ? `letter-spacing:${o.ls}px;` : ''}${o.tt ? `text-transform:${o.tt};` : ''}${o.align ? `text-align:${o.align};` : ''}${o.style || ''}`;
  return `<div data-slot="${slot}" style="${css}">${mkBr(text)}</div>`;
}
function mkLogo(v, slot, asset, size, style) {
  const ov = mkOv(v, slot);
  if (ov.hidden) return '';
  const src = mkAsset(v, { navy: 'selo-azul', red: 'selo-vermelho', white: 'selo-branco' }[ov.color] || asset);
  return src ? `<img data-slot="${slot}" src="${src}" alt="Apollo Voleibol" style="display:block;width:${size}px;height:auto;${style || ''}"/>` : '';
}
function mkPhoto(v, slot, style, overlay) {
  const src = mkImg(v, slot);
  if (mkOv(v, slot).hidden || !src) return '';
  return `<div data-slot="${slot}" style="position:absolute;left:0;top:0;right:0;bottom:0;background-image:url(${src});background-size:cover;background-position:center;${style || ''}"></div>`
    + (overlay ? `<div style="position:absolute;left:0;top:0;right:0;bottom:0;background:${overlay}"></div>` : '');
}
function mkRoot(f, bg, inner) {
  return `<div style="position:relative;overflow:hidden;width:${f.w}px;height:${f.h}px;background:${bg};font-family:${MK_FONTS.text};color:#ffffff">${inner}</div>`;
}
const mkFrame = (inner, p, extra) => `<div style="position:absolute;left:0;top:0;right:0;bottom:0;padding:${p}px;display:flex;flex-direction:column;${extra || ''}">${inner}</div>`;
const mkBar = (u, color, w) => `<div style="width:${w * u}px;height:${1.1 * u}px;background:${color};margin:${2.4 * u}px 0"></div>`;

/* ─── Templates ─── */
// slots: label, type (text|long|image|logo), max (caracteres, usado pela IA e pela validação), def (exemplo)
const MK_TEMPLATES = [
  {
    id: 'destaque', name: 'Anúncio de destaque', hint: 'Peneira, aulão, evento. Foto de fundo opcional.', formats: ['feed', 'story', 'square', 'carousel'],
    slots: {
      kicker: { label: 'Chamada', type: 'text', max: 28, def: 'Peneira aberta' },
      title: { label: 'Título', type: 'text', max: 42, def: 'Venha jogar na Apollo' },
      subtitle: { label: 'Subtítulo', type: 'long', max: 110, def: 'Treinos para todas as idades, com técnicos experientes.' },
      date: { label: 'Data e horário', type: 'text', max: 30, def: 'Sábado · 08/11 · 15h' },
      place: { label: 'Local', type: 'text', max: 52, def: 'Ginásio Apollo' },
      cta: { label: 'Chamada para ação', type: 'text', max: 34, def: 'Agende pelo WhatsApp' },
      photo: { label: 'Foto de fundo', type: 'image' },
      logo: { label: 'Selo da marca', type: 'logo' },
    },
    render(v, f) {
      const u = f.w / 100, p = 7 * u, tall = f.h / f.w > 1.4, inner = f.w - 2 * p;
      const top = `<div style="display:flex;justify-content:space-between;align-items:flex-start">`
        + `<div>${mkT(v, 'kicker', { fs: 3 * u, font: 'text', w: 800, color: 'white', tt: 'uppercase', ls: 0.4 * u, style: `background:${MK_COLORS.red};padding:${1.1 * u}px ${2.2 * u}px;display:inline-block;` }, v.kicker)}</div>`
        + `${mkLogo(v, 'logo', 'selo-branco', 15 * u)}</div>`;
      const mid = `<div>${mkT(v, 'title', { fs: (tall ? 14 : 12) * u, font: 'block', w: 400, color: 'white', lh: 0.96, tt: 'uppercase', fit: { w: inner, lines: tall ? 5 : 4, cw: 0.5 } }, v.title)}`
        + `${(v.title || v.subtitle) && !mkOv(v, 'title').hidden ? mkBar(u, MK_COLORS.red, 12) : ''}`
        + `${mkT(v, 'subtitle', { fs: 3.7 * u, w: 500, color: 'white', lh: 1.3, style: 'opacity:.92;max-width:84%;', fit: { w: inner * 0.84, lines: 4, cw: 0.55 } }, v.subtitle)}</div>`;
      const bottom = `<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:${3 * u}px"><div style="flex:1;min-width:0">`
        + `${mkT(v, 'date', { fs: 4.6 * u, w: 800, color: 'white', lh: 1.15, fit: { w: inner * 0.5, lines: 1, cw: 0.7 } }, v.date)}`
        + `${mkT(v, 'place', { fs: 3.2 * u, w: 400, color: 'white', lh: 1.25, style: 'opacity:.82;margin-top:' + 0.8 * u + 'px;', fit: { w: inner * 0.5, lines: 2, cw: 0.62 } }, v.place)}</div>`
        + `${mkT(v, 'cta', { fs: 3.3 * u, w: 700, color: 'white', lh: 1.1, style: `background:${MK_COLORS.red};padding:${2 * u}px ${3.4 * u}px;border-radius:${6 * u}px;text-align:center;white-space:nowrap;flex-shrink:0;` }, v.cta)}</div>`;
      return mkRoot(f, MK_COLORS.navy, mkPhoto(v, 'photo', '', 'rgba(15,19,50,0.68)') + mkFrame(top + mid + bottom, p, 'justify-content:space-between;'));
    },
  },
  {
    id: 'resultado', name: 'Resultado de jogo', hint: 'Placar com as duas equipes.', formats: ['feed', 'story', 'square'],
    slots: {
      kicker: { label: 'Competição', type: 'text', max: 40, def: 'Campeonato Estadual · Rodada 3' },
      teamA: { label: 'Equipe A', type: 'text', max: 22, def: 'Apollo' },
      scoreA: { label: 'Sets A', type: 'text', max: 2, def: '3' },
      teamB: { label: 'Equipe B', type: 'text', max: 22, def: 'Adversário' },
      scoreB: { label: 'Sets B', type: 'text', max: 2, def: '1' },
      note: { label: 'Parciais / observação', type: 'long', max: 90, def: '25/20 · 22/25 · 25/18 · 25/21' },
      date: { label: 'Data e local', type: 'text', max: 48, def: '01/11 · Ginásio Apollo' },
      logo: { label: 'Selo da marca', type: 'logo' },
    },
    render(v, f) {
      const u = f.w / 100, p = 7 * u, inner = f.w - 2 * p;
      const team = (slot, name, align) => mkT(v, slot, { fs: 5.2 * u, font: 'text', w: 800, color: 'white', tt: 'uppercase', align, lh: 1.1, fit: { w: inner * 0.34, lines: 2, cw: 0.62 } }, name);
      const score = (slot, val, color) => mkT(v, slot, { fs: 30 * u, font: 'block', w: 400, color, lh: 0.9, align: 'center' }, val);
      const top = `<div style="display:flex;justify-content:space-between;align-items:flex-start"><div style="padding-top:${1 * u}px">${mkT(v, 'kicker', { fs: 3.1 * u, w: 800, color: 'white', tt: 'uppercase', ls: 0.4 * u, fit: { w: inner * 0.7, lines: 2, cw: 0.62 } }, v.kicker)}${mkBar(u, MK_COLORS.red, 12)}</div>${mkLogo(v, 'logo', 'selo-branco', 14 * u)}</div>`;
      const mid = `<div style="display:flex;align-items:center;justify-content:space-between"><div style="width:${inner * 0.34}px">${team('teamA', v.teamA, 'left')}</div>`
        + `<div style="display:flex;align-items:center;gap:${2.5 * u}px">${score('scoreA', v.scoreA, 'white')}<div style="font-family:${MK_FONTS.block};font-size:${9 * u}px;color:${MK_COLORS.red}">x</div>${score('scoreB', v.scoreB, 'white')}</div>`
        + `<div style="width:${inner * 0.34}px">${team('teamB', v.teamB, 'right')}</div></div>`;
      const bottom = `<div>${mkT(v, 'note', { fs: 3.4 * u, w: 500, color: 'white', lh: 1.3, style: 'opacity:.9;', fit: { w: inner, lines: 2, cw: 0.58 } }, v.note)}`
        + `${mkT(v, 'date', { fs: 3 * u, w: 400, color: 'white', lh: 1.3, style: `opacity:.72;margin-top:${1.2 * u}px;`, fit: { w: inner, lines: 1, cw: 0.58 } }, v.date)}</div>`;
      return mkRoot(f, MK_COLORS.navy, mkFrame(top + mid + bottom, p, 'justify-content:space-between;'));
    },
  },
  {
    id: 'comunicado', name: 'Comunicado', hint: 'Avisos, regras, informações longas. Fundo claro.', formats: ['feed', 'story', 'square', 'carousel'],
    slots: {
      kicker: { label: 'Chamada', type: 'text', max: 28, def: 'Comunicado' },
      title: { label: 'Título', type: 'text', max: 60, def: 'Treinos mudam de horário' },
      body: { label: 'Texto', type: 'long', max: 420, def: 'A partir da próxima semana, os treinos da Equipe Masculino passam a começar às 15h. Qualquer dúvida, fale com a nossa recepção.' },
      footer: { label: 'Rodapé', type: 'text', max: 48, def: 'Equipe Apollo Voleibol' },
      logo: { label: 'Selo da marca', type: 'logo' },
    },
    render(v, f) {
      const u = f.w / 100, p = 8 * u, inner = f.w - 2 * p, tall = f.h / f.w > 1.4;
      const sig = mkAsset(v, 'assinatura-azul');
      const top = `<div style="display:flex;justify-content:space-between;align-items:flex-start"><div>${mkT(v, 'kicker', { fs: 3 * u, w: 800, color: 'red', tt: 'uppercase', ls: 0.5 * u }, v.kicker)}</div>${mkLogo(v, 'logo', 'selo-azul', 13 * u)}</div>`;
      const mid = `<div>${mkT(v, 'title', { fs: 9 * u, font: 'block', color: 'navy', lh: 1, tt: 'uppercase', fit: { w: inner, lines: tall ? 4 : 3, cw: 0.5 } }, v.title)}${mkBar(u, MK_COLORS.red, 12)}`
        + `${mkT(v, 'body', { fs: 3.7 * u, w: 400, color: 'navy', lh: 1.4, fit: { w: inner, lines: tall ? 16 : 9, cw: 0.55 } }, v.body)}</div>`;
      const bottom = `<div style="display:flex;justify-content:space-between;align-items:flex-end">${mkT(v, 'footer', { fs: 3 * u, w: 500, color: 'gray', lh: 1.2 }, v.footer)}${sig ? `<img src="${sig}" alt="" style="display:block;width:${20 * u}px;height:auto"/>` : ''}</div>`;
      return mkRoot(f, '#f4f5f8', mkFrame(top + mid + bottom, p, 'justify-content:space-between;'));
    },
  },
  {
    id: 'atleta', name: 'Atleta em destaque', hint: 'Foto grande, nome e frase. Use só com autorização do responsável.', formats: ['feed', 'story', 'square'],
    slots: {
      photo: { label: 'Foto do atleta', type: 'image' },
      kicker: { label: 'Chamada', type: 'text', max: 28, def: 'Atleta do mês' },
      name: { label: 'Nome', type: 'text', max: 34, def: 'Nome do Atleta' },
      role: { label: 'Equipe / posição', type: 'text', max: 44, def: 'Equipe Feminino · Levantadora' },
      quote: { label: 'Frase', type: 'long', max: 140, def: 'Cada treino é um passo a mais rumo ao objetivo.' },
      logo: { label: 'Selo da marca', type: 'logo' },
    },
    render(v, f) {
      const u = f.w / 100, p = 7 * u, inner = f.w - 2 * p;
      const panelH = f.h * 0.38;
      const photo = mkImg(v, 'photo') && !mkOv(v, 'photo').hidden
        ? `<div data-slot="photo" style="position:absolute;left:0;top:0;right:0;height:${f.h - panelH + 2 * u}px;background-image:url(${mkImg(v, 'photo')});background-size:cover;background-position:center top"></div>`
        : `<div style="position:absolute;left:0;top:0;right:0;height:${f.h - panelH}px;background:#1b2048"></div>`;
      const panel = `<div style="position:absolute;left:0;right:0;bottom:0;height:${panelH}px;background:${MK_COLORS.navy};padding:${4.5 * u}px ${p}px;display:flex;flex-direction:column;justify-content:center">`
        + `${mkT(v, 'kicker', { fs: 2.9 * u, w: 800, color: 'red', tt: 'uppercase', ls: 0.5 * u }, v.kicker)}`
        + `${mkT(v, 'name', { fs: 9 * u, font: 'block', color: 'white', lh: 1, tt: 'uppercase', style: `margin-top:${1 * u}px;`, fit: { w: inner * 0.78, lines: 2, cw: 0.5 } }, v.name)}`
        + `${mkT(v, 'role', { fs: 3.3 * u, w: 700, color: 'white', lh: 1.2, style: `margin-top:${1.2 * u}px;opacity:.9;`, fit: { w: inner * 0.78, lines: 2, cw: 0.58 } }, v.role)}`
        + `${mkT(v, 'quote', { fs: 3.2 * u, w: 300, color: 'white', lh: 1.35, style: `margin-top:${2 * u}px;opacity:.85;max-width:78%;`, fit: { w: inner * 0.78, lines: 3, cw: 0.56 } }, v.quote)}</div>`;
      const logo = `<div style="position:absolute;right:${p}px;top:${p}px">${mkLogo(v, 'logo', 'selo-branco', 14 * u)}</div>`;
      return mkRoot(f, MK_COLORS.navy, photo + panel + logo);
    },
  },
  {
    id: 'foto', name: 'Foto com legenda', hint: 'Foto de treino ou jogo com uma frase curta.', formats: ['feed', 'story', 'square', 'carousel'],
    slots: {
      photo: { label: 'Foto', type: 'image' },
      title: { label: 'Título', type: 'text', max: 60, def: 'Treino é lugar de evoluir' },
      subtitle: { label: 'Subtítulo', type: 'text', max: 80, def: 'Equipe Apollo · Treino da semana' },
      logo: { label: 'Selo da marca', type: 'logo' },
    },
    render(v, f) {
      const u = f.w / 100, p = 7 * u, inner = f.w - 2 * p;
      const bandH = f.h * 0.22;
      const photo = mkPhoto(v, 'photo', '', null) || `<div style="position:absolute;left:0;top:0;right:0;bottom:0;background:#1b2048"></div>`;
      const band = `<div style="position:absolute;left:0;right:0;bottom:0;height:${bandH}px;background:${MK_COLORS.navy};padding:0 ${p}px;display:flex;flex-direction:column;justify-content:center">`
        + `${mkT(v, 'title', { fs: 7.4 * u, font: 'block', color: 'white', lh: 1, tt: 'uppercase', fit: { w: inner * 0.8, lines: 2, cw: 0.5 } }, v.title)}`
        + `${mkT(v, 'subtitle', { fs: 3.2 * u, w: 500, color: 'white', lh: 1.2, style: `margin-top:${1.6 * u}px;opacity:.85;`, fit: { w: inner * 0.8, lines: 2, cw: 0.58 } }, v.subtitle)}</div>`;
      const logo = `<div style="position:absolute;left:${p}px;top:${p}px">${mkLogo(v, 'logo', 'selo-branco', 14 * u)}</div>`;
      return mkRoot(f, MK_COLORS.navy, photo + band + logo);
    },
  },
  {
    id: 'numero', name: 'Número em destaque', hint: 'Um dado grande: atletas, anos, títulos.', formats: ['feed', 'story', 'square', 'carousel'],
    slots: {
      kicker: { label: 'Chamada', type: 'text', max: 30, def: 'Apollo em números' },
      number: { label: 'Número', type: 'text', max: 8, def: '200+' },
      text: { label: 'Texto', type: 'long', max: 120, def: 'atletas treinando em quadra todas as semanas.' },
      logo: { label: 'Selo da marca', type: 'logo' },
    },
    render(v, f) {
      const u = f.w / 100, p = 8 * u, inner = f.w - 2 * p;
      const top = `<div style="display:flex;justify-content:space-between;align-items:flex-start"><div>${mkT(v, 'kicker', { fs: 3 * u, w: 800, color: 'white', tt: 'uppercase', ls: 0.5 * u }, v.kicker)}</div>${mkLogo(v, 'logo', 'selo-branco', 13 * u)}</div>`;
      const mid = `<div>${mkT(v, 'number', { fs: 32 * u, font: 'block', color: 'white', lh: 0.9, fit: { w: inner, lines: 1, cw: 0.5 } }, v.number)}`
        + `${mkT(v, 'text', { fs: 5 * u, w: 700, color: 'white', lh: 1.25, style: `margin-top:${3 * u}px;max-width:80%;`, fit: { w: inner * 0.8, lines: 4, cw: 0.56 } }, v.text)}</div>`;
      return mkRoot(f, MK_COLORS.red, mkFrame(top + mid + `<div></div>`, p, 'justify-content:space-between;'));
    },
  },
];
const mkTemplate = id => MK_TEMPLATES.find(t => t.id === id) || MK_TEMPLATES[0];
const mkEmptySlide = tpl => Object.fromEntries(Object.entries(tpl.slots).filter(([, s]) => s.type === 'text' || s.type === 'long').map(([k, s]) => [k, s.def || '']));

// Valores ligados a arquivos/estilos (_i imagens resolvidas, _a assets, _s estilos por elemento) entram só na renderização.
function mkRenderArt(tpl, slide, formatKey, ctx) {
  const f = MK_FORMATS[formatKey] || MK_FORMATS.feed;
  const v = { ...slide, _a: ctx?.assets || {}, _i: ctx?.images || {}, _s: slide._s || {} };
  return tpl.render(v, f);
}
// Problemas que a revisão local detecta antes de gastar IA
function mkValidate(tpl, slide) {
  const out = [];
  for (const [k, s] of Object.entries(tpl.slots)) {
    const val = String(slide[k] ?? '');
    if ((s.type === 'text' || s.type === 'long') && s.max && val.length > s.max) out.push(`${s.label}: ${val.length} caracteres (máximo ${s.max}).`);
    if ((s.type === 'image') && !slide[k] && !(slide._s?.[k]?.hidden)) out.push(`${s.label}: sem imagem.`);
  }
  return out;
}

/* ─── Calculadora de custo ─── */
const mkTok = chars => Math.ceil(Number(chars || 0) / 3.2);
// plan: { copies:[{briefChars, slots:[maxChars...]}], images:n, reviews:n, videoSeconds:n }
// pricing: { text:{input, output}, image:{unit}, video:{unit} } em USD; usdBrl: cotação.
function mkEstimate(plan, pricing, usdBrl) {
  const lines = [];
  const t = pricing.text || { input: 0, output: 0 };
  const textUsd = (i, o) => (i * (t.input || 0) + o * (t.output || 0)) / 1e6;
  const add = (label, qty, min, max, tokens) => lines.push({ label, qty, usdMin: min, usdMax: max, brlMin: min * usdBrl, brlMax: max * usdBrl, tokens: tokens || null });
  const copies = plan.copies || [];
  if (copies.length) {
    let inT = 0, outMin = 0;
    for (const c of copies) {
      inT += 220 + mkTok(c.briefChars) + 45 * c.slots.length;
      outMin += c.slots.reduce((n, m) => n + mkTok(m) + 20, 0);
    }
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

/* ─── Arquivos da marca e exportação ─── */
const MK_CACHE = { assets: null, fontCss: null, loading: null };
const mkBlobToDataUrl = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
async function mkFetchDataUrl(url) { const r = await fetch(url); if (!r.ok) throw new Error('Arquivo da marca indisponível: ' + url); return mkBlobToDataUrl(await r.blob()); }
async function mkLoadBrand() {
  if (MK_CACHE.assets && MK_CACHE.fontCss) return;
  if (!MK_CACHE.loading) MK_CACHE.loading = (async () => {
    const assets = {};
    await Promise.all(MK_ASSET_FILES.map(async n => { assets[n] = await mkFetchDataUrl(`assets/brand/img/${n}.png`); }));
    const faces = await Promise.all(MK_FONT_FILES.map(async ([fam, file, w]) =>
      `@font-face{font-family:'${fam}';font-weight:${w};src:url(${await mkFetchDataUrl(`assets/brand/fonts/${file}.woff2`)}) format('woff2');}`));
    MK_CACHE.assets = assets; MK_CACHE.fontCss = faces.join('');
  })().finally(() => { MK_CACHE.loading = null; });
  await MK_CACHE.loading;
}
// HTML da arte → PNG (sem bibliotecas): SVG com foreignObject, fontes embutidas em base64.
async function mkRasterize(artHtml, w, h) {
  await mkLoadBrand();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><foreignObject x="0" y="0" width="${w}" height="${h}">`
    + `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;overflow:hidden"><style>${MK_CACHE.fontCss}</style>${artHtml}</div></foreignObject></svg>`;
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
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

if (typeof module !== 'undefined') module.exports = { MK_TEMPLATES, MK_FORMATS, mkEstimate, mkBrl, mkRange, mkTok, mkLines, mkFitSize, mkRenderArt, mkValidate, mkEmptySlide, mkTemplate };
