/* Estúdio de peças · layouts-base. Cada layout é uma lista de elementos editáveis (texto, foto, logo, forma, pincel).
   Posição: x e w em u (1u = 1% da largura); vertical t/b em u ou tp/bp em % da altura; h em u ou hp em % da altura.
   Conteúdo empilhado pela base (b) e cabeçalho pelo topo (t): o mesmo layout funciona no feed, no stories e no quadrado.
   Sistema visual: margem 6u, títulos em Infield Block, apoio em Gridnik, degradê azul sobre foto, pinceladas que sangram para fora. */
'use strict';

const MK_LAYOUT_DATA = (() => {
const ALL = ['feed', 'story', 'square', 'carousel'];
const M = 6;
const T = (id, label, def, max, pos, st, ex = {}) => ({ id, type: 'text', slot: id, label, def, max, ...pos, st, ...ex });
// Estilos de texto
const H = (fs, color = 'white', ex = {}) => ({ font: 'block', fs, color, caps: true, lh: 0.92, ...ex });
const K = (color = 'white', ex = {}) => ({ font: 'g700', fs: 2.6, color, caps: true, ls: 6, lh: 1.1, ...ex });
const B = (fs = 3.4, color = 'white', ex = {}) => ({ font: 'g500', fs, color, lh: 1.35, ...ex });
const I = (fs = 4.2, color = 'white', ex = {}) => ({ font: 'g800', fs, color, lh: 1.15, ...ex });
const PILL = (bgc = 'red', color = 'white', ex = {}) => ({ font: 'g800', fs: 2.8, color, bgc, pad: 2.2, caps: true, ls: 4, lh: 1.1, ...ex });
const ECHO = (fs, color = 'white', op = 0.4) => ({ font: 'block', fs, color, caps: true, lh: 0.9, outline: true, sw: 0.22, op });
// Fotos e tratamentos (duotone só com cores da paleta)
const TR = (ex = {}) => ({ fit: 'cover', duo: false, a: 'navy', b: 'white', amt: 1, con: 1.06, bri: 0, scrim: 0, scrimC: 'navy', z: 1, fx: 50, fy: 40, ...ex });
const DUO = (ex = {}) => TR({ duo: true, con: 1.22, bri: 0.02, ...ex });
const PHOTO = (treat = DUO(), ex = {}) => ({ id: 'photo', type: 'image', slot: 'photo', label: 'Foto', full: true, x: 0, w: 100, tp: 0, hp: 100, treat, ...ex });
const IMG = (id, label, pos, treat = TR(), ex = {}) => ({ id, type: 'image', slot: id, label, ...pos, treat, ...ex });
// Formas e marca
const FADE = (hp = 65, color = 'navy', ex = {}) => ({ id: 'fade', type: 'shape', shape: 'rect', fill: color, fade: 'up', solid: 18, x: 0, w: 100, bp: 0, hp, label: 'Degradê', ...ex });
const RECT = (id, fill, pos, ex = {}) => ({ id, type: 'shape', shape: 'rect', fill, ...pos, ...ex });
const LINE = (id, pos, color = 'white', op = 0.28) => RECT(id, color, { h: 0.22, ...pos }, { op, label: 'Linha' });
const LOGO = (pos = { x: 73, w: 21, t: 6 }, variant = 'auto') => ({ id: 'logo', type: 'logo', variant, ...pos });
const BRUSH = (id, pos, color = 'red', seed = 3, ex = {}) => ({ id, type: 'brush', brush: 'seco', color, seed, tex: 0.55, ...pos, ...ex });
const KICKER = (def, color = 'white', bar = 'red', t = 6.2) => [RECT('kbar', bar, { x: M, w: 5, h: 0.8, t: t + 1.25 }, { label: 'Marcador' }), T('kicker', 'Chamada', def, 30, { x: M + 7.5, w: 60, t }, K(color), { lines: 1 })];
const KPILL = (def, bgc = 'red', color = 'white', t = 6) => T('kicker', 'Chamada', def, 30, { x: M, w: 60, t }, PILL(bgc, color), { inl: true, lines: 1 });

const MK_LAYOUTS = [
  /* ── Chamadas e anúncios ── */
  { id: 'destaque', cat: 'Chamadas e anúncios', name: 'Anúncio de destaque', hint: 'Peneira, aulão, evento: foto com degradê e título grande.', formats: ALL, bg: 'navy', els: [
    PHOTO(TR({ con: 1.1 })), FADE(72),
    KPILL('Peneira aberta'), LOGO(),
    T('title', 'Título', 'Venha jogar na Apollo', 42, { x: M, w: 88, b: 37 }, H(13.5), { lines: 3 }),
    T('subtitle', 'Subtítulo', 'Treinos para todas as idades, com técnicos experientes.', 110, { x: M, w: 74, b: 25 }, B(3.5, 'white', { op: 0.92 }), { lines: 2 }),
    LINE('line', { x: M, w: 88, b: 19.5 }),
    T('date', 'Data e horário', 'Sáb · 08/11 · 15h', 30, { x: M, w: 52, b: 11 }, I(4.3), { lines: 1 }),
    T('place', 'Local', 'Ginásio Apollo', 52, { x: M, w: 52, b: 6.5 }, B(3, 'white', { op: 0.78 }), { lines: 1 }),
    T('cta', 'Chamada para ação', 'Agende pelo WhatsApp', 34, { x: 60, w: 34, b: 7 }, PILL('red', 'white', { align: 'center', ls: 2, fs: 2.7, lh: 1.25 }), { lines: 2 }),
  ] },
  { id: 'nova-turma', cat: 'Chamadas e anúncios', name: 'Nova turma (pincelada)', hint: 'Foto em duotone e título sobre uma pincelada larga.', formats: ALL, bg: 'navy', els: [
    PHOTO(DUO()), FADE(60),
    ...KICKER('Nova turma'), LOGO(),
    BRUSH('brush1', { x: -8, w: 96, h: 26, b: 30, rot: -3 }, 'red', 7),
    T('title', 'Título', 'Funcional adulto', 40, { x: M, w: 84, b: 34 }, H(12.5), { lines: 2 }),
    T('subtitle', 'Texto de apoio', 'Movimente-se, cuide da saúde e sinta-se bem.', 100, { x: M, w: 72, b: 19 }, B(3.4), { lines: 2 }),
    T('date', 'Dias e horário', 'Terças e quintas · 9h', 34, { x: M, w: 62, b: 10.5 }, I(4.2), { lines: 1 }),
    T('place', 'Local', 'Apollo Center Sport', 52, { x: M, w: 62, b: 6 }, K('white', { fs: 2.5, ls: 4 }), { lines: 1 }),
  ] },
  { id: 'peneira', cat: 'Chamadas e anúncios', name: 'Peneira / vagas abertas', hint: 'Palavra gigante vazada, data sobre pincelada e quem pode participar.', formats: ALL, bg: 'navy', els: [
    PHOTO(DUO({ con: 1.3 })), FADE(78),
    T('echo', 'Palavra de fundo', 'Peneira', 12, { x: -3, w: 106, t: 14 }, ECHO(30, 'white', 0.45), { lines: 1 }),
    KPILL('Vagas abertas'), LOGO(),
    T('title', 'Título', 'Peneira Apollo', 30, { x: M, w: 88, b: 47 }, H(14), { lines: 2 }),
    BRUSH('brush1', { x: -7, w: 82, h: 21, b: 25, rot: -2 }, 'red', 11),
    T('info', 'Data, hora e local', 'Sábado · 08/11 · 15h às 17h\nGinásio Apollo', 90, { x: M, w: 64, b: 29 }, I(3.9), { lines: 2 }),
    T('who', 'Quem pode participar', 'Meninas e meninos de 12 a 17 anos. Não precisa de experiência.', 110, { x: M, w: 82, b: 15 }, B(3.3), { lines: 2 }),
    T('cta', 'Chamada para ação', 'Inscreva-se pelo WhatsApp', 34, { x: M, w: 60, b: 6.5 }, PILL('white', 'navy'), { inl: true, lines: 1 }),
  ] },
  { id: 'evento', cat: 'Chamadas e anúncios', name: 'Evento / torneio / festival', hint: 'Bloco de data em destaque e programação.', formats: ALL, bg: 'navy', els: [
    IMG('photo', 'Foto', { x: 0, w: 100, t: 0, hp: 62 }, DUO()), FADE(48, 'navy', { bp: 36, solid: 0 }),
    KPILL('Festival Apollo'), LOGO(),
    T('title', 'Título', 'Torneio de integração', 40, { x: M, w: 88, b: 40 }, H(11.5), { lines: 2 }),
    LINE('line', { x: M, w: 88, b: 36 }),
    RECT('datebox', 'red', { x: M, w: 25, h: 25, b: 7 }, { label: 'Bloco da data' }),
    T('day', 'Dia', '15', 2, { x: M, w: 25, b: 15.5 }, H(15, 'white', { align: 'center', lh: 1 }), { lines: 1 }),
    T('month', 'Mês', 'Nov', 6, { x: M, w: 25, b: 9.5 }, I(3.8, 'white', { align: 'center', caps: true, ls: 4 }), { lines: 1 }),
    T('details', 'Programação', 'A partir das 9h\nGinásio Apollo\nInscrições abertas', 140, { x: 36, w: 58, b: 8 }, B(3.6, 'white', { lh: 1.5 }), { lines: 4 }),
  ] },
  { id: 'matricula', cat: 'Chamadas e anúncios', name: 'Matrículas abertas / aula experimental', hint: 'Escolinha: benefícios em lista e convite.', formats: ALL, bg: 'red', els: [
    ...KICKER('Escolinha Apollo', 'white', 'navy'), LOGO(),
    T('title', 'Título', 'Aula experimental grátis', 40, { x: M, w: 88, t: 17 }, H(12.5), { lines: 3 }),
    BRUSH('brush1', { x: -10, w: 92, h: 38, b: 20, rot: -2 }, 'navy', 8),
    T('benefits', 'Benefícios (um por linha)', '+ Técnicos experientes\n+ Turmas por idade\n+ Ambiente seguro', 160, { x: M + 2, w: 66, b: 29 }, I(3.7, 'white', { lh: 1.55 }), { lines: 4 }),
    T('when', 'Dias e horários', 'Terças e quintas · 16h', 50, { x: M, w: 88, b: 13 }, I(4.3), { lines: 1 }),
    T('cta', 'Chamada para ação', 'Reserve pelo WhatsApp', 34, { x: M, w: 60, b: 5.5 }, PILL('white', 'red'), { inl: true, lines: 1 }),
  ] },
  { id: 'horarios', cat: 'Chamadas e anúncios', name: 'Horários de treino', hint: 'Tabela de equipes, dias e horários.', formats: ALL, bg: 'navy', els: [
    BRUSH('grain', { brush: 'grao', x: 40, w: 70, h: 45, t: -6, op: 0.22 }, 'white', 4, { tex: 0.7 }),
    ...KICKER('Temporada 2026'), LOGO(),
    T('title', 'Título', 'Horários de treino', 30, { x: M, w: 88, t: 16 }, H(11), { lines: 2 }),
    RECT('bar', 'red', { x: M, w: 14, h: 1, t: 40 }, { label: 'Marcador' }),
    T('teams', 'Equipes (uma por linha)', 'Equipe masculino\nEquipe feminino\nEscolinha A\nEscolinha B\nFuncional adulto', 200, { x: M, w: 50, t: 46 }, I(3.3, 'white', { caps: true, lh: 2.1 }), { lines: 6 }),
    T('times', 'Dias e horários (um por linha)', 'Ter e qui · 15h\nSeg e qua · 19h\nSáb · 9h\nSáb · 10h30\nTer e qui · 9h', 200, { x: 58, w: 36, t: 46 }, B(3.3, 'white', { lh: 2.1, align: 'right' }), { lines: 6 }),
    LINE('line', { x: M, w: 88, b: 13 }),
    T('note', 'Observação', 'Apollo Center Sport', 80, { x: M, w: 88, b: 6.5 }, K('white', { fs: 2.5, ls: 4 }), { lines: 1 }),
  ] },
  { id: 'aviso', cat: 'Chamadas e anúncios', name: 'Aviso rápido', hint: 'Treino cancelado, mudança de horário, feriado.', formats: ALL, bg: 'red', els: [
    T('mark', 'Palavra grande', 'Aviso', 12, { x: 4.5, w: 94, t: 7 }, H(29), { lines: 1 }),
    T('title', 'Título', 'Treino cancelado hoje', 50, { x: M, w: 88, t: 38 }, I(7.4, 'navy', { caps: true, lh: 1.02 }), { lines: 3 }),
    T('body', 'Detalhe', 'Por conta da manutenção do ginásio, o treino de hoje não acontece. Voltamos amanhã no horário normal.', 260, { x: M, w: 84, b: 20 }, B(3.7), { lines: 5 }),
    RECT('band', 'navy', { x: 0, w: 100, b: 0, h: 14 }, { label: 'Faixa' }),
    T('footer', 'Rodapé', 'Equipe Apollo Voleibol', 48, { x: M, w: 60, b: 5.2 }, K('white', { fs: 2.5, ls: 4 }), { lines: 1 }),
    LOGO({ x: 75, w: 19, b: 3.3 }, 'assinatura-branca'),
  ] },
  { id: 'comunicado', cat: 'Chamadas e anúncios', name: 'Comunicado', hint: 'Avisos e informações longas. Fundo claro.', formats: ALL, bg: 'light', els: [
    ...KICKER('Comunicado', 'red'), LOGO(),
    T('title', 'Título', 'Treinos mudam de horário', 60, { x: M, w: 88, t: 18 }, H(10, 'navy'), { lines: 3 }),
    RECT('bar', 'red', { x: M, w: 14, h: 1, t: 50 }, { label: 'Marcador' }),
    T('body', 'Texto', 'A partir da próxima semana, os treinos da equipe masculino passam a começar às 15h. Qualquer dúvida, fale com a nossa recepção.', 420, { x: M, w: 86, t: 55 }, B(3.5, 'navy', { font: 'g400', lh: 1.45 }), { lines: 9 }),
    LINE('line', { x: M, w: 88, b: 12 }, 'navy', 0.15),
    T('footer', 'Rodapé', 'Equipe Apollo Voleibol', 48, { x: M, w: 70, b: 6 }, K('gray', { fs: 2.4, ls: 4 }), { lines: 1 }),
  ] },
  /* ── Jogos ── */
  { id: 'dia-de-jogo', cat: 'Jogos', name: 'Dia de jogo', hint: 'Confronto, horário e local sobre foto.', formats: ALL, bg: 'navy', els: [
    PHOTO(DUO()), FADE(74),
    KPILL('Dia de jogo'), LOGO(),
    T('title', 'Título', 'Hoje tem jogo', 24, { x: M, w: 88, b: 46 }, H(17), { lines: 2 }),
    BRUSH('brush1', { x: -8, w: 86, h: 17, b: 28, rot: -3 }, 'red', 9),
    T('match', 'Confronto', 'Apollo x Adversário', 40, { x: M, w: 74, b: 32 }, I(5, 'white', { caps: true }), { lines: 1 }),
    T('date', 'Data e horário', 'Sábado · 15h', 30, { x: M, w: 56, b: 12 }, I(4.3), { lines: 1 }),
    T('place', 'Local', 'Ginásio Apollo', 52, { x: M, w: 56, b: 7 }, B(3, 'white', { op: 0.8 }), { lines: 1 }),
    T('cta', 'Chamada para ação', 'Venha torcer!', 30, { x: 62, w: 32, b: 7.5 }, PILL('white', 'navy', { align: 'center', ls: 2 }), { lines: 1 }),
  ] },
  { id: 'proximos-jogos', cat: 'Jogos', name: 'Próximos jogos (agenda)', hint: 'Agenda com datas e confrontos.', formats: ALL, bg: 'navy', els: [
    ...KICKER('Agenda'), LOGO(),
    T('title', 'Título', 'Próximos jogos', 30, { x: M, w: 88, t: 16 }, H(12), { lines: 2 }),
    RECT('bar', 'red', { x: M, w: 14, h: 1, t: 40 }, { label: 'Marcador' }),
    T('dates', 'Datas (uma por linha)', '22/11\n29/11\n06/12\n13/12', 60, { x: M, w: 20, t: 46 }, I(3.6, 'red', { lh: 2.3 }), { lines: 5 }),
    T('games', 'Jogos (um por linha)', 'Apollo x Time A\nTime B x Apollo\nApollo x Time C\nTime D x Apollo', 200, { x: 27, w: 67, t: 46 }, I(3.6, 'white', { caps: true, lh: 2.3 }), { lines: 5 }),
    LINE('line', { x: M, w: 88, b: 13 }),
    T('note', 'Observação', 'Jogos em casa no Ginásio Apollo', 80, { x: M, w: 88, b: 6.5 }, K('white', { fs: 2.5, ls: 4 }), { lines: 1 }),
  ] },
  { id: 'resultado', cat: 'Jogos', name: 'Resultado', hint: 'Placar grande, parciais e competição.', formats: ALL, bg: 'navy', els: [
    BRUSH('grain', { brush: 'grao', x: -5, w: 110, h: 40, tp: 30, op: 0.18 }, 'white', 12, { tex: 0.7 }),
    T('kicker', 'Competição', 'Campeonato estadual · rodada 3', 44, { x: M, w: 88, t: 7 }, K('white', { align: 'center' }), { lines: 1 }),
    T('status', 'Situação', 'Fim de jogo', 16, { x: M, w: 88, tp: 15 }, H(8, 'white', { align: 'center' }), { lines: 1 }),
    BRUSH('brush1', { x: 3, w: 40, h: 20, tp: 39, rot: -6 }, 'red', 14),
    T('scoreA', 'Placar Apollo', '3', 2, { x: 4, w: 38, tp: 33 }, H(25, 'white', { align: 'center', lh: 1 }), { lines: 1 }),
    T('sep', 'Separador', 'x', 2, { x: 42, w: 16, tp: 42 }, I(7, 'white', { align: 'center', font: 'g300' }), { lines: 1 }),
    T('scoreB', 'Placar adversário', '1', 2, { x: 58, w: 38, tp: 33 }, H(25, 'white', { align: 'center', lh: 1 }), { lines: 1 }),
    T('teamA', 'Time 1', 'Apollo', 24, { x: 4, w: 38, tp: 59 }, I(3.6, 'white', { align: 'center', caps: true }), { lines: 2 }),
    T('teamB', 'Time 2', 'Adversário', 24, { x: 58, w: 38, tp: 59 }, I(3.6, 'white', { align: 'center', caps: true }), { lines: 2 }),
    T('sets', 'Parciais', '25/20 · 22/25 · 25/18 · 25/21', 60, { x: M, w: 88, tp: 70 }, B(3.2, 'white', { align: 'center', op: 0.85 }), { lines: 1 }),
    T('info', 'Data e local', '01/11 · Ginásio Apollo', 60, { x: M, w: 88, b: 17 }, K('white', { align: 'center', fs: 2.4, ls: 4 }), { lines: 1 }),
    LOGO({ x: 39, w: 22, b: 5 }),
  ] },
  { id: 'resultado-foto', cat: 'Jogos', name: 'Resultado sobre foto', hint: 'Placar grande sobre foto do jogo.', formats: ALL, bg: 'navy', els: [
    PHOTO(DUO()), FADE(70),
    KPILL('Fim de jogo'), LOGO(),
    T('score', 'Placar', '3 x 1', 9, { x: M, w: 88, b: 35 }, H(27, 'white', { lh: 0.95 }), { lines: 1 }),
    BRUSH('brush1', { x: -7, w: 74, h: 15, b: 21, rot: -2 }, 'red', 4),
    T('match', 'Confronto', 'Apollo x Adversário', 40, { x: M, w: 62, b: 24.5 }, I(4.3, 'white', { caps: true }), { lines: 1 }),
    T('sets', 'Parciais', '25/20 · 22/25 · 25/18 · 25/21', 60, { x: M, w: 88, b: 12 }, B(3.2, 'white', { op: 0.9 }), { lines: 1 }),
    T('info', 'Competição', 'Campeonato estadual · rodada 3', 60, { x: M, w: 88, b: 6.5 }, K('white', { fs: 2.4, ls: 4 }), { lines: 1 }),
  ] },
  { id: 'escalacao', cat: 'Jogos', name: 'Escalação', hint: 'Números e nomes das titulares.', formats: ALL, bg: 'navy', els: [
    IMG('photo', 'Foto (opcional)', { x: 54, w: 46, t: 0, hp: 100 }, DUO({ amt: 1 })), FADE(100, 'navy', { x: 46, w: 36, bp: 0, hp: 100, fade: 'right', solid: 30 }),
    ...KICKER('Escalação'), LOGO(),
    T('title', 'Título', 'Apollo x Adversário', 40, { x: M, w: 60, t: 16 }, H(8.5), { lines: 3 }),
    T('numbers', 'Números (um por linha)', '1\n4\n7\n9\n10\n12\n15', 30, { x: M, w: 9, t: 46 }, I(3.5, 'red', { lh: 2, align: 'right' }), { lines: 7 }),
    T('names', 'Atletas (uma por linha)', 'Nome Sobrenome\nNome Sobrenome\nNome Sobrenome\nNome Sobrenome\nNome Sobrenome\nNome Sobrenome\nNome Sobrenome', 260, { x: 18, w: 48, t: 46 }, I(3.5, 'white', { lh: 2, caps: true, font: 'g700' }), { lines: 7 }),
    T('coach', 'Comissão', 'Técnica: Nome Sobrenome', 60, { x: M, w: 60, b: 6.5 }, K('white', { fs: 2.4, ls: 4 }), { lines: 1 }),
  ] },
  { id: 'mvp', cat: 'Jogos', name: 'Destaque da partida (MVP)', hint: 'Atleta do jogo com sigla gigante vazada.', formats: ALL, bg: 'navy', els: [
    PHOTO(DUO()), FADE(62),
    T('echo', 'Sigla de fundo', 'MVP', 6, { x: -2, w: 104, t: 3 }, ECHO(42, 'white', 0.4), { lines: 1 }),
    LOGO({ x: 73, w: 21, b: 6 }),
    T('kicker', 'Chamada', 'Destaque da partida', 30, { x: M, w: 60, b: 46 }, PILL(), { inl: true, lines: 1 }),
    T('name', 'Nome', 'Nome Sobrenome', 30, { x: M, w: 88, b: 22 }, H(12), { lines: 2 }),
    BRUSH('brush1', { x: -8, w: 70, h: 11, b: 12, rot: -2 }, 'red', 19),
    T('stats', 'Números do jogo', '18 pontos · 4 bloqueios', 34, { x: M, w: 56, b: 14.5 }, I(3.4, 'white', { caps: true }), { lines: 1 }),
  ] },
  { id: 'estatisticas', cat: 'Jogos', name: 'Números do jogo', hint: 'Três números grandes com legenda.', formats: ALL, bg: 'navy', els: [
    ...KICKER('Números do jogo'), LOGO(),
    T('title', 'Título', 'Apollo x Adversário', 40, { x: M, w: 88, t: 16 }, H(9), { lines: 2 }),
    T('n1', 'Número 1', '58%', 5, { x: M, w: 46, tp: 37 }, H(17, 'red', { lh: 1 }), { lines: 1 }),
    T('l1', 'Legenda 1', 'aproveitamento de ataque', 40, { x: 55, w: 39, tp: 39.5 }, I(3.2, 'white', { caps: true, lh: 1.25 }), { lines: 3 }),
    LINE('line1', { x: M, w: 88, tp: 53 }),
    T('n2', 'Número 2', '12', 5, { x: M, w: 46, tp: 56 }, H(17, 'white', { lh: 1 }), { lines: 1 }),
    T('l2', 'Legenda 2', 'bloqueios', 40, { x: 55, w: 39, tp: 58.5 }, I(3.2, 'white', { caps: true, lh: 1.25 }), { lines: 3 }),
    LINE('line2', { x: M, w: 88, tp: 72 }),
    T('n3', 'Número 3', '7', 5, { x: M, w: 46, tp: 75 }, H(17, 'white', { lh: 1 }), { lines: 1 }),
    T('l3', 'Legenda 3', 'aces', 40, { x: 55, w: 39, tp: 77.5 }, I(3.2, 'white', { caps: true, lh: 1.25 }), { lines: 3 }),
  ] },
  { id: 'conquista', cat: 'Jogos', name: 'Conquista / campeãs', hint: 'Título conquistado, com granulado de celebração.', formats: ALL, bg: 'navy', els: [
    PHOTO(DUO()), FADE(72),
    BRUSH('grain', { brush: 'grao', x: -5, w: 110, h: 60, t: -4, op: 0.5 }, 'white', 6, { tex: 0.7 }),
    LOGO({ x: 39.5, w: 21, t: 6 }),
    T('title', 'Título', 'Campeãs', 14, { x: M, w: 88, b: 34 }, H(21, 'white', { align: 'center' }), { lines: 1 }),
    BRUSH('brush1', { x: 4, w: 92, h: 15, b: 20.5, rot: -2 }, 'red', 2),
    T('team', 'Equipe', 'Equipe Feminino Sub-17', 40, { x: M, w: 88, b: 24 }, I(4.3, 'white', { caps: true, align: 'center' }), { lines: 1 }),
    T('detail', 'Competição', 'Campeonato estadual 2026', 60, { x: M, w: 88, b: 9 }, K('white', { align: 'center', fs: 2.6, ls: 5 }), { lines: 1 }),
  ] },
  /* ── Pessoas ── */
  { id: 'card-atleta', cat: 'Pessoas', name: 'Card da atleta', hint: 'Número da camisa gigante, nome e posição.', formats: ALL, bg: 'navy', els: [
    PHOTO(DUO({ fx: 55 })), FADE(55),
    T('number', 'Número da camisa', '7', 2, { x: 3, w: 46, t: 2 }, ECHO(38, 'white', 0.95), { lines: 1 }),
    LOGO(),
    T('name', 'Nome', 'Nome Sobrenome', 30, { x: M, w: 88, b: 21 }, H(11), { lines: 2 }),
    T('position', 'Posição', 'Levantadora', 24, { x: M, w: 60, b: 13 }, PILL(), { inl: true, lines: 1 }),
    T('info', 'Informações', '1,78 m · 17 anos · Equipe feminino', 60, { x: M, w: 88, b: 6 }, B(3, 'white', { op: 0.85 }), { lines: 1 }),
  ] },
  { id: 'pessoa', cat: 'Pessoas', name: 'Pessoa com pincelada', hint: 'Foto, nome sobre pincelada e função.', formats: ALL, bg: 'navy', els: [
    { ...PHOTO(TR({ con: 1.08 })), req: true }, FADE(42),
    LOGO({ x: 73, w: 21, b: 6.5 }),
    BRUSH('brush1', { x: -8, w: 82, h: 15, b: 15, rot: -3 }, 'red', 3),
    T('name', 'Nome', 'Nome Sobrenome', 30, { x: M, w: 64, b: 19 }, I(5.6, 'white', { italic: true, caps: true }), { lines: 1 }),
    T('role', 'Função', 'Técnica · base', 40, { x: M, w: 60, b: 9 }, K('white', { fs: 2.5 }), { lines: 1 }),
  ] },
  { id: 'atleta', cat: 'Pessoas', name: 'Atleta em destaque', hint: 'Foto em cima, nome e história embaixo.', formats: ALL, bg: 'navy', els: [
    IMG('photo', 'Foto', { x: 0, w: 100, t: 0, hp: 66 }, DUO()), FADE(30, 'navy', { bp: 34, solid: 0 }),
    KPILL('Atleta do mês'), LOGO(),
    T('name', 'Nome', 'Nome Sobrenome', 30, { x: M, w: 88, b: 25 }, H(11.5), { lines: 2 }),
    RECT('bar', 'red', { x: M, w: 14, h: 1, b: 21 }, { label: 'Marcador' }),
    T('text', 'Texto', 'Treina na Apollo há 3 anos e foi convocada para a seleção estadual.', 140, { x: M, w: 86, b: 7 }, B(3.4), { lines: 3 }),
  ] },
  { id: 'boas-vindas', cat: 'Pessoas', name: 'Boas-vindas', hint: 'Foto emoldurada e nome da nova atleta ou técnico.', formats: ALL, bg: 'red', els: [
    ...KICKER('Reforço', 'white', 'navy'), LOGO(),
    RECT('frame', 'navy', { x: 17, w: 72, tp: 15, hp: 45 }, { label: 'Moldura' }),
    IMG('photo', 'Foto', { x: 13, w: 72, tp: 13, hp: 45 }, TR()),
    T('title', 'Título', 'Bem-vinda à Apollo', 30, { x: M, w: 88, b: 21 }, H(10.5), { lines: 2 }),
    T('name', 'Nome', 'Nome Sobrenome', 30, { x: M, w: 88, b: 13.5 }, I(4.2, 'navy', { caps: true }), { lines: 1 }),
    T('detail', 'Detalhe', 'Ponteira · Equipe feminino', 50, { x: M, w: 88, b: 7.5 }, B(3.1), { lines: 1 }),
  ] },
  { id: 'aniversario', cat: 'Pessoas', name: 'Aniversário', hint: 'Foto redonda, granulado de festa e mensagem.', formats: ALL, bg: 'navy', els: [
    BRUSH('grain', { brush: 'grao', x: -5, w: 110, h: 55, t: -5, op: 0.85 }, 'red', 9, { tex: 0.7 }),
    LOGO({ x: 76, w: 18, t: 5 }),
    { id: 'ring', type: 'shape', shape: 'ellipse', stroke: 'white', sw: 0.6, x: 24, w: 52, h: 52, tp: 12, label: 'Anel' },
    IMG('photo', 'Foto', { x: 27, w: 46, h: 46, tp: 14.3 }, TR(), { round: true }),
    T('title', 'Título', 'Parabéns!', 16, { x: M, w: 88, b: 29 }, H(15, 'white', { align: 'center' }), { lines: 1 }),
    T('name', 'Nome', 'Nome Sobrenome', 30, { x: M, w: 88, b: 21.5 }, I(4.6, 'red', { caps: true, align: 'center' }), { lines: 1 }),
    T('msg', 'Mensagem', 'Muita saúde, alegria e ótimos treinos neste novo ciclo!', 110, { x: 12, w: 76, b: 8 }, B(3.3, 'white', { align: 'center' }), { lines: 3 }),
  ] },
  { id: 'depoimento', cat: 'Pessoas', name: 'Depoimento', hint: 'Fala de atleta ou família, com foto pequena.', formats: ALL, bg: 'light', els: [
    T('qmark', 'Aspas', '“', 2, { x: 4, w: 24, t: 0 }, { font: 'g800', fs: 26, color: 'red', lh: 1 }, { lines: 1 }),
    LOGO(),
    T('quote', 'Depoimento', 'Aqui meu filho aprendeu a gostar de treinar e fez amigos para a vida.', 220, { x: M, w: 86, t: 30 }, I(5.6, 'navy', { font: 'g500', italic: true, lh: 1.25 }), { lines: 7 }),
    IMG('photo', 'Foto', { x: M, w: 17, h: 17, b: 7 }, TR(), { round: true }),
    T('name', 'Nome', 'Nome Sobrenome', 30, { x: 27, w: 60, b: 15 }, I(3.6, 'navy', { caps: true }), { lines: 1 }),
    T('role', 'Relação', 'Mãe de atleta da escolinha', 50, { x: 27, w: 60, b: 9.5 }, B(3, 'gray'), { lines: 1 }),
  ] },
  { id: 'pessoa-foto', cat: 'Pessoas', name: 'Comissão técnica', hint: 'Apresentação de técnico, preparador ou staff.', formats: ALL, bg: 'navy', els: [
    PHOTO(TR({ con: 1.08 })), FADE(55),
    T('echo', 'Palavra de fundo', 'Staff', 10, { x: -2, w: 104, t: 4 }, ECHO(34, 'white', 0.35), { lines: 1 }),
    LOGO(),
    T('kicker', 'Chamada', 'Comissão técnica', 30, { x: M, w: 60, b: 31 }, PILL(), { inl: true, lines: 1 }),
    T('name', 'Nome', 'Nome Sobrenome', 30, { x: M, w: 88, b: 14 }, H(10.5), { lines: 2 }),
    T('role', 'Função', 'Técnico principal · equipe masculino', 60, { x: M, w: 64, b: 7.5 }, B(3.1, 'white', { op: 0.85 }), { lines: 1 }),
  ] },
  /* ── Comunidade e institucional ── */
  { id: 'foto', cat: 'Comunidade e institucional', name: 'Foto com legenda', hint: 'A foto fala; legenda curta e logo.', formats: ALL, bg: 'navy', els: [
    PHOTO(TR({ con: 1.08 })), FADE(32, 'navy', { solid: 0, op: 0.9 }),
    T('caption', 'Legenda', 'Treino de sábado', 60, { x: M, w: 64, b: 7 }, I(4.3, 'white', { caps: true }), { lines: 2 }),
    LOGO({ x: 73, w: 21, b: 6.5 }),
  ] },
  { id: 'numero', cat: 'Comunidade e institucional', name: 'Número em destaque', hint: 'Um número grande que conta uma conquista.', formats: ALL, bg: 'red', els: [
    ...KICKER('Apollo em números', 'white', 'navy'), LOGO(),
    T('number', 'Número', '200+', 6, { x: 4, w: 94, tp: 22 }, H(36, 'white', { lh: 1 }), { lines: 1 }),
    BRUSH('brush1', { x: -8, w: 86, h: 19, tp: 55, rot: -2 }, 'navy', 13),
    T('label', 'Legenda', 'atletas treinando toda semana', 50, { x: M, w: 66, tp: 57.6 }, I(4.2, 'white', { caps: true }), { lines: 2 }),
    T('detail', 'Detalhe', 'Da escolinha às equipes de competição.', 110, { x: M, w: 84, b: 7 }, B(3.4), { lines: 2 }),
  ] },
  { id: 'contagem', cat: 'Comunidade e institucional', name: 'Contagem regressiva', hint: 'Faltam X dias para o evento.', formats: ALL, bg: 'navy', els: [
    PHOTO(DUO()), FADE(75),
    KPILL('Contagem regressiva'), LOGO(),
    T('num', 'Número', '7', 3, { x: 3, w: 60, b: 31 }, H(44, 'white', { lh: 0.9 }), { lines: 1 }),
    T('unit', 'Texto do número', 'dias para a', 24, { x: M, w: 88, b: 25 }, I(4.6, 'white', { caps: true }), { lines: 1 }),
    BRUSH('brush1', { x: -8, w: 86, h: 15, b: 9, rot: -2 }, 'red', 23),
    T('event', 'Evento', 'Peneira Apollo', 24, { x: M, w: 74, b: 12 }, H(8.5), { lines: 1 }),
    T('date', 'Data', '08/11 · Ginásio Apollo', 40, { x: M, w: 88, b: 4.5 }, K('white', { fs: 2.4, ls: 4 }), { lines: 1 }),
  ] },
  { id: 'parceiros', cat: 'Comunidade e institucional', name: 'Parceiros e patrocinadores', hint: 'Grade com até seis logos de parceiros.', formats: ALL, bg: 'white', els: [
    ...KICKER('Quem joga junto', 'red'), LOGO(),
    T('title', 'Título', 'Obrigado, parceiros', 40, { x: M, w: 88, t: 16 }, H(9.5, 'navy'), { lines: 2 }),
    ...[0, 1, 2, 3, 4, 5].flatMap(i => {
      const x = M + (i % 3) * 30, tp = 37 + Math.floor(i / 3) * 22;
      return [RECT('cell' + (i + 1), 'light', { x, w: 28, tp, hp: 19 }, { r: 1.5, label: 'Fundo do logo ' + (i + 1) }),
        IMG('p' + (i + 1), 'Logo do parceiro ' + (i + 1), { x: x + 3, w: 22, tp: tp + 2.5, hp: 14 }, TR({ fit: 'contain', con: 1 }))];
    }),
    T('footer', 'Rodapé', 'Juntos pelo vôlei de Curitiba.', 60, { x: M, w: 88, b: 6.5 }, K('gray', { fs: 2.4, ls: 4 }), { lines: 1 }),
  ] },
  { id: 'uniforme', cat: 'Comunidade e institucional', name: 'Uniforme / produto', hint: 'Produto em destaque, sem cortar a imagem.', formats: ALL, bg: 'light', els: [
    BRUSH('brush1', { x: 6, w: 100, h: 38, tp: 24, rot: -4, op: 0.95 }, 'red', 31),
    ...KICKER('Coleção 2026', 'red'), LOGO(),
    IMG('photo', 'Foto do produto', { x: 12, w: 76, tp: 14, hp: 54 }, TR({ fit: 'contain', con: 1 })),
    T('title', 'Produto', 'Camisa de jogo 2026', 40, { x: M, w: 88, b: 19 }, H(9.5, 'navy'), { lines: 2 }),
    T('detail', 'Detalhe', 'Disponível na recepção · P ao GG', 60, { x: M, w: 58, b: 13 }, B(3.2, 'navy'), { lines: 1 }),
    T('cta', 'Chamada para ação', 'Peça a sua', 24, { x: M, w: 50, b: 5.5 }, PILL('navy', 'white'), { inl: true, lines: 1 }),
  ] },
  { id: 'citacao', cat: 'Comunidade e institucional', name: 'Citação', hint: 'Frase de impacto com autor.', formats: ALL, bg: 'navy', els: [
    T('qmark', 'Aspas', '“', 2, { x: 4, w: 24, t: 2 }, { font: 'g800', fs: 26, color: 'red', lh: 1 }, { lines: 1 }),
    T('quote', 'Frase', 'O treino de hoje constrói o resultado de amanhã.', 120, { x: M, w: 88, tp: 27 }, H(10, 'white', { lh: 1 }), { lines: 5 }),
    BRUSH('brush1', { x: -8, w: 70, h: 12, b: 14.5, rot: -2 }, 'red', 27),
    T('author', 'Autor', 'Técnico Apollo', 40, { x: M, w: 54, b: 18 }, I(3.6, 'white', { caps: true }), { lines: 1 }),
    T('role', 'Função', 'Equipe masculino', 50, { x: M, w: 60, b: 8 }, K('white', { fs: 2.4, ls: 4 }), { lines: 1 }),
    LOGO({ x: 73, w: 21, b: 6.5 }),
  ] },
  { id: 'aprovados', cat: 'Comunidade e institucional', name: 'Lista de aprovados', hint: 'Resultado de peneira em duas colunas.', formats: ALL, bg: 'red', els: [
    ...KICKER('Resultado da peneira', 'white', 'navy'), LOGO(),
    T('title', 'Título', 'Aprovados', 16, { x: M, w: 88, t: 18 }, H(14.5), { lines: 1 }),
    T('subtitle', 'Subtítulo', 'Peneira de outubro · feminino', 50, { x: M, w: 88, t: 34 }, I(3.6, 'navy', { caps: true }), { lines: 1 }),
    T('names1', 'Nomes · coluna 1', 'Nome Sobrenome\nNome Sobrenome\nNome Sobrenome\nNome Sobrenome\nNome Sobrenome', 220, { x: M, w: 43, t: 42 }, I(3.2, 'white', { font: 'g700', caps: true, lh: 1.9 }), { lines: 8 }),
    T('names2', 'Nomes · coluna 2', 'Nome Sobrenome\nNome Sobrenome\nNome Sobrenome\nNome Sobrenome', 220, { x: 51, w: 43, t: 42 }, I(3.2, 'white', { font: 'g700', caps: true, lh: 1.9 }), { lines: 8 }),
    RECT('band', 'navy', { x: 0, w: 100, b: 0, h: 13 }, { label: 'Faixa' }),
    T('footer', 'Rodapé', 'Bem-vindas! Os treinos começam dia 10/11.', 70, { x: M, w: 88, b: 4.8 }, K('white', { fs: 2.4, ls: 3 }), { lines: 1 }),
  ] },
  /* ── Carrossel ── */
  { id: 'capa-carrossel', cat: 'Carrossel', name: 'Capa do carrossel', hint: 'Primeira lâmina: título forte e convite para arrastar.', formats: ALL, bg: 'navy', els: [
    PHOTO(DUO()), FADE(68),
    KPILL('Guia rápido'), LOGO(),
    T('title', 'Título', 'Tudo sobre a nossa peneira', 50, { x: M, w: 88, b: 20 }, H(13), { lines: 3 }),
    RECT('bar', 'red', { x: M, w: 14, h: 1, b: 15.5 }, { label: 'Marcador' }),
    T('swipe', 'Convite para arrastar', 'Arraste para o lado  →', 30, { x: M, w: 88, b: 7 }, K('white', { fs: 2.6 }), { lines: 1 }),
  ] },
  { id: 'conteudo', cat: 'Carrossel', name: 'Conteúdo numerado', hint: 'Lâmina de conteúdo: número vazado, título e texto.', formats: ALL, bg: 'navy', els: [
    T('step', 'Número da lâmina', '01', 3, { x: 4, w: 50, t: 4 }, ECHO(24, 'red', 1), { lines: 1 }),
    BRUSH('brush1', { x: -8, w: 84, h: 16, t: 31, rot: -2 }, 'red', 5),
    T('title', 'Título', 'Quando acontece?', 36, { x: M, w: 70, t: 34.5 }, I(6, 'white', { caps: true, lh: 1.02 }), { lines: 2 }),
    T('body', 'Texto', 'Terças e quintas, das 9h às 10h, no Apollo Center Sport. Traga roupa leve, tênis e uma garrafinha de água.', 360, { x: M, w: 86, t: 55 }, B(3.8, 'white', { lh: 1.45 }), { lines: 9 }),
    LOGO({ x: 77, w: 17, b: 5.5 }),
  ] },
  { id: 'encerramento', cat: 'Carrossel', name: 'Encerramento com chamada', hint: 'Última lâmina: convite, @ do perfil e contato.', formats: ALL, bg: 'red', els: [
    T('title', 'Chamada', 'Vem jogar com a gente', 40, { x: M, w: 88, t: 14 }, H(13), { lines: 3 }),
    BRUSH('brush1', { x: -8, w: 84, h: 16, b: 34, rot: -2 }, 'navy', 17),
    T('handle', 'Perfil', '@apollovoleibol', 30, { x: M, w: 66, b: 38 }, I(5.2), { lines: 1 }),
    T('contact', 'Contato', 'WhatsApp (41) 90000-0000\nApollo Center Sport', 120, { x: M, w: 86, b: 20 }, B(3.6, 'white', { lh: 1.45 }), { lines: 3 }),
    LOGO({ x: M, w: 26, b: 6 }),
  ] },
  /* ── Stories ── */
  { id: 'enquete', cat: 'Stories', name: 'Enquete / pergunta', hint: 'Pergunta grande e espaço para o adesivo do Instagram.', formats: ['story', 'square'], bg: 'navy', els: [
    PHOTO(DUO()), FADE(100, 'navy', { op: 0.85, solid: 40 }),
    ...KICKER('Fala, Apollo!'), LOGO(),
    T('title', 'Pergunta', 'Qual o melhor horário para a nova turma?', 80, { x: M, w: 88, tp: 18 }, H(10.5), { lines: 5 }),
    RECT('o1', 'white', { x: M, w: 42, h: 13, tp: 60 }, { r: 2, label: 'Opção 1 · fundo' }),
    RECT('o2', 'red', { x: 52, w: 42, h: 13, tp: 60 }, { r: 2, label: 'Opção 2 · fundo' }),
    T('opt1', 'Opção 1', 'Manhã', 14, { x: M, w: 42, tp: 62.6 }, I(4.4, 'navy', { align: 'center', caps: true }), { lines: 1 }),
    T('opt2', 'Opção 2', 'Noite', 14, { x: 52, w: 42, tp: 62.6 }, I(4.4, 'white', { align: 'center', caps: true }), { lines: 1 }),
    T('hint', 'Instrução', 'Responda no adesivo de enquete', 40, { x: M, w: 88, bp: 8 }, K('white', { align: 'center', fs: 2.5 }), { lines: 1 }),
  ] },
];
const mkCats = ['Chamadas e anúncios', 'Jogos', 'Pessoas', 'Comunidade e institucional', 'Carrossel', 'Stories'];

// Fundos integradores do carrossel: elementos em coordenadas da faixa inteira (n lâminas lado a lado)
const MK_STRIP_PRESETS = {
  pincelada: { label: 'Pincelada contínua', build: n => [BRUSH('sp-brush', { x: -8, w: 100 * n + 16, tp: 56, h: 15, rot: -2 }, 'red', 5, { tex: 0.6, front: true })] },
  foto: { label: 'Foto contínua (duotone)', build: n => [{ id: 'sp-photo', type: 'image', slot: 'strip_photo', label: 'Foto contínua', x: 0, w: 100 * n, tp: 0, hp: 100, treat: DUO() }] },
  linha: { label: 'Linha contínua', build: n => [{ id: 'sp-line', type: 'shape', shape: 'rect', fill: 'white', x: 0, w: 100 * n, tp: 62, h: 0.5, op: 0.7, front: true }] },
  respingo: { label: 'Respingos contínuos', build: n => [BRUSH('sp-splat', { brush: 'respingo', x: 30, w: 100 * n * 0.8, tp: 40, h: 60 * n * 0.45, rot: 4, op: 0.9 }, 'red', 6, { tex: 0.6, front: true })] },
  grao: { label: 'Granulado contínuo', build: n => [BRUSH('sp-grain', { brush: 'grao', x: 0, w: 100 * n, tp: 20, h: 80, op: 0.45 }, 'white', 8, { tex: 0.7 })] },
};
// Elementos prontos da biblioteca do editor (textos com estilo da marca, formas e pincéis)
const MK_TEXT_PRESETS = [
  { k: 'title', label: 'Título', def: 'Título', el: { w: 88, lines: 3, max: 60, st: H(12) } },
  { k: 'sub', label: 'Subtítulo', def: 'Subtítulo de apoio', el: { w: 80, lines: 2, max: 90, st: I(5, 'white', { caps: true }) } },
  { k: 'body', label: 'Texto corrido', def: 'Escreva aqui o texto da peça.', el: { w: 80, lines: 6, max: 300, st: B(3.5) } },
  { k: 'kicker', label: 'Chamada pequena', def: 'Chamada', el: { w: 60, lines: 1, max: 30, st: K() } },
  { k: 'pill', label: 'Etiqueta', def: 'Etiqueta', el: { w: 60, lines: 1, max: 30, inl: true, st: PILL() } },
  { k: 'number', label: 'Número gigante', def: '10', el: { w: 60, lines: 1, max: 6, st: H(30, 'white', { lh: 1 }) } },
  { k: 'echo', label: 'Texto vazado', def: 'Apollo', el: { w: 100, lines: 1, max: 14, st: ECHO(22, 'white', 0.5) } },
  { k: 'italic', label: 'Destaque itálico', def: 'Nome Sobrenome', el: { w: 70, lines: 1, max: 30, st: I(5.6, 'white', { italic: true, caps: true }) } },
];
// Começar do zero: só a logo, o resto vem da biblioteca do editor
const MK_BLANK = { id: 'branco', cat: 'Em branco', name: 'Em branco', hint: 'Comece do zero com a biblioteca de elementos.', formats: ALL, bg: 'navy', els: [LOGO()] };
return { MK_LAYOUTS, MK_BLANK, MK_STRIP_PRESETS, MK_TEXT_PRESETS, mkCats };
})();
const { MK_LAYOUTS, MK_BLANK, MK_STRIP_PRESETS, MK_TEXT_PRESETS, mkCats } = MK_LAYOUT_DATA;
const mkBaseLayout = id => (id === 'branco' ? MK_BLANK : MK_LAYOUTS.find(l => l.id === id)) || MK_LAYOUTS[0];

if (typeof module !== 'undefined') module.exports = { MK_LAYOUTS, MK_BLANK, mkBaseLayout, MK_STRIP_PRESETS, MK_TEXT_PRESETS, mkCats };
