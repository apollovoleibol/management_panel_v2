// Portable calculation engine: browser, Node and Deno. Money is integer cents;
// rates are percentages with up to four decimal places. No floating point money.
const RATE_SCALE = 10000n;
const PERCENT_DENOMINATOR = 100n * RATE_SCALE;
const PERIOD_DAYS = Object.freeze({ day: 1, week: 7, month: 30 });
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

export const DEFAULT_POLICY = Object.freeze({
  enabled: false,
  methods: Object.freeze({ PIX: 0, CREDIT_CARD: 0 }),
  graceDays: 0,
  fine: Object.freeze({ type: 'PERCENTAGE', value: 0 }),
  tiers: Object.freeze([Object.freeze({ fromDay: 1, rate: 0, period: 'day' })]),
});

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function integer(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} deve ser um inteiro seguro entre ${minimum} e ${maximum}.`);
  }
  return value;
}

function percentage(value, label, minimum = 0, maximum = 100) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} deve ser um percentual finito entre ${minimum} e ${maximum}.`);
  }
  if (Number(value.toFixed(4)) !== value) {
    throw new Error(`${label} permite no máximo quatro casas decimais.`);
  }
  return value;
}

/** Validate and return a detached normalized policy suitable for persistence. */
export function validatePolicy(policy) {
  if (!object(policy)) throw new Error('A política de cobrança deve ser um objeto.');
  if (typeof policy.enabled !== 'boolean') throw new Error('A ativação dos encargos deve ser verdadeira ou falsa.');
  integer(policy.graceDays, 'A tolerância em dias', 0, 365);
  if (!object(policy.methods) || Object.keys(policy.methods).length !== 2
      || !Object.hasOwn(policy.methods, 'PIX') || !Object.hasOwn(policy.methods, 'CREDIT_CARD')) {
    throw new Error('Configure as modalidades PIX e CREDIT_CARD, sem modalidades adicionais.');
  }
  const methods = {};
  for (const [method, value] of Object.entries(policy.methods)) {
    if (!/^[A-Z][A-Z0-9_]{0,39}$/.test(method)) throw new Error('A modalidade de pagamento tem um nome inválido.');
    methods[method] = percentage(value, `O ajuste da modalidade ${method}`, -99);
  }
  if (!object(policy.fine) || !['PERCENTAGE', 'FIXED'].includes(policy.fine.type)) {
    throw new Error('O tipo de multa deve ser PERCENTAGE ou FIXED.');
  }
  const fine = {
    type: policy.fine.type,
    value: policy.fine.type === 'FIXED'
      ? integer(policy.fine.value, 'A multa fixa em centavos', 0, 2147483647)
      : percentage(policy.fine.value, 'O percentual da multa', 0, 2),
  };
  if (!Array.isArray(policy.tiers)) throw new Error('As faixas de juros devem ser uma lista.');
  if (policy.tiers.length < 1 || policy.tiers.length > 20) throw new Error('Configure de uma a vinte faixas de juros.');
  let previousDay = 0;
  const tiers = policy.tiers.map((tier, index) => {
    if (!object(tier)) throw new Error(`A faixa ${index + 1} deve ser um objeto.`);
    const fromDay = integer(tier.fromDay, `O dia inicial da faixa ${index + 1}`, 1, 36500);
    if (fromDay <= previousDay) throw new Error('As faixas devem ter dias iniciais únicos em ordem crescente.');
    previousDay = fromDay;
    if (!Object.hasOwn(PERIOD_DAYS, tier.period)) throw new Error(`O período da faixa ${index + 1} deve ser day, week ou month.`);
    return { fromDay, rate: percentage(tier.rate, `A taxa da faixa ${index + 1}`), period: tier.period };
  });
  if (tiers[0].fromDay !== 1) throw new Error('A primeira faixa de juros deve começar no dia 1 após a tolerância.');
  return { enabled: policy.enabled, methods, graceDays: policy.graceDays, fine, tiers };
}

function rateUnits(rate) {
  // toFixed is safe here because validation has already checked exact precision.
  const negative = rate < 0;
  const fixed = Math.abs(rate).toFixed(4).replace('.', '');
  return BigInt(fixed) * (negative ? -1n : 1n);
}

function roundRatio(numerator, denominator) {
  const sign = numerator < 0n ? -1n : 1n;
  const absolute = numerator < 0n ? -numerator : numerator;
  return sign * ((absolute * 2n + denominator) / (denominator * 2n));
}

function safeMoney(value, label) {
  if (value > MAX_SAFE || value < -MAX_SAFE) throw new Error(`${label} excede o limite seguro de centavos.`);
  return Number(value);
}

/** enabled affects late penalties only; modality adjustments always apply.
 * Grace days are removed before counting progressive tiers. Fine is charged
 * once and capped at floor(principal * 2%), so the cap is never exceeded.
 * Weekly/monthly interest is simple and prorated by 7/30 days. All tier slices
 * share an exact rational denominator, with rounding only at component totals.
 */
export function calculateQuote(baseCents, method, policy, daysLate = 0) {
  integer(baseCents, 'O valor base em centavos');
  integer(daysLate, 'Os dias de atraso');
  const normalized = validatePolicy(policy);
  if (!Object.hasOwn(normalized.methods, method)) throw new Error('A modalidade de pagamento não está configurada nesta política.');
  const base = BigInt(baseCents);
  const adjustment = roundRatio(base * rateUnits(normalized.methods[method]), PERCENT_DENOMINATOR);
  const principal = base + adjustment;
  if (base > 0n && principal <= 0n) throw new Error('O principal após ajuste deve ser positivo.');
  let fine = 0n;
  let interest = 0n;
  const effectiveDays = Math.max(0, daysLate - normalized.graceDays);
  if (normalized.enabled && effectiveDays > 0) {
    const requestedFine = normalized.fine.type === 'FIXED'
      ? BigInt(normalized.fine.value)
      : roundRatio(principal * rateUnits(normalized.fine.value), PERCENT_DENOMINATOR);
    const cap = principal * 2n / 100n;
    fine = requestedFine < cap ? requestedFine : cap;
    // 210 is divisible by 1, 7 and 30. Avoid rounding each progressive slice.
    let interestNumerator = 0n;
    for (let index = 0; index < normalized.tiers.length; index++) {
      const tier = normalized.tiers[index];
      if (effectiveDays < tier.fromDay) break;
      const next = normalized.tiers[index + 1];
      const endDay = next ? Math.min(effectiveDays, next.fromDay - 1) : effectiveDays;
      const dayCount = BigInt(endDay - tier.fromDay + 1);
      interestNumerator += principal * rateUnits(tier.rate) * dayCount * (210n / BigInt(PERIOD_DAYS[tier.period]));
    }
    interest = roundRatio(interestNumerator, PERCENT_DENOMINATOR * 210n);
  }
  return {
    baseCents,
    methodAdjustmentCents: safeMoney(adjustment, 'O ajuste comercial'),
    principalCents: safeMoney(principal, 'O principal'),
    fineCents: safeMoney(fine, 'A multa'),
    interestCents: safeMoney(interest, 'Os juros'),
    totalCents: safeMoney(principal + fine + interest, 'O total'),
    daysLate,
  };
}
