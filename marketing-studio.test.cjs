const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const ctx = vm.createContext({ module: { exports: {} } });
vm.runInContext(fs.readFileSync(__dirname + '/js/marketing-studio-core.js', 'utf8'), ctx);
const M = ctx.module.exports;
const pricing = { text: { input: 0.3, output: 2.5 }, image: { unit: 0.039 }, video: { unit: 0.15 } };

test('cada template tem slots e renderiza nos formatos aceitos sem sobras de marcação', () => {
  assert.ok(M.MK_TEMPLATES.length >= 5);
  for (const tpl of M.MK_TEMPLATES) {
    assert.ok(tpl.formats.length && tpl.formats.every(f => M.MK_FORMATS[f]), tpl.id);
    for (const f of tpl.formats) {
      const html = M.mkRenderArt(tpl, M.mkEmptySlide(tpl), f, { assets: { 'selo-branco': 'data:image/png;base64,AA', 'selo-azul': 'data:image/png;base64,AA', 'assinatura-azul': 'data:image/png;base64,AA' }, images: {} });
      assert.match(html, new RegExp(`width:${M.MK_FORMATS[f].w}px;height:${M.MK_FORMATS[f].h}px`), `${tpl.id}/${f}`);
      assert.ok(!/undefined|NaN|\[object/.test(html), `${tpl.id}/${f} contém valor inválido`);
      assert.ok(!/<(img|br)(?![^>]*\/>)[^>]*>/.test(html), `${tpl.id}/${f}: tag não fechada (precisa ser XHTML)`);
    }
  }
});

test('elemento oculto some da arte, cor e tamanho por elemento são aplicados e texto é escapado', () => {
  const tpl = M.mkTemplate('destaque'), slide = { ...M.mkEmptySlide(tpl), title: 'Vôlei <b>&</b>', _s: { kicker: { hidden: true }, subtitle: { color: 'red', scale: 0.8 } } };
  const html = M.mkRenderArt(tpl, slide, 'feed', { assets: {}, images: {} });
  assert.ok(!html.includes('data-slot="kicker"'));
  assert.match(html, /data-slot="subtitle"[^>]*color:#ee4036/);
  assert.ok(html.includes('Vôlei &lt;b&gt;&amp;&lt;/b&gt;'));
});

test('texto longo diminui até caber e nunca passa do limite de linhas estimado', () => {
  const long = 'Venha jogar na Apollo neste sábado com a gente e traga um amigo';
  const small = M.mkFitSize(long, 130, 900, 3, 0.5);
  assert.ok(small < 130 && small >= 130 * 0.4);
  assert.ok(M.mkLines(long, 900, small, 0.5) <= 3);
  assert.equal(M.mkFitSize('Oi', 130, 900, 3, 0.5), 130);
});

test('validação aponta texto acima do limite e imagem ausente', () => {
  const tpl = M.mkTemplate('destaque'), slide = { ...M.mkEmptySlide(tpl), title: 'x'.repeat(60) };
  const issues = M.mkValidate(tpl, slide);
  assert.ok(issues.some(i => /Título/.test(i)) && issues.some(i => /Foto de fundo/.test(i)));
  assert.ok(!M.mkValidate(tpl, { ...M.mkEmptySlide(tpl), _s: { photo: { hidden: true } } }).length);
});

test('calculadora: texto por tokens, imagem e vídeo por unidade, em reais', () => {
  const e = M.mkEstimate({ copies: [{ briefChars: 320, slots: [28, 42, 110] }], images: 2, reviews: 1, videoSeconds: 6 }, pricing, 5.5);
  const byLabel = Object.fromEntries(e.lines.map(l => [l.label, l]));
  const img = byLabel['Imagens (Gemini)'], vid = byLabel['Vídeo (Veo)'];
  assert.ok(Math.abs(img.usdMax - 0.078) < 1e-9 && img.usdMin === img.usdMax);
  assert.ok(Math.abs(vid.usdMax - 0.9) < 1e-9);
  assert.ok(Math.abs(vid.brlMax - 0.9 * 5.5) < 1e-9);
  const copy = byLabel['Textos (Gemini)'];
  assert.equal(copy.tokens.input, 220 + M.mkTok(320) + 45 * 3);
  assert.ok(copy.usdMax > copy.usdMin && copy.usdMin > 0);
  assert.ok(Math.abs(e.usdMax - (img.usdMax + vid.usdMax + copy.usdMax + byLabel['Revisão da arte (Gemini visão)'].usdMax)) < 1e-9);
  assert.equal(M.mkEstimate({}, pricing, 5.5).lines.length, 0);
});

test('formatação de reais', () => {
  assert.equal(M.mkBrl(0), 'R$ 0,00');
  assert.equal(M.mkBrl(0.004), '< R$ 0,01');
  assert.match(M.mkBrl(12.5), /^R\$\s12,50$/);
  assert.equal(M.mkRange(0.5, 0.5), M.mkBrl(0.5));
});
