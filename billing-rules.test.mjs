import test from 'node:test';
import assert from 'node:assert/strict';

let engine;
try { engine = await import('./js/billing-rules.mjs'); } catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}

test('a política inicial cobra apenas o valor base', () => {
  assert.ok(engine, 'O motor de cobrança deve estar implementado');
  assert.deepEqual(engine.calculateQuote(10000, 'PIX', engine.DEFAULT_POLICY, 30), {
    baseCents: 10000, methodAdjustmentCents: 0, principalCents: 10000,
    fineCents: 0, interestCents: 0, totalCents: 10000, daysLate: 30,
  });
});

const policy = (overrides = {}) => ({
  enabled: true, methods: { PIX: 0, CREDIT_CARD: 5 }, graceDays: 0,
  fine: { type: 'PERCENTAGE', value: 2 },
  tiers: [{ fromDay: 1, rate: 0.7, period: 'week' }, { fromDay: 15, rate: 3, period: 'month' }],
  ...overrides,
});

test('ajuste comercial incide também com encargos desativados', () => {
  const quote = engine.calculateQuote(10000, 'CREDIT_CARD', policy({ enabled: false }), 30);
  assert.equal(quote.methodAdjustmentCents, 500);
  assert.equal(quote.totalCents, 10500);
  assert.equal(quote.fineCents + quote.interestCents, 0);
});

test('no vencimento não há multa ou juros', () => {
  assert.equal(engine.calculateQuote(10000, 'PIX', policy(), 0).totalCents, 10000);
});

for (const [days, expected] of [[1, 10], [7, 70], [14, 140], [15, 150], [30, 300]]) {
  test(`juros progressivos aplicam cada faixa somente aos seus dias: ${days}`, () => {
    const quote = engine.calculateQuote(10000, 'PIX', policy(), days);
    assert.equal(quote.interestCents, expected);
    assert.equal(quote.fineCents, 200);
    assert.equal(quote.totalCents, 10200 + expected);
  });
}

test('a nova taxa começa no dia 15 sem recalcular os primeiros 14 dias', () => {
  const changed = policy({ tiers: [{ fromDay: 1, rate: 0.1, period: 'day' }, { fromDay: 15, rate: 1, period: 'day' }] });
  assert.equal(engine.calculateQuote(10000, 'PIX', changed, 14).interestCents, 140);
  assert.equal(engine.calculateQuote(10000, 'PIX', changed, 15).interestCents, 240);
});

test('tolerância adia multa e inicia a contagem da primeira faixa', () => {
  const delayed = policy({ graceDays: 7 });
  assert.equal(engine.calculateQuote(10000, 'PIX', delayed, 7).totalCents, 10000);
  assert.equal(engine.calculateQuote(10000, 'PIX', delayed, 8).interestCents, 10);
  assert.equal(engine.calculateQuote(10000, 'PIX', delayed, 21).interestCents, 140);
  assert.equal(engine.calculateQuote(10000, 'PIX', delayed, 22).interestCents, 150);
});

test('multa e juros usam principal com ajuste comercial', () => {
  const quote = engine.calculateQuote(10000, 'CREDIT_CARD', policy(), 7);
  assert.equal(quote.principalCents, 10500);
  assert.equal(quote.fineCents, 210);
  assert.equal(quote.interestCents, 74);
});

test('multa fixa respeita teto de 2% inclusive em centavos fracionários', () => {
  const fixed = policy({ fine: { type: 'FIXED', value: 9999 } });
  assert.equal(engine.calculateQuote(10003, 'PIX', fixed, 30).fineCents, 200);
  assert.equal(engine.calculateQuote(49, 'PIX', fixed, 1).fineCents, 0);
  assert.equal(engine.calculateQuote(10000, 'PIX', policy({ fine: { type: 'FIXED', value: 100 } }), 1).fineCents, 100);
});

