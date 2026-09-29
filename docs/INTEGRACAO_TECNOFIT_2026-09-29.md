# Integração Tecnofit → Painel de Gestão Apollo

Levantamento em 29/09/2026. Consulta de leitura à conta Apollo no Tecnofit e à documentação oficial. Nenhuma chave foi criada, nenhum relatório com dados pessoais foi salvo e nenhum dado foi alterado no Tecnofit.

## O que foi confirmado na conta

- **Relatórios → Gerencial → Vendas em Aberto** (`/relatorio/vendasAberto`): filtros de período, tipo de venda e status do cliente; mostra cliente, itens, vencimento, valor da venda, total em aberto e valor em aberto no período. Possui **Exportar para Excel**. É o relatório manual mais próximo da cobrança de mensalidades em aberto. O título "em aberto" não implica atraso: separar valores ainda não vencidos dos vencidos.
- **Gerencial → Gestão Financeira → Contas a receber** (`/financeiro/main`): mostra data de recebimento, data de crédito, valor bruto, taxas, valor líquido e recebido, além de exportação para Excel. Serve para conciliar entradas efetivas, mas não deve ser tratado sozinho como lista de inadimplentes.
- Há também relatórios **Vendas Recebidas**, **Vendas Realizadas**, **Recorrências** e **Clientes Vencidos**. Os dois primeiros têm semânticas diferentes: vendas realizadas incluem vendas ainda não recebidas; vendas recebidas tratam pagamentos. Conferir o detalhe dos filtros e das colunas antes do mapeamento final.
- Em **Loja de Adicionais → API Aberta**, a interface exibiu contratação à parte, preço sob consulta e opção de pedir contato do gerente de contas. Isso indica que o acesso à API pode depender de contratação. A ativação nesta conta **não foi comprovada**; não foi gerada nem testada uma chave.

## Caminho recomendado

