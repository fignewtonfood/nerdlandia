// ─────────────────────────────────────────────────────────────
//  Nerdlandia — Admin Logic
//  js/admin.js
// ─────────────────────────────────────────────────────────────

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
    .select('*')
    .order('created_at', { ascending: true });

  if (error || !data) return { data, error };

  const teamIds = [...new Set(data.filter(u => u.team_id).map(u => u.team_id))];
  if (teamIds.length) {
    const { data: teams } = await sb.from('teams').select('id, name').in('id', teamIds);
    const teamMap = Object.fromEntries((teams || []).map(t => [t.id, t]));
    data.forEach(u => { u.teams = u.team_id ? teamMap[u.team_id] : null; });
  }

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
  const { data: profile } = await sb.from('profiles').select('role').eq('id', userId).single();
  const newRole = profile?.role === 'team_lead' ? 'team_lead' : 'individual';
  return adminUpdateUser(userId, { role: newRole });
}

// ── TEAMS ─────────────────────────────────────────────────────
async function getAllTeams() {
  const { data, error } = await sb
    .from('teams')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !data) return { data, error };

  const teamIds = data.map(t => t.id);
  if (teamIds.length) {
    const { data: profiles } = await sb
      .from('profiles')
      .select('id, username, email, role, photo_url, team_id')
      .in('team_id', teamIds);
    const memberMap = {};
    (profiles || []).forEach(p => {
      if (!memberMap[p.team_id]) memberMap[p.team_id] = [];
      memberMap[p.team_id].push(p);
    });
    data.forEach(t => { t.profiles = memberMap[t.id] || []; });
  }

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
  await sb.from('profiles').update({ team_id: null, role: 'individual' }).eq('team_id', teamId);
  const { error } = await sb.from('teams').delete().eq('id', teamId);
  return { error };
}

// ── EVENT TYPES ───────────────────────────────────────────────
async function getEventTypes() {
  const { data, error } = await sb
    .from('event_types')
    .select('*')
    .order('is_default', { ascending: false })
    .order('name');
  return { data, error };
}

async function adminCreateEventType(name) {
  const { data, error } = await sb
    .from('event_types')
    .insert({ name: name.trim() })
    .select()
    .single();
  return { data, error };
}

// ── EVENTS ───────────────────────────────────────────────────
async function getAllEvents() {
  const { data, error } = await sb
    .from('events')
    .select(`
      *,
      event_types(id, name),
      event_registrations(id, team_id, points, placement, teams(name))
    `)
    .order('start_date', { ascending: false });
  return { data, error };
}

async function adminCreateEvent(fields) {
  const user = await getUser();
  const { data, error } = await sb
    .from('events')
    .insert({ ...fields, created_by: user.id })
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
  const user = await getUser();
  const { data, error } = await sb
    .from('event_registrations')
    .insert({ event_id: eventId, team_id: teamId, registered_by: user.id })
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
  const { data: ach, error } = await sb
    .from('achievements')
    .insert({ name, description, levels, created_by: user.id })
    .select()
    .single();
  if (error) return { data: null, error };

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

// ── EVENT STATUS HELPER (client-side) ─────────────────────────
function deriveEventStatus(startDate, endDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(startDate);
  const end   = new Date(endDate);
  if (today < start) return 'upcoming';
  if (today > end)   return 'completed';
  return 'active';
}

// ── ADMIN: CREATE USER ────────────────────────────────────────

// Send a Supabase magic link / invite email
async function adminInviteUser(email) {
  const { data, error } = await sb.auth.admin?.inviteUserByEmail
    ? await sb.auth.admin.inviteUserByEmail(email)
    : await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  return { data, error };
}

// Create a profile-only record (no auth account)
async function adminCreateProfileOnly({ email, username, full_name, role }) {
  // Insert directly into profiles — no auth user, so we generate a placeholder UUID
  // This profile won't be able to log in until they register with matching email
  const { data, error } = await sb
    .from('profiles')
    .insert({ 
      id: crypto.randomUUID(),
      email, 
      username: username || null,
      full_name: full_name || null,
      role: role || 'individual'
    })
    .select()
    .single();
  return { data, error };
}

// ── ADMIN: CREATE TEAM ────────────────────────────────────────
async function adminCreateTeam({ name, description, leadId }) {
  const user = await getUser();

  // Validate name
  const nameCheck = await validateTeamName(name);
  if (!nameCheck.valid) return { error: { message: nameCheck.error } };

  const taken = await isTeamNameTaken(name);
  if (taken) return { error: { message: 'That team name is already taken.' } };

  // Insert team
  const { data: team, error: teamErr } = await sb
    .from('teams')
    .insert({ 
      name: name.trim(), 
      description: description || null,
      lead_id: leadId || null
    })
    .select()
    .single();
  if (teamErr) return { error: teamErr };

  // If a lead was chosen, update their profile
  if (leadId) {
    await sb.from('profiles')
      .update({ team_id: team.id, role: 'team_lead' })
      .eq('id', leadId);
  }

  return { team, error: null };
}

// ── ADMIN: MEMBER MANAGEMENT ──────────────────────────────────

async function adminAddMemberToTeam(userId, teamId) {
  // Check team isn't full
  const { count } = await sb
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', teamId);
  if (count >= 4) return { error: { message: 'Team is full (max 4 members).' } };

  const { error } = await sb
    .from('profiles')
    .update({ team_id: teamId })
    .eq('id', userId);
  return { error };
}

async function adminRemoveMemberFromTeam(userId, teamId) {
  const { data: profile } = await sb.from('profiles').select('role').eq('id', userId).single();
  const newRole = profile?.role === 'admin' ? 'admin' : 'individual';
  const { error } = await sb
    .from('profiles')
    .update({ team_id: null, role: newRole })
    .eq('id', userId);
  return { error };
}

async function adminChangeTeamLead(newLeadId, teamId) {
  // Demote current lead
  const { data: currentLead } = await sb
    .from('profiles')
    .select('id, role')
    .eq('team_id', teamId)
    .eq('role', 'team_lead')
    .maybeSingle();
  
  if (currentLead && currentLead.id !== newLeadId) {
    await sb.from('profiles')
      .update({ role: 'individual' })
      .eq('id', currentLead.id);
  }

  // Promote new lead
  await sb.from('profiles')
    .update({ role: 'team_lead', team_id: teamId })
    .eq('id', newLeadId);

  // Update teams table
  await sb.from('teams')
    .update({ lead_id: newLeadId })
    .eq('id', teamId);

  return { error: null };
}

async function adminMoveMember(userId, fromTeamId, toTeamId) {
  // Check destination team isn't full
  const { count } = await sb
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', toTeamId);
  if (count >= 4) return { error: { message: 'Destination team is full (max 4 members).' } };

  // If moving the team lead, trigger auto-promotion on source team first
  const { data: profile } = await sb.from('profiles').select('role').eq('id', userId).single();
  if (profile?.role === 'team_lead') {
    // Promote oldest remaining member on source team
    const { data: nextLead } = await sb
      .from('profiles')
      .select('id')
      .eq('team_id', fromTeamId)
      .neq('id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (nextLead) {
      await sb.from('profiles').update({ role: 'team_lead' }).eq('id', nextLead.id);
      await sb.from('teams').update({ lead_id: nextLead.id }).eq('id', fromTeamId);
    } else {
      await sb.from('teams').update({ lead_id: null }).eq('id', fromTeamId);
    }
  }

  // Move member
  const { error } = await sb
    .from('profiles')
    .update({ team_id: toTeamId, role: 'individual' })
    .eq('id', userId);
  return { error };
}