test('multa percentual no teto não se repete por faixa', () => {
  assert.equal(engine.calculateQuote(10000, 'PIX', policy({ fine: { type: 'PERCENTAGE', value: 2 } }), 30).fineCents, 200);
});

test('taxas decimais usam arredondamento exato de meio centavo', () => {
  const precise = policy({ methods: { PIX: 1.005, CREDIT_CARD: 0 }, fine: { type: 'PERCENTAGE', value: 0 }, tiers: [{ fromDay: 1, rate: 0, period: 'day' }] });
  assert.equal(engine.calculateQuote(10000, 'PIX', precise, 0).methodAdjustmentCents, 101);
});

test('arredonda apenas o total de juros, sem arredondar dias ou faixas', () => {
  const fractional = policy({ fine: { type: 'FIXED', value: 0 }, tiers: [{ fromDay: 1, rate: 0.1, period: 'day' }, { fromDay: 3, rate: 0.1, period: 'day' }] });
  assert.equal(engine.calculateQuote(100, 'PIX', fractional, 5).interestCents, 1);
  assert.equal(engine.calculateQuote(100, 'PIX', fractional, 4).interestCents, 0);
});

test('períodos semana e mês equivalem respectivamente a sete e trinta dias', () => {
  for (const [period, days] of [['week', 7], ['month', 30]]) {
    const periodic = policy({ tiers: [{ fromDay: 1, rate: 1, period }] });
    assert.equal(engine.calculateQuote(10000, 'PIX', periodic, days).interestCents, 100);
  }
});

test('versões independentes preservam política antiga e entrada não é mutada', () => {
  const original = policy();
  const snapshot = JSON.stringify(original);
  const future = policy({ methods: { PIX: 10, CREDIT_CARD: 15 } });
  assert.equal(engine.calculateQuote(10000, 'PIX', original, 0).totalCents, 10000);
  assert.equal(engine.calculateQuote(10000, 'PIX', future, 0).totalCents, 11000);
  assert.equal(JSON.stringify(original), snapshot);
  assert.ok(Object.isFrozen(engine.DEFAULT_POLICY));
  assert.ok(Object.isFrozen(engine.DEFAULT_POLICY.methods));
});

test('validação informa erros de política em português', () => {
  const invalid = [
    [null, /política/i],
    [policy({ enabled: 'true' }), /ativação/i],
    [policy({ graceDays: -1 }), /tolerância/i],
    [policy({ methods: {} }), /modalidade/i],
    [policy({ methods: { PIX: -100, CREDIT_CARD: 0 } }), /PIX/i],
    [policy({ methods: { PIX: Infinity, CREDIT_CARD: 0 } }), /PIX/i],
    [policy({ methods: { PIX: 100.0001, CREDIT_CARD: 0 } }), /100/i],
    [policy({ methods: { PIX: 0.00001, CREDIT_CARD: 0 } }), /decimais/i],
    [policy({ fine: { type: 'OTHER', value: 0 } }), /multa/i],
    [policy({ fine: { type: 'FIXED', value: 0.5 } }), /centavos/i],
    [policy({ tiers: [] }), /faixa/i],
    [policy({ tiers: [{ fromDay: 2, rate: 1, period: 'day' }] }), /dia 1/i],
    [policy({ tiers: [{ fromDay: 1, rate: 1, period: 'year' }] }), /período/i],
    [policy({ tiers: [{ fromDay: 1, rate: NaN, period: 'day' }] }), /taxa/i],
    [policy({ tiers: [{ fromDay: 1, rate: 1, period: 'day' }, { fromDay: 1, rate: 2, period: 'day' }] }), /crescente/i],
    [policy({ tiers: [{ fromDay: 1, rate: 1, period: 'day' }, { fromDay: 15, rate: 2, period: 'day' }, { fromDay: 7, rate: 2, period: 'day' }] }), /crescente/i],
  ];
  for (const [input, message] of invalid) assert.throws(() => engine.validatePolicy(input), message);
  assert.doesNotThrow(() => engine.validatePolicy(engine.DEFAULT_POLICY));
  assert.throws(() => engine.validatePolicy(policy({ enabled: false, tiers: [] })), /faixa/i);
  assert.deepEqual(engine.validatePolicy(policy()), policy());
});

