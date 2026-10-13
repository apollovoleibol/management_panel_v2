import {calculateQuote} from './billing-rules.mjs';
const DAY=86400000;
const periods={day:'dia',week:'semana',month:'mês'};
const pct=n=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:4}).format(n);
const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100);
// Read-only estimate. Payment always uses a fresh provider-confirmed server quote.
export function buildForecast(row,today) {
 const terms=row.forecast_terms;
 if(!terms || !Number.isSafeInteger(row.principal_cents) || row.principal_cents<=0 || !['PENDING','OVERDUE'].includes(row.status) || !['current'].includes(row.quote_state))return null;
 const parse=date=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))throw new Error('Data inválida');const time=Date.parse(date+'T00:00:00Z');if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==date)throw new Error('Data inválida');return time;};
 const due=parse(row.due_date),now=parse(today),elapsed=Math.max(0,Math.floor((now-due)/DAY));
 const policy={...terms,methods:{PIX:0,CREDIT_CARD:0}};
 const forecast=[1,7,15,30].map(offset=>{const days=elapsed+offset;const quote=calculateQuote(row.principal_cents,'PIX',policy,days);return {date:new Date(due+days*DAY).toISOString().slice(0,10),days,totalCents:quote.totalCents,fineCents:quote.fineCents,interestCents:quote.interestCents};});
 const fine=terms.fine.type==='FIXED' ? 'até '+money(terms.fine.value) : pct(terms.fine.value)+'%';
 const description=!terms.enabled ? 'Esta mensalidade não tem multa ou juros por atraso.' : `Após ${terms.graceDays} dia(s) de tolerância, multa única de ${fine}, limitada a 2% do principal (${money(row.principal_cents)}). Juros simples: ${terms.tiers.map((tier,index)=>`${pct(tier.rate)}% por ${periods[tier.period]} ${index+1<terms.tiers.length ? `do dia ${tier.fromDay} ao ${terms.tiers[index+1].fromDay-1}` : `a partir do dia ${tier.fromDay}`}`).join('; ')}. Os dias das faixas começam após a tolerância; taxas semanais e mensais são proporcionais a 7 e 30 dias, sem juros sobre juros.`;
 return {forecast,forecast_description:description};
}
