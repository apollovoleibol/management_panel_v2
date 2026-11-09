/* Folha dos técnicos: fechamento do mês em 3 passos (revisar → pagar → pago) */
'use strict';

// Treinos vindos do Manager App levam este sufixo na descrição (é assim que o técnico os vê no app)
const PAY_APP_TAG = ' (registrado no app)';
const payPlural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const payHours = h => `${(Math.round(Number(h || 0) * 100) / 100).toLocaleString('pt-BR')} h`;
const payDay = s => { const d = parseYmd(s); return `${DOW[d.getDay()].toLowerCase()} ${fmtShort(d)}`; };
const payFirst = n => String(n || '').split(' ')[0];
const payMonthName = key => { const l = monthLabel(key); return l[0].toUpperCase() + l.slice(1); };
const payErr = e => /row-level security|permission denied/i.test(e?.message || '') ? 'Seu perfil não tem permissão para alterar a folha.' : (e?.message || 'Não foi possível salvar. Tente de novo.');

// Treinos registrados no Manager App (chamada ou "confirmar treino") ainda fora da folha.
// Um por técnico, equipe e dia; sem duração gravada, usa a grade da equipe naquele dia da semana.
function payAppSessions(key) {
  const launched = new Set(COACH_ITEMS.filter(i => i.type === 'treino').map(i => `${i.coach}|${i.teamId}|${i.date}`));
  const out = new Map();
  SESSIONS.filter(s => s.coach && inMonth(s.date, key) && COACHES.some(c => c.id === s.coach)).forEach(s => {
    const k = `${s.coach}|${s.teamId}|${s.date}`;
    if (launched.has(k) || out.has(k)) return;
    const team = teamOf(s.teamId), slot = team?.schedule?.find(x => x.day === parseYmd(s.date).getDay());
    const hours = s.hours > 0 ? s.hours : slot ? hoursBetween(slot.start, slot.end) : 0;
    if (hours > 0) out.set(k, { coach: s.coach, teamId: s.teamId, date: s.date, hours: Math.round(hours * 100) / 100, team });
  });
  return [...out.values()];
}

// Situação de um técnico no mês: lançamentos (gravados + treinos do app ainda não revisados), valores e próximo passo
function payCoach(cid, key) {
  const c = coachOf(cid), paid = PAYOUTS[`${cid}|${key}`] || null;
  const own = COACH_ITEMS.filter(i => i.coach === cid && inMonth(i.date, key));
  const sessions = payAppSessions(key).filter(s => s.coach === cid);
  const app = paid ? [] : sessions.map(s => ({ id: `app|${s.coach}|${s.teamId}|${s.date}`, app: true, coach: cid, teamId: s.teamId,
    date: s.date, type: 'treino', hours: s.hours, desc: `Treino ${s.team?.name || ''}`.trim(), status: 'pendente', origin: 'App' }));
  const all = [...own, ...app].sort((a, b) => a.date.localeCompare(b.date) || String(teamOf(a.teamId)?.name || '').localeCompare(String(teamOf(b.teamId)?.name || '')));
  const live = all.filter(i => i.status !== 'reprovado');
  const value = i => i.app ? Math.round(c.rate * i.hours) : itemValue(i);
  const sum = list => list.reduce((n, i) => n + value(i), 0);
  const of = t => live.filter(i => i.type === t);
  const pending = live.filter(i => i.status === 'pendente');
  const total = paid ? paid.amount : sum(live);
  return { c, key, all, live, pending, value, sum, paid, total,
    waitingDaily: pending.filter(i => i.type === 'competicao' && !(c.daily > 0)),
    trainings: of('treino'), comps: of('competicao'), extras: of('extra'),
    hours: of('treino').reduce((n, i) => n + (i.hours || 0), 0), rejected: all.length - live.length,
    late: paid ? sessions.length : 0,
    state: paid ? 'paid' : pending.length ? 'review' : live.length && total > 0 ? 'ready' : 'idle' };
}
// Abre no mês a fechar: o anterior, enquanto houver técnico sem pagamento; depois, o corrente
function payDefaultMonth() {
  const prev = monthKey(new Date(TODAY.getFullYear(), TODAY.getMonth() - 1, 1));
  return COACHES.some(c => ['review', 'ready'].includes(payCoach(c.id, prev).state)) ? prev : CUR_MONTH;
}
const PAY_MIN_MONTH = () => monthKey(new Date(TODAY.getFullYear(), TODAY.getMonth() - 11, 1));

