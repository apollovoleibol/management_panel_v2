'use strict';
const loginCard = document.getElementById('card');
const loginMessage = document.getElementById('loginMessage');
const googleBtn = document.getElementById('googleBtn');
const googleLabel = googleBtn.querySelector('.google-label');
const loginClient = financeDbClient();
const loginRedirect = new URL('login.html', location.href).href;
let loginPending = false;
document.getElementById('loginVersion').textContent = APOLLO_VERSION;

function loginStatus(message, isError = false) {
  loginMessage.textContent = message;
  loginMessage.style.color = isError ? '#ff9b94' : '';
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
    if (APOLLO_AUTH.googleRequired) loginStatus('Esta sessão não foi criada com Google. Entre com a conta Google cadastrada na Apollo.', true);
    return;
  }
  switch (apolloRoute(access)) {
    case 'panel': location.replace('index.html'); break;
    case 'athlete': location.replace('area-do-atleta.html'); break;
    case 'choice': loginChoice(); break;
    default:
      loginStatus('Esta conta Google ainda não tem acesso ao Huddle. Peça à administração para ativar seu perfil ou vínculo de atleta. Depois, entre novamente.', true);
      document.getElementById('logoutBtn').hidden = false;
  }
}

function setGooglePending(pending) {
  loginPending = pending;
  googleBtn.disabled = pending;
  googleBtn.classList.toggle('is-loading', pending);
  googleBtn.setAttribute('aria-busy', String(pending));
  googleLabel.textContent = pending ? 'Abrindo Google...' : 'Entrar com Google';
}
googleBtn.addEventListener('click', async () => {
  if (loginPending) return;
  setGooglePending(true);
  loginStatus('');
  const timeout = setTimeout(() => {
    if (!loginPending) return;
    setGooglePending(false);
    loginStatus('O Google não abriu. Tente novamente.', true);
  }, 12000);
  try {
    const { error } = await loginClient.auth.signInWithOAuth({
      provider: 'google', options: { redirectTo: loginRedirect }
    });
    if (error) throw error;
  } catch (error) {
    clearTimeout(timeout);
    setGooglePending(false);
    loginStatus('Não foi possível abrir o Google. Confira sua conexão e tente novamente.', true);
  }
});
document.getElementById('logoutBtn').addEventListener('click', apolloSignOut);
loginRoute().catch(() => loginStatus('Não foi possível verificar seu acesso. Confira a conexão e recarregue a página.', true));
