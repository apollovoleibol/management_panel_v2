import { createClient } from 'npm:@supabase/supabase-js@2';

const origin = 'https://apollovoleibol.github.io';
const redirectTo = `${origin}/management_panel_v2/login.html`;
const pages = new Set(['overview', 'bookings', 'athletes', 'teams', 'packages', 'feeder', 'payments', 'finance', 'settings']);
const financePages = new Set(['packages', 'payments', 'finance']);
// Administrator access is assigned to an existing active user by the reviewed
// v2_admin_set_staff RPC. Invitations cannot create a legacy customer with
// unintended v1 access while the old panel is still being isolated.
const staffRoles = new Set(['finance', 'coordination', 'attendance', 'coach']);
const portalRoles = new Set(['guardian', 'athlete']);
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
});

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204,
    headers: { 'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS' } });
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });
  if (request.headers.get('Origin') !== origin) return json(403, { error: 'Origin not allowed' });
  const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return json(401, { error: 'Authentication required' });
  const url = Deno.env.get('SUPABASE_URL');
  const publishable = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}').default || Deno.env.get('SUPABASE_ANON_KEY');
  const secret = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !publishable || !secret) return json(500, { error: 'Function configuration is incomplete' });
  const caller = createClient(url, publishable, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: userData, error: userError } = await caller.auth.getUser(token);
  if (userError || !userData.user) return json(401, { error: 'Invalid session' });
  const { data: access, error: accessError } = await caller.rpc('v2_my_access');
  if (accessError || access?.role !== 'admin' || access?.pages?.settings?.edit !== true)
    return json(403, { error: 'Huddle administrator required' });
  let input: Record<string, unknown>;
  try { input = await request.json(); } catch { return json(400, { error: 'Invalid JSON' }); }
  const email = String(input.email || '').trim().toLowerCase();
  const fullName = String(input.fullName || '').trim();
  const role = String(input.role || '');
  const permissions = input.permissions;
  const portalRole = portalRoles.has(role);
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 255 || !fullName || fullName.length > 150
    || (!staffRoles.has(role) && !portalRole)
    || (!portalRole && (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)))) {
    return json(400, { error: 'Invalid invitation' });
  }
  for (const [page, mode] of Object.entries(portalRole ? {} : permissions as Record<string, unknown>)) {
    if (!pages.has(page) || !['none', 'view', 'edit'].includes(String(mode))
      || (financePages.has(page) && !['admin', 'finance'].includes(role) && mode !== 'none')) {
      return json(400, { error: 'Invalid page permissions' });
    }
  }

  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  let athleteId = '';
  if (portalRole) {
    athleteId = String(input.athleteId || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(athleteId))
      return json(400, { error: 'Invalid athlete' });
    const { data: athlete, error: athleteError } = await admin.from('athletes')
      .select('id,birth_date,is_active').eq('id', athleteId).maybeSingle();
    if (athleteError || !athlete?.is_active || !athlete.birth_date) return json(400, { error: 'Active athlete with birth date required' });
    const adultCutoff = new Date(); adultCutoff.setUTCFullYear(adultCutoff.getUTCFullYear() - 18);
    const isAdult = athlete.birth_date <= adultCutoff.toISOString().slice(0, 10);
    if ((role === 'guardian' && isAdult) || (role === 'athlete' && !isAdult))
      return json(400, { error: 'Guardian access is for minors; adults use their own account' });
  }
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo, data: { full_name: fullName }
  });
  if (inviteError || !invited.user) return json(400, { error: inviteError?.message || 'Invitation failed' });
  const userId = invited.user.id;
  const legacyRole = role === 'coach' ? 'coach' : 'customer';
  const { error: profileError } = await admin.from('profiles').upsert({
    id: userId, full_name: fullName, email, role: legacyRole, is_active: true
  }, { onConflict: 'id' });
  if (profileError) return json(500, { error: 'Invitation sent, but profile setup failed. Contact an administrator.' });
  if (portalRole) {
    const { error: linkError } = await admin.from('v2_athlete_access').upsert({
      user_id: userId, athlete_id: athleteId, relation: role === 'guardian' ? 'guardian' : 'self'
    }, { onConflict: 'user_id,athlete_id' });
    if (linkError) return json(500, { error: 'Invitation sent, but athlete access setup failed. Contact an administrator.' });
    return json(200, { userId });
  }
  const { error: staffError } = await admin.from('v2_staff').upsert({
    user_id: userId, role, permissions, is_active: true
  }, { onConflict: 'user_id' });
  if (staffError) return json(500, { error: 'Invitation sent, but access setup failed. Contact an administrator.' });
  if (role === 'admin' || role === 'finance') {
    const { error: financeError } = await admin.from('finance_access').upsert({
      user_id: userId, can_view: true, can_import: true, is_active: true
    }, { onConflict: 'user_id' });
    if (financeError) return json(500, { error: 'Invitation sent, but finance access setup failed. Contact an administrator.' });
  }
  return json(200, { userId });
});