function renderPayments() {
  if (S.pay.auto !== false && LIVE.ready) { S.pay.month = payDefaultMonth(); S.pay.auto = false; }
  const key = S.pay.month, ed = canEdit('payments');
  const order = { review: 0, ready: 1, paid: 2, idle: 3 };
  const rows = COACHES.map(c => payCoach(c.id, key)).sort((a, b) => order[a.state] - order[b.state] || b.total - a.total);
  const act = rows.filter(r => r.state !== 'idle'), idle = rows.filter(r => r.state === 'idle');
  const by = st => act.filter(r => r.state === st), tot = list => list.reduce((n, r) => n + r.total, 0);
  const review = by('review'), ready = by('ready'), paid = by('paid');
  const total = tot(act), paidV = tot(paid), toReview = review.reduce((n, r) => n + r.pending.length, 0);
  const isCur = key === CUR_MONTH, end = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0);
  const [status, tone] = !act.length ? ['Sem lançamentos', ''] : isCur ? ['Mês em andamento', 'st-info'] : review.length || ready.length ? ['Fechamento pendente', 'st-warn'] : ['Mês fechado', 'st-ok'];
  const next = act.find(r => r.state === 'review' || r.state === 'ready');
  const step = (n, label, text, kind, count, done) => {
    const inner = `<span class="pr-step-n">${done ? icon('check') : n}</span><span><b>${label}</b><small>${text}</small></span>`;
    return count && kind ? `<button type="button" class="pr-step on" data-act="pay-next" data-step="${kind}">${inner}${icon('right')}</button>` : `<div class="pr-step${done ? ' done' : ''}">${inner}</div>`;
  };
  const row = r => {
    const c = r.c, parts = [];
    if (r.trainings.length) parts.push(`${payPlural(r.trainings.length, 'treino', 'treinos')} · ${payHours(r.hours)}`);
    if (r.comps.length) parts.push(payPlural(r.comps.length, 'diária', 'diárias'));
    if (r.extras.length) parts.push(payPlural(r.extras.length, 'extra', 'extras'));
    if (r.rejected) parts.push(payPlural(r.rejected, 'reprovado', 'reprovados'));
    const tag = r.state === 'review' ? `<span class="tag st-warn nodot">${r.waitingDaily.length === r.pending.length ? 'Falta o valor da diária' : `${r.pending.length} para revisar`}</span>`
      : r.state === 'ready' ? '<span class="tag st-info nodot">Pronto para pagar</span>'
      : r.state === 'paid' ? `<span class="tag st-ok nodot">Pago em ${fmtShort(parseYmd(r.paid.paidAt))}</span>` : '';
    const strong = r === next && ed ? ' primary' : '';
    const btn = r.state === 'review' ? `<button class="btn sm${strong}" data-act="pay-review" data-id="${c.id}">${ed ? 'Revisar lançamentos' : 'Ver lançamentos'}</button>`
      : r.state === 'ready' && ed ? `<button class="btn sm${strong}" data-act="pay-pay" data-id="${c.id}">${icon('money')} Pagar ${money(r.total)}</button>`
      : r.state === 'idle' ? '' : `<button class="btn sm" data-act="pay-review" data-id="${c.id}">Ver detalhes</button>`;
    return `<div class="pr-row rowlink" data-act="pay-review" data-id="${c.id}" tabindex="0">
      <div class="person"><span class="avatar">${initials(c.name)}</span><div><strong>${esc(c.name)}</strong><small>${parts.join(' · ') || 'Nenhum treino registrado no mês'}</small></div></div>
      <div class="pr-val">${r.state === 'idle' ? '' : `<strong>${money(r.total)}</strong>`}${tag}</div><div class="pr-act">${btn}</div></div>`;
  };
  return `${viewBanner('payments')}
  <div class="page-head"><div><div class="eyebrow">Finanças · equipe técnica</div><h1>Folha dos técnicos</h1><p>Feche o mês de cada técnico em 3 passos: revise os lançamentos, faça o PIX e registre o pagamento.</p></div>
    <div class="head-actions"><div class="pr-month" role="group" aria-label="Mês da folha">
        <button class="btn ghost" data-act="pay-month" data-d="-1" aria-label="Mês anterior" ${key <= PAY_MIN_MONTH() ? 'disabled' : ''}>${icon('left')}</button>
        <select class="select" id="payMonth" aria-label="Mês da folha">${monthOptions(key, 12)}</select>
        <button class="btn ghost" data-act="pay-month" data-d="1" aria-label="Próximo mês" ${key >= CUR_MONTH ? 'disabled' : ''}>${icon('right')}</button></div>
      <button class="btn" data-act="pay-rates-open">${icon('settings')} Valores e PIX</button>
      <button class="btn" data-act="pay-add" data-edit>${icon('plus')} Lançar diária ou extra</button>
      <button class="btn" data-act="pay-export" aria-label="Exportar a folha do mês (CSV)" title="Exportar a folha do mês (CSV)">${icon('download')}</button></div></div>
  <section class="panel pr-summary">
    <div class="pr-sum-head"><div><div class="pr-sum-status">${tone ? `<span class="tag ${tone} nodot">${status}</span>` : `<span class="tag nodot">${status}</span>`}<span class="muted small">${!act.length ? '' : isCur ? `fecha em ${fmtShort(end)}` : `${paid.length} de ${payPlural(act.length, 'técnico pago', 'técnicos pagos')}`}</span></div><h2>${payMonthName(key)}</h2></div>
      <div class="pr-sum-total"><strong>${money(total)}</strong><span>pago ${money(paidV)} · falta ${money(Math.max(0, total - paidV))}</span></div></div>
    ${act.length ? `<div class="pr-progress" role="progressbar" aria-label="Técnicos pagos" aria-valuemin="0" aria-valuemax="${act.length}" aria-valuenow="${paid.length}"><span style="width:${Math.round(paid.length / act.length * 100)}%"></span></div>` : ''}
    <div class="pr-steps">
      ${step(1, 'Revisar', review.length ? `${payPlural(review.length, 'técnico', 'técnicos')} · ${payPlural(toReview, 'lançamento', 'lançamentos')}` : act.length ? 'Tudo revisado' : 'Nada para revisar', 'review', review.length, act.length && !review.length)}
      ${step(2, 'Pagar', ready.length ? `${payPlural(ready.length, 'técnico', 'técnicos')} · ${money(tot(ready))}` : 'Ninguém aguardando', 'pay', ready.length && ed, act.length && !review.length && !ready.length)}
      ${step(3, 'Pago', paid.length ? `${payPlural(paid.length, 'técnico', 'técnicos')} · ${money(paidV)}` : 'Nenhum pagamento ainda', null, 0, act.length && paid.length === act.length)}
    </div>
    <p class="pr-how">${icon('info')}<span>Treinos com chamada ou confirmados no Manager App e diárias pedidas pelos técnicos entram aqui sozinhos. Depois do PIX, registre o pagamento: a saída “Folha técnica” vai para o Financeiro.</span></p>
  </section>
  <section class="panel"><div class="panel-head"><div><h2>Técnicos</h2><div class="sub">${act.length ? 'Na ordem do próximo passo' : payMonthName(key)}</div></div></div>
    ${act.length ? `<div class="pr-list">${act.map(row).join('')}</div>` : `<div class="panel-pad">${emptyState(`Nenhum treino em ${monthLabel(key)}`, 'Os treinos aparecem aqui assim que os técnicos fazem a chamada ou confirmam o treino no Manager App.')}</div>`}
    ${idle.length && act.length ? `<details class="pr-idle"><summary>${icon('right')} ${payPlural(idle.length, 'técnico', 'técnicos')} sem treinos em ${MONTHS[Number(key.slice(5, 7)) - 1]}</summary><div class="pr-list">${idle.map(row).join('')}</div></details>` : ''}
  </section>`;
}

