const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const ctx = vm.createContext({ module: { exports: {} } });
vm.runInContext(fs.readFileSync(__dirname + '/js/marketing-studio-core.js', 'utf8'), ctx);
const C = ctx.module.exports;
vm.runInContext(fs.readFileSync(__dirname + '/js/marketing-layouts.js', 'utf8'), ctx);
const L = ctx.module.exports;
const pricing = { text: { input: 0.3, output: 2.5 }, image: { unit: 0.039 }, video: { unit: 0.15 } };
const assets = Object.fromEntries(Object.keys(C.MK_LOGOS).map(k => [k, 'data:image/png;base64,' + k]));
const render = (slide, fmt, i = 0, n = 1, strip = [], sv = {}) => C.mkSlideHtml(slide, fmt, { assets }, i, n, strip, sv);
const withPhoto = (slide, lay) => { for (const e of slide.e) if (e.type === 'image') { slide.v[e.slot] = 'x'; C.MK_BMP.set(C.mkImgKey(e, 'x'), 'data:image/jpeg;base64,AA'); } return slide; };

test('todo layout renderiza nos formatos aceitos, em XHTML válido e sem valores soltos', () => {
  assert.ok(L.MK_LAYOUTS.length >= 9);
  for (const lay of L.MK_LAYOUTS) {
    assert.ok(lay.formats.length && lay.formats.every(f => C.MK_FORMATS[f]), lay.id);
    for (const f of lay.formats) {
      const html = render(withPhoto(C.mkNewSlide(lay)), f);
      assert.match(html, new RegExp(`width:${C.MK_FORMATS[f].w}px;height:${C.MK_FORMATS[f].h}px`), `${lay.id}/${f}`);
      assert.ok(!/undefined|NaN|\[object/.test(html), `${lay.id}/${f} contém valor inválido`);
      assert.ok(!/<(img|br)(?![^>]*\/>)[^>]*>/.test(html), `${lay.id}/${f}: tag não fechada (precisa ser XHTML)`);
    }
  }
});

test('logo automática: assinatura branca em fundo escuro e azul em fundo claro; só as logos escolhidas existem', () => {
  assert.deepEqual(Object.keys(C.MK_LOGOS).sort(), ['assinatura-azul', 'assinatura-branca', 'assinatura-cinza', 'assinatura-vermelha', 'selo-azul', 'selo-contorno', 'selo-contorno-vermelho']);
  const dark = render(C.mkNewSlide(L.mkBaseLayout('numero')), 'feed'), light = render(C.mkNewSlide(L.mkBaseLayout('comunicado')), 'feed');
  assert.ok(dark.includes('base64,assinatura-branca') && !dark.includes('base64,assinatura-azul'));
  assert.ok(light.includes('base64,assinatura-azul') && !light.includes('base64,assinatura-branca'));
  const slide = C.mkNewSlide(L.mkBaseLayout('numero')); slide.e.find(e => e.type === 'logo').variant = 'selo-contorno';
  assert.ok(render(slide, 'feed').includes('base64,selo-contorno'));
});

test('elemento oculto some, estilo por elemento é aplicado e texto é escapado', () => {
  const slide = C.mkNewSlide(L.mkBaseLayout('destaque'));
  slide.v.title = 'Vôlei <b>&</b>'; slide.e.find(e => e.id === 'kicker').hid = true; slide.e.find(e => e.id === 'subtitle').st.color = 'navy';
  const html = render(slide, 'feed');
  assert.ok(!html.includes('data-el="kicker"') && html.includes('Vôlei &lt;b&gt;&amp;&lt;/b&gt;'));
  assert.match(html, /data-el="subtitle"[^>]*color:#0f1332/);
});

test('geometria: mover e redimensionar preserva a âncora (topo/base em u ou %) e a ida e volta é exata', () => {
  const f = C.MK_FORMATS.feed, Hu = f.h / f.w * 100;
  for (const base of [{ t: 10 }, { tp: 20 }, { b: 12 }, { bp: 8 }]) {
    const el = { x: 7, w: 40, h: 10, ...base }, r = C.mkRectU(el, f), keys = Object.keys(base)[0];
    r.x += 5; r.y += 3; r.w += 4; r.h += 2; C.mkSetRectU(el, f, r);
    assert.ok(el[keys] != null && Object.keys(el).filter(k => ['t', 'tp', 'b', 'bp'].includes(k)).length === 1, 'âncora preservada');
    const r2 = C.mkRectU(el, f);
    assert.ok(Math.abs(r2.x - r.x) < 0.11 && Math.abs(r2.y - r.y) < 0.11 && Math.abs(r2.w - r.w) < 0.11 && Math.abs(r2.h - r.h) < 0.11, JSON.stringify(base));
  }
  assert.ok(Math.abs(Hu - 125) < 0.001);
});

test('pressão: sem textura é sólida; com textura varia, entra e levanta no fim; opacidade cresce com a pressão', () => {
  const solid = Array.from({ length: 21 }, (_, i) => C.mkPressureAt(i / 20, 5, 0));
  assert.ok(solid[10] > 0.95);
  const tex = Array.from({ length: 41 }, (_, i) => C.mkPressureAt(i / 40, 5, 0.8)), min = Math.min(...tex), max = Math.max(...tex);
  assert.ok(max - min > 0.25, 'a pressão precisa variar para a textura aparecer');
  const soft = [0, 0.5, 1].map(t => C.mkPressureAt(t, 5, 0.1)); assert.ok(soft[0] < soft[1] && soft[2] < soft[1], 'entra e levanta no fim');
  assert.ok(C.mkStampAlpha(0.2, 0.26) < C.mkStampAlpha(0.5, 0.26) && C.mkStampAlpha(0.5, 0.26) < C.mkStampAlpha(1, 0.26));
  assert.equal(C.mkPressureAt(0.3, 9, 0.6), C.mkPressureAt(0.3, 9, 0.6), 'determinístico: o mesmo desenho renderiza igual sempre');
  assert.equal(C.mkSimplify([[0, 0, 1], [0.1, 0, 1], [5, 0, 1], [5.2, 0, 1], [9, 0, 1]], 1).length, 3);
});

test('duotone usa só as cores da paleta: preto vira sombra, branco vira luz, intensidade 0 mantém a foto', () => {
  const navy = C.mkRgb('navy'), red = C.mkRgb('red');
  const px = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
  C.mkDuotonePixels(px, navy, red, 1, 1, 0, true);
  assert.equal(JSON.stringify([...px.slice(0, 3)]), JSON.stringify(navy)); assert.equal(JSON.stringify([...px.slice(4, 7)]), JSON.stringify(red));
  const keep = new Uint8ClampedArray([10, 20, 30, 255]); C.mkDuotonePixels(keep, navy, red, 0, 1, 0, true);
  assert.equal(JSON.stringify([...keep.slice(0, 3)]), '[10,20,30]');
});

test('carrossel: elemento contínuo atravessa as lâminas deslocado de 100u por lâmina', () => {
  const slide = C.mkNewSlide(L.mkBaseLayout('conteudo')), strip = L.MK_STRIP_PRESETS.pincelada.build(3);
  C.MK_BMP.set(C.mkBrushKey(strip[0], C.MK_FORMATS.carousel), 'data:image/png;base64,AA');
  const left = i => Number(render(slide, 'carousel', i, 3, strip).match(new RegExp(`data-el="${strip[0].id}"[^>]*left:(-?[\\d.]+)px`))[1]);
  assert.ok(Math.abs((left(0) - left(1)) - 1080) < 0.01 && Math.abs((left(1) - left(2)) - 1080) < 0.01);
});

test('trocar o layout mantém o que já foi escrito nos campos de mesmo nome', () => {
  const slide = C.mkNewSlide(L.mkBaseLayout('destaque')); slide.v.title = 'Meu título'; slide.v.photo = 'storage:uploads/a.jpg';
  const next = C.mkApplyLayout(slide, L.mkBaseLayout('conteudo'));
  assert.equal(next.l, 'conteudo'); assert.equal(next.v.title, 'Meu título'); assert.equal(next.v.photo, 'storage:uploads/a.jpg');
  assert.ok(next.e !== L.mkBaseLayout('conteudo').els, 'a lâmina tem a própria cópia dos elementos');
});

test('validação aponta texto acima do limite e foto obrigatória ausente', () => {
  const slide = C.mkNewSlide(L.mkBaseLayout('pessoa')); slide.v.name = 'x'.repeat(60);
  const issues = C.mkValidate(slide);
  assert.ok(issues.some(i => /Nome/.test(i)) && issues.some(i => /sem imagem/.test(i)));
});

test('calculadora: texto por tokens, imagem e vídeo por unidade, em reais', () => {
  const e = C.mkEstimate({ copies: [{ briefChars: 320, slots: [28, 42, 110] }], images: 2, reviews: 1, videoSeconds: 6 }, pricing, 5.5);
  const by = Object.fromEntries(e.lines.map(l => [l.label, l])), img = by['Imagens (Gemini)'], vid = by['Vídeo (Veo)'], copy = by['Textos (Gemini)'];
  assert.ok(Math.abs(img.usdMax - 0.078) < 1e-9 && img.usdMin === img.usdMax);
  assert.ok(Math.abs(vid.usdMax - 0.9) < 1e-9 && Math.abs(vid.brlMax - 0.9 * 5.5) < 1e-9);
  assert.equal(copy.tokens.input, 220 + C.mkTok(320) + 45 * 3);
  assert.ok(copy.usdMax > copy.usdMin && copy.usdMin > 0);
  assert.equal(C.mkEstimate({}, pricing, 5.5).lines.length, 0);
  assert.equal(C.mkBrl(0.004), '< R$ 0,01'); assert.equal(C.mkRange(0.5, 0.5), C.mkBrl(0.5));
});

test('degradê usa uma só cor da paleta indo até transparente; texto vazado usa contorno', () => {
  const slide = C.mkNewSlide(L.mkBaseLayout('destaque')), html = render(slide, 'feed');
  assert.match(html, /data-el="fade"[^>]*linear-gradient\(to top,rgba\(15,19,50,1\) 0%,rgba\(15,19,50,1\) 18%,rgba\(15,19,50,0\) 100%\)/);
  const echo = render(C.mkNewSlide(L.mkBaseLayout('peneira')), 'feed');
  assert.match(echo, /data-el="echo"[^>]*color:transparent;-webkit-text-stroke:[\d.]+px #ffffff/);
});

test('foto vazia: espaço reservado só no editor, nunca na exportação', () => {
  const slide = C.mkNewSlide(L.mkBaseLayout('destaque'));
  assert.ok(!C.mkSlideHtml(slide, 'feed', { assets }).includes('Arraste uma foto aqui'));
  assert.ok(C.mkSlideHtml(slide, 'feed', { assets, ph: true }).includes('Arraste uma foto aqui'));
});

test('fundo contínuo marcado como frente fica por cima dos elementos da lâmina', () => {
  const slide = C.mkNewSlide(L.mkBaseLayout('conteudo')), strip = L.MK_STRIP_PRESETS.linha.build(2);
  const html = render(slide, 'carousel', 0, 2, strip);
  assert.ok(html.indexOf('data-el="sp-line"') > html.indexOf('data-el="body"'), 'na frente');
  const back = render(slide, 'carousel', 0, 2, strip.map(e => ({ ...e, front: false })));
  assert.ok(back.indexOf('data-el="sp-line"') < back.indexOf('data-el="body"'), 'atrás');
});

test('biblioteca: layout em branco e textos prontos renderizam com a marca', () => {
  assert.equal(L.mkBaseLayout('branco').id, 'branco');
  const slide = C.mkNewSlide(L.MK_BLANK);
  for (const p of L.MK_TEXT_PRESETS) { slide.e.push({ id: 'p_' + p.k, type: 'text', slot: 'p_' + p.k, x: 6, w: p.el.w, t: 10, lines: p.el.lines, inl: p.el.inl, st: p.el.st }); slide.v['p_' + p.k] = p.def; }
  const html = render(slide, 'story');
  for (const p of L.MK_TEXT_PRESETS) assert.ok(html.includes(`data-el="p_${p.k}"`), p.k);
  assert.ok(!/undefined|NaN/.test(html));
});

test('portfólio de layouts: ids únicos, categoria válida, campos únicos por layout e textos de exemplo dentro do limite', () => {
  const ids = L.MK_LAYOUTS.map(l => l.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const original of ['destaque', 'resultado', 'comunicado', 'atleta', 'foto', 'numero']) assert.ok(ids.includes(original), `layout original ${original} preservado`);
  assert.ok(L.MK_LAYOUTS.length >= 25);
  for (const lay of L.MK_LAYOUTS) {
    assert.ok(L.mkCats.includes(lay.cat), `${lay.id}: categoria`);
    const slots = lay.els.filter(e => e.slot).map(e => e.slot), elIds = lay.els.map(e => e.id);
    assert.equal(new Set(slots).size, slots.length, `${lay.id}: campos repetidos`);
    assert.equal(new Set(elIds).size, elIds.length, `${lay.id}: elementos com id repetido`);
    for (const e of lay.els) if (e.type === 'text') assert.ok(!e.max || String(e.def).length <= e.max, `${lay.id}/${e.id}: exemplo maior que o limite`);
  }
});
