// ─────────────────────────────────────────────────────────────
//  Nerdlandia — Admin Logic
//  js/admin.js  (load after auth.js and teams.js)
// ─────────────────────────────────────────────────────────────

// ── GUARD: redirect non-admins ───────────────────────────────
async function requireAdmin() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== 'admin') {
    alert('Access denied. Admins only.');
    window.location.href = resolveUrl('index.html');
    return null;
  }
  return profile;
}

// ── USERS ────────────────────────────────────────────────────

async function getAllUsers() {
  const { data, error } = await sb
    .from('profiles')
    .select('*, teams(name)')
    .order('created_at', { ascending: true });
  return { data, error };
}

async function adminUpdateUser(userId, fields) {
  const { data, error } = await sb
    .from('profiles')
    .update(fields)
    .eq('id', userId)
    .select()
    .single();
  return { data, error };
}

async function adminGrantAdmin(userId) {
  return adminUpdateUser(userId, { role: 'admin' });
}

async function adminRevokeAdmin(userId) {
  // Check they're not a team lead — if so demote to individual
  const { data: profile } = await sb.from('profiles').select('role').eq('id', userId).single();
  const newRole = profile?.role === 'team_lead' ? 'team_lead' : 'individual';
  return adminUpdateUser(userId, { role: newRole });
}

// ── TEAMS ─────────────────────────────────────────────────────

async function getAllTeams() {
  const { data, error } = await sb
    .from('teams')
    .select('*, profiles(id, username, email, role, photo_url)')
    .order('created_at', { ascending: false });
  return { data, error };
}

async function adminUpdateTeam(teamId, fields, photoFile) {
  if (photoFile) {
    const ext = photoFile.name.split('.').pop();
    const path = `${teamId}/photo.${ext}`;
    const { error: upErr } = await sb.storage.from('team-photos').upload(path, photoFile, { upsert: true });
    if (!upErr) {
      const { data: urlData } = sb.storage.from('team-photos').getPublicUrl(path);
      fields.photo_url = urlData.publicUrl;
    }
  }
  const { data, error } = await sb.from('teams').update(fields).eq('id', teamId).select().single();
  return { data, error };
}

async function adminDeleteTeam(teamId) {
  // Remove all members from team first
  await sb.from('profiles').update({ team_id: null, role: 'individual' }).eq('team_id', teamId);
  const { error } = await sb.from('teams').delete().eq('id', teamId);
  return { error };
}

// ── EVENTS ───────────────────────────────────────────────────

async function getAllEvents() {
  const { data, error } = await sb
    .from('events')
    .select('*, event_registrations(id, team_id, points, placement, teams(name))')
    .order('event_date', { ascending: false });
  return { data, error };
}

async function adminCreateEvent(fields) {
  const { data, error } = await sb
    .from('events')
    .insert({ ...fields, created_by: (await getUser()).id })
    .select()
    .single();
  return { data, error };
}

async function adminUpdateEvent(eventId, fields) {
  const { data, error } = await sb
    .from('events')
    .update(fields)
    .eq('id', eventId)
    .select()
    .single();
  return { data, error };
}

async function adminDeleteEvent(eventId) {
  const { error } = await sb.from('events').delete().eq('id', eventId);
  return { error };
}

// ── EVENT REGISTRATIONS ───────────────────────────────────────

async function adminRegisterTeam(eventId, teamId) {
  const { data, error } = await sb
    .from('event_registrations')
    .insert({ event_id: eventId, team_id: teamId })
    .select()
    .single();
  return { data, error };
}

async function adminUpdatePoints(eventId, teamId, points, placement) {
  const { data, error } = await sb
    .from('event_registrations')
    .update({ points, placement })
    .eq('event_id', eventId)
    .eq('team_id', teamId)
    .select()
    .single();
  return { data, error };
}

async function adminRemoveTeamFromEvent(eventId, teamId) {
  const { error } = await sb
    .from('event_registrations')
    .delete()
    .eq('event_id', eventId)
    .eq('team_id', teamId);
  return { error };
}

