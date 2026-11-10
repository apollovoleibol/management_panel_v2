/* A single Supabase session for staff and the athlete portal. */
'use strict';

const APOLLO_AUTH = { user: null, access: null, googleRequired: false };

function apolloGoogleSession(session) {
  try {
    const payload = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(payload));
    return Array.isArray(claims.amr) && claims.amr.some(item => item.method === 'oauth');
  } catch (_) { return false; }
}

async function apolloLoadAccess() {
  const client = financeDbClient();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  APOLLO_AUTH.user = null;
  APOLLO_AUTH.access = null;
  APOLLO_AUTH.googleRequired = !!sessionData.session && !apolloGoogleSession(sessionData.session);
  if (!sessionData.session || APOLLO_AUTH.googleRequired) return null;
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) return null;
  const { data: access, error: accessError } = await client.rpc('v2_my_access');
  if (accessError) throw accessError;
  APOLLO_AUTH.user = userData.user;
  APOLLO_AUTH.access = access;
  return access;
}

function apolloHasStaffAccess(access = APOLLO_AUTH.access) {
  return !!access?.role && Object.values(access?.pages || {}).some(page => page.view);
}

function apolloHasAthleteAccess(access = APOLLO_AUTH.access) {
  return Array.isArray(access?.athleteIds) && access.athleteIds.length > 0;
}

function apolloRoute(access = APOLLO_AUTH.access) {
  if (apolloHasStaffAccess(access) && apolloHasAthleteAccess(access)) return 'choice';
  if (apolloHasStaffAccess(access)) return 'panel';
  if (apolloHasAthleteAccess(access)) return 'athlete';
  return 'inactive';
}

async function apolloRequireArea(area) {
  let access;
  try { access = await apolloLoadAccess(); }
  catch (error) { return { ok: false, error: error.message }; }
  if (!APOLLO_AUTH.user) { location.replace('login.html'); return { ok: false }; }
  const allowed = area === 'panel' ? apolloHasStaffAccess(access) : apolloHasAthleteAccess(access);
  if (!allowed) { location.replace('login.html'); return { ok: false }; }
  apolloWatchSession();
  return { ok: true, access, user: APOLLO_AUTH.user };
}

// A sessão pode acabar com a página aberta: "Sair" no Manager App encerra todas as sessões da conta,
// e um token renovado em outro aparelho invalida este. Sem sessão o Supabase segue respondendo como
// anônimo e as gravações somem caladas ("Nenhum registro foi gravado"). Aqui a página volta ao login.
const APOLLO_SESSION_EXPIRED = 'login.html?sessao=expirada';
let apolloWatching = false;
function apolloSessionExpired() {
  APOLLO_AUTH.user = null;
  location.replace(APOLLO_SESSION_EXPIRED);
}
async function apolloCheckSession() {
  const client = financeDbClient();
  const { data } = await client.auth.getSession();
  if (!data.session) { apolloSessionExpired(); return false; }
  // getUser consulta o servidor: pega a sessão revogada mesmo com o token ainda guardado no navegador
  const { data: userData, error } = await client.auth.getUser();
  if (error?.status === 401 || error?.status === 403 || (!error && !userData.user)) {
    await client.auth.signOut({ scope: 'local' }).catch(() => {});
    apolloSessionExpired();
    return false;
  }
  return true;
}
function apolloWatchSession() {
  if (apolloWatching) return;
  apolloWatching = true;
  financeDbClient().auth.onAuthStateChange?.((event, session) => {
    if (event === 'SIGNED_OUT' || (event !== 'INITIAL_SESSION' && !session)) apolloSessionExpired();
  });
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') apolloCheckSession().catch(() => {});
  });
}

async function apolloSignOut() {
  const { error } = await financeDbClient().auth.signOut({ scope: 'local' });
  if (error) throw error;
  location.replace('login.html');
}
