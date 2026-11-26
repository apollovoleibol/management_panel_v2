/* Apollo · Contrato de Prestação de Serviços de Treinamento Desportivo — temporada 2027
   Fonte única do texto: usada pelo formulário de rematrícula (preenchido com os dados do contratante),
   pela página pública contrato-2027.html (modelo em branco) e pelo Huddle (via assinada).
   Mudou o texto? Troque CONTRATO_VERSION aqui e em private.reenroll_contract() (migração nova):
   quem aceitou a versão anterior precisa aceitar de novo. */
'use strict';

const CONTRATO_VERSION = 'contrato-2027-v1';

const CONTRATADA = {
  nome: 'GAV – Grupo Apollo de Voleibol', fantasia: 'Apollo Voleibol', cnpj: '53.617.328/0001-18',
  endereco: 'Rua Canal Belém, 8027, Uberaba, Curitiba/PR, CEP 81580-190',
  whatsapp: '(41) 999147597', email: 'apollovoleibol@gmail.com', pix: 'apollovoleibol@gmail.com',
};

// Datas e valores da temporada (cláusulas 2 a 6)
const TEMPORADA = {
  rematricula: '18/11/2026 a 06/12/2026', taxa: 4000, encerramento2026: '12/12/2026', retorno: '18/01/2027',
  fim: '31/12/2027', vencimento: 10, aviso: 11, uniforme: '01/03/2027', frequencia: 75, suspensao: 30,
  // Encargos: multa no teto do CDC, juros no teto do Código Civil/Lei de Usura, correção pelo IPCA, sem congelamento.
  // pontualidade: a mensalidade cheia é o valor da tabela (fee_cents) + 5%; quem paga até o vencimento paga fee_cents.
  multa: 2, juros: 1, pontualidade: 5, avisoNegativacao: 10, rescisao: 60, retencao: 3,
  pacotes: [['3 mensalidades', 'Pix', 7], ['3 mensalidades', 'cartão de crédito', 5], ['5 mensalidades', 'Pix', 10], ['5 mensalidades', 'cartão de crédito', 7]],
};

// Anexo I. Precisa bater com public.reenroll_offers (migração 051): o teste confere chave e valor.
const TURMAS_2027 = [
  { key: 'escolinha-b', label: 'Escolinha B', location: 'Núcleo Apollo – Uberaba', days: 'Sábado', time: '13h30–14h30', freq: '1x por semana', fee_cents: 11090 },
  { key: 'escolinha-c', label: 'Escolinha C', location: 'Núcleo Apollo – Uberaba', days: 'Terça e sexta', time: '18h–19h', freq: '2x por semana', fee_cents: 17990 },
  { key: 'pre-equipe', label: 'Pré-equipe', location: 'Núcleo Apollo – Uberaba', days: 'Sábado', time: '12h30–13h30', freq: '1x por semana', fee_cents: 11090 },
  { key: 'sub-17-18-m', label: 'Sub-17/18 masculino', location: 'Núcleo Apollo – Uberaba', days: 'Terça e quinta', time: '16h30–18h', freq: '2x por semana', fee_cents: 15990 },
  { key: 'sub-16-17-f', label: 'Sub-16/17 feminino', location: 'Núcleo Apollo – Uberaba', days: 'Terça e quinta', time: '15h–16h30', freq: '2x por semana', fee_cents: 19490 },
  { key: 'johnson', label: 'Johnson – adulto feminino', location: 'Núcleo Apollo – Uberaba', days: 'Sábado', time: '10h30–12h30', freq: '1x por semana', fee_cents: 10390 },
  { key: 'escolinha-d', label: 'Escolinha D', location: 'Núcleo Funcel – São Francisco / Bom Retiro', days: 'Terça e sexta', time: '17h–18h', freq: '2x por semana', fee_cents: 17990 },
  { key: 'pre-equipe-b', label: 'Pré-equipe B', location: 'Núcleo Funcel – São Francisco / Bom Retiro', days: 'Terça e sexta', time: '16h–17h', freq: '2x por semana', fee_cents: 17990 },
  { key: 'sub-15-16-f', label: 'Sub-15/16 feminino', location: 'Núcleo Funcel – São Francisco / Bom Retiro', days: 'Segunda e quarta', time: '14h–15h30', freq: '2x por semana', fee_cents: 10000 },
  { key: 'aldrin', label: 'Aldrin – adulto masculino', location: 'Núcleo PUC – Prado Velho', days: 'Sábado', time: '10h–12h', freq: '1x por semana', fee_cents: 10390 },
  { key: 'borman', label: 'Borman – adulto masculino', location: 'Núcleo PUC – Prado Velho', days: 'Sábado', time: '12h–14h', freq: '1x por semana', fee_cents: 10390 },
  { key: 'collins', label: 'Collins – adulto masculino', location: 'Núcleo PUC – Prado Velho', days: 'Sexta', time: '20h–22h', freq: '1x por semana', fee_cents: 10390 },
  { key: 'hopper', label: 'Hopper – adulto feminino', location: 'Núcleo PUC – Prado Velho', days: 'Quarta', time: '20h–22h', freq: '1x por semana', fee_cents: 10390 },
  { key: 'armstrong', label: 'Armstrong – Adulto Start', location: 'Núcleo PUC – Prado Velho', days: 'Segunda, quarta e sábado', time: '19h–20h (seg. e qua.); 9h–10h15 (sáb.)', freq: '3x por semana', fee_cents: 19000 },
];

