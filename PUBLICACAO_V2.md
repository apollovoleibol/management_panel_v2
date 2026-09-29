# Publicação paralela do Painel de Gestão v2

## Endereços e repositórios

- V1: `apollovoleibol/management_panel` — site confirmado em `https://apollovoleibol.github.io/management_panel/`; manter repositório, branch, Pages e endereço atuais.
- V2: `apollovoleibol/management_panel_v2` — publicar como **site de projeto separado**. URL esperada: `https://apollovoleibol.github.io/management_panel_v2/`. No momento, ela retorna 404 porque Pages ainda não está publicado.
- Durante a homologação, não redirecionar nem alterar o endereço da v1.

## Primeira publicação: homologação visual

1. Entrar no GitHub com uma conta que possa escrever no novo repositório. Ele foi visto publicamente e está vazio; a branch padrão será criada com o primeiro envio.
2. Copiar para a raiz do repositório v2 somente `index.html`, `login.html`, `area-do-atleta.html`, `styles.css`, `atleta.css`, `.nojekyll` e as pastas `assets/`, `js/`, `vendor/` desta pasta. Não copiar relatórios Tecnofit, arquivos de Downloads, testes ou documentação interna.
3. Commitar e enviar à branch escolhida para publicação. No novo repositório, abrir **Settings → Pages → Build and deployment → Deploy from a branch → main → /(root) → Save**. Ajustar `main` se a branch padrão real tiver outro nome.
4. Abrir a URL mostrada pelo GitHub Pages e testar caminhos relativos, logo, favicon, login demonstrativo, painel e área do atleta. Se o repositório for privado, conferir a elegibilidade de Pages no plano da organização. Um Pages comum pode ser publicamente acessível mesmo com repositório privado.

Essa primeira publicação serve apenas para homologar a interface: `login.html` ainda simula usuários, as páginas operacionais usam dados fictícios e as permissões de tela ainda não substituem autorização no Supabase.

## Antes de permitir dados reais e migrar usuários

1. Implementar a autenticação única real no lugar das contas de demonstração, com roteamento de equipe, atleta adulto e responsável. Proteger as leituras e escritas no Supabase por RLS, inclusive financeiro e dados de menores.
2. Conferir o schema real do Supabase principal. Aplicar e testar `012_tecnofit_finance_imports.sql` em ambiente controlado. Conceder acesso financeiro explícito na tabela `finance_access` somente aos usuários autorizados; importação exige também visualização.
3. Se usar Google OAuth, e-mail mágico ou recuperação de senha, adicionar a URL v2 à lista **Authentication → URL Configuration → Redirect URLs** do Supabase e usar `redirectTo` no código. Manter a URL da v1 autorizada durante a convivência.
4. Validar com perfis de administrador, financeiro somente leitura, técnico, atendimento, atleta adulto e responsável por menor. Importar um mês fechado do Tecnofit e confrontar totais, vencimentos e cobertura. Confirmar que a v1 continua operando após cada alteração de banco.
5. Definir domínio ou link oficial para a v2 somente após os testes. Manter a v1 como retorno rápido até estabilizar a operação.

## Estado verificado em 29/09/2026

O checkout local da v1 aponta para `apollovoleibol/management_panel`, branch `main`, commit `00dc838`. O site da v1 foi aberto com sucesso. A página pública do novo repositório confirmou que `management_panel_v2` está **público e vazio**; o endereço esperado da v2 ainda retorna 404. A sessão do navegador não está autenticada no GitHub. A migração financeira está somente no workspace, sem aplicação no banco. Nenhum dado real foi importado pelo novo painel.
