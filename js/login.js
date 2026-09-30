'use strict';
const loginCard = document.getElementById('card');
const loginMessage = document.getElementById('loginMessage');
const loginClient = financeDbClient();
const loginRedirect = new URL('login.html', location.href).href;
document.getElementById('loginVersion').textContent = APOLLO_VERSION;

function loginStatus(message, isError = false) {
  loginMessage.textContent = message;
  loginMessage.style.color = isError ? '#b91c1c' : '';
}
function loginChoice() {
  const name = APOLLO_AUTH.user?.user_metadata?.full_name || APOLLO_AUTH.user?.email || 'você';
  loginCard.innerHTML = `<div class="eyebrow">Escolha sua área</div><h2>Olá, ${name.replace(/[&<>"']/g, '')}</h2>
    <div class="choice"><button id="panelChoice">Painel de Gestão</button><button id="athleteChoice">Área do atleta</button></div>
    <button class="btn ghost mt" id="logoutChoice">Sair</button>`;
  document.getElementById('panelChoice').onclick = () => location.replace('index.html');
  document.getElementById('athleteChoice').onclick = () => location.replace('area-do-atleta.html');
  document.getElementById('logoutChoice').onclick = apolloSignOut;
}
async function loginRoute() {
  const access = await apolloLoadAccess();
  if (!APOLLO_AUTH.user) {
    if (APOLLO_AUTH.googleRequired) loginStatus('Para acessar a v2, entre com sua conta Google cadastrada.', true);
    return;
  }
  switch (apolloRoute(access)) {
    case 'panel': location.replace('index.html'); break;
    case 'athlete': location.replace('area-do-atleta.html'); break;
    case 'choice': loginChoice(); break;
    default:
      loginStatus('Esta conta Google não tem perfil ativo ou vínculo autorizado. Peça à administração para conferir seu cadastro.', true);
      document.getElementById('logoutBtn').hidden = false;
  }
}

document.getElementById('googleBtn').addEventListener('click', async () => {
  loginStatus('Abrindo Google...');
  const { error } = await loginClient.auth.signInWithOAuth({
    provider: 'google', options: { redirectTo: loginRedirect }
  });
  if (error) loginStatus(error.message, true);
});
document.getElementById('logoutBtn').addEventListener('click', apolloSignOut);
loginRoute().catch(error => loginStatus(`Erro ao consultar as permissões: ${error.message}`, true));
