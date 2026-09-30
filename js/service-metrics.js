'use strict';
const SERVICE = { data: null, error: '' };
async function serviceMetricsLoad() {
  SERVICE.data = null; SERVICE.error = '';
  if (!canView('overview') || !['admin','attendance','coordination','finance'].includes(APOLLO_AUTH.access?.role)) return;
  try {
    const { data, error } = await financeDbClient().rpc('v2_service_metrics');
    if (error) throw error;
    SERVICE.data = data;
  } catch (error) { SERVICE.error = 'Não foi possível carregar os indicadores de atendimento.'; }
}
function serviceDuration(seconds) {
  if (seconds == null || !Number.isFinite(Number(seconds))) return '—';
  if (seconds < 60) return `${Math.round(seconds)} s`;
  if (seconds < 3600) return `${(seconds / 60).toLocaleString('pt-BR',{maximumFractionDigits:1})} min`;
  return `${(seconds / 3600).toLocaleString('pt-BR',{maximumFractionDigits:1})} h`;
}
function serviceMetricsHTML() {
  if (SERVICE.error) return `<div class="banner warn mt">${icon('alert')}<span>${esc(SERVICE.error)} <button class="btn sm" data-act="service-refresh">Tentar novamente</button></span></div>`;
  const m = SERVICE.data;
  if (!m) return '';
  const metrics = [
    ['1ª resposta do assistente',serviceDuration(m.firstResponseSeconds),`${m.firstResponseCount} conversa(s) com resposta`, 'bot'],
    ['Tempo até agendar',serviceDuration(m.bookingSeconds),`${m.bookingCount} novo(s) agendamento(s) pelo chat`, 'clock'],
    ['Retorno humano',serviceDuration(m.humanReplySeconds),`${m.humanReplyCount} resposta(s) registrada(s) · ${m.pendingHandoffs} aguardando`, 'whatsapp'],
    ['Satisfação',m.csatPercent == null ? '—' : `${Number(m.csatPercent).toLocaleString('pt-BR',{maximumFractionDigits:0})}%`,
      `${m.ratingCount} avaliação(ões)${m.ratingAverage == null ? '' : ` · média ${Number(m.ratingAverage).toLocaleString('pt-BR',{maximumFractionDigits:1})}/5`}`, 'star']
  ];
  return `<div class="service-metrics mt">${metrics.map(([label,value,note,i])=>`<div class="service-metric">${kpiIcon(i)}${metricInfo(label)}<span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join('')}</div>
    <p class="hint mt">Atendimentos iniciados nos últimos 30 dias. ${m.started} conversa(s) instrumentada(s). ${m.started ? 'Tempos médios em horas corridas.' : 'Aguardando novas conversas; o histórico anterior não tem estas medições.'} Retorno humano depende do registro do atendente no momento da resposta.</p>`;
}
function canUseServiceQueue() {
  return !S.previewRole && canView('bookings') && ['admin','attendance','coordination'].includes(APOLLO_AUTH.access?.role);
}
async function openServiceQueue() {
  if (!canUseServiceQueue()) return;
  openDialog(dHead('Atendimento humano','Pedidos vindos do chatbot','O contato é o da pessoa que iniciou a conversa; em atendimento de menores, confirme que é o responsável.')+
    '<div class="d-body" id="serviceQueue"><p>Carregando solicitações…</p></div><div class="d-foot"><button class="btn" data-act="close-dialog">Fechar</button></div>','drawer wide');
  try {
    const {data,error} = await financeDbClient().rpc('v2_service_queue');
    if (error) throw error;
    const target = $('#serviceQueue'); if (!target) return;
    target.innerHTML = `<p class="small">Abra o WhatsApp e envie a primeira resposta. Logo depois, clique em <b>Registrar primeira resposta</b>. Abrir a conversa não registra uma resposta nem envia mensagem. A medição usa o horário deste registro.</p>${data.length ? data.map(row=> {
      const href = finWhatsappHref(row.phone);
      return `<div class="contact-row"><div><strong>${esc(row.contact_name)}</strong><div class="hint">Pedido em ${esc(new Date(row.handoff_at).toLocaleString('pt-BR'))}</div><div class="hint">${row.human_reply_at ? 'Resposta registrada em '+esc(new Date(row.human_reply_at).toLocaleString('pt-BR')) : 'Aguardando primeira resposta'}</div></div><div class="chips">${href ? `<a class="btn sm wa" href="${href}" target="_blank" rel="noopener noreferrer">${icon('whatsapp')} WhatsApp</a>` : '<span>Telefone inválido</span>'}${!row.human_reply_at && canEdit('bookings') ? `<button class="btn sm" data-act="service-replied" data-id="${esc(row.id)}" data-need="bookings" data-edit>Registrar primeira resposta</button>` : ''}</div></div>`;
    }).join('') : '<p class="muted">Nenhum pedido de atendimento humano registrado.</p>'}`;
  } catch(error) { if ($('#serviceQueue')) $('#serviceQueue').textContent = 'Não foi possível carregar as solicitações. Feche e tente novamente.'; }
}
async function serviceRecordReply(id) {
  if (!canUseServiceQueue() || !canEdit('bookings')) return;
  if (!await confirmBox({title:'Registrar primeira resposta enviada?',text:'Confirme apenas após enviar sua primeira resposta no WhatsApp. O horário atual será registrado para medir o retorno humano.',ok:'Já respondi — registrar agora'})) return;
  const {error} = await financeDbClient().rpc('v2_service_record_reply',{p_session:id});
  if(error) return toast('Não foi possível registrar. A solicitação pode já ter sido atendida.',true);
  await serviceMetricsLoad(); await openServiceQueue(); toast('Primeira resposta registrada.');
}
