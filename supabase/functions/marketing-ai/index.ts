import { createClient } from 'npm:@supabase/supabase-js@2';

// Única porta do Huddle para o Gemini. A chave (GEMINI_API_KEY) existe só aqui.
// A IA escreve textos e gera imagens/vídeos; layout, logo, fontes e cores ficam nos templates HTML.
const origin = 'https://apollovoleibol.github.io';
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
});

const BRAND = `Você trabalha para a Apollo Voleibol, clube de vôlei brasileiro com escolinha, equipes de base e adultas.
Marca: azul-marinho #0f1332, vermelho #ee4036, cinza #808083, branco. Símbolo: bola de vôlei e foguete (Apollo).
Tom: energético, próximo e respeitoso; português do Brasil; frases curtas; sem exageros, sem gírias forçadas e no máximo um emoji.
Nunca invente datas, horários, valores, resultados ou nomes de pessoas: use só o que o briefing informar.
Menores de idade: nunca cite nome completo, idade ou dados de contato.`;

type Pricing = { model: string; kind: string; input_usd_per_mtok: number | null; output_usd_per_mtok: number | null; usd_per_unit: number | null };

function costUsd(p: Pricing, inTok: number, outTok: number, units: number) {
  if (p.kind === 'text') return (inTok * (p.input_usd_per_mtok ?? 0) + outTok * (p.output_usd_per_mtok ?? 0)) / 1e6;
  return units * (p.usd_per_unit ?? 0);
}
const b64 = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204,
    headers: { 'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS' } });
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });
  if (request.headers.get('Origin') !== origin) return json(403, { error: 'Origin not allowed' });
  const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return json(401, { error: 'Sessão ausente. Entre novamente.' });
  const url = Deno.env.get('SUPABASE_URL');
  const publishable = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}').default || Deno.env.get('SUPABASE_ANON_KEY');
  const secret = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!url || !publishable || !secret) return json(500, { error: 'Configuração da função incompleta.' });
  if (!key) return json(503, { error: 'A chave do Gemini ainda não foi configurada (GEMINI_API_KEY).' });

  const caller = createClient(url, publishable, {
    global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await caller.auth.getUser(token);
  if (userError || !userData.user) return json(401, { error: 'Sessão inválida. Entre novamente.' });
  const { data: access } = await caller.rpc('v2_my_access');
  if (access?.pages?.studio?.edit !== true) return json(403, { error: 'Seu perfil não pode usar o estúdio de peças.' });

  let input: Record<string, any>;
  try { input = await request.json(); } catch { return json(400, { error: 'JSON inválido.' }); }
  const action = String(input.action || '');
  if (!['copy', 'image', 'review', 'video_start', 'video_poll'].includes(action)) return json(400, { error: 'Ação inválida.' });
  const pieceId = /^[0-9a-f-]{36}$/i.test(String(input.pieceId || '')) ? String(input.pieceId) : null;
  const campaignId = /^[0-9a-f-]{36}$/i.test(String(input.campaignId || '')) ? String(input.campaignId) : null;

  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const kind = action === 'image' ? 'image' : action.startsWith('video') ? 'video' : 'text';
  const { data: pricing } = await admin.from('ai_pricing').select('*').eq('kind', kind).order('updated_at', { ascending: false }).limit(1).maybeSingle();
  const { data: settings } = await admin.from('ai_settings').select('usd_brl').eq('id', true).maybeSingle();
  if (!pricing || !settings) return json(503, { error: 'Preços de IA não configurados (Configurações → IA).' });
  const rate = Number(settings.usd_brl);

  // Orçamento da campanha (0 = sem limite). Estima o pior caso desta chamada antes de gastar.
  if (campaignId && action !== 'video_poll') {
    const { data: camp } = await admin.from('marketing_campaigns').select('ai_budget_brl').eq('id', campaignId).maybeSingle();
    const budget = Number(camp?.ai_budget_brl || 0);
    if (budget > 0) {
      const { data: spent } = await admin.from('ai_usage').select('cost_brl').eq('campaign_id', campaignId);
      const used = (spent || []).reduce((s, r) => s + Number(r.cost_brl), 0);
      const seconds = Math.min(Math.max(Number(input.seconds) || 6, 4), 8);
      const worst = kind === 'text' ? 0.05 * rate : kind === 'image' ? Number(pricing.usd_per_unit) * rate
        : seconds * Number(pricing.usd_per_unit) * rate;
      if (used + worst > budget) return json(402, { error: `Orçamento de IA da campanha esgotado (usado R$ ${used.toFixed(2)} de R$ ${budget.toFixed(2)}).` });
    }
  }

  const log = async (a: string, inTok: number, outTok: number, units: number) => {
    const usd = costUsd(pricing as Pricing, inTok, outTok, units);
    await admin.from('ai_usage').insert({ user_id: userData.user.id, action: a, kind, model: pricing.model,
      input_tokens: inTok, output_tokens: outTok, units, cost_usd: usd, cost_brl: usd * rate, piece_id: pieceId, campaign_id: campaignId });
    return { costUsd: usd, costBrl: usd * rate };
  };
  const call = async (path: string, body: unknown) => {
    const r = await fetch(`${GEMINI}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error?.message || `Gemini respondeu ${r.status}`);
    return j;
  };

  try {
    if (action === 'copy') {
      const slots = input.slots as Record<string, { label: string; max: number }>;
      if (!slots || typeof slots !== 'object') return json(400, { error: 'Slots inválidos.' });
      const keys = Object.keys(slots).slice(0, 12);
      const schema = { type: 'OBJECT', properties: Object.fromEntries(keys.map(k => [k, { type: 'STRING' }])), required: keys };
      const rules = keys.map(k => `- ${k} (${String(slots[k].label).slice(0, 40)}): até ${Math.min(Number(slots[k].max) || 40, 400)} caracteres`).join('\n');
      const j = await call(`models/${pricing.model}:generateContent`, {
        systemInstruction: { parts: [{ text: BRAND }] },
        contents: [{ role: 'user', parts: [{ text: `Briefing: ${String(input.brief || '').slice(0, 1500)}\n\nEscreva o texto de cada campo, respeitando o limite:\n${rules}` }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.8, thinkingConfig: { thinkingBudget: 0 } } });
      const out = JSON.parse(j.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
      const clean: Record<string, string> = {};
      for (const k of keys) clean[k] = String(out[k] ?? '').slice(0, Math.min(Number(slots[k].max) || 40, 400));
      const u = j.usageMetadata || {};
      return json(200, { slots: clean, usage: await log('copy', u.promptTokenCount || 0, (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0), 0) });
    }

    if (action === 'image') {
      const orient = { feed: 'vertical 4:5', story: 'vertical 9:16', square: 'quadrada 1:1', carousel: 'vertical 4:5' }[String(input.format)] || 'vertical 4:5';
      const prompt = `${String(input.prompt || '').slice(0, 1200)}\n\nImagem ${orient} para rede social de um clube de vôlei. Estilo fotográfico/ilustrativo limpo, paleta com azul-marinho #0f1332 e toques de vermelho #ee4036, boa área livre para texto. NÃO inclua texto, letras, números, logotipos, marcas d'água nem rostos de crianças identificáveis.`;
      const j = await call(`models/${pricing.model}:generateContent`, {
        contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE'] } });
      const part = (j.candidates?.[0]?.content?.parts || []).find((p: any) => p.inlineData?.data);
      if (!part) throw new Error('O Gemini não devolveu imagem. Reescreva o pedido.');
      const mime = part.inlineData.mimeType || 'image/png';
      const path = `ai/${crypto.randomUUID()}.${mime.includes('jpeg') ? 'jpg' : 'png'}`;
      const up = await admin.storage.from('marketing').upload(path, unb64(part.inlineData.data), { contentType: mime });
      if (up.error) throw new Error('Não foi possível guardar a imagem.');
      return json(200, { path, usage: await log('image', 0, 0, 1) });
    }

    if (action === 'review') {
      const png = String(input.imageBase64 || '');
      if (!png || png.length > 14_000_000) return json(400, { error: 'Imagem para revisão ausente ou muito grande.' });
      const j = await call(`models/${pricing.model}:generateContent`, {
        systemInstruction: { parts: [{ text: BRAND }] },
        contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/png', data: png } },
          { text: 'Revise esta peça pronta de rede social como diretor de arte. Verifique: texto cortado ou sobreposto, contraste e legibilidade, respiro ao redor do logo, uso da paleta da marca, erros de português e informações inventadas. Responda em JSON.' }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2,
          responseSchema: { type: 'OBJECT', properties: { approved: { type: 'BOOLEAN' }, summary: { type: 'STRING' },
            issues: { type: 'ARRAY', items: { type: 'OBJECT', properties: { severity: { type: 'STRING' }, text: { type: 'STRING' } }, required: ['severity', 'text'] } } },
            required: ['approved', 'summary', 'issues'] } } });
      const u = j.usageMetadata || {};
      return json(200, { review: JSON.parse(j.candidates?.[0]?.content?.parts?.[0]?.text || '{}'),
        usage: await log('review', u.promptTokenCount || 0, (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0), 0) });
    }

    if (action === 'video_start') {
      const seconds = Math.min(Math.max(Number(input.seconds) || 6, 4), 8);
      const ratio = String(input.format) === 'story' ? '9:16' : '16:9';
      const j = await call(`models/${pricing.model}:predictLongRunning`, {
        instances: [{ prompt: `${String(input.prompt || '').slice(0, 1200)}\nSem texto, sem letras, sem logotipos, sem rostos identificáveis de crianças.` }],
        parameters: { aspectRatio: ratio, durationSeconds: seconds } });
      if (!j.name) throw new Error('O Gemini não iniciou o vídeo.');
      return json(200, { operation: j.name, seconds });
    }

    if (action === 'video_poll') {
      const op = String(input.operation || '');
      if (!/^[\w\-/.]+$/.test(op)) return json(400, { error: 'Operação inválida.' });
      const r = await fetch(`${GEMINI}/${op}`, { headers: { 'x-goog-api-key': key } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error?.message || `Gemini respondeu ${r.status}`);
      if (!j.done) return json(200, { done: false });
      if (j.error) throw new Error(j.error.message || 'Falha ao gerar o vídeo.');
      const uri = j.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
      if (!uri) throw new Error('O vídeo foi recusado pelo Gemini (filtro de segurança). Reescreva o pedido.');
      const file = await fetch(uri, { headers: { 'x-goog-api-key': key } });
      if (!file.ok) throw new Error('Não foi possível baixar o vídeo gerado.');
      const path = `ai/${crypto.randomUUID()}.mp4`;
      const up = await admin.storage.from('marketing').upload(path, new Uint8Array(await file.arrayBuffer()), { contentType: 'video/mp4' });
      if (up.error) throw new Error('Não foi possível guardar o vídeo.');
      const seconds = Math.min(Math.max(Number(input.seconds) || 6, 4), 8);
      return json(200, { done: true, path, usage: await log('video', 0, 0, seconds) });
    }
  } catch (e) {
    return json(502, { error: e instanceof Error ? e.message : 'Falha ao falar com o Gemini. Nada foi cobrado.' });
  }
  return json(400, { error: 'Ação inválida.' });
});