/* ─── Revisão dos lançamentos de um técnico ─── */
function payReview(cid) {
  const key = S.pay.month, r = payCoach(cid, key), c = r.c, ed = canEdit('payments') && !r.paid;
  const decidable = i => ed && i.status === 'pendente' && !(i.type === 'competicao' && !(c.daily > 0));
  const items = r.all.filter(decidable);
  const line = i => {
    const team = teamOf(i.teamId), isApp = i.app || String(i.desc).endsWith(PAY_APP_TAG);
    const ses = i.type === 'treino' ? SESSIONS.find(s => s.coach === i.coach && s.teamId === i.teamId && s.date === i.date) : null;
    const present = ses && ses.recorded ? Object.values(ses.att || {}).filter(v => v === 'present').length : null;
    const title = i.type === 'treino' ? (team?.name || String(i.desc).replace(PAY_APP_TAG, '')) : i.desc;
    const tags = i.type === 'treino' && typeof trainingPayTags === 'function' ? trainingPayTags(i.coach, i.teamId, i.date) : [];
    const origin = (isApp ? 'registrado no app' : i.origin === 'Técnico' ? (i.type === 'competicao' ? 'pedida pelo técnico no app' : 'lançado pelo técnico') : 'lançado pela administração')
      + (tags.length ? ' · ' + tags.join(' · ') : '');
    const proof = i.type !== 'treino' ? (team ? ` · ${esc(team.name)}` : '') : !ses ? '' : present !== null ? ` · chamada com ${payPlural(present, 'presente', 'presentes')}` : ' · confirmado sem chamada';
    const waiting = i.status === 'pendente' && i.type === 'competicao' && !(c.daily > 0);
    const note = waiting ? ' · aguardando o valor da diária' : '';
    const lead = decidable(i) ? `<input type="checkbox" class="pr-chk" data-k="${esc(i.id)}" checked aria-label="Aprovar ${esc(title)}, ${payDay(i.date)}">`
      : i.status === 'aprovado' ? `<span class="pr-st ok" title="Aprovado">${icon('check')}<span class="sr">Aprovado</span></span>`
      : i.status === 'reprovado' ? `<span class="pr-st bad" title="Reprovado">${icon('x')}<span class="sr">Reprovado</span></span>`
      : `<span class="pr-st wait" title="Aguardando">${icon('clock')}<span class="sr">Aguardando</span></span>`;
    const tag = decidable(i) ? 'label' : 'div';
    return `<${tag} class="pr-item${i.status === 'reprovado' ? ' is-rej' : ''}">${lead}<span class="pr-date">${payDay(i.date)}</span><span class="pr-desc"><b>${esc(title)}</b><small>${origin}${proof}${note}</small></span><span class="pr-qty">${i.type === 'competicao' ? '1 dia' : i.hours ? payHours(i.hours) : '—'}</span><span class="pr-money">${money(r.value(i))}</span></${tag}>`;
  };
  const section = (title, list, hint = '') => list.length ? `<h3 class="pr-sec">${title} <span class="muted">· ${list.length}</span></h3>${hint ? `<p class="hint" style="margin:-4px 0 6px">${hint}</p>` : ''}<div class="pr-items">${list.map(line).join('')}</div>` : '';
  const ofType = t => r.all.filter(i => i.type === t);
  const kv = [['Treinos', r.trainings.length ? `${r.trainings.length} · ${payHours(r.hours)}` : '—', r.sum(r.trainings)], ['Diárias', r.comps.length || '—', r.sum(r.comps)], ['Extras', r.extras.length || '—', r.sum(r.extras)]].filter(([l, n]) => l === 'Treinos' || n !== '—');
  const banners = [
    r.paid ? `<div class="banner note">${icon('check')}<span>Pagamento de <b>${money(r.paid.amount)}</b> registrado em ${fmtDate(parseYmd(r.paid.paidAt))}. Os lançamentos ficam só para consulta.${r.late ? ` ${payPlural(r.late, 'treino registrado', 'treinos registrados')} no app depois do pagamento não ${r.late === 1 ? 'entrou' : 'entraram'} nesta folha.` : ''}</span></div>` : '',
    !r.paid && r.waitingDaily.length ? `<div class="banner warn">${icon('alert')}<span>A diária de competição de ${esc(payFirst(c.name))} está sem valor, então ${payPlural(r.waitingDaily.length, 'diária fica', 'diárias ficam')} aguardando. ${canEdit('payments') ? `<button class="btn sm" data-act="pay-rates-open" data-id="${cid}" style="margin-left:4px">Definir valor da diária</button>` : 'Peça a um administrador para definir o valor.'}</span></div>` : '',
    !r.paid && r.state === 'ready' ? `<div class="banner note">${icon('check')}<span><b>Tudo revisado.</b> Próximo passo: fazer o PIX de ${money(r.total)} e registrar o pagamento.</span></div>` : '',
    items.length ? `<div class="pr-tip"><span>Tudo já vem marcado para aprovar. Desmarque o que não deve ser pago: vira <b>reprovado</b> e o técnico vê no app.</span><button type="button" class="btn sm ghost" id="prAll">Desmarcar todos</button></div>` : '',
  ].join('');
  const body = r.all.length ? section('Diárias de competição', ofType('competicao')) + section('Extras', ofType('extra')) + section('Treinos', ofType('treino'))
    : emptyState('Nenhum lançamento no mês', 'Os treinos aparecem aqui quando o técnico faz a chamada ou confirma o treino no Manager App.');
  const foot = `${ed ? `<button class="btn left" data-act="pay-add" data-id="${cid}">${icon('plus')} Lançar diária ou extra</button>` : ''}<button class="btn" data-act="close-dialog">Fechar</button>${items.length ? `<button class="btn primary" id="prSave" data-act="pay-review-save" data-id="${cid}">Aprovar</button>` : !r.paid && r.state === 'ready' && ed ? `<button class="btn primary" data-act="pay-pay" data-id="${cid}">${icon('money')} Pagar ${money(r.total)}</button>` : ''}`;
  openDialog(dHead(`${r.paid ? 'Folha' : 'Revisar'} · ${monthLabel(key)}`, esc(c.name), `Hora-aula ${money(c.rate)} · diária ${c.daily > 0 ? money(c.daily) : 'não definida'}${c.pix ? ' · PIX cadastrado' : ''}`)
    + `<div class="d-body"><div class="pr-kv">${kv.map(([l, n, v]) => `<div><small>${l}</small><strong>${n}</strong><span>${money(v)}</span></div>`).join('')}<div class="tot"><small>${r.paid ? 'Pago' : 'Total do mês'}</small><strong>${money(r.total)}</strong><span>${r.rejected ? payPlural(r.rejected, 'reprovado fora', 'reprovados fora') : '&nbsp;'}</span></div></div>${banners}${body}</div>
    <div class="d-foot">${foot}</div>`, 'drawer wide');
  const dlg = $('#dlg');
  dlg._pr = { cid, items: new Map(items.map(i => [i.id, i])), value: r.value };
  const refresh = () => {
    const boxes = $$('#dlg .pr-chk'), on = boxes.filter(b => b.checked), off = boxes.filter(b => !b.checked), btn = $('#prSave');
    if (!btn) return;
    const sumOn = on.reduce((n, b) => n + r.value(dlg._pr.items.get(b.dataset.k)), 0);
    btn.innerHTML = on.length && !off.length ? `${icon('check')} Aprovar ${on.length} · ${money(sumOn)}` : on.length ? `${icon('check')} Aprovar ${on.length} e reprovar ${off.length}` : `${icon('x')} Reprovar ${off.length}`;
    const all = $('#prAll'); if (all) all.textContent = off.length ? 'Marcar todos' : 'Desmarcar todos';
  };
  dlg.querySelector('.d-body').addEventListener('change', e => { if (e.target.classList.contains('pr-chk')) { dlg.dataset.dirty = '1'; refresh(); } });
  $('#prAll')?.addEventListener('click', () => { const boxes = $$('#dlg .pr-chk'), anyOff = boxes.some(b => !b.checked); boxes.forEach(b => { b.checked = anyOff; }); dlg.dataset.dirty = '1'; refresh(); });
  refresh();
}
async function payReviewSave(cid) {
  const dlg = $('#dlg'), st = dlg._pr;
  if (!st || st.cid !== cid || !canEdit('payments')) return;
  const boxes = $$('#dlg .pr-chk'), pick = on => boxes.filter(b => b.checked === on).map(b => st.items.get(b.dataset.k));
  const ok = pick(true), no = pick(false);
  if (!ok.length && !no.length) return;
  if (no.length) {
    const label = i => `${payDay(i.date)} · ${esc(i.type === 'treino' ? (teamOf(i.teamId)?.name || i.desc) : i.desc)}`;
    const sure = await confirmBox({ title: `Reprovar ${payPlural(no.length, 'lançamento', 'lançamentos')}?`,
      text: `${no.slice(0, 5).map(label).join('<br>')}${no.length > 5 ? `<br>+ ${no.length - 5}` : ''}<br><br>Reprovados não entram no pagamento e o técnico vê a decisão no app.`,
      ok: ok.length ? `Aprovar ${ok.length} e reprovar ${no.length}` : `Reprovar ${no.length}`, danger: true });
    if (!sure) return;
  }
  const btn = $('#prSave'); if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }
  const db = financeDbClient(), me = APOLLO_AUTH.user.id;
  const appRow = (i, status) => ({ coach_id: i.coach, team_id: i.teamId, item_date: i.date, kind: 'training',
    description: `Treino ${teamOf(i.teamId)?.name || ''}`.trim() + PAY_APP_TAG, hours: i.hours, amount_cents: null, status, created_by: me });
  const inserts = [...ok.filter(i => i.app).map(i => appRow(i, 'approved')), ...no.filter(i => i.app).map(i => appRow(i, 'rejected'))];
  const update = async (list, status) => { const ids = list.filter(i => !i.app).map(i => i.id); return ids.length ? (await db.from('v2_coach_items').update({ status }).in('id', ids)).error : null; };
  let error = inserts.length ? (await db.from('v2_coach_items').insert(inserts)).error : null;
  if (!error) error = await update(ok, 'approved');
  if (!error) error = await update(no, 'rejected');
  dlg.dataset.dirty = '0';
  await liveReload();
  if (error) toast(payErr(error), true);
  else toast(ok.length && no.length ? `${payPlural(ok.length, 'lançamento aprovado', 'lançamentos aprovados')} e ${no.length} reprovado(s).` : ok.length ? `${payPlural(ok.length, 'lançamento aprovado', 'lançamentos aprovados')}.` : `${payPlural(no.length, 'lançamento reprovado', 'lançamentos reprovados')}.`);
  payReview(cid);
}

