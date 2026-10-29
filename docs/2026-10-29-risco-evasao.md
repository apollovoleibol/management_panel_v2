# Risco de evasão no Huddle

Visão geral disponível para Administrador e Atendimento com permissão de overview. Mesmo critério do Manager App: atletas ativos, chamadas registradas nos últimos60 dias; sequência mais recente de absent; qualquer outro status interrompe, ausência de registro não conta como falta. Duas a cinco faltas aparecem em risco, seis ou mais em grupo recolhido para conferência. Filtro por equipe e contato do responsável para menor ou do atleta adulto.

Usa os dados já carregados sob RLS, sem alterações de permissões ou migrações. Preserva startedAt completo na apresentação de sessões para manter o mesmo limite temporal do Manager.

Administradores reais, fora da prévia de perfil e com edição de atletas, podem desligar após confirmação: is_active=false e left_at=data de desligamento. Não exclui ficha, chamadas ou cancela cobranças no provedor. Atendimento não tem esse botão. Não há desligamento nem envio de mensagens automático.

Validação: node --test auth.test.cjs release-27.test.cjs dropout-risk.test.cjs. Casos de corte temporal, equipe, faltas justificadas/presenças, chamadas ausentes, menores/adultos, perfil e confirmação de desligamento. Recarregar Huddle após publicação.
