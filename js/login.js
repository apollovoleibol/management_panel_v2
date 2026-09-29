'use strict';
const loginCard = document.getElementById('card');
const loginMessage = document.getElementById('loginMessage');
const loginClient = financeDbClient();
const loginRedirect = new URL('login.html', location.href).href;
let passwordRecovery = /(?:[?#&])type=recovery(?:&|$)/.test(location.href);

function showPasswordRecovery() {
  passwordRecovery = true;
  loginCard.innerHTML = `<div class="eyebrow">Segurança da conta</div><h2>Definir nova senha</h2>
    <form id="recoveryForm"><label for="newPassword">Nova senha</label>
    <input id="newPassword" type="password" autocomplete="new-password" minlength="12" required>
    <button class="btn primary" type="submit">Salvar senha</button></form>`;
  document.getElementById('recoveryForm').addEventListener('submit', async event => {
    event.preventDefault();
    const password = document.getElementById('newPassword').value;
    if (password.length < 12) return loginStatus('Use pelo menos 12 caracteres.', true);
    const { error } = await loginClient.auth.updateUser({ password });
    if (error) return loginStatus(error.message, true);
    passwordRecovery = false;
    loginStatus('Senha atualizada. Redirecionando...');
    await loginRoute();
  });
}

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
  if (passwordRecovery) return;
  const access = await apolloLoadAccess();
  if (!APOLLO_AUTH.user) return;
  switch (apolloRoute(access)) {
    case 'panel': location.replace('index.html'); break;
    case 'athlete': location.replace('area-do-atleta.html'); break;
    case 'choice': loginChoice(); break;
    default: loginStatus('Esta conta ainda não tem acesso ativo. Peça à secretaria ou à administração para vincular seu cadastro.', true);
  }
}

document.getElementById('pwForm').addEventListener('submit', async event => {
  event.preventDefault(); loginStatus('Verificando acesso...');
  const email = document.getElementById('em').value.trim();
  const password = document.getElementById('pw').value;
  try {
    const { error } = await loginClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await loginRoute();
  } catch (error) { loginStatus(`Não foi possível entrar: ${error.message}`, true); }
});
document.getElementById('googleBtn').addEventListener('click', async () => {
  loginStatus('Abrindo Google...');
  const { error } = await loginClient.auth.signInWithOAuth({
    provider: 'google', options: { redirectTo: loginRedirect }
  });
  if (error) loginStatus(error.message, true);
});
document.getElementById('forgotBtn').addEventListener('click', async () => {
  const email = document.getElementById('em').value.trim();
  if (!email) return loginStatus('Digite seu e-mail para receber o link de redefinição.', true);
  const { error } = await loginClient.auth.resetPasswordForEmail(email, { redirectTo: loginRedirect });
  loginStatus(error ? error.message : 'Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.', !!error);
});
document.getElementById('firstBtn').addEventListener('click', async () => {
  const email = document.getElementById('em').value.trim();
  if (!email) return loginStatus('Digite o e-mail cadastrado para receber o acesso.', true);
  const { error } = await loginClient.auth.signInWithOtp({
    email, options: { shouldCreateUser: false, emailRedirectTo: loginRedirect }
  });
  loginStatus(error ? error.message : 'Se o e-mail estiver cadastrado, você receberá um link para entrar.', !!error);
});
loginClient.auth.onAuthStateChange(event => {
  if (event === 'PASSWORD_RECOVERY') showPasswordRecovery();
});
if (passwordRecovery) showPasswordRecovery();
else loginRoute().catch(error => loginStatus(`Erro ao consultar as permissões: ${error.message}`, true));