/* ─── Pagamento (passo 2) ─── */
function payPay(cid) {
  const key = S.pay.month, r = payCoach(cid, key), c = r.c;
  if (r.state !== 'ready') return payReview(cid);
  const parts = [r.trainings.length && `${payPlural(r.trainings.length, 'treino', 'treinos')} (${payHours(r.hours)}) ${money(r.sum(r.trainings))}`,
    r.comps.length && `${payPlural(r.comps.length, 'diária', 'diárias')} ${money(r.sum(r.comps))}`, r.extras.length && `${payPlural(r.extras.length, 'extra', 'extras')} ${money(r.sum(r.extras))}`].filter(Boolean);
  openDialog(dHead(`Pagar · ${monthLabel(key)}`, esc(c.name), 'Passo 2 de 2: fazer o PIX e registrar') + `<div class="d-body">
    <div class="pr-amount"><small>Valor a pagar</small><strong>${money(r.total)}</strong><span>${parts.join(' · ')}</span></div>
    <div class="field"><label for="ppPix">Chave PIX de ${esc(payFirst(c.name))}</label>${c.pix
      ? `<div class="pr-pix"><code id="ppPix">${esc(c.pix)}</code><button type="button" class="btn sm" data-act="pay-copy-pix" data-id="${cid}">${icon('copy')} Copiar</button></div>`
      : `<input class="input" id="ppPix" placeholder="CPF, e-mail, telefone ou chave aleatória" autocomplete="off"><span class="hint">Fica salva para os próximos meses. Se pagar de outra forma, deixe em branco.</span>`}</div>
    <ol class="pr-howto"><li>Faça o PIX de <b>${money(r.total)}</b> no app do banco.</li><li>Volte aqui e confirme. A saída “Folha técnica” entra no Financeiro na mesma hora.</li></ol>
    ${key === CUR_MONTH ? `<div class="banner warn">${icon('alert')}<span>${payMonthName(key)} ainda não terminou. Treinos registrados depois do pagamento não entram nesta folha.</span></div>` : ''}
    ${canEdit('finance') ? '' : `<div class="banner warn">${icon('lock')}<span>Para registrar o pagamento, o seu perfil também precisa editar o <b>Financeiro</b>.</span></div>`}
    <div class="err" id="ppErr" role="alert"></div></div>
    <div class="d-foot"><button class="btn left" data-act="pay-review" data-id="${cid}">Ver lançamentos</button><button class="btn" data-act="close-dialog">Cancelar</button><button class="btn primary" data-act="pay-pay-save" data-id="${cid}" data-edit>${icon('check')} Já fiz o PIX · registrar</button></div>`);
}
async function payPaySave(cid) {
  const key = S.pay.month, r = payCoach(cid, key), db = financeDbClient(), input = $('#ppPix'), pix = input?.tagName === 'INPUT' ? input.value.trim() : '';
  const btn = $('#dlg [data-act="pay-pay-save"]'), fail = e => { if (btn) btn.disabled = false; $('#ppErr').textContent = payErr(e); };
  if (btn) btn.disabled = true;
  if (pix) { const { error } = await db.from('v2_coach_rates').upsert({ coach_id: cid, pix_key: pix }); if (error) return fail(error); }
  const { data, error } = await db.rpc('v2_record_coach_payout', { p_coach: cid, p_month: `${key}-01` });
  if (error) return fail(error);
  closeDialog(); await liveReload();
  toast(`Pagamento de ${money(data ?? r.total)} para ${payFirst(r.c.name)} registrado. A saída já está no Financeiro.`);
}

