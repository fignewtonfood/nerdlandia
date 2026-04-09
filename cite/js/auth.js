// ─────────────────────────────────────────────────────────────
//  Nerdlandia — Supabase Client & Auth
//  js/auth.js
//
//  SETUP: Replace the two placeholders below with values from:
//  Supabase Dashboard → Project Settings → API
// ─────────────────────────────────────────────────────────────

const SUPABASE_URL      = 'https://eddrfejfhykyiqthzlyu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Ke3HQM6fsitrJZWFUW5Yeg_HVxBXSse';

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
  if (data && data.team_id) {
    const { data: team } = await sb.from('teams').select('*').eq('id', data.team_id).single();
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
function resolveUrl(path) {
  const isInPages = window.location.pathname.includes('/pages/');
  return isInPages ? '../' + path : path;
}

async function requireAuth() {
  const user = await getUser();
  if (!user) { window.location.href = resolveUrl('pages/login.html'); return null; }
  return user;
}

async function redirectIfLoggedIn() {
  const user = await getUser();
  if (user) window.location.href = resolveUrl('pages/profile.html');
}

// ── AUTH ACTIONS ─────────────────────────────────────────────
async function signUp(email, password) {
  return sb.auth.signUp({ email, password });
}

async function signIn(email, password) {
  return sb.auth.signInWithPassword({ email, password });
}

async function signOut() {
  await sb.auth.signOut();
  window.location.href = resolveUrl('index.html');
}

// ── PROFILE ACTIONS ──────────────────────────────────────────
async function updateProfile(userId, fields) {
  const { data, error } = await sb.from('profiles').update(fields).eq('id', userId).select().single();
  return { data, error };
}

async function uploadAvatar(userId, file) {
  const ext  = file.name.split('.').pop();
  const path = `${userId}/avatar.${ext}`;
  const { error: upErr } = await sb.storage.from('avatars').upload(path, file, { upsert: true });
  if (upErr) return { url: null, error: upErr };
  const { data } = sb.storage.from('avatars').getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}

// ── NAV ──────────────────────────────────────────────────────
async function initNav() {
  const user = await getUser();
  const show = id => { const el = document.getElementById(id); if (el) el.style.display = ''; };
  const hide = id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; };

  if (user) {
    hide('navLogin'); hide('navJoin');
    show('navProfile'); show('navLogout');
    const profile = await getCurrentProfile();
    if (profile?.role === 'admin') show('navAdmin');
  }
}

document.addEventListener('DOMContentLoaded', initNav);