// ── ACHIEVEMENTS ──────────────────────────────────────────────

async function getAllAchievements() {
  const { data, error } = await sb
    .from('achievements')
    .select('*')
    .order('created_at', { ascending: false });
  return { data, error };
}

async function adminCreateAchievement({ name, description, levels, imageFile }) {
  const user = await getUser();

  // Insert achievement first
  const { data: ach, error } = await sb
    .from('achievements')
    .insert({ name, description, levels, created_by: user.id })
    .select()
    .single();
  if (error) return { data: null, error };

  // Upload image if provided
  if (imageFile) {
    const ext = imageFile.name.split('.').pop();
    const path = `${ach.id}/badge.${ext}`;
    const { error: upErr } = await sb.storage.from('achievements').upload(path, imageFile, { upsert: true });
    if (!upErr) {
      const { data: urlData } = sb.storage.from('achievements').getPublicUrl(path);
      await sb.from('achievements').update({ image_url: urlData.publicUrl }).eq('id', ach.id);
      ach.image_url = urlData.publicUrl;
    }
  }

  return { data: ach, error: null };
}

async function adminUpdateAchievement(achievementId, fields, imageFile) {
  if (imageFile) {
    const ext = imageFile.name.split('.').pop();
    const path = `${achievementId}/badge.${ext}`;
    const { error: upErr } = await sb.storage.from('achievements').upload(path, imageFile, { upsert: true });
    if (!upErr) {
      const { data: urlData } = sb.storage.from('achievements').getPublicUrl(path);
      fields.image_url = urlData.publicUrl;
    }
  }
  const { data, error } = await sb.from('achievements').update(fields).eq('id', achievementId).select().single();
  return { data, error };
}

async function adminDeleteAchievement(achievementId) {
  const { error } = await sb.from('achievements').delete().eq('id', achievementId);
  return { error };
}

// ── TEAM ACHIEVEMENT ASSIGNMENT ───────────────────────────────

async function adminAssignAchievement(teamId, achievementId) {
  const user = await getUser();
  const { data, error } = await sb
    .from('team_achievements')
    .insert({ team_id: teamId, achievement_id: achievementId, assigned_by: user.id })
    .select()
    .single();
  return { data, error };
}

async function adminUpdateAchievementProgress(teamId, achievementId, progress, currentLevel) {
  const { data, error } = await sb
    .from('team_achievements')
    .update({ progress, current_level: currentLevel, updated_at: new Date().toISOString() })
    .eq('team_id', teamId)
    .eq('achievement_id', achievementId)
    .select()
    .single();
  return { data, error };
}

async function adminRemoveAchievement(teamId, achievementId) {
  const { error } = await sb
    .from('team_achievements')
    .delete()
    .eq('team_id', teamId)
    .eq('achievement_id', achievementId);
  return { error };
}

// ── ACHIEVEMENT PROGRESS HELPER ───────────────────────────────
// Given a team_achievement row and its achievement definition,
// returns { level, color, progressPct, nextThreshold, currentThreshold }

function calcAchievementProgress(teamAch, achievement) {
  const levels = achievement.levels || [];
  if (!levels.length) return null;

  const currentLevel = teamAch.current_level || 0;
  const progress = teamAch.progress || 0;

  // Current level info (0-indexed — level 0 means working toward level 1)
  const levelDef = levels[currentLevel] || levels[levels.length - 1];
  const prevThreshold = currentLevel > 0 ? (levels[currentLevel - 1]?.threshold || 0) : 0;
  const nextThreshold = levelDef.threshold;
  const rangeSize = nextThreshold - prevThreshold;
  const progressInRange = Math.max(0, progress - prevThreshold);
  const progressPct = Math.min(100, Math.round((progressInRange / rangeSize) * 100));

  return {
    level: currentLevel,
    levelDef,
    color: levelDef.color || '#888',
    progressPct,
    progress,
    nextThreshold,
    prevThreshold,
    levels,
    maxLevel: levels.length,
    isMaxed: currentLevel >= levels.length,
  };
}