/* ─── Valores e PIX de todos os técnicos ─── */
function payRates(focus = '') {
  const ed = canEdit('payments'), list = [...COACHES].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  openDialog(dHead('Folha dos técnicos', 'Valores e PIX', 'Hora-aula e diária valem para os lançamentos ainda não aprovados. Os já aprovados mantêm o valor da época.') + `<div class="d-body"><fieldset class="plain" id="prRates" ${ed ? '' : 'disabled'}>
    ${list.map(c => `<div class="pr-rate${c.id === focus ? ' focus' : ''}" data-coach="${c.id}"><div class="person"><span class="avatar">${initials(c.name)}</span><strong>${esc(c.name)}</strong></div>
      <div class="pr-rate-f"><label>Hora-aula (R$)<input class="input" type="number" min="0.01" step="0.01" inputmode="decimal" data-f="rate" value="${c.rate ? (c.rate / 100).toFixed(2) : ''}"></label>
        <label>Diária de competição (R$)<input class="input" type="number" min="0" step="0.01" inputmode="decimal" data-f="daily" value="${c.daily ? (c.daily / 100).toFixed(2) : ''}" placeholder="0,00"${c.id === focus ? ' autofocus' : ''}></label>
        <label class="pix">Chave PIX<input class="input" data-f="pix" value="${esc(c.pix)}" placeholder="CPF, e-mail, telefone ou aleatória" autocomplete="off"></label></div></div>`).join('')}
    <div class="err" id="prRatesErr" role="alert"></div></fieldset></div>
    <div class="d-foot"><button class="btn" data-act="close-dialog">${ed ? 'Cancelar' : 'Fechar'}</button>${ed ? `<button class="btn primary" data-act="pay-rates-save" data-id="${focus}">Salvar valores</button>` : ''}</div>`, 'drawer wide');
  const dlg = $('#dlg');
  $('#prRates').addEventListener('input', () => { dlg.dataset.dirty = '1'; });
  if (focus) dlg.querySelector(`[data-coach="${focus}"]`)?.scrollIntoView({ block: 'center' });
}
async function payRatesSave(back) {
  if (!canEdit('payments')) return;
  const rows = $$('#dlg [data-coach]').map(el => {
    const g = f => el.querySelector(`[data-f="${f}"]`).value.trim(), c = coachOf(el.dataset.coach);
    return { c, rate: centsInput(g('rate')), daily: g('daily') ? centsInput(g('daily')) : 0, pix: g('pix') };
  });
  const bad = rows.find(x => !(x.rate > 0) || !(x.daily >= 0));
  if (bad) { $('#prRatesErr').textContent = `Confira os valores de ${bad.c.name}: a hora-aula precisa ser maior que zero e a diária não pode ser negativa.`; return; }
  const changed = rows.filter(x => x.rate !== x.c.rate || x.daily !== x.c.daily || x.pix !== (x.c.pix || ''));
  const dlg = $('#dlg');
  if (changed.length) {
    const { error } = await financeDbClient().from('v2_coach_rates').upsert(changed.map(x => ({ coach_id: x.c.id, hourly_cents: x.rate, daily_cents: x.daily, pix_key: x.pix || null })));
    if (error) { $('#prRatesErr').textContent = payErr(error); return; }
    dlg.dataset.dirty = '0'; await liveReload();
    toast(`Valores salvos (${payPlural(changed.length, 'técnico', 'técnicos')}).`);
  }
  dlg.dataset.dirty = '0';
  return back ? payReview(back) : closeDialog();
}

