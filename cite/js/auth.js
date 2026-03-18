// ─────────────────────────────────────────────────────────────
//  Nerdlandia — Supabase Client & Auth
//  js/auth.js
//
//  SETUP: Replace the two placeholders below with your values from:
//  Supabase Dashboard → Project Settings → API
// ─────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://eddrfejfhykyiqthzlyu.supabase.co';       // e.g. https://abcdefgh.supabase.co
const SUPABASE_ANON_KEY = 'sb_publishable_Ke3HQM6fsitrJZWFUW5Yeg_HVxBXSse'; // long string starting with eyJ...

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── SESSION HELPERS ──────────────────────────────────────────

async function getSession() {
  const { data } = await sb.auth.getSession();
  return data.session;
}

async function getUser() {
  const session = await getSession();
  return session ? session.user : null;
}

async function getProfile(userId) {
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) { console.error('getProfile error:', error); return null; }

  // Fetch team separately if user is on one
  if (data && data.team_id) {
    const { data: team } = await sb
      .from('teams')
      .select('*')
      .eq('id', data.team_id)
      .single();
    data.teams = team || null;
  }

  return data;
}

async function getCurrentProfile() {
  const user = await getUser();
  if (!user) return null;
  return getProfile(user.id);
}

// ── REDIRECT HELPERS ─────────────────────────────────────────

// Call on protected pages — redirects to login if not signed in
async function requireAuth() {
  const user = await getUser();
  if (!user) {
    window.location.href = resolveUrl('pages/login.html');
    return null;
  }
  return user;
}

// Redirect to profile if already logged in (for login/register pages)
async function redirectIfLoggedIn() {
  const user = await getUser();
  if (user) {
    window.location.href = resolveUrl('pages/profile.html');
  }
}

// Resolve URL relative to site root regardless of page depth
function resolveUrl(path) {
  const depth = window.location.pathname.split('/').filter(Boolean).length;
  const isInPages = window.location.pathname.includes('/pages/');
  return isInPages ? '../' + path : path;
}

// ── AUTH ACTIONS ─────────────────────────────────────────────

async function signUp(email, password) {
  const { data, error } = await sb.auth.signUp({ email, password });
  return { data, error };
}

async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  return { data, error };
}

async function signOut() {
  await sb.auth.signOut();
  window.location.href = resolveUrl('index.html');
}

// ── PROFILE ACTIONS ──────────────────────────────────────────

async function updateProfile(userId, fields) {
  const { data, error } = await sb
    .from('profiles')
    .update(fields)
    .eq('id', userId)
    .select()
    .single();
  return { data, error };
}

async function uploadAvatar(userId, file) {
  const ext = file.name.split('.').pop();
  const path = `${userId}/avatar.${ext}`;
  const { error: upErr } = await sb.storage.from('avatars').upload(path, file, { upsert: true });
  if (upErr) return { url: null, error: upErr };
  const { data } = sb.storage.from('avatars').getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}

// ── NAV: show/hide login state ───────────────────────────────

async function initNav() {
  const user = await getUser();
  const loginBtn  = document.getElementById('navLogin');
  const joinBtn   = document.getElementById('navJoin');
  const profileBtn = document.getElementById('navProfile');
  const logoutBtn = document.getElementById('navLogout');

  if (user) {
    if (loginBtn)  loginBtn.style.display  = 'none';
    if (joinBtn)   joinBtn.style.display   = 'none';
    if (profileBtn) profileBtn.style.display = '';
    if (logoutBtn) logoutBtn.style.display  = '';
  }
}

document.addEventListener('DOMContentLoaded', initNav);