const ctEsc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ctMoney = cents => (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
// Valor da mensalidade (cheia) a partir do valor com desconto de pontualidade da tabela
const ctCheia = cents => Math.round(Number(cents || 0) * (100 + TEMPORADA.pontualidade) / 100);
const ctBlank = (v, w = 'long') => v ? `<b>${ctEsc(v)}</b>` : `<span class="ct-blank ${w}"></span>`;

/* Quadro de identificação. d = { minor, atleta:{name,cpf,rg,birth}, contratante:{name,cpf,rg,email,phone}, endereco, turma:{...}, imagem } */
function contratoPartes(d = {}) {
  const at = d.atleta || {}, ct = d.contratante || {};
  const doc = p => [p.cpf && `CPF ${ctEsc(p.cpf)}`, p.rg && `RG ${ctEsc(p.rg)}`].filter(Boolean).join(', ');
  const contratante = `${ctBlank(ct.name)}, ${doc(ct) || `CPF ${ctBlank('', 'short')}`}, residente em ${ctBlank(d.endereco)}, e-mail ${ctBlank(ct.email, 'mid')}, WhatsApp ${ctBlank(ct.phone, 'mid')}`;
  const atletaDocs = doc(at);
  return `<p><b>CONTRATADA:</b> ${CONTRATADA.nome} (“${CONTRATADA.fantasia}”), inscrita no CNPJ sob o nº ${CONTRATADA.cnpj}, com sede na ${CONTRATADA.endereco}, WhatsApp oficial ${CONTRATADA.whatsapp} e e-mail ${CONTRATADA.email}.</p>
  ${d.minor === false
    ? `<p><b>CONTRATANTE E ATLETA:</b> ${contratante}, nascido(a) em ${ctBlank(at.birth, 'short')}, que contrata os serviços em nome próprio.</p>`
    : d.minor === true
      ? `<p><b>CONTRATANTE (responsável legal):</b> ${contratante}, que contrata os serviços em favor do(a) atleta abaixo e responde por ele(a) nos termos da lei.</p>
         <p><b>ATLETA (beneficiário(a) dos serviços):</b> ${ctBlank(at.name)}, nascido(a) em ${ctBlank(at.birth, 'short')}${atletaDocs ? `, ${atletaDocs}` : ', sem CPF e RG informados (identificado(a) pelos documentos do responsável legal)'}.</p>`
      : `<p><b>CONTRATANTE:</b> o(a) atleta maior de idade ou, se o(a) atleta for menor de 18 anos, seu(sua) responsável legal, identificado(a) no Quadro-Resumo com nome, CPF, RG (quando houver), endereço, e-mail e WhatsApp.</p>
         <p><b>ATLETA:</b> a pessoa que participa das atividades, identificada no Quadro-Resumo. Atleta menor de idade sem CPF ou RG é identificado(a) pela data de nascimento e pelos documentos do responsável legal.</p>`}`;
}

function contratoQuadro(d = {}) {
  const t = d.turma || {};
  const row = (k, v) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`;
  return `<table class="ct-box"><caption>Quadro-Resumo</caption><tbody>
    ${row('Turma ou equipe', ctBlank(t.label))}
    ${row('Núcleo e local', ctBlank(t.location))}
    ${row('Dias e horários', t.days ? `<b>${ctEsc(t.days)}, ${ctEsc(t.time)}</b>` : ctBlank(''))}
    ${row('Frequência semanal', t.freq ? `<b>${ctEsc(t.freq)}</b>` : ctBlank('', 'short'))}
    ${row('Mensalidade', t.fee_cents ? `<b>${ctMoney(ctCheia(t.fee_cents))}</b>, com vencimento todo dia ${TEMPORADA.vencimento}` : `${ctBlank('', 'short')}, com vencimento todo dia ${TEMPORADA.vencimento}`)}
    ${row('Pagamento até o vencimento', t.fee_cents ? `<b>${ctMoney(t.fee_cents)}</b>, com desconto de pontualidade de ${ctMoney(ctCheia(t.fee_cents) - t.fee_cents)} (Cláusula 4.2)` : `${ctBlank('', 'short')}, com desconto de pontualidade (Cláusula 4.2)`)}
    ${row('Taxa de rematrícula', `<b>${ctMoney(TEMPORADA.taxa)}</b>, por Pix (chave ${CONTRATADA.pix}), antecipação de parte da mensalidade de janeiro de 2027, descontada dela (Cláusula 2.2)`)}
    ${row('Vigência', `da confirmação da rematrícula até <b>${TEMPORADA.fim}</b>, sem renovação automática para 2028`)}
    ${row('Uso de imagem e voz', d.imagem === true ? '<b>Autorizado</b> (Cláusula 13)' : d.imagem === false ? '<b>Não autorizado</b> (Cláusula 13)' : ctBlank('', 'short'))}
  </tbody></table>`;
}

function contratoHtml(d = {}) {
  const T = TEMPORADA;
  const pacotes = T.pacotes.map(([n, m, p]) => `<tr><td>${n}</td><td>${m}</td><td class="num">${p}%</td></tr>`).join('');
  const sign = d.assinatura;
  return `<div class="ct">
<h2 class="ct-title">Contrato de Prestação de Serviços de Treinamento Desportivo – Voleibol<br><small>Temporada 2027 · versão ${CONTRATO_VERSION}</small></h2>
${contratoPartes(d)}
${contratoQuadro(d)}
<p class="ct-note">As cláusulas que limitam direitos do CONTRATANTE estão destacadas em negrito, como exige o art. 54, § 4º, do Código de Defesa do Consumidor.</p>

<h3>1. Objeto</h3>
<p>1.1. A CONTRATADA presta ao(à) ATLETA serviços de treinamento desportivo na modalidade voleibol, na turma, nos dias e nos horários do Quadro-Resumo, com orientação de profissionais de Educação Física habilitados.</p>
<p>1.2. A CONTRATADA se obriga a empregar os meios adequados ao treinamento (obrigação de meio). <b>Não há garantia de resultado esportivo, de convocação para competições, de posição em quadra ou de tempo de jogo</b>, que dependem de critérios técnicos da comissão técnica.</p>
<p>1.3. Integram este contrato, como se nele estivessem transcritos: o Quadro-Resumo; o Anexo I (turmas, horários e mensalidades de 2027); o Anexo II (política de cobrança); e o Regulamento do Atleta 2027, disponível em apollovoleibol.github.io/management_panel_v2/regulamento-2027.html. Havendo divergência, prevalece este contrato.</p>

<h3>2. Rematrícula, taxa e confirmação</h3>
<p>2.1. A rematrícula é feita de ${T.rematricula} pelo formulário oficial, com revisão do cadastro, preenchimento da anamnese, escolha da turma, aceite deste contrato e pagamento da taxa de rematrícula.</p>
<p>2.2. A taxa de rematrícula é de <b>${ctMoney(T.taxa)}</b>, paga por Pix para a chave <b>${CONTRATADA.pix}</b>, com o comprovante anexado no formulário. <b>Ela é uma antecipação de parte da mensalidade de janeiro de 2027</b>, paga como sinal de confirmação da vaga (arts. 417 a 420 do Código Civil), e não uma cobrança adicional: o valor é descontado integralmente da mensalidade de janeiro, que fica reduzida ao saldo. O desconto de pontualidade de janeiro vale para o saldo pago até o vencimento, e os encargos da Cláusula 5, se houver atraso, incidem só sobre o saldo.</p>
<p>2.3. <b>A rematrícula só é confirmada depois que a administração da CONTRATADA conferir e validar o comprovante.</b> Comprovante ilegível, de valor diferente ou sem o pagamento correspondente é recusado, com aviso ao CONTRATANTE, que pode enviar outro.</p>
<p>2.4. A rematrícula garante prioridade na formação das turmas, mas não a manutenção do mesmo horário ou da mesma composição de 2026. A troca de turma depende de vaga e de avaliação técnica. Se a turma escolhida não for formada ou não houver vaga, a CONTRATADA oferecerá alternativa; não havendo acordo, a taxa é devolvida integralmente em até 10 (dez) dias.</p>
<p>2.5. Por ser contratado pela internet, o CONTRATANTE pode desistir deste contrato em até 7 (sete) dias da confirmação, com devolução integral da taxa (art. 49 do Código de Defesa do Consumidor). <b>Fora desse prazo e da hipótese do item 2.4, se o CONTRATANTE desistir antes de janeiro de 2027, o valor antecipado não é devolvido</b>, pois funciona como sinal pela vaga reservada e pela organização da temporada (art. 418 do Código Civil). Se a CONTRATADA não prestar os serviços por motivo que lhe seja imputável, devolve o valor integralmente. Mantido o contrato, o valor é sempre aproveitado na mensalidade de janeiro.</p>
<p>2.6. As atividades de 2026 terminam em ${T.encerramento2026}. Há recesso de fim de ano, sem atividades regulares, e o retorno está previsto para ${T.retorno}. Datas e horários definitivos são comunicados pelos canais oficiais.</p>

<h3>3. Vigência e cancelamento</h3>
<p>3.1. O contrato vale da confirmação da rematrícula até ${T.fim}. Termina nessa data, sem renovação automática; a continuidade em 2028 depende de nova rematrícula.</p>
<p>3.2. O CONTRATANTE pode cancelar a qualquer tempo, sem multa, pelo WhatsApp oficial ${CONTRATADA.whatsapp} ou pelo e-mail ${CONTRATADA.email}. A CONTRATADA confirma o recebimento por escrito, com data, em até 2 (dois) dias úteis; essa confirmação serve de protocolo.</p>
<p>3.3. <b>Para que a mensalidade seguinte não seja cobrada, o pedido deve ser feito com pelo menos ${T.aviso} (onze) dias de antecedência do próximo vencimento.</b> Pedido feito depois desse prazo encerra o contrato no vencimento subsequente: essa última mensalidade é devida e o(a) ATLETA pode treinar até o fim do período pago.</p>
<p>3.4. No cancelamento de pacote pago antecipadamente (Anexo II), os meses já iniciados são recalculados pelo valor com desconto de pontualidade, sem o desconto do pacote, e a diferença é devolvida em até 30 (trinta) dias, pelo mesmo meio de pagamento.</p>
<p>3.5. A CONTRATADA pode encerrar o contrato, com aviso por escrito: (a) por falta grave do(a) ATLETA ou do CONTRATANTE prevista no Regulamento do Atleta, após o procedimento da Cláusula 10; (b) por inadimplência superior a ${T.rescisao} (sessenta) dias, com liberação da vaga e sem prejuízo da cobrança do débito; (c) se a turma for extinta, hipótese em que oferece outra turma ou devolve o que tiver sido pago por período não usufruído.</p>

<h3>4. Mensalidades e pagamento</h3>
<p>4.1. O CONTRATANTE paga a mensalidade do Quadro-Resumo, com vencimento todo dia ${T.vencimento}, pelos meios oficiais da CONTRATADA (Pix recorrente, QR Code ou cartão de crédito, conforme a plataforma de cobrança em uso). Ao usar Pix recorrente, o CONTRATANTE deve autorizar a recorrência no aplicativo indicado; sem a autorização, o pagamento é feito por QR Code avulso.</p>
<p>4.2. <b>Desconto de pontualidade:</b> a mensalidade paga integralmente até a data do vencimento tem desconto de pontualidade, no valor indicado no Quadro-Resumo e no Anexo I. O desconto é um benefício concedido a quem paga em dia; <b>a mensalidade paga após o vencimento é devida pelo valor integral, sem o desconto</b>, acrescida dos encargos da Cláusula 5, calculados sobre o valor integral. A perda do desconto vale só para a mensalidade paga em atraso. Se o vencimento cair em sábado, domingo ou feriado, o pagamento no primeiro dia útil seguinte conserva o desconto. O desconto de pontualidade não pode ser reduzido nem suprimido durante a vigência deste contrato.</p>
<p>4.3. Enquanto a plataforma de cobrança não permitir aplicar o desconto automaticamente, a cobrança pode ser emitida já pelo valor com desconto; se o pagamento ocorrer depois do vencimento, a diferença até o valor integral e os encargos da Cláusula 5 são cobrados à parte ou somados à mensalidade seguinte, com o cálculo informado ao CONTRATANTE.</p>
<p>4.4. <b>A mensalidade é um valor fixo mensal, que não depende da quantidade de treinos do mês, e já considera feriados e os recessos do calendário. Faltas do(a) ATLETA, justificadas ou não, não reduzem nem dispensam a mensalidade.</b></p>
<p>4.5. Treino cancelado por iniciativa da CONTRATADA (indisponibilidade de quadra ou de professor, por exemplo) é reposto em data comunicada com antecedência. Se não houver reposição em até 60 (sessenta) dias, o valor proporcional do treino, calculado sobre o valor com desconto de pontualidade, é abatido da mensalidade seguinte. Suspensões determinadas por autoridade pública ou por caso fortuito e força maior seguem a Cláusula 15.</p>
<p>4.6. Os valores do Anexo I valem para toda a temporada 2027, sem reajuste durante a vigência.</p>
<p>4.7. A CONTRATADA pode oferecer pacotes de mensalidades pagas antecipadamente, com desconto, conforme o Anexo II, enquanto estiverem disponíveis na plataforma de cobrança. O desconto do pacote incide sobre o valor com desconto de pontualidade, já que o pagamento é antecipado. Os descontos de pacote não se acumulam com outras promoções, salvo aviso em contrário. Despesas com competições, viagens, uniformes e eventos não estão incluídas na mensalidade (Cláusulas 7 e 8).</p>
<p>4.8. A CONTRATADA pode trocar a plataforma de cobrança (hoje, Tecnofit), inclusive por sistema próprio, e os meios de pagamento disponíveis, mediante aviso com pelo menos 30 (trinta) dias de antecedência, com as instruções para a nova forma de pagamento. A troca não altera o valor da mensalidade, não cria custo adicional para o CONTRATANTE e dispensa novo contrato. Se a nova forma de pagamento impedir o CONTRATANTE de pagar, ele pode cancelar sem a antecedência do item 3.3.</p>
<p>4.9. A Política de Cobrança (Anexo II) pode ser atualizada pela CONTRATADA, com aviso pelos canais oficiais, para criar, alterar ou encerrar pacotes e condições de pagamento antecipado, sempre dentro dos limites da Cláusula 5 e sem reduzir o desconto de pontualidade do item 4.2. Pacotes já contratados mantêm as condições da data da compra.</p>

<h3>5. Atraso e inadimplência</h3>
<p>5.1. <b>A mensalidade não paga até o vencimento fica sujeita, sobre o valor integral (sem o desconto de pontualidade), a:</b></p>
<ul>
<li><b>multa moratória de ${T.multa}% (dois por cento)</b>, cobrada uma única vez (art. 52, § 1º, do Código de Defesa do Consumidor);</li>
<li><b>juros de mora simples de ${T.juros}% (um por cento) ao mês</b>, sem capitalização, calculados dia a dia desde o dia seguinte ao vencimento até o pagamento (arts. 395 e 406 do Código Civil);</li>
<li><b>correção monetária pela variação do IPCA/IBGE</b>, desde o vencimento até o pagamento, ou pelo índice oficial que o substituir. Variação negativa do índice não reduz o valor devido.</li>
</ul>
<p>5.2. Os encargos correm até a quitação. Mudanças da Política de Cobrança não podem aumentar os percentuais do item 5.1 e só valem para mensalidades que vencerem depois do aviso.</p>
<p>5.3. <b>Com ${T.suspensao} (trinta) dias de atraso, contados do vencimento, o(a) ATLETA fica suspenso(a) de treinos e atividades e não pode ser convocado(a) para competições</b> até a quitação, com aviso prévio pelos canais oficiais. Durante a suspensão a vaga fica reservada e o contrato continua em vigor, de modo que as mensalidades seguintes continuam vencendo, salvo cancelamento na forma da Cláusula 3. A participação volta no primeiro treino depois da confirmação do pagamento.</p>
<p>5.4. Débito não pago pode ser cobrado extrajudicial ou judicialmente. <b>Antes, a CONTRATADA envia ao CONTRATANTE aviso por escrito, pelos contatos cadastrados, com o valor atualizado e prazo mínimo de ${T.avisoNegativacao} (dez) dias para pagamento; sem o pagamento, o débito pode ser registrado em cadastros de proteção ao crédito (SPC, Serasa e similares) ou levado a protesto.</b> O registro observa a comunicação prévia do art. 43, § 2º, do Código de Defesa do Consumidor, e o protesto, a Lei nº 9.492/1997. Quitado o débito, a CONTRATADA pede a baixa do registro ou fornece a carta de anuência do protesto em até 5 (cinco) dias úteis.</p>
<p>5.5. A cobrança nunca expõe o(a) ATLETA ou o CONTRATANTE a constrangimento ou ameaça, nem é feita perante colegas ou em treinos e competições (art. 42 do Código de Defesa do Consumidor). Valores cobrados indevidamente são devolvidos na forma da lei.</p>
<p>5.6. Os percentuais desta cláusula são o máximo aplicável. A CONTRATADA pode aplicar valores menores ou conceder tolerância, sem que isso altere o contrato ou se torne obrigatório nos meses seguintes.</p>

<h3>6. Frequência</h3>
<p>6.1. <b>Atletas de equipes competitivas devem ter presença mínima de ${T.frequencia}% (setenta e cinco por cento) nos treinos e atividades programadas de cada mês.</b> Abaixo disso, a comissão técnica pode deixar de convocar o(a) ATLETA para competições, transferi-lo(a) para outra turma do mesmo valor ou inferior, ou, em caso de reincidência, desligá-lo(a) da equipe competitiva, sempre considerando as justificativas apresentadas (saúde, provas escolares, luto e situações semelhantes).</p>
<p>6.2. O desligamento da equipe competitiva não encerra o contrato: o(a) ATLETA pode seguir em outra turma compatível, ou o CONTRATANTE pode cancelar na forma da Cláusula 3.</p>

<h3>7. Uniformes e equipamentos</h3>
<p>7.1. <b>A partir de ${T.uniforme}, o uso do uniforme de treino da Apollo é obrigatório</b>, assim como roupas e acessórios adequados à prática do voleibol (tênis próprio para quadra e, quando indicado pelo técnico, joelheiras e outros itens de proteção).</p>
<p>7.2. <b>O técnico pode impedir a participação no treino do(a) ATLETA que estiver sem uniforme ou sem os acessórios adequados, sem desconto na mensalidade.</b> O(A) ATLETA menor de idade impedido(a) de treinar permanece sob supervisão no local até o fim do horário ou até ser buscado(a).</p>
<p>7.3. Os uniformes são vendidos à parte, sob encomenda, com prazo de entrega informado no pedido. Se a CONTRATADA não tiver uniforme disponível para entrega, a obrigatoriedade fica suspensa para quem fez o pedido até a entrega.</p>

<h3>8. Competições e viagens</h3>
<p>8.1. A convocação e a escalação são de responsabilidade exclusiva da comissão técnica, por critérios técnicos, táticos, físicos e comportamentais e pela adimplência (Cláusula 5.3).</p>
<p>8.2. Inscrições, taxas de federação, transporte, hospedagem, alimentação e outras despesas de competições e viagens não estão incluídas na mensalidade. A CONTRATADA informa por escrito o valor estimado e o prazo de pagamento antes de cada evento; a participação depende da adesão do CONTRATANTE.</p>
<p>8.3. A participação de ATLETA menor de idade em competições e viagens depende de autorização específica por escrito do responsável legal para cada evento, além das autorizações exigidas pelo Estatuto da Criança e do Adolescente.</p>
<p>8.4. <b>Desistência depois da confirmação da participação obriga ao reembolso das despesas já pagas pela CONTRATADA em nome do(a) ATLETA que não possam ser canceladas ou reaproveitadas</b>, mediante apresentação dos comprovantes. Desistências por motivo de saúde comprovado ou outro motivo de força maior são analisadas caso a caso.</p>

<h3>9. Saúde e segurança</h3>
<p>9.1. O CONTRATANTE responde a anamnese no formulário de rematrícula e declara que as informações são verdadeiras, completas e atuais, comprometendo-se a informar qualquer mudança de saúde, lesão, medicação ou restrição do(a) ATLETA antes do treino seguinte.</p>
<p>9.2. Quando a anamnese ou o acompanhamento indicarem risco, a CONTRATADA pode solicitar avaliação médica antes da continuidade e, até apresentá-la, afastar o(a) ATLETA das atividades que representem risco, sem que isso configure descumprimento do contrato.</p>
<p>9.3. Em caso de mal-estar ou lesão, a CONTRATADA presta os primeiros socorros, aciona o serviço de emergência quando necessário e avisa o contato de emergência cadastrado. Despesas médicas, hospitalares e de transporte para atendimento correm por conta do CONTRATANTE ou de seu plano de saúde.</p>
<p>9.4. Este contrato não exclui nem limita as responsabilidades da CONTRATADA previstas em lei pela segurança e pela adequada prestação dos serviços.</p>

<h3>10. Conduta e Regulamento do Atleta</h3>
<p>10.1. O(A) ATLETA e o CONTRATANTE se comprometem a respeitar professores, colegas, adversários, árbitros, funcionários e público; a cumprir horários; a não praticar condutas agressivas, discriminatórias ou de assédio; e a seguir o Regulamento do Atleta 2027.</p>
<p>10.2. O descumprimento sujeita o(a) ATLETA às medidas do Regulamento do Atleta, de forma proporcional à gravidade: advertência verbal, advertência escrita, suspensão de treinos ou competições e desligamento. <b>Suspensão e desligamento só são aplicados depois de ouvir o(a) ATLETA e, se menor de idade, seu responsável legal</b>, salvo afastamento imediato e provisório quando houver risco à integridade de alguém.</p>
<p>10.3. Medidas disciplinares não geram cobrança de multa. Danos materiais causados com dolo ou culpa devem ser ressarcidos pelo valor comprovado.</p>

<h3>11. Atleta menor de idade</h3>
<p>11.1. O responsável legal contrata em nome próprio e responde pelas obrigações deste contrato, inclusive as financeiras.</p>
<p>11.2. A CONTRATADA é responsável pelo(a) ATLETA menor de idade durante o horário da atividade, no local de treino. <b>Antes do início e depois do término, a responsabilidade é do responsável legal</b>, que deve trazer e buscar o(a) ATLETA pontualmente. Se o(a) ATLETA puder chegar ou sair desacompanhado(a), o responsável legal deve autorizar por escrito.</p>
<p>11.3. O responsável legal recebe os comunicados, autoriza competições e viagens, e exerce os direitos do(a) ATLETA previstos neste contrato e na Lei Geral de Proteção de Dados.</p>

<h3>12. Proteção de dados pessoais (LGPD)</h3>
<p>12.1. A CONTRATADA é a controladora dos dados pessoais do(a) ATLETA e do CONTRATANTE, tratados conforme a Lei nº 13.709/2018 (LGPD), para: executar este contrato (cadastro, turmas, frequência, cobrança e comunicação); cumprir obrigações legais e fiscais; inscrever o(a) ATLETA em competições e federações; e zelar pela saúde e segurança na prática esportiva.</p>
<p>12.2. Os dados de saúde (anamnese, estatura e peso) são dados sensíveis, tratados com consentimento específico e destacado, dado no formulário pelo(a) ATLETA ou, se menor de idade, por seu responsável legal (arts. 11 e 14 da LGPD), e para a proteção da vida e da integridade física do(a) ATLETA. O acesso é restrito à comissão técnica e à administração.</p>
<p>12.3. Os dados podem ser compartilhados apenas com organizadores de competições e federações (para inscrições), com a plataforma de cobrança, com os provedores de tecnologia que hospedam os sistemas da CONTRATADA, inclusive com servidores fora do Brasil, observado o art. 33 da LGPD, e com autoridades, quando a lei exigir. A CONTRATADA não vende dados pessoais.</p>
<p>12.4. <b>Os dados são mantidos por ${T.retencao} (três) anos depois do fim do vínculo</b> e, em seguida, eliminados ou anonimizados, exceto os que a lei obriga a guardar por mais tempo (registros fiscais e financeiros, por exemplo), mantidos apenas pelo prazo legal.</p>
<p>12.5. O titular ou seu responsável legal pode pedir confirmação, acesso, correção, portabilidade, eliminação e informação sobre compartilhamento, e revogar consentimentos, pelo e-mail ${CONTRATADA.email}, que é também o canal do encarregado pelo tratamento. A CONTRATADA responde em até 15 (quinze) dias. A revogação do consentimento para dados de saúde impede a participação em atividades físicas, por razão de segurança.</p>
<p>12.6. Em caso de incidente de segurança com risco relevante, a CONTRATADA comunica os titulares afetados e a Autoridade Nacional de Proteção de Dados, na forma da lei.</p>

<h3>13. Uso de imagem e voz</h3>
<p>13.1. A captação e a divulgação da imagem, da voz e do nome do(a) ATLETA dependem de autorização específica, dada ou recusada no formulário e registrada no Quadro-Resumo. A recusa não prejudica a matrícula nem a participação nas atividades.</p>
<p>13.2. Quando autorizado, o uso é gratuito, por prazo indeterminado enquanto não revogado, em território nacional e na internet, exclusivamente para fins institucionais, esportivos e de comunicação da CONTRATADA (redes sociais, site, materiais impressos e vídeos institucionais), vedado uso ofensivo, vexatório ou alheio a essas finalidades. Não autoriza a venda da imagem a terceiros.</p>
<p>13.3. A autorização pode ser revogada a qualquer tempo, por escrito, pelos canais oficiais. A revogação vale para novas publicações; materiais já publicados são retirados dos canais controlados pela CONTRATADA em até 15 (quinze) dias, quando tecnicamente possível, e não se exige a retirada de impressos já distribuídos.</p>
<p>13.4. Sem autorização, a CONTRATADA não publica imagens em que o(a) ATLETA possa ser identificado(a). Em registros coletivos de jogos e eventos abertos ao público, a CONTRATADA evita o destaque do(a) ATLETA e, se solicitado, retira ou desfoca a imagem.</p>

<h3>14. Comunicações</h3>
<p>14.1. As comunicações são feitas pelo WhatsApp oficial e pelo e-mail da CONTRATADA e pelos contatos informados pelo CONTRATANTE, que se obriga a mantê-los atualizados. Mensagens enviadas aos contatos cadastrados são consideradas recebidas.</p>
<p>14.2. Mudanças de dias, horários ou local de treino são comunicadas com pelo menos 15 (quinze) dias de antecedência, salvo emergência. Se a mudança impedir a participação, o CONTRATANTE pode cancelar sem a antecedência do item 3.3 e sem qualquer custo adicional.</p>

<h3>15. Caso fortuito e força maior</h3>
<p>15.1. Eventos alheios ao controle das partes (determinação de autoridade, calamidade, epidemia, interdição do local, eventos climáticos graves) podem suspender as atividades. A CONTRATADA repõe os treinos quando possível ou oferece atividade alternativa. Se a suspensão passar de 30 (trinta) dias, o CONTRATANTE pode suspender os pagamentos do período sem atividade ou cancelar sem custo.</p>

<h3>16. Alterações</h3>
<p>16.1. Alterações deste contrato e dos anexos são comunicadas com pelo menos 30 (trinta) dias de antecedência e não alteram valores durante a temporada. O CONTRATANTE que não concordar pode cancelar sem custo antes de a alteração entrar em vigor.</p>

<h3>17. Aceite e assinatura eletrônica</h3>
<p>17.1. O contrato é aceito eletronicamente no formulário de rematrícula, depois da identificação do CONTRATANTE por CPF ou WhatsApp e data de nascimento do(a) ATLETA. O aceite registra data e hora, endereço IP, dispositivo, a versão do contrato e um código de integridade (SHA-256) do texto aceito.</p>
<p>17.2. As partes reconhecem esse aceite como assinatura eletrônica válida, nos termos do art. 10, § 2º, da Medida Provisória nº 2.200-2/2001 e da Lei nº 14.063/2020. O CONTRATANTE pode baixar uma via em PDF a qualquer momento e, se quiser, assiná-la também com a assinatura gov.br.</p>

<h3>18. Solução de conflitos e foro</h3>
<p>18.1. As partes buscarão resolver divergências primeiro pelos canais oficiais e, se necessário, por mediação, sem prejuízo do direito do CONTRATANTE de recorrer ao Procon, à plataforma consumidor.gov.br ou ao Judiciário.</p>
<p>18.2. Fica eleito o foro do domicílio do CONTRATANTE (art. 101, I, do Código de Defesa do Consumidor).</p>

<h3>Anexo I – Turmas, horários e mensalidades 2027</h3>
<div class="ct-turmas">${contratoTurmas(d.turmas || TURMAS_2027)}</div>

<h3>Anexo II – Política de cobrança (vigente no início da temporada)</h3>
<p>Esta política pode ser atualizada na forma do item 4.9, dentro dos limites da Cláusula 5. A versão em vigor fica disponível pelos canais oficiais.</p>
<p><b>Pagamento até o vencimento (dia ${T.vencimento}):</b> valor com desconto de pontualidade (Anexo I).</p>
<p><b>Janeiro de 2027:</b> os ${ctMoney(T.taxa)} pagos na rematrícula são descontados da mensalidade de janeiro (item 2.2). Exemplo: mensalidade de ${ctMoney(ctCheia(17990))} (${ctMoney(17990)} até o vencimento); em janeiro, o saldo é de ${ctMoney(17990 - T.taxa)} pago até o dia ${T.vencimento}, ou ${ctMoney(ctCheia(17990) - T.taxa)} mais os encargos sobre esse saldo depois dele.</p>
<p><b>Pagamento após o vencimento:</b> valor integral da mensalidade, com multa única de ${T.multa}%, juros simples de ${T.juros}% ao mês calculados dia a dia e correção pelo IPCA, até o pagamento; suspensão das atividades e das convocações com ${T.suspensao} dias de atraso; aviso escrito e possível registro em cadastros de proteção ao crédito ou protesto; encerramento do contrato com mais de ${T.rescisao} dias de atraso.</p>
<p>Exemplo (mensalidade de ${ctMoney(ctCheia(17990))}, com desconto de pontualidade ${ctMoney(17990)}), paga com 30 dias de atraso: ${ctMoney(ctCheia(17990))} + multa de ${ctMoney(Math.round(ctCheia(17990) * T.multa / 100))} + juros de ${ctMoney(Math.round(ctCheia(17990) * T.juros / 100))} = ${ctMoney(ctCheia(17990) + Math.round(ctCheia(17990) * T.multa / 100) + Math.round(ctCheia(17990) * T.juros / 100))}, mais a correção do período.</p>
<p><b>Pacotes com pagamento antecipado</b> (quando disponíveis na plataforma de cobrança):</p>
<table class="ct-grid"><thead><tr><th>Pacote</th><th>Forma de pagamento</th><th class="num">Desconto</th></tr></thead><tbody>${pacotes}</tbody></table>
<p>O desconto incide sobre a soma das mensalidades do pacote. No cancelamento, aplica-se o item 3.4.</p>

${sign ? `<div class="ct-sign"><p><b>Aceite eletrônico</b></p>
<p>Aceito por ${ctEsc(sign.name)} em ${ctEsc(sign.at)}${sign.ip ? `, IP ${ctEsc(sign.ip)}` : ''}.</p>
<p class="ct-hash">Código de integridade (SHA-256): ${ctEsc(sign.hash || '—')}</p></div>`
    : `<div class="ct-sign"><p>Curitiba/PR, data do aceite eletrônico.</p><p>${CONTRATADA.nome} · CNPJ ${CONTRATADA.cnpj}</p></div>`}
</div>`;
}

function contratoTurmas(turmas) {
  const groups = {};
  turmas.forEach(t => { (groups[t.location] = groups[t.location] || []).push(t); });
  return Object.entries(groups).map(([loc, list]) => `<p class="ct-loc"><b>${ctEsc(loc)}</b></p>
    <table class="ct-grid"><thead><tr><th>Turma ou equipe</th><th>Dias e horário</th><th class="num">Mensalidade</th><th class="num">Até o vencimento</th></tr></thead><tbody>
    ${list.map(t => `<tr><td>${ctEsc(t.label)}</td><td>${ctEsc(t.days)}, ${ctEsc(t.time)}</td><td class="num">${ctMoney(ctCheia(t.fee_cents))}</td><td class="num">${ctMoney(t.fee_cents)}${t.note ? ` <small>(${ctEsc(t.note)})</small>` : ''}</td></tr>`).join('')}
    </tbody></table>`).join('');
}

// Texto puro e normalizado do contrato: é sobre ele que se calcula o código de integridade
function contratoTexto(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent.replace(/\s+/g, ' ').trim();
}
async function contratoHash(html) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(contratoTexto(html)));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

if (typeof module !== 'undefined') module.exports = { CONTRATO_VERSION, TURMAS_2027, TEMPORADA, contratoHtml, ctCheia };
if (typeof window !== 'undefined') Object.assign(window, { CONTRATO_VERSION, CONTRATADA, TEMPORADA, TURMAS_2027, contratoHtml, contratoTurmas, contratoTexto, contratoHash, ctMoney, ctCheia });