/* ─── Lançar diária ou extra (entra aprovado: foi a administração que lançou) ─── */
function payAddForm(coach = '') {
  const pick = coach || COACHES[0]?.id;
  openDialog(dHead('Folha dos técnicos', 'Lançar diária ou extra', 'Entra aprovado na folha do técnico.') + `<div class="d-body">
    <div class="field"><label>Tipo</label><div class="seg" role="radiogroup" id="paType"><button type="button" class="on" data-v="competicao">Diária de competição</button><button type="button" data-v="extra">Extra (valor livre)</button><button type="button" data-v="treino">Treino fora do app</button></div></div>
    <div class="row2"><div class="field"><label for="paCoach">Técnico *</label><select class="select" id="paCoach">${COACHES.map(c => `<option value="${c.id}" ${c.id === pick ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label for="paTeam">Equipe</label><select class="select" id="paTeam"><option value="">—</option>${TEAMS.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></div></div>
    <div class="field"><label for="paDesc">Descrição *</label><input class="input" id="paDesc" placeholder="Copa Regional Sub-17, fase final"></div>
    <div class="row2"><div class="field"><label for="paDate" id="paDateLbl">Primeiro dia *</label><input class="input" type="date" id="paDate" value="${ymd(TODAY)}"></div>
      <div class="field" id="paQtyBox"><label for="paQty" id="paQtyLbl">Dias de competição</label><input class="input" type="number" id="paQty" min="0.5" step="0.5" value="1"></div></div>
    <div class="field hide" id="paValBox"><label for="paVal">Valor (R$) *</label><input class="input" type="number" id="paVal" min="0" step="0.01"></div>
    <div class="preview" id="paPrev"></div><div class="err" id="paErr" role="alert"></div></div>
    <div class="d-foot"><button class="btn" data-act="${coach ? 'pay-review' : 'close-dialog'}" data-id="${coach}">${coach ? 'Voltar' : 'Cancelar'}</button><button class="btn primary" data-act="pay-add-save">Lançar</button></div>`);
  const st = { type: 'competicao', back: coach };
  const prev = () => {
    const c = coachOf($('#paCoach').value), q = Number($('#paQty').value) || 0, v = centsInput($('#paVal').value);
    const val = st.type === 'competicao' ? c.daily * q : st.type === 'extra' ? (v > 0 ? v : 0) : Math.round(c.rate * q);
    $('#paPrev').innerHTML = st.type === 'competicao' && !(c.daily > 0) ? `<small>Valor</small>A diária de ${esc(payFirst(c.name))} ainda não foi definida. Defina em <b>Valores e PIX</b> antes de lançar diárias.`
      : `<small>Valor que entra na folha</small>${money(val)} ${st.type === 'competicao' ? `(${q} × diária ${money(c.daily)})` : st.type === 'treino' ? `(${q} h × ${money(c.rate)})` : ''}`;
  };
  $('#paType').addEventListener('click', e => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    st.type = b.dataset.v; $$('#paType button').forEach(x => x.classList.toggle('on', x === b));
    $('#paQtyLbl').textContent = st.type === 'competicao' ? 'Dias de competição' : 'Horas';
    $('#paDateLbl').textContent = st.type === 'competicao' ? 'Primeiro dia *' : 'Data *';
    $('#paQtyBox').classList.toggle('hide', st.type === 'extra'); $('#paValBox').classList.toggle('hide', st.type !== 'extra'); prev();
  });
  ['paCoach', 'paQty', 'paVal'].forEach(i => $('#' + i).addEventListener('input', prev)); prev();
  $('#dlg')._pa = st;
}
async function payAddSave() {
  const st = $('#dlg')._pa, coach = $('#paCoach').value, c = coachOf(coach), desc = $('#paDesc').value.trim(), date = $('#paDate').value;
  const q = st.type === 'extra' ? 1 : Number($('#paQty').value), v = centsInput($('#paVal').value), team = $('#paTeam').value;
  const err = m => { $('#paErr').textContent = m; };
  if (!desc || !date) return err('Preencha a descrição e a data.');
  if (st.type === 'competicao' && !(Number.isInteger(q) && q > 0)) return err('Informe um número inteiro de dias de competição.');
  if (st.type === 'competicao' && !(c.daily > 0)) return err(`Defina a diária de ${payFirst(c.name)} em Valores e PIX antes de lançar diárias.`);
  if (st.type === 'treino' && !(q > 0)) return err('Informe as horas do treino.');
  if (st.type === 'extra' && !(v > 0)) return err('Informe o valor do extra.');
  const days = st.type === 'competicao' ? q : 1;
  const rows = Array.from({ length: days }, (_, k) => ({ coach_id: coach, team_id: team || null,
    item_date: st.type === 'competicao' ? ymd(addDays(parseYmd(date), k)) : date,
    kind: ({ competicao: 'competition', treino: 'training', extra: 'extra' })[st.type], description: desc,
    hours: st.type === 'competicao' || st.type === 'extra' ? 0 : q, amount_cents: st.type === 'extra' ? v : null,
    status: 'approved', created_by: APOLLO_AUTH.user.id }));
  const { error } = await financeDbClient().from('v2_coach_items').insert(rows);
  if (error) return err(payErr(error));
  S.pay.month = date.slice(0, 7); S.pay.auto = false;
  await liveReload(); toast(`Lançado na folha de ${payFirst(c.name)} (${monthLabel(S.pay.month)}).`);
  return st.back === coach ? payReview(coach) : closeDialog();
}

function payExport() {
  const key = S.pay.month, typ = { treino: 'Treino', competicao: 'Diária de competição', extra: 'Extra' }, stl = { pendente: 'Para revisar', aprovado: 'Aprovado', reprovado: 'Reprovado' };
  const rows = COACHES.flatMap(c => { const r = payCoach(c.id, key); return r.all.map(i => [c.name, i.date.split('-').reverse().join('/'), typ[i.type],
    i.type === 'treino' ? (teamOf(i.teamId)?.name || String(i.desc).replace(PAY_APP_TAG, '')) : i.desc, i.hours ? String(i.hours).replace('.', ',') : '',
    (r.value(i) / 100).toFixed(2).replace('.', ','), stl[i.status] + (r.paid && i.status === 'aprovado' ? ' (pago)' : '')]); });
  download(`folha-tecnicos-${key}.csv`, csv([['Técnico', 'Data', 'Tipo', 'Descrição', 'Horas', 'Valor (R$)', 'Situação'], ...rows]));
}

async function payrollAction(a, el) {
  const id = el.dataset.id;
  switch (a) {
    case 'pay-review': return payReview(id);
    case 'pay-review-save': return payReviewSave(id);
    case 'pay-pay': return payPay(id);
    case 'pay-pay-save': return payPaySave(id);
    case 'pay-rates-open': return payRates(id || '');
    case 'pay-rates-save': return payRatesSave(id || '');
    case 'pay-add': return payAddForm(id || '');
    case 'pay-add-save': return payAddSave();
    case 'pay-export': return payExport();
    case 'pay-copy-pix': { const c = coachOf(id); try { await navigator.clipboard.writeText(c.pix); toast('Chave PIX copiada.'); } catch { toast('Não foi possível copiar. Selecione a chave e copie manualmente.', true); } return; }
    case 'pay-month': {
      const [y, m] = S.pay.month.split('-').map(Number), k = monthKey(new Date(y, m - 1 + Number(el.dataset.d), 1));
      if (k > CUR_MONTH || k < PAY_MIN_MONTH()) return;
      S.pay.month = k; S.pay.auto = false; return render();
    }
    case 'pay-next': {
      const rows = COACHES.map(c => payCoach(c.id, S.pay.month)).sort((x, y) => y.total - x.total);
      const r = rows.find(x => x.state === (el.dataset.step === 'pay' ? 'ready' : 'review'));
      return r ? (el.dataset.step === 'pay' ? payPay(r.c.id) : payReview(r.c.id)) : null;
    }
  }
}