1. **Confirmar disponibilidade contratual da API Aberta.** A [documentação de contratação](https://api-externa-tecnofit.readme.io/reference/contrata%C3%A7%C3%A3o) orienta solicitar contato do gerente pela Loja de Adicionais e gerar chaves após a contratação. Não iniciar solicitação comercial nem gerar chaves automaticamente.
2. **Integração de leitura pelo backend**, com chave e segredo fora do navegador. Fazer login em `POST /v1/auth/login`, consultar [clientes](https://api-externa-tecnofit.readme.io/reference/listcustomers), [vendas de cada cliente](https://api-externa-tecnofit.readme.io/reference/getcustomersales) e [recebíveis](https://api-externa-tecnofit.readme.io/reference/getreceivables). A lista de vendas por cliente documenta os status `paid`, `expiresToday`, `notYetDue` e `overdue`; o endpoint de recebíveis permite filtrar confirmação e data de recebimento. Ainda é necessário validar o JSON real para identificar parcelas, pagamentos parciais, estornos e relação entre venda e recebível.
3. **Sincronização e conciliação.** Paginar, respeitar os [limites da API](https://api-externa-tecnofit.readme.io/reference/primeiros-passos) (100 requisições/minuto por endpoint/IP e 200/minuto global), persistir IDs externos e carimbo de sincronização, e repetir consultas com sobreposição de datas para captar baixas tardias. Associar atletas pelo ID Tecnofit vinculado ao cadastro Apollo; nunca conciliar apenas por nome. Exibir estados *pago*, *em aberto a vencer*, *vencido* e *divergente*, com origem e horário da última atualização. Receita recebida deve usar a data de recebimento; inadimplência deve considerar saldo aberto e vencimento, sem contar uma mesma parcela duas vezes.
4. **Proteção de acesso.** Restringir vendas, mensalidades, recebíveis e métricas financeiras a Administrador e Financeiro também no banco/backend, inclusive leitura. Não depender somente dos checkboxes e da ocultação da interface do protótipo. Para a Área do Atleta, mostrar apenas dados do próprio atleta ao adulto ou do menor ao responsável autorizado.
5. **Validação antes de produção.** Comparar um mês fechado e um mês corrente entre Tecnofit e painel: total recebido, em aberto, vencido, pagamentos parciais, estornos e clientes sem vínculo. Mostrar divergências para revisão humana. Somente então usar os números em KPIs, cobranças e área do atleta.

## Integração por upload escolhida pela Apollo

O usuário decidiu evitar a contratação da API. Os quatro arquivos reais foram inspecionados e a área Financeiro do protótipo passou a lê-los localmente. A guia **Importações** traz o caminho, formato e período recomendados para cada exportação. A leitura é separada por tipo de relatório; não há raspagem da interface do Tecnofit nem uso das credenciais do usuário no painel.

### Atualização após recebimento dos quatro arquivos

O usuário forneceu também `Relatório de Vendas em Aberto.xls`. Os dois `.xls` são tabelas HTML exportadas com extensão XLS. O XLSX de Contas a Receber tem 38 colunas e 116 linhas de dados; o extrato CSV tem 177 linhas, das quais 20 são saldos diários e 157 são movimentações; Vendas em Aberto tem 47 registros; o Fluxo de Caixa Analítico agrega oito meses. Os nomes e dados pessoais dos arquivos não foram copiados para o projeto.

Na exportação analisada, as 47 linhas de Vendas em Aberto somam R$ 6.065,20. Uma delas agrupa **dois vencimentos e dois valores na mesma célula**; o leitor do protótipo preserva as duas datas e soma os valores. Em 29/09/2026, todas as datas de vencimento desse arquivo eram anteriores ao dia da análise. Isso confirma a viabilidade técnica dos alertas por upload, desde que o arquivo cubra **todos os meses ainda sujeitos a débito**, e não apenas o mês corrente. O status “Bloqueado” do cliente não determina atraso.

A página Financeiro foi reorganizada para carregar os quatro formatos localmente, mostrar recebimentos brutos/líquidos e taxas, movimentos bancários, fluxo agregado, saldo em aberto e alertas. Importações de recebimentos, extrato e fluxo atualizam os meses incluídos; Vendas em Aberto substitui a fotografia anterior, porque uma dívida pode ter sido paga entre exportações. O extrato PIX é fonte de conferência e não é somado novamente à receita. Diferenças entre Fluxo e Contas a Receber são exibidas para análise, sem lançar ajuste automático. A gravação normalizada no banco está implementada, mas ainda não foi validada com uma importação real; portanto os números não devem ser tratados como conciliação contábil.

## Próximos passos para produção

A migração de persistência já foi aplicada ao banco real, mas ainda falta testar uma importação autenticada e o vínculo confiável pelo código do cliente Tecnofit ao cadastro Apollo. Antes de enviar cobrança a menores, identificar e autorizar o responsável no cadastro Apollo. Validar também exportações de outros meses e os casos de pagamentos parciais, estornos e duas mensalidades do mesmo atleta na mesma linha.

## Evolução do protótipo: importação individual e persistência preparada

A guia **Importações** agora oferece um cartão e um upload por tipo de relatório. O navegador converte o arquivo em registros normalizados, mostra uma prévia e exige a confirmação do intervalo filtrado no Tecnofit. Depois, envia apenas esses registros à função `finance_import_report`; o arquivo original e seu nome não são transmitidos nem armazenados. Até a confirmação, os dados tratados ficam apenas na memória do navegador. Um relatório vazio pode ser importado para limpar uma fotografia de débitos após quitação.

A migração [012_tecnofit_finance_imports.sql](../supabase/migrations/012_tecnofit_finance_imports.sql) cria tabelas de registros, histórico e cobertura mensal, com leitura restrita por RLS a perfis financeiros ativos. Uma tabela `finance_access` concede explicitamente visualização e importação a cada usuário; sem esse registro, mesmo um perfil `admin` não lê as novas tabelas. A migração não altera as políticas compartilhadas pela v1. A função transacional substitui os meses reimportados; para Vendas em Aberto, substitui toda a fotografia. A interface mostra última importação, intervalo declarado, meses cobertos e meses sem importação nos últimos 12 meses. **A cobertura é declarada pelo operador:** os registros presentes são validados contra o intervalo, mas um arquivo com dados faltantes não prova que todos os lançamentos daquele período foram exportados.

**Estado de implantação em 29/09/2026:** as migrações 012 e 014 estão aplicadas ao Supabase real, e o login da v2 usa o Supabase Auth. Duas contas administradoras receberam `finance_access`. Não há evidência de relatórios Tecnofit já importados nem de teste completo com papéis financeiros e não financeiros. A tabela de lançamentos manuais existe, mas sua operação ainda não foi testada com uma conta financeira. Consulte [o estado geral da implantação](IMPLEMENTACAO_REAL.md) antes de usar em produção.

## Fontes oficiais

- [Primeiros Passos — API Tecnofit](https://api-externa-tecnofit.readme.io/reference/primeiros-passos)
- [Contratação — API Tecnofit](https://api-externa-tecnofit.readme.io/reference/contrata%C3%A7%C3%A3o)
- [Login na API](https://api-externa-tecnofit.readme.io/reference/login)
- [Listar clientes](https://api-externa-tecnofit.readme.io/reference/listcustomers)
- [Listar vendas de cliente](https://api-externa-tecnofit.readme.io/reference/getcustomersales)
- [Listar recebíveis](https://api-externa-tecnofit.readme.io/reference/getreceivables)
- [Diferença entre relatórios de recebimento e faturamento](https://ajuda.tecnofit.com.br/pt-BR/support/solutions/articles/67000693958-qual-a-diferenca-entre-os-relat%C3%B3rios-de-recebimento-e-faturamento-)
