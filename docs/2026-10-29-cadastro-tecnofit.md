# Passagem do cadastro para atendimento

TECNOFIT significa aprovação + auto-cadastro concluído. Atendimento deve inserir manualmente o atleta no Tecnofit; não confirma matrícula externa nem cria clientes/contratos no provedor.

Migração039 remove a dependência de importações financeiras. Dispara após aprovação/vínculo do agendamento e após conclusão do formulário na ficha. A conclusão exige termos aceitos e objeto raw_form_data não vazio na ficha vinculada. Apenas IN_REGISTRATION avança; cancelados, em avaliação e fichas incompletas permanecem como estavam. Eventos de aprovação e passagem são preservados. A reconciliação histórica usa o mesmo critério.

O painel lista TECNOFIT em “Inserir no Tecnofit”, e Em cadastro continua na fila de cadastros pendentes. Arquivamento permanece manual.

Verificação: instalar @electric-sql/pglite em .verification e executar node cadastro-tecnofit.test.mjs. Alternativamente PGLITE_MODULE indica uma instalação existente. Testes executam027 (histórico),037 (regra anterior) e039 em PostgreSQL descartável, cobrindo as duas ordens, vínculo exato, cadastro incompleto, cancelamento, independência financeira e idempotência. O teste reproduziu IN_REGISTRATION indevidamente antes da correção e passou após039.
