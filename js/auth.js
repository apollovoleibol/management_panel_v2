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
  return { ok: true, access, user: APOLLO_AUTH.user };
}

async function apolloSignOut() {
  const { error } = await financeDbClient().auth.signOut();
  if (error) throw error;
  location.replace('login.html');
}