test('limites da política correspondem aos limites persistidos no banco', () => {
  for (const invalid of [
    policy({ methods: { PIX: 0 } }),
    policy({ methods: { PIX: 0, CREDIT_CARD: 0, BOLETO: 0 } }),
    policy({ graceDays: 366 }),
    policy({ fine: { type: 'PERCENTAGE', value: 2.0001 } }),
    policy({ fine: { type: 'FIXED', value: 2147483648 } }),
    policy({ enabled: false, tiers: [{ fromDay: 2, rate: 0, period: 'day' }] }),
    policy({ tiers: [{ fromDay: 1, rate: 0, period: 'day' }, { fromDay: 36501, rate: 0, period: 'day' }] }),
    policy({ tiers: Array.from({ length: 21 }, (_, index) => ({ fromDay: index + 1, rate: 0, period: 'day' })) }),
  ]) assert.throws(() => engine.validatePolicy(invalid));
  assert.doesNotThrow(() => engine.validatePolicy(policy({ graceDays: 365, methods: { PIX: -99, CREDIT_CARD: 100 }, fine: { type: 'FIXED', value: 2147483647 }, tiers: [{ fromDay: 1, rate: 100, period: 'day' }, { fromDay: 36500, rate: 0, period: 'month' }] })));
});

test('desconto comercial reduz principal e base de encargos', () => {
  const discounted = policy({ methods: { PIX: -10, CREDIT_CARD: 0 } });
  const quote = engine.calculateQuote(10000, 'PIX', discounted, 7);
  assert.equal(quote.methodAdjustmentCents, -1000);
  assert.equal(quote.principalCents, 9000);
  assert.equal(quote.fineCents, 180);
  assert.equal(quote.interestCents, 63);
  assert.equal(quote.totalCents, 9243);
});

test('rejeita valores monetários inválidos, modalidade ausente e atraso inválido', () => {
  for (const base of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => engine.calculateQuote(base, 'PIX', policy(), 1), /base|centavos/i);
  }
  assert.throws(() => engine.calculateQuote(10000, 'BOLETO', policy(), 1), /modalidade/i);
  for (const days of [-1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => engine.calculateQuote(10000, 'PIX', policy(), days), /atraso/i);
  }
  assert.throws(() => engine.calculateQuote(Number.MAX_SAFE_INTEGER, 'CREDIT_CARD', policy(), 1), /seguro/i);
});

test('base zero produz composição zero mesmo com multa fixa', () => {
  const quote = engine.calculateQuote(0, 'PIX', policy({ fine: { type: 'FIXED', value: 100 } }), 30);
  assert.equal(quote.totalCents, 0);
});

test('proposta2/5/7/10 mantém multa fixa de10 limitada a2% e juros não retroativos',()=>{
 const proposal={enabled:true,methods:{PIX:0,CREDIT_CARD:5},graceDays:0,fine:{type:'FIXED',value:1000},tiers:[{fromDay:1,rate:2,period:'month'},{fromDay:8,rate:5,period:'month'},{fromDay:15,rate:7,period:'month'},{fromDay:31,rate:10,period:'month'}]};
 const thirty=engine.calculateQuote(20000,'PIX',proposal,30),sixty=engine.calculateQuote(20000,'PIX',proposal,60);assert.equal(thirty.fineCents,400);assert.equal(thirty.interestCents,1073);assert.equal(thirty.totalCents,21473);assert.equal(sixty.totalCents,23473);assert.equal(engine.calculateQuote(50000,'PIX',proposal,1).fineCents,1000);assert.equal(engine.calculateQuote(20000,'PIX',proposal,0).fineCents,0);
});
